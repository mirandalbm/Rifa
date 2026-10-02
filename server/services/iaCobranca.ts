/**
 * Cobrança do assistente de IA: a conta de quem paga (organização ou
 * afiliado), o Pix da assinatura e dos pacotes, o débito de cada mensagem e o
 * vencimento da franquia. As regras puras estão em `shared/iaCobranca.ts`.
 *
 * Toda mudança de saldo é **uma linha no livro** (`ia_lancamentos`, chave
 * única) e **a mesma mudança na conta**, na mesma transação e com a conta
 * travada: o webhook repetido não credita duas vezes e a mesma mensagem não
 * debita duas vezes. O master (titular "plataforma") nunca passa por aqui.
 */
import { randomInt } from "node:crypto";
import { and, desc, eq, gt, lte, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  affiliates,
  auditLog,
  iaContas,
  iaLancamentos,
  iaPagamentos,
  organizations,
  users,
} from "@shared/schema";
import {
  CONTA_IA_VAZIA,
  IA_CODIGO_MAX,
  IA_CODIGO_MIN,
  IA_PIX_MINUTOS,
  cicloAtivo,
  cicloDepoisDaAssinatura,
  cobrancaPronta,
  creditosParaTela,
  debitar,
  documentoDoPagador,
  emMilicreditos,
  franquiaValida,
  periodoDoRelatorio,
  problemaNoAjuste,
  problemaNoSaldo,
  validarAjusteIA,
  type ConfigCobrancaIA,
  type LancamentoIAPublico,
  type LinhaDoRelatorioIA,
  type RelatorioIA,
  type ContaIA,
  type PagamentoIAPublico,
  type ResumoCobrancaIA,
} from "@shared/iaCobranca";
import type { TitularDaIA } from "@shared/ia";
import { EXIGE_CPF, type ProvedorPix } from "@shared/plataforma";
import { activePaymentProvider } from "../payments";
import { isUniqueViolation } from "../pgError";
import { hit } from "./antifraude";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

/** Quem paga: organização ou afiliado. A plataforma (master) não paga. */
export type Pagante = { tipo: "organizacao" | "afiliado"; id: string };

export function pagante(t: TitularDaIA): Pagante | null {
  return t.tipo === "plataforma" ? null : { tipo: t.tipo, id: t.id };
}

export class CobrancaIAError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "CobrancaIAError";
  }
}

const daConta = (p: Pagante) =>
  and(eq(iaContas.titularTipo, p.tipo), eq(iaContas.titularId, p.id));

async function lerConta(ex: Executor, p: Pagante): Promise<ContaIA> {
  const [c] = await ex.select().from(iaContas).where(daConta(p));
  return c
    ? {
        franquia: c.franquiaMilicreditos,
        avulso: c.avulsoMilicreditos,
        cicloAte: c.cicloAte,
      }
    : CONTA_IA_VAZIA;
}

/** Cria a conta se faltar (a chave decide) e a trava até o fim da transação. */
async function travarConta(tx: Tx, p: Pagante): Promise<ContaIA> {
  await tx
    .insert(iaContas)
    .values({ titularTipo: p.tipo, titularId: p.id })
    .onConflictDoNothing();
  const [c] = await tx.select().from(iaContas).where(daConta(p)).for("update");
  return {
    franquia: c.franquiaMilicreditos,
    avulso: c.avulsoMilicreditos,
    cicloAte: c.cicloAte,
  };
}

/**
 * Lança no livro e aplica na conta — só se a linha do livro entrou. Devolve
 * se entrou (chave repetida é o mesmo evento chegando de novo).
 */
