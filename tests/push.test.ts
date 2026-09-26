import { describe, it, expect } from "vitest";
import {
  endpointPermitido,
  chavesValidas,
  mensagemRifaNova,
  mensagemResultado,
  mensagemReembolso,
  JANELAS_DO_SORTEIO,
  janelaDoSorteio,
} from "../shared/push";

describe("endpoint do push (contra SSRF)", () => {
  it("aceita os serviços dos navegadores, em HTTPS", () => {
    expect(endpointPermitido("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(endpointPermitido("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(endpointPermitido("https://web.push.apple.com/QK")).toBe(true);
    expect(endpointPermitido("https://db5p.notify.windows.com/w/?token=1")).toBe(true);
  });

  it("recusa rede interna, HTTP, porta estranha e host parecido", () => {
    expect(endpointPermitido("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(endpointPermitido("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(endpointPermitido("https://127.0.0.1:5432/")).toBe(false);
    expect(endpointPermitido("https://fcm.googleapis.com.evil.com/x")).toBe(false);
    expect(endpointPermitido("https://evilpush.apple.com.br/x")).toBe(false);
    expect(endpointPermitido("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(endpointPermitido("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(endpointPermitido("não é url")).toBe(false);
    expect(endpointPermitido(42)).toBe(false);
  });

  it("localhost só em desenvolvimento (é o teste de ponta a ponta)", () => {
    expect(endpointPermitido("https://127.0.0.1:9999/p/1")).toBe(false);
    expect(endpointPermitido("https://127.0.0.1:9999/p/1", true)).toBe(true);
    expect(endpointPermitido("http://127.0.0.1:9999/p/1", true)).toBe(false);
  });
});

describe("chaves do aparelho", () => {
  const p256dh = "B" + "a".repeat(86);
  it("confere formato e tamanho", () => {
    expect(chavesValidas({ p256dh, auth: "a".repeat(22) })).toBe(true);
    expect(chavesValidas({ p256dh: "curta", auth: "a".repeat(22) })).toBe(false);
    expect(chavesValidas({ p256dh, auth: "a b" })).toBe(false);
    expect(chavesValidas(null)).toBe(false);
  });
});

describe("mensagens", () => {
  it("apontam para dentro do site", () => {
    const m = [
      mensagemRifaNova({ org: "Rifas SJ", orgSlug: "rifas-sj", premio: "Moto", slug: "moto" }),
      mensagemResultado({ premio: "Moto", orgSlug: "rifas-sj", slug: "moto", numero: "0042" }),
      mensagemReembolso({ aprovado: true, protocolo: "R-1" }),
    ];
    for (const x of m) expect(x.url.startsWith("/")).toBe(true);
    expect(m[0].url).toBe("/o/rifas-sj/r/moto");
    expect(m[1].body).toContain("0042");
  });

  it("sorteio avisa 24 h e 1 h antes — só a janela mais apertada", () => {
    expect(JANELAS_DO_SORTEIO.map((j) => j.chave)).toEqual(["24h", "1h"]);
    const agora = new Date("2026-10-01T12:00:00Z");
    const em = (min: number) => new Date(agora.getTime() + min * 60_000);
    expect(janelaDoSorteio(em(20 * 60), agora)?.chave).toBe("24h");
    expect(janelaDoSorteio(em(30), agora)?.chave).toBe("1h");
    expect(janelaDoSorteio(em(25 * 60), agora)).toBeNull();
    expect(janelaDoSorteio(em(-5), agora)).toBeNull();
    expect(janelaDoSorteio(null, agora)).toBeNull();
  });
});
