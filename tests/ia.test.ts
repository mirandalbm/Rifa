import { describe, expect, it } from "vitest";
import {
  CONFIG_IA_PADRAO,
  milicreditosUsados,
  idDaIA,
  papelTemIA,
  problemaNaMensagemDaIA,
  quemTemIA,
  textoDasPartes,
  titularDaIA,
  validarConfigIA,
} from "../shared/ia";

const LIGADA = { ligado: true, agenteId: "agente_abc-123", paraOrganizador: false, paraAfiliado: false };

describe("assistente de IA: configuração", () => {
  it("nasce desligada, sem agente e sem liberar organizador nem afiliado", () => {
    expect(CONFIG_IA_PADRAO).toEqual({ ligado: false, agenteId: "", paraOrganizador: false, paraAfiliado: false });
    expect(validarConfigIA(undefined)).toEqual(CONFIG_IA_PADRAO);
  });

  it("só guarda as chaves conhecidas", () => {
    const c = validarConfigIA({ ...LIGADA, extra: "x", chave: "y" });
    expect(Object.keys(c).sort()).toEqual(["agenteId", "ligado", "paraAfiliado", "paraOrganizador"]);
  });

  it("o id do agente vai no caminho da API: só letras, números, _ e -", () => {
    for (const ruim of ["../../outra-coisa", "curto", "tem espaço aqui", "x".repeat(65), "ab?c=defgh", "a/b/c/d/e/f"]) {
      expect(() => validarConfigIA({ ligado: false, agenteId: ruim })).toThrow();
    }
    expect(validarConfigIA({ ligado: true, agenteId: "  agente_abc-123  " }).agenteId).toBe("agente_abc-123");
  });

  it("não liga sem o id do agente; só true liga", () => {
    expect(() => validarConfigIA({ ligado: true, agenteId: "" })).toThrow(/id do agente/);
    expect(validarConfigIA({ ligado: "true" as never, agenteId: "agente_abc-123" }).ligado).toBe(false);
    expect(validarConfigIA({ ...LIGADA, paraAfiliado: 1 as never }).paraAfiliado).toBe(false);
  });
});

describe("assistente de IA: quem vê e quem responde pelo uso", () => {
  it("master, organizador e afiliado podem ter; cambista e apostador nunca", () => {
    expect(papelTemIA("admin")).toBe(true);
    expect(papelTemIA("organizer")).toBe(true);
    expect(papelTemIA("affiliate")).toBe(true);
    for (const r of ["cambista", "buyer", "guest", undefined] as const) expect(papelTemIA(r)).toBe(false);
  });

  it("o master vê com a IA ligada; organizador e afiliado só com o interruptor de cada um", () => {
    expect(quemTemIA("admin", LIGADA)).toBe(true);
    expect(quemTemIA("organizer", LIGADA)).toBe(false);
    expect(quemTemIA("affiliate", LIGADA)).toBe(false);
    expect(quemTemIA("organizer", { ...LIGADA, paraOrganizador: true })).toBe(true);
    expect(quemTemIA("affiliate", { ...LIGADA, paraAfiliado: true })).toBe(true);
    expect(quemTemIA("affiliate", { ...LIGADA, paraOrganizador: true })).toBe(false);
    expect(quemTemIA("cambista", { ...LIGADA, paraOrganizador: true, paraAfiliado: true })).toBe(false);
  });

  it("desligado, ninguém vê", () => {
    const tudo = { ligado: false, agenteId: "agente_abc-123", paraOrganizador: true, paraAfiliado: true };
    for (const r of ["admin", "organizer", "affiliate"] as const) expect(quemTemIA(r, tudo)).toBe(false);
  });

  it("o titular sai da sessão: plataforma, a organização ou o cadastro do afiliado", () => {
    expect(titularDaIA({ role: "admin", organizationId: null })).toEqual({ tipo: "plataforma" });
    expect(titularDaIA({ role: "organizer", organizationId: "org-1" })).toEqual({ tipo: "organizacao", id: "org-1" });
    expect(titularDaIA({ role: "affiliate", affiliateId: "af-1" })).toEqual({ tipo: "afiliado", id: "af-1" });
    // Organizador sem organização e afiliado sem cadastro não têm titular (e não conversam).
    expect(titularDaIA({ role: "organizer", organizationId: null })).toBeNull();
    expect(titularDaIA({ role: "affiliate" })).toBeNull();
    expect(titularDaIA({ role: "cambista", affiliateId: "af-1" })).toBeNull();
  });

  it("o identificador que vai ao Chatbase é opaco", () => {
    expect(idDaIA("abc-123")).toBe("rifa-u-abc-123");
  });
});

