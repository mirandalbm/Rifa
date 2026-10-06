/**
 * Verificação do perfil (selo de trevo) — apostador, afiliado e
 * organização. Regras em `shared/verificacao.ts`.
 *
 * - Dados e documentos entram **cifrados** no cofre, como o cadastro
 *   fiscal. Quem lê: o próprio dono (o que ele mesmo mandou) e a
 *   plataforma, com auditoria antes de o dado sair (na rota).
 * - O status muda sempre dentro de uma transação com a linha travada
 *   (`FOR UPDATE`), e o espelho público (`buyers.verificado_em`,
 *   `affiliates.verificado_em`, `organizations.verificada_em`) muda na
 *   mesma transação — o selo nunca fica aceso sozinho.
 * - Trocar a foto de um perfil verificado tira o selo **na transação que
 *   troca a foto** (`fotoMudouNaTransacao`): senão bastaria verificar com a
 *   própria cara e depois pôr a de outra pessoa.
 * - Mexer em dado ou documento volta tudo para a análise.
 */
import type { Request } from "express";
import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  afiliadoDocumentos,
  afiliadoFotos,
  affiliates,
  auditLog,
  buyers,
  compradorFotos,
  organizations,
  verificacaoDocumentos,
  verificacoes,
} from "@shared/schema";
import {
  DOCUMENTOS_DO_SUJEITO,
  DOCUMENTO_VERIFICACAO_MAX_BYTES,
  CONSENTIMENTO_BIOMETRICO_VERSAO,
  chaveDoConsentimento,
  consentimentoVigente,
  precisaRenovarConsentimento,
  prazoParaRenovarConsentimento,
  comparaFoto,
  cpfDaVerificacao,
  decisaoDoRosto,
  faltaNaVerificacao,
  textoDoConsentimentoBiometrico,
  validarDadosDaVerificacao,
  type DadosVerificacao,
  type StatusVerificacao,
  type Sujeito,
} from "@shared/verificacao";
import { mensagemVerificacao } from "@shared/push";
import { cifrar, cifrarJson, decifrar, decifrarJson, impressaoDoCpf } from "./cofre";
import { comparadorAtivo, type ComparadorDeRostos } from "./rosto";
import { avisar, emSegundoPlano } from "./push";
import { isUniqueViolation } from "../pgError";
import { hit } from "./antifraude";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class VerificacaoError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "VerificacaoError";
  }
}