async function lancar(
  tx: Tx,
  p: Pagante,
  l: {
    franquia: number;
    avulso: number;
    motivo: string;
    chave: string;
    descricao: string;
    cicloAte?: Date | null;
  },
): Promise<boolean> {
  const [entrou] = await tx
    .insert(iaLancamentos)
    .values({
      titularTipo: p.tipo,
      titularId: p.id,
      franquiaMilicreditos: l.franquia,
      avulsoMilicreditos: l.avulso,
      motivo: l.motivo,
      chave: l.chave,
      descricao: l.descricao,
    })
    .onConflictDoNothing({ target: iaLancamentos.chave })
    .returning({ id: iaLancamentos.id });
  if (!entrou) return false;
  await tx
    .update(iaContas)
    .set({
      franquiaMilicreditos: sql`${iaContas.franquiaMilicreditos} + ${l.franquia}`,
      avulsoMilicreditos: sql`${iaContas.avulsoMilicreditos} + ${l.avulso}`,
      ...(l.cicloAte !== undefined ? { cicloAte: l.cicloAte } : {}),
      atualizadaEm: new Date(),
    })
    .where(daConta(p));
  return true;
}

/** Com o ciclo vencido, a franquia que sobrou sai pelo livro (uma vez por ciclo). */
async function vencerFranquia(
  tx: Tx,
  p: Pagante,
  conta: ContaIA,
  agora: Date,
): Promise<ContaIA> {
  if (cicloAtivo(conta, agora) || conta.franquia === 0 || !conta.cicloAte)
    return conta;
  await lancar(tx, p, {
    franquia: -conta.franquia,
    avulso: 0,
    motivo: "vencimento",
    chave: `vencimento:${p.tipo}:${p.id}:${conta.cicloAte.toISOString()}`,
    descricao: "Franquia do ciclo vencida",
  });
  return { ...conta, franquia: 0 };
}

/**
 * Antes de falar com o Chatbase: a assinatura está ativa e há saldo? Sem isso,
 * 402 e nada sai para a IA. O custo só é sabido depois, então duas mensagens
 * ao mesmo tempo com o último crédito podem deixar o avulso negativo — é a
 * dívida de uma janela, limitada pelo `hit` da conversa.
 */
export async function exigirSaldo(p: Pagante): Promise<void> {
  const problema = problemaNoSaldo(await lerConta(db, p), new Date());
  if (problema) throw new CobrancaIAError(problema, 402);
}

/**
 * Debita uma mensagem, na transação que grava o uso: franquia primeiro, depois
 * o avulso. A chave é a da mensagem: repetir não debita de novo. Uso sem
 * medida (`null`) não debita — o log já avisou.
 */
export async function debitarUso(
  tx: Tx,
  p: Pagante,
  mensagemId: string,
  milicreditos: number | null,
): Promise<void> {
  if (milicreditos === null || milicreditos <= 0) return;
  const agora = new Date();
  const conta = await vencerFranquia(tx, p, await travarConta(tx, p), agora);
  const d = debitar(conta, milicreditos, agora);
  await lancar(tx, p, {
    franquia: -d.daFranquia,
    avulso: -d.doAvulso,
    motivo: "uso",
    chave: `uso:${mensagemId}`,
    descricao: "Mensagem do assistente",
  });
}

function publico(r: typeof iaPagamentos.$inferSelect): PagamentoIAPublico {
  return {
    codigo: r.codigo,
    tipo: r.tipo === "avulso" ? "avulso" : "assinatura",
    valorCents: r.valorCents,
    creditos: creditosParaTela(r.milicreditos),
    status: r.status === "paga" ? "paga" : "pendente",
    pixQr: r.pixQr,
    pixCopyPaste: r.pixCopyPaste,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  };
}

