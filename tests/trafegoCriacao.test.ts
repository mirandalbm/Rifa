import { describe, expect, it } from "vitest";
import { CONFIG_TRAFEGO_PADRAO, codigoNoNome, validarConfigTrafego } from "../shared/trafego";
import {
  AVISO_DO_ANUNCIO,
  NOME_NA_REDE_MAX,
  TITULO_DO_ANUNCIO_MAX,
  alvoDoPedido,
  diasDaVerba,
  erroDoMeta,
  faltaNoMeta,
  fimDaVerba,
  hashDaImagem,
  idDaRede,
  localDoMeta,
  nomeNaRede,
  problemaNoTextoDoAnuncio,
  segmentacaoDoMeta,
  textoDoAnuncio,
} from "../shared/trafegoCriacao";

const ID = "ab12cd34-5678-4abc-9def-001122334455";

describe("interruptor da criação pela API", () => {
  it("nasce desligado e só liga com true", () => {
    expect(CONFIG_TRAFEGO_PADRAO.criarPelaApi).toBe(false);
    expect(validarConfigTrafego({ criarPelaApi: "sim" }).criarPelaApi).toBe(false);
    expect(validarConfigTrafego({ criarPelaApi: true }).criarPelaApi).toBe(true);
  });
});

describe("variáveis do Meta", () => {
  it("lista o que falta, só pelo nome", () => {
    expect(faltaNoMeta({})).toEqual(["META_ADS_TOKEN", "META_AD_ACCOUNT_ID", "META_PAGE_ID"]);
    expect(faltaNoMeta({ META_ADS_TOKEN: "x", META_AD_ACCOUNT_ID: "act_1234567", META_PAGE_ID: "1234567" })).toEqual([]);
  });
  it("confere o formato da conta e da página", () => {
    const f = faltaNoMeta({ META_ADS_TOKEN: "segredo", META_AD_ACCOUNT_ID: "1234567", META_PAGE_ID: "pagina" });
    expect(f).toEqual(["META_AD_ACCOUNT_ID (no formato act_…)", "META_PAGE_ID (só números)"]);
    expect(f.join(" ")).not.toContain("segredo");
  });
});

describe("nome na rede", () => {
  it("leva o código na frente, para a importação casar", () => {
    const n = nomeNaRede(ID, "Rifa da moto");
    expect(n).toBe("trafego-ab12cd34 · Rifa da moto");
    expect(codigoNoNome(n)).toBe("ab12cd34");
  });
  it("corta o título longo sem perder o código e limpa quebra de linha", () => {
    const n = nomeNaRede(ID, `Rifa\n${"x".repeat(400)}`);
    expect(n.length).toBe(NOME_NA_REDE_MAX);
    expect(n).not.toContain("\n");
    expect(codigoNoNome(n)).toBe("ab12cd34");
  });
});

describe("orçamento e fim", () => {
  it("dias da verba é investimento ÷ por dia, para baixo, nunca menos de 1", () => {
    expect(diasDaVerba(20_000, 2_000)).toBe(10);
    expect(diasDaVerba(20_500, 2_000)).toBe(10);
    expect(diasDaVerba(2_000, 2_000)).toBe(1);
    expect(diasDaVerba(1_000, 0)).toBe(1);
  });
  it("o fim é o começo mais os dias", () => {
    const inicio = new Date("2026-10-09T12:00:00Z");
    expect(fimDaVerba(inicio, 20_500, 2_000).toISOString()).toBe("2026-10-19T12:00:00.000Z");
  });
});

