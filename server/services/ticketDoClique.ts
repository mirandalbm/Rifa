/**
 * Comprovante da exibição do anúncio patrocinado. O servidor assina, para o
 * aparelho que pediu a lista, cada anúncio que mostrou (`<quando>.<hmac>`);
 * o clique só é cobrado com o comprovante daquele anúncio e daquele aparelho,
 * emitido entre 1 s e 30 min antes. Quem forja clique precisa então pedir a
 * lista como o aparelho de verdade, na região em que o anúncio está no ar —
 * não basta chamar a rota do clique com um id e um aparelho inventado.
 *
 * Sem banco (o teste alcança). A chave sai do `SESSION_SECRET`, com rótulo
 * próprio: o comprovante não vale para nada além disto.
 */
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const COMPROVANTE_MIN_MS = 1_000;
export const COMPROVANTE_MAX_MS = 30 * 60_000;

function chave(): Buffer {
  return Buffer.from(hkdfSync("sha256", process.env.SESSION_SECRET ?? "dev", "rifa", "patrocinio-comprovante-v1", 32));
}

function assinatura(anuncioId: string, aparelho: string, quando: number) {
  return createHmac("sha256", chave()).update(`${anuncioId}.${aparelho}.${quando}`).digest("hex").slice(0, 32);
}

export function comprovanteDaExibicao(anuncioId: string, aparelho: string, agora = Date.now()): string {
  return `${agora}.${assinatura(anuncioId, aparelho, agora)}`;
}

export function comprovanteConfere(comprovante: unknown, anuncioId: string, aparelho: string, agora = Date.now()): boolean {
  if (typeof comprovante !== "string" || comprovante.length > 64) return false;
  const [q, mac] = comprovante.split(".");
  const quando = Number(q);
  if (!Number.isSafeInteger(quando) || !mac || !/^[0-9a-f]{32}$/.test(mac)) return false;
  const idade = agora - quando;
  if (idade < COMPROVANTE_MIN_MS || idade > COMPROVANTE_MAX_MS) return false;
  const esperado = Buffer.from(assinatura(anuncioId, aparelho, quando), "hex");
  return timingSafeEqual(esperado, Buffer.from(mac, "hex"));
}
