import { describe, it, expect } from "vitest";
import { novosRevelados } from "../client/src/components/CotaSurpresa";

describe("cota surpresa: quando o presente abre sozinho", () => {
  it("na primeira visita não abre, mesmo com número já revelado (seria barulho para todo mundo)", () => {
    expect(novosRevelados(null, [12, 40])).toEqual([]);
  });

  it("abre com o número revelado depois da última visita — quem comprou e voltou", () => {
    expect(novosRevelados([12], [12, 40])).toEqual([40]);
  });

  it("nada novo, nada abre", () => {
    expect(novosRevelados([12, 40], [40, 12])).toEqual([]);
  });

  it("estorno tira o número da lista: não conta como novo", () => {
    expect(novosRevelados([12, 40], [12])).toEqual([]);
  });
});
