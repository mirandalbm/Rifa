import { describe, it, expect } from "vitest";
import { problemaNosDadosLegais, tipoDoCertificado } from "@shared/campanhaLegal";

const agora = new Date("2026-09-26T12:00:00Z");

describe("dados legais da campanha", () => {
  it("aceita número de certificado e sorteio no futuro", () => {
    expect(
      problemaNosDadosLegais(
        { authorizationCode: "03.021234/2026", drawAt: new Date("2026-10-10T20:00:00Z") },
        agora,
      ),
    ).toBeNull();
  });

  it("recusa número curto demais", () => {
    expect(problemaNosDadosLegais({ authorizationCode: "123" }, agora)).toMatch(/certificado/);
  });

  it("recusa sorteio no passado ou em menos de 1 hora", () => {
    expect(problemaNosDadosLegais({ drawAt: new Date("2026-09-25T12:00:00Z") }, agora)).toMatch(/1 hora/);
    expect(problemaNosDadosLegais({ drawAt: new Date("2026-09-26T12:30:00Z") }, agora)).toMatch(/1 hora/);
  });

  it("recusa data inválida", () => {
    expect(problemaNosDadosLegais({ drawAt: new Date("lixo") }, agora)).toMatch(/inválida/);
  });

  it("campo ausente não é conferido (salvar só um dos dois)", () => {
    expect(problemaNosDadosLegais({}, agora)).toBeNull();
  });
});

describe("tipo do certificado pelo conteúdo", () => {
  const bytes = (s: string | number[]) =>
    typeof s === "string" ? new TextEncoder().encode(s) : Uint8Array.from(s);

  it("PDF pelo cabeçalho", () => {
    expect(tipoDoCertificado(bytes("%PDF-1.7\n..."))).toBe("pdf");
  });

  it("JPEG, PNG e WebP pela assinatura", () => {
    expect(tipoDoCertificado(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("imagem");
    expect(tipoDoCertificado(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("imagem");
    expect(tipoDoCertificado(bytes("RIFF\0\0\0\0WEBPVP8 "))).toBe("imagem");
  });

  it("recusa o resto, mesmo com nome de PDF", () => {
    expect(tipoDoCertificado(bytes("<html><script>"))).toBeNull();
    expect(tipoDoCertificado(bytes("MZ\x90\0"))).toBeNull();
  });
});
