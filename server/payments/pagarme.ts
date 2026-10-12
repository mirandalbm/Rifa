/**
 * Pagar.me (API v5) — cobrança Pix, webhook, estorno e cancelamento.
 *
 * Fase 1 do gateway (`docs/PLANO-GATEWAY-PAGARME.md`): **sem split, sempre**.
 * A plataforma recebe o Pix inteiro; o parâmetro `split` é ignorado (como no
 * Mercado Pago) e o Pix nunca diz `splitAplicado` — a taxa segue devida no
 * livro, e o repasse à promotora é outra fase.
 *
 * As regras de segurança são as do Asaas e do Mercado Pago:
 *
 * 1. **O status vem sempre da consulta à API** (`GET /charges/{id}`), nunca
 *    do corpo do webhook, que qualquer um poderia forjar.
 * 2. **A autenticação do webhook não está documentada** pelo Pagar.me. O
 *    segredo vai no endereço cadastrado no painel dele
 *    (`/api/webhooks/pagarme?t=<PAGARME_WEBHOOK_TOKEN>`), conferido em tempo
 *    constante; sem ele ou errado, 401.
 * 3. **A chave secreta só no cabeçalho** (Basic), nunca em URL, log,
 *    resposta ou erro. O endereço da API só muda fora de produção
 *    (`PAGARME_API_URL`, para a prova), como `baseDoMeta()`.
 *
 * E uma regra só deste provedor: **cancelar um Pix não pago é a mesma rota
 * do estorno** (`DELETE /charges/{id}`). Por isso `cancelCharge` consulta a
 * cobrança antes e só cancela a que está pendente — a paga fica como está (o
 * Pix pago tarde segue para a fila do Pix tardio). O relógio da reserva
 * vencida nunca estorna por engano.
 *
 * O que não teve fonte oficial (Context7, cópia do `docs.pagar.me`, em
 * 12/10/2026) está marcado **a confirmar** onde é usado.
 */
import { timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { ACAO_CONTESTACAO_A_CONFERIR, type PaymentProvider, type PixCharge, type WebhookResult } from "./provider";
import { cnpjValido, cpfValido, emailValido } from "@shared/format";

export const PAGARME_PADRAO = "https://api.pagar.me/core/v5";

/** Prazo de cada chamada ao Pagar.me. */
export const PRAZO_DO_PAGARME_MS = 10_000;

/* ------------------------------------------------------------------ *
 * Funções puras — testáveis sem rede
 * ------------------------------------------------------------------ */

/** O endereço da API: o de produção sempre em produção; fora dela, `PAGARME_API_URL` (a prova). */
export function baseDoPagarme(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV === "production") return PAGARME_PADRAO;
  return env.PAGARME_API_URL?.trim().replace(/\/+$/, "") || PAGARME_PADRAO;
}

/** Basic com a chave secreta como usuário e senha vazia. */
export function autorizacaoBasic(chave: string): string {
  return `Basic ${Buffer.from(`${chave}:`).toString("base64")}`;
}

