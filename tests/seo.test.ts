import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  MARCADOR_DE_META,
  blocoDeMeta,
  comMeta,
  lerCaminho,
  caminhoNaoIndexa,
  escaparAtributo,
  indexacaoLigada,
  resumir,
  robotsTxt,
  sitemapXml,
  urlSegura,
} from "../shared/seo";
import { identificacaoDaPlataforma, identificacaoDaPromotora } from "../shared/rodape";

describe("seo: o bloco do <head>", () => {
  it("escapa tudo o que vem de fora (título e descrição são texto da organização)", () => {
    const b = blocoDeMeta({ titulo: 'Rifa "x" <script>alert(1)</script>', descricao: "a & b", canonico: "https://a.b/" });
    expect(b).not.toContain("<script>");
    expect(b).toContain("&lt;script&gt;");
    expect(b).toContain("&amp;");
    expect(b).toContain('rel="canonical" href="https://a.b/"');
  });
  it("só aceita http(s) sem usuário no canonical e na imagem", () => {
    expect(urlSegura("javascript:alert(1)")).toBeNull();
    expect(urlSegura("https://u:p@a.b/")).toBeNull();
    const b = blocoDeMeta({ titulo: "t", descricao: "d", canonico: "javascript:x", imagem: "data:text/html,x" });
    expect(b).not.toContain("canonical");
    expect(b).not.toContain("og:image");
  });
  it("noindex e a marca do endereço só quando pedidos", () => {
    expect(blocoDeMeta({ titulo: "t", descricao: "d" })).not.toContain("robots");
    expect(blocoDeMeta({ titulo: "t", descricao: "d", naoIndexar: true })).toContain('content="noindex, nofollow"');
    expect(blocoDeMeta({ titulo: "t", descricao: "d", noEnderecoDaOrganizacao: true })).toContain('name="rifa:endereco"');
  });
  it("resumir corta com reticências sem passar do teto", () => {
    expect(resumir("a  b\n c", 50)).toBe("a b c");
    expect(resumir("x".repeat(300), 20).length).toBeLessThanOrEqual(20);
  });
  it("escaparAtributo", () => {
    expect(escaparAtributo('"<&>')).toBe("&quot;&lt;&amp;&gt;");
  });
});

describe("seo: o que nunca indexa", () => {
  it.each(["/admin", "/admin/pedidos", "/entrar", "/perfil/bilhetes", "/carrinho/pix/123", "/pedido/123", "/Minhas-Compras"])(
    "%s",
    (c) => expect(caminhoNaoIndexa(c)).toBe(true),
  );
  it("a vitrine, o perfil e a rifa indexam; prefixo parecido não conta", () => {
    for (const c of ["/", "/o/org", "/o/org/r/rifa", "/r/rifa", "/ajuda", "/termos", "/perfilx", "/api/public/o/x/foto"]) {
      expect(caminhoNaoIndexa(c)).toBe(false);
    }
  });
});

describe("seo: robots.txt e sitemap.xml", () => {
  it("o host que não é da casa não se indexa", () => {
    expect(robotsTxt("outro", "https://a.b/sitemap.xml")).toBe("User-agent: *\nDisallow: /\n");
  });
  it("principal e endereço: Disallow das áreas privadas, e o sitemap só quando passado", () => {
    const sem = robotsTxt("organizacao", null);
    expect(sem).toContain("Disallow: /admin");
    expect(sem).toContain("Disallow: /carrinho");
    expect(sem).not.toContain("Sitemap");
    expect(sem).not.toContain("Disallow: /api");
    expect(robotsTxt("principal", "https://a.b/sitemap.xml")).toContain("Sitemap: https://a.b/sitemap.xml");
    expect(robotsTxt("principal", "javascript:x")).not.toContain("Sitemap");
  });
  it("sitemap escapa, descarta endereço torto e leva a data", () => {
    const xml = sitemapXml([
      { loc: "https://a.b/r/x?a=1&b=2", lastmod: new Date("2026-10-18T10:00:00Z") },
      { loc: "javascript:alert(1)" },
    ]);
    expect(xml).toContain("<loc>https://a.b/r/x?a=1&amp;b=2</loc>");
    expect(xml).toContain("<lastmod>2026-10-18T10:00:00.000Z</lastmod>");
    expect(xml).not.toContain("javascript");
  });
  it("a indexação nasce desligada", () => {
    expect(indexacaoLigada({})).toBe(false);
    expect(indexacaoLigada({ SEO_INDEXAR: "1" })).toBe(true);
    expect(indexacaoLigada({ SEO_INDEXAR: "true" })).toBe(false);
  });
});

describe("seo: o caminho aberto", () => {
  it("lê início, perfil e rifa, no principal e no endereço", () => {
    expect(lerCaminho("/")).toEqual({ tipo: "inicio" });
    expect(lerCaminho("/o/Org/")).toEqual({ tipo: "perfil", slug: "org" });
    expect(lerCaminho("/o/org/r/Rifa-1")).toEqual({ tipo: "rifa", slug: "rifa-1", org: "org" });
    expect(lerCaminho("/r/rifa-1?ref=x")).toEqual({ tipo: "rifa", slug: "rifa-1" });
    expect(lerCaminho("/entrar")).toEqual({ tipo: "outra" });
  });
});

describe("seo: o index.html", () => {
  const html = fs.readFileSync("client/index.html", "utf8");
  it("tem o marcador uma vez, fora de qualquer <script>", () => {
    expect(html.split(MARCADOR_DE_META).length).toBe(2);
    for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) expect(m[1]).not.toContain(MARCADOR_DE_META);
  });
  it("a abertura da plataforma não aparece no endereço da organização", () => {
    const script = html.slice(html.indexOf("// A abertura:"), html.indexOf("</script>", html.indexOf("// A abertura:")));
    expect(script).toContain('meta[name="rifa:endereco"]');
  });
  it("troca o marcador, o título e a descrição só quando a página tem os dela", () => {
    const com = comMeta(html, MARCADOR_DE_META, { titulo: "Rifa <b>", descricao: "d", canonico: "https://a.b/r/x" });
    expect(com).not.toContain(MARCADOR_DE_META);
    expect(com).toContain("<title>Rifa &lt;b&gt;</title>");
    expect(com).toContain('rel="canonical"');
    const generica = comMeta(html, MARCADOR_DE_META, { titulo: "Loterias do Bem", descricao: "x" });
    expect(generica).toContain("<title>Loterias do Bem</title>");
    expect(comMeta("sem marcador", MARCADOR_DE_META, { titulo: "t", descricao: "d" })).toBe("sem marcador");
  });
});

describe("a identificação nas duas pontas do endereço (R31)", () => {
  it("a plataforma só aparece com razão social e CNPJ conferidos", () => {
    expect(identificacaoDaPlataforma({})).toBeNull();
    expect(identificacaoDaPlataforma({ razaoSocial: "Loterias do Bem Ltda", cnpj: "11222333000181", contato: "oi@x.com.br" })).toEqual({
      razaoSocial: "Loterias do Bem Ltda",
      cnpj: "11.222.333/0001-81",
      email: "oi@x.com.br",
    });
  });
  it("a promotora: só o que ela cadastrou, no máximo três autorizações", () => {
    const p = identificacaoDaPromotora({ nome: "Org", cnpj: null, local: " ", autorizacoes: ["1", "2", "3", "4", ""] });
    expect(p).toEqual({ nome: "Org", cnpj: null, local: null, autorizacoes: ["1", "2", "3"] });
  });
});
