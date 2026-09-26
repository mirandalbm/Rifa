/** Endereço público do site, para os links que saem em mensagem. */
export function publicUrl(path: string): string {
  const base = (process.env.PUBLIC_BASE_URL ?? "http://localhost:5000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Onde qualquer pessoa confere se um recibo é autêntico. */
export function urlDeConferencia(codigo: string): string {
  return publicUrl(`/recibo/${codigo}`);
}