/** O tipo pelo conteúdo, não pelo que o navegador disse (a mesma régua do cadastro fiscal). */
function mimeDoConteudo(b: Buffer): string | null {
  if (b.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/* ------------------------------------------------------------------ *
 * Foto do perfil e espelho público
 * ------------------------------------------------------------------ */

/** Quando a foto do perfil mudou pela última vez (nulo: sem foto). Organização não compara foto. */
async function versaoDaFoto(tx: Tx | typeof db, sujeito: Sujeito, id: string): Promise<Date | null> {
  if (sujeito === "apostador") {
    const [b] = await tx.select({ em: buyers.fotoEm }).from(buyers).where(eq(buyers.id, id));
    return b?.em ?? null;
  }
  if (sujeito === "afiliado") {
    const [a] = await tx.select({ em: affiliates.fotoEm }).from(affiliates).where(eq(affiliates.id, id));
    return a?.em ?? null;
  }
  return null;
}

async function bytesDaFoto(sujeito: Sujeito, id: string): Promise<Buffer | null> {
  if (sujeito === "apostador") {
    const [f] = await db.select({ bytes: compradorFotos.bytes }).from(compradorFotos).where(eq(compradorFotos.buyerId, id));
    return f?.bytes ?? null;
  }
  if (sujeito === "afiliado") {
    const [f] = await db.select({ bytes: afiliadoFotos.bytes }).from(afiliadoFotos).where(eq(afiliadoFotos.affiliateId, id));
    return f?.bytes ?? null;
  }
  return null;
}

/** O selo público — sempre na mesma transação que muda o status. */
async function espelhar(tx: Tx, sujeito: Sujeito, id: string, quando: Date | null) {
  if (sujeito === "apostador") await tx.update(buyers).set({ verificadoEm: quando }).where(eq(buyers.id, id));
  else if (sujeito === "afiliado") await tx.update(affiliates).set({ verificadoEm: quando }).where(eq(affiliates.id, id));
  else await tx.update(organizations).set({ verificadaEm: quando }).where(eq(organizations.id, id));
}

/* ------------------------------------------------------------------ *
 * O recálculo (sempre com a linha travada)
 * ------------------------------------------------------------------ */

type Causa = "documentos" | "foto";

/**
 * Depois de qualquer mudança do dono, decide o novo status:
 *
 * - falta algo → `incompleto` (e o selo sai);
 * - mudou dado ou documento → `em_analise`, e a aprovação anterior dos
 *   documentos cai;
 * - mudou só a foto com os documentos já aprovados → `foto_em_analise`
 *   (o comparador tenta sozinho, depois do commit);
 * - mudou a foto de quem ainda nem mandou tudo → segue o fluxo normal.
 *
 * Devolve o status novo, ou `null` se não há verificação.
 */
async function recalcularNaTransacao(tx: Tx, sujeito: Sujeito, id: string, causa: Causa): Promise<StatusVerificacao | null> {
  const [v] = await tx
    .select({
      id: verificacoes.id,
      status: verificacoes.status,
      temDados: sql<boolean>`${verificacoes.dados} is not null`,
      documentosAprovadosEm: verificacoes.documentosAprovadosEm,
      consentimentoChave: verificacoes.consentimentoBiometricoChave,
    })
    .from(verificacoes)
    .where(and(eq(verificacoes.sujeito, sujeito), eq(verificacoes.sujeitoId, id)))
    .for("update");
  if (!v) return null;
  const docs = (
    await tx.select({ tipo: verificacaoDocumentos.tipo }).from(verificacaoDocumentos).where(eq(verificacaoDocumentos.verificacaoId, v.id))
  ).map((d) => d.tipo);
  const foto = await versaoDaFoto(tx, sujeito, id);
  const falta = faltaNaVerificacao(sujeito, {
    temDados: v.temDados,
    documentos: docs,
    temFoto: Boolean(foto),
    temConsentimento: consentimentoVigente(v.consentimentoChave),
  });
  const agora = new Date();

  let novo: StatusVerificacao;
  let documentosAprovadosEm: Date | null = v.documentosAprovadosEm;
  if (causa === "documentos") documentosAprovadosEm = null;
  if (falta.length) novo = "incompleto";
  else if (documentosAprovadosEm && comparaFoto(sujeito)) novo = "foto_em_analise";
  else if (causa === "foto" && (v.status === "em_analise" || v.status === "recusado")) novo = v.status;
  else novo = "em_analise";

  const saiu = v.status !== novo || causa === "documentos";
  await tx
    .update(verificacoes)
    .set({
      status: novo,
      documentosAprovadosEm,
      ...(causa === "documentos" ? { documentosAprovadosPor: null } : {}),
      fotoVersao: foto,
      fotoConferidaPor: null,
      verificadoEm: null,
      ...(saiu && (novo === "em_analise" || novo === "foto_em_analise") ? { enviadoEm: agora, motivo: null } : {}),
      updatedAt: agora,
    })
    .where(eq(verificacoes.id, v.id));
  await espelhar(tx, sujeito, id, null);
  return novo;
}

/**
 * Chamado **dentro da transação que troca (ou apaga) a foto do perfil**:
 * o selo cai junto com a troca. Depois do commit, `depoisDaFoto()` tenta o
 * comparador automático.
 */
export async function fotoMudouNaTransacao(tx: Tx, sujeito: Sujeito, id: string) {
  return recalcularNaTransacao(tx, sujeito, id, "foto");
}

/** Depois do commit da foto nova: o comparador automático tenta, sem segurar a resposta. */
export function depoisDaFoto(sujeito: Sujeito, id: string, status: StatusVerificacao | null) {
  if (status !== "foto_em_analise") return;
  emSegundoPlano(
    (async () => {
      const [v] = await db
        .select({ id: verificacoes.id })
        .from(verificacoes)
        .where(and(eq(verificacoes.sujeito, sujeito), eq(verificacoes.sujeitoId, id)));
      if (v) await compararAutomaticamente(v.id);
    })(),
    "comparação de rosto",
  );
}

/* ------------------------------------------------------------------ *
 * O dono: dados e documentos
 * ------------------------------------------------------------------ */

async function linhaDe(sujeito: Sujeito, id: string) {
  await db.insert(verificacoes).values({ sujeito, sujeitoId: id }).onConflictDoNothing();
  const [v] = await db
    .select()
    .from(verificacoes)
    .where(and(eq(verificacoes.sujeito, sujeito), eq(verificacoes.sujeitoId, id)));
  return v;
}

/** O texto do consentimento em vigor agora, com a chave e a impressão. */
function consentimentoEmVigor() {
  const modo = { automatico: Boolean(comparadorAtivo()) };
  const texto = textoDoConsentimentoBiometrico(modo);
  return {
    texto,
    chave: chaveDoConsentimento(modo),
    hash: createHash("sha256").update(texto.join("\n")).digest("hex"),
  };
}

/** Quem age na verificação, para a auditoria — escolhido pela rota conforme o sujeito. */
export type AtorDaVerificacao = { id: string | null; role: string; ip: string | null };

/**
 * Confere a autorização que a tela mandou: marcada e com a chave do texto
 * que está em vigor (o texto mudou desde que a pessoa leu → 409, lê de novo).
 * Sem a marca, devolve `null` — quem chama decide se é obrigatória.
 */
function consentimentoConferido(bruto: unknown) {
  const b = (bruto ?? {}) as { consentimentoFoto?: unknown; consentimentoChave?: unknown };
  if (b.consentimentoFoto !== true) return null;
  const atual = consentimentoEmVigor();
  if (b.consentimentoChave !== atual.chave) {
    throw new VerificacaoError("O texto da autorização mudou desde que você leu. Leia de novo e autorize.", 409);
  }
  return atual;
}

/**
 * Grava o consentimento na transação de quem chama — só se mudou (outra
 * chave, ou nenhum) — e a auditoria junto, com a chave e a impressão do
 * texto. Devolve se gravou.
 */
async function gravarConsentimento(tx: Tx, verificacaoId: string, sujeito: Sujeito, sujeitoId: string, c: { chave: string; hash: string }, ator: AtorDaVerificacao) {
  const [u] = await tx
    .update(verificacoes)
    .set({ consentimentoBiometricoEm: new Date(), consentimentoBiometricoChave: c.chave, consentimentoBiometricoHash: c.hash })
    .where(and(eq(verificacoes.id, verificacaoId), sql`${verificacoes.consentimentoBiometricoChave} is distinct from ${c.chave}`))
    .returning({ id: verificacoes.id });
  if (!u) return false;
  await tx.insert(auditLog).values({
    actorId: ator.id,
    actorRole: ator.role,
    action: "verificacao.consentimento.dado",
    entity: `verificacao_${sujeito}`,
    entityId: sujeitoId,
    diff: { chave: c.chave, hash: c.hash },
    ip: ator.ip,
  });
  return true;
}

export async function salvarDadosDaVerificacao(sujeito: Sujeito, id: string, bruto: unknown, ator: AtorDaVerificacao) {
  // A foto do rosto é dado biométrico (LGPD, art. 11): a autorização vem marcada na tela, à parte.
  // Não é condição para salvar os dados — quem revogou corrige a conta sem consentir de novo; o que
  // falta aparece em `faltaNaVerificacao`.
  const consentimento = comparaFoto(sujeito) ? consentimentoConferido(bruto) : null;
  let dados: DadosVerificacao;
  try {
    dados = validarDadosDaVerificacao(sujeito, bruto);
  } catch (e) {
    throw new VerificacaoError((e as Error).message);
  }
  // O apostador verifica a conta dele: o CPF do documento é o da conta.
  if (sujeito === "apostador") {
    const [b] = await db.select({ cpf: buyers.cpf }).from(buyers).where(eq(buyers.id, id));
    if (b?.cpf && b.cpf.replace(/\D/g, "") !== cpfDaVerificacao(dados)) {
      throw new VerificacaoError("O CPF não é o da sua conta. A verificação é da pessoa dona da conta.", 409);
    }
  }
  const v = await linhaDe(sujeito, id);
  const c = cifrarJson(dados);
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(verificacoes)
        .set({
          dados: c.dados,
          iv: c.iv,
          tag: c.tag,
          chaveVersao: c.versao,
          cpfImpressao: impressaoDoCpf(cpfDaVerificacao(dados)),
        })
        .where(eq(verificacoes.id, v.id));
      if (consentimento) await gravarConsentimento(tx, v.id, sujeito, id, consentimento, ator);
      await recalcularNaTransacao(tx, sujeito, id, "documentos");
    });
  } catch (e) {
    // O índice decide (nunca um SELECT antes): o mesmo CPF não verifica duas contas do mesmo tipo.
    if (isUniqueViolation(e, "uq_verificacao_cpf")) {
      throw new VerificacaoError("Este CPF já verificou outro perfil. Fale com o suporte.", 409);
    }
    throw e;
  }
  return estadoDaVerificacao(sujeito, id, false);
}