/** O plano como a coluna mostra: situação, saldo, preços e o Pix em aberto. */
export async function resumoDaCobranca(
  p: Pagante | null,
  cfg: ConfigCobrancaIA,
): Promise<ResumoCobrancaIA> {
  const preco = {
    assinaturaCents: cfg.assinaturaCents,
    franquiaCreditos: cfg.franquiaCreditos,
    pacotes: cfg.pacotes,
  };
  const provider = await activePaymentProvider().catch(() => null);
  const exigeDoc = provider
    ? EXIGE_CPF[provider.name as ProvedorPix] === true
    : false;
  if (!p) {
    return {
      cobrado: false,
      ativa: true,
      cicloAte: null,
      franquiaCreditos: 0,
      avulsoCreditos: 0,
      preco,
      pendente: null,
      pedeDocumento: false,
    };
  }
  const agora = new Date();
  const conta = await lerConta(db, p);
  const [pendente] = await db
    .select()
    .from(iaPagamentos)
    .where(
      and(
        eq(iaPagamentos.titularTipo, p.tipo),
        eq(iaPagamentos.titularId, p.id),
        eq(iaPagamentos.status, "pendente"),
        gt(iaPagamentos.expiresAt, agora),
        sql`${iaPagamentos.chargeId} IS NOT NULL`,
      ),
    )
    .orderBy(desc(iaPagamentos.createdAt))
    .limit(1);
  let pedeDocumento = exigeDoc;
  if (exigeDoc && p.tipo === "organizacao") {
    // A organização paga com o CNPJ cadastrado; só pede se faltar.
    const [o] = await db
      .select({ cnpj: organizations.cnpj })
      .from(organizations)
      .where(eq(organizations.id, p.id));
    pedeDocumento = documentoDoPagador(o?.cnpj ?? "") === null;
  }
  return {
    cobrado: true,
    ativa: cicloAtivo(conta, agora),
    cicloAte: conta.cicloAte ? conta.cicloAte.toISOString() : null,
    franquiaCreditos: creditosParaTela(franquiaValida(conta, agora)),
    avulsoCreditos: creditosParaTela(conta.avulso),
    preco,
    pendente: pendente ? publico(pendente) : null,
    pedeDocumento,
  };
}

/** Pix por pessoa, na janela: gerar cobrança tem custo no provedor. */
export const IA_PIX_POR_HORA = 10;

/**
 * Gera o Pix da assinatura ou de um pacote. O valor e os créditos saem da
 * tabela da plataforma — o navegador só diz o tipo e qual pacote. Pacote só
 * com a assinatura ativa. O mesmo Pix ainda em aberto é devolvido em vez de
 * gerar outro.
 */
