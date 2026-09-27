/**
 * Marketing e tráfego pago (etapa 16). As regras puras estão em
 * `shared/marketing.ts`.
 *
 * - Pixels (números públicos): da plataforma em `app_settings`, da
 *   organização em `organizations.pixels`. A tela recebe só os que valem
 *   para a página, e só com o interruptor ligado.
 * - Chaves de API (segredo): cifradas no cofre (`marketing_credenciais`),
 *   nunca devolvidas — a tela só sabe se existem.
 * - A compra pelo servidor: a transação que confirma o pagamento chama
 *   `enfileirarCompra()`, que grava uma linha por destino em
 *   `marketing_eventos` (chave única); o relógio (`enviarEventosPendentes`,
 *   trava 811501) manda. Falha de envio nunca toca o pagamento.
 */
import type { Request } from "express";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { campaigns, marketingCredenciais, marketingEventos, orders, organizations, buyers } from "@shared/schema";
import {
  TENTATIVAS_MAX,
  corpoGa4,
  corpoMeta,
  corpoTiktok,
  mesclarCredenciais,
  quaisCredenciais,
  rotuloDaCampanha,
  telefoneParaHash,
  temPixel,
  validarPixels,
  type Compra,
  type Credenciais,
  type Pixels,
  type Utm,
} from "@shared/marketing";
import { cifrarJson, decifrarJson, sha256 } from "./cofre";
import { orgOf } from "./orgs";
import { getPlataforma, setPlataforma } from "./settings";

export class MarketingError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "MarketingError";
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ------------------------------------------------------------------ *
 * Chaves de API
 * ------------------------------------------------------------------ */

async function lerCredenciais(dono: string): Promise<Credenciais> {
  const [c] = await db.select().from(marketingCredenciais).where(eq(marketingCredenciais.dono, dono));
  if (!c) return {};
  return decifrarJson<Credenciais>({ dados: c.dados, iv: c.iv, tag: c.tag, versao: c.chaveVersao });
}

async function gravarCredenciais(dono: string, bruto: unknown) {
  if (bruto === undefined) return quaisCredenciais(await lerCredenciais(dono));
  let novas: Credenciais;
  try {
    novas = mesclarCredenciais(await lerCredenciais(dono), bruto);
  } catch (e) {
    throw new MarketingError((e as Error).message);
  }
  const c = cifrarJson(novas);
  await db
    .insert(marketingCredenciais)
    .values({ dono, dados: c.dados, iv: c.iv, tag: c.tag, chaveVersao: c.versao })
    .onConflictDoUpdate({
      target: marketingCredenciais.dono,
      set: { dados: c.dados, iv: c.iv, tag: c.tag, chaveVersao: c.versao, atualizadoEm: new Date() },
    });
  return quaisCredenciais(novas);
}

/* ------------------------------------------------------------------ *
 * Configuração (painel)
 * ------------------------------------------------------------------ */

/**
 * Salva pixels e chaves. A plataforma mexe nos dela (e no interruptor);
 * a organização, nos dela — e só com o interruptor ligado (desligado, o
 * menu nem existe para ela: 404).
 */
export async function salvarMarketing(req: Request, corpo: { ligado?: unknown; pixels?: unknown; credenciais?: unknown }) {
  const org = orgOf(req);
  const cfg = await getPlataforma();
  let pixels: Pixels;
  try {
    pixels = validarPixels(corpo.pixels ?? {});
  } catch (e) {
    throw new MarketingError((e as Error).message);
  }
  if (!org) {
    const salva = await setPlataforma({
      marketingLigado: corpo.ligado === undefined ? undefined : corpo.ligado === true,
      marketingPixels: corpo.pixels === undefined ? undefined : pixels,
    });
    const credenciais = await gravarCredenciais("plataforma", corpo.credenciais);
    return { ligado: salva.marketingLigado, pixels: salva.marketingPixels, credenciais };
  }
  if (!cfg.marketingLigado) throw new MarketingError("Não encontrado.", 404);
  if (corpo.pixels !== undefined) await db.update(organizations).set({ pixels }).where(eq(organizations.id, org));
  const credenciais = await gravarCredenciais(org, corpo.credenciais);
  const [o] = await db.select({ pixels: organizations.pixels }).from(organizations).where(eq(organizations.id, org));
  return { ligado: true, pixels: o.pixels, credenciais };
}

/** O que o navegador precisa numa página: o interruptor e os pixels que valem nela. */
export async function pixelsPublicos(organizacao?: unknown) {
  const cfg = await getPlataforma();
  if (!cfg.marketingLigado) return { ligado: false as const };
  let daOrg: Pixels | null = null;
  if (typeof organizacao === "string" && organizacao.length <= 80) {
    const [o] = await db
      .select({ pixels: organizations.pixels })
      .from(organizations)
      .where(
        and(
          sql`(${organizations.slug} = ${organizacao} or ${organizations.id}::text = ${organizacao})`,
          sql`${organizations.archivedAt} is null`,
        ),
      );
    daOrg = o && temPixel(o.pixels) ? o.pixels : null;
  }
  return { ligado: true as const, plataforma: temPixel(cfg.marketingPixels) ? cfg.marketingPixels : null, organizacao: daOrg };
}