/**
 * Autorizar (de novo) a comparação sem mexer nos dados — quem revogou, ou
 * quem verificou antes de o consentimento ser gravado. Grava a prova só se
 * mudou, e só reabre a análise de quem estava parado por falta dela
 * (`incompleto`): a autorização não desfaz a decisão da plataforma
 * (`foto_divergente` pede foto nova) nem tira o selo de quem já tem.
 */
export async function autorizarComparacao(sujeito: Sujeito, id: string, bruto: unknown, ator: AtorDaVerificacao) {
  if (!comparaFoto(sujeito)) throw new VerificacaoError("Esta verificação não compara foto.", 400);
  const consentimento = consentimentoConferido(bruto);
  if (!consentimento) throw new VerificacaoError("Marque a autorização para comparar a foto do perfil com a do documento.");
  // Cada autorização pode chamar o comparador pago: limite por pessoa.
  if ((await hit(`verificacao:consentimento:${sujeito}:${id}`, 60, 10)).excedeu) {
    throw new VerificacaoError("Muitas tentativas. Espere um pouco e tente de novo.", 429);
  }
  const v = await linhaDe(sujeito, id);
  const status = await db.transaction(async (tx) => {
    const [atual] = await tx.select({ status: verificacoes.status }).from(verificacoes).where(eq(verificacoes.id, v.id)).for("update");
    const gravou = await gravarConsentimento(tx, v.id, sujeito, id, consentimento, ator);
    if (!gravou) return null;
    if (atual.status === "incompleto") return recalcularNaTransacao(tx, sujeito, id, "foto");
    // Já esperando a foto: o comparador pode tentar agora (o status não muda).
    return atual.status === "foto_em_analise" ? ("foto_em_analise" as const) : null;
  });
  depoisDaFoto(sujeito, id, status);
  return estadoDaVerificacao(sujeito, id, true);
}

/**
 * Revogar a autorização (LGPD, art. 8º, § 5º): a prova do consentimento sai,
 * a foto deixa de ser comparada e o selo cai na mesma transação, com a
 * auditoria. Os dados e os documentos ficam (servem à verificação de
 * identidade); excluir a conta apaga tudo. Sem autorização gravada, nada
 * muda e nada é auditado.
 */