export async function pedirPagamento(
  p: Pagante,
  userId: string,
  cfg: ConfigCobrancaIA,
  corpo: { tipo?: unknown; pacote?: unknown; documento?: unknown },
): Promise<PagamentoIAPublico> {
  if (!cobrancaPronta(cfg))
    throw new CobrancaIAError(
      "A assinatura do assistente ainda não tem preço. Fale com o suporte.",
      409,
    );
  const tipo =
    corpo.tipo === "avulso"
      ? "avulso"
      : corpo.tipo === "assinatura"
        ? "assinatura"
        : null;
  if (!tipo) throw new CobrancaIAError("Escolha a assinatura ou um pacote.");
  let valorCents: number;
  let milicreditos: number;
  let descricao: string;
  if (tipo === "assinatura") {
    valorCents = cfg.assinaturaCents;
    milicreditos = emMilicreditos(cfg.franquiaCreditos);
    descricao = "Assinatura do assistente (30 dias)";
  } else {
    const i = corpo.pacote;
    if (
      typeof i !== "number" ||
      !Number.isInteger(i) ||
      i < 0 ||
      i >= cfg.pacotes.length
    ) {
      throw new CobrancaIAError("Pacote não encontrado.");
    }
    if (!cicloAtivo(await lerConta(db, p), new Date())) {
      throw new CobrancaIAError(
        "Assine o assistente antes de comprar créditos avulsos.",
        409,
      );
    }
    valorCents = cfg.pacotes[i].precoCents;
    milicreditos = emMilicreditos(cfg.pacotes[i].creditos);
    descricao = `Pacote de ${cfg.pacotes[i].creditos} créditos do assistente`;
  }

  const limite = await hit(`ia-pix:${userId}`, 60, IA_PIX_POR_HORA);
  if (limite.excedeu)
    throw new CobrancaIAError(
      "Muitos Pix pedidos em pouco tempo. Espere um pouco.",
      429,
    );

  const [u] = await db
    .select({ nome: users.name, phone: users.phone })
    .from(users)
    .where(eq(users.id, userId));
  let nome = u?.nome ?? "Assinante";
  let documento: string | null = documentoDoPagador(corpo.documento);
  if (p.tipo === "organizacao") {
    const [o] = await db
      .select({ nome: organizations.name, cnpj: organizations.cnpj })
      .from(organizations)
      .where(eq(organizations.id, p.id));
    nome = o?.nome ?? nome;
    documento = documentoDoPagador(o?.cnpj ?? "") ?? documento;
  }
  const provider = await activePaymentProvider();
  if (EXIGE_CPF[provider.name as ProvedorPix] && !documento) {
    throw new CobrancaIAError(
      "Informe o CPF ou o CNPJ de quem paga para gerar o Pix.",
    );
  }

  const agora = new Date();
  const expiresAt = new Date(agora.getTime() + IA_PIX_MINUTOS * 60_000);
  // Reaproveitar o Pix em aberto e criar a linha nova acontecem sob a trava do
  // titular: dois cliques (ou dois organizadores) ao mesmo tempo não geram duas
  // cobranças — o segundo encontra a linha do primeiro.
  const escolha = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ia-pix:${p.tipo}:${p.id}`}))`);
    const [aberto] = await tx
      .select()
      .from(iaPagamentos)
      .where(
        and(
          eq(iaPagamentos.titularTipo, p.tipo),
          eq(iaPagamentos.titularId, p.id),
          eq(iaPagamentos.status, "pendente"),
          eq(iaPagamentos.tipo, tipo),
          eq(iaPagamentos.valorCents, valorCents),
          eq(iaPagamentos.milicreditos, milicreditos),
          gt(iaPagamentos.expiresAt, new Date(agora.getTime() + 5 * 60_000)),
        ),
      )
      .orderBy(desc(iaPagamentos.createdAt))
      .limit(1);
    if (aberto) return { existente: aberto };
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const codigo = randomInt(IA_CODIGO_MIN, IA_CODIGO_MAX);
      const [linha] = await tx
        .insert(iaPagamentos)
        .values({ titularTipo: p.tipo, titularId: p.id, userId, tipo, codigo, valorCents, milicreditos, expiresAt })
        .onConflictDoNothing({ target: iaPagamentos.codigo })
        .returning();
      if (linha) return { nova: linha };
    }
    return {};
  });
  if (escolha.existente) {
    // Ainda sem cobrança: o outro pedido está gerando o Pix agora.
    if (!escolha.existente.chargeId) throw new CobrancaIAError("O Pix está sendo gerado. Tente de novo em instantes.", 409);
    return publico(escolha.existente);
  }
  const linha = escolha.nova;
  if (!linha) throw new CobrancaIAError("Não foi possível gerar o Pix. Tente de novo.", 500);
  let charge;
  try {
    // Chamada externa fora de transação; sem split: o dinheiro é da plataforma.
    charge = await provider.createPixCharge({
      orderCode: linha.codigo,
      amountCents: valorCents,
      description: descricao,
      payer: { name: nome, phone: u?.phone ?? "", cpf: documento ?? undefined },
      expiresAt,
    });
  } catch (err) {
    // O provedor recusou: a linha sem Pix sairia na tela como "esperando o Pix" para sempre.
    await db.delete(iaPagamentos).where(and(eq(iaPagamentos.id, linha.id), sql`${iaPagamentos.chargeId} IS NULL`));
    throw err;
  }
  const [comPix] = await db
    .update(iaPagamentos)
    .set({ provider: charge.provider, chargeId: charge.chargeId, pixQr: charge.qr, pixCopyPaste: charge.copyPaste })
    .where(eq(iaPagamentos.id, linha.id))
    .returning();
  return publico(comPix);
}

/**
 * Webhook "pago": se a cobrança é do assistente, credita (uma vez só) e
 * devolve `true` — o webhook não procura pedido. Pago de novo também é `true`.
 */