/* ------------------------------------------------------------------ *
 * A compra pelo servidor
 * ------------------------------------------------------------------ */

/**
 * Dentro da transação que confirma o pagamento: uma linha por destino com
 * pixel e chave. Só venda online, com consentimento, e só com o interruptor
 * ligado. `ON CONFLICT DO NOTHING`: a mesma compra nunca entra duas vezes.
 * Recebe o que foi lido antes da transação (`destinosDaCompra`), para não
 * decifrar nada com o BEGIN aberto.
 */
export async function enfileirarCompra(tx: Tx, orderId: string, destinos: Destino[]) {
  if (!destinos.length) return;
  await tx
    .insert(marketingEventos)
    .values(destinos.map((d) => ({ orderId, dono: d.dono, provedor: d.provedor, destino: d.destino })))
    .onConflictDoNothing();
}

export interface Destino {
  dono: string;
  provedor: "meta" | "ga4" | "tiktok";
  destino: string;
}

/** Para onde vai a compra deste pedido — lido antes da transação. Vazio quando não vai. */
export async function destinosDaCompra(order: { marketingConsentimento: boolean; sellerId: string | null; method: string; campaignId: string }) {
  if (!order.marketingConsentimento || order.sellerId || order.method === "bonus") return [];
  const cfg = await getPlataforma();
  if (!cfg.marketingLigado) return [];
  const [c] = await db
    .select({ orgId: campaigns.organizationId, pixels: organizations.pixels })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(eq(campaigns.id, order.campaignId));
  const donos: [string, Pixels][] = [["plataforma", cfg.marketingPixels]];
  if (c) donos.push([c.orgId, c.pixels ?? {}]);
  const saida: Destino[] = [];
  for (const [dono, px] of donos) {
    if (!temPixel(px)) continue;
    const cred = quaisCredenciais(await lerCredenciais(dono).catch(() => ({})));
    if (px.meta && cred.metaToken) saida.push({ dono, provedor: "meta", destino: px.meta });
    if (px.ga4 && cred.ga4Segredo) saida.push({ dono, provedor: "ga4", destino: px.ga4 });
    if (px.tiktok && cred.tiktokToken) saida.push({ dono, provedor: "tiktok", destino: px.tiktok });
  }
  return saida;
}

type Enviar = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const PRAZO_MS = 5_000;
const enviarComPrazo: Enviar = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(PRAZO_MS) });

/** Espera antes da próxima tentativa: 1, 5, 25, 125 minutos. */
const espera = (tentativa: number) => Math.min(125, 5 ** (tentativa - 1)) * 60_000;

/**
 * Relógio: manda o que está pendente. Cada linha é tomada num `UPDATE`
 * condicional (a tentativa sobe antes do envio), então duas réplicas não
 * mandam a mesma. Falhou `TENTATIVAS_MAX` vezes, desiste e registra.
 * `enviar` é injetável para a prova rodar sem rede.
 */
export async function enviarEventosPendentes(enviar: Enviar = enviarComPrazo, limite = 50) {
  const pendentes = await db
    .select({ id: marketingEventos.id })
    .from(marketingEventos)
    .where(and(eq(marketingEventos.status, "pendente"), lte(marketingEventos.proximaTentativa, new Date())))
    .limit(limite);
  let enviados = 0;
  for (const { id } of pendentes) {
    const [ev] = await db
      .update(marketingEventos)
      .set({ tentativas: sql`${marketingEventos.tentativas} + 1`, proximaTentativa: sql`now() + interval '10 minutes'` })
      .where(and(eq(marketingEventos.id, id), eq(marketingEventos.status, "pendente"), lte(marketingEventos.proximaTentativa, new Date())))
      .returning();
    if (!ev) continue;
    try {
      const compra = await montarCompra(ev.orderId);
      const cred = await lerCredenciais(ev.dono);
      const pedido = requisicao(ev.provedor, ev.destino, cred, compra);
      const r = await enviar(pedido.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pedido.corpo) });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
      await db.update(marketingEventos).set({ status: "enviado", enviadoEm: new Date(), ultimoErro: null }).where(eq(marketingEventos.id, ev.id));
      enviados++;
    } catch (e) {
      const desiste = ev.tentativas >= TENTATIVAS_MAX;
      await db
        .update(marketingEventos)
        .set({
          status: desiste ? "falhou" : "pendente",
          ultimoErro: String((e as Error).message ?? e).slice(0, 500),
          proximaTentativa: new Date(Date.now() + espera(ev.tentativas)),
        })
        .where(eq(marketingEventos.id, ev.id));
      if (desiste) console.error(`[marketing] desisti de ${ev.provedor} do pedido ${ev.orderId}:`, (e as Error).message);
    }
  }
  return enviados;
}

