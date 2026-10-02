import { describe, expect, it } from "vitest";
import { CONFIG_IA_PADRAO, idDaIA, metadadosDaIA, quemTemIA, validarConfigIA } from "../shared/ia";
import { hashDaIA, segredoValido } from "../server/services/iaIdentidade";
import crypto from "node:crypto";

const LIGADA = { ligado: true, agenteId: "agente_abc-123", paraOrganizador: false };

describe("assistente de IA: configuração", () => {
  it("nasce desligada, sem agente e sem liberar o organizador", () => {
    expect(CONFIG_IA_PADRAO).toEqual({ ligado: false, agenteId: "", paraOrganizador: false });
    expect(validarConfigIA(undefined)).toEqual(CONFIG_IA_PADRAO);
  });

  it("só guarda as chaves conhecidas", () => {
    const c = validarConfigIA({ ...LIGADA, extra: "x", segredo: "y" });
    expect(Object.keys(c).sort()).toEqual(["agenteId", "ligado", "paraOrganizador"]);
  });

  it("o id do agente vai numa tag <script>: só letras, números, _ e -", () => {
    for (const ruim of ['a"><script>x</script>', "curto", "tem espaço aqui", "x".repeat(65), "ab/../cdefg"]) {
      expect(() => validarConfigIA({ ligado: false, agenteId: ruim })).toThrow();
    }
    expect(validarConfigIA({ ligado: true, agenteId: "  agente_abc-123  " }).agenteId).toBe("agente_abc-123");
  });

  it("não liga sem o id do agente", () => {
    expect(() => validarConfigIA({ ligado: true, agenteId: "" })).toThrow(/id do agente/);
  });

  it("só true liga: texto e número não contam", () => {
    expect(validarConfigIA({ ligado: "true" as never, agenteId: "agente_abc-123" }).ligado).toBe(false);
    expect(validarConfigIA({ ...LIGADA, paraOrganizador: 1 as never }).paraOrganizador).toBe(false);
  });
});

describe("assistente de IA: quem vê", () => {
  it("o master vê quando está ligado; afiliado, cambista e apostador nunca", () => {
    expect(quemTemIA("admin", LIGADA)).toBe(true);
    for (const r of ["affiliate", "cambista", "buyer", "guest", undefined] as const) {
      expect(quemTemIA(r, { ...LIGADA, paraOrganizador: true })).toBe(false);
    }
  });

  it("o organizador só vê se a plataforma liberar", () => {
    expect(quemTemIA("organizer", LIGADA)).toBe(false);
    expect(quemTemIA("organizer", { ...LIGADA, paraOrganizador: true })).toBe(true);
  });

  it("desligado, ninguém vê — nem com o interruptor do organizador", () => {
    expect(quemTemIA("admin", { ...LIGADA, ligado: false })).toBe(false);
    expect(quemTemIA("organizer", { ligado: false, agenteId: "agente_abc-123", paraOrganizador: true })).toBe(false);
  });
});

describe("assistente de IA: o que sai para o Chatbase", () => {
  it("o contexto não leva nome de pessoa, e-mail nem telefone", () => {
    const m = metadadosDaIA("organizer", "Rifas da Ana\nLTDA");
    expect(m).toEqual({ papel: "organizador", organizacao: "Rifas da Ana LTDA" });
    expect(metadadosDaIA("admin", "Qualquer")).toEqual({ papel: "administrador master" });
    expect(metadadosDaIA("organizer", "x".repeat(200)).organizacao).toHaveLength(80);
  });

  it("o identificador é opaco", () => {
    expect(idDaIA("abc-123")).toBe("rifa-u-abc-123");
  });

  it("o hash é o HMAC-SHA256 do id com o segredo, em hexadecimal", () => {
    const segredo = "segredo-de-verificacao-1234";
    const esperado = crypto.createHmac("sha256", segredo).update("rifa-u-1").digest("hex");
    expect(hashDaIA("rifa-u-1", segredo)).toBe(esperado);
    expect(hashDaIA("rifa-u-1", segredo)).not.toBe(hashDaIA("rifa-u-2", segredo));
    expect(hashDaIA("rifa-u-1", segredo)).not.toBe(hashDaIA("rifa-u-1", segredo + "x"));
  });

  it("segredo ausente ou curto demais não conta", () => {
    expect(segredoValido(undefined)).toBeNull();
    expect(segredoValido(null)).toBeNull();
    expect(segredoValido("   ")).toBeNull();
    expect(segredoValido("curto")).toBeNull();
    expect(segredoValido(" segredo-de-verificacao-1234 ")).toBe("segredo-de-verificacao-1234");
  });
});
