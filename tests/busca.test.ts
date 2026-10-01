import { describe, expect, it } from "vitest";
import { ACHADOS_MAX, BUSCA_MAX, ID_DO_CLIENTE_VALIDO, caminhoDoAchado, interpretarBusca } from "../shared/busca";
import { gerarCodigoCliente } from "../shared/chamados";

describe("busca do painel", () => {
  it("8 dígitos, com ou sem #, é pedido", () => {
    expect(interpretarBusca("12345678")).toEqual({ tipo: "pedido", codigo: 12345678 });
    expect(interpretarBusca(" #92000001 ")).toEqual({ tipo: "pedido", codigo: 92000001 });
    // 7 ou 9 dígitos não são código de pedido: viram texto.
    expect(interpretarBusca("1234567")?.tipo).toBe("texto");
    expect(interpretarBusca("123456789")?.tipo).toBe("texto");
  });

  it("o ID do cliente vale em qualquer caixa e sem o hífen, e volta no formato guardado", () => {
    expect(interpretarBusca("c-abcdefg2")).toEqual({ tipo: "cliente", codigo: "C-ABCDEFG2" });
    expect(interpretarBusca("CABCDEFG2")).toEqual({ tipo: "cliente", codigo: "C-ABCDEFG2" });
    // 0, O, 1, I e L não existem no alfabeto do ID: "C-0OIL..." é texto.
    expect(interpretarBusca("C-ABCDEF01")?.tipo).toBe("texto");
    // O gerador e a leitura concordam.
    const id = gerarCodigoCliente((max) => max - 1);
    expect(interpretarBusca(id)).toEqual({ tipo: "cliente", codigo: id });
    expect(ID_DO_CLIENTE_VALIDO.test(id)).toBe(true);
    expect(ID_DO_CLIENTE_VALIDO.test(id.toLowerCase())).toBe(false);
  });

  it("texto é nome de organização; curto ou longo demais é nada", () => {
    expect(interpretarBusca("Bene")).toEqual({ tipo: "texto", texto: "Bene" });
    expect(interpretarBusca("a")).toBeNull();
    expect(interpretarBusca("   ")).toBeNull();
    expect(interpretarBusca("x".repeat(BUSCA_MAX + 1))).toBeNull();
  });

  it("cada tipo abre a tela certa, com o item no endereço", () => {
    expect(caminhoDoAchado({ tipo: "pedido", codigo: 12345678 })).toBe("/admin/pedidos?codigo=12345678");
    expect(caminhoDoAchado({ tipo: "cliente", codigo: "C-ABCDEFG2" })).toBe("/admin/pedidos?cliente=C-ABCDEFG2");
    expect(caminhoDoAchado({ tipo: "organizacao", id: "abc" })).toBe("/admin/organizacoes?aberta=abc");
    expect(caminhoDoAchado({ tipo: "pessoa", papel: "affiliate", codigo: "JOAO7", email: "j@x.br" })).toBe("/admin/afiliados?q=JOAO7");
    expect(caminhoDoAchado({ tipo: "pessoa", papel: "cambista", codigo: "SERGIO", email: "s@x.br" })).toBe("/admin/usuarios?q=s%40x.br");
    expect(caminhoDoAchado({ tipo: "pessoa", papel: "organizer", codigo: null, email: "m@x.br" })).toBe("/admin/usuarios?q=m%40x.br");
    expect(ACHADOS_MAX).toBeLessThanOrEqual(10);
  });
});
