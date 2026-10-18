import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Link, Route, Router, Switch, useLocation } from "wouter";
import { describe, expect, it, vi } from "vitest";
import { caminhoLogico, caminhoReal, destinoNoEndereco } from "../shared/enderecoRotas";
import { botoesNoEndereco, BOTOES_DO_CONSOLE } from "../shared/console";
import { carregarEndereco, criarHookDoEndereco, enderecoDoApp, lerEndereco } from "../client/src/lib/endereco";

const ORG = "rifa-solidaria";
const PRINCIPAL = "https://www.loteriasdobem.com.br";

describe("caminho lógico e caminho real", () => {
  it("a raiz do endereço é o perfil da organização", () => {
    expect(caminhoLogico("/", ORG)).toBe(`/o/${ORG}`);
    expect(caminhoReal(`/o/${ORG}`, ORG)).toBe("/");
  });

  it("a rifa e o regulamento ganham o prefixo da organização por dentro", () => {
    expect(caminhoLogico("/r/moto", ORG)).toBe(`/o/${ORG}/r/moto`);
    expect(caminhoLogico("/r/moto/regulamento", ORG)).toBe(`/o/${ORG}/r/moto/regulamento`);
    expect(caminhoReal(`/o/${ORG}/r/moto`, ORG)).toBe("/r/moto");
    expect(caminhoReal(`/o/${ORG}/r/moto/regulamento`, ORG)).toBe("/r/moto/regulamento");
  });

  it("ida e volta fecham para o que o navegador mostra", () => {
    for (const real of ["/", "/r/moto", "/r/moto/regulamento", "/carrinho", "/carrinho/pix/123456789", "/entrar", "/perfil/bilhetes", "/pedido/12345678"]) {
      expect(caminhoReal(caminhoLogico(real, ORG), ORG)).toBe(real);
    }
  });

  it("o resto das telas não muda de caminho", () => {
    expect(caminhoLogico("/carrinho", ORG)).toBe("/carrinho");
    expect(caminhoReal("/carrinho", ORG)).toBe("/carrinho");
  });

  it("o prefixo de outra organização não é desfeito", () => {
    expect(caminhoReal("/o/outra", ORG)).toBe("/o/outra");
    expect(caminhoReal(`/o/${ORG}-2`, ORG)).toBe(`/o/${ORG}-2`);
  });
});

describe("para onde um link leva no endereço", () => {
  const d = (para: string) => destinoNoEndereco(para, ORG);

  it("a casa, a rifa e a compra ficam no endereço", () => {
    expect(d("/")).toEqual({ onde: "aqui", real: "/" });
    expect(d(`/o/${ORG}`)).toEqual({ onde: "aqui", real: "/" });
    expect(d(`/o/${ORG}/r/moto`)).toEqual({ onde: "aqui", real: "/r/moto" });
    expect(d("/r/moto")).toEqual({ onde: "aqui", real: "/r/moto" });
    expect(d("/carrinho")).toEqual({ onde: "aqui", real: "/carrinho" });
    expect(d("/perfil")).toEqual({ onde: "aqui", real: "/perfil" });
  });

  it("consulta e âncora acompanham", () => {
    expect(d(`/o/${ORG}/r/moto?comprar=1#numeros`)).toEqual({ onde: "aqui", real: "/r/moto?comprar=1#numeros" });
    expect(d("/entrar?volta=%2Fcarrinho")).toEqual({ onde: "aqui", real: "/entrar?volta=%2Fcarrinho" });
  });

  it("o que é da plataforma sai para o domínio principal", () => {
    for (const p of ["/reels", "/buscar", "/mensagens", "/mensagens/abc", "/u/ana", "/estado/SP", "/publicar", "/seja-afiliado", "/o/outra", "/o/outra/r/x"]) {
      expect(d(p)).toEqual({ onde: "principal", caminho: p });
    }
  });

  it("o painel também sai (no endereço ele não existe)", () => {
    for (const p of ["/admin", "/admin/campanhas", "/afiliado/links", "/cambista"]) {
      expect(d(p)).toEqual({ onde: "principal", caminho: p });
    }
  });

  it("caminho de outro site nunca fica no endereço", () => {
    for (const p of ["//evil.com", "//evil.com/x", "/\\evil.com"]) expect(d(p)).toEqual({ onde: "principal", caminho: "/" });
  });

  it("a consulta de um link da plataforma vai junto", () => {
    expect(d("/buscar?q=moto")).toEqual({ onde: "principal", caminho: "/buscar?q=moto" });
  });
});

describe("console no endereço", () => {
  it("no principal são os seis; no endereço, só os da organização", () => {
    expect(botoesNoEndereco(false)).toEqual(BOTOES_DO_CONSOLE);
    expect(botoesNoEndereco(true).map((b) => b.chave)).toEqual(["inicio", "carrinho", "perfil"]);
  });
});