export async function confirmarPagamentoIA(chargeId: string): Promise<boolean> {
  const [r] = await db
    .select()
    .from(iaPagamentos)
    .where(eq(iaPagamentos.chargeId, chargeId));
  if (!r) return false;
  const p: Pagante = {
    tipo: r.titularTipo === "afiliado" ? "afiliado" : "organizacao",
    id: r.titularId,
  };
  await db.transaction(async (tx) => {
    const [paga] = await tx
      .update(iaPagamentos)
      .set({ status: "paga", pagaEm: new Date() })
      .where(
        and(eq(iaPagamentos.id, r.id), eq(iaPagamentos.status, "pendente")),
      )
      .returning({ id: iaPagamentos.id });
    if (!paga) return;
    const agora = new Date();
    const conta = await vencerFranquia(tx, p, await travarConta(tx, p), agora);
    if (r.tipo === "assinatura") {
      const nova = cicloDepoisDaAssinatura(conta, r.milicreditos, agora);
      await lancar(tx, p, {
        franquia: nova.franquia - conta.franquia,
        avulso: 0,
        motivo: "assinatura",
        chave: `pagamento:${r.id}`,
        descricao: `Assinatura paga por Pix (${r.codigo})`,
        cicloAte: nova.cicloAte,
      });
    } else {
      // Pacote pago depois de o ciclo vencer (Pix pago no último minuto) vale do mesmo jeito: avulso não vence.
      await lancar(tx, p, {
        franquia: 0,
        avulso: r.milicreditos,
        motivo: "avulso",
        chave: `pagamento:${r.id}`,
        descricao: `Pacote pago por Pix (${r.codigo})`,
      });
    }
  });
  return true;
}

/**
 * Estorno de um Pix do assistente no provedor (contestação, devolução): o
 * pagamento vira `estornada` e os créditos que ele deu saem pelo livro
 * (`estorno:<id>`, franquia primeiro, depois o avulso), com a conta travada.
 * O que já foi gasto vira dívida no avulso — a próxima mensagem é recusada.
 * Devolve `true` se a cobrança era do assistente (o webhook não procura pedido).
 */
export async function estornarPagamentoIA(chargeId: string): Promise<boolean> {
  const [r] = await db.select().from(iaPagamentos).where(eq(iaPagamentos.chargeId, chargeId));
  if (!r) return false;
  const p: Pagante = { tipo: r.titularTipo === "afiliado" ? "afiliado" : "organizacao", id: r.titularId };
  let agiu = false;
  await db.transaction(async (tx) => {
    const [estornada] = await tx
      .update(iaPagamentos)
      .set({ status: "estornada" })
      .where(and(eq(iaPagamentos.id, r.id), eq(iaPagamentos.status, "paga")))
      .returning({ id: iaPagamentos.id });
    if (!estornada) return;
    const agora = new Date();
    const conta = await vencerFranquia(tx, p, await travarConta(tx, p), agora);
    const d = debitar(conta, r.milicreditos, agora);
    await lancar(tx, p, {
      franquia: -d.daFranquia,
      avulso: -d.doAvulso,
      motivo: "estorno",
      chave: `estorno:${r.id}`,
      descricao: `Pix ${r.codigo} estornado no provedor`,
    });
    agiu = true;
  });
  if (agiu) console.warn(`[ia] o Pix ${r.codigo} do assistente foi estornado no provedor; os créditos dele saíram da conta.`);
  return true;
}

/** Relógio: zera a franquia dos ciclos vencidos (pelo livro, uma vez por ciclo). */
export async function vencerFranquias(limite = 500): Promise<number> {
  const agora = new Date();
  const vencidas = await db
    .select({ tipo: iaContas.titularTipo, id: iaContas.titularId })
    .from(iaContas)
    .where(
      and(lte(iaContas.cicloAte, agora), ne(iaContas.franquiaMilicreditos, 0)),
    )
    .limit(limite);
  let n = 0;
  for (const v of vencidas) {
    const p: Pagante = {
      tipo: v.tipo === "afiliado" ? "afiliado" : "organizacao",
      id: v.id,
    };
    await db.transaction(async (tx) => {
      const conta = await travarConta(tx, p);
      const depois = await vencerFranquia(tx, p, conta, new Date());
      if (depois.franquia !== conta.franquia) n++;
    });
  }
  return n;
}

/* ---------------- ajuste da plataforma, relatório e extrato ---------------- */

/** Quem pediu o ajuste ou o relatório: só a plataforma (a rota confere o papel). */
export interface Autor {
  id: string;
  role: string;
  ip?: string;
}

