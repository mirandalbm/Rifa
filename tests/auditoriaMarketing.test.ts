/**
 * Auditoria do acesso MARKETING (18/10/2026): o que mudou nas regras puras.
 *
 * - `x in OBJETO` com texto do corpo aceita `constructor`, `toString` e
 *   `__proto__` (a chave herdada do `Object`): todas as listas fechadas passam
 *   por `Object.hasOwn`. Cada função abaixo é uma das que tinham o resíduo.
 * - Número do corpo: `""`, `[]` e `true` viravam 0 e 1 pelo `Number()` solto
 *   (a taxa de gestão mandada vazia virava 0%).
 * - Pixel guardado é conferido de novo na saída; pixel de outra página não
 *   fica carregado na memória do navegador.
 */
import { describe, expect, it } from "vitest";
import { validarAvisoDoTrevo, AVISO_DO_TREVO_PADRAO } from "@shared/console";
import { validarCoresDoSelo } from "@shared/verificacao";
import { validarSocio } from "@shared/socios";
import { validarMeta } from "@shared/bonus";
import { validarCanaisDasLoterias } from "@shared/plataforma";
import { validarEntrada } from "@shared/iaAcoes";
import { preencherContrato } from "@shared/contratoPromotora";
import { ehModalidade } from "@shared/contratoAnexos";
import { validarModo } from "@shared/divulgacao";
import { motivoDoGrupoValido } from "@shared/grupos";
import { motivoDaMensagemValido } from "@shared/mensagens";
import { motivoValido } from "@shared/seguranca";
import { TEMPLATE_PADRAO, TemplateInvalido, validarTemplate } from "@shared/template";
import { CONFIG_PATROCINIO_PADRAO, precoDoPacote, validarConfigPatrocinio } from "@shared/patrocinio";
import { CONFIG_TRAFEGO_PADRAO, pacotesValidos, validarConfigTrafego, validarGasto, validarPedidoDeTrafego } from "@shared/trafego";
import { CONFIG_BANNER_PAGO_PADRAO, precoDoBanner, validarConfigBannerPago } from "@shared/bannerPago";
import { numeroDoCorpo } from "@shared/inteiro";
import { idsDosPixels, pixelsForaDaPagina, pixelsSeguros, validarPixels } from "@shared/marketing";
import { ufValida } from "@shared/endereco";

/** As chaves que todo objeto herda: nenhuma é valor de lista fechada. */
const HERDADAS = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "isPrototypeOf"];

