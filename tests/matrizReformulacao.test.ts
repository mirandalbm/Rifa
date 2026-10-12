import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  A_DECIDIR,
  ARQUIVO_DA_MATRIZ,
  chavesDeDestino,
  lerDestinos,
  lerMatriz,
  montarDocumento,
  semDestino,
} from "../scripts/matriz";

/**
 * A rede de proteção da reformulação (`docs/PLANO-REFORMULACAO.md`, fase 0):
 * a matriz sai do código, e cada tela, seção e cartão tem linha de destino.
 * Tela nova, seção nova ou cartão novo que ninguém mapeou faz o teste falhar.
 */
describe("matriz de cobertura da reformulação", () => {
  const matriz = lerMatriz();
  const destinos = lerDestinos();

  it("a matriz em docs/ é a do código de agora (rode `npm run matriz`)", () => {
    const atual = montarDocumento(matriz, destinos);
    expect(fs.readFileSync(ARQUIVO_DA_MATRIZ, "utf8")).toBe(atual);
  });

  it("toda tela, seção e cartão tem linha de destino (rode `npm run matriz -- --destinos`)", () => {
    expect(semDestino(matriz, destinos)).toEqual([]);
  });

  it("não sobra destino de coisa que não existe mais", () => {
    const existentes = new Set(chavesDeDestino(matriz));
    expect(Object.keys(destinos).filter((c) => !existentes.has(c))).toEqual([]);
  });

  it("toda seção de acesso com tela tem rota no App.tsx, e o contrário", () => {
    const rotas = new Set(matriz.telas.map((t) => t.rota));
    // Seção sem tela: só a vitrine pública e as que o router do cliente trata por parâmetro.
    const semTela = matriz.secoes.filter((s) => !s.temTela).map((s) => s.path);
    for (const caminho of semTela) {
      expect(caminho.includes(":") || rotas.has(caminho) === false).toBe(true);
    }
    // Tela de painel (organizador, afiliado, cambista, admin) sempre tem seção.
    const painelSemSecao = matriz.telas.filter((t) => ["organizer", "affiliate", "cambista", "admin"].includes(t.papel) && !t.secao);
    expect(painelSemSecao.map((t) => t.rota)).toEqual([]);
  });

  it("toda tela acha o arquivo do componente", () => {
    expect(matriz.telas.filter((t) => !t.arquivo).map((t) => t.rota)).toEqual([]);
  });

  /**
   * Quando a fase 2 congelar o desenho (`DESTINOS_CONGELADOS = true`), nada
   * pode ficar como "a decidir". Até lá, só se conta quanto falta.
   */
  const DESTINOS_CONGELADOS = false;
  it.skipIf(!DESTINOS_CONGELADOS)("com o desenho congelado, nenhum destino fica 'a decidir'", () => {
    expect(Object.entries(destinos).filter(([, v]) => v === A_DECIDIR).map(([k]) => k)).toEqual([]);
  });
});