export async function revogarComparacao(
  sujeito: Sujeito,
  id: string,
  ator: AtorDaVerificacao,
  acao: "verificacao.consentimento.revogado" | "verificacao.consentimento.vencido" = "verificacao.consentimento.revogado",
) {
  if (!comparaFoto(sujeito)) throw new VerificacaoError("Esta verificação não compara foto.", 400);
  await db.transaction(async (tx) => {
    const [u] = await tx
      .update(verificacoes)
      .set({ consentimentoBiometricoEm: null, consentimentoBiometricoChave: null, consentimentoBiometricoHash: null })
      .where(
        and(
          eq(verificacoes.sujeito, sujeito),
          eq(verificacoes.sujeitoId, id),
          // Também quem foi verificado sem autorização gravada: "não autorizar" no pedido de
          // renovação tira o selo do mesmo jeito.
          or(isNotNull(verificacoes.consentimentoBiometricoEm), eq(verificacoes.status, "verificado")),
        ),
      )
      .returning({ status: verificacoes.status });
    if (!u) return;
    // Decisão da plataforma que pede correção (foto nova, documento novo) fica como está — o selo já
    // não existe nela; recalcular a mandaria para `incompleto` e, autorizando de novo, de volta à
    // fila com a mesma foto ou o mesmo documento.
    if (u.status !== "foto_divergente" && u.status !== "recusado") await recalcularNaTransacao(tx, sujeito, id, "foto");
    await tx.insert(auditLog).values({
      actorId: ator.id,
      actorRole: ator.role,
      action: acao,
      entity: `verificacao_${sujeito}`,
      entityId: id,
      ip: ator.ip,
    });
  });
  return estadoDaVerificacao(sujeito, id, true);
}

/**
 * O relógio da renovação (resposta 7.3): passado o prazo, quem segue
 * verificado com a autorização de antes (ou sem nenhuma) perde o selo, como
 * se tivesse revogado — o consentimento antigo não vale para dado sensível.
 * Pela mesma `revogarComparacao()`, com o ator `sistema` e a auditoria
 * `verificacao.consentimento.vencido`. Devolve quantos perderam o selo.
 */
export async function tirarSelosSemConsentimentoRenovado(agora = new Date(), limite = 200): Promise<number> {
  if (agora < prazoParaRenovarConsentimento()) return 0;
  const linhas = await db
    .select({ sujeito: verificacoes.sujeito, sujeitoId: verificacoes.sujeitoId })
    .from(verificacoes)
    .where(
      and(
        eq(verificacoes.status, "verificado"),
        inArray(verificacoes.sujeito, ["apostador", "afiliado"]),
        sql`(${verificacoes.consentimentoBiometricoChave} is null or ${verificacoes.consentimentoBiometricoChave} not like ${`${CONSENTIMENTO_BIOMETRICO_VERSAO}:%`})`,
      ),
    )
    .limit(limite);
  let n = 0;
  for (const l of linhas) {
    try {
      await revogarComparacao(l.sujeito as Sujeito, l.sujeitoId, { id: null, role: "sistema", ip: null }, "verificacao.consentimento.vencido");
      n++;
    } catch (e) {
      console.error("[verificacao] não tirou o selo sem consentimento renovado:", (e as Error).message);
    }
  }
  return n;
}

export async function salvarDocumentoDaVerificacao(sujeito: Sujeito, id: string, tipo: string, dataUrl: unknown) {
  if (!(DOCUMENTOS_DO_SUJEITO[sujeito] as string[]).includes(tipo)) throw new VerificacaoError("Tipo de documento desconhecido.");
  const m = /^data:[a-z/+.-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl ?? ""));
  if (!m) throw new VerificacaoError("Envie uma foto (JPG, PNG, WebP) ou um PDF.");
  const bruto = Buffer.from(m[1], "base64");
  if (bruto.length > DOCUMENTO_VERIFICACAO_MAX_BYTES) throw new VerificacaoError("O arquivo passa de 6 MB.");
  const mime = mimeDoConteudo(bruto);
  if (!mime) throw new VerificacaoError("O arquivo não é foto nem PDF.");
  if (tipo === "identidade_frente" && mime === "application/pdf" && comparaFoto(sujeito)) {
    throw new VerificacaoError("A frente do documento vai como foto (JPG, PNG ou WebP): é nela que comparamos o rosto.");
  }
  const v = await linhaDe(sujeito, id);
  const c = cifrar(bruto);
  const valores = { mime, tamanho: bruto.length, dados: c.dados, iv: c.iv, tag: c.tag, chaveVersao: c.versao, createdAt: new Date() };
  await db.transaction(async (tx) => {
    await tx
      .insert(verificacaoDocumentos)
      .values({ verificacaoId: v.id, tipo, ...valores })
      .onConflictDoUpdate({ target: [verificacaoDocumentos.verificacaoId, verificacaoDocumentos.tipo], set: valores });
    await recalcularNaTransacao(tx, sujeito, id, "documentos");
  });
  return estadoDaVerificacao(sujeito, id, false);
}

/**
 * O afiliado com o cadastro fiscal já mandado não precisa fotografar o RG
 * de novo: os mesmos documentos (frente e verso) são copiados, cifrados como
 * estão. Os dados ele confere na tela — a verificação pede o Pix, que o
 * cadastro fiscal não tem.
 */
