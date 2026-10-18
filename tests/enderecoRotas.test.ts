import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { decidirNoEndereco, ehArquivoEstatico, exemploDeCaminho, temClasse } from "../shared/enderecoRotas";

const ORG = "rifa-solidaria";
const d = (metodo: string, caminho: string) => decidirNoEndereco(metodo, caminho, ORG);

describe("páginas no endereço da organização", () => {
  it("a raiz e as páginas da compra seguem", () => {
    for (const c of ["/", "/pedido/12345678", "/carrinho", "/carrinho/pix/123456789", "/entrar", "/criar-conta", "/minhas-compras", "/minhas-cotas", "/notificacoes", "/perfil", "/perfil/bilhetes", "/perfil/configuracoes", "/ajuda", "/termos", "/privacidade", "/bilhete/1", "/recibo/abc"]) {
      expect(d("GET", c), c).toEqual({ acao: "seguir" });
    }
  });

  it("a rifa e o regulamento pedem que a rifa seja da organização", () => {
    expect(d("GET", "/r/moto-2026")).toEqual({ acao: "conferir-rifa", slug: "moto-2026" });
    expect(d("GET", "/r/moto-2026/regulamento")).toEqual({ acao: "conferir-rifa", slug: "moto-2026" });
  });

  it("/o/<este rótulo> vira o caminho curto (301); /o/<outra> vai ao principal", () => {
    expect(d("GET", `/o/${ORG}`)).toEqual({ acao: "canonico", para: "/" });
    expect(d("GET", `/o/${ORG}/r/moto`)).toEqual({ acao: "canonico", para: "/r/moto" });
    expect(d("GET", `/o/${ORG}/r/moto/regulamento`)).toEqual({ acao: "canonico", para: "/r/moto/regulamento" });
    expect(d("GET", "/o/outra")).toEqual({ acao: "principal" });
    expect(d("GET", "/o/outra/r/x")).toEqual({ acao: "principal" });
    // rótulo parecido não é o mesmo
    expect(d("GET", `/o/${ORG}-2`)).toEqual({ acao: "principal" });
  });

  it("o que é da plataforma vai ao principal", () => {
    for (const c of ["/reels", "/buscar", "/mensagens", "/mensagens/abc", "/u/ana", "/publicar", "/seja-afiliado", "/estado/SP"]) {
      expect(d("GET", c), c).toEqual({ acao: "principal" });
    }
  });

  it("painel e conta de painel respondem 404 no endereço", () => {
    for (const c of ["/admin", "/admin/campanhas", "/afiliado/saques", "/cambista", "/conta/senha"]) {
      expect(d("GET", c), c).toEqual({ acao: "404" });
    }
  });

  it("caminho que ninguém classificou é 404 (lista fechada)", () => {
    expect(d("GET", "/qualquer-coisa-nova")).toEqual({ acao: "404" });
    expect(d("GET", "/r")).toEqual({ acao: "404" });
  });

  it("arquivos da casca seguem", () => {
    for (const c of ["/assets/index-abc.js", "/icons/icon-192.png", "/sw.js", "/manifest.webmanifest", "/bandeiras/sp.svg", "/uploads/campanhas/x/foto.webp", "/robots.txt"]) {
      expect(ehArquivoEstatico(c), c).toBe(true);
      expect(d("GET", c), c).toEqual({ acao: "seguir" });
    }
    expect(ehArquivoEstatico("/api/public/o/x/qr.svg")).toBe(false);
  });

  it("endereço curto e link do perfil seguem (o curto de outra organização é do PR 4)", () => {
    expect(d("GET", "/c/abc123")).toEqual({ acao: "conferir-curto", tipo: "c", chave: "abc123" });
    expect(d("GET", "/l/rifa-solidaria/0")).toEqual({ acao: "conferir-curto", tipo: "l", chave: "rifa-solidaria" });
  });
});

