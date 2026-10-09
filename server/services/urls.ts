import { basePublicaDoAnuncio } from "@shared/trafegoCriacao";

/** Endereço público do site, para os links que saem em mensagem. */
export function publicUrl(path: string): string {
  const base = (process.env.PUBLIC_BASE_URL ?? "http://localhost:5000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Onde qualquer pessoa confere se um recibo é autêntico. */
export function urlDeConferencia(codigo: string): string {
  return publicUrl(`/recibo/${codigo}`);
}

/** O endereço pelo qual a pessoa está acessando (o link e o QR precisam levar a ele). */
export function baseDoSite(req: { protocol: string; get(name: string): string | undefined }): string {
  const publica = process.env.PUBLIC_BASE_URL?.trim();
  if (publica) return publica.replace(/\/+$/, "");
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}`;
}

/**
 * O endereço do link que vai num anúncio pago (tráfego, fase 3). Em produção,
 * só a `PUBLIC_BASE_URL`, aparada e `https:` (`basePublicaDoAnuncio()`): nunca
 * o `Host` da requisição de quem clicou. Sem ela, `null` — a criação não
 * acontece. Fora de produção, o mesmo de `baseDoSite` (a prova roda em http).
 */
export function baseDoAnuncio(req: { protocol: string; get(name: string): string | undefined }, env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV === "production") return basePublicaDoAnuncio(env.PUBLIC_BASE_URL);
  return baseDoSite(req);
}
