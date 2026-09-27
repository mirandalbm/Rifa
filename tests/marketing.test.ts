import { describe, expect, it } from "vitest";
import {
  corpoGa4,
  corpoMeta,
  corpoTiktok,
  gravarEscolha,
  idDoEventoDeCompra,
  lerEscolha,
  mesclarCredenciais,
  quaisCredenciais,
  rotuloDaCampanha,
  telefoneParaHash,
  temPixel,
  utmDaUrl,
  validarPixels,
  validarUtm,
  type Compra,
} from "@shared/marketing";

describe("pixels: só números no formato de cada provedor", () => {
  it("aceita os formatos oficiais e ignora vazio", () => {
    expect(
      validarPixels({ meta: " 1234567890123456 ", ga4: "g-abc123xyz9", googleAds: "aw-123456789", googleAdsRotulo: "AbC-D_ef", tiktok: "c1a2b3c4d5e6f7g8h9i0", tiktokx: "x" }),
    ).toEqual({ meta: "1234567890123456", ga4: "G-ABC123XYZ9", googleAds: "AW-123456789", googleAdsRotulo: "AbC-D_ef", tiktok: "C1A2B3C4D5E6F7G8H9I0" });
    expect(validarPixels({ meta: "" })).toEqual({});
    expect(validarPixels(undefined)).toEqual({});
  });
  it("recusa qualquer coisa que pareça script", () => {
    for (const ruim of ["123');alert(1);//", "<script>", "12345 67890", "G-ABC'); fetch('x"]) {
      expect(() => validarPixels({ meta: ruim })).toThrow(/Meta/);
      expect(() => validarPixels({ ga4: ruim })).toThrow(/Google Analytics/);
    }
    expect(() => validarPixels("1234567890")).toThrow();
    expect(() => validarPixels([])).toThrow();
  });
  it("rótulo do Google Ads pede o ID junto", () => {
    expect(() => validarPixels({ googleAdsRotulo: "AbC-D_ef" })).toThrow(/Google Ads/);
  });
  it("temPixel só com algum provedor", () => {
    expect(temPixel({})).toBe(false);
    expect(temPixel({ googleAdsRotulo: "x" })).toBe(false);
    expect(temPixel({ tiktok: "C1A2B3C4D5E6F7G8H9I0" })).toBe(true);
  });
});

describe("chaves de API", () => {
  it("mescla: ausente mantém, vazio apaga, formato conferido", () => {
    const a = mesclarCredenciais({}, { metaToken: "EAAB1234567890abc" });
    expect(a).toEqual({ metaToken: "EAAB1234567890abc" });
    const b = mesclarCredenciais(a, { ga4Segredo: "segredo_1234" });
    expect(b).toEqual({ metaToken: "EAAB1234567890abc", ga4Segredo: "segredo_1234" });
    expect(mesclarCredenciais(b, { metaToken: "" })).toEqual({ ga4Segredo: "segredo_1234" });
    expect(() => mesclarCredenciais({}, { tiktokToken: "curto" })).toThrow(/TikTok/);
    expect(() => mesclarCredenciais({}, { metaToken: "com espaço no meio" })).toThrow(/Meta/);
  });
  it("a tela só sabe se existe", () => {
    expect(quaisCredenciais({ metaToken: "x" })).toEqual({ metaToken: true, ga4Segredo: false, tiktokToken: false });
  });
});

describe("UTM", () => {
  it("lê da URL, limpa e ignora o resto", () => {
    expect(utmDaUrl("?utm_source=instagram&utm_medium=cpc&utm_campaign=moto%20junho&x=1")).toEqual({ source: "instagram", medium: "cpc", campaign: "moto junho" });
    expect(utmDaUrl("?x=1")).toBeNull();
    expect(utmDaUrl("?utm_source=<script>alert(1)</script>")?.source).toBe("scriptalert1/script");
  });
  it("do corpo: só chaves conhecidas", () => {
    expect(validarUtm({ source: "google", gclid: "abc", outra: "x" })).toEqual({ source: "google", gclid: "abc" });
    expect(validarUtm("x")).toBeNull();
    expect(validarUtm({ source: "" })).toBeNull();
  });
  it("rótulo do relatório preenche o que o clique pago já diz", () => {
    expect(rotuloDaCampanha({ gclid: "x" })).toEqual({ fonte: "google", meio: "cpc", campanha: "(sem campanha)" });
    expect(rotuloDaCampanha({ source: "ig", medium: "stories", campaign: "c1" })).toEqual({ fonte: "ig", meio: "stories", campanha: "c1" });
  });
});

describe("aviso de cookies", () => {
  it("guarda a escolha com versão", () => {
    expect(lerEscolha(gravarEscolha("aceito"))).toBe("aceito");
    expect(lerEscolha(gravarEscolha("recusado"))).toBe("recusado");
    expect(lerEscolha(JSON.stringify({ v: 0, e: "aceito" }))).toBeNull();
    expect(lerEscolha("lixo")).toBeNull();
    expect(lerEscolha(null)).toBeNull();
  });
});

describe("compra para as APIs", () => {
  const compra: Compra = {
    codigo: 12345678,
    valorCents: 1050,
    quantidade: 3,
    campanhaId: "c-1",
    campanhaTitulo: "Moto",
    pagoEm: new Date("2026-09-27T12:00:00Z"),
    telefoneHash: "h",
    fbclid: "fb123",
    clienteId: "aparelho",
    urlDaRifa: "https://rifa.br/r/moto",
  };
  it("o mesmo id no navegador e no servidor", () => {
    expect(idDoEventoDeCompra(12345678)).toBe("compra-12345678");
    expect(corpoMeta(compra).data[0].event_id).toBe("compra-12345678");
    expect(corpoGa4(compra).events[0].params.transaction_id).toBe("compra-12345678");
    expect(corpoTiktok("PIX", compra).data[0].event_id).toBe("compra-12345678");
  });
  it("valor em reais, BRL, e o fbc montado do clique", () => {
    const m = corpoMeta(compra).data[0];
    expect(m.custom_data.value).toBe(10.5);
    expect(m.custom_data.currency).toBe("BRL");
    expect(m.user_data).toEqual({ ph: ["h"], fbc: `fb.1.${Date.parse("2026-09-27T12:00:00Z")}.fb123` });
  });
  it("sem telefone (sem consentimento), nada de dado pessoal", () => {
    const m = corpoMeta({ ...compra, telefoneHash: undefined, fbclid: undefined }).data[0];
    expect(m.user_data).toEqual({});
    expect(corpoTiktok("PIX", { ...compra, telefoneHash: undefined }).data[0].user).toEqual({});
  });
  it("telefone vira 55 + DDD + número", () => {
    expect(telefoneParaHash("(11) 98888-7777")).toBe("5511988887777");
    expect(telefoneParaHash("5511988887777")).toBe("5511988887777");
    expect(telefoneParaHash("123")).toBeNull();
  });
});
