import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  APOIOS_DE_EXEMPLO,
  AVISO_DE_JOGO_PADRAO,
  COLUNAS_DO_RODAPE,
  REDES_DE_EXEMPLO,
  avisoDeJogoResponsavel,
  linhaDaEmpresa,
  rodapeEmModoExemplo,
} from "../shared/rodape";
import { EMPRESA_VAZIA } from "../shared/legal";
import { perguntasDaAjuda } from "../shared/ajuda";
import { REDES_DO_RODAPE, TEMPLATE_PADRAO, TemplateInvalido, validarRedes, validarTemplate } from "../shared/template";

describe("redes sociais do rodapé", () => {
  it("aceita o endereço da própria rede, sem mexer na ordem", () => {
    const r = validarRedes([
      { rede: "instagram", link: "https://www.instagram.com/rifa.br" },
      { rede: "whatsapp", link: "wa.me/5511999999999" },
      { rede: "youtube", link: "https://youtu.be/abc" },
    ]);
    expect(r.map((x) => x.rede)).toEqual(["instagram", "whatsapp", "youtube"]);
    expect(r[1]!.link).toBe("https://wa.me/5511999999999");
  });

  it("recusa endereço de outro lugar no botão da rede", () => {
    expect(() => validarRedes([{ rede: "instagram", link: "https://golpe.com/instagram.com" }])).toThrow(TemplateInvalido);
    expect(() => validarRedes([{ rede: "instagram", link: "https://instagram.com.golpe.com/x" }])).toThrow(TemplateInvalido);
  });

  it("recusa http, javascript, usuário na URL, rede desconhecida e rede repetida", () => {
    expect(() => validarRedes([{ rede: "facebook", link: "http://facebook.com/x" }])).toThrow(/https/);
    expect(() => validarRedes([{ rede: "facebook", link: "javascript:alert(1)" }])).toThrow(TemplateInvalido);
    expect(() => validarRedes([{ rede: "facebook", link: "https://u:p@facebook.com/x" }])).toThrow(TemplateInvalido);
    expect(() => validarRedes([{ rede: "orkut", link: "https://orkut.com/x" }])).toThrow(TemplateInvalido);
    expect(() => validarRedes([{ rede: "__proto__", link: "https://facebook.com/x" }])).toThrow(TemplateInvalido);
    expect(() =>
      validarRedes([
        { rede: "tiktok", link: "https://tiktok.com/@a" },
        { rede: "tiktok", link: "https://tiktok.com/@b" },
      ]),
    ).toThrow(/duas vezes/);
  });

  it("sem redes é lista vazia, e o template guarda só o que é conhecido", () => {
    expect(validarRedes(undefined)).toEqual([]);
    expect(validarTemplate({ ...TEMPLATE_PADRAO }).redes).toEqual([]);
    const t = validarTemplate({ ...TEMPLATE_PADRAO, redes: [{ rede: "x", link: "https://x.com/rifa", extra: "lixo" }] });
    expect(t.redes).toEqual([{ rede: "x", link: "https://x.com/rifa" }]);
    expect(Object.keys(REDES_DO_RODAPE).length).toBeGreaterThanOrEqual(5);
  });
});

describe("colunas do rodapé", () => {
  const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  const rotas = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]!);
  const ajuda = new Set(perguntasDaAjuda({ taxaReembolsoPct: 10, aceitaReembolso: true }).map((p) => p.id));

  it("tem quatro colunas, cada uma com título e links", () => {
    expect(COLUNAS_DO_RODAPE).toHaveLength(4);
    for (const c of COLUNAS_DO_RODAPE) {
      expect(c.titulo.length).toBeGreaterThan(1);
      expect(c.links.length).toBeGreaterThan(0);
    }
  });

  it("todo link aponta para rota que existe e atalho da ajuda para pergunta que existe", () => {
    for (const c of COLUNAS_DO_RODAPE) {
      for (const l of c.links) {
        if (l.emBreve) {
          expect(l.para, `${l.rotulo}: "em breve" não leva a lugar nenhum`).toBeUndefined();
          continue;
        }
        expect(l.para, l.rotulo).toBeTruthy();
        const [caminho, ancora] = l.para!.split("#");
        expect(rotas, `${l.rotulo} → ${caminho}`).toContain(caminho);
        if (ancora) expect(ajuda.has(ancora), `${l.rotulo} → #${ancora}`).toBe(true);
      }
    }
  });
});

