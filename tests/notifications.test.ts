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
