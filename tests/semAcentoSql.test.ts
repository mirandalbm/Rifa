import { describe, expect, it } from "vitest";
import { ACENTOS_DE, ACENTOS_PARA, ASSINATURA_SEM_ACENTO } from "../shared/semAcentoSql";
import { semAcento } from "../shared/buscar";

describe("a expressão sem acento do índice de texto", () => {
  it("mudou as letras? suba VERSAO_SEM_ACENTO (o índice só é recriado pelo nome)", () => {
    expect(`${ACENTOS_DE}>${ACENTOS_PARA}`).toBe(ASSINATURA_SEM_ACENTO);
  });

  it("cada letra tem par, e o par é o que a busca faz com o texto digitado", () => {
    expect([...ACENTOS_DE].length).toBe([...ACENTOS_PARA].length);
    [...ACENTOS_DE].forEach((c, i) => expect(semAcento(c)).toBe([...ACENTOS_PARA][i]));
  });
});
