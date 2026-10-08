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
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}`;
}
