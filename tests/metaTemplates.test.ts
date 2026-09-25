import { describe, it, expect } from "vitest";
import { TEMPLATES, type TemplateName } from "../server/notifications/templates";
import {
  definicaoMeta,
  componentesDeEnvio,
  problemasDeFormato,
} from "../server/notifications/metaTemplates";

const nomes = Object.keys(TEMPLATES) as TemplateName[];

describe("modelos do WhatsApp no formato da Meta", () => {
  it("todo modelo passa nas regras de formato da submissão", () => {
    const problemas = nomes.flatMap(problemasDeFormato);
    expect(problemas).toEqual([]);
  });

  it("o texto local é o corpo da Meta com os parâmetros no lugar", () => {
    const t = TEMPLATES.pagamento_confirmado;
    const texto = t.text({
      nome: "Ana",
      rifa: "Moto",
      quantidade: "2",
      numeros: "000001, 000002",
      link: "https://x/p/1",
    });
    expect(texto).toBe(
      "Olá, Ana! Pagamento confirmado na rifa Moto. Suas 2 cota(s) são: 000001, 000002. Acompanhe o sorteio em https://x/p/1 e boa sorte!",
    );
  });

  it("modelo de corpo leva os exemplos na ordem dos parâmetros", () => {
    const d = definicaoMeta("sorteio_realizado") as {
      category: string;
      language: string;
      components: { type: string; example?: { body_text: string[][] } }[];
    };
    expect(d.category).toBe("UTILITY");
    expect(d.language).toBe("pt_BR");
    expect(d.components[0].example?.body_text[0]).toEqual(TEMPLATES.sorteio_realizado.exemplo);
  });

  it("código de acesso é autenticação, com botão de copiar", () => {
    const d = definicaoMeta("codigo_acesso");
    expect(d.category).toBe("AUTHENTICATION");
    expect(JSON.stringify(d.components)).toContain("COPY_CODE");
  });

  it("o envio do código leva o valor também no botão; os outros, não", () => {
    const codigo = componentesDeEnvio("codigo_acesso", { codigo: "123456" });
    expect(codigo).toHaveLength(2);
    expect(JSON.stringify(codigo[1])).toContain("123456");

    const outro = componentesDeEnvio("sorteio_realizado", {
      rifa: "Moto",
      numero: "000042",
      link: "https://x",
    });
    expect(outro).toHaveLength(1);
  });
});
