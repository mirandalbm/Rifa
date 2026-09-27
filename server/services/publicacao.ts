/**
 * A publicação da rifa, como no Instagram: a barra de ações (curtir com o
 * trevo, republicar, salvar, compartilhar) e a legenda da organização.
 * Regras em `shared/publicacao.ts`.
 *
 * - Cada ação é a chave (rifa, pessoa): `ON CONFLICT DO NOTHING`, e o
 *   contador da rifa só anda quando a linha entrou ou saiu, na mesma
 *   transação — cinco toques simultâneos, uma curtida. Nada de `COUNT(*)`.
 * - Só quem tem conta age (401 sem sessão); rascunho não tem publicação (404).
 * - Salvar é privado: não tem contador, e só a própria pessoa lê a lista.
 * - Compartilhar conta uma vez por pessoa ou aparelho (em hash).
 */
import type { Request } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  buyers,
  campaigns,
  organizations,
  publicacaoCompartilhamentos,
  publicacaoCurtidas,
  publicacaoRepublicacoes,
  publicacaoSalvos,
} from "@shared/schema";
import { limparLegenda, problemaNaLegenda, type Acao } from "@shared/publicacao";
import { identify } from "./antifraude";
import { emSegundoPlano } from "./push";
import { varrerTextoDoOrganizador } from "./seguranca";

export class PublicacaoError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "PublicacaoError";
  }
}

const TABELA = {
  curtida: { tabela: publicacaoCurtidas, contador: campaigns.curtidasCount, coluna: "curtidasCount" },
  republicacao: { tabela: publicacaoRepublicacoes, contador: campaigns.republicacoesCount, coluna: "republicacoesCount" },
  salvo: { tabela: publicacaoSalvos, contador: null, coluna: null },
} as const;

/** A rifa que tem publicação: publicada (ou encerrada/sorteada), organização no ar. */
async function publicacao(slug: string) {
  const [r] = await db
    .select({ id: campaigns.id, status: campaigns.status, organizationId: campaigns.organizationId })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(and(eq(campaigns.slug, slug), isNull(organizations.archivedAt)));
  if (!r || r.status === "draft") throw new PublicacaoError("Rifa não encontrada.", 404);
  return r;
}

