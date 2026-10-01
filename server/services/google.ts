/**
 * Entrar com o Google (código de autorização + PKCE, sem biblioteca nova).
 *
 * O Google prova nome e e-mail confirmado — nada além. A conta nasce
 * incompleta (`shared/google.ts`) e o resto vem pela tela "Complete sua
 * conta". O e-mail do Google **nunca liga sozinho** a uma conta que já
 * existe: o e-mail das contas com senha não é confirmado, então ligar por
 * ele deixaria quem cadastrou o e-mail de outra pessoa entrar na conta dela
 * (ou o contrário). Ligar é feito de dentro da conta, em Minha conta.
 */
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import type { Request } from "express";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db";
import { buyers } from "@shared/schema";
import { SEM_SENHA, caminhoDeVolta, claimsDoToken, telefoneProvisorio, type ClaimsDoGoogle } from "@shared/google";
import { isUniqueViolation } from "../pgError";
import { ContaError, compradorDaSessao, entrarComoComprador } from "./contaComprador";
import { hit, identify } from "./antifraude";
import { publicUrl } from "./urls";

const AUTORIZAR = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const CHAVES = "https://www.googleapis.com/oauth2/v3/certs";
const VALE_MS = 10 * 60 * 1000;
const PRAZO_MS = 5000;
/** Tentativas por aparelho em 10 min: o retorno cria conta, então não é grátis. */
const TENTATIVAS = 20;

const clientId = () => process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const segredo = () => process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
/** Só fora de produção: a prova usa claims prontos no lugar do Google. */
const modoDeProva = () => process.env.NODE_ENV !== "production" && process.env.GOOGLE_PROVA === "1";

export function googleDisponivel(): boolean {
  return modoDeProva() || Boolean(clientId() && segredo());
}

const b64url = (b: Buffer) => b.toString("base64url");

export function urlDeRetorno() {
  return publicUrl("/api/public/conta/google/retorno");
}

