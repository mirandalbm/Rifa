/** Endereço público do site, para os links que saem em mensagem. */
export function publicUrl(path: string): string {
  const base = (process.env.PUBLIC_BASE_URL ?? "http://localhost:5000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
