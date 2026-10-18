import { describe, expect, it } from "vitest";
import {
  destinoDoWww,
  hostEhConhecido,
  hostNormalizado,
  identificarHost,
  motivoDeOrigemDiferente,
  problemaParaLigarEndereco,
  rotuloPareceMarca,
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

describe("rótulo: dois hífens, punycode e marcas", () => {
  it("recusa dois hífens seguidos e o punycode", () => {
    expect(problemaNoRotulo("a--b")).toMatch(/dois hífens/);
    expect(problemaNoRotulo("xn--rifa-9ra")).toMatch(/dois hífens/);
    expect(identificarHost(`a--b.${BASE}`, BASE)).toBeNull();
    expect(identificarHost(`xn--rifa-9ra.${BASE}`, BASE)).toBeNull();
    expect(identificarHost(`af-jo--ao.${BASE}`, BASE)).toBeNull();
  });

  it("reserva a marca da casa, do Estado, dos bancos e das redes", () => {
    for (const r of ["loteriasdobem", "caixa", "federal", "gov", "pix", "login", "mercadopago", "google", "whatsapp"]) {
      expect(problemaNoRotulo(r), r).toMatch(/reservado/);
      expect(identificarHost(`${r}.${BASE}`, BASE), r).toBeNull();
    }
  });

  it("rótulo que começa ou termina como a marca pede a ligação manual, sem ser proibido", () => {
    for (const r of ["loteriasdobem-sul", "caixa-premios", "gov-sorteios", "oficial-moto", "rifa-oficial", "x-caixa"]) {
      expect(rotuloPareceMarca(r), r).toBe(true);
      expect(problemaNoRotulo(r), r).toBeNull();
    }
    for (const r of ["rifa-solidaria", "caixas-do-bem", "oficina", "governo"]) {
      expect(rotuloPareceMarca(r), r).toBe(false);
    }
  });
});

describe("o Host que chegou", () => {
  it("tira o ponto final, a maiúscula e a porta", () => {
    expect(hostNormalizado("Rifa.Exemplo.com.br.")).toBe("rifa.exemplo.com.br");
    expect(hostNormalizado("rifa.exemplo.com.br.:443", true)).toBe("rifa.exemplo.com.br");
    expect(identificarHost(`rifa-solidaria.${BASE}.`, BASE)).toEqual({ tipo: "organizacao", slug: "rifa-solidaria" });
  });

  it("em produção só passa a porta padrão; fora dela, qualquer uma", () => {
    expect(hostNormalizado("rifa.exemplo.com.br:8443", true)).toBeNull();
    expect(hostNormalizado("rifa.exemplo.com.br:80", true)).toBe("rifa.exemplo.com.br");
    expect(hostNormalizado("rifa.localhost:5000", false)).toBe("rifa.localhost");
    expect(identificarHost(`rifa-solidaria.${BASE}:8443`, BASE, true)).toBeNull();
    expect(identificarHost(`rifa-solidaria.${BASE}:8443`, BASE, false)).toEqual({
      tipo: "organizacao",
      slug: "rifa-solidaria",
    });
  });

  it("recusa o que não parece nome de máquina", () => {
    for (const h of ["", "a b.com", "a@b.com", "a/b.com", "a\\b.com", "a%2eb.com", "[::1]", "a.com:99999x", "user:pw@a.com"]) {
      expect(hostNormalizado(h), h).toBeNull();
    }
    expect(hostNormalizado(undefined)).toBeNull();
  });
});

describe("www e a casa principal", () => {
  const PRINCIPAL = "https://loteriasdobem.com.br";

  it("o www vai para a raiz, e a raiz não vai a lugar nenhum", () => {
    expect(destinoDoWww("www.loteriasdobem.com.br", PRINCIPAL, true)).toBe("https://loteriasdobem.com.br");
    expect(destinoDoWww("WWW.loteriasdobem.com.br.", PRINCIPAL, true)).toBe("https://loteriasdobem.com.br");
    expect(destinoDoWww("loteriasdobem.com.br", PRINCIPAL, true)).toBeNull();
  });

  it("se o canônico é o www, a raiz é que vai para ele", () => {
    const www = "https://www.loteriasdobem.com.br";
    expect(destinoDoWww("loteriasdobem.com.br", www, true)).toBe(www);
    expect(destinoDoWww("www.loteriasdobem.com.br", www, true)).toBeNull();
  });

  it("outro nome ou endereço de organização não é redirecionado", () => {
    expect(destinoDoWww("rifa-solidaria.loteriasdobem.com.br", PRINCIPAL, true)).toBeNull();
    expect(destinoDoWww("rifa.up.railway.app", PRINCIPAL, true)).toBeNull();
    expect(destinoDoWww("www.outro.com.br", PRINCIPAL, true)).toBeNull();
  });

  it("sem PUBLIC_BASE_URL (ou torta) nada é redirecionado", () => {
    expect(destinoDoWww("www.loteriasdobem.com.br", undefined, true)).toBeNull();
    expect(destinoDoWww("www.loteriasdobem.com.br", "isto não é url", true)).toBeNull();
  });

  it("conhece o principal, o par e o endereço de organização; o resto é desconhecido", () => {
    const base = "loteriasdobem.com.br";
    expect(hostEhConhecido("loteriasdobem.com.br", PRINCIPAL, base, true)).toBe(true);
    expect(hostEhConhecido("www.loteriasdobem.com.br", PRINCIPAL, base, true)).toBe(true);
    expect(hostEhConhecido("rifa-solidaria.loteriasdobem.com.br", PRINCIPAL, base, true)).toBe(true);
    expect(hostEhConhecido("rifa-solidaria.loteriasdobem.com.br", PRINCIPAL, null, true)).toBe(false);
    expect(hostEhConhecido("rifa-production.up.railway.app", PRINCIPAL, base, true)).toBe(false);
    expect(hostEhConhecido("10.0.0.5", PRINCIPAL, base, true)).toBe(false);
    expect(hostEhConhecido(undefined, PRINCIPAL, base, true)).toBe(false);
  });
});

describe("Origin do pedido que muda estado", () => {
  const host = "loteriasdobem.com.br";

  it("o mesmo Host passa", () => {
    expect(motivoDeOrigemDiferente({ host, origin: `https://${host}` }, true)).toBeNull();
    expect(motivoDeOrigemDiferente({ host: "localhost:5000", origin: "http://localhost:5000" })).toBeNull();
  });

  it("outro endereço da mesma família não passa (SameSite não separa subdomínio)", () => {
    expect(motivoDeOrigemDiferente({ host, origin: `https://rifa-solidaria.${host}` }, true)).toBe("origin-de-outro-host");
    expect(motivoDeOrigemDiferente({ host: `a.${host}`, origin: `https://b.${host}` }, true)).toBe("origin-de-outro-host");
  });

  it("origem de fora, nula ou torta não passa", () => {
    expect(motivoDeOrigemDiferente({ host, origin: "https://golpe.com" }, true)).toBe("origin-de-outro-host");
    expect(motivoDeOrigemDiferente({ host, origin: "null" }, true)).toBe("origin-invalida");
    expect(motivoDeOrigemDiferente({ host, origin: "isto não é url" }, true)).toBe("origin-invalida");
  });

  it("em produção a origem precisa ser https", () => {
    expect(motivoDeOrigemDiferente({ host, origin: `http://${host}` }, true)).toBe("origin-sem-https");
    expect(motivoDeOrigemDiferente({ host, origin: `http://${host}` }, false)).toBeNull();
  });

  it("sem Origin, o Sec-Fetch-Site decide", () => {
    expect(motivoDeOrigemDiferente({ host, secFetchSite: "same-origin" })).toBeNull();
    expect(motivoDeOrigemDiferente({ host, secFetchSite: "none" })).toBeNull();
    expect(motivoDeOrigemDiferente({ host, secFetchSite: "same-site" })).toBe("sec-fetch-site-same-site");
    expect(motivoDeOrigemDiferente({ host, secFetchSite: "cross-site" })).toBe("sec-fetch-site-cross-site");
  });

  it("sem nenhum dos dois (curl, prova, servidor a servidor), passa", () => {
    expect(motivoDeOrigemDiferente({ host })).toBeNull();
    expect(motivoDeOrigemDiferente({ host, origin: "", secFetchSite: "" })).toBeNull();
  });

  it("a Origin vence o Sec-Fetch-Site", () => {
    expect(motivoDeOrigemDiferente({ host, origin: `https://${host}`, secFetchSite: "cross-site" }, true)).toBeNull();
  });
});

describe("ligar o endereço da organização", () => {
  const ok = { arquivada: false, banida: false };

  it("slug que vale liga", () => {
    expect(problemaParaLigarEndereco("rifa-solidaria", ok, false)).toBeNull();
  });

  it("slug que não vira rótulo não liga (422)", () => {
    expect(problemaParaLigarEndereco("ab", ok, true)?.status).toBe(422);
    expect(problemaParaLigarEndereco("admin", ok, true)?.status).toBe(422);
    expect(problemaParaLigarEndereco("af-joao", ok, true)?.status).toBe(422);
    expect(problemaParaLigarEndereco("a--b", ok, true)?.status).toBe(422);
  });

  it("arquivada e banida não ligam (409)", () => {
    expect(problemaParaLigarEndereco("rifa-solidaria", { arquivada: true, banida: false }, false)?.status).toBe(409);
    expect(problemaParaLigarEndereco("rifa-solidaria", { arquivada: false, banida: true }, false)?.status).toBe(409);
  });

  it("rótulo que lembra a marca só liga com a confirmação", () => {
    expect(problemaParaLigarEndereco("caixa-premios", ok, false)?.status).toBe(409);
    expect(problemaParaLigarEndereco("caixa-premios", ok, true)).toBeNull();
  });
});
