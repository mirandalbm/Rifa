import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  EMPRESA_VAZIA,
  GUARDADO_NO_NAVEGADOR,
  SESSAO_DIAS,
  conferirCampoDaEmpresa,
  conferirDadosDaEmpresa,
  faltaNaEmpresa,
  formatarCnpj,
  montarPrivacidade,
  montarTermosDeUso,
  validarDadosDaEmpresa,
  type DadosDosTermos,
} from "../shared/legal";
import { regraDoReembolso } from "../shared/reembolso";
import { TEMPLATE_PADRAO, TemplateInvalido, validarTemplate } from "../shared/template";

const empresa = {
  razaoSocial: "Rifas Brasil Tecnologia Ltda.",
  cnpj: "11.222.333/0001-81",
  endereco: "Av. Paulista, 1000 — São Paulo/SP",
  contato: "Contato@Rifas.com.br",
  encarregadoNome: "Ana Souza",
  encarregadoContato: "dpo@rifas.com.br",
};
const base: DadosDosTermos = {
  plataforma: "rifa.br",
  empresa: validarDadosDaEmpresa(empresa),
  reembolso: { aceita: true, taxaPct: 10 },
};
const texto = (s: { titulo: string; itens: string[] }[]) => s.flatMap((x) => [x.titulo, ...x.itens]).join("\n");

describe("dados da empresa", () => {
  it("normaliza: CNPJ em dígitos, e-mail minúsculo", () => {
    const e = validarDadosDaEmpresa(empresa);
    expect(e.cnpj).toBe("11222333000181");
    expect(e.contato).toBe("contato@rifas.com.br");
    expect(formatarCnpj(e.cnpj)).toBe("11.222.333/0001-81");
    expect(faltaNaEmpresa(e)).toEqual([]);
  });
  it("vazio é permitido, e a tela diz o que falta", () => {
    expect(validarDadosDaEmpresa(undefined)).toEqual(EMPRESA_VAZIA);
    expect(faltaNaEmpresa(EMPRESA_VAZIA)).toHaveLength(5);
  });
  it("recusa CNPJ com dígito errado, e-mail estranho e chave que não é texto", () => {
    expect(() => validarDadosDaEmpresa({ cnpj: "11.222.333/0001-82" })).toThrow(/CNPJ/);
    expect(() => validarDadosDaEmpresa({ contato: "nao-e-email" })).toThrow(/E-mail de contato/);
    expect(() => validarDadosDaEmpresa({ encarregadoContato: "a@b" })).toThrow(/encarregado/);
    expect(() => validarDadosDaEmpresa({ razaoSocial: 5 })).toThrow();
  });
  it("só guarda as chaves conhecidas", () => {
    const e = validarDadosDaEmpresa({ ...empresa, script: "<b>x</b>" }) as unknown as Record<string, unknown>;
    expect(Object.keys(e).sort()).toEqual(Object.keys(EMPRESA_VAZIA).sort());
  });
  it("entra no template, e o template com CNPJ errado é recusado", () => {
    expect(validarTemplate({ ...TEMPLATE_PADRAO, legal: empresa }).legal?.cnpj).toBe("11222333000181");
    expect(() => validarTemplate({ ...TEMPLATE_PADRAO, legal: { cnpj: "123" } })).toThrow(TemplateInvalido);
    expect(validarTemplate({ ...TEMPLATE_PADRAO, legal: undefined }).legal).toEqual(EMPRESA_VAZIA);
  });
});

describe("dados da empresa por etapas", () => {
  it("separa o que está certo do que não está", () => {
    const { dados, erros } = conferirDadosDaEmpresa({
      razaoSocial: "International Lottery Ltda",
      cnpj: "47.992.008/0001-45",
      contato: "contato@exemplo",
      encarregadoContato: " Contato@Exemplo.com.br ",
    });
    expect(dados.razaoSocial).toBe("International Lottery Ltda");
    expect(dados.cnpj).toBe("47992008000145");
    expect(dados.encarregadoContato).toBe("contato@exemplo.com.br");
    expect(dados.contato).toBe("");
    expect(erros.contato).toMatch(/E-mail de contato inválido/);
    expect(Object.keys(erros)).toEqual(["contato"]);
  });
  it("vazio é válido, campo a campo", () => {
    expect(conferirCampoDaEmpresa("contato", "")).toEqual({ valor: "" });
    expect(conferirCampoDaEmpresa("contato", "   ")).toEqual({ valor: "" });
    expect(conferirCampoDaEmpresa("cnpj", "11.222.333/0001-82")).toHaveProperty("erro");
  });
  it("o formatado com máscara cabe no CNPJ", () => {
    expect(conferirCampoDaEmpresa("cnpj", "47.992.008/0001-45")).toEqual({ valor: "47992008000145" });
  });
});

