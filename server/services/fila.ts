/**
 * A fila de trabalho pesado no Postgres (Fase F; as regras e o caminho de um
 * trabalho estão em `shared/fila.ts`). Aqui só o banco: enfileirar, tomar,
 * terminar, falhar, devolver o que ficou preso, e o lado do site que recebe a
 * saída. Quem executa é o trabalhador (`server/worker.ts`); quem recebe é o
 * relógio do site (`server/jobs/index.ts`).
 *
 * Toda troca de situação é um `UPDATE` condicional à situação lida (e, para o
 * trabalhador, ao nome de quem tomou): o trabalho devolvido por prazo e depois
 * terminado pelo processo lento não vira dois.
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { trabalhadores, trabalhoArquivos, trabalhos } from "@shared/schema";
import {
  GUARDA_DOS_TRABALHOS_DIAS,
  PRAZO_DO_TRABALHO_MS,
  SAIDA_DO_TRABALHO_MAX_BYTES,
  TENTATIVAS_DO_TRABALHO,
  erroParaATela,
  esperaDaTentativa,
  tentaDeNovo,
  trabalhadorNoAr,
} from "@shared/fila";
import { db } from "../db";

type Executor = Pick<typeof db, "insert" | "select" | "update" | "delete" | "execute">;

export interface ArquivoDoTrabalho {
  nome: string;
  bytes: Buffer;
}

export interface NovoTrabalho {
  tipo: string;
  chave: string;
  dados?: Record<string, unknown>;
  campaignId?: string | null;
  pedidoPor?: string | null;
  entradas?: ArquivoDoTrabalho[];
}

/**
 * Põe o trabalho na fila, na transação de quem chama. Devolve o `id`, ou
 * `null` se já há um trabalho com a mesma chave em aberto — quem decide é o
 * índice `uq_trabalho_aberto`, nunca um `SELECT` antes.
 */
export async function enfileirar(tx: Executor, t: NovoTrabalho): Promise<string | null> {
  const [linha] = await tx
    .insert(trabalhos)
    .values({
      tipo: t.tipo,
      chave: t.chave,
      dados: t.dados ?? {},
      campaignId: t.campaignId ?? null,
      pedidoPor: t.pedidoPor ?? null,
    })
    .onConflictDoNothing({
      target: trabalhos.chave,
      where: sql`situacao in ('pendente', 'executando', 'pronto', 'recebendo')`,
    })
    .returning({ id: trabalhos.id });
  if (!linha) return null;
  if (t.entradas?.length) {
    await tx.insert(trabalhoArquivos).values(t.entradas.map((a) => ({ trabalhoId: linha.id, papel: "entrada", nome: a.nome, bytes: a.bytes })));
  }
  return linha.id;
}

export interface TrabalhoTomado {
  id: string;
  tipo: string;
  dados: Record<string, unknown>;
  campaignId: string | null;
  tentativas: number;
}

/**
 * O trabalhador toma o próximo pendente dos tipos que sabe fazer. Dois
 * trabalhadores ao mesmo tempo nunca pegam o mesmo (`SKIP LOCKED`).
 */
export async function tomarTrabalho(tipos: readonly string[], quem: string): Promise<TrabalhoTomado | null> {
  if (!tipos.length) return null;
  const { rows } = await db.execute(sql`
    update trabalhos
       set situacao = 'executando', tentativas = tentativas + 1, tomado_em = now(), tomado_por = ${quem}
     where id = (
       select id from trabalhos
        where situacao = 'pendente' and disponivel_em <= now()
          and tipo in (${sql.join(tipos.map((t) => sql`${t}`), sql`, `)})
        order by disponivel_em, criado_em
        for update skip locked
        limit 1)
    returning id, tipo, dados, campaign_id, tentativas`);
  const r = rows[0] as { id: string; tipo: string; dados: Record<string, unknown> | null; campaign_id: string | null; tentativas: number } | undefined;
  return r ? { id: r.id, tipo: r.tipo, dados: r.dados ?? {}, campaignId: r.campaign_id, tentativas: r.tentativas } : null;
}

export async function arquivosDoTrabalho(id: string, papel: "entrada" | "saida", q: Executor = db): Promise<ArquivoDoTrabalho[]> {
  const linhas = await q
    .select({ nome: trabalhoArquivos.nome, bytes: trabalhoArquivos.bytes })
    .from(trabalhoArquivos)
    .where(and(eq(trabalhoArquivos.trabalhoId, id), eq(trabalhoArquivos.papel, papel)));
  return linhas.map((l) => ({ nome: l.nome, bytes: Buffer.from(l.bytes) }));
}

