import { describe, expect, it } from "vitest";
import {
  identificarHost,
  linkDaRifaNoEndereco,
  problemaNoRotulo,
  rotuloDoAfiliado,
  hostDoRotulo,
} from "../shared/subdominio";

const BASE = "rifas.exemplo.com.br";

describe("rótulo da organização", () => {
  it("aceita slug simples, com números e hífen no meio", () => {
    expect(problemaNoRotulo("rifa-solidaria-2026")).toBeNull();
    expect(problemaNoRotulo("abc")).toBeNull();
  });

  it("recusa o que não é rótulo DNS válido", () => {
    expect(problemaNoRotulo("ab")).toMatch(/pelo menos 3/);
    expect(problemaNoRotulo("a".repeat(64))).toMatch(/no máximo 63/);
    expect(problemaNoRotulo("-inicio")).toMatch(/hífen/);
    expect(problemaNoRotulo("fim-")).toMatch(/hífen/);
    expect(problemaNoRotulo("com_sublinhado")).toMatch(/Use só/);
    expect(problemaNoRotulo("com.ponto")).toMatch(/Use só/);
    expect(problemaNoRotulo("Maiuscula")).toMatch(/Use só/);
  });

  it("recusa nome reservado pelo sistema", () => {
    expect(problemaNoRotulo("admin")).toMatch(/reservado/);
    expect(problemaNoRotulo("www")).toMatch(/reservado/);
  });

  it("organização não pode usar o prefixo do afiliado", () => {
    expect(problemaNoRotulo("af-joao")).toMatch(/af-/);
  });

  it("slug de 80 caracteres (válido na organização) não cabe no endereço", () => {
    const slug = "a".repeat(80);
    expect(problemaNoRotulo(slug)).not.toBeNull();
  });
});

describe("rótulo do afiliado", () => {
  it("monta af-<codigo> com código em minúsculas e números", () => {
    expect(rotuloDoAfiliado("joao2026")).toBe("af-joao2026");
  });

  it("recusa código fora do formato e código que estoura o limite", () => {
    expect(rotuloDoAfiliado("JOAO")).toBeNull();
    expect(rotuloDoAfiliado("jo")).toBeNull();
    expect(rotuloDoAfiliado("a.b")).toBeNull();
    expect(rotuloDoAfiliado("a".repeat(41))).toBeNull();
  });
});

describe("identificar o endereço que chegou", () => {
  it("reconhece a organização pelo rótulo", () => {
    expect(identificarHost(`rifa-solidaria.${BASE}`, BASE)).toEqual({
      tipo: "organizacao",
      slug: "rifa-solidaria",
    });
  });

  it("reconhece o afiliado pelo prefixo, sem o af- no código", () => {
    expect(identificarHost(`af-joao2026.${BASE}`, BASE)).toEqual({
      tipo: "afiliado",
      codigo: "joao2026",
    });
  });

  it("ignora maiúscula e porta no Host", () => {
    expect(identificarHost(`Rifa-Solidaria.${BASE.toUpperCase()}:443`, BASE)).toEqual({
      tipo: "organizacao",
      slug: "rifa-solidaria",
    });
  });

  it("recusa domínio que não é o base", () => {
    expect(identificarHost("rifa.outro.com", BASE)).toBeNull();
    expect(identificarHost(`x${BASE}`, BASE)).toBeNull();
  });

  it("recusa mais de um nível antes do base (não é rótulo único)", () => {
    expect(identificarHost(`a.b.${BASE}`, BASE)).toBeNull();
  });

  it("recusa o próprio base e rótulo reservado", () => {
    expect(identificarHost(BASE, BASE)).toBeNull();
    expect(identificarHost(`admin.${BASE}`, BASE)).toBeNull();
  });

  it("sem base configurado, nada é reconhecido", () => {
    expect(identificarHost(`rifa.${BASE}`, null)).toBeNull();
  });
});

