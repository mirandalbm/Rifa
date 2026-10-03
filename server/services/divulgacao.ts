/**
 * Divulgação de terceiros: a peça do afiliado (influenciador) e do apostador
 * sobre a rifa de uma organização. Regras puras em `shared/divulgacao.ts`.
 *
 * O que não se afrouxa aqui:
 * - A divulgação **não toca a rifa**: só grava uma legenda e a escolha de
 *   mídias que a organização já publicou. Preço, cotas, prêmio e
 *   autorização SPA/MF ficam onde estavam.
 * - O afiliado só divulga com vínculo aprovado e, se a rifa foi publicada
 *   com termo, o aceite daquela versão (`comissaoNaRifa()`), e a peça só
 *   aparece enquanto isso continuar valendo.
 * - O texto passa pela régua da legenda (sem link, sem telefone) e pela
 *   varredura do Pix por fora: quem pede pagamento fora da plataforma é
 *   recusado e vira denúncia automática (fora do fluxo, `emSegundoPlano`).
 * - Decidir é `UPDATE` condicional com a linha travada (`FOR UPDATE`): dois
 *   cliques, uma decisão, um 409. O pedido do vizinho é 404.
 * - O apostador só publica atrás do interruptor `publicarApostador`, só
 *   texto, só de rifa em que tem compra paga, e sempre com autorização.
 */
import type { Request } from "express";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  afiliadoVinculos,
  affiliates,
  buyers,
  campaignMedia,
  campaigns,
  divulgacoes,
  orders,
  organizations,
  users,
} from "@shared/schema";
import {
  DE_PARA_DA_DECISAO,
  DIVULGACAO_MIDIAS_MAX,
  DIVULGACOES_POR_DIA,
  STATUS_DA_DIVULGACAO,
  linkDaDivulgacao,
  statusInicial,
  validarDecisao,
  validarDivulgacao,
  validarModo,
  type AutorDaDivulgacao,
  type ModoDeDivulgacao,
  avisoDaDecisao,
  type StatusDaDivulgacao,
} from "@shared/divulgacao";
import { pedePagamentoPorFora } from "@shared/seguranca";
import { nomeCurto } from "@shared/aoVivo";
import { orgOf } from "./orgs";
import { hit } from "./antifraude";
import { comissaoNaRifa } from "./afiliados";
import { avisar, emSegundoPlano } from "./push";
import { varrerTextoDoOrganizador } from "./seguranca";
import { getPlataforma } from "./settings";
import { withUrls } from "./media";
import { isUniqueViolation } from "../pgError";

export class DivulgacaoError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "DivulgacaoError";
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** O que a régua de texto diz vira 422 — erro de preenchimento, não de acesso. */
function regra<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    throw new DivulgacaoError((e as Error).message, 422);
  }
}

/**
 * A rifa que aceita divulgação: publicada, de verdade (não demonstração),
 * não travada, de organização no ar. Rascunho, encerrada, travada, banida e
 * arquivada não recebem peça nova.
 */
