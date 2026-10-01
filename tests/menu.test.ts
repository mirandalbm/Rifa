import { describe, expect, it } from "vitest";
import { MENUS, SECTIONS, menuDe, secoesDoMenu, sectionsFor, type Role } from "../shared/access";

const PAPEIS: Role[] = ["admin", "organizer", "affiliate", "cambista"];

describe("menu dos painéis em grupos", () => {
  it("cada papel tem menu, e cada seção do menu dele aparece uma vez só", () => {
    for (const papel of PAPEIS) {
      const menu = MENUS[papel];
      expect(menu, papel).toBeDefined();
      const chaves = secoesDoMenu(menu!);
      expect(new Set(chaves).size, papel).toBe(chaves.length);
      const nav = sectionsFor(papel).map((s) => s.key);
      // Nada no menu que o papel não alcance, e nada que ele alcança fora do menu.
      expect(chaves.sort(), papel).toEqual([...nav].sort());
    }
  });

  it("o master abre pela caixa de entrada, com sete grupos", () => {
    const menu = MENUS.admin!;
    const pais = menu.flatMap((g) => g.itens).filter((i) => "rotulo" in i).map((i) => ("rotulo" in i ? i.rotulo : ""));
    expect(pais).toEqual(["Caixa de entrada", "Visão geral", "Rifas", "Vendas e dinheiro", "Pessoas", "Crescimento", "Plataforma"]);
    expect(("filhos" in menu[0].itens[0] && menu[0].itens[0].filhos) || []).toEqual(["adminAtendimento", "adminAntifraude"]);
  });

  it("menuDe só mostra o que a sessão liberou: o organizador não ganha os filhos da plataforma", () => {
    const sessao = sectionsFor("organizer");
    const menu = menuDe("organizer", sessao);
    const chaves = secoesDoMenu(menu);
    expect(chaves).not.toContain("adminOrganizacoes");
    expect(chaves).not.toContain("adminAntifraude");
    expect(chaves.sort()).toEqual(sessao.map((s) => s.key).sort());
  });

  it("item pai sem filho some; seção liberada que o menu não cita entra no fim", () => {
    const menu = menuDe("admin", [{ key: "adminPainel" }, { key: "vitrine" }]);
    expect(menu.map((g) => g.itens.length)).toEqual([1, 1]);
    expect(secoesDoMenu(menu)).toEqual(["adminPainel", "vitrine"]);
    expect(SECTIONS.find((s) => s.key === "vitrine")).toBeDefined();
  });
});