describe("termos de uso", () => {
  it("identifica a empresa e a promotora, e diz que só vale bilhete pago pela plataforma", () => {
    const t = texto(montarTermosDeUso(base));
    expect(t).toContain("Rifas Brasil Tecnologia Ltda., CNPJ 11.222.333/0001-81, com sede em Av. Paulista");
    expect(t).toContain("Lei 5.768/71");
    expect(t).toContain("Só vale bilhete pago pela plataforma");
    expect(t).toMatch(/maiores de 18 anos/);
  });
  it("a regra de reembolso é a mesma da tela de compra", () => {
    expect(texto(montarTermosDeUso(base))).toContain(regraDoReembolso(10));
    const sem = texto(montarTermosDeUso({ ...base, reembolso: { aceita: false, taxaPct: 10 } }));
    expect(sem).toContain("art. 49");
    expect(sem).toContain("fale com a promotora da rifa");
    expect(sem).not.toContain(regraDoReembolso(10));
  });
  it("sem os dados da empresa, diz que ainda não foram publicados — nunca inventa", () => {
    const t = texto(montarTermosDeUso({ ...base, empresa: EMPRESA_VAZIA }));
    expect(t).toContain("ainda não foram publicados");
    expect(t).not.toContain("CNPJ 1");
  });
});

describe("política de privacidade", () => {
  it("traz o encarregado, os direitos e a ANPD", () => {
    const t = texto(montarPrivacidade(base));
    expect(t).toContain("Ana Souza, pelo e-mail dpo@rifas.com.br");
    expect(t).toContain("art. 18");
    expect(t).toContain("ANPD");
  });
  it("sem encarregado, diz que será publicado; com o e-mail da empresa, manda para ele", () => {
    expect(texto(montarPrivacidade({ ...base, empresa: EMPRESA_VAZIA }))).toContain("será publicado nesta página");
    const semEncarregado = { ...base.empresa, encarregadoNome: "", encarregadoContato: "" };
    expect(texto(montarPrivacidade({ ...base, empresa: semEncarregado }))).toContain("pelo e-mail contato@rifas.com.br");
  });
  it("diz o que fica público mesmo sem o perfil público: jogando agora, ganhador e a consulta do pedido", () => {
    const t = texto(montarPrivacidade(base));
    expect(t).toContain("jogando agora");
    expect(t).toContain("código do pedido");
    expect(t).toContain("O afiliado vê só o primeiro nome");
  });
  it("diz o que nunca é público e que a biometria depende da autorização", () => {
    const t = texto(montarPrivacidade(base));
    expect(t).toContain("Telefone, CPF e e-mail nunca são públicos");
    expect(t).toContain("art. 11");
    expect(t).toMatch(/Nunca vendemos dados pessoais/);
  });
});

/** Toda chave `rifa.*` que o site grava no navegador, lida do código do cliente. */
function chavesDoCliente(): string[] {
  const achadas = new Set<string>();
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (/\.(ts|tsx)$/.test(nome)) {
        for (const m of readFileSync(caminho, "utf8").matchAll(/["`](rifa\.[a-zA-Z.-]+)/g)) {
          achadas.add(m[1].replace(/[.-]$/, ""));
        }
      }
    }
  };
  andar(join(__dirname, "..", "client", "src"));
  achadas.delete("rifa.br"); // o nome da marca, não é chave
  return [...achadas].sort();
}

describe("o que o site guarda no navegador (Privacidade, item 8)", () => {
  const texto = GUARDADO_NO_NAVEGADOR.flatMap((g) => g.itens).join("\n");

  it("toda chave gravada pelo site está na tabela, pelo nome", () => {
    const chaves = chavesDoCliente();
    expect(chaves.length).toBeGreaterThan(10);
    for (const c of chaves) expect(texto, c).toContain(c);
  });

  it("o cookie de sessão diz a mesma duração que o servidor usa", () => {
    expect(texto).toContain(`rifa.sid — `);
    expect(texto).toContain(`Vale ${SESSAO_DIAS} dias desde o último uso`);
  });

  it("os cookies de anúncio só depois do aceite, com a duração de cada fornecedor", () => {
    const anuncio = GUARDADO_NO_NAVEGADOR.find((g) => g.grupo.startsWith("Cookies de anúncio"));
    expect(anuncio?.grupo).toMatch(/só depois do "Aceitar"/);
    for (const nome of ["_fbp", "_ga", "_gcl_au", "_ttp"]) expect(anuncio?.itens.join(" ")).toContain(nome);
  });

  it("a tabela entra no item 8 da Privacidade", () => {
    const item8 = montarPrivacidade(base).find((s) => s.titulo.startsWith("8."));
    const todo = (item8?.itens ?? []).join("\n");
    for (const g of GUARDADO_NO_NAVEGADOR) expect(todo).toContain(g.grupo);
  });
});

