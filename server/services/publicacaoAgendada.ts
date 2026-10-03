/**
 * Publicação agendada da rifa. A organização (ou a plataforma) marca a hora
 * no rascunho; na hora, o relógio chama a **mesma** `publishCampaign()` da
 * publicação feita à mão — confere tudo de novo (autorização SPA/MF,
 * telefone aprovado, mídia, data e sorteio oficial) e trava ali o total, a
 * autorização e a semente (invariantes 7 e 9). Não existe segundo caminho de
 * publicação.
 *
 * - Agendar é só no rascunho e no recorte (o do vizinho é 404, na rota).
 * - O relógio **toma** a agenda num `UPDATE` condicional (rascunho e a mesma
 *   hora lida): duas réplicas, uma publicação. Tomou e falhou (regra ou erro
 *   do banco), a agenda sai e o motivo fica (`publicacao_agendada_falha`):
 *   nada fica tentando sem fim nem segura as outras da fila.
 * - Na hora, confere também a organização ativa e a 1 hora antes do sorteio
 *   (a data pode ter mudado depois de agendar).
 * - A auditoria tem o sistema como ator e quem agendou no `diff`.
 */
import { and, asc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "../db";
import { auditLog, campaigns, organizations } from "@shared/schema";
import { RIFA_AGENDA_MAX_DIAS, instanteAgendado, problemaNaAgendaDaRifa } from "@shared/agenda";
import { CampaignRuleError, publishBlockers, publishCampaign } from "./campaigns";
import { avisarRifaNova, emSegundoPlano } from "./push";

/** Quantas rifas o relógio publica por volta (o resto fica para a seguinte). */
const POR_VOLTA = 20;

/**
 * Agenda (ou tira a agenda de) a publicação de um rascunho. `null` ou vazio
 * tira. Devolve a hora e o que hoje ainda impediria a publicação — a tela
 * mostra, para a organização resolver antes da hora.
 */
export async function agendarPublicacao(campaignId: string, bruta: unknown, quem: string | null) {
  let publicarEm: Date | null;
  try {
    publicarEm = instanteAgendado(bruta, RIFA_AGENDA_MAX_DIAS);
  } catch (e) {
    throw new CampaignRuleError((e as Error).message);
  }
  const [c] = await db.select({ status: campaigns.status, drawAt: campaigns.drawAt }).from(campaigns).where(eq(campaigns.id, campaignId));
  if (!c) throw new CampaignRuleError("Campanha não encontrada.");
  if (c.status !== "draft") throw new CampaignRuleError("Só o rascunho tem publicação agendada.");
  if (publicarEm) {
    const p = problemaNaAgendaDaRifa(publicarEm, c.drawAt);
    if (p) throw new CampaignRuleError(p);
  }
  const [r] = await db
    .update(campaigns)
    .set({ publicarEm, publicarAgendadoPor: publicarEm ? quem : null, publicacaoAgendadaFalha: null })
    // Condicional: a rifa publicada no meio do caminho não ganha agenda.
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "draft")))
    .returning({ publicarEm: campaigns.publicarEm });
  if (!r) throw new CampaignRuleError("Só o rascunho tem publicação agendada.");
  return { publicarEm: r.publicarEm, pendencias: publicarEm ? await publishBlockers(campaignId) : [] };
}

/**
 * O que o relógio confere além de `publishCampaign()`: a organização suspensa
 * não entra no painel para publicar à mão, então o relógio também não publica
 * por ela (a plataforma ainda publica, pela rota); e a data do sorteio pode ter
 * mudado depois de agendar — a rifa vai ao ar pelo menos 1 hora antes dele.
 */
async function conferirNaHora(campaignId: string, organizationId: string | null) {
  if (organizationId) {
    const [o] = await db.select({ active: organizations.active }).from(organizations).where(eq(organizations.id, organizationId));
    if (!o?.active) throw new CampaignRuleError("A organização está suspensa.");
  }
  const [c] = await db.select({ drawAt: campaigns.drawAt }).from(campaigns).where(eq(campaigns.id, campaignId));
  const p = c ? problemaNaAgendaDaRifa(new Date(), c.drawAt) : null;
  if (p) throw new CampaignRuleError(p);
}

/** Relógio: publica os rascunhos cuja hora chegou. */
export async function publicarAgendadas(agora = new Date()) {
  const vencidas = await db
    .select({ id: campaigns.id, publicarEm: campaigns.publicarEm })
    .from(campaigns)
    .where(and(eq(campaigns.status, "draft"), isNotNull(campaigns.publicarEm), lte(campaigns.publicarEm, agora)))
    .orderBy(asc(campaigns.publicarEm))
    .limit(POR_VOLTA);
  let publicadas = 0;
  let falharam = 0;
  for (const v of vencidas) {
    // Toma a agenda: só quem a tirou publica (a outra réplica não acha a linha).
    const [tomada] = await db
      .update(campaigns)
      .set({ publicarEm: null })
      .where(and(eq(campaigns.id, v.id), eq(campaigns.status, "draft"), eq(campaigns.publicarEm, v.publicarEm!)))
      .returning({ por: campaigns.publicarAgendadoPor, organizationId: campaigns.organizationId });
    if (!tomada) continue;
    try {
      await conferirNaHora(v.id, tomada.organizationId);
      const p = await publishCampaign(v.id);
      publicadas++;
      // Depois da transação da publicação, como na rota: falhar aqui não desfaz a rifa no ar nem o aviso.
      await db
        .insert(auditLog)
        .values({
          actorId: null,
          actorRole: "sistema",
          action: "campaign.publish",
          entity: "campaign",
          entityId: p.id,
          diff: { agendada: true, agendadoPor: tomada.por ?? null, publicarEm: v.publicarEm, totalQuotas: p.totalQuotas, seedHash: p.drawSeedHash },
        })
        .catch((e) => console.error("[publicação agendada] auditoria da rifa", p.id, e));
      // Quem segue com o sino fica sabendo, como na publicação à mão.
      emSegundoPlano(avisarRifaNova(p.id), "rifa nova");
    } catch (err) {
      // Faltou algo (autorização, telefone, mídia, data) ou o banco falhou: não
      // publica, e o motivo fica para a tela. Nunca volta para a fila sozinha —
      // um erro que se repete tentaria a cada minuto e seguraria as outras.
      const regra = err instanceof CampaignRuleError;
      if (!regra) console.error("[publicação agendada] rifa", v.id, err);
      const motivo = regra ? (err as Error).message : "Erro do sistema ao publicar. Agende de novo ou publique à mão.";
      // Só no rascunho que segue sem agenda nova: se a organização marcou outra
      // hora no meio, ou alguém publicou à mão, não há falha a registrar.
      const [marcada] = await db
        .update(campaigns)
        .set({ publicacaoAgendadaFalha: motivo })
        .where(and(eq(campaigns.id, v.id), eq(campaigns.status, "draft"), isNull(campaigns.publicarEm)))
        .returning({ id: campaigns.id });
      if (marcada) {
        await db
          .insert(auditLog)
          .values({
            actorId: null,
            actorRole: "sistema",
            action: "campaign.publish.agendada.falhou",
            entity: "campaign",
            entityId: v.id,
            diff: { agendadoPor: tomada.por ?? null, publicarEm: v.publicarEm, motivo },
          })
          .catch((e) => console.error("[publicação agendada] auditoria da falha", v.id, e));
        falharam++;
      }
    }
  }
  return { publicadas, falharam };
}