export async function copiarDocumentosDoFiscal(affiliateId: string) {
  const fiscais = await db
    .select()
    .from(afiliadoDocumentos)
    .where(and(eq(afiliadoDocumentos.affiliateId, affiliateId), inArray(afiliadoDocumentos.tipo, ["identidade_frente", "identidade_verso"])));
  if (fiscais.length === 0) throw new VerificacaoError("O cadastro fiscal não tem documento com foto para copiar.", 404);
  const frente = fiscais.find((d) => d.tipo === "identidade_frente");
  if (frente?.mime === "application/pdf") {
    throw new VerificacaoError("A frente do documento do cadastro fiscal está em PDF. Envie uma foto dela aqui.");
  }
  const v = await linhaDe("afiliado", affiliateId);
  await db.transaction(async (tx) => {
    for (const d of fiscais) {
      const valores = { mime: d.mime, tamanho: d.tamanho, dados: d.dados, iv: d.iv, tag: d.tag, chaveVersao: d.chaveVersao, createdAt: new Date() };
      await tx
        .insert(verificacaoDocumentos)
        .values({ verificacaoId: v.id, tipo: d.tipo, ...valores })
        .onConflictDoUpdate({ target: [verificacaoDocumentos.verificacaoId, verificacaoDocumentos.tipo], set: valores });
    }
    await recalcularNaTransacao(tx, "afiliado", affiliateId, "documentos");
  });
  return estadoDaVerificacao("afiliado", affiliateId, false);
}

/**
 * O pedido de renovação (resposta 7.3), leve para a tela consultar ao entrar:
 * só o necessário para a janela — sem dados, sem documentos.
 */
export async function pedidoDeRenovacao(sujeito: Sujeito, id: string) {
  if (!comparaFoto(sujeito)) return { renovar: false as const };
  const [v] = await db
    .select({ status: verificacoes.status, chave: verificacoes.consentimentoBiometricoChave })
    .from(verificacoes)
    .where(and(eq(verificacoes.sujeito, sujeito), eq(verificacoes.sujeitoId, id)));
  if (!v || !precisaRenovarConsentimento(v.status, v.chave)) return { renovar: false as const };
  const atual = consentimentoEmVigor();
  return { renovar: true as const, renovarAte: prazoParaRenovarConsentimento().toISOString(), texto: atual.texto, chave: atual.chave };
}

/** O que o dono vê: status, motivo, o que falta e — pedindo — os próprios dados. */
export async function estadoDaVerificacao(sujeito: Sujeito, id: string, comDados: boolean) {
  const [v] = await db
    .select()
    .from(verificacoes)
    .where(and(eq(verificacoes.sujeito, sujeito), eq(verificacoes.sujeitoId, id)));
  const documentos = v
    ? await db
        .select({ tipo: verificacaoDocumentos.tipo, mime: verificacaoDocumentos.mime, tamanho: verificacaoDocumentos.tamanho, createdAt: verificacaoDocumentos.createdAt })
        .from(verificacaoDocumentos)
        .where(eq(verificacaoDocumentos.verificacaoId, v.id))
    : [];
  const temFoto = Boolean(await versaoDaFoto(db, sujeito, id));
  const dados =
    comDados && v?.dados && v.iv && v.tag && v.chaveVersao
      ? decifrarJson<DadosVerificacao>({ dados: v.dados, iv: v.iv, tag: v.tag, versao: v.chaveVersao })
      : null;
  return {
    sujeito,
    status: (v?.status ?? "incompleto") as StatusVerificacao,
    motivo: v?.motivo ?? null,
    enviadoEm: v?.enviadoEm ?? null,
    verificadoEm: v?.verificadoEm ?? null,
    documentosAprovados: Boolean(v?.documentosAprovadosEm),
    comparaFoto: comparaFoto(sujeito),
    temFoto,
    dados,
    documentos,
    falta: faltaNaVerificacao(sujeito, {
      temDados: Boolean(v?.dados),
      documentos: documentos.map((d) => d.tipo),
      temFoto,
      temConsentimento: consentimentoVigente(v?.consentimentoBiometricoChave),
    }),
    /** O texto a autorizar (com a chave que volta no pedido) e o consentimento gravado. */
    consentimento: comparaFoto(sujeito)
      ? (() => {
          const atual = consentimentoEmVigor();
          return {
            texto: atual.texto,
            chave: atual.chave,
            dadoEm: v?.consentimentoBiometricoEm ?? null,
            chaveDada: v?.consentimentoBiometricoChave ?? null,
            /** Verificado com autorização antiga (ou nenhuma): a tela pede de novo, até o prazo. */
            renovar: precisaRenovarConsentimento(v?.status ?? "incompleto", v?.consentimentoBiometricoChave),
            renovarAte: prazoParaRenovarConsentimento().toISOString(),
          };
        })()
      : null,
  };
}

export async function documentoDoDono(sujeito: Sujeito, id: string, tipo: string) {
  const [d] = await db
    .select({ mime: verificacaoDocumentos.mime, dados: verificacaoDocumentos.dados, iv: verificacaoDocumentos.iv, tag: verificacaoDocumentos.tag, v: verificacaoDocumentos.chaveVersao })
    .from(verificacaoDocumentos)
    .innerJoin(verificacoes, eq(verificacoes.id, verificacaoDocumentos.verificacaoId))
    .where(and(eq(verificacoes.sujeito, sujeito), eq(verificacoes.sujeitoId, id), eq(verificacaoDocumentos.tipo, tipo)));
  if (!d) throw new VerificacaoError("Documento não encontrado.", 404);
  return { mime: d.mime, bytes: decifrar({ dados: d.dados, iv: d.iv, tag: d.tag, versao: d.v }) };
}

