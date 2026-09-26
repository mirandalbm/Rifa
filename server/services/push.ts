/**
 * Notificações no celular (Web Push, padrão VAPID).
 *
 * Garantias — as mesmas das mensagens de WhatsApp:
 *
 * 1. **Não repete.** Cada aviso tem chave por comprador (`push_envios`,
 *    `INSERT … ON CONFLICT DO NOTHING`): o relógio rodando de novo, ou em
 *    duas réplicas, não manda duas vezes.
 * 2. **Não derruba o fluxo.** Publicar, sortear e responder chamado já
 *    aconteceram; falha de push é registrada e a vida segue. Quem chama usa
 *    `emSegundoPlano()` — a resposta da tela não espera milhares de envios.
 * 3. **Aparelho morto sai da lista.** O serviço de push responde 404/410
 *    quando a inscrição acabou; ela é apagada ali mesmo.
 *
 * As chaves VAPID vêm de `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` ou, sem elas,
 * são geradas uma vez e guardadas em `app_settings` — trocar as chaves
 * invalida todas as inscrições, por isso nunca se geram de novo sozinhas.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import https from "node:https";
import webpush from "web-push";
import { db } from "../db";
import {
  appSettings,
  buyers,
  campaigns,
  chamados,
  draws,
  orders,
  organizations,
  pushEnvios,
  pushInscricoes,
  seguidores,
} from "@shared/schema";
import {
  JANELAS_DO_SORTEIO,
  VALIDADE_S,
  janelaDoSorteio,
  chavesValidas,
  endpointPermitido,
  mensagemReembolso,
  mensagemResultado,
  mensagemRifaNova,
  mensagemSorteioChegando,
  type MensagemPush,
  type TipoAviso,
} from "@shared/push";
import { formatQuota } from "@shared/format";
import { publicUrl } from "./urls";

export class PushError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "PushError";
  }
}

const CHAVE_VAPID = "vapid";
const EM_PARALELO = 10;

let chaves: { publica: string; privada: string } | null = null;

export async function chavesVapid() {
  if (chaves) return chaves;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    chaves = { publica: process.env.VAPID_PUBLIC_KEY, privada: process.env.VAPID_PRIVATE_KEY };
    return chaves;
  }
  // Gera uma vez; duas réplicas subindo juntas: o índice único decide, e as
  // duas leem a mesma chave depois.
  const novas = webpush.generateVAPIDKeys();
  await db
    .insert(appSettings)
    .values({ key: CHAVE_VAPID, value: { publica: novas.publicKey, privada: novas.privateKey } })
    .onConflictDoNothing();
  const [linha] = await db.select().from(appSettings).where(eq(appSettings.key, CHAVE_VAPID));
  const v = linha.value as { publica: string; privada: string };
  chaves = { publica: v.publica, privada: v.privada };
  return chaves;
}

/**
 * Contato do remetente para o serviço de push: `VAPID_SUBJECT`, senão o
 * endereço do site (que em produção é https). O padrão exige https: ou
 * mailto: — em desenvolvimento, sem https, vai um mailto local.
 */
function remetente(): string {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const site = publicUrl("/");
  return site.startsWith("https://") ? site : "mailto:nao-responda@localhost";
}

function desenvolvimento() {
  return process.env.NODE_ENV !== "production";
}

/**
 * Em desenvolvimento, o serviço de push do teste de ponta a ponta é local,
 * com certificado próprio: só para 127.0.0.1/localhost, e só fora de
 * produção, o certificado não é conferido. Qualquer outro endereço segue a
 * regra normal do HTTPS.
 */
const agenteLocal = new https.Agent({ rejectUnauthorized: false });
function agentePara(endpoint: string): https.Agent | undefined {
  if (!desenvolvimento()) return undefined;
  const host = new URL(endpoint).hostname;
  return host === "127.0.0.1" || host === "localhost" ? agenteLocal : undefined;
}

/* ------------------------------------------------------------------ *
 * Inscrição do aparelho
 * ------------------------------------------------------------------ */

