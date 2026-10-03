import { describe, expect, it } from "vitest";
import {
  DE_PARA_DA_DECISAO,
  DIVULGACAO_MIDIAS_MAX,
  MODO_PADRAO,
  linkDaDivulgacao,
  statusInicial,
  validarDecisao,
  podeEditar,
  validarFotos,
  DIVULGACAO_FOTOS_MAX,
  validarDivulgacao,
  validarModo,
} from "../shared/divulgacao";
import { quemPublica } from "../shared/console";

const ID = "11111111-1111-4111-8111-111111111111";

describe("modo de divulgação do afiliado", () => {
  it("nasce pedindo autorização", () => {
    expect(MODO_PADRAO).toBe("autorizacao");
  });
  it("só aceita os dois modos conhecidos", () => {
    expect(validarModo("direta")).toBe("direta");
    expect(validarModo("autorizacao")).toBe("autorizacao");
    expect(() => validarModo("qualquer")).toThrow();
    expect(() => validarModo(undefined)).toThrow();
  });
});

describe("situação inicial", () => {
  it("afiliado vai direto só no modo direto", () => {
    expect(statusInicial("afiliado", "direta")).toBe("publicada");
    expect(statusInicial("afiliado", "autorizacao")).toBe("em_analise");
  });
  it("com foto própria, o afiliado espera a organização mesmo no modo direto", () => {
    expect(statusInicial("afiliado", "direta", true)).toBe("em_analise");
    expect(statusInicial("afiliado", "autorizacao", true)).toBe("em_analise");
    expect(statusInicial("afiliado", "direta", false)).toBe("publicada");
  });
  it("apostador espera a organização em qualquer modo", () => {
    expect(statusInicial("apostador", "direta")).toBe("em_analise");
    expect(statusInicial("apostador", "autorizacao")).toBe("em_analise");
  });
});