describe("API no endereço da organização", () => {
  it("/api/public/o/:slug pede que o slug seja o do endereço", () => {
    expect(d("GET", `/api/public/o/${ORG}`)).toEqual({ acao: "conferir-organizacao", slug: ORG });
    expect(d("POST", "/api/public/o/outra/seguir")).toEqual({ acao: "conferir-organizacao", slug: "outra" });
  });

  it("/api/public/campaigns/:slug… pede que a rifa seja da organização; a lista é da plataforma", () => {
    expect(d("GET", "/api/public/campaigns/moto")).toEqual({ acao: "conferir-rifa", slug: "moto" });
    expect(d("GET", "/api/public/campaigns/moto/numbers/7")).toEqual({ acao: "conferir-rifa", slug: "moto" });
    expect(d("POST", "/api/public/campaigns/moto/comentarios")).toEqual({ acao: "conferir-rifa", slug: "moto" });
    expect(d("GET", "/api/public/campaigns")).toEqual({ acao: "principal" });
    expect(d("GET", "/api/public/mensagens/grupos/rifa/moto")).toEqual({ acao: "conferir-rifa", slug: "moto" });
  });

  it("a compra confere a rifa do corpo", () => {
    // cada rota confere o campo que ELA usa (o outro, de enfeite, não vale)
    expect(d("POST", "/api/public/orders")).toEqual({ acao: "conferir-corpo", campo: "campaignId" });
    expect(d("POST", "/api/public/carrinho")).toEqual({ acao: "conferir-corpo", campo: "itens" });
    expect(d("POST", "/api/public/carrinho/checkout")).toEqual({ acao: "conferir-corpo", campo: "itens" });
    // a consulta do pedido é por código
    expect(d("GET", "/api/public/orders/12345678")).toEqual({ acao: "seguir" });
  });

  it("vitrine, feed, Reels, Buscar, mensagens, sorteio oficial e Google são da plataforma", () => {
    for (const c of ["/api/public/vitrine/ao-vivo", "/api/public/reels", "/api/public/buscar", "/api/public/estados", "/api/public/patrocinadas", "/api/public/banners", "/api/public/sorteio-oficial", "/api/public/stories", "/api/public/u/ana", "/api/public/mensagens/conversas", "/api/public/conta/google/entrar", "/api/public/divulgacoes/feed", "/api/public/seguindo"]) {
      expect(d("GET", c), c).toEqual({ acao: "principal" });
    }
  });

  it("conta, notificações, pedido e o próprio endereço seguem", () => {
    for (const c of ["/api/public/endereco", "/api/public/conta", "/api/public/conta/perfil", "/api/public/notificacoes", "/api/public/tickets/1", "/api/public/app", "/api/public/template", "/api/public/checkout", "/api/public/marketing", "/api/public/cep/01001000"]) {
      expect(d("GET", c), c).toEqual({ acao: "seguir" });
    }
  });

  it("o painel, os webhooks e a API de papel não existem no endereço", () => {
    for (const c of ["/api/admin/campaigns", "/api/affiliate/saldo", "/api/seller/sales", "/api/ia/conta", "/api/webhooks/asaas", "/api/dev/google", "/api/auth/login", "/api/auth/senha"]) {
      expect(d("POST", c), c).toEqual({ acao: "404" });
      expect(d("GET", c), c).toEqual({ acao: "404" });
    }
  });

  it("só o que o SPA precisa para saber quem está logado passa fora de /api/public", () => {
    expect(d("GET", "/api/auth/me")).toEqual({ acao: "seguir" });
    expect(d("POST", "/api/auth/logout")).toEqual({ acao: "seguir" });
    expect(d("POST", "/api/csp-relatorio")).toEqual({ acao: "seguir" });
  });

  it("rota pública nova sem classe é 404", () => {
    expect(d("GET", "/api/public/rota-que-ninguem-classificou")).toEqual({ acao: "404" });
    expect(temClasse("GET", "/api/public/rota-que-ninguem-classificou")).toBe(false);
  });
});