describe("rodapé de exemplo (fase de construção)", () => {
  it("as redes de exemplo passam na régua do servidor e são a raiz do domínio", () => {
    const r = validarRedes(REDES_DE_EXEMPLO);
    expect(r).toHaveLength(REDES_DE_EXEMPLO.length);
    for (const x of r) expect(new URL(x.link).pathname).toBe("/");
  });

  it("os ícones de exemplo se dizem exemplo e não repetem", () => {
    expect(APOIOS_DE_EXEMPLO.every((a) => /^Exemplo/.test(a.nome))).toBe(true);
    expect(new Set(APOIOS_DE_EXEMPLO.map((a) => a.id)).size).toBe(APOIOS_DE_EXEMPLO.length);
  });

  it("só aparece com o rodapé inteiro vazio: qualquer cadastro real o desliga", () => {
    expect(rodapeEmModoExemplo([], [])).toBe(true);
    expect(rodapeEmModoExemplo([{ rede: "x" }], [])).toBe(false);
    expect(rodapeEmModoExemplo([], [{ id: "a" }])).toBe(false);
  });
});

describe("texto oficial embaixo da logo", () => {
  const empresa = { ...EMPRESA_VAZIA, razaoSocial: "Sorte Nacional Ltda", cnpj: "11.222.333/0001-81" };

  it("a empresa vem dos dados publicados, com o CNPJ formatado", () => {
    expect(linhaDaEmpresa(empresa)).toEqual({ razaoSocial: "Sorte Nacional Ltda", cnpj: "11.222.333/0001-81" });
    // O que vem só em dígitos também sai formatado.
    expect(linhaDaEmpresa({ ...empresa, cnpj: "11222333000181" })?.cnpj).toBe("11.222.333/0001-81");
  });

  it("faltando razão social ou CNPJ, a linha não existe — nunca se inventa", () => {
    expect(linhaDaEmpresa(EMPRESA_VAZIA)).toBeNull();
    expect(linhaDaEmpresa({ ...empresa, cnpj: "" })).toBeNull();
    expect(linhaDaEmpresa({ ...empresa, razaoSocial: "" })).toBeNull();
    expect(linhaDaEmpresa(undefined)).toBeNull();
    expect(linhaDaEmpresa(null)).toBeNull();
    expect(linhaDaEmpresa("texto")).toBeNull();
  });

  it("CNPJ sem dígito certo não vira texto na tela", () => {
    expect(linhaDaEmpresa({ ...empresa, cnpj: "11.222.333/0001-82" })).toBeNull();
  });

  it("o aviso de jogo responsável é o do template, senão o padrão", () => {
    expect(avisoDeJogoResponsavel({ jogoResponsavel: "Jogue com responsabilidade." })).toBe("Jogue com responsabilidade.");
    expect(avisoDeJogoResponsavel({ jogoResponsavel: "   " })).toBe(AVISO_DE_JOGO_PADRAO);
    expect(avisoDeJogoResponsavel({ jogoResponsavel: "" })).toBe(AVISO_DE_JOGO_PADRAO);
    expect(avisoDeJogoResponsavel(undefined)).toBe(AVISO_DE_JOGO_PADRAO);
  });

  it("o rodapé lê os dados do template publicado e só mostra o aviso uma vez", () => {
    const fonte = readFileSync(new URL("../client/src/components/RodapeDaPlataforma.tsx", import.meta.url), "utf8");
    expect(fonte).toContain("linhaDaEmpresa(t.legal)");
    expect(fonte).toContain("avisoDeJogoResponsavel(t.textos)");
    // Nada digitado no código: nem CNPJ, nem razão social.
    expect(fonte).not.toMatch(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    // O aviso (e o padrão) não voltam a ser escritos no pé: uma versão só.
    expect(fonte).not.toContain("t.textos.jogoResponsavel");
    expect(fonte).not.toContain("Proibido para menores");
    expect(fonte.match(/\{jogoResponsavel\}/g)).toHaveLength(1);
  });

  it("só no tablet e no computador, como o rodapé de hoje", () => {
    const fonte = readFileSync(new URL("../client/src/components/RodapeDaPlataforma.tsx", import.meta.url), "utf8");
    expect(fonte).toMatch(/<footer className="hidden [^"]*md:block"/);
  });
});