/* ------------------------------------------------------------------ *
 * O comparador automático
 * ------------------------------------------------------------------ */

/**
 * Compara a foto do perfil com a frente do documento. Só age em
 * `foto_em_analise`, e só verifica se a foto comparada ainda é a do perfil
 * (`foto_versao` no `UPDATE`): trocar a foto no meio da comparação não
 * herda o resultado. Abaixo do limiar, ou sem rosto, ou com o provedor
 * fora do ar, **não recusa** — fica para a análise humana, com a nota.
 */
export async function compararAutomaticamente(
  verificacaoId: string,
  comparador: ComparadorDeRostos | null = comparadorAtivo(),
): Promise<"verificado" | "manual" | "sem_comparador"> {
  if (!comparador) return "sem_comparador";
  const [v] = await db.select().from(verificacoes).where(eq(verificacoes.id, verificacaoId));
  if (!v || v.status !== "foto_em_analise" || !v.fotoVersao) return "manual";
  // Sem a autorização do texto que fala do serviço de fora, a imagem não sai (LGPD, art. 11):
  // quem autorizou só a comparação por uma pessoa fica para uma pessoa.
  const chaveAutomatica = chaveDoConsentimento({ automatico: true });
  if (v.consentimentoBiometricoChave !== chaveAutomatica) return "manual";
  const sujeito = v.sujeito as Sujeito;
  const foto = await bytesDaFoto(sujeito, v.sujeitoId);
  let doc: { mime: string; bytes: Buffer } | null = null;
  try {
    doc = await documentoDoDono(sujeito, v.sujeitoId, "identidade_frente");
  } catch {
    doc = null;
  }
  if (!foto || !doc || doc.mime === "application/pdf") return "manual";

  // A semelhança é dado de processamento: decide e é descartada — só o resultado fica
  // (minimização, LGPD art. 6º, III; resposta 7.4).
  let similaridade: number | null = null;
  try {
    similaridade = await comparador.comparar(foto, doc.bytes);
  } catch (e) {
    console.error(`[rosto] ${comparador.nome} falhou; fica para a análise humana:`, (e as Error).message);
    return "manual";
  }
  const decisao = decisaoDoRosto(similaridade);
  const agora = new Date();
  const feito = await db.transaction(async (tx) => {
    const [u] = await tx
      .update(verificacoes)
      .set(
        decisao === "verificado"
          ? { status: "verificado", fotoConferidaPor: "automatico", verificadoEm: agora, decididoEm: agora, updatedAt: agora }
          : { updatedAt: agora },
      )
      .where(
        and(
          eq(verificacoes.id, v.id),
          eq(verificacoes.status, "foto_em_analise"),
          eq(verificacoes.fotoVersao, v.fotoVersao!),
          eq(verificacoes.consentimentoBiometricoChave, chaveAutomatica),
          // Revogar e autorizar de novo no meio da comparação não herda o resultado da anterior.
          eq(verificacoes.consentimentoBiometricoEm, v.consentimentoBiometricoEm!),
        ),
      )
      .returning({ id: verificacoes.id });
    if (u && decisao === "verificado") await espelhar(tx, sujeito, v.sujeitoId, agora);
    return Boolean(u);
  });
  if (feito && decisao === "verificado") avisarDono(sujeito, v.sujeitoId, v.id, "verificado");
  return feito ? decisao : "manual";
}

function avisarDono(sujeito: Sujeito, id: string, verificacaoId: string, status: "verificado" | "foto_divergente" | "recusado") {
  if (sujeito !== "apostador") return;
  emSegundoPlano(avisar([id], "verificacao", `${verificacaoId}:${status}:${Date.now()}`, mensagemVerificacao({ status })), "aviso de verificação");
}

/* ------------------------------------------------------------------ *
 * A plataforma: fila, detalhe e decisão
 * ------------------------------------------------------------------ */

export async function filaDeVerificacoes(filtro: "pendentes" | "todas") {
  const r = await db.execute(sql`
    select v.id, v.sujeito, v.status, v.enviado_em, v.decidido_em, v.motivo,
           (v.sujeito <> 'organizacao' and (v.consentimento_biometrico_chave is null
             or v.consentimento_biometrico_chave not like ${`${CONSENTIMENTO_BIOMETRICO_VERSAO}:%`})) as sem_autorizacao,
           coalesce(b.name, u.name, o.name) as nome,
           coalesce('@' || b.apelido, a.code, o.slug) as identificador
      from verificacoes v
      left join buyers b on v.sujeito = 'apostador' and b.id = v.sujeito_id
      left join affiliates a on v.sujeito = 'afiliado' and a.id = v.sujeito_id
      left join users u on u.id = a.user_id
      left join organizations o on v.sujeito = 'organizacao' and o.id = v.sujeito_id
     where v.status <> 'incompleto'
       ${filtro === "pendentes" ? sql`and v.status in ('em_analise', 'foto_em_analise')` : sql``}
     order by (v.status in ('em_analise', 'foto_em_analise')) desc, v.enviado_em asc nulls last
     limit 300`);
  return r.rows.map((x: any) => ({
    id: x.id as string,
    sujeito: x.sujeito as Sujeito,
    status: x.status as StatusVerificacao,
    enviadoEm: x.enviado_em,
    decididoEm: x.decidido_em,
    motivo: x.motivo as string | null,
    /** Pessoa sem a autorização em vigor (revogou, ou deu uma versão antiga): a foto não é comparada. */
    semAutorizacao: Boolean(x.sem_autorizacao),
    nome: (x.nome as string | null) ?? "—",
    identificador: (x.identificador as string | null) ?? "",
  }));
}