/**
 * O titular pelo identificador público: o endereço da organização ou o código
 * do afiliado. Não existe? 404 — o identificador veio do formulário.
 */
async function titularPeloIdentificador(tipo: "organizacao" | "afiliado", ident: string): Promise<{ pagante: Pagante; nome: string }> {
  if (tipo === "organizacao") {
    const [o] = await db
      .select({ id: organizations.id, nome: organizations.name })
      .from(organizations)
      .where(eq(organizations.slug, ident.toLowerCase()));
    if (!o) throw new CobrancaIAError("Organização não encontrada por esse endereço.", 404);
    return { pagante: { tipo, id: o.id }, nome: o.nome };
  }
  const [a] = await db
    .select({ id: affiliates.id, code: affiliates.code })
    .from(affiliates)
    .where(sql`upper(${affiliates.code}) = upper(${ident})`);
  if (!a) throw new CobrancaIAError("Afiliado não encontrado por esse código.", 404);
  return { pagante: { tipo, id: a.id }, nome: a.code };
}

/**
 * Ajuste de crédito pela plataforma (cortesia ou correção). Entra no avulso,
 * que não vence; a correção para menos nunca deixa o avulso negativo. Livro,
 * conta travada e auditoria na mesma transação, e a chave (`ajuste:<id da
 * tela>`) faz do mesmo ajuste enviado duas vezes um lançamento só.
 */
export async function ajustarCreditosIA(
  autor: Autor,
  corpo: unknown,
): Promise<{ repetido: boolean; conta: { franquiaCreditos: number; avulsoCreditos: number; cicloAte: string | null } }> {
  const v = validarAjusteIA(corpo);
  if (!v.ok) throw new CobrancaIAError(v.erro, 400);
  const a = v.valor;
  const { pagante: p, nome } = await titularPeloIdentificador(a.titularTipo, a.titular);
  const mili = emMilicreditos(a.creditos);
  let repetido = false;
  const conta = await db.transaction(async (tx) => {
    const agora = new Date();
    const atual = await vencerFranquia(tx, p, await travarConta(tx, p), agora);
    // O mesmo ajuste chegando de novo (dois cliques) não é conferido de novo: com a conta travada,
    // a linha do primeiro já está no livro, e quem decide é a chave única.
    const [ja] = await tx
      .select({ titularTipo: iaLancamentos.titularTipo, titularId: iaLancamentos.titularId, avulso: iaLancamentos.avulsoMilicreditos })
      .from(iaLancamentos)
      .where(eq(iaLancamentos.chave, `ajuste:${a.idempotencia}`));
    if (ja) {
      // A identificação é de um ajuste só: em outra conta ou com outro valor, não é repetição — é engano.
      if (ja.titularTipo !== p.tipo || ja.titularId !== p.id || ja.avulso !== mili) {
        throw new CobrancaIAError("Essa identificação já foi usada em outro ajuste. Recarregue a tela e lance de novo.", 409);
      }
      repetido = true;
      return lerConta(tx, p);
    }
    const problema = problemaNoAjuste(atual, mili);
    if (problema) throw new CobrancaIAError(problema, 409);
    const entrou = await lancar(tx, p, {
      franquia: 0,
      avulso: mili,
      motivo: "ajuste",
      chave: `ajuste:${a.idempotencia}`,
      descricao: `Ajuste da plataforma (${a.creditos > 0 ? "cortesia" : "correção"}): ${a.motivo}`,
    });
    repetido = !entrou;
    if (entrou) {
      // A auditoria anda com o lançamento: rollback de um leva o outro.
      await tx.insert(auditLog).values({
        actorId: autor.id,
        actorRole: autor.role,
        action: "ia.ajuste",
        entity: a.titularTipo,
        entityId: p.id,
        diff: { titular: nome, creditos: a.creditos, motivo: a.motivo, chave: a.idempotencia } as never,
        ip: autor.ip,
      });
    }
    return lerConta(tx, p);
  });
  return {
    repetido,
    conta: {
      franquiaCreditos: creditosParaTela(franquiaValida(conta, new Date())),
      avulsoCreditos: creditosParaTela(conta.avulso),
      cicloAte: conta.cicloAte ? conta.cicloAte.toISOString() : null,
    },
  };
}

