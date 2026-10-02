/**
 * Grupos da rifa: conversa de até 50 apostadores com compra paga na mesma
 * rifa. Regras em `shared/grupos.ts`.
 *
 * - **Entrar é a chave (grupo, pessoa)**: `INSERT … ON CONFLICT DO NOTHING` e
 *   o contador só anda, com teto, quando a linha entrou — na mesma transação,
 *   com o grupo travado (`FOR UPDATE`). Nunca um `SELECT` de vagas antes.
 * - **Só apostador com conta e apelido, e com compra paga na rifa.** A compra
 *   é conferida de novo ao escrever: estornou, lê mas não escreve.
 * - **Sem aviso no celular**: um grupo de 50 viraria 50 pushes por mensagem.
 *   O número de não lidas anda no contador do console.
 * - **A plataforma só lê o trecho da denúncia** (leitura auditada antes, na rota).
 */
import { randomInt } from "node:crypto";
import type { Request } from "express";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { buyers, campaigns, grupoDenuncias, grupoMembros, grupoMensagens, grupos, organizations } from "@shared/schema";
import {
  GRUPOS_NOVOS_POR_DIA,
  GRUPO_ENTRADAS_POR_DIA,
  GRUPO_JANELA_MIN,
  GRUPO_MAX_MEMBROS,
  GRUPO_MENSAGENS_POR_JANELA,
  GRUPO_TRECHO_DA_DENUNCIA,
  MOTIVOS_DA_DENUNCIA_DE_GRUPO,
  PAGINA_DE_GRUPOS,
  PAGINA_DE_MENSAGENS_DO_GRUPO,
  motivoDoGrupoValido,
  problemaNoNomeDoGrupo,
  problemaParaEscreverNoGrupo,
} from "@shared/grupos";
import { decisaoValida, limparMensagem, previaDoTexto, problemaNaMensagem } from "@shared/mensagens";
import { DENUNCIAS_POR_DIA, DENUNCIA_TEXTO_MAX } from "@shared/seguranca";
import { cortarPagina, lerCursor, limiteDaPagina } from "@shared/paginacao";
import { isUniqueViolation } from "../pgError";
import { hit } from "./antifraude";
import { MensagemError, exigirMensagensLigadas, minhaIdentidade } from "./mensagens";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const protocolo = () => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).replace(/-/g, "");
  return `GR-${d}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
};

/** Só o apostador (conta com apelido) participa de grupo: organização e afiliado, 403. */
async function apostador(req: Request) {
  await exigirMensagensLigadas();
  const eu = await minhaIdentidade(req, "comprador");
  if (eu.tipo !== "comprador") throw new MensagemError("Grupos são só para apostadores.", 403);
  return eu.id;
}

const compraPagaSql = (buyerId: string, campaignId: unknown) =>
  sql<boolean>`exists (select 1 from orders o where o.buyer_id = ${buyerId} and o.campaign_id = ${campaignId} and o.status = 'paid')`;

/** A rifa que aceita grupo: publicada, de verdade, não travada, de organização no ar. */
async function rifaDoGrupo(slug: unknown) {
  if (typeof slug !== "string" || !slug) throw new MensagemError("Rifa não encontrada.", 404);
  const [r] = await db
    .select({ id: campaigns.id, slug: campaigns.slug, title: campaigns.title })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(
      and(
        eq(campaigns.slug, slug),
        eq(campaigns.status, "published"),
        eq(campaigns.demonstracao, false),
        isNull(campaigns.travadaEm),
        eq(organizations.active, true),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    );
  if (!r) throw new MensagemError("Rifa não encontrada.", 404);
  return r;
}

/* ------------------------------------------------------------------ *
 * Criar, entrar, sair
 * ------------------------------------------------------------------ */

export async function criarGrupo(req: Request, entrada: { rifa?: unknown; nome?: unknown }) {
  const eu = await apostador(req);
  const problema = problemaNoNomeDoGrupo(entrada.nome);
  if (problema) throw new MensagemError(problema, 400);
  const rifa = await rifaDoGrupo(entrada.rifa);
  // A tentativa conta antes de gravar, mas só depois do erro de preenchimento.
  if ((await hit(`grupo-novo:${eu}`, 24 * 60, GRUPOS_NOVOS_POR_DIA)).excedeu) {
    throw new MensagemError("Você criou grupos demais hoje. Tente amanhã.", 429);
  }
  try {
    return await db.transaction(async (tx) => {
      // A compra é conferida na mesma transação que grava o grupo.
      const [{ paga }] = (await tx.execute(sql`select ${compraPagaSql(eu, rifa.id)} as paga`)).rows as { paga: boolean }[];
      if (!paga) throw new MensagemError("Só quem tem compra paga nesta rifa cria um grupo dela.", 403);
      const [g] = await tx
        .insert(grupos)
        .values({ campaignId: rifa.id, criadorId: eu, nome: String(entrada.nome).trim(), membrosCount: 1 })
        .returning({ id: grupos.id });
      await tx.insert(grupoMembros).values({ grupoId: g.id, buyerId: eu });
      return { id: g.id };
    });
  } catch (err) {
    if (isUniqueViolation(err, "uq_grupo_por_criador_e_rifa")) throw new MensagemError("Você já tem um grupo aberto desta rifa.", 409);
    throw err;
  }
}

export async function entrarNoGrupo(req: Request, id: string) {
  const eu = await apostador(req);
  if (!UUID.test(id)) throw new MensagemError("Grupo não encontrado.", 404);
  if ((await hit(`grupo-entrada:${eu}`, 24 * 60, GRUPO_ENTRADAS_POR_DIA)).excedeu) {
    throw new MensagemError("Muitas entradas hoje. Tente amanhã.", 429);
  }
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`
      select g.id, g.campaign_id, g.encerrada_em from grupos g
        join campaigns c on c.id = g.campaign_id
        join organizations o on o.id = c.organization_id
       where g.id = ${id} and c.status = 'published' and c.demonstracao = false and c.travada_em is null
         and o.active = true and o.archived_at is null and o.banida_em is null
       for update of g`);
    const g = r.rows[0] as { id: string; campaign_id: string; encerrada_em: string | null } | undefined;
    if (!g) throw new MensagemError("Grupo não encontrado.", 404);
    if (g.encerrada_em) throw new MensagemError("Este grupo foi encerrado.", 409);
    const [{ paga }] = (await tx.execute(sql`select ${compraPagaSql(eu, g.campaign_id)} as paga`)).rows as { paga: boolean }[];
    if (!paga) throw new MensagemError("Só quem tem compra paga nesta rifa entra no grupo dela.", 403);
    const entrou = await tx.insert(grupoMembros).values({ grupoId: id, buyerId: eu }).onConflictDoNothing().returning({ b: grupoMembros.buyerId });
    if (entrou.length === 0) return { id, jaEstava: true };
    // O teto é do `UPDATE`: sem vaga, nada volta e a entrada cai junto.
    const contado = await tx
      .update(grupos)
      .set({ membrosCount: sql`${grupos.membrosCount} + 1` })
      .where(and(eq(grupos.id, id), sql`${grupos.membrosCount} < ${GRUPO_MAX_MEMBROS}`))
      .returning({ n: grupos.membrosCount });
    if (contado.length === 0) throw new MensagemError("Este grupo está cheio.", 409);
    return { id, jaEstava: false };
  });
}

export async function sairDoGrupo(req: Request, id: string) {
  const eu = await apostador(req);
  if (!UUID.test(id)) throw new MensagemError("Grupo não encontrado.", 404);
  await db.transaction(async (tx) => {
    // Trava o grupo como entrar e escrever: o contador não se cruza com outra entrada.
    await tx.execute(sql`select 1 from grupos where id = ${id} for update`);
    const saiu = await tx.delete(grupoMembros).where(and(eq(grupoMembros.grupoId, id), eq(grupoMembros.buyerId, eu))).returning({ b: grupoMembros.buyerId });
    if (saiu.length === 0) throw new MensagemError("Grupo não encontrado.", 404);
    // Sem ninguém, o grupo fecha: vazio, ele travaria o criador (um aberto por rifa) e ocuparia a lista.
    await tx
      .update(grupos)
      .set({ membrosCount: sql`greatest(${grupos.membrosCount} - 1, 0)`, encerradaEm: sql`case when ${grupos.membrosCount} <= 1 then now() else ${grupos.encerradaEm} end` })
      .where(eq(grupos.id, id));
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Listar
 * ------------------------------------------------------------------ */

/** Os meus grupos, do mais movimentado ao mais parado. Por chave, sem `OFFSET`. */
export async function meusGrupos(req: Request, q: { depois?: unknown; limite?: unknown }) {
  const eu = await apostador(req);
  const limite = limiteDaPagina(q.limite, PAGINA_DE_GRUPOS);
  const cursor = lerCursor(q.depois);
  const filtros = [eq(grupoMembros.buyerId, eu)];
  if (cursor) filtros.push(or(lt(grupos.ultimaEm, cursor.criadoEm), and(eq(grupos.ultimaEm, cursor.criadoEm), lt(grupos.id, cursor.id)))!);
  const linhas = await db
    .select({
      id: grupos.id,
      nome: grupos.nome,
      previa: grupos.previa,
      ultimaEm: grupos.ultimaEm,
      membros: grupos.membrosCount,
      encerrado: grupos.encerradaEm,
      naoLidas: grupoMembros.naoLidas,
      rifa: campaigns.title,
      slug: campaigns.slug,
    })
    .from(grupoMembros)
    .innerJoin(grupos, eq(grupos.id, grupoMembros.grupoId))
    .innerJoin(campaigns, eq(campaigns.id, grupos.campaignId))
    .where(and(...filtros))
    .orderBy(desc(grupos.ultimaEm), desc(grupos.id))
    .limit(limite + 1);
  const { itens, proximo } = cortarPagina(linhas.map((g) => ({ ...g, criadoEm: g.ultimaEm })), limite);
  return {
    itens: itens.map((g) => ({
      id: g.id,
      nome: g.nome,
      rifa: g.rifa,
      slug: g.slug,
      previa: g.previa,
      ultimaEm: g.ultimaEm.toISOString(),
      membros: g.membros,
      encerrado: Boolean(g.encerrado),
      naoLidas: g.naoLidas,
    })),
    proximo,
  };
}

/** Os grupos abertos de uma rifa, para quem quer entrar: só nome e quantos são. */
export async function gruposDaRifa(req: Request, slug: string, q: { depois?: unknown; limite?: unknown }) {
  const eu = await apostador(req);
  const rifa = await rifaDoGrupo(slug);
  const limite = limiteDaPagina(q.limite, PAGINA_DE_GRUPOS);
  const cursor = lerCursor(q.depois);
  const filtros = [eq(grupos.campaignId, rifa.id), isNull(grupos.encerradaEm)];
  if (cursor) filtros.push(or(lt(grupos.createdAt, cursor.criadoEm), and(eq(grupos.createdAt, cursor.criadoEm), lt(grupos.id, cursor.id)))!);
  const linhas = await db
    .select({
      id: grupos.id,
      nome: grupos.nome,
      membros: grupos.membrosCount,
      createdAt: grupos.createdAt,
      souMembro: sql<boolean>`exists (select 1 from grupo_membros m where m.grupo_id = ${grupos.id} and m.buyer_id = ${eu})`,
    })
    .from(grupos)
    .where(and(...filtros))
    .orderBy(desc(grupos.createdAt), desc(grupos.id))
    .limit(limite + 1);
  const { itens, proximo } = cortarPagina(linhas.map((g) => ({ ...g, criadoEm: g.createdAt })), limite);
  const [{ paga }] = (await db.execute(sql`select ${compraPagaSql(eu, rifa.id)} as paga`)).rows as { paga: boolean }[];
  return {
    // Quem não comprou ainda vê os grupos existentes e o motivo de não entrar.
    podeParticipar: paga,
    itens: itens.map((g) => ({ id: g.id, nome: g.nome, membros: g.membros, max: GRUPO_MAX_MEMBROS, cheio: g.membros >= GRUPO_MAX_MEMBROS, souMembro: g.souMembro })),
    proximo,
  };
}

/* ------------------------------------------------------------------ *
 * Ler e escrever
 * ------------------------------------------------------------------ */

async function meuGrupo(eu: string, id: string) {
  if (!UUID.test(id)) throw new MensagemError("Grupo não encontrado.", 404);
  const [g] = await db
    .select({
      id: grupos.id,
      nome: grupos.nome,
      membros: grupos.membrosCount,
      encerrada: grupos.encerradaEm,
      campaignId: grupos.campaignId,
      rifa: campaigns.title,
      slug: campaigns.slug,
    })
    .from(grupoMembros)
    .innerJoin(grupos, eq(grupos.id, grupoMembros.grupoId))
    .innerJoin(campaigns, eq(campaigns.id, grupos.campaignId))
    .where(and(eq(grupoMembros.grupoId, id), eq(grupoMembros.buyerId, eu)));
  // Grupo de que não sou membro é 404: nem a existência dele se confirma.
  if (!g) throw new MensagemError("Grupo não encontrado.", 404);
  return g;
}

export async function lerGrupo(req: Request, id: string, q: { antes?: unknown }) {
  const eu = await apostador(req);
  const g = await meuGrupo(eu, id);
  const cursor = lerCursor(q.antes);
  const filtros = [eq(grupoMensagens.grupoId, g.id)];
  if (cursor) filtros.push(or(lt(grupoMensagens.createdAt, cursor.criadoEm), and(eq(grupoMensagens.createdAt, cursor.criadoEm), lt(grupoMensagens.id, cursor.id)))!);
  const limite = PAGINA_DE_MENSAGENS_DO_GRUPO;
  const linhas = await db
    .select({ id: grupoMensagens.id, buyerId: grupoMensagens.buyerId, texto: grupoMensagens.texto, createdAt: grupoMensagens.createdAt, apelido: buyers.apelido, excluido: buyers.excluidoEm })
    .from(grupoMensagens)
    .innerJoin(buyers, eq(buyers.id, grupoMensagens.buyerId))
    .where(and(...filtros))
    .orderBy(desc(grupoMensagens.createdAt), desc(grupoMensagens.id))
    .limit(limite + 1);
  const { itens, proximo } = cortarPagina(linhas.map((m) => ({ ...m, criadoEm: m.createdAt })), limite);
  const membros = await db
    .select({ apelido: buyers.apelido, buyerId: buyers.id })
    .from(grupoMembros)
    .innerJoin(buyers, eq(buyers.id, grupoMembros.buyerId))
    .where(eq(grupoMembros.grupoId, g.id))
    .limit(GRUPO_MAX_MEMBROS);
  const [{ paga }] = (await db.execute(sql`select ${compraPagaSql(eu, g.campaignId)} as paga`)).rows as { paga: boolean }[];
  const impedimento = problemaParaEscreverNoGrupo({ encerrado: Boolean(g.encerrada), souMembro: true, compraPaga: paga });
  return {
    grupo: { id: g.id, nome: g.nome, rifa: g.rifa, slug: g.slug, membros: g.membros, max: GRUPO_MAX_MEMBROS, encerrado: Boolean(g.encerrada), podeEscrever: !impedimento, impedimento },
    // Só apelido: nunca nome real, telefone ou id de pessoa.
    pessoas: membros.map((m) => ({ apelido: m.apelido ?? "conta removida", eu: m.buyerId === eu })),
    itens: itens.map((m) => ({ id: m.id, minha: m.buyerId === eu, de: m.excluido || !m.apelido ? "conta removida" : m.apelido, texto: m.texto, em: m.createdAt.toISOString() })),
    proximo,
  };
}

export async function escreverNoGrupo(req: Request, id: string, entrada: { texto?: unknown }) {
  const eu = await apostador(req);
  const problema = problemaNaMensagem(entrada.texto);
  if (problema) throw new MensagemError(problema, 400);
  const texto = limparMensagem(String(entrada.texto));
  if ((await hit(`grupo-msg:${eu}`, GRUPO_JANELA_MIN, GRUPO_MENSAGENS_POR_JANELA)).excedeu) {
    throw new MensagemError("Muitas mensagens seguidas. Espere um pouco.", 429);
  }
  return db.transaction(async (tx) => {
    // Trava o grupo: o encerramento da plataforma e esta mensagem não se cruzam.
    const r = await tx.execute(sql`
      select g.id, g.campaign_id, g.encerrada_em,
             (c.status = 'published' and c.travada_em is null and o.active = true and o.archived_at is null and o.banida_em is null) as rifa_no_ar
        from grupos g
        join grupo_membros m on m.grupo_id = g.id and m.buyer_id = ${eu}
        join campaigns c on c.id = g.campaign_id
        join organizations o on o.id = c.organization_id
       where g.id = ${UUID.test(id) ? id : "00000000-0000-0000-0000-000000000000"}
       for update of g`);
    const g = r.rows[0] as { id: string; campaign_id: string; encerrada_em: string | null; rifa_no_ar: boolean } | undefined;
    if (!g) throw new MensagemError("Grupo não encontrado.", 404);
    // Rifa travada ou promotora banida: o grupo dela fecha junto (o mesmo golpe, o mesmo corte).
    if (!g.rifa_no_ar) throw new MensagemError("Esta rifa não está mais no ar: o grupo dela está fechado para novas mensagens.", 409);
    const [{ paga }] = (await tx.execute(sql`select ${compraPagaSql(eu, g.campaign_id)} as paga`)).rows as { paga: boolean }[];
    const impedimento = problemaParaEscreverNoGrupo({ encerrado: Boolean(g.encerrada_em), souMembro: true, compraPaga: paga });
    if (impedimento) throw new MensagemError(impedimento, 409);
    const [m] = await tx.insert(grupoMensagens).values({ grupoId: id, buyerId: eu, texto }).returning({ id: grupoMensagens.id, em: grupoMensagens.createdAt });
    await tx.update(grupos).set({ previa: previaDoTexto(texto), ultimaEm: m.em }).where(eq(grupos.id, id));
    // Uma só instrução soma a não lida de todos os outros: sem laço por membro.
    await tx
      .update(grupoMembros)
      .set({ naoLidas: sql`${grupoMembros.naoLidas} + 1` })
      .where(and(eq(grupoMembros.grupoId, id), sql`${grupoMembros.buyerId} <> ${eu}`));
    return { id: m.id };
  });
}

export async function marcarGrupoLido(req: Request, id: string) {
  const eu = await apostador(req);
  await meuGrupo(eu, id);
  await db.update(grupoMembros).set({ naoLidas: 0 }).where(and(eq(grupoMembros.grupoId, id), eq(grupoMembros.buyerId, eu)));
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Denúncia e a plataforma
 * ------------------------------------------------------------------ */

async function trechoDoGrupo(grupoId: string) {
  const linhas = await db
    .select({ apelido: buyers.apelido, texto: grupoMensagens.texto, em: grupoMensagens.createdAt })
    .from(grupoMensagens)
    .innerJoin(buyers, eq(buyers.id, grupoMensagens.buyerId))
    .where(eq(grupoMensagens.grupoId, grupoId))
    .orderBy(desc(grupoMensagens.createdAt), desc(grupoMensagens.id))
    .limit(GRUPO_TRECHO_DA_DENUNCIA);
  return linhas.reverse().map((m) => ({ de: m.apelido ?? "conta removida", texto: m.texto, em: m.em.toISOString() }));
}

export async function denunciarGrupo(req: Request, id: string, entrada: { motivo?: unknown; texto?: unknown }) {
  const eu = await apostador(req);
  const g = await meuGrupo(eu, id);
  if (!motivoDoGrupoValido(entrada.motivo)) throw new MensagemError("Escolha o motivo da denúncia.", 400);
  const texto = typeof entrada.texto === "string" ? entrada.texto.trim().slice(0, DENUNCIA_TEXTO_MAX) : "";
  if ((await hit(`denuncia-grupo:${eu}`, 24 * 60, DENUNCIAS_POR_DIA)).excedeu) throw new MensagemError("Muitas denúncias hoje. Tente amanhã.", 429);
  try {
    const [d] = await db
      .insert(grupoDenuncias)
      .values({ protocolo: protocolo(), grupoId: g.id, buyerId: eu, motivo: entrada.motivo, texto: texto || null, trecho: await trechoDoGrupo(g.id) })
      .returning({ protocolo: grupoDenuncias.protocolo });
    return { protocolo: d.protocolo };
  } catch (err) {
    if (isUniqueViolation(err, "uq_grupo_denuncia_aberta")) throw new MensagemError("Você já denunciou este grupo. A plataforma vai analisar.", 409);
    throw err;
  }
}

export async function gruposDenunciadosAbertos() {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(grupoDenuncias).where(eq(grupoDenuncias.status, "aberta"));
  return r?.n ?? 0;
}

/** A fila: sem texto de mensagem — grupo, rifa, motivo e protocolo. */
export async function listarDenunciasDeGrupo(status?: string) {
  const linhas = await db
    .select({
      id: grupoDenuncias.id,
      protocolo: grupoDenuncias.protocolo,
      motivo: grupoDenuncias.motivo,
      status: grupoDenuncias.status,
      createdAt: grupoDenuncias.createdAt,
      grupo: grupos.nome,
      rifa: campaigns.title,
    })
    .from(grupoDenuncias)
    .innerJoin(grupos, eq(grupos.id, grupoDenuncias.grupoId))
    .innerJoin(campaigns, eq(campaigns.id, grupos.campaignId))
    .where(status ? eq(grupoDenuncias.status, status) : undefined)
    .orderBy(desc(grupoDenuncias.createdAt))
    .limit(100);
  return linhas.map((d) => ({
    id: d.id,
    protocolo: d.protocolo,
    motivo: d.motivo,
    motivoTexto: MOTIVOS_DA_DENUNCIA_DE_GRUPO[d.motivo as keyof typeof MOTIVOS_DA_DENUNCIA_DE_GRUPO] ?? d.motivo,
    status: d.status,
    criadaEm: d.createdAt.toISOString(),
    grupo: d.grupo,
    rifa: d.rifa,
  }));
}

/** O detalhe com o trecho. A rota grava a auditoria antes de chamar. */
export async function detalheDaDenunciaDeGrupo(id: string) {
  if (!UUID.test(id)) throw new MensagemError("Denúncia não encontrada.", 404);
  const [d] = await db
    .select({ d: grupoDenuncias, grupo: grupos.nome, encerrada: grupos.encerradaEm, rifa: campaigns.title, denunciou: buyers.apelido })
    .from(grupoDenuncias)
    .innerJoin(grupos, eq(grupos.id, grupoDenuncias.grupoId))
    .innerJoin(campaigns, eq(campaigns.id, grupos.campaignId))
    .innerJoin(buyers, eq(buyers.id, grupoDenuncias.buyerId))
    .where(eq(grupoDenuncias.id, id));
  if (!d) throw new MensagemError("Denúncia não encontrada.", 404);
  return {
    id: d.d.id,
    protocolo: d.d.protocolo,
    motivoTexto: MOTIVOS_DA_DENUNCIA_DE_GRUPO[d.d.motivo as keyof typeof MOTIVOS_DA_DENUNCIA_DE_GRUPO] ?? d.d.motivo,
    denunciou: d.denunciou ?? "conta removida",
    texto: d.d.texto,
    status: d.d.status,
    decisao: d.d.decisao,
    criadaEm: d.d.createdAt.toISOString(),
    grupo: d.grupo,
    rifa: d.rifa,
    encerrado: Boolean(d.encerrada),
    trecho: d.d.trecho,
  };
}

/** Decidir é `UPDATE` condicional (`aberta`). Procedente encerra o grupo na mesma transação. */
export async function decidirDenunciaDeGrupo(req: Request, id: string, entrada: { decisao?: unknown; resposta?: unknown }) {
  if (!UUID.test(id)) throw new MensagemError("Denúncia não encontrada.", 404);
  if (!decisaoValida(entrada.decisao)) throw new MensagemError("Escolha: procedente ou improcedente.", 400);
  const resposta = typeof entrada.resposta === "string" ? entrada.resposta.trim().slice(0, 1000) : "";
  if (entrada.decisao === "procedente" && !resposta) throw new MensagemError("Explique a decisão.", 400);
  return db.transaction(async (tx) => {
    const [d] = await tx
      .update(grupoDenuncias)
      .set({ status: entrada.decisao as string, decisao: resposta || null, decididaPor: req.user!.id, decididaEm: new Date() })
      .where(and(eq(grupoDenuncias.id, id), eq(grupoDenuncias.status, "aberta")))
      .returning({ grupoId: grupoDenuncias.grupoId });
    if (!d) throw new MensagemError("Esta denúncia já foi decidida ou não existe.", 409);
    if (entrada.decisao === "procedente") await tx.update(grupos).set({ encerradaEm: new Date() }).where(eq(grupos.id, d.grupoId));
    return { status: entrada.decisao };
  });
}