/** Quantas esperam a plataforma — o contador do menu. */
export async function verificacoesPendentes() {
  const r = await db.execute(sql`select count(*)::int as n from verificacoes where status in ('em_analise', 'foto_em_analise')`);
  return (r.rows[0] as { n: number }).n;
}

async function linhaPorId(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new VerificacaoError("Verificação não encontrada.", 404);
  const [v] = await db.select().from(verificacoes).where(eq(verificacoes.id, id));
  if (!v) throw new VerificacaoError("Verificação não encontrada.", 404);
  return v;
}

/** O que a plataforma confere: os dados decifrados, os documentos e a foto — lado a lado. */
export async function detalheDaVerificacao(id: string) {
  const v = await linhaPorId(id);
  const sujeito = v.sujeito as Sujeito;
  const [fila] = (await filaDeVerificacoes("todas")).filter((f) => f.id === id);
  const documentos = await db
    .select({ tipo: verificacaoDocumentos.tipo, mime: verificacaoDocumentos.mime, tamanho: verificacaoDocumentos.tamanho, createdAt: verificacaoDocumentos.createdAt })
    .from(verificacaoDocumentos)
    .where(eq(verificacaoDocumentos.verificacaoId, v.id));
  const fotoVersao = await versaoDaFoto(db, sujeito, v.sujeitoId);
  return {
    id: v.id,
    sujeito,
    status: v.status as StatusVerificacao,
    motivo: v.motivo,
    nome: fila?.nome ?? "—",
    identificador: fila?.identificador ?? "",
    enviadoEm: v.enviadoEm,
    documentosAprovados: Boolean(v.documentosAprovadosEm),
    comparaFoto: comparaFoto(sujeito),
    /** A versão da foto que a tela mostra; a decisão confere que ainda é ela. */
    fotoVersao: fotoVersao?.getTime() ?? null,
    comparadorAutomatico: comparadorAtivo()?.nome ?? null,
    /** Quando a pessoa autorizou a comparação (nulo: não autorizou ou revogou). */
    consentimentoEm: consentimentoVigente(v.consentimentoBiometricoChave) ? v.consentimentoBiometricoEm : null,
    dados: v.dados && v.iv && v.tag && v.chaveVersao ? decifrarJson<DadosVerificacao>({ dados: v.dados, iv: v.iv, tag: v.tag, versao: v.chaveVersao }) : null,
    documentos,
  };
}

export async function documentoDaVerificacao(id: string, tipo: string) {
  const v = await linhaPorId(id);
  return documentoDoDono(v.sujeito as Sujeito, v.sujeitoId, tipo);
}

export async function fotoDaVerificacao(id: string) {
  const v = await linhaPorId(id);
  const bytes = await bytesDaFoto(v.sujeito as Sujeito, v.sujeitoId);
  if (!bytes) throw new VerificacaoError("Sem foto no perfil.", 404);
  return bytes;
}

export type AcaoDaVerificacao = "aprovar" | "aprovar_documentos" | "foto_divergente" | "recusar";

/**
 * A decisão da plataforma, com a linha travada:
 *
 * - `aprovar`: documentos certos e — pessoa — a foto do perfil é a do
 *   documento (quem decide viu as duas lado a lado). Vira verificado.
 * - `aprovar_documentos` (pessoa): documentos certos; a foto fica com o
 *   comparador automático, ou volta para a fila da foto.
 * - `foto_divergente` (pessoa): documentos certos, foto de outra pessoa.
 * - `recusar`: documento errado ou ilegível — o dono corrige e manda de novo.
 *
 * Quem aprova a foto manda a versão que viu (`fotoVersao`): se a foto
 * mudou enquanto olhava, 409 — ninguém aprova uma foto que não viu.
 */
