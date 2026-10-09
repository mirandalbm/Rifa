import { describe, expect, it } from "vitest";
import { TIPOS_DA_CAIXA, contarPorTipo, destinoDaPendencia, ordenarCaixa, type TipoDaCaixa } from "../shared/caixa";

const l = (tipo: TipoDaCaixa, desde: string) => ({ tipo, desde });

describe("caixa de entrada", () => {
  it("disputa e denúncia vêm primeiro; dentro do grupo, o mais antigo", () => {
    const ordem = ordenarCaixa([
      l("fiscal", "2026-10-01T10:00:00Z"),
      l("reembolso", "2026-10-01T09:00:00Z"),
      l("denuncia", "2026-10-01T12:00:00Z"),
      l("disputa", "2026-10-01T08:00:00Z"),
      l("edicao", "2026-09-30T08:00:00Z"),
    ]).map((x) => x.tipo);
    expect(ordem).toEqual(["disputa", "denuncia", "edicao", "reembolso", "fiscal"]);
  });

  it("conversa denunciada entra com disputa e denúncia, na frente do resto", () => {
    const ordem = ordenarCaixa([l("fiscal", "2026-10-01T10:00:00Z"), l("conversa", "2026-10-01T11:00:00Z"), l("disputa", "2026-10-01T12:00:00Z")]).map((x) => x.tipo);
    expect(ordem).toEqual(["conversa", "disputa", "fiscal"]);
    expect(destinoDaPendencia({ tipo: "conversa" })).toBe("/admin/atendimento?aba=denuncias");
  });

  it("não mexe na lista de entrada", () => {
    const entrada = [l("fiscal", "b"), l("disputa", "a")];
    ordenarCaixa(entrada);
    expect(entrada.map((x) => x.tipo)).toEqual(["fiscal", "disputa"]);
  });

  it("todo tipo leva a uma tela que existe", () => {
    const caminhos = (Object.keys(TIPOS_DA_CAIXA) as TipoDaCaixa[]).map((t) => destinoDaPendencia({ tipo: t }).split(/[?#]/)[0]);
    for (const c of caminhos) expect(["/admin/atendimento", "/admin/marketing/publicidade", "/admin/fiscal", "/admin/organizacoes", "/admin/pedidos", "/admin/cobranca"]).toContain(c);
  });

  it("conta por tipo", () => {
    expect(contarPorTipo([l("disputa", "a"), l("disputa", "b"), l("fiscal", "c")])).toEqual({ disputa: 2, fiscal: 1 });
  });
});
