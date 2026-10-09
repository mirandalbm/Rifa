import { describe, expect, it } from "vitest";
import { CONFIG_TRAFEGO_PADRAO, codigoNoNome, validarConfigTrafego } from "../shared/trafego";
import {
  AVISO_DO_ANUNCIO,
  NOME_NA_REDE_MAX,
  TITULO_DO_ANUNCIO_MAX,
  DIARIO_MIN_DO_META_CENTS,
  achatarIds,
  alvoDoPedido,
  basePublicaDoAnuncio,
  campanhaJaNoMeta,
  campanhaVivaNoMeta,
  criacaoCompleta,
  erroDoMeta,
  explicarOrcamento,
  faltaNoMeta,
  faltaNoServidor,
  FOLGA_DO_FIM_MS,
  janelaDoConjunto,
  restosComoLista,
  semNumeroDoScpc,
  orcamentoNoMeta,
  problemaNaContaDoMeta,
  hashDaImagem,
  idDaRede,
  juntarRestos,
  lerBuscaDoMeta,
  localDoMeta,
  mesmosIds,
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

describe("orçamento no Meta", () => {
  const ok = (r: ReturnType<typeof orcamentoNoMeta>) => {
    if (!r.ok) throw new Error(r.motivo);
    return r.orcamento;
  };
  it("uma rede: a verba que resta, o por dia e os dias para baixo", () => {
    expect(ok(orcamentoNoMeta({ investimentoCents: 20_500, gastoCents: 0, verbaDiaCents: 2_000, redes: ["meta"] }))).toEqual({
      restanteCents: 20_500,
      redes: 1,
      diarioCents: 2_000,
      totalCents: 20_500,
      dias: 10,
      vidaCents: 20_000,
    });
  });
  it("duas redes: partes iguais para baixo, e o gasto já lançado sai da base", () => {
    const o = ok(orcamentoNoMeta({ investimentoCents: 20_001, gastoCents: 5_000, verbaDiaCents: 2_001, redes: ["google", "meta"] }));
    expect(o).toEqual({ restanteCents: 15_001, redes: 2, diarioCents: 1_000, totalCents: 7_500, dias: 7, vidaCents: 7_000 });
    expect(o.vidaCents).toBe(o.diarioCents * o.dias);
    expect(o.vidaCents).toBeLessThanOrEqual(o.totalCents);
    expect(o.totalCents * o.redes).toBeLessThanOrEqual(o.restanteCents);
  });
  it("nunca passa do que resta, em qualquer combinação", () => {
    for (let inv = 1_000; inv <= 40_000; inv += 777) {
      for (const gasto of [0, 333, 4_999]) {
        for (const dia of [600, 1_234, 5_000]) {
          for (const redes of [["meta"], ["meta", "google"], ["meta", "google", "tiktok"]]) {
            const r = orcamentoNoMeta({ investimentoCents: inv, gastoCents: gasto, verbaDiaCents: dia, redes });
            if (!r.ok) continue;
            const o = r.orcamento;
            // O teto que vai ao Meta (lifetime_budget) nunca passa do que resta da verba, na parte do Meta.
            expect(o.vidaCents).toBe(o.diarioCents * o.dias);
            expect(o.vidaCents).toBeLessThanOrEqual(Math.floor(Math.max(0, inv - gasto) / redes.length));
            expect(Math.floor(o.vidaCents / o.dias)).toBeGreaterThanOrEqual(DIARIO_MIN_DO_META_CENTS);
            expect(o.diarioCents).toBeLessThanOrEqual(Math.floor(dia / redes.length));
            expect(o.diarioCents).toBeGreaterThanOrEqual(DIARIO_MIN_DO_META_CENTS);
            expect(o.dias).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });
  it("o que resta não dá um dia: um dia só, com o total", () => {
    expect(ok(orcamentoNoMeta({ investimentoCents: 20_000, gastoCents: 19_000, verbaDiaCents: 2_000, redes: ["meta"] }))).toMatchObject({ diarioCents: 1_000, dias: 1 });
  });
  it("recusa nada restando e diário abaixo do mínimo do Meta", () => {
    expect(orcamentoNoMeta({ investimentoCents: 20_000, gastoCents: 20_000, verbaDiaCents: 2_000, redes: ["meta"] })).toMatchObject({ ok: false });
    const r = orcamentoNoMeta({ investimentoCents: 20_000, gastoCents: 0, verbaDiaCents: 1_000, redes: ["meta", "google"] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/mínimo/);
    expect(orcamentoNoMeta({ investimentoCents: 20_000, gastoCents: 19_500, verbaDiaCents: 2_000, redes: ["meta"] }).ok).toBe(false);
  });
  it("o fim é o começo mais os dias, e a frase diz o porquê", () => {
    const o = ok(orcamentoNoMeta({ investimentoCents: 20_000, gastoCents: 0, verbaDiaCents: 2_000, redes: ["meta", "google"] }));
    const janela = janelaDoConjunto(new Date("2026-10-09T12:00:00Z"), o);
    expect(janela.inicio.toISOString()).toBe("2026-10-09T12:05:00.000Z");
    // Os dias do orçamento mais 1 hora de folga: o total não muda, só a janela.
    expect(janela.fim.toISOString()).toBe("2026-10-19T13:05:00.000Z");
    expect(FOLGA_DO_FIM_MS).toBe(3_600_000);
    expect(explicarOrcamento(o)).toMatch(/R\$\s100,00 no total em 10 dias.*teto.*2 redes/);
  });
});

describe("endereço do link do anúncio", () => {
  it("aparado, https, sem usuário, consulta nem âncora", () => {
    expect(basePublicaDoAnuncio("  https://rifa.br/  ")).toBe("https://rifa.br");
    expect(basePublicaDoAnuncio("https://rifa.br/loja/")).toBe("https://rifa.br/loja");
    expect(basePublicaDoAnuncio("http://rifa.br")).toBeNull();
    expect(basePublicaDoAnuncio("https://eu:senha@rifa.br")).toBeNull();
    expect(basePublicaDoAnuncio("https://rifa.br/?x=1")).toBeNull();
    expect(basePublicaDoAnuncio("javascript:alert(1)")).toBeNull();
    expect(basePublicaDoAnuncio("https://localhost")).toBeNull();
    expect(basePublicaDoAnuncio(undefined)).toBeNull();
  });
});

describe("restos achatados", () => {
  it("um id uma vez só, na ordem em que as peças nascem", () => {
    const r = juntarRestos([{ tipo: "campanha", id: "1" }], achatarIds({ imagem: "abc", campanha: "1", conjunto: "2" }));
    expect(r).toEqual([
      { tipo: "campanha", id: "1" },
      { tipo: "conjunto", id: "2" },
      { tipo: "imagem", id: "abc" },
    ]);
  });
  it("nunca um id vivo (o hash da imagem igual entre tentativas)", () => {
    const r = juntarRestos([{ tipo: "imagem", id: "abc" }, { tipo: "campanha", id: "1" }], [], ["abc", "9"]);
    expect(r).toEqual([{ tipo: "campanha", id: "1" }]);
  });
  it("lixo na lista guardada não entra, e o que não é lista vira lista vazia", () => {
    expect(juntarRestos([null as never, { tipo: "x" } as never], [])).toEqual([]);
    expect(juntarRestos({}, [])).toEqual([]);
    expect(juntarRestos(null, [{ tipo: "campanha", id: "1" }])).toEqual([{ tipo: "campanha", id: "1" }]);
    expect(juntarRestos("lixo", [])).toEqual([]);
    expect(restosComoLista([null])).toEqual([]);
  });
  it("a entrada no formato antigo é achatada, nunca descartada", () => {
    expect(restosComoLista([{ campanha: "10", conjunto: "11", imagem: "abc", outra: "x" }])).toEqual([
      { tipo: "campanha", id: "10" },
      { tipo: "conjunto", id: "11" },
      { tipo: "imagem", id: "abc" },
    ]);
    expect(juntarRestos([{ campanha: "10" }, { tipo: "campanha", id: "10" }], [], ["abc"])).toEqual([{ tipo: "campanha", id: "10" }]);
  });
  it("mesmos ids sem olhar a ordem das chaves", () => {
    expect(mesmosIds({ campanha: "1", imagem: "a" }, { imagem: "a", campanha: "1" })).toBe(true);
    expect(mesmosIds({ campanha: "1" }, { campanha: "1", imagem: "a" })).toBe(false);
  });
});

describe("busca do Meta", () => {
  it("só a lista em data; fora do formato é nulo (recusa), nunca nenhuma campanha", () => {
    expect(lerBuscaDoMeta({ data: [{ id: "120", name: "trafego-ab12cd34 x" }, { id: "x", name: "y" }] })).toEqual([{ id: "120", name: "trafego-ab12cd34 x" }]);
    expect(lerBuscaDoMeta({ data: [] })).toEqual([]);
    expect(lerBuscaDoMeta({})).toBeNull();
    expect(lerBuscaDoMeta({ data: "nada" })).toBeNull();
    expect(lerBuscaDoMeta(null)).toBeNull();
  });
  it("viva no Meta só com o id e o código no nome", () => {
    const lista = [{ id: "120", name: "trafego-ab12cd34 · Rifa" }];
    expect(campanhaVivaNoMeta(lista, "ab12cd34", "120")).toBe(true);
    expect(campanhaVivaNoMeta(lista, "ab12cd34", "121")).toBe(false);
    expect(campanhaVivaNoMeta(lista, "ffffffff", "120")).toBe(false);
    expect(campanhaVivaNoMeta(lista, "ab12cd34", undefined)).toBe(false);
  });
});

describe("servidor e conta", () => {
  it("em produção exige o endereço público do site", () => {
    const meta = { META_ADS_TOKEN: "x", META_AD_ACCOUNT_ID: "act_1234567", META_PAGE_ID: "1234567" };
    expect(faltaNoServidor({ ...meta, NODE_ENV: "production" })).toEqual(["PUBLIC_BASE_URL"]);
    expect(faltaNoServidor({ ...meta, NODE_ENV: "production", PUBLIC_BASE_URL: "https://rifa.br" })).toEqual([]);
    expect(faltaNoServidor({ ...meta, NODE_ENV: "production", PUBLIC_BASE_URL: "  https://rifa.br/  " })).toEqual([]);
    expect(faltaNoServidor({ ...meta, NODE_ENV: "production", PUBLIC_BASE_URL: "http://rifa.br" })[0]).toMatch(/PUBLIC_BASE_URL \(com https/);
    expect(faltaNoServidor({ ...meta, NODE_ENV: "development" })).toEqual([]);
  });
  it("a conta precisa estar em BRL e no fuso de São Paulo", () => {
    expect(problemaNaContaDoMeta({ currency: "BRL", timezone_name: "America/Sao_Paulo" })).toBeNull();
    expect(problemaNaContaDoMeta({ currency: "USD", timezone_name: "America/Sao_Paulo" })).toMatch(/USD.*reais/);
    expect(problemaNaContaDoMeta({ currency: "BRL", timezone_name: "America/Los_Angeles" })).toMatch(/fuso/);
    expect(problemaNaContaDoMeta(null)).toMatch(/moeda desconhecida/);
  });
  it("acha a campanha que já existe no Meta com o código, menos as conhecidas", () => {
    const lista = [
      { id: "111", name: "outra coisa" },
      { id: "222", name: "Rifa trafego-ab12cd34 · moto" },
      { id: "333", name: "trafego-ab12cd34 manual" },
    ];
    expect(campanhaJaNoMeta(lista, "ab12cd34", new Set())).toBe("222");
    expect(campanhaJaNoMeta(lista, "ab12cd34", new Set(["222"]))).toBe("333");
    expect(campanhaJaNoMeta(lista, "ab12cd34", new Set(["222", "333"]))).toBeNull();
    expect(campanhaJaNoMeta([{ id: "<x>", name: "trafego-ab12cd34" }], "ab12cd34", new Set())).toBeNull();
    expect(campanhaJaNoMeta("nada", "ab12cd34", new Set())).toBeNull();
  });
  it("criação completa tem as quatro peças", () => {
    expect(criacaoCompleta({ campanha: "1", conjunto: "2", criativo: "3", anuncio: "4" })).toBe(true);
    expect(criacaoCompleta({ campanha: "1", conjunto: "2", imagem: "abc" })).toBe(false);
    expect(criacaoCompleta(null)).toBe(false);
  });
});

describe("alvo", () => {
  it("Brasil, estado ou cidade com o estado", () => {
    expect(alvoDoPedido({ uf: null, cidade: null })).toEqual({ tipo: "pais" });
    expect(alvoDoPedido({ uf: "XX", cidade: "Lugar" })).toBeNull();
    expect(alvoDoPedido({ uf: "XX", cidade: null })).toBeNull();
    expect(alvoDoPedido({ uf: null, cidade: "Lugar" })).toBeNull();
    expect(alvoDoPedido({ uf: "SP", cidade: null })).toEqual({ tipo: "estado", uf: "SP", estado: "São Paulo" });
    expect(alvoDoPedido({ uf: "SP", cidade: "Campinas" })).toEqual({ tipo: "cidade", uf: "SP", estado: "São Paulo", cidade: "Campinas" });
  });

  it("maiores de 18 sempre; o país inteiro só quando o pedido não tem região", () => {
    const pais = segmentacaoDoMeta({ tipo: "pais" }, null);
    expect(pais).toEqual({ geo_locations: { countries: ["BR"] }, age_min: 18, age_max: 65 });
    const estado = segmentacaoDoMeta(alvoDoPedido({ uf: "SP", cidade: null })!, "460");
    expect(estado.geo_locations).toEqual({ regions: [{ key: "460" }] });
    expect(estado.age_min).toBe(18);
    const cidade = segmentacaoDoMeta(alvoDoPedido({ uf: "SP", cidade: "Campinas" })!, "248");
    expect(cidade.geo_locations).toEqual({ cities: [{ key: "248", radius: 17, distance_unit: "kilometer" }] });
  });

  it("acha o local do pedido entre os do Meta, sem acento e no estado certo", () => {
    const sp = alvoDoPedido({ uf: "SP", cidade: null })!;
    expect(localDoMeta([{ key: "1", type: "region", name: "Sao Paulo", country_code: "BR" }], sp)).toBe("1");
    expect(localDoMeta([{ key: "1", type: "region", name: "São Paulo", country_code: "PT" }], sp)).toBeNull();
    expect(localDoMeta([{ key: "1", type: "city", name: "São Paulo", country_code: "BR", region: "São Paulo" }], sp)).toBeNull();
    const camp = alvoDoPedido({ uf: "SP", cidade: "Campinas" })!;
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
    autorizacao: "SPA/MF 03.012345/2026",
  };
  it("monta dos dados públicos, com a autorização e o aviso", () => {
    const t = textoDoAnuncio(dados);
    expect(t.mensagem).toContain("Moto 0 km");
    expect(t.mensagem).toMatch(/R\$\s5,00 a cota/);
    expect(t.mensagem).toContain("Loteria Federal");
    expect(t.mensagem).toContain("Rifa autorizada SPA/MF nº SPA/MF 03.012345/2026.");
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
  it("só a linha da autorização sai da conta, nunca o número de dentro das outras", () => {
    // O prêmio repete o número da autorização: na linha do prêmio ele conta como número longo.
    const t = textoDoAnuncio({ ...dados, premio: `Moto ${dados.autorizacao}` });
    expect(problemaNoTextoDoAnuncio(t.mensagem, dados.autorizacao)).toMatch(/telefone/);
    // Sem a linha da autorização no texto, nada sai da conta.
    expect(problemaNoTextoDoAnuncio("Moto\n03.012345/2026", dados.autorizacao)).toMatch(/telefone/);
  });
  it("da linha da autorização só sai o número no formato do SCPC; o resto passa pela régua inteira", () => {
    expect(semNumeroDoScpc("Rifa autorizada SPA/MF nº SPA/MF 03.012345/2026.")).not.toMatch(/\d{4}/);
    const passa = (a: string) => problemaNoTextoDoAnuncio(textoDoAnuncio({ ...dados, autorizacao: a }).mensagem, a);
    expect(passa("SPA/MF 03.012345/2026")).toBeNull();
    expect(passa("SPA-MF-EXEMPLO-1001")).toBeNull();
    // O mesmo número com ou sem os pontos (a autorização trava ao publicar: recusar seria sem saída).
    expect(passa("SPA/MF 03012345/2026")).toBeNull();
    expect(passa("SPA/MF 03.012.345/2026")).toBeNull();
    // Preso nas pontas: o fim de um telefone com "/AAAA" não vale como número do SCPC.
    for (const a of ["SPA/MF 11987654321/2026", "5511987654321/2026", "1198765432/2026", "11.98765432/2026", "0800777123/4567"]) {
      expect(passa(a), a).toMatch(/autorização/);
    }
    // Os quatro do revisor: telefone fora do formato do SCPC, na linha da autorização.
    for (const a of ["zap 11 9 8765-4321", "11.9.8765.4321", "0800 777 1234", "SPA 11 3456 7890"]) {
      expect(passa(a), a).toMatch(/autorização/);
    }
    // Número do SCPC e telefone juntos: o número sai, o telefone fica.
    expect(passa("03.012345/2026 zap 11 98765-4321")).toMatch(/autorização/);
    // Link vale sempre, inclusive na linha da autorização.
    expect(passa("golpe.com/pix 11 98765-4321")).toMatch(/link/);
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