describe("alvo", () => {
  it("Brasil, estado ou cidade com o estado", () => {
    expect(alvoDoPedido({ uf: null, cidade: null })).toEqual({ tipo: "pais" });
    expect(alvoDoPedido({ uf: "XX", cidade: "Lugar" })).toEqual({ tipo: "pais" });
    expect(alvoDoPedido({ uf: "SP", cidade: null })).toEqual({ tipo: "estado", uf: "SP", estado: "São Paulo" });
    expect(alvoDoPedido({ uf: "SP", cidade: "Campinas" })).toEqual({ tipo: "cidade", uf: "SP", estado: "São Paulo", cidade: "Campinas" });
  });

  it("maiores de 18 sempre; o país inteiro só quando o pedido não tem região", () => {
    const pais = segmentacaoDoMeta({ tipo: "pais" }, null);
    expect(pais).toEqual({ geo_locations: { countries: ["BR"] }, age_min: 18, age_max: 65 });
    const estado = segmentacaoDoMeta(alvoDoPedido({ uf: "SP", cidade: null }), "460");
    expect(estado.geo_locations).toEqual({ regions: [{ key: "460" }] });
    expect(estado.age_min).toBe(18);
    const cidade = segmentacaoDoMeta(alvoDoPedido({ uf: "SP", cidade: "Campinas" }), "248");
    expect(cidade.geo_locations).toEqual({ cities: [{ key: "248", radius: 10, distance_unit: "kilometer" }] });
  });

  it("acha o local do pedido entre os do Meta, sem acento e no estado certo", () => {
    const sp = alvoDoPedido({ uf: "SP", cidade: null });
    expect(localDoMeta([{ key: "1", type: "region", name: "Sao Paulo", country_code: "BR" }], sp)).toBe("1");
    expect(localDoMeta([{ key: "1", type: "region", name: "São Paulo", country_code: "PT" }], sp)).toBeNull();
    expect(localDoMeta([{ key: "1", type: "city", name: "São Paulo", country_code: "BR", region: "São Paulo" }], sp)).toBeNull();
    const camp = alvoDoPedido({ uf: "SP", cidade: "Campinas" });
    const achados = [
      { key: "9", type: "city", name: "Campinas", country_code: "BR", region: "Goiás" },
      { key: "7", type: "city", name: "Campinas", country_code: "BR", region: "Sao Paulo (state)" },
      { key: "8", type: "city", name: "Campinas", country_code: "BR", region: "São Paulo" },
    ];
    expect(localDoMeta(achados, camp)).toBe("8");
    expect(localDoMeta([{ key: "x; drop", type: "city", name: "Campinas", country_code: "BR", region: "São Paulo" }], camp)).toBeNull();
    expect(localDoMeta("nada", camp)).toBeNull();
    expect(localDoMeta([], sp)).toBeNull();
    expect(localDoMeta([{ key: "1" }], { tipo: "pais" })).toBeNull();
  });
});

describe("texto do anúncio", () => {
  const dados = {
    premio: "Moto 0 km",
    precoCents: 500,
    drawAt: "2026-10-31T22:00:00Z",
    metodoApuracao: "federal_direta",
    autorizacao: "SEI/ME 18101.000123/2026-11",
  };
  it("monta dos dados públicos, com a autorização e o aviso", () => {
    const t = textoDoAnuncio(dados);
    expect(t.mensagem).toContain("Moto 0 km");
    expect(t.mensagem).toMatch(/R\$\s5,00 a cota/);
    expect(t.mensagem).toContain("Loteria Federal");
    expect(t.mensagem).toContain("Rifa autorizada SPA/MF nº SEI/ME 18101.000123/2026-11.");
    expect(t.mensagem).toContain(AVISO_DO_ANUNCIO);
    expect(t.titulo).toBe("Moto 0 km");
    expect(problemaNoTextoDoAnuncio(t.mensagem, dados.autorizacao)).toBeNull();
  });
  it("título curto", () => {
    expect(textoDoAnuncio({ ...dados, premio: "x".repeat(80) }).titulo.length).toBe(TITULO_DO_ANUNCIO_MAX);
  });
  it("o número da autorização não conta como telefone; o do prêmio, sim", () => {
    const comTelefone = textoDoAnuncio({ ...dados, premio: "Moto, chama 11 98765-4321" });
    expect(problemaNoTextoDoAnuncio(comTelefone.mensagem, dados.autorizacao)).toMatch(/telefone/);
  });
  it("recusa link, promessa de ganho e Pix por fora", () => {
    expect(problemaNoTextoDoAnuncio(textoDoAnuncio({ ...dados, premio: "Moto www.golpe.com" }).mensagem, dados.autorizacao)).toMatch(/link/);
    expect(problemaNoTextoDoAnuncio(textoDoAnuncio({ ...dados, premio: "Moto, ganho garantido" }).mensagem, dados.autorizacao)).toMatch(/promete ganho/);
    expect(problemaNoTextoDoAnuncio(textoDoAnuncio({ ...dados, premio: "Moto, faz um pix" }).mensagem, dados.autorizacao)).toMatch(/por fora/);
  });
});

describe("respostas do Meta", () => {
  it("o erro sai em português, sem a mensagem crua", () => {
    const corpo = { error: { code: 190, message: "Invalid OAuth access token EAAB-segredo", fbtrace_id: "abc" } };
    const m = erroDoMeta("campanha", 400, corpo);
    expect(m).toMatch(/token/);
    expect(m).not.toContain("segredo");
    expect(m).not.toContain("Invalid");
    expect(erroDoMeta("conjunto", 400, { error: { code: 100, error_subcode: 1487 } })).toMatch(/conjunto de anúncios.*100\/1487/);
    expect(erroDoMeta("anuncio", 500, null)).toMatch(/HTTP 500/);
    expect(erroDoMeta("imagem", 429, {})).toMatch(/esperar/);
  });
  it("id e hash só no formato", () => {
    expect(idDaRede("120210000000001")).toBe("120210000000001");
    expect(idDaRede("../act_1")).toBeNull();
    expect(idDaRede(12)).toBeNull();
    expect(hashDaImagem("0123456789abcdef0123456789abcdef")).toBe("0123456789abcdef0123456789abcdef");
    expect(hashDaImagem("<script>")).toBeNull();
  });
});