describe("lista fechada não aceita a chave herdada do Object", () => {
  it("aviso do trevo volta ao padrão", () => {
    for (const h of HERDADAS) {
      expect(validarAvisoDoTrevo({ estilo: h, cor: h })).toEqual(AVISO_DO_TREVO_PADRAO);
    }
  });

  it("cor do selo fora da paleta", () => {
    for (const h of HERDADAS) {
      expect(() => validarCoresDoSelo({ apostador: h })).toThrow("fora da paleta");
    }
  });

  it("cargo do sócio", () => {
    for (const h of HERDADAS) {
      expect(() => validarSocio({ nome: "Maria Souza", cargo: h, cpf: "52998224725" })).toThrow("Escolha o cargo");
    }
  });

  it("tipo de meta do bônus", () => {
    for (const h of HERDADAS) {
      expect(() => validarMeta({ titulo: "Meta boa", tipo: h, alvo: 3, recompensa: 1 })).toThrow("Tipo de meta desconhecido");
    }
  });

  it("canal de loteria desconhecida", () => {
    for (const h of HERDADAS) {
      expect(() => validarCanaisDasLoterias({ [h]: "UCabcdefghijklmnopqrstuv" })).toThrow("Loteria desconhecida");
    }
  });

  it("situação da rifa pedida ao assistente", () => {
    for (const h of HERDADAS) {
      const r = validarEntrada("listar_rifas", { situacao: h });
      expect(r.ok).toBe(false);
    }
  });

  it("campo do contrato da promotora", () => {
    const empresa = { razaoSocial: "Plataforma LTDA", cnpj: "", endereco: "", contato: "", encarregado: "" } as never;
    for (const h of HERDADAS) {
      const r = preencherContrato(`Olá {{${h}}}.`, empresa);
      expect(r.desconhecidos).toContain(`{{${h}}}`);
      expect(r.texto).toContain(`{{${h}}}`);
    }
  });

  it("modalidade de anexo, modo de divulgação e motivos de denúncia", () => {
    for (const h of HERDADAS) {
      expect(ehModalidade(h)).toBe(false);
      expect(() => validarModo(h)).toThrow();
      expect(motivoDoGrupoValido(h)).toBe(false);
      expect(motivoDaMensagemValido(h)).toBe(false);
      expect(motivoValido(h)).toBe(false);
    }
    expect(ehModalidade("federal")).toBe(true);
    expect(validarModo("direta")).toBe("direta");
  });

  it("fonte, cantos e tipo de bloco do template", () => {
    const base = structuredClone(TEMPLATE_PADRAO) as any;
    for (const h of HERDADAS) {
      const fonte = structuredClone(base);
      fonte.identidade.fonte = h;
      expect(() => validarTemplate(fonte)).toThrow(TemplateInvalido);
      const raio = structuredClone(base);
      raio.identidade.raio = h;
      expect(() => validarTemplate(raio)).toThrow(TemplateInvalido);
      const bloco = structuredClone(base);
      bloco.blocos[0].tipo = h;
      expect(() => validarTemplate(bloco)).toThrow(TemplateInvalido);
    }
    expect(() => validarTemplate(base)).not.toThrow();
  });

  it("alcance do anúncio patrocinado e estado", () => {
    for (const h of HERDADAS) {
      expect(() => precoDoPacote(CONFIG_PATROCINIO_PADRAO, h as never, 100)).toThrow("Alcance desconhecido");
      expect(ufValida(h)).toBe(false);
    }
    expect(precoDoPacote(CONFIG_PATROCINIO_PADRAO, "nacional", 100).totalCents).toBeGreaterThan(0);
  });
});

describe("número do corpo", () => {
  it("só número ou texto de número", () => {
    expect(numeroDoCorpo(5)).toBe(5);
    expect(numeroDoCorpo("5000")).toBe(5000);
    expect(numeroDoCorpo(" 20 ")).toBe(20);
    for (const ruim of ["", "   ", [], [100], true, false, null, undefined, {}, "abc"]) {
      expect(Number.isNaN(numeroDoCorpo(ruim))).toBe(true);
    }
  });

  it("a taxa de gestão mandada vazia não vira 0%", () => {
    for (const ruim of ["", [], true, "  "]) {
      expect(() => validarConfigTrafego({ taxaPct: ruim })).toThrow("Taxa de gestão");
    }
    expect(validarConfigTrafego({ taxaPct: "15" }).taxaPct).toBe(15);
    expect(validarConfigTrafego({}).taxaPct).toBe(CONFIG_TRAFEGO_PADRAO.taxaPct);
  });

  it("pacote, pedido e gasto de tráfego não aceitam lista nem booleano", () => {
    expect(() => pacotesValidos([[5000]], 5000)).toThrow();
    expect(() => pacotesValidos([true], 100)).toThrow();
    const cfg = { ...CONFIG_TRAFEGO_PADRAO, ligado: true, redes: ["google"] as never };
    const ok = { redes: ["google"], investimentoCents: 5000, verbaDiaCents: 2000 };
    expect(validarPedidoDeTrafego(cfg, ok).investimentoCents).toBe(5000);
    expect(() => validarPedidoDeTrafego(cfg, { ...ok, investimentoCents: [5000] })).toThrow();
    expect(() => validarPedidoDeTrafego(cfg, { ...ok, investimentoCents: true })).toThrow();
    expect(() => validarPedidoDeTrafego(cfg, { ...ok, verbaDiaCents: [2000] })).toThrow();
    const camp = { redes: ["google"], investimentoCents: 5000, gastoCents: 0, diaDaAprovacao: null };
    expect(validarGasto({ dia: "2026-10-01", rede: "google", gastoCents: 100 }, camp, "2026-10-02").gastoCents).toBe(100);
    expect(() => validarGasto({ dia: "2026-10-01", rede: "google", gastoCents: [100] }, camp, "2026-10-02")).toThrow();
    expect(() => validarGasto({ dia: "2026-10-01", rede: "google", gastoCents: 100, cliques: [3] }, camp, "2026-10-02")).toThrow();
  });

  it("tabela do patrocínio e do banner pago", () => {
    expect(() => validarConfigPatrocinio({ precos: { cidade: "" } })).toThrow();
    expect(() => validarConfigPatrocinio({ minimoCliques: [] })).toThrow();
    expect(() => validarConfigBannerPago({ precoDiaCents: "" })).toThrow();
    expect(() => validarConfigBannerPago({ vagas: true })).toThrow();
    expect(validarConfigBannerPago({ precoDiaCents: "2500" }).precoDiaCents).toBe(2500);
    expect(() => precoDoBanner(CONFIG_BANNER_PAGO_PADRAO, [2])).toThrow();
    expect(() => precoDoBanner(CONFIG_BANNER_PAGO_PADRAO, "")).toThrow();
    expect(precoDoBanner(CONFIG_BANNER_PAGO_PADRAO, "2").totalCents).toBe(2 * CONFIG_BANNER_PAGO_PADRAO.precoDiaCents);
  });
});