/** Guarda a tentativa na sessão e devolve o endereço do Google para onde ir. */
export function iniciarGoogle(req: Request, modo: "entrar" | "ligar", volta: unknown): string {
  if (!googleDisponivel()) throw new ContaError("Entrar com o Google não está disponível.", 404);
  let buyerId: string | undefined;
  if (modo === "ligar") buyerId = compradorDaSessao(req).id;
  const verifier = b64url(randomBytes(32));
  const g = {
    state: b64url(randomBytes(24)),
    nonce: b64url(randomBytes(24)),
    verifier,
    modo,
    volta: caminhoDeVolta(volta),
    buyerId,
    expiraEm: Date.now() + VALE_MS,
  };
  req.session.google = g;
  if (modoDeProva()) return `${urlDeRetorno()}?state=${g.state}&code=prova`;
  const q = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: urlDeRetorno(),
    response_type: "code",
    scope: "openid email profile",
    state: g.state,
    nonce: g.nonce,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTORIZAR}?${q}`;
}

async function pegar(url: string, init?: RequestInit) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(PRAZO_MS) });
}

/** Confere a assinatura RS256 do id_token com as chaves públicas do Google. */
async function payloadAssinado(idToken: string): Promise<Record<string, unknown>> {
  const [h, p, s] = idToken.split(".");
  if (!h || !p || !s) throw new Error("token malformado");
  const cab = JSON.parse(Buffer.from(h, "base64url").toString()) as { alg?: string; kid?: string };
  if (cab.alg !== "RS256") throw new Error("algoritmo inesperado");
  const r = await pegar(CHAVES);
  const { keys } = (await r.json()) as { keys: Array<Record<string, string>> };
  const jwk = keys.find((k) => k.kid === cab.kid);
  if (!jwk) throw new Error("chave desconhecida");
  const chave = createPublicKey({ key: jwk as never, format: "jwk" });
  const ok = verify("RSA-SHA256", Buffer.from(`${h}.${p}`), chave, Buffer.from(s, "base64url"));
  if (!ok) throw new Error("assinatura inválida");
  return JSON.parse(Buffer.from(p, "base64url").toString());
}

async function claimsDoCodigo(code: string, g: NonNullable<Request["session"]["google"]>): Promise<ClaimsDoGoogle> {
  if (modoDeProva() && code === "prova") {
    // A prova põe os claims em `GOOGLE_PROVA_CLAIMS` por tentativa, via sessão de teste.
    const bruto = (g as { prova?: string }).prova;
    if (!bruto) throw new ContaError("Sem dados de prova.", 400);
    return JSON.parse(bruto) as ClaimsDoGoogle;
  }
  const r = await pegar(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: segredo(),
      redirect_uri: urlDeRetorno(),
      grant_type: "authorization_code",
      code_verifier: g.verifier,
    }),
  });
  if (!r.ok) throw new ContaError("O Google recusou o acesso. Tente de novo.", 400);
  const { id_token } = (await r.json()) as { id_token?: string };
  if (!id_token) throw new ContaError("O Google não devolveu a identidade.", 400);
  const v = claimsDoToken(await payloadAssinado(id_token), { clientId: clientId(), nonce: g.nonce });
  if (!v.ok) throw new ContaError(`Não deu para confirmar a conta Google (${v.motivo}).`, 400);
  return v.claims;
}

/** Só a prova (fora de produção) planta os claims na tentativa em andamento. */
export function plantarClaimsDeProva(req: Request, claims: ClaimsDoGoogle) {
  if (!modoDeProva() || !req.session.google) return false;
  (req.session.google as { prova?: string }).prova = JSON.stringify(claims);
  return true;
}

/** Fecha a tentativa: confere o state, troca o código e entra ou liga. */
export async function concluirGoogle(req: Request, state: string, code: string): Promise<{ volta: string; modo: "entrar" | "ligar" }> {
  const g = req.session.google;
  delete req.session.google;
  if (!g || g.expiraEm < Date.now() || !state || state !== g.state || !code) {
    throw new ContaError("A tentativa de entrar com o Google venceu. Tente de novo.", 400);
  }
  const limite = await hit(`google:${identify(req).ipHash ?? "sem-ip"}`, 10, TENTATIVAS);
  if (limite.excedeu) throw new ContaError("Muitas tentativas. Tente de novo em alguns minutos.", 429);

  const claims = await claimsDoCodigo(code, g);
  if (g.modo === "ligar") {
    // A sessão que pediu a ligação é a que volta: outra conta no meio não vale.
    if (!g.buyerId || req.session.buyer?.id !== g.buyerId) throw new ContaError("Entre na sua conta para ligar o Google.", 401);
    await ligarGoogle(g.buyerId, claims);
  } else {
    await entrarComGoogle(req, claims);
  }
  return { volta: g.volta, modo: g.modo };
}

export async function entrarComGoogle(req: Request, claims: ClaimsDoGoogle) {
  const [ligada] = await db.select().from(buyers).where(and(eq(buyers.googleSub, claims.sub), isNull(buyers.excluidoEm)));
  if (ligada) {
    await entrarComoComprador(req, ligada, Boolean(ligada.telefoneConfirmadoEm), true);
    return ligada;
  }
  const [dona] = await db
    .select({ id: buyers.id })
    .from(buyers)
    .where(and(eq(buyers.email, claims.email), isNotNull(buyers.passwordHash), isNull(buyers.excluidoEm)));
  if (dona) {
    throw new ContaError(
      "Já existe uma conta com esse e-mail. Entre com a senha e ligue o Google em Minha conta.",
      409,
    );
  }
  const id = randomUUID();
  try {
    const [nova] = await db
      .insert(buyers)
      .values({
        id,
        name: claims.nome,
        phone: telefoneProvisorio(id),
        email: claims.email,
        passwordHash: SEM_SENHA,
        googleSub: claims.sub,
        contaCriadaEm: new Date(),
      })
      .returning();
    await entrarComoComprador(req, nova, false, true);
    return nova;
  } catch (err) {
    // Dois retornos ao mesmo tempo: quem perdeu a corrida entra na conta do outro.
    if (isUniqueViolation(err, "uq_buyers_google_sub")) {
      const [c] = await db.select().from(buyers).where(eq(buyers.googleSub, claims.sub));
      if (c) {
        await entrarComoComprador(req, c, Boolean(c.telefoneConfirmadoEm), true);
        return c;
      }
    }
    if (isUniqueViolation(err, "uq_buyers_conta_email")) {
      throw new ContaError("Já existe uma conta com esse e-mail. Entre com a senha e ligue o Google em Minha conta.", 409);
    }
    throw err;
  }
}

/** De dentro da conta: liga o Google a ela. A conta Google é de uma conta só. */
export async function ligarGoogle(buyerId: string, claims: ClaimsDoGoogle) {
  try {
    const [c] = await db
      .update(buyers)
      .set({ googleSub: claims.sub })
      .where(and(eq(buyers.id, buyerId), isNull(buyers.googleSub), isNull(buyers.excluidoEm), isNotNull(buyers.passwordHash)))
      .returning({ id: buyers.id });
    if (!c) throw new ContaError("Esta conta já tem um Google ligado.", 409);
  } catch (err) {
    if (isUniqueViolation(err, "uq_buyers_google_sub")) {
      throw new ContaError("Esse Google já está ligado a outra conta.", 409);
    }
    throw err;
  }
}

/** Desligar só se sobrar outro jeito de entrar (senha de verdade). */
export async function desligarGoogle(buyerId: string) {
  const [c] = await db.select().from(buyers).where(eq(buyers.id, buyerId));
  if (!c?.googleSub) throw new ContaError("Não há Google ligado.", 409);
  if (c.passwordHash === SEM_SENHA) {
    throw new ContaError("Esta conta só entra pelo Google; desligar a deixaria sem acesso.", 409);
  }
  await db.update(buyers).set({ googleSub: null }).where(eq(buyers.id, buyerId));
}
