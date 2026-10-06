import { describe, it, expect, afterEach } from "vitest";
import { crc16, pixCopiaECola, chavePixValida } from "../server/payments/pixEstatico";
import { DevPaymentProvider } from "../server/payments/dev";

// Chave de exemplo (formato aleatório), nunca a de alguém.
const CHAVE = "123e4567-e89b-12d3-a456-426614174000";

describe("Pix copia e cola de chave fixa (só teste)", () => {
  it("CRC16-CCITT confere com o valor de referência", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("monta o BR Code com chave, valor, txid e CRC certo", () => {
    const c = pixCopiaECola({ chave: CHAVE, valorCents: 1050, txid: "12345678", nome: "Rifa Ação", cidade: "São Paulo" });
    expect(c.startsWith("000201")).toBe(true);
    expect(c).toContain(`0014br.gov.bcb.pix0136${CHAVE}`);
    expect(c).toContain("540510.50");
    expect(c).toContain("5909RIFA ACAO");
    expect(c).toContain("6009SAO PAULO");
    expect(c).toContain("62120508" + "12345678");
    const corpo = c.slice(0, -4);
    expect(corpo.endsWith("6304")).toBe(true);
    expect(c.slice(-4)).toBe(crc16(corpo));
  });

  it("recusa chave com espaço ou longa e valor zero", () => {
    expect(chavePixValida("a b")).toBe(false);
    expect(chavePixValida("x".repeat(78))).toBe(false);
    expect(() => pixCopiaECola({ chave: CHAVE, valorCents: 0, txid: "1" })).toThrow();
  });

  describe("provedor de desenvolvimento", () => {
    afterEach(() => {
      delete process.env.DEV_PIX_CHAVE;
    });
    const cobrar = () =>
      new DevPaymentProvider().createPixCharge({
        orderCode: 87654321,
        amountCents: 2500,
        description: "teste",
        payer: { name: "Ana", phone: "11999999999" },
        expiresAt: new Date(),
      } as Parameters<DevPaymentProvider["createPixCharge"]>[0]);

    it("sem DEV_PIX_CHAVE, segue o código falso de antes", async () => {
      expect((await cobrar()).copyPaste.endsWith("***DEV")).toBe(true);
    });

    it("com DEV_PIX_CHAVE, o copia e cola é Pix de verdade para a chave", async () => {
      process.env.DEV_PIX_CHAVE = CHAVE;
      const c = (await cobrar()).copyPaste;
      expect(c).toContain(CHAVE);
      expect(c).toContain("540525.00");
      expect(c).toContain("87654321");
    });
  });
});