describe("pixel guardado e pixel de outra página", () => {
  it("o que está guardado é conferido de novo antes de sair", () => {
    expect(pixelsSeguros({ meta: "1234567890123456", ga4: "G-ABC123XYZ9" })).toEqual({ meta: "1234567890123456", ga4: "G-ABC123XYZ9" });
    // Valor torto no banco (versão antiga, edição à mão): não vai a nenhum navegador.
    expect(pixelsSeguros({ meta: "123456789012345 <script>alert(1)</script>" })).toEqual({});
    expect(pixelsSeguros({ ga4: "G-ABC';alert(1);//" })).toEqual({});
    expect(pixelsSeguros("texto")).toEqual({});
    expect(pixelsSeguros(null)).toEqual({});
    // Chave desconhecida não passa.
    expect(pixelsSeguros({ meta: "1234567890123456", outro: "x" })).toEqual({ meta: "1234567890123456" });
    expect(() => validarPixels({ meta: "x" })).toThrow();
  });

  it("os ids de uma página e o que sobra da anterior", () => {
    const plataforma = { meta: "1111111111111111", ga4: "G-PLATAFORMA1" };
    const orgA = { meta: "2222222222222222", googleAds: "AW-123456789" };
    const orgB = { tiktok: "C1A2B3C4D5E6F7G8H9I0" };
    expect(idsDosPixels([plataforma, orgA]).sort()).toEqual(["1111111111111111", "2222222222222222", "AW-123456789", "G-PLATAFORMA1"].sort());
    // Mesma página (ou só a plataforma depois de carregá-la): nada sobra.
    expect(pixelsForaDaPagina(["1111111111111111", "2222222222222222"], [plataforma, orgA])).toEqual([]);
    expect(pixelsForaDaPagina([], [plataforma])).toEqual([]);
    // Saiu da página da A para a da B: o pixel da A sobra (recarrega).
    expect(pixelsForaDaPagina(["1111111111111111", "2222222222222222"], [plataforma, orgB])).toEqual(["2222222222222222"]);
    // Saiu da A para uma página sem pixel nenhum.
    expect(pixelsForaDaPagina(["2222222222222222"], [])).toEqual(["2222222222222222"]);
    // O Google Ads e o GA4 contam como pixel iniciado pelo número.
    expect(pixelsForaDaPagina(["AW-123456789", "G-PLATAFORMA1"], [plataforma])).toEqual(["AW-123456789"]);
  });
});
