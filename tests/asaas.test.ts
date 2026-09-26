import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  traduzirStatusAsaas,
  tokenConfere,
  vencimentoAsaas,
  reais,
  erroAsaas,
  AsaasProvider,
} from "../server/payments/asaas";

describe("Asaas — regras puras", () => {
  it("traduz o status da cobrança", () => {
    expect(traduzirStatusAsaas("RECEIVED")).toBe("paid");
    expect(traduzirStatusAsaas("CONFIRMED")).toBe("paid");
    expect(traduzirStatusAsaas("REFUNDED")).toBe("refunded");
    expect(traduzirStatusAsaas("CHARGEBACK_REQUESTED")).toBe("refunded");
    expect(traduzirStatusAsaas("OVERDUE")).toBe("expired");
    // Estorno pedido ainda não devolveu: quem fecha é o REFUNDED.
    expect(traduzirStatusAsaas("REFUND_REQUESTED")).toBe("ignored");
    expect(traduzirStatusAsaas("PENDING")).toBe("ignored");
  });

  it("confere o token do webhook", () => {
    expect(tokenConfere("segredo-de-32-caracteres-ou-mais!", "segredo-de-32-caracteres-ou-mais!")).toBe(true);
    expect(tokenConfere("outro", "segredo")).toBe(false);
    expect(tokenConfere(undefined, "segredo")).toBe(false);
    expect(tokenConfere("", "")).toBe(false);
  });

  it("vencimento é o dia em Brasília, não em UTC", () => {
    // 01:30 UTC do dia 26 ainda é dia 25 em Brasília.
    expect(vencimentoAsaas(new Date("2026-09-26T01:30:00Z"))).toBe("2026-09-25");
    expect(vencimentoAsaas(new Date("2026-09-26T15:00:00Z"))).toBe("2026-09-26");
  });

  it("centavos viram reais", () => {
    expect(reais(1490)).toBe(14.9);
    expect(reais(100)).toBe(1);
  });

  it("erro da API fica legível", () => {
    const corpo = JSON.stringify({ errors: [{ code: "invalid_cpfCnpj", description: "CPF inválido." }] });
    expect(erroAsaas(400, corpo)).toBe("Asaas recusou (400): CPF inválido.");
    expect(erroAsaas(500, "fora do ar")).toContain("fora do ar");
  });
});

