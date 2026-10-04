import { describe, expect, it } from "vitest";
import {
  ANTECEDENCIA_DA_TRANSMISSAO_MS,
  faltaParaOSorteio,
  idDoCanal,
  transmissaoAberta,
  videoDoCanal,
  videoDoSorteioOficial,
} from "../shared/aoVivo";
import { validarCanaisDasLoterias, validarConfigPlataforma } from "../shared/plataforma";

const CANAL = "UCabcdefghijklmnopqrstuv"; // UC + 22

describe("a transmissão entra 30 min antes da hora do sorteio", () => {
  const hora = new Date("2026-10-07T22:00:00Z");
  it("abre aos 30 min antes, não antes; a hora do sorteio segue sendo a hora", () => {
    expect(ANTECEDENCIA_DA_TRANSMISSAO_MS).toBe(30 * 60_000);
    expect(transmissaoAberta(hora, hora.getTime() - 31 * 60_000)).toBe(false);
    expect(transmissaoAberta(hora, hora.getTime() - 30 * 60_000)).toBe(true);
    expect(transmissaoAberta(hora, hora.getTime() - 5 * 60_000)).toBe(true);
    expect(transmissaoAberta(hora, hora.getTime() + 60_000)).toBe(true);
    // A contagem e o "Sorteio agora" continuam contando da hora.
    expect(faltaParaOSorteio(hora, hora.getTime() - 5 * 60_000).aoVivo).toBe(false);
    expect(transmissaoAberta("data estragada", Date.now())).toBe(false);
  });
});

describe("o canal oficial de cada loteria", () => {
  it("aceita o id e o endereço /channel/; vazio é sem canal", () => {
    expect(idDoCanal(CANAL)).toBe(CANAL);
    expect(idDoCanal(`  ${CANAL} `)).toBe(CANAL);
    expect(idDoCanal(`https://www.youtube.com/channel/${CANAL}`)).toBe(CANAL);
    expect(idDoCanal(`https://m.youtube.com/channel/${CANAL}/live`)).toBe(CANAL);
    // Só o id sai do endereço: o resto (consulta, âncora) é descartado.
    expect(idDoCanal(`https://www.youtube.com/channel/${CANAL}?si=abc#x`)).toBe(CANAL);
    expect(idDoCanal("")).toBeNull();
    expect(idDoCanal(null)).toBeNull();
  });

  it("recusa o @, outro site, http e id fora do formato", () => {
    for (const ruim of [
      "https://www.youtube.com/@caixa",
      "@caixa",
      `http://www.youtube.com/channel/${CANAL}`,
      `https://evil.com/channel/${CANAL}`,
      "UC123",
      `${CANAL}x`,
      42,
    ]) {
      expect(() => idDoCanal(ruim), String(ruim)).toThrow(/Copiar ID do canal/);
    }
  });

  it("o player da live do canal é sem cookie e sem som", () => {
    expect(videoDoCanal(CANAL)).toEqual({
      tipo: "embutido",
      servico: "youtube",
      src: `https://www.youtube-nocookie.com/embed/live_stream?channel=${CANAL}&autoplay=1&mute=1&playsinline=1`,
    });
  });

  it("o link colado no sorteio vale primeiro; sem ele, o canal; sem os dois, nada", () => {
    const link = videoDoSorteioOficial("https://www.youtube.com/live/S-4jed6TgNY", CANAL);
    expect(link && link.tipo === "embutido" && link.src).toMatch(/embed\/S-4jed6TgNY/);
    const canal = videoDoSorteioOficial(null, CANAL);
    expect(canal && canal.tipo === "embutido" && canal.src).toMatch(/live_stream\?channel=/);
    expect(videoDoSorteioOficial(null, null)).toBeNull();
  });

  it("a plataforma salva só loterias conhecidas; o guardado estragado sai sem derrubar o resto", () => {
    expect(validarCanaisDasLoterias({ federal: CANAL, quina: "" })).toEqual({ federal: CANAL });
    expect(() => validarCanaisDasLoterias({ loto_fake: CANAL })).toThrow(/Loteria desconhecida/);
    expect(() => validarCanaisDasLoterias({ federal: "https://www.youtube.com/@caixa" })).toThrow();
    expect(() => validarCanaisDasLoterias([CANAL])).toThrow();
    expect(validarConfigPlataforma({}).canaisDasLoterias).toEqual({});
    expect(validarConfigPlataforma({ canaisDasLoterias: { federal: CANAL, mega_sena: "lixo", x: CANAL } as never }).canaisDasLoterias).toEqual({
      federal: CANAL,
    });
  });
});