async function contadores(campaignId: string) {
  const [c] = await db
    .select({
      curtidas: campaigns.curtidasCount,
      comentarios: campaigns.comentariosCount,
      republicacoes: campaigns.republicacoesCount,
      compartilhamentos: campaigns.compartilhamentosCount,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  return c;
}

/**
 * Liga ou desliga uma ação (curtir, republicar, salvar). Idempotente: ligar
 * duas vezes é uma linha e um passo no contador.
 */
export async function marcar(req: Request, slug: string, acao: Acao, ligar: boolean) {
  const buyerId = req.session.buyer?.id;
  if (!buyerId) throw new PublicacaoError("Entre na sua conta.", 401);
  const def = TABELA[acao];
  if (!def) throw new PublicacaoError("Ação desconhecida.", 400);
  const rifa = await publicacao(slug);
  if (acao === "republicacao") {
    // Republicar aparece no perfil público: precisa de apelido.
    const [eu] = await db.select({ apelido: buyers.apelido }).from(buyers).where(eq(buyers.id, buyerId));
    if (!eu?.apelido) throw new PublicacaoError("Escolha seu apelido em Minha conta para republicar.", 409);
  }
  await db.transaction(async (tx) => {
    const mudou = ligar
      ? await tx.insert(def.tabela).values({ campaignId: rifa.id, buyerId }).onConflictDoNothing().returning()
      : await tx
          .delete(def.tabela)
          .where(and(eq(def.tabela.campaignId, rifa.id), eq(def.tabela.buyerId, buyerId)))
          .returning();
    if (mudou.length && def.contador && def.coluna) {
      await tx
        .update(campaigns)
        .set({ [def.coluna]: ligar ? sql`${def.contador} + 1` : sql`greatest(${def.contador} - 1, 0)` })
        .where(eq(campaigns.id, rifa.id));
    }
  });
  return { ...(await contadores(rifa.id)), ...(await minhasMarcas(buyerId, [rifa.id])).get(rifa.id) };
}

/** Compartilhou: conta uma vez por pessoa (ou aparelho), e devolve o contador. */
export async function compartilhar(req: Request, slug: string) {
  const rifa = await publicacao(slug);
  const quem = req.session.buyer?.id ? `comprador:${req.session.buyer.id}` : identify(req).deviceHash ?? identify(req).ipHash;
  if (quem) {
    await db.transaction(async (tx) => {
      const entrou = await tx.insert(publicacaoCompartilhamentos).values({ campaignId: rifa.id, quem }).onConflictDoNothing().returning();
      if (entrou.length) {
        await tx
          .update(campaigns)
          .set({ compartilhamentosCount: sql`${campaigns.compartilhamentosCount} + 1` })
          .where(eq(campaigns.id, rifa.id));
      }
    });
  }
  return contadores(rifa.id);
}

/** O que esta pessoa já fez em cada rifa (curti, republiquei, salvei) — uma consulta por ação. */
export async function minhasMarcas(buyerId: string | null | undefined, ids: string[]) {
  const mapa = new Map<string, { curti: boolean; republiquei: boolean; salvei: boolean }>();
  for (const id of ids) mapa.set(id, { curti: false, republiquei: false, salvei: false });
  if (!buyerId || ids.length === 0) return mapa;
  const lê = async (t: typeof publicacaoCurtidas) =>
    new Set(
      (await db.select({ id: t.campaignId }).from(t).where(and(eq(t.buyerId, buyerId), inArray(t.campaignId, ids)))).map((r) => r.id),
    );
  const [c, r, s] = await Promise.all([lê(publicacaoCurtidas), lê(publicacaoRepublicacoes), lê(publicacaoSalvos)]);
  for (const id of ids) mapa.set(id, { curti: c.has(id), republiquei: r.has(id), salvei: s.has(id) });
  return mapa;
}

/** As rifas (ids) que alguém republicou ou salvou, da mais recente para a mais antiga. */
export async function idsDaLista(buyerId: string, acao: "republicacao" | "salvo", limite = 60) {
  const t = TABELA[acao].tabela;
  const linhas = await db
    .select({ id: t.campaignId })
    .from(t)
    .innerJoin(campaigns, eq(campaigns.id, t.campaignId))
    .where(and(eq(t.buyerId, buyerId), sql`${campaigns.status} <> 'draft'`))
    .orderBy(desc(t.createdAt))
    .limit(limite);
  return linhas.map((l) => l.id);
}

export async function buyerPorApelido(apelido: string) {
  const [b] = await db
    .select({ id: buyers.id })
    .from(buyers)
    .where(and(eq(buyers.apelido, apelido.toLowerCase()), isNull(buyers.excluidoEm)));
  if (!b) throw new PublicacaoError("Perfil não encontrado.", 404);
  return b.id;
}

/**
 * A legenda da organização embaixo da publicação. Muda a qualquer hora
 * (não é termo da rifa, como o prêmio), pela régua do comentário, e passa
 * pela varredura do Pix por fora. O recorte é da rota
 * (`assertCampaignInScope`).
 */
export async function salvarLegenda(campaignId: string, organizationId: string, bruto: unknown) {
  const problema = problemaNaLegenda(bruto);
  if (problema) throw new PublicacaoError(problema, 422);
  const texto = limparLegenda(typeof bruto === "string" ? bruto : "");
  await db.update(campaigns).set({ legenda: texto || null }).where(eq(campaigns.id, campaignId));
  if (texto) {
    emSegundoPlano(
      varrerTextoDoOrganizador({ organizationId, campaignId, onde: "legenda da publicação", texto }),
      "varredura",
    );
  }
  return { legenda: texto || null };
}