/**
 * O trabalhador terminou: grava a saída e passa a `pronto`, só se o trabalho
 * ainda é dele (`executando`, `tomado_por`). As entradas saem na mesma
 * transação. Devolve `false` se o trabalho não era mais dele (devolvido pelo
 * prazo, ou a rifa apagada no meio).
 */
export async function terminarTrabalho(id: string, quem: string, saidas: ArquivoDoTrabalho[], resultado: Record<string, unknown> = {}): Promise<boolean> {
  const total = saidas.reduce((s, a) => s + a.bytes.length, 0);
  if (total > SAIDA_DO_TRABALHO_MAX_BYTES) throw new Error(`A saída passou de ${SAIDA_DO_TRABALHO_MAX_BYTES / 1024 / 1024} MB.`);
  return db.transaction(async (tx) => {
    const [linha] = await tx
      .update(trabalhos)
      .set({ situacao: "pronto", resultado, erro: null, terminadoEm: new Date() })
      .where(and(eq(trabalhos.id, id), eq(trabalhos.situacao, "executando"), eq(trabalhos.tomadoPor, quem)))
      .returning({ id: trabalhos.id });
    if (!linha) return false;
    await tx.delete(trabalhoArquivos).where(and(eq(trabalhoArquivos.trabalhoId, id), eq(trabalhoArquivos.papel, "entrada")));
    if (saidas.length) {
      await tx.insert(trabalhoArquivos).values(saidas.map((a) => ({ trabalhoId: id, papel: "saida", nome: a.nome, bytes: a.bytes })));
    }
    return true;
  });
}

/**
 * O trabalhador falhou. Com tentativa sobrando (e sem ser `definitivo`), volta
 * para a fila depois da espera (`esperaDaTentativa`); senão, `falhou`, com o
 * motivo, e os arquivos saem.
 */
export async function falharTrabalho(id: string, quem: string, erro: unknown, definitivo = false): Promise<"de_novo" | "falhou" | null> {
  const motivo = erroParaATela(erro);
  return db.transaction(async (tx) => {
    const [t] = await tx
      .select({ tentativas: trabalhos.tentativas })
      .from(trabalhos)
      .where(and(eq(trabalhos.id, id), eq(trabalhos.situacao, "executando"), eq(trabalhos.tomadoPor, quem)))
      .for("update");
    if (!t) return null;
    if (!definitivo && tentaDeNovo(t.tentativas)) {
      await tx
        .update(trabalhos)
        .set({ situacao: "pendente", erro: motivo, tomadoPor: null, disponivelEm: new Date(Date.now() + esperaDaTentativa(t.tentativas)) })
        .where(eq(trabalhos.id, id));
      return "de_novo";
    }
    await tx.update(trabalhos).set({ situacao: "falhou", erro: motivo, terminadoEm: new Date() }).where(eq(trabalhos.id, id));
    await tx.delete(trabalhoArquivos).where(eq(trabalhoArquivos.trabalhoId, id));
    return "falhou";
  });
}

/**
 * Trabalho `executando` há mais que o prazo: o processo caiu no meio. Volta
 * para a fila (ou falha, sem tentativa sobrando). E o `recebendo` preso (o
 * site caiu no meio do recebimento) volta a `pronto`. Roda no trabalhador e no
 * relógio do site; o `UPDATE` condicional deixa as duas voltas seguras.
 */
export async function devolverPresos(agora = Date.now()): Promise<{ devolvidos: number; falhos: number; recebendo: number }> {
  const limite = new Date(agora - PRAZO_DO_TRABALHO_MS);
  const devolvidos = await db
    .update(trabalhos)
    .set({ situacao: "pendente", tomadoPor: null, erro: "O trabalho passou do prazo e voltou para a fila." })
    .where(and(eq(trabalhos.situacao, "executando"), lt(trabalhos.tomadoEm, limite), lt(trabalhos.tentativas, TENTATIVAS_DO_TRABALHO)))
    .returning({ id: trabalhos.id });
  const falhos = await db
    .update(trabalhos)
    .set({ situacao: "falhou", erro: "O trabalho passou do prazo em todas as tentativas.", terminadoEm: new Date(agora) })
    .where(and(eq(trabalhos.situacao, "executando"), lt(trabalhos.tomadoEm, limite)))
    .returning({ id: trabalhos.id });
  if (falhos.length) {
    await db.delete(trabalhoArquivos).where(inArray(trabalhoArquivos.trabalhoId, falhos.map((f) => f.id)));
  }
  const recebendo = await db
    .update(trabalhos)
    .set({ situacao: "pronto" })
    .where(and(eq(trabalhos.situacao, "recebendo"), lt(trabalhos.tomadoEm, limite)))
    .returning({ id: trabalhos.id });
  return { devolvidos: devolvidos.length, falhos: falhos.length, recebendo: recebendo.length };
}

