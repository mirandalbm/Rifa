import { basePublicaDoAnuncio } from "@shared/trafegoCriacao";
import { urlDoEndereco } from "@shared/subdominio";
import { enderecoPublicoDaOrganizacao } from "./enderecoDaOrganizacao";
import { subdominioBaseDoAmbiente } from "./subdominio";

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

/**
 * O endereço da organização para os links DA RIFA (artes, QR, kit do afiliado,
 * anúncio, aviso do sorteio): `https://<rotulo>.<base>` se o endereço dela está
 * ligado; senão `null` e quem chama cai no caminho de hoje. A organização vem do
 * banco (do dono da rifa), nunca do `Host` de quem pediu. Conta, pedido, recibo,
 * Google, VAPID e webhook ficam no principal e não passam por aqui.
 */
export async function enderecoDaOrganizacao(organizationId: string | null | undefined): Promise<string | null> {
  if (!organizationId || !subdominioBaseDoAmbiente()) return null;
  const rotulo = await enderecoPublicoDaOrganizacao(organizationId);
  if (!rotulo) return null;
  let origem: { esquema: "http" | "https"; porta?: string } = { esquema: "https" };
  if (process.env.NODE_ENV !== "production" && process.env.PUBLIC_BASE_URL) {
    try {
      const u = new URL(process.env.PUBLIC_BASE_URL);
      origem = { esquema: u.protocol === "http:" ? "http" : "https", porta: u.port || undefined };
    } catch {
      /* PUBLIC_BASE_URL torta: fica https */
    }
  }
  return urlDoEndereco(rotulo, subdominioBaseDoAmbiente(), origem);
}

/** O endereço da rifa: no endereço da organização se ligado; senão, a base de hoje (`baseDoSite`) mais `/r/<rifa>`. */
export async function urlDaRifa(
  req: { protocol: string; get(name: string): string | undefined },
  organizationId: string | null | undefined,
  rifaSlug: string,
  opcoes: { ref?: string | null } = {},
): Promise<string> {
  const q = opcoes.ref ? `?ref=${encodeURIComponent(opcoes.ref)}` : "";
  const endereco = await enderecoDaOrganizacao(organizationId);
  return `${endereco ?? baseDoSite(req)}/r/${rifaSlug}${q}`;
}
