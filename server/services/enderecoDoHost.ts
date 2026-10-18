/**
 * O `Host` que chegou, antes de qualquer rota: manda o `www` para a casa
 * principal, marca com `noindex` o endereço que o sistema não conhece e confere
 * a `Origin` de quem muda estado (docs/PLANO-SUBDOMINIO.md, caps. 1.4 e 6.2).
 * Só `Host` — `X-Forwarded-Host` nunca vale, nem com `trust proxy`.
 */
import type { NextFunction, Request, Response } from "express";
import {
  destinoDoWww,
  hostEhConhecido,
  hostNormalizado,
  identificarHost,
  motivoDeOrigemDiferente,
} from "../../shared/subdominio";
import { ROTA_DO_RELATORIO_CSP } from "../../shared/csp";
import { subdominioBaseDoAmbiente } from "./subdominio";

const ehProducao = () => process.env.NODE_ENV === "production";
const MUDA_ESTADO = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function caminhoDe(req: Request): string {
  return req.originalUrl.split("?")[0] ?? "";
}

/** Webhook de provedor e relatório de CSP não vêm de navegador nosso: ficam como estão. */
function ehRotaDeFora(caminho: string): boolean {
  // O Express casa o prefixo sem diferenciar maiúscula: `/API/webhooks` é o mesmo roteador.
  const c = caminho.toLowerCase();
  return c.startsWith("/api/webhooks") || c === ROTA_DO_RELATORIO_CSP;
}

/**
 * `www` (ou a raiz, se o canônico é o `www`) → o outro nome da casa principal,
 * 301 para leitura e 308 para o resto (o método e o corpo se mantêm). Host
 * desconhecido segue servindo — a verificação de saúde da Railway usa um `Host`
 * próprio —, só que com `X-Robots-Tag`.
 */
export function protegerOHost(req: Request, res: Response, next: NextFunction) {
  const principal = process.env.PUBLIC_BASE_URL?.trim();
  if (!principal || ehRotaDeFora(caminhoDe(req))) return next();
  const producao = ehProducao();
  const host = req.headers.host;
  const destino = destinoDoWww(host, principal, producao);
  if (destino) {
    const leitura = req.method === "GET" || req.method === "HEAD";
    return res.redirect(leitura ? 301 : 308, `${destino}${req.originalUrl}`);
  }
  if (!hostEhConhecido(host, principal, subdominioBaseDoAmbiente(), producao)) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }
  next();
}

const HORA = 60 * 60_000;
const TETO = 100;
const vistos = new Map<string, { n: number; desde: number }>();

/**
 * Cada motivo + classe do host vai ao log uma vez por hora, com quantas vezes
 * apareceu (como o `[csp]`). Guarda só a classe — principal, endereço ou outro —,
 * nunca o `Host` nem a `Origin` inteiros: o log é sinal para a decisão de passar
 * a recusar, não registro de quem acessou.
 */
export function registrarOrigemDiferente(motivo: string, classe: string, agora = Date.now()): boolean {
  const chave = `${motivo} host=${classe}`;
  const atual = vistos.get(chave);
  if (atual && agora - atual.desde < HORA) {
    atual.n += 1;
    return false;
  }
  if (atual) console.warn(`[origem] ${chave}: ${atual.n} pedido(s) na última hora`);
  else console.warn(`[origem] modo relatório recusaria: ${chave}`);
  if (!atual && vistos.size >= TETO) vistos.delete(vistos.keys().next().value as string);
  vistos.set(chave, { n: 1, desde: agora });
  return true;
}

export function esquecerOrigensVistas() {
  vistos.clear();
}

function classeDoHost(host: string | undefined): string {
  const limpo = hostNormalizado(host, false);
  if (!limpo) return "invalido";
  if (identificarHost(limpo, subdominioBaseDoAmbiente())) return "endereco";
  try {
    const principal = process.env.PUBLIC_BASE_URL ? new URL(process.env.PUBLIC_BASE_URL).hostname.toLowerCase() : null;
    if (principal && (limpo === principal || limpo === `www.${principal}` || `www.${limpo}` === principal)) return "principal";
  } catch {
    // PUBLIC_BASE_URL torta: cai em "outro"
  }
  return "outro";
}

/** Passa a recusar com `ORIGEM_POR_HOST=recusar`; sem a variável, só registra. */
export function origemRecusa(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ORIGEM_POR_HOST?.trim().toLowerCase() === "recusar";
}

/**
 * `POST/PUT/PATCH/DELETE` em `/api`: a `Origin` tem de ser o mesmo `Host`.
 * `SameSite=Lax` não separa subdomínios da mesma família, e o projeto não tem
 * token CSRF — este é o controle. **Em modo relatório** até o log ficar limpo
 * (o app na WebView do Android e o POS entram na observação).
 */
export function exigirOrigemDoHost(req: Request, res: Response, next: NextFunction) {
  if (!MUDA_ESTADO.has(req.method) || ehRotaDeFora(caminhoDe(req))) return next();
  const motivo = motivoDeOrigemDiferente(
    {
      host: req.headers.host,
      origin: typeof req.headers.origin === "string" ? req.headers.origin : undefined,
      secFetchSite: typeof req.headers["sec-fetch-site"] === "string" ? (req.headers["sec-fetch-site"] as string) : undefined,
    },
    ehProducao(),
  );
  if (!motivo) return next();
  registrarOrigemDiferente(motivo, classeDoHost(req.headers.host));
  if (origemRecusa()) return res.status(403).json({ message: "Origem não permitida." });
  next();
}
