/**
 * URL assinada do Cloudflare Stream: o token que vai no lugar do `uid` no
 * endereço do HLS. É um JWT RS256 assinado aqui, com a chave de assinatura do
 * Stream (`POST /stream/keys` devolve o `id` e o `jwk`, em base64) — sem
 * chamada à Cloudflare por visualização.
 *
 * - `CLOUDFLARE_STREAM_CHAVE_ID`: o `id` da chave (32 hexadecimais).
 * - `CLOUDFLARE_STREAM_CHAVE_JWK`: o `jwk` como o Stream devolve (base64 do
 *   JSON da chave privada RSA). Segredo: nunca vai a log nem a resposta.
 *
 * Sem as duas, não há assinatura e tudo segue como antes (HLS aberto). Chave
 * que não abre é avisada uma vez no log e conta como ausente.
 */
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { TOKEN_DO_STREAM_FOLGA_S, TOKEN_DO_STREAM_VALIDADE_S, uidValido } from "@shared/stream";

export interface ChaveDoStream {
  id: string;
  chave: KeyObject;
}

const ID_DA_CHAVE = /^[a-f0-9]{32}$/;

/** Lê a chave do ambiente; `null` sem ela ou com ela estragada. Nunca lança. */
export function lerChaveDoStream(env: NodeJS.ProcessEnv = process.env): ChaveDoStream | null {
  const id = env.CLOUDFLARE_STREAM_CHAVE_ID?.trim();
  const jwk = env.CLOUDFLARE_STREAM_CHAVE_JWK?.trim();
  if (!id || !jwk) return null;
  if (!ID_DA_CHAVE.test(id)) {
    console.warn("[video] CLOUDFLARE_STREAM_CHAVE_ID fora do formato (32 hexadecimais): URL assinada desligada.");
    return null;
  }
  try {
    const json = JSON.parse(Buffer.from(jwk, "base64").toString("utf8"));
    const chave = createPrivateKey({ key: json, format: "jwk" });
    if (chave.asymmetricKeyType !== "rsa") throw new Error("não é RSA");
    return { id, chave };
  } catch {
    // Só o fato: o conteúdo da chave nunca vai ao log.
    console.warn("[video] CLOUDFLARE_STREAM_CHAVE_JWK não abriu como chave RSA: URL assinada desligada.");
    return null;
  }
}

let lida: ChaveDoStream | null | undefined;
/** A chave do processo (lida uma vez). */
export function chaveDoStream(): ChaveDoStream | null {
  if (lida === undefined) lida = lerChaveDoStream();
  return lida;
}

/** Só para teste: troca a chave (e `undefined` volta a ler do ambiente). */
export function trocarChaveDoStream(c: ChaveDoStream | null | undefined) {
  lida = c;
  guardados.clear();
}

const b64url = (b: Buffer) => b.toString("base64url");

/** O JWT do vídeo `uid`, que vence em `TOKEN_DO_STREAM_VALIDADE_S`. */
export function assinarToken(uid: string, c: ChaveDoStream, agoraS = Math.floor(Date.now() / 1000)): string {
  const cabecalho = b64url(Buffer.from(JSON.stringify({ alg: "RS256", kid: c.id })));
  const corpo = b64url(Buffer.from(JSON.stringify({ sub: uid, kid: c.id, exp: agoraS + TOKEN_DO_STREAM_VALIDADE_S })));
  const assinatura = sign("RSA-SHA256", Buffer.from(`${cabecalho}.${corpo}`), c.chave);
  return `${cabecalho}.${corpo}.${b64url(assinatura)}`;
}

/** Tokens em memória, por vídeo: a vitrine pede o mesmo vídeo muitas vezes. */
const guardados = new Map<string, { token: string; venceS: number }>();
const GUARDADOS_MAX = 5_000;

/**
 * O token para a tela, ou `null` sem chave (ou `uid` fora do formato). O mesmo
 * token serve até faltar `TOKEN_DO_STREAM_FOLGA_S` para vencer. Nunca lança.
 */
export function tokenDoStream(uid: string | null | undefined, agoraS = Math.floor(Date.now() / 1000)): string | null {
  const c = chaveDoStream();
  if (!c || !uidValido(uid)) return null;
  const g = guardados.get(uid);
  if (g && g.venceS - agoraS > TOKEN_DO_STREAM_FOLGA_S) return g.token;
  try {
    const token = assinarToken(uid, c, agoraS);
    if (guardados.size >= GUARDADOS_MAX) guardados.clear();
    guardados.set(uid, { token, venceS: agoraS + TOKEN_DO_STREAM_VALIDADE_S });
    return token;
  } catch {
    return null;
  }
}
