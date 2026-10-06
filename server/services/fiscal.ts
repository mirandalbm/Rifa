/**
 * Cadastro fiscal do afiliado: dados e documentos, cifrados no cofre.
 *
 * Quem lê: o próprio afiliado (o que ele mesmo mandou) e o administrador
 * geral — nunca o organizador. A auditoria de cada leitura é feita na rota,
 * **antes** de o dado sair (como nas exportações).
 *
 * Mexer nos dados ou num documento de um cadastro aprovado devolve à
 * análise: trocar a conta bancária é exatamente o golpe de quem tomou a
 * conta do afiliado.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { affiliates, afiliadoDocumentos, afiliadoFiscal, saqueNotas, users } from "@shared/schema";
import {
  DOCUMENTOS,
  DOCUMENTO_MAX_BYTES,
  MENSAGEM_SAQUE_SO_COM_CNPJ,
  NOTA_FISCAL_MAX_BYTES,
  faltaNoCadastro,
  mimeDaNotaFiscal,
  validarCadastroFiscal,
  type DadosFiscais,
  type StatusFiscal,
  type TipoDeDocumento,
} from "@shared/fiscal";
import { cifrar, cifrarJson, decifrar, decifrarJson, impressaoDoCpf } from "./cofre";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class FiscalError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "FiscalError";
  }
}

/** O tipo pelo conteúdo, não pelo que o navegador disse. */
function mimeDoConteudo(b: Buffer): string | null {
  if (b.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

async function tiposEnviados(affiliateId: string) {
  const linhas = await db
    .select({ tipo: afiliadoDocumentos.tipo, mime: afiliadoDocumentos.mime, tamanho: afiliadoDocumentos.tamanho, createdAt: afiliadoDocumentos.createdAt })
    .from(afiliadoDocumentos)
    .where(eq(afiliadoDocumentos.affiliateId, affiliateId));
  return linhas;
}

/**
 * Depois de qualquer envio: completo vai para análise; incompleto fica
 * incompleto. Aprovado que mudou volta para análise.
 */
/** Os dados decifrados da linha (nulo sem dados). */
function dadosDa(f: { dados: Buffer | null; iv: Buffer | null; tag: Buffer | null; chaveVersao: string | null } | undefined) {
  return f?.dados && f.iv && f.tag && f.chaveVersao
    ? decifrarJson<DadosFiscais>({ dados: f.dados, iv: f.iv, tag: f.tag, versao: f.chaveVersao })
    : null;
}

async function recalcularStatus(affiliateId: string) {
  const [f] = await db
    .select({ dados: afiliadoFiscal.dados, iv: afiliadoFiscal.iv, tag: afiliadoFiscal.tag, chaveVersao: afiliadoFiscal.chaveVersao })
    .from(afiliadoFiscal)
    .where(eq(afiliadoFiscal.affiliateId, affiliateId));
  const docs = (await tiposEnviados(affiliateId)).map((d) => d.tipo);
  const dados = dadosDa(f);
  const completo = faltaNoCadastro(Boolean(dados), docs, Boolean(dados?.empresa)).length === 0;
  await db
    .insert(afiliadoFiscal)
    .values({ affiliateId, status: completo ? "em_analise" : "incompleto", enviadoEm: completo ? new Date() : null })
    .onConflictDoUpdate({
      target: afiliadoFiscal.affiliateId,
      set: {
        status: completo ? "em_analise" : "incompleto",
        enviadoEm: completo ? new Date() : null,
        motivo: null,
        decididoEm: null,
        decididoPor: null,
        updatedAt: new Date(),
      },
    });
}

export async function salvarDadosFiscais(affiliateId: string, bruto: unknown) {
  let dados: DadosFiscais;
  try {
    dados = validarCadastroFiscal(bruto);
  } catch (e) {
    throw new FiscalError((e as Error).message);
  }
  const c = cifrarJson(dados);
  const valores = { dados: c.dados, iv: c.iv, tag: c.tag, chaveVersao: c.versao, cpfImpressao: impressaoDoCpf(dados.cpf), updatedAt: new Date() };
  try {
    await db
      .insert(afiliadoFiscal)
      .values({ affiliateId, ...valores })
      .onConflictDoUpdate({ target: afiliadoFiscal.affiliateId, set: valores });
  } catch (e) {
    // O índice único da impressão do CPF decide (nunca um SELECT antes).
    if ((e as { cause?: { code?: string }; code?: string }).cause?.code === "23505" || (e as { code?: string }).code === "23505") {
      throw new FiscalError("Este CPF já está no cadastro de outro afiliado. Fale com o suporte.", 409);
    }
    throw e;
  }
  await recalcularStatus(affiliateId);
}

export async function salvarDocumento(affiliateId: string, tipo: string, dataUrl: unknown) {
  if (!(tipo in DOCUMENTOS)) throw new FiscalError("Tipo de documento desconhecido.");
  const m = /^data:[a-z/+.-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl ?? ""));
  if (!m) throw new FiscalError("Envie uma foto (JPG, PNG, WebP) ou um PDF.");
  const bruto = Buffer.from(m[1], "base64");
  if (bruto.length > DOCUMENTO_MAX_BYTES) throw new FiscalError("O arquivo passa de 6 MB.");
  const mime = mimeDoConteudo(bruto);
  if (!mime) throw new FiscalError("O arquivo não é foto nem PDF.");
  const c = cifrar(bruto);
  const valores = { mime, tamanho: bruto.length, dados: c.dados, iv: c.iv, tag: c.tag, chaveVersao: c.versao, createdAt: new Date() };
  await db
    .insert(afiliadoDocumentos)
    .values({ affiliateId, tipo, ...valores })
    .onConflictDoUpdate({ target: [afiliadoDocumentos.affiliateId, afiliadoDocumentos.tipo], set: valores });
  await recalcularStatus(affiliateId);
}

export async function estadoFiscal(affiliateId: string, comDados: boolean) {
  const [f] = await db.select().from(afiliadoFiscal).where(eq(afiliadoFiscal.affiliateId, affiliateId));
  const documentos = await tiposEnviados(affiliateId);
  const todos = dadosDa(f);
  const dados = comDados ? todos : null;
  return {
    status: (f?.status ?? "incompleto") as StatusFiscal,
    motivo: f?.motivo ?? null,
    enviadoEm: f?.enviadoEm ?? null,
    decididoEm: f?.decididoEm ?? null,
    dados,
    documentos,
    falta: faltaNoCadastro(Boolean(todos), documentos.map((d) => d.tipo), Boolean(todos?.empresa)),
    /** Com o CNPJ no cadastro (a regra do saque): só o tipo, sem o número. */
    temCnpj: Boolean(todos?.empresa),
  };
}

export async function documento(affiliateId: string, tipo: string) {
  const [d] = await db
    .select()
    .from(afiliadoDocumentos)
    .where(and(eq(afiliadoDocumentos.affiliateId, affiliateId), eq(afiliadoDocumentos.tipo, tipo)));
  if (!d) throw new FiscalError("Documento não encontrado.", 404);
  return { mime: d.mime, bytes: decifrar({ dados: d.dados, iv: d.iv, tag: d.tag, versao: d.chaveVersao }) };
}

/** A fila da plataforma: quem mandou, quando, e o status — sem os dados. */
export async function cadastrosFiscais() {
  return db
    .select({
      affiliateId: afiliadoFiscal.affiliateId,
      status: afiliadoFiscal.status,
      enviadoEm: afiliadoFiscal.enviadoEm,
      decididoEm: afiliadoFiscal.decididoEm,
      motivo: afiliadoFiscal.motivo,
      nome: users.name,
      email: users.email,
      codigo: affiliates.code,
    })
    .from(afiliadoFiscal)
    .innerJoin(affiliates, eq(affiliates.id, afiliadoFiscal.affiliateId))
    .innerJoin(users, eq(users.id, affiliates.userId))
    .orderBy(desc(afiliadoFiscal.enviadoEm));
}

/** Só decide o que está em análise (`UPDATE` condicional). */
export async function decidirCadastro(affiliateId: string, status: unknown, motivo: unknown, userId: string | null) {
  if (status !== "aprovado" && status !== "recusado") throw new FiscalError("Decisão inválida.");
  const texto = typeof motivo === "string" ? motivo.trim().slice(0, 300) : "";
  if (status === "recusado" && texto.length < 5) throw new FiscalError("Diga o motivo da recusa — o afiliado precisa saber o que corrigir.");
  const [feito] = await db
    .update(afiliadoFiscal)
    .set({ status, motivo: texto || null, decididoEm: new Date(), decididoPor: userId, updatedAt: new Date() })
    .where(and(eq(afiliadoFiscal.affiliateId, affiliateId), eq(afiliadoFiscal.status, "em_analise")))
    .returning({ status: afiliadoFiscal.status });
  if (!feito) throw new FiscalError("Este cadastro não está em análise.", 409);
  return feito;
}

export async function cadastroAprovado(affiliateId: string) {
  const [f] = await db.select({ status: afiliadoFiscal.status }).from(afiliadoFiscal).where(eq(afiliadoFiscal.affiliateId, affiliateId));
  return f?.status === "aprovado";
}

/**
 * Quem recebe, para o recibo (nulo sem cadastro): com CNPJ, a razão social e
 * o CNPJ; o cadastro de antes da regra, o nome e o CPF.
 */
export async function identificacaoParaRecibo(affiliateId: string) {
  const e = await estadoFiscal(affiliateId, true);
  if (e.status !== "aprovado" || !e.dados) return null;
  if (e.dados.empresa) return { nome: e.dados.empresa.razaoSocial, cpf: null, cnpj: e.dados.empresa.cnpj };
  return { nome: e.dados.nomeCompleto, cpf: e.dados.cpf, cnpj: undefined };
}

/**
 * A regra do saque (resposta 6.4 do advogado, caminho escolhido: só MEI ou
 * empresa): cadastro fiscal **aprovado** e **com CNPJ**. Devolve o motivo da
 * recusa, ou `null`. Sem interruptor: pagar pessoa física exigiria RPA e
 * retenções que o sistema não faz.
 */
export async function problemaParaSacar(affiliateId: string): Promise<string | null> {
  const e = await estadoFiscal(affiliateId, false);
  if (e.status !== "aprovado" || !e.temCnpj) return MENSAGEM_SAQUE_SO_COM_CNPJ;
  return null;
}

/** Confere a nota fiscal do saque **antes** da transação: tamanho e tipo pelo conteúdo. */
export function lerNotaFiscal(dataUrl: unknown): { mime: string; bytes: Buffer } {
  const m = /^data:[a-z/+.-]*;base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl ?? ""));
  if (!m) throw new FiscalError("Anexe a nota fiscal do saque (PDF, XML ou foto), emitida pelo seu CNPJ no valor do saque.");
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > NOTA_FISCAL_MAX_BYTES) throw new FiscalError("A nota fiscal passa de 3 MB.");
  const mime = mimeDaNotaFiscal(bytes);
  if (!mime) throw new FiscalError("O arquivo não é uma nota fiscal em PDF, XML ou foto.");
  return { mime, bytes };
}

/** Grava a nota na transação que cria o saque — cifrada, como os documentos. */
export async function gravarNotaDoSaque(tx: Tx, payoutId: string, nota: { mime: string; bytes: Buffer }) {
  const c = cifrar(nota.bytes);
  await tx.insert(saqueNotas).values({ payoutId, mime: nota.mime, tamanho: nota.bytes.length, dados: c.dados, iv: c.iv, tag: c.tag, chaveVersao: c.versao });
}

export async function notaDoSaque(payoutId: string) {
  const [n] = await db.select().from(saqueNotas).where(eq(saqueNotas.payoutId, payoutId));
  if (!n) throw new FiscalError("Nota fiscal não encontrada.", 404);
  return { mime: n.mime, bytes: decifrar({ dados: n.dados, iv: n.iv, tag: n.tag, versao: n.chaveVersao }) };
}

export type { TipoDeDocumento };
