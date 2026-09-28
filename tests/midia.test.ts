import { describe, expect, it } from "vitest";
import { chaveDaCampanha, mediaKey } from "../server/services/storage";

/**
 * A confirmação do envio de mídia recebe a chave do arquivo do navegador. Só
 * vale a que o passo 1 gerou para aquela rifa e aquele papel: a chave de
 * outra organização aparece no endereço público da imagem dela, e a recusa
 * da mídia apaga o objeto da chave.
 */
const rifa = "d59c80b9-133f-4156-9f9c-2db9ba3e0a09";
const vizinha = "aa516f3c-dec7-4c5e-99d2-4a2a4cdc93e3";

describe("chaveDaCampanha", () => {
  it("aceita a chave gerada para a rifa e o papel", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"]) {
      expect(chaveDaCampanha(mediaKey(rifa, "banner", mime), rifa, "banner")).toBe(true);
    }
  });

  it("recusa a chave de outra rifa", () => {
    expect(chaveDaCampanha(mediaKey(vizinha, "banner", "image/webp"), rifa, "banner")).toBe(false);
  });

  it("recusa a chave de outro papel", () => {
    expect(chaveDaCampanha(mediaKey(rifa, "banner", "image/webp"), rifa, "photo")).toBe(false);
  });

  it("recusa endereço externo, caminho com `..` e extensão que não é de mídia", () => {
    const k = mediaKey(rifa, "banner", "image/webp");
    expect(chaveDaCampanha("https://outro-site.com/x.webp", rifa, "banner")).toBe(false);
    expect(chaveDaCampanha(`campanhas/${rifa}/banner-x/../../${vizinha}/banner.webp`, rifa, "banner")).toBe(false);
    expect(chaveDaCampanha(k.replace(/\.webp$/, ".html"), rifa, "banner")).toBe(false);
    expect(chaveDaCampanha(`${k}.html`, rifa, "banner")).toBe(false);
  });
});