export async function inscrever(buyerId: string, entrada: unknown) {
  const e = (entrada ?? {}) as { endpoint?: unknown; keys?: unknown };
  if (!endpointPermitido(e.endpoint, desenvolvimento())) {
    throw new PushError("Serviço de notificação não reconhecido.");
  }
  if (!chavesValidas(e.keys)) throw new PushError("Chaves do aparelho inválidas.");
  const endpoint = e.endpoint as string;
  await db
    .insert(pushInscricoes)
    .values({ buyerId, endpoint, p256dh: e.keys.p256dh, auth: e.keys.auth })
    .onConflictDoUpdate({
      target: pushInscricoes.endpoint,
      // O mesmo aparelho com outra conta passa a ser da outra conta.
      set: { buyerId, p256dh: e.keys.p256dh, auth: e.keys.auth },
    });
  return { ok: true };
}

/** Só apaga a inscrição da própria conta. */
export async function cancelarInscricao(buyerId: string, endpoint: unknown) {
  if (typeof endpoint !== "string") throw new PushError("Informe o aparelho.");
  await db
    .delete(pushInscricoes)
    .where(and(eq(pushInscricoes.endpoint, endpoint), eq(pushInscricoes.buyerId, buyerId)));
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Envio
 * ------------------------------------------------------------------ */

export function emSegundoPlano(p: Promise<unknown>, oQue: string) {
  p.catch((err) => console.error(`[push] ${oQue}:`, (err as Error).message));
}

/**
 * Avisa uma lista de compradores. Cada um recebe no máximo uma vez por
 * `chave`; quem não tem aparelho inscrito só marca como avisado.
 * Devolve quantos aparelhos receberam.
 */
export async function avisar(
  buyerIds: string[],
  tipo: TipoAviso,
  chave: string,
  msg: MensagemPush,
): Promise<number> {
  const unicos = [...new Set(buyerIds)];
  if (unicos.length === 0) return 0;

  const reivindicados: string[] = [];
  for (let i = 0; i < unicos.length; i += 500) {
    const lote = unicos.slice(i, i + 500);
    const r = await db
      .insert(pushEnvios)
      .values(lote.map((buyerId) => ({ buyerId, chave: `${tipo}:${chave}` })))
      .onConflictDoNothing()
      .returning({ buyerId: pushEnvios.buyerId });
    reivindicados.push(...r.map((x) => x.buyerId));
  }
  if (reivindicados.length === 0) return 0;

  const aparelhos = await db
    .select()
    .from(pushInscricoes)
    .where(inArray(pushInscricoes.buyerId, reivindicados));
  if (aparelhos.length === 0) return 0;

  const { publica, privada } = await chavesVapid();
  const opcoes = {
    vapidDetails: { subject: remetente(), publicKey: publica, privateKey: privada },
    TTL: VALIDADE_S[tipo],
    urgency: tipo === "reembolso" || tipo === "resultado" ? ("high" as const) : ("normal" as const),
  };
  const corpo = JSON.stringify(msg);

  let entregues = 0;
  const fila = [...aparelhos];
  const trabalhador = async () => {
    for (let a = fila.shift(); a; a = fila.shift()) {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          corpo,
          { ...opcoes, agent: agentePara(a.endpoint) },
        );
        entregues++;
        await db
          .update(pushInscricoes)
          .set({ ultimoEnvioEm: new Date() })
          .where(eq(pushInscricoes.id, a.id));
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // A inscrição acabou (app desinstalado, permissão revogada).
          await db.delete(pushInscricoes).where(eq(pushInscricoes.id, a.id));
        } else {
          console.error(`[push] ${tipo} falhou (${status ?? "rede"}):`, (err as Error).message);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(EM_PARALELO, fila.length) }, trabalhador));
  return entregues;
}

/** Seguidores com o sino ligado. */
async function seguidoresComSino(orgId: string) {
  const r = await db
    .select({ id: seguidores.buyerId })
    .from(seguidores)
    .innerJoin(buyers, eq(buyers.id, seguidores.buyerId))
    .where(and(eq(seguidores.organizationId, orgId), eq(seguidores.sino, true), isNull(buyers.excluidoEm)));
  return r.map((x) => x.id);
}