describe("Asaas — conversa com a API (fetch de mentira)", () => {
  const pedidos: { url: string; method: string; headers: Record<string, string>; body?: any }[] = [];
  let responder: (url: string, method: string) => { status: number; json: unknown };

  beforeEach(() => {
    pedidos.length = 0;
    process.env.ASAAS_API_KEY = "chave-teste";
    process.env.ASAAS_WEBHOOK_TOKEN = "token-do-webhook-com-32-caracteres";
    process.env.ASAAS_SANDBOX = "1";
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      pedidos.push({
        url,
        method,
        headers: init.headers as Record<string, string>,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      const r = responder(url, method);
      return new Response(JSON.stringify(r.json), { status: r.status });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ASAAS_API_KEY;
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    delete process.env.ASAAS_SANDBOX;
  });

  const cobrar = (asaas: AsaasProvider, extra: Record<string, unknown> = {}) =>
    asaas.createPixCharge({
      orderCode: 48291734,
      amountCents: 1490,
      description: "Moto — 3 cota(s)",
      payer: { name: "Maria Silva", phone: "41987654321", cpf: "529.982.247-25" },
      expiresAt: new Date("2026-10-01T15:00:00Z"),
      ...extra,
    });

  it("reusa o cliente pelo CPF, cobra em reais com split e devolve o QR", async () => {
    responder = (url, method) => {
      if (url.includes("/customers?")) return { status: 200, json: { data: [{ id: "cus_1" }] } };
      if (url.endsWith("/payments") && method === "POST") return { status: 200, json: { id: "pay_1" } };
      if (url.endsWith("/pixQrCode")) return { status: 200, json: { encodedImage: "AAA", payload: "000201PIX" } };
      return { status: 404, json: {} };
    };
    const asaas = new AsaasProvider();
    const pix = await cobrar(asaas, {
      split: [{ walletId: "7bafd95a-e783-4a62-9be1-23999af742c6", percentual: 95 }],
    });

    expect(pedidos.every((p) => p.url.startsWith("https://api-sandbox.asaas.com/v3/"))).toBe(true);
    expect(pedidos[0].headers.access_token).toBe("chave-teste");
    expect(pedidos.some((p) => p.url.endsWith("/customers") && p.method === "POST")).toBe(false);

    const cobranca = pedidos.find((p) => p.url.endsWith("/payments"))!.body;
    expect(cobranca).toMatchObject({
      customer: "cus_1",
      billingType: "PIX",
      value: 14.9,
      dueDate: "2026-10-01",
      externalReference: "48291734",
      split: [{ walletId: "7bafd95a-e783-4a62-9be1-23999af742c6", percentualValue: 95 }],
    });
    expect(pix).toMatchObject({
      provider: "asaas",
      chargeId: "pay_1",
      copyPaste: "000201PIX",
      qr: "data:image/png;base64,AAA",
    });
  });

  it("cria o cliente quando não existe, sem e-mail do Asaas", async () => {
    responder = (url, method) => {
      if (url.includes("/customers?")) return { status: 200, json: { data: [] } };
      if (url.endsWith("/customers") && method === "POST") return { status: 200, json: { id: "cus_novo" } };
      if (url.endsWith("/payments")) return { status: 200, json: { id: "pay_2" } };
      return { status: 200, json: { payload: "PIX" } };
    };
    await cobrar(new AsaasProvider());
    const cliente = pedidos.find((p) => p.url.endsWith("/customers") && p.method === "POST")!.body;
    expect(cliente).toMatchObject({ name: "Maria Silva", cpfCnpj: "52998224725", notificationDisabled: true });
    expect(pedidos.find((p) => p.url.endsWith("/payments"))!.body.split).toBeUndefined();
  });

  it("sem CPF, nem chama a API", async () => {
    responder = () => ({ status: 200, json: {} });
    await expect(
      new AsaasProvider().createPixCharge({
        orderCode: 1,
        amountCents: 100,
        description: "x",
        payer: { name: "Sem CPF", phone: "41987654321" },
        expiresAt: new Date(),
      }),
    ).rejects.toThrow(/CPF/);
    expect(pedidos).toHaveLength(0);
  });

  it("webhook com token errado é recusado antes de consultar a API", async () => {
    responder = () => ({ status: 200, json: {} });
    await expect(
      new AsaasProvider().verifyWebhook(
        { "asaas-access-token": "falso" },
        JSON.stringify({ id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }),
      ),
    ).rejects.toThrow(/Token/);
    expect(pedidos).toHaveLength(0);
  });

  it("webhook: o status vem da API, não do corpo", async () => {
    // O corpo diz RECEIVED; a API diz que ainda está pendente. Vale a API.
    responder = () => ({ status: 200, json: { id: "pay_1", status: "PENDING", value: 14.9 } });
    const r = await new AsaasProvider().verifyWebhook(
      { "asaas-access-token": "token-do-webhook-com-32-caracteres" },
      JSON.stringify({ id: "evt_9", event: "PAYMENT_RECEIVED", payment: { id: "pay_1", status: "RECEIVED" } }),
    );
    expect(r).toEqual({ externalId: "evt_9", chargeId: "pay_1", event: "ignored", amountCents: 1490 });
    expect(pedidos[0].url).toContain("/payments/pay_1");
  });

  it("cancelar e estornar usam as rotas certas", async () => {
    responder = () => ({ status: 200, json: { deleted: true } });
    const asaas = new AsaasProvider();
    await asaas.cancelCharge("pay_3");
    await asaas.refund("pay_4");
    expect(pedidos.map((p) => `${p.method} ${p.url.replace(/^.*\/v3/, "")}`)).toEqual([
      "DELETE /payments/pay_3",
      "POST /payments/pay_4/refund",
    ]);
  });

  it("reembolso com taxa devolve só o valor calculado; sem valor, o inteiro", async () => {
    responder = () => ({ status: 200, json: {} });
    const asaas = new AsaasProvider();
    await asaas.refund("pay_5", 1350);
    await asaas.refund("pay_6");
    expect(pedidos[0].body).toEqual({ value: 13.5 });
    expect(pedidos[1].body).toBeUndefined();
  });
});
