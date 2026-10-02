import { describe, expect, it } from "vitest";
import { LocalDiskStorage, chaveRestauravel } from "../server/services/storage";

describe("envio de mídia: o teto de bytes vai na assinatura", () => {
  const store = new LocalDiskStorage(null, "/tmp/envio-teste");
  const key = "campanhas/00000000-0000-0000-0000-000000000000/photo-11111111-1111-1111-1111-111111111111.jpg";
  const exp = Date.now() + 60_000;

  it("a assinatura confere com o mesmo teto", () => {
    expect(store.verify(key, exp, 1000, store.sign(key, exp, 1000))).toBe(true);
  });

  it("mudar o teto, a chave ou a validade invalida", () => {
    const sig = store.sign(key, exp, 1000);
    expect(store.verify(key, exp, 2_000_000_000, sig)).toBe(false);
    expect(store.verify(key + "x", exp, 1000, sig)).toBe(false);
    expect(store.verify(key, exp + 1, 1000, sig)).toBe(false);
  });

  it("vencida, teto inválido ou assinatura de outro tamanho não passam", () => {
    const antes = Date.now() - 1;
    expect(store.verify(key, antes, 1000, store.sign(key, antes, 1000))).toBe(false);
    expect(store.verify(key, exp, 0, store.sign(key, exp, 0))).toBe(false);
    expect(store.verify(key, exp, 1.5, store.sign(key, exp, 1.5))).toBe(false);
    expect(store.verify(key, exp, 1000, "curta")).toBe(false);
  });
});

describe("/uploads só restaura chave no formato que nós geramos", () => {
  it("aceita mídia e pôster", () => {
    expect(chaveRestauravel("campanhas/00000000-0000-0000-0000-000000000000/photo-11111111-1111-1111-1111-111111111111.jpg")).toBe(true);
    expect(chaveRestauravel("campanhas/00000000-0000-0000-0000-000000000000/poster-11111111-1111-1111-1111-111111111111.webp")).toBe(true);
  });
  it("recusa o resto sem perguntar ao bucket", () => {
    expect(chaveRestauravel("x")).toBe(false);
    expect(chaveRestauravel("../etc/passwd")).toBe(false);
    expect(chaveRestauravel("campanhas/x/banner-y.png")).toBe(false);
    expect(chaveRestauravel("outra-pasta/00000000-0000-0000-0000-000000000000/photo-11111111-1111-1111-1111-111111111111.jpg")).toBe(false);
  });
});
