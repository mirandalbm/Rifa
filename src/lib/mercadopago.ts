import crypto from "crypto";

const API = "https://api.mercadopago.com";

export type CobrancaPix = {
  idExterno: string;
  status: string;
  copiaECola: string | null;
  qrCodeBase64: string | null;
  expiraEm: Date | null;
  bruto: unknown;
};

function token(): string {
  const valor = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!valor) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado");
  return valor;
}

export async function criarCobrancaPix(params: {
  valor: number;
  descricao: string;
  chaveIdempotencia: string;
  expiraEm: Date;
  pagador: { nome: string; email: string; cpf?: string | null };
}): Promise<CobrancaPix> {
  const [primeiroNome, ...resto] = params.pagador.nome.trim().split(/\s+/);

  const resposta = await fetch(`${API}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": params.chaveIdempotencia,
    },
    body: JSON.stringify({
      transaction_amount: params.valor,
      description: params.descricao,
      payment_method_id: "pix",
      date_of_expiration: params.expiraEm.toISOString(),
      payer: {
        email: params.pagador.email,
        first_name: primeiroNome,
        last_name: resto.join(" ") || primeiroNome,
        ...(params.pagador.cpf
          ? { identification: { type: "CPF", number: params.pagador.cpf.replace(/\D/g, "") } }
          : {}),
      },
    }),
  });

  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(`Mercado Pago recusou a cobrança: ${dados?.message ?? resposta.status}`);
  }

  const pix = dados?.point_of_interaction?.transaction_data;

  return {
    idExterno: String(dados.id),
    status: String(dados.status),
    copiaECola: pix?.qr_code ?? null,
    qrCodeBase64: pix?.qr_code_base64 ?? null,
    expiraEm: dados.date_of_expiration ? new Date(dados.date_of_expiration) : null,
    bruto: dados,
  };
}

export async function consultarPagamento(idExterno: string): Promise<{ status: string; bruto: unknown }> {
  const resposta = await fetch(`${API}/v1/payments/${idExterno}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store",
  });

  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(`Falha ao consultar pagamento ${idExterno}: ${dados?.message ?? resposta.status}`);
  }

  return { status: String(dados.status), bruto: dados };
}

/// Valida a assinatura do webhook conforme o manifesto do Mercado Pago:
///   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
/// Sem isso, qualquer um poderia forjar uma confirmação de pagamento.
export function assinaturaWebhookValida(params: {
  assinatura: string | null;
  requestId: string | null;
  dataId: string | null;
}): boolean {
  const segredo = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!segredo || !params.assinatura || !params.dataId) return false;

  const partes = Object.fromEntries(
    params.assinatura.split(",").map((parte) => {
      const [chave, ...valor] = parte.split("=");
      return [chave.trim(), valor.join("=").trim()];
    }),
  );

  const ts = partes.ts;
  const hashRecebido = partes.v1;
  if (!ts || !hashRecebido) return false;

  const manifesto = `id:${params.dataId.toLowerCase()};request-id:${params.requestId ?? ""};ts:${ts};`;
  const esperado = crypto.createHmac("sha256", segredo).update(manifesto).digest("hex");

  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(hashRecebido, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