describe("o que o servidor diz sobre o endereço", () => {
  it("lê a organização com o domínio principal", () => {
    expect(lerEndereco({ tipo: "organizacao", slug: ORG, nome: "Rifa Solidária", principal: PRINCIPAL })).toEqual({
      tipo: "organizacao",
      slug: ORG,
      nome: "Rifa Solidária",
      principal: PRINCIPAL,
    });
  });

  it("sem principal válido, volta ao principal (nunca monta um link para lugar nenhum)", () => {
    for (const principal of [undefined, "", "javascript:alert(1)", "https://u:p@x.com", "https://x.com/caminho", "https://x.com/?a=1", 5]) {
      expect(lerEndereco({ tipo: "organizacao", slug: ORG, nome: "X", principal })).toEqual({ tipo: "principal" });
    }
  });

  it("rótulo fora do formato ou corpo estranho: principal", () => {
    expect(lerEndereco({ tipo: "organizacao", slug: "A B", nome: "X", principal: PRINCIPAL })).toEqual({ tipo: "principal" });
    expect(lerEndereco(null)).toEqual({ tipo: "principal" });
    expect(lerEndereco("organizacao")).toEqual({ tipo: "principal" });
    expect(lerEndereco({ tipo: "inexistente" })).toEqual({ tipo: "inexistente" });
  });

  it("carrega do servidor; a falha duas vezes segue como o principal", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ tipo: "organizacao", slug: ORG, nome: "R", principal: PRINCIPAL }), { status: 200 }));
    expect((await carregarEndereco(ok as unknown as typeof fetch)).tipo).toBe("organizacao");
    expect(enderecoDoApp().tipo).toBe("organizacao");

    const cai = vi.fn(async () => {
      throw new Error("rede");
    });
    expect((await carregarEndereco(cai as unknown as typeof fetch)).tipo).toBe("principal");
    expect(cai).toHaveBeenCalledTimes(2);
  });
});

/** O `Router` do wouter instalado aceita o `hook` e o `hrefs` (suposição 1 do plano). */
describe("o Router do wouter com o hook do endereço", () => {
  function pagina(real: string, filhos: ReturnType<typeof createElement>) {
    const navegarReal = vi.fn();
    const hook = criarHookDoEndereco(ORG, PRINCIPAL, () => [real, navegarReal]);
    return { html: renderToString(createElement(Router, { hook }, filhos)), navegarReal, hook };
  }

  const rotas = createElement(
    Switch,
    null,
    createElement(Route, { path: "/o/:org/r/:slug", component: () => createElement("p", null, "RIFA") }),
    createElement(Route, { path: "/o/:org", component: () => createElement("p", null, "PERFIL") }),
    createElement(Route, { path: "/carrinho", component: () => createElement("p", null, "CARRINHO") }),
    createElement(Route, { component: () => createElement("p", null, "NADA") }),
  );

  it("a raiz abre o perfil e /r/x abre a rifa, sem mudar as rotas", () => {
    expect(pagina("/", rotas).html).toContain("PERFIL");
    expect(pagina("/r/moto", rotas).html).toContain("RIFA");
    expect(pagina("/carrinho", rotas).html).toContain("CARRINHO");
    expect(pagina("/qualquer-coisa", rotas).html).toContain("NADA");
  });

  it("o link do endereço usa o caminho curto; o da plataforma, o domínio principal inteiro", () => {
    const links = createElement(
      "div",
      null,
      createElement(Link, { href: `/o/${ORG}/r/moto` }, "a"),
      createElement(Link, { href: `/o/${ORG}` }, "b"),
      createElement(Link, { href: "/reels" }, "c"),
      createElement(Link, { href: "/o/outra" }, "d"),
      createElement(Link, { href: "/carrinho" }, "e"),
    );
    const { html } = pagina("/", links);
    expect(html).toContain('href="/r/moto"');
    expect(html).toContain('href="/"');
    expect(html).toContain(`href="${PRINCIPAL}/reels"`);
    expect(html).toContain(`href="${PRINCIPAL}/o/outra"`);
    expect(html).toContain('href="/carrinho"');
  });

  it("navegar para um caminho lógico escreve o curto no navegador; o da plataforma sai da aba", () => {
    const sai = vi.fn();
    vi.stubGlobal("window", { location: { assign: sai } });
    try {
      let navegar: ((para: string, o?: { replace?: boolean }) => void) | undefined;
      const Pega = () => {
        navegar = useLocation()[1];
        return null;
      };
      const { navegarReal } = pagina("/", createElement(Pega));
      navegar!(`/o/${ORG}/r/moto?comprar=1`);
      expect(navegarReal).toHaveBeenCalledWith(`/r/moto?comprar=1`, undefined);
      navegar!("/reels");
      expect(sai).toHaveBeenCalledWith(`${PRINCIPAL}/reels`);
      expect(navegarReal).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