describe("validarDivulgacao", () => {
  it("recusa link e telefone na legenda, de qualquer autor", () => {
    expect(() => validarDivulgacao("afiliado", { legenda: "Compre em https://exemplo.com" })).toThrow();
    expect(() => validarDivulgacao("afiliado", { legenda: "Chama 11 98888-7777" })).toThrow();
    expect(() => validarDivulgacao("apostador", { legenda: "Visita www.site.com.br agora" })).toThrow();
  });
  it("afiliado precisa de legenda, mídia da rifa ou foto própria", () => {
    expect(() => validarDivulgacao("afiliado", { legenda: "  " })).toThrow();
    expect(validarDivulgacao("afiliado", { legenda: "" }, 1)).toEqual({ legenda: "", midias: [] });
    expect(validarDivulgacao("afiliado", { legenda: "", midias: [ID] }).midias).toEqual([ID]);
    expect(validarDivulgacao("afiliado", { legenda: "Bora?" }).legenda).toBe("Bora?");
  });
  it("apostador publica só texto", () => {
    expect(() => validarDivulgacao("apostador", { legenda: "Ótima rifa", midias: [ID] })).toThrow();
    expect(() => validarDivulgacao("apostador", { legenda: "a" })).toThrow();
    expect(validarDivulgacao("apostador", { legenda: "Ótima rifa" })).toEqual({ legenda: "Ótima rifa", midias: [] });
  });
  it("mídia só por id, sem repetir e com teto", () => {
    expect(() => validarDivulgacao("afiliado", { legenda: "x ok", midias: ["../../etc"] })).toThrow();
    expect(validarDivulgacao("afiliado", { legenda: "x ok", midias: [ID, ID] }).midias).toHaveLength(1);
    const muitas = Array.from({ length: DIVULGACAO_MIDIAS_MAX + 1 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`);
    expect(() => validarDivulgacao("afiliado", { legenda: "x ok", midias: muitas })).toThrow();
  });
  it("ignora chave desconhecida (preço, status, organização)", () => {
    const v = validarDivulgacao("afiliado", { legenda: "Bora", priceCents: 1, status: "publicada", organizationId: ID });
    expect(Object.keys(v).sort()).toEqual(["legenda", "midias"]);
  });
});

describe("decisão", () => {
  it("aprovar e recusar partem de em análise; retirar, de no ar", () => {
    expect(DE_PARA_DA_DECISAO.aprovar).toEqual({ de: "em_analise", para: "publicada" });
    expect(DE_PARA_DA_DECISAO.recusar.de).toBe("em_analise");
    expect(DE_PARA_DA_DECISAO.remover).toEqual({ de: "publicada", para: "removida" });
  });
  it("recusar e retirar pedem motivo; aprovar não", () => {
    expect(validarDecisao({ acao: "aprovar", versao: 0 })).toEqual({ acao: "aprovar", motivo: null, versao: 0 });
    expect(() => validarDecisao({ acao: "aprovar" })).toThrow();
    expect(() => validarDecisao({ acao: "recusar", versao: 0 })).toThrow();
    expect(validarDecisao({ acao: "recusar", motivo: "Fora do tom", versao: 1 }).motivo).toBe("Fora do tom");
    expect(() => validarDecisao({ acao: "apagar" })).toThrow();
  });
});

describe("edição", () => {
  it("só edita o que ainda vale: em análise ou no ar", () => {
    expect(podeEditar("em_analise")).toBe(true);
    expect(podeEditar("publicada")).toBe(true);
    expect(podeEditar("recusada")).toBe(false);
    expect(podeEditar("removida")).toBe(false);
  });
  it("a decisão leva a versão lida, inteira e não negativa", () => {
    expect(validarDecisao({ acao: "aprovar", versao: 3 }).versao).toBe(3);
    expect(validarDecisao({ acao: "aprovar", versao: 0 }).versao).toBe(0);
    expect(() => validarDecisao({ acao: "aprovar", versao: -1 })).toThrow();
    expect(() => validarDecisao({ acao: "aprovar", versao: "2" })).toThrow();
    expect(() => validarDecisao({ acao: "aprovar", versao: 1.5 })).toThrow();
  });
});

describe("fotos do apostador", () => {
  const foto = "data:image/jpeg;base64,/9j/AAAA";
  it("ausente é nulo (na edição, ficam as que tinha); vazia tira todas", () => {
    expect(validarFotos(undefined)).toBeNull();
    expect(validarFotos(null)).toBeNull();
    expect(validarFotos([])).toEqual([]);
  });
  it("só imagem em base64, até o teto", () => {
    expect(validarFotos([foto, foto])).toHaveLength(2);
    expect(() => validarFotos(Array(DIVULGACAO_FOTOS_MAX + 1).fill(foto))).toThrow();
    expect(() => validarFotos(["https://site/x.jpg"])).toThrow();
    expect(() => validarFotos(["data:text/html;base64,PHNjcmlwdD4="])).toThrow();
    expect(() => validarFotos("nao-e-lista")).toThrow();
    expect(() => validarFotos(["data:image/svg+xml;base64,PHN2Zz4="])).toThrow();
    expect(validarFotos(["data:image/png;base64,AAAA", "data:image/webp;base64,AAAA"])).toHaveLength(2);
  });
});

describe("link da divulgação", () => {
  it("leva o código do afiliado; o do apostador é a rifa limpa", () => {
    expect(linkDaDivulgacao("rifa-x", "JOAO7")).toBe("/r/rifa-x?ref=JOAO7");
    expect(linkDaDivulgacao("rifa-x", null)).toBe("/r/rifa-x");
  });
});

describe("quem vê o menu Criar", () => {
  it("o apostador só aparece com o interruptor ligado", () => {
    expect(quemPublica({ role: null, apostador: true }, false)).toBeNull();
    expect(quemPublica({ role: null, apostador: true }, true)).toBe("apostador");
  });
});

describe("aviso a quem publicou", () => {
  it("diz a decisão, com o motivo na recusa e na retirada", async () => {
    const { avisoDaDecisao } = await import("../shared/divulgacao");
    expect(avisoDaDecisao("publicada", "Moto 0 km", null)?.title).toBe("Sua divulgação está no ar");
    expect(avisoDaDecisao("recusada", "Moto 0 km", "fala de preço errado")?.body).toBe(
      "A organização recusou a sua divulgação de Moto 0 km. Motivo: fala de preço errado",
    );
    expect(avisoDaDecisao("removida", "Moto 0 km", "acabou a parceria")?.body).toContain("tirou do ar");
    expect(avisoDaDecisao("em_analise", "Moto 0 km", null)).toBeNull();
  });
});
