import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  parseSignatureHeader,
  signatureManifest,
  verifySignature,
  translateStatus,
  MercadoPagoProvider,
} from "../server/payments/mercadopago";

const SECRET = "segredo-do-webhook";
const DATA_ID = "123456789";
const REQUEST_ID = "req-abc";

function signedHeader(ts: string, secret = SECRET, dataId = DATA_ID) {
  const v1 = createHmac("sha256", secret)
    .update(signatureManifest({ dataId, requestId: REQUEST_ID, ts }))
    .digest("hex");
  return `ts=${ts},v1=${v1}`;
}

const NOW = 1_780_000_000_000;
const TS = String(Math.floor(NOW / 1000));

describe("cabeçalho de assinatura", () => {
  it("separa ts e v1", () => {
    expect(parseSignatureHeader("ts=123,v1=abc")).toEqual({ ts: "123", v1: "abc" });
  });

  it("devolve nulo quando o cabeçalho não veio ou está incompleto", () => {
    expect(parseSignatureHeader(undefined)).toBeNull();
    expect(parseSignatureHeader("ts=123")).toBeNull();
  });

  it("monta o manifesto no formato exato do Mercado Pago", () => {
    expect(signatureManifest({ dataId: "9", requestId: "r", ts: "1" })).toBe(
      "id:9;request-id:r;ts:1;",
    );
  });
});

describe("verificação da assinatura", () => {
  const base = { dataId: DATA_ID, requestId: REQUEST_ID, secret: SECRET, now: NOW };

  it("aceita a notificação legítima", () => {
    expect(verifySignature({ ...base, header: signedHeader(TS) })).toBe(true);
  });

  it("recusa assinatura feita com outro segredo", () => {
    expect(verifySignature({ ...base, header: signedHeader(TS, "outro-segredo") })).toBe(false);
  });

  it("recusa quando o id do pagamento foi trocado", () => {
    const header = signedHeader(TS, SECRET, "999");
    expect(verifySignature({ ...base, header })).toBe(false);
  });

  it("recusa replay de notificação antiga", () => {
    const old = String(Math.floor(NOW / 1000) - 3600);
    expect(verifySignature({ ...base, header: signedHeader(old) })).toBe(false);
  });

  it("recusa cabeçalho ausente ou com lixo", () => {
    expect(verifySignature({ ...base, header: undefined })).toBe(false);
    expect(verifySignature({ ...base, header: "ts=abc,v1=zz" })).toBe(false);
  });
});

describe("tradução do status", () => {
  it("só 'approved' libera as cotas", () => {
    expect(translateStatus("approved")).toBe("paid");
    expect(translateStatus("pending")).toBe("ignored");
    expect(translateStatus("in_process")).toBe("ignored");
    expect(translateStatus("rejected")).toBe("expired");
    expect(translateStatus("refunded")).toBe("refunded");
    expect(translateStatus("charged_back")).toBe("refunded");
  });
});

describe("estorno pelo Mercado Pago", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MP_ACCESS_TOKEN;
  });

  it("parcial manda o valor em reais; a chave de idempotência não muda na repetição", async () => {
    process.env.MP_ACCESS_TOKEN = "token-teste";
    process.env.MP_WEBHOOK_SECRET ??= "segredo-teste";
    const pedidos: { url: string; headers: Record<string, string>; body?: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      pedidos.push({
        url,
        headers: init.headers as Record<string, string>,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response("{}", { status: 201 });
    });
    const mp = new MercadoPagoProvider();
    await mp.refund("555", 1350);
    await mp.refund("555", 1350);
    await mp.refund("556");
    expect(pedidos[0].url).toContain("/v1/payments/555/refunds");
    expect(pedidos[0].body).toEqual({ amount: 13.5 });
    expect(pedidos[0].headers["X-Idempotency-Key"]).toBe(pedidos[1].headers["X-Idempotency-Key"]);
    expect(pedidos[2].body).toBeUndefined();
  });
});