async function rifaParaDivulgar(slug: unknown) {
  if (typeof slug !== "string" || !slug) throw new DivulgacaoError("Rifa não encontrada.", 404);
  const [r] = await db
    .select({
      id: campaigns.id,
      slug: campaigns.slug,
      title: campaigns.title,
      organizationId: campaigns.organizationId,
      termoId: campaigns.termoId,
      commissionPctDefault: campaigns.commissionPctDefault,
      modo: organizations.divulgacaoAfiliado,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(
      and(
        eq(campaigns.slug, slug),
        eq(campaigns.status, "published"),
        eq(campaigns.demonstracao, false),
        isNull(campaigns.travadaEm),
        eq(organizations.active, true),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    );
  if (!r) throw new DivulgacaoError("Rifa não encontrada.", 404);
  return r;
}

/**
 * Texto de terceiro que pede pagamento por fora: recusado na hora e, fora do
 * fluxo, vira denúncia automática para a plataforma (com quem escreveu na
 * evidência). A denúncia tem a organização como alvo porque é a rifa dela
 * que o texto usaria — quem decide é a plataforma, que lê a evidência.
 */
function barrarPixPorFora(legenda: string, rifa: { id: string; organizationId: string }, quem: string) {
  if (!legenda || !pedePagamentoPorFora(legenda)) return;
  emSegundoPlano(
    varrerTextoDoOrganizador({
      organizationId: rifa.organizationId,
      campaignId: rifa.id,
      onde: `texto de terceiro (${quem}), recusado e não publicado`,
      texto: legenda,
    }),
    "varredura",
  );
  throw new DivulgacaoError("A legenda parece pedir pagamento por fora da plataforma. Só vale bilhete pago aqui.", 422);
}

async function gravar(valores: typeof divulgacoes.$inferInsert) {
  try {
    const [d] = await db.insert(divulgacoes).values(valores).returning();
    return d;
  } catch (err) {
    // Quem decide é o índice: um pedido em análise por autor e rifa.
    if (isUniqueViolation(err, "uq_divulgacao_afiliado_em_analise") || isUniqueViolation(err, "uq_divulgacao_apostador_em_analise")) {
      throw new DivulgacaoError("Você já tem uma divulgação desta rifa esperando a organização.", 409);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Afiliado (influenciador)
 * ------------------------------------------------------------------ */

async function afiliadoOnline(affiliateId: string) {
  const [a] = await db
    .select({ id: affiliates.id, code: affiliates.code, kind: affiliates.kind, status: affiliates.status, nome: users.name })
    .from(affiliates)
    .innerJoin(users, eq(users.id, affiliates.userId))
    .where(eq(affiliates.id, affiliateId));
  if (!a || a.kind !== "online" || a.status !== "active") throw new DivulgacaoError("Sua conta de afiliado não está ativa.", 403);
  return a;
}

export async function publicarComoAfiliado(affiliateId: string, entrada: Record<string, unknown>) {
  const dados = regra(() => validarDivulgacao("afiliado", entrada));
  const a = await afiliadoOnline(affiliateId);
  const rifa = await rifaParaDivulgar(entrada.slug);
  // Vínculo aprovado e aceite da versão do termo da rifa: a mesma régua da comissão.
  const { recebe } = await comissaoNaRifa(db, affiliateId, rifa);
  if (!recebe) {
    throw new DivulgacaoError("Para divulgar esta rifa você precisa de vínculo aprovado com a organização e do aceite do termo dela.", 403);
  }
  // Conta a tentativa antes de recusar: quem insiste com o mesmo texto estoura o limite.
  const limite = await hit(`divulgacao:afiliado:${affiliateId}`, 24 * 60, DIVULGACOES_POR_DIA);
  if (limite.excedeu) throw new DivulgacaoError("Muitas divulgações hoje. Tente amanhã.", 429);
  barrarPixPorFora(dados.legenda, rifa, `afiliado ${a.code}`);

  // As mídias são da própria rifa, já prontas: nada do cliente vira arquivo.
  if (dados.midias.length) {
    const ok = await db
      .select({ id: campaignMedia.id })
      .from(campaignMedia)
      .where(and(eq(campaignMedia.campaignId, rifa.id), eq(campaignMedia.status, "ready"), inArray(campaignMedia.id, dados.midias)));
    if (ok.length !== dados.midias.length) throw new DivulgacaoError("Escolha só mídias desta rifa.", 422);
  }
  const modo = validarModo(rifa.modo);
  const status = statusInicial("afiliado", modo);
  const d = await gravar({
    campaignId: rifa.id,
    organizationId: rifa.organizationId,
    autor: "afiliado",
    affiliateId,
    legenda: dados.legenda,
    midiaIds: dados.midias,
    status,
    decididoEm: status === "publicada" ? new Date() : null,
  });
  return { id: d.id, status: d.status, modo };
}

/** As rifas que este afiliado pode divulgar agora, com as mídias que ele pode escolher. */
export async function rifasParaDivulgar(affiliateId: string) {
  // Só as organizações onde o afiliado pode ter vínculo (aprovado, ou a antiga
  // do usuário): o resto nem entra na conferência rifa a rifa de `comissaoNaRifa`.
  const orgs = new Set<string>();
  const vinculadas = await db
    .select({ org: afiliadoVinculos.organizationId })
    .from(afiliadoVinculos)
    .where(and(eq(afiliadoVinculos.affiliateId, affiliateId), eq(afiliadoVinculos.status, "aprovado")));
  for (const v of vinculadas) orgs.add(v.org);
  const [dono] = await db
    .select({ org: users.organizationId })
    .from(affiliates)
    .innerJoin(users, eq(users.id, affiliates.userId))
    .where(eq(affiliates.id, affiliateId));
  if (dono?.org) orgs.add(dono.org);
  if (orgs.size === 0) return [];
  const rifas = await db
    .select({
      id: campaigns.id,
      slug: campaigns.slug,
      title: campaigns.title,
      organizationId: campaigns.organizationId,
      termoId: campaigns.termoId,
      commissionPctDefault: campaigns.commissionPctDefault,
      organizacao: organizations.name,
      modo: organizations.divulgacaoAfiliado,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(
      and(
        eq(campaigns.status, "published"),
        eq(campaigns.demonstracao, false),
        isNull(campaigns.travadaEm),
        inArray(campaigns.organizationId, [...orgs]),
        eq(organizations.active, true),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    );
  const aptas: typeof rifas = [];
  for (const r of rifas) if ((await comissaoNaRifa(db, affiliateId, r)).recebe) aptas.push(r);
  if (aptas.length === 0) return [];
  const midias = await db
    .select()
    .from(campaignMedia)
    .where(and(inArray(campaignMedia.campaignId, aptas.map((r) => r.id)), eq(campaignMedia.status, "ready")))
    .orderBy(asc(campaignMedia.position));
  return aptas.map((r) => ({
    slug: r.slug,
    title: r.title,
    organizacao: r.organizacao,
    modo: r.modo,
    midias: midias
      .filter((m) => m.campaignId === r.id)
      .slice(0, 10)
      .map((m) => {
        const u = withUrls(m);
        return { id: m.id, role: m.role, url: u.url, poster: u.posterUrl, alt: m.altText };
      }),
  }));
}

/* ------------------------------------------------------------------ *
 * Apostador
 * ------------------------------------------------------------------ */

async function interruptorDoApostador() {
  if (!(await getPlataforma()).publicarApostador) throw new DivulgacaoError("Não encontrado.", 404);
}

async function apostadorComConta(req: Request) {
  const buyerId = req.session.buyer?.id;
  if (!buyerId) throw new DivulgacaoError("Entre na sua conta.", 401);
  const [b] = await db
    .select({ id: buyers.id, apelido: buyers.apelido })
    .from(buyers)
    .where(and(eq(buyers.id, buyerId), isNull(buyers.excluidoEm)));
  if (!b?.apelido) throw new DivulgacaoError("Escolha seu apelido em Minha conta para publicar.", 409);
  return b;
}

/** As rifas em que a pessoa tem compra paga — as únicas sobre as quais ela publica. */
export async function rifasDoApostador(req: Request) {
  await interruptorDoApostador();
  const b = await apostadorComConta(req);
  return db
    .selectDistinct({ slug: campaigns.slug, title: campaigns.title })
    .from(orders)
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(
      and(
        eq(orders.buyerId, b.id),
        eq(orders.status, "paid"),
        eq(campaigns.status, "published"),
        eq(campaigns.demonstracao, false),
        isNull(campaigns.travadaEm),
        eq(organizations.active, true),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    );
}

export async function publicarComoApostador(req: Request, entrada: Record<string, unknown>) {
  await interruptorDoApostador();
  const b = await apostadorComConta(req);
  const dados = regra(() => validarDivulgacao("apostador", entrada));
  const rifa = await rifaParaDivulgar(entrada.slug);
  // Só fala da rifa quem joga nela: compra paga (a PK do pedido, não um palpite).
  const [joga] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.buyerId, b.id), eq(orders.campaignId, rifa.id), eq(orders.status, "paid")))
    .limit(1);
  if (!joga) throw new DivulgacaoError("Só quem comprou esta rifa publica sobre ela.", 403);
  const limite = await hit(`divulgacao:apostador:${b.id}`, 24 * 60, DIVULGACOES_POR_DIA);
  if (limite.excedeu) throw new DivulgacaoError("Muitas divulgações hoje. Tente amanhã.", 429);
  barrarPixPorFora(dados.legenda, rifa, `apostador @${b.apelido}`);
  const d = await gravar({
    campaignId: rifa.id,
    organizationId: rifa.organizationId,
    autor: "apostador",
    buyerId: b.id,
    legenda: dados.legenda,
    midiaIds: [],
    // Sempre a organização antes de ir ao ar, qualquer que seja o modo dela.
    status: statusInicial("apostador", "direta"),
  });
  return { id: d.id, status: d.status };
}

/* ------------------------------------------------------------------ *
 * Minhas peças e retirar a própria
 * ------------------------------------------------------------------ */

const colunasDaMinha = {
  id: divulgacoes.id,
  slug: campaigns.slug,
  title: campaigns.title,
  legenda: divulgacoes.legenda,
  midias: divulgacoes.midiaIds,
  status: divulgacoes.status,
  motivo: divulgacoes.motivo,
  criadaEm: divulgacoes.createdAt,
};

export async function minhasDoAfiliado(affiliateId: string) {
  return db
    .select(colunasDaMinha)
    .from(divulgacoes)
    .innerJoin(campaigns, eq(campaigns.id, divulgacoes.campaignId))
    .where(eq(divulgacoes.affiliateId, affiliateId))
    .orderBy(desc(divulgacoes.createdAt))
    .limit(50);
}

export async function minhasDoApostador(req: Request) {
  await interruptorDoApostador();
  const b = await apostadorComConta(req);
  return db
    .select(colunasDaMinha)
    .from(divulgacoes)
    .innerJoin(campaigns, eq(campaigns.id, divulgacoes.campaignId))
    .where(eq(divulgacoes.buyerId, b.id))
    .orderBy(desc(divulgacoes.createdAt))
    .limit(50);
}

/** Quem escreveu retira a própria peça (em análise ou no ar). O de outra pessoa é 404. */
export async function retirarPropria(dono: { affiliateId: string } | { buyerId: string }, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DivulgacaoError("Divulgação não encontrada.", 404);
  const dono_ = "affiliateId" in dono ? eq(divulgacoes.affiliateId, dono.affiliateId) : eq(divulgacoes.buyerId, dono.buyerId);
  const [r] = await db
    .update(divulgacoes)
    // Quem retirou foi o próprio autor: `decidido_por` nulo — senão a peça que a
    // organização tinha aprovado contaria como decisão dela no sino do afiliado.
    .set({ status: "removida", decididoEm: new Date(), decididoPor: null })
    .where(and(eq(divulgacoes.id, id), dono_, inArray(divulgacoes.status, ["em_analise", "publicada"])))
    .returning({ id: divulgacoes.id });
  if (!r) throw new DivulgacaoError("Divulgação não encontrada.", 404);
  return { ok: true };
}

export async function retirarPropriaDoApostador(req: Request, id: string) {
  await interruptorDoApostador();
  const b = await apostadorComConta(req);
  return retirarPropria({ buyerId: b.id }, id);
}

/* ------------------------------------------------------------------ *
 * Organização: o modo, a fila e a decisão
 * ------------------------------------------------------------------ */

export async function modoDaOrganizacao(orgId: string): Promise<ModoDeDivulgacao> {
  const [o] = await db.select({ m: organizations.divulgacaoAfiliado }).from(organizations).where(eq(organizations.id, orgId));
  if (!o) throw new DivulgacaoError("Organização não encontrada.", 404);
  return validarModo(o.m);
}

export async function salvarModo(orgId: string, entrada: unknown) {
  const modo = regra(() => validarModo((entrada as { modo?: unknown } | null)?.modo));
  const [o] = await db
    .update(organizations)
    .set({ divulgacaoAfiliado: modo })
    .where(and(eq(organizations.id, orgId), isNull(organizations.archivedAt)))
    .returning({ id: organizations.id });
  if (!o) throw new DivulgacaoError("Organização não encontrada.", 404);
  return { modo };
}

/**
 * A fila da organização (a plataforma, com `orgOf` nulo, vê todas). Nunca
 * traz telefone, CPF nem e-mail: afiliado pelo nome curto e código,
 * apostador pelo apelido.
 */
export async function listarDaOrganizacao(req: Request, status?: unknown) {
  const org = orgOf(req);
  const filtro = typeof status === "string" && status in STATUS_DA_DIVULGACAO ? status : null;
  const linhas = await db
    .select({
      id: divulgacoes.id,
      autor: divulgacoes.autor,
      legenda: divulgacoes.legenda,
      midiaIds: divulgacoes.midiaIds,
      status: divulgacoes.status,
      motivo: divulgacoes.motivo,
      criadaEm: divulgacoes.createdAt,
      slug: campaigns.slug,
      rifa: campaigns.title,
      organizacao: organizations.name,
      codigo: affiliates.code,
      nomeAfiliado: users.name,
      apelido: buyers.apelido,
    })
    .from(divulgacoes)
    .innerJoin(campaigns, eq(campaigns.id, divulgacoes.campaignId))
    .innerJoin(organizations, eq(organizations.id, divulgacoes.organizationId))
    .leftJoin(affiliates, eq(affiliates.id, divulgacoes.affiliateId))
    .leftJoin(users, eq(users.id, affiliates.userId))
    .leftJoin(buyers, eq(buyers.id, divulgacoes.buyerId))
    .where(and(org ? eq(divulgacoes.organizationId, org) : undefined, filtro ? eq(divulgacoes.status, filtro) : undefined))
    // A que espera a organização vem primeiro.
    .orderBy(sql`(${divulgacoes.status} = 'em_analise') desc`, desc(divulgacoes.createdAt))
    .limit(100);
  return linhas.map(({ nomeAfiliado, apelido, codigo, midiaIds, ...l }) => ({
    ...l,
    midias: midiaIds.length,
    quem: l.autor === "afiliado" ? `${nomeCurto(nomeAfiliado)} (${codigo})` : `@${apelido ?? "apostador"}`,
  }));
}

/** Quantas peças esperam a organização — para o aviso da tela, sem trazer a lista. */
export async function pendentesDaOrganizacao(req: Request) {
  const org = orgOf(req);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(divulgacoes)
    .where(and(eq(divulgacoes.status, "em_analise"), org ? eq(divulgacoes.organizationId, org) : undefined));
  return r?.n ?? 0;
}

/**
 * Decide uma peça. A linha é travada (`FOR UPDATE`) e o `UPDATE` repete o
 * status que a régua conferiu: dois cliques dão uma decisão e um 409. O do
 * vizinho é 404 — conferido antes de tudo.
 */
export async function decidir(req: Request, id: string, entrada: unknown) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DivulgacaoError("Divulgação não encontrada.", 404);
  const { acao, motivo } = regra(() => validarDecisao(entrada));
  const { de, para } = DE_PARA_DA_DECISAO[acao];
  const org = orgOf(req);
  const decidida = await db.transaction(async (tx: Tx) => {
    const r = await tx.execute(sql`select id, organization_id, campaign_id, autor, affiliate_id, status from divulgacoes where id = ${id} for update`);
    const linha = r.rows[0] as
      | { id: string; organization_id: string; campaign_id: string; autor: string; affiliate_id: string | null; status: string }
      | undefined;
    if (!linha || (org && linha.organization_id !== org)) throw new DivulgacaoError("Divulgação não encontrada.", 404);
    if (linha.status !== de) throw new DivulgacaoError("Esta divulgação já foi decidida.", 409);
    if (acao === "aprovar") {
      // Aprovar põe no ar: a rifa e o vínculo precisam continuar valendo.
      const [c] = await tx
        .select({
          id: campaigns.id,
          organizationId: campaigns.organizationId,
          termoId: campaigns.termoId,
          commissionPctDefault: campaigns.commissionPctDefault,
          status: campaigns.status,
          travadaEm: campaigns.travadaEm,
        })
        .from(campaigns)
        .where(eq(campaigns.id, linha.campaign_id));
      if (!c || c.status !== "published" || c.travadaEm) throw new DivulgacaoError("A rifa não está mais no ar.", 409);
      if (linha.affiliate_id && !(await comissaoNaRifa(tx, linha.affiliate_id, c)).recebe) {
        throw new DivulgacaoError("O afiliado não tem mais vínculo aprovado ou o aceite do termo desta rifa.", 409);
      }
    }
    const [novo] = await tx
      .update(divulgacoes)
      // O relógio do banco, como o "visto" do afiliado: réplicas com relógios
      // diferentes não escondem a decisão do sino dele.
      .set({ status: para, motivo, decididoEm: sql`now()`, decididoPor: req.user?.id ?? null })
      .where(and(eq(divulgacoes.id, id), eq(divulgacoes.status, de)))
      .returning({ id: divulgacoes.id, status: divulgacoes.status, buyerId: divulgacoes.buyerId });
    if (!novo) throw new DivulgacaoError("Esta divulgação já foi decidida.", 409);
    return { id: novo.id, status: novo.status, buyerId: novo.buyerId, motivo, acao, campaignId: linha.campaign_id };
  });
  // Quem publicou fica sabendo, fora da transação: aviso nunca derruba a decisão.
  // Leva o que ESTA transação decidiu — reler a linha depois pegaria a retirada
  // que o próprio autor fez logo em seguida e mandaria o aviso errado.
  if (decidida.buyerId) {
    emSegundoPlano(
      avisarAutorDaDecisao({ id, buyerId: decidida.buyerId, status: decidida.status as StatusDaDivulgacao, motivo, campaignId: decidida.campaignId }),
      "aviso da divulgação",
    );
  }
  return { id: decidida.id, status: decidida.status, acao: decidida.acao, campaignId: decidida.campaignId };
}

/**
 * O apostador recebe push e o aviso no trevo (a chave leva a situação: a mesma
 * decisão não avisa duas vezes). O afiliado não tem push — vê o número no sino
 * do painel (`decididasParaOAfiliado`). Sem telefone nem nome no aviso.
 */
async function avisarAutorDaDecisao(d: { id: string; buyerId: string; status: StatusDaDivulgacao; motivo: string | null; campaignId: string }) {
  const [c] = await db.select({ titulo: campaigns.title }).from(campaigns).where(eq(campaigns.id, d.campaignId));
  if (!c) return;
  const texto = avisoDaDecisao(d.status, c.titulo, d.motivo);
  if (!texto) return;
  await avisar([d.buyerId], "divulgacao", `${d.id}:${d.status}`, { ...texto, url: "/publicar", tag: `divulgacao-${d.id}` });
}

/**
 * Quantas peças do afiliado a organização decidiu desde a última vez que ele
 * abriu o sino (`users.avisos_vistos_em`, o mesmo "visto" do painel). Só a
 * decisão da organização (`decidido_por`), nunca o que ele mesmo retirou.
 */
export async function decididasParaOAfiliado(affiliateId: string, userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(divulgacoes)
    .innerJoin(users, eq(users.id, userId))
    .where(
      and(
        eq(divulgacoes.affiliateId, affiliateId),
        isNotNull(divulgacoes.decididoPor),
        isNotNull(divulgacoes.decididoEm),
        sql`${divulgacoes.decididoEm} > coalesce(${users.avisosVistosEm}, '-infinity'::timestamp)`,
      ),
    );
  return r?.n ?? 0;
}

/** O afiliado abriu o sino: o que já foi decidido fica visto, para ele. */
export async function marcarVistoDoAfiliado(userId: string) {
  // O relógio do banco, o mesmo de `decidido_em`.
  await db.update(users).set({ avisosVistosEm: sql`now()` }).where(eq(users.id, userId));
}

/* ------------------------------------------------------------------ *
 * Público: as divulgações na página da rifa
 * ------------------------------------------------------------------ */

const NA_PAGINA_DA_RIFA = 12;

/**
 * As peças no ar de uma rifa. Só enquanto a rifa vende de verdade e a
 * condição de quem publicou continua valendo: o afiliado perdeu o vínculo
 * ou o aceite, a peça some; o interruptor do apostador desligou, as dele
 * somem. Sem telefone, e-mail ou CPF — nome curto e apelido.
 */
export async function divulgacoesDaRifa(slug: string) {
  const [c] = await db
    .select({
      id: campaigns.id,
      slug: campaigns.slug,
      organizationId: campaigns.organizationId,
      termoId: campaigns.termoId,
      commissionPctDefault: campaigns.commissionPctDefault,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(
      and(
        eq(campaigns.slug, slug),
        eq(campaigns.status, "published"),
        eq(campaigns.demonstracao, false),
        isNull(campaigns.travadaEm),
        eq(organizations.active, true),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    );
  if (!c) return [];
  const apostadorLigado = (await getPlataforma()).publicarApostador;
  const linhas = await db
    .select({
      id: divulgacoes.id,
      autor: divulgacoes.autor,
      legenda: divulgacoes.legenda,
      midiaIds: divulgacoes.midiaIds,
      criadaEm: divulgacoes.createdAt,
      affiliateId: divulgacoes.affiliateId,
      codigo: affiliates.code,
      afiliadoAtivo: affiliates.status,
      nomeAfiliado: users.name,
      apelido: buyers.apelido,
      excluido: buyers.excluidoEm,
      // O estorno desfaz a compra: a peça de quem não joga mais sai do ar (sem apagar nada).
      compraPaga: sql<boolean>`exists (
        select 1 from orders o
         where o.buyer_id = ${divulgacoes.buyerId} and o.campaign_id = ${divulgacoes.campaignId} and o.status = 'paid'
      )`,
    })
    .from(divulgacoes)
    .leftJoin(affiliates, eq(affiliates.id, divulgacoes.affiliateId))
    .leftJoin(users, eq(users.id, affiliates.userId))
    .leftJoin(buyers, eq(buyers.id, divulgacoes.buyerId))
    .where(and(eq(divulgacoes.campaignId, c.id), eq(divulgacoes.status, "publicada")))
    .orderBy(desc(divulgacoes.createdAt))
    .limit(NA_PAGINA_DA_RIFA * 2);

  const ids = Array.from(new Set(linhas.flatMap((l) => l.midiaIds)));
  const midias = ids.length
    ? await db.select().from(campaignMedia).where(and(eq(campaignMedia.campaignId, c.id), eq(campaignMedia.status, "ready"), inArray(campaignMedia.id, ids)))
    : [];
  const porId = new Map(midias.map((m) => [m.id, m]));

  const saida = [];
  for (const l of linhas) {
    if (saida.length >= NA_PAGINA_DA_RIFA) break;
    if (l.autor === "afiliado") {
      if (!l.affiliateId || !l.codigo || l.afiliadoAtivo !== "active") continue;
      if (!(await comissaoNaRifa(db, l.affiliateId, c)).recebe) continue;
    } else if (!apostadorLigado || !l.apelido || l.excluido || !l.compraPaga) continue;
    saida.push({
      id: l.id,
      autor: l.autor,
      quem: l.autor === "afiliado" ? nomeCurto(l.nomeAfiliado) : `@${l.apelido}`,
      apelido: l.autor === "apostador" ? l.apelido : null,
      codigo: l.autor === "afiliado" ? l.codigo : null,
      legenda: l.legenda,
      criadaEm: l.criadaEm,
      // O link de quem divulga (só afiliado): a compra por ele paga a comissão dele.
      link: linkDaDivulgacao(c.slug, l.autor === "afiliado" ? l.codigo : null),
      midias: l.midiaIds
        .map((id) => porId.get(id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .slice(0, DIVULGACAO_MIDIAS_MAX)
        .map((m) => {
          const u = withUrls(m);
          return { role: m.role, url: u.url, poster: u.posterUrl, srcSet: u.srcSetWebp, alt: m.altText };
        }),
    });
  }
  return saida;
}