describe("assistente de IA: o que pode sair para o Chatbase", () => {
  it("barra telefone, CPF e e-mail de cliente", () => {
    for (const t of [
      "o cliente 11 98765-4321 pagou?",
      "telefone (11) 3456-7890",
      "(11)98765-4321",
      "+55 11 98765-4321",
      "fone 11 9 8765-4321",
      "11987654321",
      "CPF 123.456.789-09",
      "cpf 12345678909",
      "mande para ana@exemplo.com",
    ]) {
      expect(problemaNaMensagemDaIA(t), t).toMatch(/telefone, CPF ou e-mail/);
    }
  });

  it("não se engana com disfarce: traço do Word, vírgula, sublinhado, invisível, largura cheia", () => {
    for (const t of [
      "o cliente (11) 98765–4321 pagou?", // meia-risca
      "CPF 123.456.789–09",
      "123,456,789-09",
      "11_98765_4321",
      "11\u200B98765\u200B4321", // espaço de largura zero
      "１１９８７６５４３２１", // dígitos de largura cheia
    ]) {
      expect(problemaNaMensagemDaIA(t), t).toMatch(/telefone, CPF ou e-mail/);
    }
  });

  it("barra o celular sem DDD escrito com separador", () => {
    expect(problemaNaMensagemDaIA("liga no 98765-4321")).toMatch(/telefone/);
    expect(problemaNaMensagemDaIA("liga no 98765 4321")).toMatch(/telefone/);
  });

  it("deixa passar código de pedido e de carrinho, ID de cliente, valores, datas, horas e cotas", () => {
    for (const t of [
      "o pedido 48291734 foi pago?",
      "pedidos 48291734 12345678",
      "cliente C-7K2M9QXR pediu reembolso",
      "a rifa vende R$ 1.000.000,00?",
      "sorteio em 12/10/2026 às 19h",
      "sorteio 12/10/2026 19:00",
      "2026-10-12 19:00",
      "carrinho 123456789",
      "cotas 0001 0002 0003",
      "cotas 2001-3000",
      "meta de 100000 cotas",
    ]) {
      expect(problemaNaMensagemDaIA(t), t).toBeNull();
    }
  });

  it("vazio e longo demais são recusados", () => {
    expect(problemaNaMensagemDaIA("   ")).toMatch(/Escreva/);
    expect(problemaNaMensagemDaIA(undefined)).toMatch(/Escreva/);
    expect(problemaNaMensagemDaIA("a".repeat(2001))).toMatch(/2000/);
  });

  it("o texto da resposta junta só as partes de texto", () => {
    expect(
      textoDasPartes([
        { type: "text", text: "Olá" },
        { type: "tool-call", toolName: "x", input: {} },
        { type: "text", text: "tudo certo" },
        null,
        { type: "text", text: 3 },
      ]),
    ).toBe("Olá\ntudo certo");
    expect(textoDasPartes("nada")).toBe("");
  });

  it("créditos em milésimos, exatos; ausente ou inválido é 'sem medida', nunca zero", () => {
    expect(milicreditosUsados(2)).toBe(2000);
    expect(milicreditosUsados(0.5)).toBe(500);
    expect(milicreditosUsados("1.25")).toBe(1250);
    expect(milicreditosUsados(0)).toBe(0);
    for (const ruim of [undefined, null, "", "x", -1, Number.NaN, {}]) expect(milicreditosUsados(ruim)).toBeNull();
  });
});
