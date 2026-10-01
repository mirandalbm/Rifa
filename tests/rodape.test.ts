import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { APOIOS_DE_EXEMPLO, COLUNAS_DO_RODAPE, REDES_DE_EXEMPLO, rodapeEmModoExemplo } from "../shared/rodape";
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
