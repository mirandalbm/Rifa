import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TEMPLATES } from "../server/notifications/templates";

/**
 * A conversa com a Meta, sem rede: um `fetch` de mentira faz o papel da
 * Graph API e guarda o que recebeu.
 */
const pedidos: { url: string; method: string; body?: any }[] = [];
let resposta: (url: string, init: RequestInit) => { status: number; json: unknown };

beforeEach(() => {
  pedidos.length = 0;
  process.env.WHATSAPP_TOKEN = "token-teste";
  process.env.WHATSAPP_PHONE_ID = "111";
  process.env.WHATSAPP_WABA_ID = "222";
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    pedidos.push({
      url,
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = resposta(url, init);
    return new Response(JSON.stringify(r.json), { status: r.status });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_ID;
  delete process.env.WHATSAPP_WABA_ID;
});

describe("preparar o WhatsApp pelo painel", () => {
  it("cria só os modelos que faltam, e um recusado não impede os outros", async () => {
    const { criarModelosFaltantes } = await import("../server/services/whatsappSetup");
    resposta = (url, init) => {
      if (url.includes("message_templates?")) {
        return {
          status: 200,
          json: { data: [{ name: "codigo_acesso", language: "pt_BR", status: "APPROVED", category: "AUTHENTICATION" }] },
        };
      }
      const nome = JSON.parse(String(init.body)).name;
      if (nome === "cota_premiada") {
        return { status: 400, json: { error: { message: "Invalid parameter", error_user_msg: "Texto recusado" } } };
      }
      return { status: 200, json: { id: "1", status: "PENDING" } };
    };

    const r = await criarModelosFaltantes();
    const criados = pedidos.filter((p) => p.method === "POST").map((p) => p.body.name);
    expect(criados).not.toContain("codigo_acesso");
    // Todos menos o que já existia (codigo_acesso).
    expect(criados).toHaveLength(Object.keys(TEMPLATES).length - 1);
    expect(pedidos.every((p) => p.url.startsWith("https://graph.facebook.com/v25.0/"))).toBe(true);
    expect(r.find((m) => m.nome === "codigo_acesso")?.detalhe).toBe("já existia");
    expect(r.find((m) => m.nome === "cota_premiada")).toMatchObject({ ok: false });
    expect(r.find((m) => m.nome === "cota_premiada")?.detalhe).toContain("Texto recusado");
    // Todos menos o recusado (cota_premiada); o que já existia conta como ok.
    expect(r.filter((m) => m.ok)).toHaveLength(Object.keys(TEMPLATES).length - 1);
  });

  it("token vencido vira instrução, não código de erro da Meta", async () => {
    const { estadoWhatsApp } = await import("../server/services/whatsappSetup");
    resposta = () => ({ status: 401, json: { error: { code: 190, message: "Session has expired" } } });
    await expect(estadoWhatsApp()).rejects.toThrow(/token permanente/);
  });

  it("mostra cada modelo com a situação na Meta", async () => {
    const { estadoWhatsApp } = await import("../server/services/whatsappSetup");
    resposta = (url) =>
      url.includes("message_templates")
        ? { status: 200, json: { data: [{ name: "sorteio_realizado", language: "pt_BR", status: "REJECTED", category: "UTILITY", rejected_reason: "INVALID_FORMAT" }] } }
        : { status: 200, json: { display_phone_number: "+1 555-176-6800", verified_name: "Test Number" } };
    const e = await estadoWhatsApp();
    if (!e.configurado) throw new Error("devia estar configurado");
    expect(e.numero).toBe("+1 555-176-6800");
    const sorteio = e.modelos.find((m) => m.nome === "sorteio_realizado");
    expect(sorteio).toMatchObject({ status: "REJECTED", motivo: "INVALID_FORMAT" });
    expect(e.modelos.find((m) => m.nome === "pagamento_confirmado")?.status).toBe("NAO_CRIADO");
  });

  it("o teste manda o código de acesso com o botão de copiar", async () => {
    const { enviarTeste } = await import("../server/services/whatsappSetup");
    resposta = () => ({ status: 200, json: { messages: [{ id: "wamid" }] } });
    await enviarTeste("(41) 98784-8893");
    const envio = pedidos[0];
    expect(envio.url).toBe("https://graph.facebook.com/v25.0/111/messages");
    expect(envio.body.to).toBe("5541987848893");
    expect(envio.body.template.name).toBe("codigo_acesso");
    expect(envio.body.template.components).toHaveLength(2);
  });

  it("o teste pode usar outro modelo aprovado, com os valores de exemplo", async () => {
    const { enviarTeste } = await import("../server/services/whatsappSetup");
    resposta = () => ({ status: 200, json: { messages: [{ id: "wamid" }] } });
    await enviarTeste("41987848893", "sorteio_realizado");
    const envio = pedidos[0];
    expect(envio.body.template.name).toBe("sorteio_realizado");
    expect(envio.body.template.components).toHaveLength(1);
    const valores = envio.body.template.components[0].parameters.map((p: { text: string }) => p.text);
    expect(valores).toEqual(["iPhone 17 Pro", "004567", "https://rifa.br/r/iphone-17-pro"]);
    await expect(enviarTeste("41987848893", "nao_existe")).rejects.toThrow(/desconhecido/);
  });
});