describe("Termos e Privacidade na régua do advogado (roteiro de 08/10/2026)", () => {
  const termos = texto(montarTermosDeUso(base));
  const priv = texto(montarPrivacidade(base));

  it("a plataforma é qualificada como no contrato da promotora (1.1), não como quem recebe o Pix", () => {
    expect(termos).toMatch(/facilita o pagamento pelo Pix por meio de instituição de pagamento autorizada pelo Banco Central/);
    expect(termos).not.toMatch(/recebe o pagamento pelo Pix/);
  });

  it("impedidos também pelo CPF dos sócios e diretores (5.6)", () => {
    expect(termos).toMatch(/com o CPF de um sócio ou diretor, é recusada/);
  });

  it("diz como os termos são aceitos", () => {
    expect(termos).toMatch(/Você aceita estes termos ao criar a conta e, a cada compra/);
  });

  it("reembolso diz o prazo da promotora, o da disputa e os órgãos de defesa do consumidor", () => {
    const ligado = texto(montarTermosDeUso({ ...base, reembolso: { aceita: true, taxaPct: 10 } }));
    expect(ligado).toMatch(/responde em até 3 dias/);
    expect(ligado).toMatch(/em até 7 dias, e ela dá a palavra final/);
    expect(ligado).toMatch(/Procon ou no consumidor\.gov\.br/);
    expect(termos).toMatch(/Procon ou no consumidor\.gov\.br/);
  });

  it("revisão dos Termos (08/10/2026): CDC, foro, prazos e afiliado", () => {
    const titulos = montarTermosDeUso(base).map((x) => x.titulo);
    // A numeração é contínua, de 1 a 10: sem buraco que pareça cláusula suprimida.
    expect(titulos.map((t) => Number(t.split(".")[0]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(termos).toMatch(/relação de consumo: valem o Código de Defesa do Consumidor \(Lei 8\.078\/1990\)/);
    expect(termos).toMatch(/Política de privacidade: lá estão o papel da plataforma \(controladora/);
    expect(termos).toMatch(/\(a\) uma compra feita fora da conta.*\(b\) não dá para pedir.*\(c\) a conta criada pelo Google/);
    expect(termos).toMatch(/busca alternada e contínua em fita circular, \+1, −1, \+2, −2/);
    expect(termos).toMatch(/a plataforma responde em até 5 dias \(Decreto 7\.962\/2013, art\. 4º, parágrafo único\) — escreva para contato@rifas\.com\.br/);
    expect(termos).toMatch(/em até 5 dias úteis da confirmação do pagamento/);
    expect(termos).toMatch(/não integra estes termos, e o afiliado não fala nem age em nome da plataforma/);
    expect(termos).toMatch(/nos termos do art\. 101, I, do Código de Defesa do Consumidor/);
    expect(termos).toMatch(/Nas relações não sujeitas ao Código de Defesa do Consumidor, fica eleito o foro da comarca da sede/);
    const ligado = texto(montarTermosDeUso({ ...base, reembolso: { aceita: true, taxaPct: 10 } }));
    expect(ligado).toMatch(/a plataforma responde em até 5 dias/);
    // A frase dos direitos de consumidor fica só no item 1 (sugestão do advogado: uma vez, com remissão).
    expect(termos.match(/nada nestes termos afasta os seus direitos de consumidor/gi)).toHaveLength(1);
    // Nenhuma nota interna do gerador vai ao texto publicado.
    expect(termos).not.toMatch(/gere de novo|Gerado do sistema/);
  });

  it("revisão da Privacidade (08/10/2026): numeração, papéis, bases legais e oposição", () => {
    const titulos = montarPrivacidade(base).map((x) => x.titulo);
    expect(titulos.map((t) => Number(t.split(".")[0]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(priv).toMatch(/controladora dos dados que trata em nome próprio .* operadora dos dados que trata por conta da promotora/);
    expect(priv).toMatch(/guarda apenas o identificador do Pix, necessário para conferir o pagamento e fazer devoluções/);
    expect(priv).toMatch(/consentimento específico e destacado \(LGPD, art\. 11, I\)/);
    expect(priv).toMatch(/Voto nas enquetes.*Base legal: execução do contrato/);
    expect(priv).toMatch(/Documentos da entidade beneficiada.*Base legal: legítimo interesse/);
    expect(priv).not.toMatch(/só compara as fotos por nossa ordem/);
    expect(priv).toMatch(/só quando a plataforma liga o comparador automático/);
    expect(priv).toMatch(/as compras e os bilhetes ficam anonimizados/);
    expect(priv).toMatch(/se opor a tratamento feito sem o seu consentimento .* \(art\. 18, § 2º\)/);
    // O cargo do encarregado, quando cadastrado, vai junto do nome.
    const comCargo = texto(montarPrivacidade({ ...base, empresa: { ...base.empresa, encarregadoCargo: "sócio-administrador" } }));
    expect(comCargo).toMatch(/é Ana Souza, sócio-administrador, pelo e-mail dpo@rifas\.com\.br/);
    expect(priv).toMatch(/é Ana Souza, pelo e-mail dpo@rifas\.com\.br/);
  });

  it("a Privacidade diz as bases legais, a gratuidade e o prazo de resposta ao titular", () => {
    expect(priv).toMatch(/Base legal: o seu consentimento, que você retira/);
    expect(priv).toMatch(/a qualquer momento e sem custo/);
    expect(priv).toMatch(/respondido em até 15 dias \(LGPD, art\. 19, II\)/);
  });
});