describe("o que o Express casa e a lista fechada não pode ler diferente", () => {
  it("a API em outra caixa (o Express casa sem diferenciar maiúscula) é 404", () => {
    for (const c of ["/API/public/campaigns/x", "/Api/admin/campaigns", "/API/Public/o/x/qr.svg", "/api/Public/campaigns/x", "/api/public/Campaigns/x", "/API/auth/login", "/API/webhooks/asaas", "/API"]) {
      expect(d("GET", c), c).toEqual({ acao: "404" });
      expect(d("POST", c), c).toEqual({ acao: "404" });
      expect(temClasse("GET", c), c).toBe(false);
      expect(ehArquivoEstatico(c), c).toBe(false);
    }
  });

  it("forma absoluta do pedido (`GET http://x/…`) é 404", () => {
    expect(d("GET", "http://x/api/public/campaigns/b")).toEqual({ acao: "404" });
    expect(d("GET", "//x/api/public/campaigns/b")).toEqual({ acao: "404" });
  });

  it("o painel responde 404 mesmo com extensão de arquivo", () => {
    for (const c of ["/admin/x.png", "/Admin", "/AFILIADO/saques", "/cambista/a.css"]) {
      expect(d("GET", c), c).toEqual({ acao: "404" });
    }
  });
});

describe("o 301 do /o/<este rótulo> nunca sai do endereço", () => {
  it("barras a mais no começo viram uma só", () => {
    expect(d("GET", `/o/${ORG}//evil.com/x`)).toEqual({ acao: "canonico", para: "/evil.com/x" });
    expect(d("GET", `/o/${ORG}///evil.com`)).toEqual({ acao: "canonico", para: "/evil.com" });
  });

  it("contrabarra é 404", () => {
    expect(d("GET", `/o/${ORG}/\\evil.com`)).toEqual({ acao: "404" });
  });

  it("todo destino começa com uma barra só", () => {
    for (const c of [`/o/${ORG}`, `/o/${ORG}/`, `/o/${ORG}/r/x`, `/o/${ORG}//a`, `/o/${ORG}////a/b`]) {
      const r = d("GET", c);
      if (r.acao === "canonico") expect(r.para, c).toMatch(/^\/(?!\/)/);
    }
  });
});

describe("toda rota registrada tem classe escrita", () => {
  const rotasDe = (arquivo: string, padrao: RegExp) =>
    [...fs.readFileSync(arquivo, "utf8").matchAll(padrao)].map((m) => ({ metodo: m[1]!.toUpperCase(), rota: m[2]! }));

  it("as 156 rotas de publicRouter (a mensagem diz qual ficou sem classe)", () => {
    const rotas = rotasDe("server/routes/public.ts", /publicRouter\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g);
    expect(rotas.length).toBeGreaterThan(100);
    const sem = rotas.filter((r) => !temClasse(r.metodo, `/api/public${exemploDeCaminho(r.rota)}`)).map((r) => `${r.metodo} /api/public${r.rota}`);
    expect(sem, `Rotas sem classe em shared/enderecoRotas.ts: ${sem.join(", ")}`).toEqual([]);
  });

  it("as páginas do App.tsx", () => {
    const paginas = [...fs.readFileSync("client/src/App.tsx", "utf8").matchAll(/<Route path="([^"]*)"/g)].map((m) => m[1]!);
    expect(paginas.length).toBeGreaterThan(50);
    const sem = paginas.filter((p) => !temClasse("GET", exemploDeCaminho(p)));
    expect(sem, `Páginas sem classe em shared/enderecoRotas.ts: ${sem.join(", ")}`).toEqual([]);
  });

  it("os roteadores montados em routes/index.ts (prefixos de /api)", () => {
    const montados = [...fs.readFileSync("server/routes/index.ts", "utf8").matchAll(/app\.use\("(\/api\/[a-z]+)"/g)].map((m) => m[1]!);
    // todos os que não são /api/public ou /api/auth caem em 404 de propósito
    for (const m of montados.filter((x) => x !== "/api/public" && x !== "/api/auth")) {
      expect(decidirNoEndereco("GET", `${m}/qualquer`, ORG), m).toEqual({ acao: "404" });
    }
  });
});
