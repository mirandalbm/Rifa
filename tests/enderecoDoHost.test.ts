import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  esquecerOrigensVistas,
  exigirOrigemDoHost,
  origemRecusa,
  protegerOHost,
  registrarOrigemDiferente,
} from "../server/services/enderecoDoHost";

type Resposta = {
  status?: number;
  corpo?: unknown;
  redirecionou?: { codigo: number; para: string };
  cabecalhos: Record<string, string>;
};

function rodar(
  middleware: (req: never, res: never, next: () => void) => unknown,
  req: { method?: string; url?: string; headers?: Record<string, string> },
) {
  const r: Resposta = { cabecalhos: {} };
  const res = {
    setHeader: (k: string, v: string) => void (r.cabecalhos[k.toLowerCase()] = v),
    redirect: (codigo: number, para: string) => void (r.redirecionou = { codigo, para }),
    status: (c: number) => {
      r.status = c;
      return { json: (b: unknown) => void (r.corpo = b) };
    },
  };
  let seguiu = false;
  const url = req.url ?? "/";
  middleware({ method: req.method ?? "GET", originalUrl: url, headers: req.headers ?? {} } as never, res as never, () => {
    seguiu = true;
  });
  return { r, seguiu };
}

const guardados: Record<string, string | undefined> = {};
function ambiente(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (!(k in guardados)) guardados[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  esquecerOrigensVistas();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  for (const [k, v] of Object.entries(guardados)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    delete guardados[k];
  }
  vi.restoreAllMocks();
});