describe("endereço de divulgação", () => {
  it("sem domínio configurado, não há link (o sistema segue como hoje)", () => {
    expect(hostDoRotulo("rifa", null)).toBeNull();
    expect(
      linkDaRifaNoEndereco({ base: null, rotuloDaOrganizacao: "rifa", rifaSlug: "moto" }),
    ).toBeNull();
  });

  it("organização divulga pelo próprio subdomínio, sem ref", () => {
    expect(
      linkDaRifaNoEndereco({ base: BASE, rotuloDaOrganizacao: "rifa-solidaria", rifaSlug: "moto-2026" }),
    ).toBe(`https://rifa-solidaria.${BASE}/r/moto-2026`);
  });

  it("afiliado divulga pelo subdomínio da organização, com o ref dele", () => {
    expect(
      linkDaRifaNoEndereco({
        base: BASE,
        rotuloDaOrganizacao: "rifa-solidaria",
        rifaSlug: "moto-2026",
        codigoDoAfiliado: "joao2026",
      }),
    ).toBe(`https://rifa-solidaria.${BASE}/r/moto-2026?ref=joao2026`);
  });

  it("o link volta a ser reconhecido: o host do link identifica a organização", () => {
    const link = linkDaRifaNoEndereco({ base: BASE, rotuloDaOrganizacao: "rifa-solidaria", rifaSlug: "moto" });
    const host = new URL(link!).host;
    expect(identificarHost(host, BASE)).toEqual({ tipo: "organizacao", slug: "rifa-solidaria" });
  });
});

describe("reconhecimento do subdomínio no servidor", () => {
  it("sem SUBDOMINIO_BASE, nenhum endereço é reconhecido (o sistema segue como hoje)", async () => {
    const { destinoDoSubdominio, subdominioBaseDoAmbiente } = await import("../server/services/subdominio");
    expect(subdominioBaseDoAmbiente({} as NodeJS.ProcessEnv)).toBeNull();
    expect(destinoDoSubdominio(`rifa-solidaria.${BASE}`, null)).toBeNull();
  });

  it("com a base configurada, lê a base em minúsculas e sem espaço", async () => {
    const { subdominioBaseDoAmbiente } = await import("../server/services/subdominio");
    expect(subdominioBaseDoAmbiente({ SUBDOMINIO_BASE: "  Rifas.Exemplo.com.br " } as NodeJS.ProcessEnv)).toBe(
      "rifas.exemplo.com.br",
    );
  });

  it("reconhece a organização e o afiliado pelo Host, e ignora o domínio principal", async () => {
    const { destinoDoSubdominio } = await import("../server/services/subdominio");
    expect(destinoDoSubdominio(`rifa-solidaria.${BASE}`, BASE)).toEqual({ tipo: "organizacao", slug: "rifa-solidaria" });
    expect(destinoDoSubdominio(`af-joao2026.${BASE}`, BASE)).toEqual({ tipo: "afiliado", codigo: "joao2026" });
    expect(destinoDoSubdominio(BASE, BASE)).toBeNull();
    expect(destinoDoSubdominio(undefined, BASE)).toBeNull();
  });

  it("o middleware só marca res.locals e segue sem responder", async () => {
    const { reconhecerSubdominio } = await import("../server/services/subdominio");
    const res = { locals: {} as Record<string, unknown> };
    let seguiu = false;
    const req = { headers: { host: `rifa-solidaria.${BASE}` } };
    const old = process.env.SUBDOMINIO_BASE;
    process.env.SUBDOMINIO_BASE = BASE;
    try {
      reconhecerSubdominio(req as never, res as never, () => {
        seguiu = true;
      });
    } finally {
      if (old === undefined) delete process.env.SUBDOMINIO_BASE;
      else process.env.SUBDOMINIO_BASE = old;
    }
    expect(seguiu).toBe(true);
    expect(res.locals.subdominio).toEqual({ tipo: "organizacao", slug: "rifa-solidaria" });
  });
});