export async function decidirVerificacao(
  req: Request,
  id: string,
  entrada: { acao?: unknown; motivo?: unknown; fotoVersao?: unknown },
) {
  const acao = String(entrada.acao ?? "") as AcaoDaVerificacao;
  if (!["aprovar", "aprovar_documentos", "foto_divergente", "recusar"].includes(acao)) throw new VerificacaoError("Decisão inválida.");
  const motivo = typeof entrada.motivo === "string" ? entrada.motivo.trim().slice(0, 500) : "";
  if ((acao === "recusar" || acao === "foto_divergente") && motivo.length < 5) {
    throw new VerificacaoError("Diga o motivo — a pessoa precisa saber o que corrigir.");
  }
  const v0 = await linhaPorId(id);
  const sujeito = v0.sujeito as Sujeito;
  if (!comparaFoto(sujeito) && (acao === "aprovar_documentos" || acao === "foto_divergente")) {
    throw new VerificacaoError("Organização não compara foto: aprove ou recuse.");
  }
  const userId = req.user?.id ?? null;
  const agora = new Date();

  const resultado = await db.transaction(async (tx) => {
    const [v] = await tx
      .select({
        status: verificacoes.status,
        documentosAprovadosEm: verificacoes.documentosAprovadosEm,
        consentimentoChave: verificacoes.consentimentoBiometricoChave,
      })
      .from(verificacoes)
      .where(eq(verificacoes.id, id))
      .for("update");
    if (v.status !== "em_analise" && v.status !== "foto_em_analise") {
      throw new VerificacaoError("Esta verificação não está esperando análise.", 409);
    }
    const foto = await versaoDaFoto(tx, sujeito, v0.sujeitoId);
    if (comparaFoto(sujeito) && (acao === "aprovar" || acao === "foto_divergente")) {
      if (!foto) throw new VerificacaoError("O perfil ficou sem foto. Espere a pessoa pôr uma.", 409);
      // Comparar exige a autorização gravada (pode ter sido revogada enquanto a tela estava aberta).
      if (!consentimentoVigente(v.consentimentoChave)) throw new VerificacaoError("A pessoa não autorizou (ou revogou) a comparação da foto.", 409);
      if (Number(entrada.fotoVersao) !== foto.getTime()) {
        throw new VerificacaoError("A foto do perfil mudou enquanto você olhava. Confira de novo.", 409);
      }
    }
    const docsAprovados =
      acao === "recusar" ? null : v.documentosAprovadosEm ?? agora;
    // Documentos aprovados sem a autorização gravada: a foto não entra em análise (ninguém poderia
    // compará-la); fica parada até a pessoa autorizar, que a leva à análise da foto.
    const fotoSemAutorizacao = acao === "aprovar_documentos" && !consentimentoVigente(v.consentimentoChave);
    const status: StatusVerificacao =
      acao === "aprovar"
        ? "verificado"
        : acao === "aprovar_documentos"
          ? fotoSemAutorizacao
            ? "incompleto"
            : "foto_em_analise"
          : acao === "foto_divergente"
            ? "foto_divergente"
            : "recusado";
    await tx
      .update(verificacoes)
      .set({
        status,
        motivo: acao === "recusar" || acao === "foto_divergente" ? motivo : null,
        documentosAprovadosEm: docsAprovados,
        documentosAprovadosPor: acao === "recusar" ? null : userId,
        fotoVersao: foto,
        fotoConferidaPor: acao === "aprovar" && comparaFoto(sujeito) ? userId : null,
        verificadoEm: status === "verificado" ? agora : null,
        decididoEm: agora,
        decididoPor: userId,
        updatedAt: agora,
      })
      .where(eq(verificacoes.id, id));
    await espelhar(tx, sujeito, v0.sujeitoId, status === "verificado" ? agora : null);
    return status;
  });

  if (resultado === "verificado" || resultado === "foto_divergente" || resultado === "recusado") {
    avisarDono(sujeito, v0.sujeitoId, id, resultado);
  }
  if (resultado === "foto_em_analise") emSegundoPlano(compararAutomaticamente(id), "comparação de rosto");
  return { status: resultado };
}

/* ------------------------------------------------------------------ *
 * Foto do afiliado
 * ------------------------------------------------------------------ */

const FOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * A foto do perfil do afiliado — a que se compara com o documento. Mesma
 * régua da foto do apostador: reprocessada (320 px, WebP, sem metadados) e
 * no banco. Trocar ou apagar tira o selo na mesma transação.
 */
export async function salvarFotoDoAfiliado(affiliateId: string, dataUrl: unknown) {
  let bytes: Buffer | null = null;
  if (dataUrl !== null) {
    const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl ?? ""));
    if (!m) throw new VerificacaoError("Envie uma imagem (JPG, PNG ou WebP).");
    const bruto = Buffer.from(m[2], "base64");
    if (bruto.length > FOTO_MAX_BYTES) throw new VerificacaoError("A foto passa de 5 MB.");
    try {
      const sharp = (await import("sharp")).default;
      bytes = await sharp(bruto, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(320, 320, { fit: "cover", position: "attention" })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      throw new VerificacaoError("Não consegui ler essa imagem. Envie uma foto em JPG ou PNG.");
    }
  }
  const agora = new Date();
  const status = await db.transaction(async (tx) => {
    if (bytes) {
      await tx
        .insert(afiliadoFotos)
        .values({ affiliateId, mime: "image/webp", bytes, updatedAt: agora })
        .onConflictDoUpdate({ target: afiliadoFotos.affiliateId, set: { bytes, updatedAt: agora } });
    } else {
      await tx.delete(afiliadoFotos).where(eq(afiliadoFotos.affiliateId, affiliateId));
    }
    await tx.update(affiliates).set({ fotoEm: bytes ? agora : null }).where(eq(affiliates.id, affiliateId));
    return fotoMudouNaTransacao(tx, "afiliado", affiliateId);
  });
  depoisDaFoto("afiliado", affiliateId, status);
  return { foto: bytes ? `/api/affiliate/foto?v=${agora.getTime()}` : null };
}

export async function fotoDoAfiliado(affiliateId: string) {
  const [f] = await db.select({ bytes: afiliadoFotos.bytes, mime: afiliadoFotos.mime }).from(afiliadoFotos).where(eq(afiliadoFotos.affiliateId, affiliateId));
  return f ?? null;
}
