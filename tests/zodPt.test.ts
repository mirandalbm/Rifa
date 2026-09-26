import { describe, it, expect } from "vitest";
import { z } from "zod";
import { insertCampaignSchema } from "../shared/schema";
import { mensagemDeValidacao } from "../shared/zodPt";

const campanha = {
  title: "Sábado da Sorte",
  slug: "sabado-da-sorte",
  prizeTitle: "Corolla XEi",
  totalQuotas: 100_000,
  priceCents: 100,
  commissionPctDefault: 10,
};

describe("criar campanha", () => {
  it("não exige a organização no formulário (é o servidor que decide)", () => {
    const r = insertCampaignSchema.safeParse({ ...campanha, organizationId: "" });
    expect(r.success).toBe(true);
    if (r.success) expect("organizationId" in r.data).toBe(false);
  });

  it("o hash da semente não vem do formulário", () => {
    const r = insertCampaignSchema.safeParse({ ...campanha, drawSeedHash: "forjado" });
    expect(r.success && "drawSeedHash" in r.data).toBe(false);
  });
});

describe("mensagem de validação em português", () => {
  const msg = (schema: z.ZodTypeAny, valor: unknown) => {
    const r = schema.safeParse(valor);
    if (r.success) throw new Error("devia falhar");
    return mensagemDeValidacao(r.error.issues);
  };

  it("diz o campo e o que fazer", () => {
    expect(msg(insertCampaignSchema, { ...campanha, title: "ab" })).toBe(
      "Título precisa ter pelo menos 3 caracteres.",
    );
    expect(msg(insertCampaignSchema, { ...campanha, priceCents: 0 })).toBe(
      "Preço da cota precisa ser no mínimo 1.",
    );
    const { prizeTitle: _, ...semPremio } = campanha;
    expect(msg(insertCampaignSchema, semPremio)).toBe("Prêmio é obrigatório.");
  });

  it("mensagem escrita no schema passa como está", () => {
    expect(msg(insertCampaignSchema, { ...campanha, totalQuotas: 1 })).toContain("O mínimo é");
    expect(msg(insertCampaignSchema, { ...campanha, slug: "Com Espaço" })).toContain(
      "Use apenas letras minúsculas",
    );
  });
});