async function montarCompra(orderId: string): Promise<Compra> {
  const [o] = await db
    .select({ o: orders, titulo: campaigns.title, slug: campaigns.slug, telefone: buyers.phone })
    .from(orders)
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .where(eq(orders.id, orderId));
  if (!o) throw new Error("pedido sumiu");
  const tel = o.o.marketingConsentimento ? telefoneParaHash(o.telefone ?? "") : null;
  const utm = (o.o.utm ?? {}) as Utm;
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return {
    codigo: o.o.code,
    valorCents: o.o.amountCents,
    quantidade: o.o.quantity,
    campanhaId: o.o.campaignId,
    campanhaTitulo: o.titulo,
    pagoEm: o.o.paidAt ?? new Date(),
    telefoneHash: tel ? sha256(tel) : undefined,
    fbclid: utm.fbclid,
    ttclid: utm.ttclid,
    // Sem o cookie do GA no servidor: o aparelho (hash) faz o papel de client_id.
    clienteId: (o.o.deviceHash ?? o.o.id).slice(0, 32),
    urlDaRifa: `${base}/r/${o.slug}`,
  };
}

function requisicao(provedor: string, destino: string, cred: Credenciais, c: Compra) {
  if (provedor === "meta") {
    if (!cred.metaToken) throw new Error("sem token da Meta");
    return { url: `https://graph.facebook.com/v19.0/${destino}/events?access_token=${encodeURIComponent(cred.metaToken)}`, corpo: corpoMeta(c) };
  }
  if (provedor === "ga4") {
    if (!cred.ga4Segredo) throw new Error("sem segredo do GA4");
    return {
      url: `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(destino)}&api_secret=${encodeURIComponent(cred.ga4Segredo)}`,
      corpo: corpoGa4(c),
    };
  }
  if (provedor === "tiktok") {
    if (!cred.tiktokToken) throw new Error("sem token do TikTok");
    return { url: `https://business-api.tiktok.com/open_api/v1.3/event/track/?access_token=${encodeURIComponent(cred.tiktokToken)}`, corpo: corpoTiktok(destino, c) };
  }
  throw new Error(`provedor desconhecido: ${provedor}`);
}

/* ------------------------------------------------------------------ *
 * Painel
 * ------------------------------------------------------------------ */

/**
 * O painel Marketing, nos dois recortes. Organizador: os pixels e chaves
 * dele e as vendas por campanha das rifas dele — e 404 com o interruptor
 * desligado. Plataforma: o interruptor, os dela, a fila de envio e as
 * vendas por campanha de todas.
 */
export async function painelDoMarketing(req: Request, diasBrutos?: unknown) {
  const org = orgOf(req);
  const cfg = await getPlataforma();
  if (org && !cfg.marketingLigado) throw new MarketingError("Não encontrado.", 404);
  const dias = [7, 30, 90].includes(Number(diasBrutos)) ? Number(diasBrutos) : 30;
  const filtroOrg = org ? sql`and c.organization_id = ${org}::uuid` : sql``;
  const linhas = (
    await db.execute(sql`
      select o.utm, o.status, o.amount_cents
        from orders o join campaigns c on c.id = o.campaign_id
       where o.utm is not null and o.created_at > now() - make_interval(days => ${dias}) ${filtroOrg}`)
  ).rows as { utm: Utm; status: string; amount_cents: number }[];
  // Agrupado aqui: as linhas são poucas (só venda que veio com UTM) e o rótulo mora em `rotuloDaCampanha`.
  const grupos = new Map<string, { fonte: string; meio: string; campanha: string; pedidos: number; vendas: number; receitaCents: number }>();
  for (const l of linhas) {
    const r = rotuloDaCampanha(l.utm);
    const k = `${r.fonte}|${r.meio}|${r.campanha}`;
    const g = grupos.get(k) ?? { ...r, pedidos: 0, vendas: 0, receitaCents: 0 };
    g.pedidos++;
    if (l.status === "paid") {
      g.vendas++;
      g.receitaCents += Number(l.amount_cents);
    }
    grupos.set(k, g);
  }
  const campanhas = [...grupos.values()].sort((a, b) => b.receitaCents - a.receitaCents || b.pedidos - a.pedidos).slice(0, 50);
  const filtroFila = org ? sql`where dono = ${org}` : sql``;
  const fila = (
    await db.execute(sql`
      select provedor, status, count(*)::int as n from marketing_eventos ${filtroFila}
       ${org ? sql`and` : sql`where`} created_at > now() - make_interval(days => ${dias})
       group by provedor, status`)
  ).rows as { provedor: string; status: string; n: number }[];
  const [o] = org ? await db.select({ pixels: organizations.pixels }).from(organizations).where(eq(organizations.id, org)) : [];
  return {
    plataforma: !org,
    dias,
    ligado: cfg.marketingLigado,
    pixels: org ? (o?.pixels ?? {}) : cfg.marketingPixels,
    credenciais: quaisCredenciais(await lerCredenciais(org ?? "plataforma").catch(() => ({}))),
    campanhas,
    envios: fila.map((f) => ({ provedor: f.provedor, status: f.status, n: Number(f.n) })),
  };
}