/** Confere o segredo do endereço do webhook sem vazar tempo de comparação. */
export function segredoConfere(recebido: unknown, esperado: string): boolean {
  if (typeof recebido !== "string" || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Id de cobrança no formato do Pagar.me (`ch_…`): vai no caminho das nossas chamadas. */
export function idDeCobrancaValido(id: unknown): id is string {
  return typeof id === "string" && /^ch_[A-Za-z0-9]{1,64}$/.test(id);
}

/** Id do evento do webhook (`hook_…`): a chave da idempotência em `webhook_events`. */
export function idDeEventoValido(id: unknown): id is string {
  return typeof id === "string" && /^hook_[A-Za-z0-9]{1,64}$/.test(id);
}

export interface TelefoneDoPagarme {
  country_code: "55";
  area_code: string;
  number: string;
}

/**
 * Telefone brasileiro no formato do Pagar.me: DDD de 2 algarismos (11 a 99,
 * sem zero) e número de 8 (fixo) ou 9 (celular, começando por 9). Aceita o
 * 55 na frente. Fora disso, `null`.
 */
export function telefoneDoPagarme(entrada: string): TelefoneDoPagarme | null {
  let d = String(entrada ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = d.slice(0, 2);
  const numero = d.slice(2);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  if (numero.length === 9 && !numero.startsWith("9")) return null;
  if (/^(\d)\1+$/.test(numero)) return null;
  return { country_code: "55", area_code: ddd, number: numero };
}

/** CPF (pessoa) ou CNPJ (empresa) com os dígitos conferidos; fora disso, `null`. */
export function documentoDoPagarme(entrada: string | undefined): { document: string; type: "individual" | "company" } | null {
  const d = String(entrada ?? "").replace(/\D/g, "");
  if (d.length === 11 && cpfValido(d)) return { document: d, type: "individual" };
  if (d.length === 14 && cnpjValido(d)) return { document: d, type: "company" };
  return null;
}

/**
 * O instante de vencimento do QR no formato que a documentação mostra
 * (`YYYY-MM-DDThh:mm:ss`, em UTC). **A confirmar**: se a API aceita (ou
 * exige) o `Z` no fim; aqui vai sem, como no texto da documentação.
 */
export function venceEmDoPagarme(expiresAt: Date): string {
  return expiresAt.toISOString().slice(0, 19);
}

/**
 * O maior e-mail que o Pagar.me aceita no cliente. **A confirmar** na
 * documentação do cliente (o limite de 64 é o que lemos como teto dos campos
 * de texto do v5). E-mail maior é recusado antes de reservar — nunca cortado,
 * que mandaria ao banco um endereço que não é o de quem paga.
 */
export const EMAIL_MAX_DO_PAGARME = 64;

/**
 * O que falta em quem paga para o Pagar.me emitir o Pix, conferido **antes
 * de reservar** (pedido e carrinho) e antes de gravar (recarga e assistente):
 * o e-mail no formato e no tamanho, e o telefone com DDD no formato dele.
 * O documento segue pela régua do CPF de sempre (`EXIGE_CPF`). `null` = ok.
 */
export function problemaNoPagadorDoPagarme(p: { email?: string | null; phone?: string | null }): string | null {
  const email = String(p.email ?? "").trim();
  if (!emailValido(email)) return "Informe um e-mail válido de quem paga: ele é exigido para gerar o Pix.";
  if (email.length > EMAIL_MAX_DO_PAGARME) return `O e-mail de quem paga pode ter até ${EMAIL_MAX_DO_PAGARME} letras para gerar o Pix. Use outro e-mail.`;
  if (!telefoneDoPagarme(String(p.phone ?? ""))) return "Informe um WhatsApp com DDD válido de quem paga: ele é exigido para gerar o Pix.";
  return null;
}

export class ErroDoPagarme extends Error {
  /** A chamada saiu e não houve resposta (rede caiu, prazo): o Pagar.me pode ter feito. */
  semResposta = false;
  /** O código HTTP da resposta de erro do Pagar.me, quando houve resposta. */
  httpStatus?: number;
  /**
   * O pedido de devolução já tinha saído quando o erro aconteceu (sem
   * resposta, erro 5xx de lá, ou a resposta não confere o valor): o dinheiro
   * pode ter voltado. Quem chama **não** trata como recusa — não devolve de
   * novo e pede conferência no painel do Pagar.me (`executarEstorno`).
   */
  depoisDeChamar = false;
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErroDoPagarme";
  }
}

/** O erro com a marca de "depois de chamar" (ver `ErroDoPagarme.depoisDeChamar`). */
function depoisDeChamar(err: ErroDoPagarme): ErroDoPagarme {
  err.depoisDeChamar = true;
  return err;
}

/**
 * A consulta ao Pagar.me no webhook não respondeu (rede, prazo), respondeu
 * erro do lado de lá (5xx) ou pediu para esperar (429): o webhook responde
 * 503 com `Retry-After`, para o Pagar.me reenviar — um 400 ali podia
 * encerrar os reenvios de um pagamento.
 */
export function consultaIndisponivel(err: unknown): boolean {
  if (!(err instanceof ErroDoPagarme)) return false;
  // 429: o Pagar.me pediu para esperar — também é "tente de novo".
  return err.semResposta || (err.httpStatus !== undefined && (err.httpStatus >= 500 || err.httpStatus === 429));
}

export interface DadosDoPix {
  orderCode: number;
  amountCents: number;
  description: string;
  payer: { name: string; phone: string; cpf?: string; email?: string };
  expiresAt: Date;
}

/**
 * O corpo do `POST /orders`: um item com o valor inteiro (centavos), o
 * cliente com os quatro dados que o Pix do Pagar.me exige e o pagamento Pix
 * com o vencimento da reserva. **Nunca `split`**: a fase 1 não divide.
 * Faltando ou errado um dado do cliente, recusa aqui (400) — nada sai.
 */
export function corpoDoPedidoPagarme(p: DadosDoPix) {
  const valor = Math.round(p.amountCents);
  if (!Number.isInteger(valor) || valor <= 0) throw new ErroDoPagarme("Valor do Pix inválido.");
  const nome = String(p.payer.name ?? "").trim();
  if (nome.length < 2) throw new ErroDoPagarme("Informe o nome de quem paga para gerar o Pix.", 400);
  const email = String(p.payer.email ?? "").trim();
  if (!emailValido(email)) throw new ErroDoPagarme("Informe um e-mail válido de quem paga: ele é exigido para gerar o Pix.", 400);
  if (email.length > EMAIL_MAX_DO_PAGARME) {
    throw new ErroDoPagarme(`O e-mail de quem paga pode ter até ${EMAIL_MAX_DO_PAGARME} letras para gerar o Pix.`, 400);
  }
  const documento = documentoDoPagarme(p.payer.cpf);
  if (!documento) throw new ErroDoPagarme("Informe um CPF (ou CNPJ) válido de quem paga: ele é exigido para gerar o Pix.", 400);
  const telefone = telefoneDoPagarme(p.payer.phone);
  if (!telefone) throw new ErroDoPagarme("Informe um telefone com DDD de quem paga: ele é exigido para gerar o Pix.", 400);
  const codigo = String(p.orderCode);
  return {
    // O código do pedido no pedido do Pagar.me e no metadata: é por ele que
    // se acha a cobrança no painel de lá. **A confirmar**: o limite de
    // tamanho do `code` (o nosso tem de 8 a 10 algarismos).
    code: codigo,
    items: [
      {
        amount: valor,
        description: p.description.slice(0, 250),
        quantity: 1,
        code: codigo,
      },
    ],
    customer: {
      name: nome.slice(0, 64),
      email,
      type: documento.type,
      document: documento.document,
      // **A confirmar**: `mobile_phone` (a documentação do Pix mostra
      // `home_phone`; os dois existem no objeto `phones`).
      phones: { mobile_phone: telefone },
    },
    payments: [
      {
        payment_method: "pix",
        pix: { expires_at: venceEmDoPagarme(p.expiresAt) },
      },
    ],
    metadata: { pedido: codigo },
  };
}

interface CobrancaDoPagarme {
  id?: unknown;
  status?: unknown;
  amount?: unknown;
  paid_amount?: unknown;
  canceled_amount?: unknown;
  payment_method?: unknown;
  last_transaction?: {
    status?: unknown;
    qr_code?: unknown;
    qr_code_url?: unknown;
    expires_at?: unknown;
  } | null;
}

/**
 * Lê a resposta do `POST /orders`: a cobrança Pix (o id `ch_…`, nunca o do
 * pedido `or_…`), o copia e cola e o vencimento. Transação em falha, sem
 * cobrança ou sem código é erro — nunca um Pix sem QR na tela.
 * **A confirmar**: os nomes `last_transaction.qr_code` e `expires_at` na
 * resposta (a documentação lida não traz o exemplo da resposta do Pix).
 */
export function lerPedidoPagarme(json: unknown, vencimentoPedido: Date): { chargeId: string; copyPaste: string; expiresAt: Date } {
  const corpo = (json ?? {}) as { charges?: unknown };
  const cobrancas = Array.isArray(corpo.charges) ? (corpo.charges as CobrancaDoPagarme[]) : [];
  const pix = cobrancas.find((c) => c && (c.payment_method === "pix" || c.payment_method === undefined)) ?? null;
  if (!pix || !idDeCobrancaValido(pix.id)) throw new ErroDoPagarme("O Pagar.me não devolveu a cobrança do Pix.");
  const t = pix.last_transaction ?? {};
  if (pix.status === "failed" || t.status === "failed" || t.status === "with_error") {
    throw new ErroDoPagarme("O Pagar.me recusou o Pix.");
  }
  if (typeof t.qr_code !== "string" || t.qr_code.length < 20) throw new ErroDoPagarme("O Pagar.me não devolveu o código Pix.");
  let expiresAt = vencimentoPedido;
  if (typeof t.expires_at === "string") {
    const lida = new Date(t.expires_at);
    // O QR vence com a reserva: a data de lá só vale se for antes da nossa.
    if (Number.isFinite(lida.getTime()) && lida.getTime() < vencimentoPedido.getTime()) expiresAt = lida;
  }
  return { chargeId: pix.id, copyPaste: t.qr_code, expiresAt };
}

/** A cobrança lida pela API, só no que importa. */
export function lerCobrancaPagarme(json: unknown): { id: string; status: string; amountCents: number; pagoCents: number | null; canceladoCents: number } {
  const c = (json ?? {}) as CobrancaDoPagarme;
  if (!idDeCobrancaValido(c.id)) throw new ErroDoPagarme("Resposta do Pagar.me sem cobrança.");
  const inteiro = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  return {
    id: c.id,
    status: typeof c.status === "string" ? c.status : "",
    amountCents: inteiro(c.amount) ?? 0,
    pagoCents: inteiro(c.paid_amount),
    canceladoCents: inteiro(c.canceled_amount) ?? 0,
  };
}

/**
 * Estornada inteira? `refunded` ou `canceled` **com** o cancelado
 * (`canceled_amount`) cobrindo o pago. Sem o valor cancelado, na dúvida,
 * não: desfazer um carrinho inteiro por um campo que faltou devolveria cota
 * de quem não recebeu dinheiro de volta. **A confirmar** com o Pagar.me: qual
 * dos dois status a cobrança Pix paga mostra depois do estorno total, e se
 * `canceled_amount` vem preenchido. A devolução parcial nunca vale como
 * estorno inteiro: ela é sempre nossa, pelo chamado.
 */
export function estornadaInteira(c: { status: string; amountCents: number; pagoCents: number | null; canceladoCents: number }): boolean {
  if (c.status !== "refunded" && c.status !== "canceled") return false;
  return c.canceladoCents > 0 && c.canceladoCents >= (c.pagoCents ?? c.amountCents);
}

/**
 * Contestação (MED, chargeback) cobrindo o pago? A mesma régua do estorno:
 * o valor contestado/cancelado (`canceled_amount`) tem de cobrir o pago.
 * **A confirmar**: em que campo o Pagar.me põe o valor contestado.
 */
export function contestacaoInteira(c: { status: string; amountCents: number; pagoCents: number | null; canceladoCents: number }): boolean {
  return c.status === "chargedback" && c.canceladoCents > 0 && c.canceladoCents >= (c.pagoCents ?? c.amountCents);
}

/** Status da cobrança que ainda pode virar pago: o evento "pago" chegou antes da API. */
export const STATUS_AINDA_PENDENTE = ["pending", "processing"] as const;

/**
 * Status em que o dinheiro entrou: `paid` e `overpaid` (pagou pelo menos o
 * valor). `underpaid` (pagou a menos) **não** paga: vai ao log e é ignorado.
 * **A confirmar**: no Pix o valor é fixo no QR, e não sabemos se o Pagar.me
 * chega a marcar `overpaid`/`underpaid` numa cobrança Pix.
 */
export const STATUS_PAGO = ["paid", "overpaid"] as const;

/** Os eventos que dizem "entrou dinheiro". `charge.underpaid` fica de fora: só log. */
export const EVENTOS_DE_PAGAMENTO = ["charge.paid", "charge.overpaid"] as const;

/**
 * Os eventos que dizem "o dinheiro voltou": o estorno e a contestação (MED,
 * chargeback). **A confirmar**: o nome `charge.chargedback` (a documentação
 * diz que ele dá lugar a `chargeback.received`, cujo corpo traz a
 * contestação, não a cobrança) e o status `chargedback` da cobrança.
 */
export const EVENTOS_DE_DEVOLUCAO = ["charge.refunded", "charge.chargedback"] as const;

/**
 * O evento do webhook, depois da consulta à API:
 * - pagamento (`charge.paid`, `charge.overpaid`) só paga com a cobrança
 *   `paid` ou `overpaid`; `null` = a API ainda diz pendente, e a entrega é
 *   recusada (503) para o Pagar.me tentar de novo — nada é pago agora, e o
 *   pagamento de verdade não se perde atrás de um "já visto";
 * - devolução (`charge.refunded`, `charge.chargedback`) só desfaz com a
 *   cobrança `chargedback` (contestação: o dinheiro já saiu) ou estornada
 *   inteira;
 * - todo o resto (inclusive `charge.partial_canceled` e `charge.underpaid`)
 *   é ignorado.
 */
export function eventoDoPagarme(
  tipo: string,
  c: { status: string; amountCents: number; pagoCents: number | null; canceladoCents: number },
): WebhookResult["event"] | null {
  if ((EVENTOS_DE_PAGAMENTO as readonly string[]).includes(tipo)) {
    if ((STATUS_PAGO as readonly string[]).includes(c.status)) return "paid";
    if ((STATUS_AINDA_PENDENTE as readonly string[]).includes(c.status)) return null;
    return "ignored";
  }
  if ((EVENTOS_DE_DEVOLUCAO as readonly string[]).includes(tipo)) {
    // A contestação só desfaz quando o contestado (cancelado) cobre o pago,
    // como o estorno: a parcial vai ao log e espera a conferência à mão.
    if (c.status === "chargedback") return contestacaoInteira(c) ? "refunded" : "ignored";
    return estornadaInteira(c) ? "refunded" : "ignored";
  }
  return "ignored";
}

/**
 * O estorno parcial devolveu exatamente o pedido? `antes` é o cancelado
 * lido antes do `DELETE`; `depois`, o da resposta. Vale também a repetição
 * de uma devolução já feita (a chave de idempotência devolve a mesma
 * resposta: nada novo cancelado, e a transação de estorno com o valor
 * pedido). Qualquer outra coisa — o Pagar.me ignorou o `amount` e devolveu
 * tudo, ou devolveu outro valor — é erro: o chamado volta a aprovado e
 * nada é desfeito aqui. **A confirmar**: `canceled_amount` e
 * `last_transaction.amount` na resposta do `DELETE`.
 */
export function problemaNoEstornoParcial(pedido: number, antes: number, resposta: unknown): string | null {
  const r = (resposta ?? {}) as { canceled_amount?: unknown; last_transaction?: { amount?: unknown } | null };
  const depois = typeof r.canceled_amount === "number" && Number.isInteger(r.canceled_amount) ? r.canceled_amount : null;
  if (depois === null) return "O Pagar.me não confirmou o valor devolvido: confira a cobrança no painel dele.";
  const devolvido = depois - antes;
  if (devolvido === pedido) return null;
  if (devolvido === 0 && r.last_transaction?.amount === pedido) return null;
  return `O Pagar.me devolveu ${devolvido} centavo(s) no lugar de ${pedido}: confira a cobrança no painel dele antes de qualquer coisa.`;
}

/**
 * O que fica guardado do corpo do webhook em `webhook_events`: só o id do
 * evento, o tipo e o id da cobrança. No Pagar.me o `data` traz a cobrança
 * inteira, com o cliente (nome, e-mail, documento, telefone) — dado pessoal
 * que a idempotência não precisa.
 */
export function payloadDoPagarme(raw: string): { id: string | null; type: string | null; data: { id: string | null } } {
  let corpo: { id?: unknown; type?: unknown; data?: { id?: unknown } | null } = {};
  try {
    corpo = JSON.parse(raw || "{}") ?? {};
  } catch {
    corpo = {};
  }
  const texto = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : null);
  return { id: texto(corpo.id), type: texto(corpo.type), data: { id: texto(corpo.data?.id) } };
}

/**
 * A chave de idempotência do estorno: a cobrança, quem devolve (o pedido ou
 * o caso da fila) e o valor — repetir a chamada não devolve duas vezes, e
 * duas devoluções diferentes da mesma cobrança do carrinho não viram uma.
 * **A confirmar**: o nome do cabeçalho de idempotência do v5
 * (`Idempotency-Key`) e por quanto tempo a chave vale; a documentação lida
 * não o traz.
 */
export function chaveDoEstorno(chargeId: string, amountCents?: number, chave?: string): string {
  return `estorno-${chargeId}-${chave ?? "cobranca"}-${amountCents ?? "total"}`.slice(0, 120);
}

/** Mensagem do Pagar.me legível, sem o corpo inteiro (pode trazer dado do cliente). */
export function erroDoPagarme(status: number, corpo: string): string {
  try {
    const e = JSON.parse(corpo) as { message?: unknown };
    if (typeof e.message === "string" && e.message) return `Pagar.me recusou (${status}): ${e.message.slice(0, 200)}`;
  } catch {
    // corpo não-JSON
  }
  return `Pagar.me recusou (${status}).`;
}

/* ------------------------------------------------------------------ *
 * Provedor
 * ------------------------------------------------------------------ */

export class PagarmeProvider implements PaymentProvider {
  readonly name = "pagarme";
  private chave = required("PAGARME_SECRET_KEY");
  private segredoWebhook = required("PAGARME_WEBHOOK_TOKEN");
  private base = baseDoPagarme();

  private async api<T>(caminho: string, init: RequestInit & { idempotencia?: string; dadosDoCliente?: boolean } = {}): Promise<T> {
    const { idempotencia, dadosDoCliente, ...resto } = init;
    let res: Response;
    try {
      res = await fetch(`${this.base}${caminho}`, {
        ...resto,
        headers: {
          Authorization: autorizacaoBasic(this.chave),
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(idempotencia ? { "Idempotency-Key": idempotencia } : {}),
        },
        signal: AbortSignal.timeout(PRAZO_DO_PAGARME_MS),
      });
    } catch (err) {
      // Prazo ou rede: a mensagem do `fetch` nunca leva a chave (vai no cabeçalho).
      const prazo = (err as Error).name === "TimeoutError" || (err as Error).name === "AbortError";
      const e = new ErroDoPagarme(prazo ? "O Pagar.me não respondeu a tempo." : "Não foi possível falar com o Pagar.me.");
      e.semResposta = true;
      throw e;
    }
    let corpo: string;
    try {
      corpo = await res.text();
    } catch {
      const e = new ErroDoPagarme("A resposta do Pagar.me foi cortada no meio.");
      e.semResposta = true;
      throw e;
    }
    if (!res.ok) {
      // Dado do cliente recusado (e-mail, documento, telefone): o comprador lê o que fazer.
      if (dadosDoCliente && (res.status === 422 || res.status === 400)) {
        console.error(`[pagarme] ${erroDoPagarme(res.status, corpo)}`);
        throw new ErroDoPagarme("O Pagar.me recusou os dados de quem paga: confira o nome, o e-mail, o CPF e o telefone.", 400);
      }
      const e = new ErroDoPagarme(erroDoPagarme(res.status, corpo));
      e.httpStatus = res.status;
      throw e;
    }
    try {
      return (corpo ? JSON.parse(corpo) : {}) as T;
    } catch {
      throw new ErroDoPagarme("Resposta do Pagar.me fora do formato.");
    }
  }

  private async cobranca(chargeId: string) {
    if (!idDeCobrancaValido(chargeId)) throw new ErroDoPagarme("Id de cobrança do Pagar.me inválido.");
    return lerCobrancaPagarme(await this.api<unknown>(`/charges/${chargeId}`));
  }

  async createPixCharge(params: Parameters<PaymentProvider["createPixCharge"]>[0]): Promise<PixCharge> {
    // `params.split` é ignorado de propósito: sem split na fase 1.
    const corpo = corpoDoPedidoPagarme(params);
    const resposta = await this.api<unknown>("/orders", {
      method: "POST",
      body: JSON.stringify(corpo),
      // Repetir a criação do mesmo pedido não gera duas cobranças (a confirmar, ver `chaveDoEstorno`).
      idempotencia: `pedido-${params.orderCode}`,
      dadosDoCliente: true,
    });
    const lido = lerPedidoPagarme(resposta, params.expiresAt);
    // A imagem do QR é desenhada aqui, do copia e cola: a tela não depende de
    // um endereço de imagem de fora.
    const qr = await QRCode.toDataURL(lido.copyPaste, { margin: 1, width: 320 }).catch(() => "");
    return {
      provider: this.name,
      chargeId: lido.chargeId,
      qr,
      copyPaste: lido.copyPaste,
      expiresAt: lido.expiresAt,
    };
  }

  async verifyWebhook(
    _headers: Record<string, unknown>,
    rawBody: string,
    contexto?: { query?: Record<string, unknown> },
  ): Promise<WebhookResult> {
    if (!segredoConfere(contexto?.query?.t, this.segredoWebhook)) {
      throw new ErroDoPagarme("Segredo do webhook do Pagar.me ausente ou errado.", 401);
    }
    let corpo: { id?: unknown; type?: unknown; data?: { id?: unknown } | null };
    try {
      corpo = JSON.parse(rawBody || "{}");
    } catch {
      throw new ErroDoPagarme("Corpo do webhook do Pagar.me fora do formato.");
    }
    // **A confirmar**: o formato do corpo (`id` do evento, `type` e a
    // cobrança em `data`), lido da lista de eventos e não de um exemplo.
    if (!idDeEventoValido(corpo.id)) throw new ErroDoPagarme("Webhook do Pagar.me sem id de evento.");
    const tipo = typeof corpo.type === "string" ? corpo.type : "";
    const conhecido = ([...EVENTOS_DE_PAGAMENTO, ...EVENTOS_DE_DEVOLUCAO, "charge.underpaid"] as string[]).includes(tipo);
    if (!conhecido) {
      // `charge.partial_canceled` (a devolução parcial é sempre nossa, pelo
      // chamado), `order.*`, recebedor, `chargeback.received` (o corpo traz a
      // contestação, não a cobrança — a confirmar): nada a fazer aqui.
      return { externalId: corpo.id, chargeId: "", event: "ignored" };
    }
    const id = corpo.data?.id;
    if (!idDeCobrancaValido(id)) throw new ErroDoPagarme("Webhook do Pagar.me sem cobrança.");

    // O corpo não diz se foi pago — quem diz é a API, consultada por nós.
    let c: Awaited<ReturnType<PagarmeProvider["cobranca"]>>;
    try {
      c = await this.cobranca(id);
    } catch (err) {
      // A API de lá fora do ar (rede, prazo, 5xx): 503, para o reenvio não parar.
      if (consultaIndisponivel(err)) {
        throw new ErroDoPagarme("Não foi possível consultar a cobrança no Pagar.me agora.", 503);
      }
      throw err;
    }
    // A contestação que não cobre o pago (ou sem o valor) não desfaz nada
    // sozinha: vai para a Caixa de entrada (o `aviso`, gravado no
    // `audit_log` pelo roteador), além do log.
    const contestacaoParcial =
      (EVENTOS_DE_DEVOLUCAO as readonly string[]).includes(tipo) && c.status === "chargedback" && !contestacaoInteira(c);
    if (contestacaoParcial) {
      console.warn(`[pagarme] cobrança ${c.id} contestada em parte (${c.canceladoCents} de ${c.pagoCents ?? c.amountCents}): ignorada, conferir à mão.`);
    }
    if (c.status === "underpaid") {
      // Pagou a menos: não vira cota (o rateio e o bilhete são do valor
      // cheio). Fica no log para a plataforma devolver à mão. A confirmar se
      // acontece no Pix, onde o valor é fixo no QR.
      console.warn(`[pagarme] cobrança ${c.id} paga a menos (${c.pagoCents ?? "?"} de ${c.amountCents}): ignorada, devolver à mão.`);
    }
    const evento = eventoDoPagarme(tipo, c);
    if (evento === null) {
      // 503, como o "em andamento" do roteador: o Pagar.me reenvia, e o
      // pagamento que a API ainda não mostra não se perde atrás de um 200.
      throw new ErroDoPagarme("O Pagar.me avisou o pagamento, mas a cobrança ainda está pendente.", 503);
    }
    return {
      externalId: corpo.id,
      chargeId: c.id,
      event: evento,
      amountCents: c.pagoCents ?? c.amountCents,
      ...(contestacaoParcial
        ? {
            aviso: {
              acao: ACAO_CONTESTACAO_A_CONFERIR,
              chargeId: c.id,
              dados: { contestadoCents: c.canceladoCents, pagoCents: c.pagoCents ?? c.amountCents, evento: tipo },
            },
          }
        : {}),
    };
  }

  async refund(chargeId: string, amountCents?: number, chave?: string): Promise<void> {
    if (!idDeCobrancaValido(chargeId)) throw new ErroDoPagarme("Id de cobrança do Pagar.me inválido.");
    if (amountCents !== undefined && (!Number.isInteger(amountCents) || amountCents <= 0)) {
      throw new ErroDoPagarme("Valor do estorno inválido.");
    }
    // A cobrança travada durante o par consulta → DELETE: dois estornos da
    // mesma cobrança do carrinho ao mesmo tempo não leem o mesmo "antes".
    await comTravaDaCobranca(chargeId, async () => {
      // O parcial lê o cancelado antes, para conferir depois que saiu
      // exatamente o pedido: um Pagar.me que ignorasse o `amount` devolveria a
      // cobrança inteira calado (no carrinho, o dinheiro das outras rifas).
      // Total sem corpo; parcial com o valor em centavos. **A confirmar**: o
      // campo `amount` no corpo do `DELETE /charges/{id}`.
      const antes = amountCents !== undefined ? (await this.cobranca(chargeId)).canceladoCents : 0;
      let resposta: unknown;
      try {
        resposta = await this.api<unknown>(`/charges/${chargeId}`, {
          method: "DELETE",
          ...(amountCents !== undefined ? { body: JSON.stringify({ amount: amountCents }) } : {}),
          idempotencia: chaveDoEstorno(chargeId, amountCents, chave),
        });
      } catch (err) {
        // Sem resposta ou erro do lado de lá: o pedido saiu e pode ter devolvido.
        if (consultaIndisponivel(err)) throw depoisDeChamar(err as ErroDoPagarme);
        throw err;
      }
      if (amountCents !== undefined) {
        const problema = problemaNoEstornoParcial(amountCents, antes, resposta);
        if (problema) {
          console.error(`[pagarme] estorno parcial da cobrança ${chargeId}: ${problema}`);
          throw depoisDeChamar(new ErroDoPagarme(problema));
        }
      }
    });
  }

  /**
   * Reserva vencida: só cancela a cobrança **pendente**, lida agora. A paga
   * (o Pix chegou no limite) fica como está — cancelar seria estornar — e
   * volta `"paga"`: o relógio a manda para a fila do Pix tardio, mesmo que o
   * webhook nunca chegue. O QR já vence com a reserva
   * (`expires_at`); isto só fecha a cobrança no painel de lá.
   */
  async cancelCharge(chargeId: string): Promise<void | "paga"> {
    // A mesma trava do estorno: a consulta e o cancelamento não se misturam
    // com uma devolução da mesma cobrança.
    return comTravaDaCobranca(chargeId, async () => {
      const c = await this.cobranca(chargeId);
      // Paga (o Pix chegou no limite e o aviso ainda não veio, ou se perdeu):
      // quem chamou leva o Pix para a fila de devolução (`markOrderPaid`).
      if ((STATUS_PAGO as readonly string[]).includes(c.status)) return "paga" as const;
      if (c.status !== "pending") return;
      await this.api(`/charges/${chargeId}`, { method: "DELETE", idempotencia: `cancela-${chargeId}` });
    });
  }

  /** Só o id do evento, o tipo e a cobrança — nunca o cliente que vem em `data`. */
  payloadParaGuardar(raw: string) {
    return payloadDoPagarme(raw);
  }

  /** A régua de quem paga, antes de reservar: e-mail (até 64) e telefone no formato do Pagar.me. */
  problemaNoPagador(p: { email?: string | null; phone?: string | null }): string | null {
    return problemaNoPagadorDoPagarme(p);
  }
}

/** A classe da trava por cobrança (a primeira das duas chaves), fora dos números dos relógios. */
export const TRAVA_DA_COBRANCA_CLASSE = 811_901;
/** Quanto um estorno espera a trava da mesma cobrança antes de desistir (`lock_timeout`). */
export const TRAVA_DA_COBRANCA_ESPERA_MS = 15_000;

/**
 * Trava de sessão do Postgres por cobrança (duas chaves: a classe e o hash do id), numa conexão do
 * `poolDasTravas` — nunca do `pool` comum (CLAUDE.md, a regra das travas):
 * a trava fica presa enquanto o trabalho fala com o Pagar.me. Solta no
 * `finally`. O banco entra só aqui, carregado na hora: as regras puras deste
 * arquivo seguem testáveis sem banco.
 */
async function comTravaDaCobranca<T>(chargeId: string, fn: () => Promise<T>): Promise<T> {
  const { poolDasTravas } = await import("../db");
  const conexao = await poolDasTravas.connect();
  let estragada: Error | undefined;
  try {
    // Esperar a trava tem prazo: um estorno preso não segura o próximo para sempre.
    await conexao.query(`SET lock_timeout = '${TRAVA_DA_COBRANCA_ESPERA_MS}ms'`);
    // Duas chaves (a classe e o hash): nunca colide com as travas de uma chave
    // só dos relógios (`LOCK_EXPIRACAO` e as outras de `server/jobs`).
    await conexao.query("SELECT pg_advisory_lock($1, hashtext($2))", [TRAVA_DA_COBRANCA_CLASSE, chargeId]);
    try {
      return await fn();
    } finally {
      try {
        await conexao.query("SELECT pg_advisory_unlock($1, hashtext($2))", [TRAVA_DA_COBRANCA_CLASSE, chargeId]);
        // A conexão volta ao pool como veio: sem o prazo desta espera.
        await conexao.query("RESET lock_timeout");
      } catch (err) {
        // Sem soltar, a conexão volta ao pool com a trava presa: descartada.
        estragada = err as Error;
      }
    }
  } finally {
    conexao.release(estragada);
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} é obrigatória para usar o Pagar.me.`);
  return value;
}