/** Quem tem pedido pago na rifa: o sorteio interessa a quem está nele. */
async function participantes(campaignId: string) {
  const r = await db
    .selectDistinct({ id: orders.buyerId })
    .from(orders)
    .where(and(eq(orders.campaignId, campaignId), eq(orders.status, "paid")));
  return r.map((x) => x.id).filter((x): x is string => Boolean(x));
}

async function rifaComDona(campaignId: string) {
  const [r] = await db
    .select({ campaign: campaigns, org: organizations })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(eq(campaigns.id, campaignId));
  return r ?? null;
}

/** Rifa publicada: avisa quem segue a organização com o sino ligado. */
export async function avisarRifaNova(campaignId: string) {
  const r = await rifaComDona(campaignId);
  if (!r || r.campaign.status !== "published") return 0;
  return avisar(
    await seguidoresComSino(r.org.id),
    "rifa_nova",
    r.campaign.id,
    mensagemRifaNova({ org: r.org.name, orgSlug: r.org.slug, premio: r.campaign.prizeTitle, slug: r.campaign.slug }),
  );
}

/** Resultado: seguidores com sino e todos que compraram. */
export async function avisarResultado(campaignId: string) {
  const r = await rifaComDona(campaignId);
  if (!r) return 0;
  const [d] = await db.select().from(draws).where(eq(draws.campaignId, campaignId));
  if (!d?.executedAt || d.resultNumber === null) return 0;
  const publico = [...(await seguidoresComSino(r.org.id)), ...(await participantes(campaignId))];
  return avisar(
    publico,
    "resultado",
    r.campaign.id,
    mensagemResultado({
      premio: r.campaign.prizeTitle,
      orgSlug: r.org.slug,
      slug: r.campaign.slug,
      numero: formatQuota(d.resultNumber, r.campaign.totalQuotas),
    }),
  );
}

/**
 * Relógio: rifas com sorteio nas próximas 24 h. Cada uma avisa só na
 * janela mais apertada em que está (`janelaDoSorteio`), e a chave leva a
 * janela — no máximo dois avisos por pessoa, nunca os dois juntos.
 */
export async function avisarSorteiosChegando(agora = new Date()) {
  const maior = Math.max(...JANELAS_DO_SORTEIO.map((j) => j.antesMs));
  const rifas = await db
    .select({ id: campaigns.id, drawAt: campaigns.drawAt })
    .from(campaigns)
    .where(
      and(
        inArray(campaigns.status, ["published", "closed"]),
        sql`${campaigns.drawAt} > ${agora}`,
        sql`${campaigns.drawAt} <= ${new Date(agora.getTime() + maior)}`,
      ),
    );
  let total = 0;
  for (const { id, drawAt } of rifas) {
    const janela = janelaDoSorteio(drawAt, agora);
    if (!janela) continue;
    const r = await rifaComDona(id);
    if (!r) continue;
    const publico = [...(await seguidoresComSino(r.org.id)), ...(await participantes(id))];
    total += await avisar(
      publico,
      "sorteio_chegando",
      `${id}:${janela.chave}`,
      mensagemSorteioChegando({
        premio: r.campaign.prizeTitle,
        orgSlug: r.org.slug,
        slug: r.campaign.slug,
        quando: janela.texto,
      }),
    );
  }
  return total;
}

/** Reembolso respondido: só o dono do chamado. */
export async function avisarReembolso(chamadoId: string) {
  const [c] = await db.select().from(chamados).where(eq(chamados.id, chamadoId));
  if (!c || (c.status !== "aprovado" && c.status !== "recusado")) return 0;
  return avisar(
    [c.buyerId],
    "reembolso",
    `${c.id}:${c.status}`,
    mensagemReembolso({ aprovado: c.status === "aprovado", protocolo: c.protocolo }),
  );
}