/** As contas que o relatório mostra (as de mais receita e uso); passou disso, ele diz que cortou. */
export const LINHAS_DO_RELATORIO = 200;

const iso = (v: unknown) =>
  v instanceof Date ? v.toISOString() : v ? new Date(`${String(v).replace(" ", "T")}Z`).toISOString() : null;
const num = (v: unknown) => Number(v ?? 0);

/**
 * Uso e receita do assistente no período, por quem paga: mensagens, créditos
 * consumidos (em milésimos somados, arredondados só na tela), Pix pagos e o
 * saldo de agora. Só nome público da organização ou código do afiliado —
 * nunca dado de pessoa. O uso do master entra à parte, como custo.
 */
export async function relatorioDaIA(diasBrutos: unknown): Promise<RelatorioIA> {
  const dias = periodoDoRelatorio(diasBrutos);
  // `created_at` e `paga_em` guardam UTC sem fuso: a comparação também é em UTC.
  const desde = sql`((now() AT TIME ZONE 'UTC') - (${dias} || ' days')::interval)`;
  const r = await db.execute(sql`
    WITH uso AS (
      SELECT titular_tipo, titular_id, COUNT(*) AS mensagens,
             COUNT(*) FILTER (WHERE milicreditos IS NULL) AS sem_medida,
             COALESCE(SUM(milicreditos), 0) AS mili
      FROM ia_uso WHERE created_at >= ${desde} AND titular_id IS NOT NULL
      GROUP BY 1, 2
    ),
    rec AS (
      SELECT titular_tipo, titular_id, COALESCE(SUM(valor_cents), 0) AS receita, COUNT(*) AS pix
      FROM ia_pagamentos WHERE status = 'paga' AND paga_em >= ${desde}
      GROUP BY 1, 2
    ),
    chaves AS (
      SELECT titular_tipo, titular_id FROM uso
      UNION SELECT titular_tipo, titular_id FROM rec
      UNION SELECT titular_tipo, titular_id FROM ia_contas
    )
    SELECT k.titular_tipo, k.titular_id,
           COALESCE(u.mensagens, 0) AS mensagens, COALESCE(u.sem_medida, 0) AS sem_medida, COALESCE(u.mili, 0) AS mili,
           COALESCE(r.receita, 0) AS receita, COALESCE(r.pix, 0) AS pix,
           c.franquia_milicreditos, c.avulso_milicreditos, c.ciclo_ate,
           o.slug AS org_slug, o.name AS org_nome, a.code AS af_code
    FROM chaves k
    LEFT JOIN uso u ON u.titular_tipo = k.titular_tipo AND u.titular_id = k.titular_id
    LEFT JOIN rec r ON r.titular_tipo = k.titular_tipo AND r.titular_id = k.titular_id
    LEFT JOIN ia_contas c ON c.titular_tipo = k.titular_tipo AND c.titular_id = k.titular_id
    LEFT JOIN organizations o ON k.titular_tipo = 'organizacao' AND o.id = k.titular_id
    LEFT JOIN affiliates a ON k.titular_tipo = 'afiliado' AND a.id = k.titular_id
    ORDER BY COALESCE(r.receita, 0) DESC, COALESCE(u.mili, 0) DESC
    LIMIT ${LINHAS_DO_RELATORIO + 1}
  `);
  // Uma passada em cada tabela (pelo índice da data), com os filtros dentro da soma.
  const tot = await db.execute(sql`
    SELECT p.receita, p.pix, p.estornados, u.mensagens, u.sem_medida, u.mili, u.mili_plataforma,
           (SELECT COUNT(*) FROM ia_contas WHERE ciclo_ate > (now() AT TIME ZONE 'UTC')) AS ativas
    FROM (
      SELECT COALESCE(SUM(valor_cents) FILTER (WHERE status = 'paga'), 0) AS receita,
             COUNT(*) FILTER (WHERE status = 'paga') AS pix,
             COALESCE(SUM(valor_cents) FILTER (WHERE status = 'estornada'), 0) AS estornados
      FROM ia_pagamentos WHERE paga_em >= ${desde}
    ) p, (
      SELECT COUNT(*) AS mensagens,
             COUNT(*) FILTER (WHERE milicreditos IS NULL) AS sem_medida,
             COALESCE(SUM(milicreditos), 0) AS mili,
             COALESCE(SUM(milicreditos) FILTER (WHERE titular_tipo = 'plataforma'), 0) AS mili_plataforma
      FROM ia_uso WHERE created_at >= ${desde}
    ) u
  `);
  const agora = new Date();
  const linhas: LinhaDoRelatorioIA[] = (r.rows as Record<string, unknown>[])
    .map((x) => {
      const tipo = x.titular_tipo === "afiliado" ? "afiliado" : "organizacao";
      const titular = String((tipo === "afiliado" ? x.af_code : x.org_slug) ?? "");
      const cicloAte = iso(x.ciclo_ate);
      const conta: ContaIA = {
        franquia: num(x.franquia_milicreditos),
        avulso: num(x.avulso_milicreditos),
        cicloAte: cicloAte ? new Date(cicloAte) : null,
      };
      return {
        titularTipo: tipo,
        titular,
        nome: String((tipo === "afiliado" ? x.af_code : x.org_nome) ?? "—"),
        mensagens: num(x.mensagens),
        semMedida: num(x.sem_medida),
        creditosUsados: creditosParaTela(num(x.mili)),
        receitaCents: num(x.receita),
        pixPagos: num(x.pix),
        ativa: cicloAtivo(conta, agora),
        cicloAte,
        franquiaCreditos: creditosParaTela(franquiaValida(conta, agora)),
        avulsoCreditos: creditosParaTela(conta.avulso),
      } satisfies LinhaDoRelatorioIA;
    })
    // Titular apagado (organização ou afiliado que não existe mais) não tem como ser ajustado nem lido.
    .filter((l) => l.titular !== "");
  const t = (tot.rows[0] ?? {}) as Record<string, unknown>;
  // Pediu uma linha a mais só para saber se a lista foi cortada (sem COUNT de tudo).
  const cortada = linhas.length > LINHAS_DO_RELATORIO;
  return {
    dias,
    cortada,
    totais: {
      receitaCents: num(t.receita),
      pixPagos: num(t.pix),
      estornadosCents: num(t.estornados),
      mensagens: num(t.mensagens),
      semMedida: num(t.sem_medida),
      creditosUsados: creditosParaTela(num(t.mili)),
      creditosDaPlataforma: creditosParaTela(num(t.mili_plataforma)),
      contasAtivas: num(t.ativas),
    },
    linhas: linhas.slice(0, LINHAS_DO_RELATORIO),
  };
}

