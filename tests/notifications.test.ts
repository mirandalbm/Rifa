import { describe, it, expect } from "vitest";
import {
  TEMPLATES,
  orderedParams,
  renderText,
} from "../server/notifications/templates";
import { withCountryCode } from "../server/notifications/whatsapp";

describe("modelos de mensagem", () => {
  it("cobre todos os modelos declarados com texto em português", () => {
    for (const [name, spec] of Object.entries(TEMPLATES)) {
      const params = Object.fromEntries(spec.order.map((k) => [k, `<${k}>`]));
      const text = spec.text(params);
      expect(text.length, name).toBeGreaterThan(20);
      // Todo parâmetro declarado precisa aparecer no texto, senão está sobrando.
      for (const key of spec.order) {
        expect(text, `${name} não usa ${key}`).toContain(`<${key}>`);
      }
    }
  });

  it("entrega os parâmetros na ordem do modelo aprovado", () => {
    expect(
      orderedParams("pagamento_confirmado", {
        nome: "Marina",
        rifa: "iPhone",
        quantidade: "3",
        numeros: "010, 011, 016",
        link: "https://rifa.br/pedido/1",
      }),
    ).toEqual(["Marina", "iPhone", "3", "010, 011, 016", "https://rifa.br/pedido/1"]);
  });

  it("recusa quando falta parâmetro, em vez de mandar buraco", () => {
    expect(() => orderedParams("codigo_acesso", {})).toThrow(/codigo/);
  });

  it("achata quebra de linha, que a API recusa em parâmetro", () => {
    expect(orderedParams("codigo_acesso", { codigo: "12\n34  56" })).toEqual(["12 34 56"]);
  });

  it("renderiza o texto que o comprador leria", () => {
    expect(renderText("codigo_acesso", { codigo: "482193" })).toContain("482193");
  });
});

describe("telefone", () => {
  it("acrescenta o DDI brasileiro quando falta", () => {
    expect(withCountryCode("(11) 98888-7777")).toBe("5511988887777");
    expect(withCountryCode("1133334444")).toBe("551133334444");
  });

  it("não duplica DDI já presente", () => {
    expect(withCountryCode("5511988887777")).toBe("5511988887777");
  });
});

describe("mensagens de estorno", () => {
  it("a rifa aberta diz que as cotas voltaram ao estoque", () => {
    const texto = TEMPLATES.estorno_confirmado.text({
      nome: "Ana",
      rifa: "Fiat Mobi",
      valor: "R$ 50,00",
      quantidade: "5",
    });
    expect(texto).toContain("voltaram para o estoque");
    expect(texto).toContain("5");
  });

  it("depois do sorteio NÃO diz que voltaram — porque não voltaram", () => {
    // A cota fica congelada depois do sorteio. Reaproveitar a outra mensagem
    // mandaria "As 0 cota(s) voltaram para o estoque", e o comprador iria
    // procurar números que continuam no registro da rifa.
    const texto = TEMPLATES.estorno_pos_sorteio.text({
      nome: "Ana",
      rifa: "Fiat Mobi",
      valor: "R$ 50,00",
    });
    expect(texto).not.toContain("voltaram para o estoque");
    expect(texto).toContain("sorteio já aconteceu");
  });

  it("os dois modelos declaram a ordem de parâmetros que usam", () => {
    for (const nome of ["estorno_confirmado", "estorno_pos_sorteio"] as const) {
      const spec = TEMPLATES[nome];
      const params = Object.fromEntries(spec.order.map((k) => [k, `<${k}>`]));
      const texto = spec.text(params);
      // Modelo aprovado no WhatsApp posiciona por ordem: parâmetro declarado
      // que não aparece no texto é posição trocada esperando para acontecer.
      for (const chave of spec.order) expect(texto).toContain(`<${chave}>`);
    }
  });
});