// ------------------------------------------------------------ lado do site

/** O site pega um trabalho `pronto` do tipo para receber (`recebendo`). Um de cada vez, sem dois relógios no mesmo. */
export async function tomarPronto(tipo: string): Promise<TrabalhoTomado | null> {
  const { rows } = await db.execute(sql`
    update trabalhos set situacao = 'recebendo', tomado_em = now()
     where id = (
       select id from trabalhos where situacao = 'pronto' and tipo = ${tipo}
        order by terminado_em nulls first, criado_em
        for update skip locked limit 1)
    returning id, tipo, dados, campaign_id, tentativas`);
  const r = rows[0] as { id: string; tipo: string; dados: Record<string, unknown> | null; campaign_id: string | null; tentativas: number } | undefined;
  return r ? { id: r.id, tipo: r.tipo, dados: r.dados ?? {}, campaignId: r.campaign_id, tentativas: r.tentativas } : null;
}

/** Recebido: `concluido`, com o resultado, e a saída sai do banco. */
export async function concluirTrabalho(id: string, resultado: Record<string, unknown>): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [linha] = await tx
      .update(trabalhos)
      .set({ situacao: "concluido", resultado, erro: null, terminadoEm: new Date() })
      .where(and(eq(trabalhos.id, id), eq(trabalhos.situacao, "recebendo")))
      .returning({ id: trabalhos.id });
    if (!linha) return false;
    await tx.delete(trabalhoArquivos).where(eq(trabalhoArquivos.trabalhoId, id));
    return true;
  });
}

/**
 * O site não conseguiu receber (a régua recusou, ou o armazenamento falhou):
 * `falhou`, com o motivo para a tela, e a saída sai do banco. Quem pediu
 * pede de novo — receber de novo a cada volta do relógio só repetiria o erro.
 */
export async function naoRecebido(id: string, erro: unknown): Promise<void> {
  await db.transaction(async (tx) => {
    const [linha] = await tx
      .update(trabalhos)
      .set({ situacao: "falhou", erro: erroParaATela(erro), terminadoEm: new Date() })
      .where(and(eq(trabalhos.id, id), eq(trabalhos.situacao, "recebendo")))
      .returning({ id: trabalhos.id });
    if (linha) await tx.delete(trabalhoArquivos).where(eq(trabalhoArquivos.trabalhoId, id));
  });
}

// ------------------------------------------------------------ trabalhador no ar

/** O trabalhador avisa que está no ar (e quais tipos sabe fazer). */
export async function avisarNoAr(nome: string, tipos: readonly string[]): Promise<void> {
  await db
    .insert(trabalhadores)
    .values({ nome, vistoEm: new Date(), tipos: [...tipos] })
    .onConflictDoUpdate({ target: trabalhadores.nome, set: { vistoEm: new Date(), tipos: [...tipos] } });
}

/** Algum trabalhador que sabe fazer `tipo` deu sinal há pouco? */
export async function haTrabalhadorNoAr(tipo: string, agora = Date.now()): Promise<boolean> {
  const linhas = await db
    .select({ vistoEm: trabalhadores.vistoEm })
    .from(trabalhadores)
    .where(sql`${tipo} = any(${trabalhadores.tipos})`);
  return linhas.some((l) => trabalhadorNoAr(l.vistoEm, agora));
}

/** Trabalho terminado há mais de `GUARDA_DOS_TRABALHOS_DIAS` sai (os arquivos vão pela cascata), e trabalhador sumido há um dia também. */
export async function limparTrabalhosAntigos(agora = Date.now()): Promise<number> {
  const limite = new Date(agora - GUARDA_DOS_TRABALHOS_DIAS * 86_400_000);
  const apagados = await db
    .delete(trabalhos)
    .where(and(inArray(trabalhos.situacao, ["concluido", "falhou"]), lt(trabalhos.terminadoEm, limite)))
    .returning({ id: trabalhos.id });
  await db.delete(trabalhadores).where(lt(trabalhadores.vistoEm, new Date(agora - 86_400_000)));
  return apagados.length;
}