/** O livro de uma conta (os 50 lançamentos mais novos), pelo identificador público. */
export async function extratoDaIA(tipoBruto: unknown, identBruto: unknown): Promise<{ nome: string; lancamentos: LancamentoIAPublico[] }> {
  const tipo = tipoBruto === "afiliado" ? "afiliado" : tipoBruto === "organizacao" ? "organizacao" : null;
  const ident = typeof identBruto === "string" ? identBruto.trim() : "";
  if (!tipo || !/^[A-Za-z0-9_-]{2,64}$/.test(ident)) throw new CobrancaIAError("Informe a organização ou o afiliado.", 400);
  const { pagante: p, nome } = await titularPeloIdentificador(tipo, ident);
  const linhas = await db
    .select()
    .from(iaLancamentos)
    .where(and(eq(iaLancamentos.titularTipo, p.tipo), eq(iaLancamentos.titularId, p.id)))
    .orderBy(desc(iaLancamentos.createdAt), desc(iaLancamentos.id))
    .limit(50);
  return {
    nome,
    lancamentos: linhas.map((l) => ({
      motivo: l.motivo,
      franquiaCreditos: creditosParaTela(l.franquiaMilicreditos),
      avulsoCreditos: creditosParaTela(l.avulsoMilicreditos),
      descricao: l.descricao,
      criadoEm: l.createdAt.toISOString(),
    })),
  };
}