describe("protegerOHost", () => {
  beforeEach(() => ambiente({ PUBLIC_BASE_URL: "https://loteriasdobem.com.br", SUBDOMINIO_BASE: undefined, NODE_ENV: "production" }));

  it("manda o www para a casa principal com o mesmo caminho e a consulta (301 na leitura)", () => {
    const { r, seguiu } = rodar(protegerOHost, { url: "/r/moto-2026?ref=joao", headers: { host: "www.loteriasdobem.com.br" } });
    expect(seguiu).toBe(false);
    expect(r.redirecionou).toEqual({ codigo: 301, para: "https://loteriasdobem.com.br/r/moto-2026?ref=joao" });
  });

  it("308 para o que muda estado, para o método e o corpo se manterem", () => {
    const { r } = rodar(protegerOHost, { method: "POST", url: "/api/public/orders", headers: { host: "www.loteriasdobem.com.br" } });
    expect(r.redirecionou?.codigo).toBe(308);
  });

  it("webhook e relatório de CSP não são redirecionados", () => {
    for (const url of ["/api/webhooks/asaas", "/api/csp-relatorio"]) {
      const { r, seguiu } = rodar(protegerOHost, { method: "POST", url, headers: { host: "www.loteriasdobem.com.br" } });
      expect(seguiu, url).toBe(true);
      expect(r.redirecionou, url).toBeUndefined();
    }
  });

  it("a casa principal segue sem redirecionar e sem noindex", () => {
    const { r, seguiu } = rodar(protegerOHost, { headers: { host: "loteriasdobem.com.br" } });
    expect(seguiu).toBe(true);
    expect(r.redirecionou).toBeUndefined();
    expect(r.cabecalhos["x-robots-tag"]).toBeUndefined();
  });

  it("host desconhecido (o domínio da Railway) segue servindo, só com noindex", () => {
    const { r, seguiu } = rodar(protegerOHost, { headers: { host: "rifa-production.up.railway.app" } });
    expect(seguiu).toBe(true);
    expect(r.redirecionou).toBeUndefined();
    expect(r.cabecalhos["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("não olha X-Forwarded-Host", () => {
    const { r } = rodar(protegerOHost, {
      headers: { host: "rifa-production.up.railway.app", "x-forwarded-host": "loteriasdobem.com.br" },
    });
    expect(r.cabecalhos["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("o endereço de uma organização é conhecido quando a base está ligada", () => {
    ambiente({ SUBDOMINIO_BASE: "loteriasdobem.com.br" });
    const { r } = rodar(protegerOHost, { headers: { host: "rifa-solidaria.loteriasdobem.com.br" } });
    expect(r.cabecalhos["x-robots-tag"]).toBeUndefined();
  });

  it("sem PUBLIC_BASE_URL (desenvolvimento) não faz nada", () => {
    ambiente({ PUBLIC_BASE_URL: undefined });
    const { r, seguiu } = rodar(protegerOHost, { headers: { host: "www.qualquer.com" } });
    expect(seguiu).toBe(true);
    expect(r.redirecionou).toBeUndefined();
    expect(r.cabecalhos["x-robots-tag"]).toBeUndefined();
  });
});

describe("exigirOrigemDoHost", () => {
  beforeEach(() => ambiente({ PUBLIC_BASE_URL: "https://loteriasdobem.com.br", SUBDOMINIO_BASE: "loteriasdobem.com.br", NODE_ENV: "production", ORIGEM_POR_HOST: undefined }));

  const de = (extra: Record<string, string>) => ({
    method: "POST",
    url: "/api/public/orders",
    headers: { host: "loteriasdobem.com.br", ...extra },
  });

  it("origem igual passa em silêncio", () => {
    const { seguiu } = rodar(exigirOrigemDoHost, de({ origin: "https://loteriasdobem.com.br" }));
    expect(seguiu).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("em modo relatório, a origem de outro endereço passa mas vai ao log (uma linha por hora)", () => {
    for (let i = 0; i < 3; i++) {
      const { seguiu, r } = rodar(exigirOrigemDoHost, de({ origin: "https://rifa-solidaria.loteriasdobem.com.br" }));
      expect(seguiu).toBe(true);
      expect(r.status).toBeUndefined();
    }
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(String((console.warn as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0])).toBe(
      "[origem] modo relatório recusaria: origin-de-outro-host host=principal",
    );
  });

  it("o log não leva o Host nem a Origin inteiros", () => {
    rodar(exigirOrigemDoHost, de({ origin: "https://golpe.exemplo.net" }));
    const linha = String((console.warn as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0]);
    expect(linha).not.toContain("golpe");
    expect(linha).not.toContain("loteriasdobem");
  });

  it("com ORIGEM_POR_HOST=recusar, a origem diferente é 403", () => {
    ambiente({ ORIGEM_POR_HOST: "recusar" });
    expect(origemRecusa()).toBe(true);
    const { seguiu, r } = rodar(exigirOrigemDoHost, de({ origin: "https://golpe.exemplo.net" }));
    expect(seguiu).toBe(false);
    expect(r.status).toBe(403);
    expect(r.corpo).toEqual({ message: "Origem não permitida." });
  });

  it("leitura, webhook e relatório de CSP não são conferidos", () => {
    ambiente({ ORIGEM_POR_HOST: "recusar" });
    const fora = { origin: "https://golpe.exemplo.net" };
    expect(rodar(exigirOrigemDoHost, { method: "GET", url: "/api/public/rifas", headers: { host: "loteriasdobem.com.br", ...fora } }).seguiu).toBe(true);
    expect(rodar(exigirOrigemDoHost, { method: "POST", url: "/api/webhooks/pagarme?t=x", headers: { host: "loteriasdobem.com.br", ...fora } }).seguiu).toBe(true);
    expect(rodar(exigirOrigemDoHost, { method: "POST", url: "/api/csp-relatorio", headers: { host: "loteriasdobem.com.br", ...fora } }).seguiu).toBe(true);
  });

  it("curl e prova (sem Origin nem Sec-Fetch-Site) passam mesmo recusando", () => {
    ambiente({ ORIGEM_POR_HOST: "recusar" });
    expect(rodar(exigirOrigemDoHost, de({})).seguiu).toBe(true);
  });

  it("só o texto exato 'recusar' liga a recusa", () => {
    for (const v of [undefined, "", "1", "true", "relatorio"]) expect(origemRecusa({ ORIGEM_POR_HOST: v } as NodeJS.ProcessEnv)).toBe(false);
    expect(origemRecusa({ ORIGEM_POR_HOST: " Recusar " } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("o registro agrupa por hora e tem teto", () => {
    expect(registrarOrigemDiferente("a", "principal", 0)).toBe(true);
    expect(registrarOrigemDiferente("a", "principal", 1000)).toBe(false);
    expect(registrarOrigemDiferente("a", "principal", 61 * 60_000)).toBe(true);
    for (let i = 0; i < 200; i++) registrarOrigemDiferente(`m${i}`, "outro", 0);
    expect(registrarOrigemDiferente("m199", "outro", 10)).toBe(false);
  });
});
