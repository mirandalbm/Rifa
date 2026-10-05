/**
 * Regras de campanha. A mais importante: o total de cotas trava na
 * publicação — mudar depois alteraria a chance de quem já comprou.
 */
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import sharp from "sharp";
import {
  campaigns,
  campaignCertificados,
  campaignMedia,
  campaignStats,
  organizacaoFotos,
  organizations,
  prizedQuotas,
  sorteiosOficiais,
  MIN_QUOTAS,
  MAX_QUOTAS,
  MAX_PHOTOS,
  MAX_VIDEO_SECONDS,
  type Campaign,
} from "@shared/schema";
import { termoAtual } from "./afiliados";
import { problemaDoContrato, TRAVA_CONTRATO } from "./contratoPromotora";
import { apagarArquivosDeMidias } from "./media";
import { commitSeed } from "./draw";
import { validarRegulamentoExtra } from "@shared/regulamento";
import {
  CERTIFICADO_MAX_BYTES,
  minimoDoModo,
  modoSemData,
  modoValido,
  problemaNoMinimoVendido,
  problemaNosDadosLegais,
  type ModoDoSorteio,
  tipoDoCertificado,
} from "@shared/campanhaLegal";
import { problemaNoBonusMax } from "@shared/bonus";
import { PROBLEMA_NO_TOTAL, numeracaoZero, problemaNoMetodo, totalDaApuracao, type MetodoDeApuracao } from "@shared/apuracao";
import { getPlataforma } from "./settings";

export class CampaignRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignRuleError";
  }
}

/** Campos congelados depois que a campanha vai ao ar. */
const LOCKED_AFTER_PUBLISH = [
  "totalQuotas",
  "priceCents",
  // Quem comprou comprou aquele prêmio: não muda nem com pedido de análise.
  "prizeTitle",
  "drawSeedHash",
  "slug",
  // Quem comprou comprou aquela autorização e aquela data.
  "authorizationCode",
  // E aquela regra de sorteio: o modo (rifa cheia, a promotora completa…) e o mínimo.
  "modoSorteio",
  "minimoVendidoPct",
  "authorizationFileKey",
  "drawAt",
  // Cota de bônus é cláusula do regulamento aprovado, com a quantidade.
  "aceitaCotaBonus",
  "bonusMaxCotas",
  // E aquele método de apuração (a leitura da Federal, o globo): é o da autorização.
  "metodoApuracao",
] as const;

export function assertEditable(
  campaign: Campaign,
  changes: Record<string, unknown>,
) {
  if (campaign.status === "draft") return;

  for (const field of LOCKED_AFTER_PUBLISH) {
    if (field in changes && changes[field] !== campaign[field]) {
      throw new CampaignRuleError(
        field === "totalQuotas"
          ? "O total de cotas trava ao publicar: mudá-lo agora alteraria a chance de quem já comprou."
          : field === "prizeTitle"
            ? "O prêmio não muda depois de publicar: quem comprou comprou aquele prêmio."
            : `O campo "${field}" não pode mudar depois da publicação.`,
      );
    }
  }
}

export function assertQuotaRange(total: number) {
  if (!Number.isInteger(total) || total < MIN_QUOTAS || total > MAX_QUOTAS) {
    throw new CampaignRuleError(
      `O total de cotas precisa estar entre ${MIN_QUOTAS} e ${MAX_QUOTAS.toLocaleString("pt-BR")}.`,
    );
  }
  // Só potência de 10: a leitura direta da Federal alcança todo número da
  // rifa, e nenhum número lido fica fora dela (resposta 8.3 do advogado).
  if (!totalDaApuracao(total)) throw new CampaignRuleError(PROBLEMA_NO_TOTAL);
}

/** O método de apuração da rifa ainda vale (liberado pela plataforma)? */
function problemaNaApuracao(
  campaign: Pick<Campaign, "metodoApuracao" | "totalQuotas">,
  liberados: readonly MetodoDeApuracao[],
): string | null {
  const metodo = problemaNoMetodo(campaign.metodoApuracao, liberados);
  if (metodo) return `${metodo} (Autorização e sorteio)`;
  if (!totalDaApuracao(campaign.totalQuotas)) return PROBLEMA_NO_TOTAL;
  return null;
}

/** O que impede uma campanha de ir ao ar. */
export async function publishBlockers(campaignId: string): Promise<string[]> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) return ["Campanha não encontrada."];

  const media = await db
    .select()
    .from(campaignMedia)
    .where(eq(campaignMedia.campaignId, campaignId));

  const blockers: string[] = [];
  const ready = media.filter((m) => m.status === "ready");

  // O telefone do organizador é provado pelo código e aprovado pela
  // plataforma antes da primeira rifa — é o contato que responde por ela.
  const [org] = await db
    .select({ aprovado: organizations.telefoneAprovadoEm, banida: organizations.banidaEm })
    .from(organizations)
    .where(eq(organizations.id, campaign.organizationId));
  if (org?.banida) blockers.push("Esta organização foi banida da plataforma.");
  if (!org?.aprovado) {
    blockers.push(
      "Confirme o telefone da organização (Configurações) e espere a aprovação da plataforma antes de publicar.",
    );
  }
  // O contrato da plataforma em vigor tem de estar aceito pela organização:
  // sem a trava, o contrato seria só intenção.
  const contrato = await problemaDoContrato(campaign.organizationId);
  if (contrato) blockers.push(contrato);

  if (!ready.some((m) => m.role === "banner")) {
    blockers.push("Falta o banner da rifa.");
  }
  const photos = ready.filter((m) => m.role === "photo");
  if (photos.length === 0) {
    blockers.push("Envie ao menos 1 foto do prêmio.");
  }
  const videos = ready.filter((m) => m.role === "video");
  if (photos.length + videos.length > MAX_PHOTOS) {
    blockers.push(`O carrossel tem no máximo ${MAX_PHOTOS + 1} peças, contando o banner.`);
  }
  const longVideo = videos.find((v) => (v.durationS ?? 0) > MAX_VIDEO_SECONDS);
  if (longVideo) {
    blockers.push(`Um vídeo passa de ${MAX_VIDEO_SECONDS / 60} minutos.`);
  }
  if (!campaign.authorizationCode) {
    blockers.push(
      "Informe o certificado de autorização da SPA/MF: a autorização é da campanha, não da plataforma.",
    );
  }
  // Rifa marcada para cota de bônus antes desta regra não tem a quantidade:
  // o regulamento sairia sem o número que a autorização aprova.
  // Também confere contra o total de agora: o PATCH do rascunho pode ter
  // diminuído o total depois de salvar a quantidade.
  if (campaign.aceitaCotaBonus) {
    const p = problemaNoBonusMax(true, campaign.bonusMaxCotas, campaign.totalQuotas);
    if (p) blockers.push(`${p} (Autorização e sorteio)`);
  }
  // O método de apuração é o da autorização da promotora, entre os que a
  // plataforma liberou; sem ele (ou com ele desligado), a rifa não publica.
  const apuracao = problemaNaApuracao(campaign, (await getPlataforma()).metodosDeApuracao);
  if (apuracao) blockers.push(apuracao);
  if (campaign.authorizationCode && !campaign.authorizationFileKey) {
    blockers.push("Anexe o arquivo do certificado de autorização (PDF ou imagem).");
  }
  if (modoSemData(campaign.modoSorteio as ModoDoSorteio)) {
    // "Quando completar": a data é marcada sozinha quando a última cota é paga.
  } else if (!campaign.drawAt) {
    blockers.push("Defina a data do sorteio.");
  } else if (campaign.drawAt.getTime() <= Date.now()) {
    blockers.push("A data do sorteio já passou: defina uma data futura.");
  }
  if (campaign.sorteioOficialId) {
    const p = await problemaDoSorteioOficial(db, campaign.sorteioOficialId, campaign.drawAt, false);
    if (p) blockers.push(p);
  }

  return blockers;
}

/** O sorteio oficial em que a rifa está ainda aceita a publicação? */
async function problemaDoSorteioOficial(
  conexao: Pick<typeof db, "select">,
  sorteioId: string,
  drawAt: Date | null,
  travar: boolean,
): Promise<string | null> {
  const consulta = conexao
    .select({ sorteioEm: sorteiosOficiais.sorteioEm, canceladoEm: sorteiosOficiais.canceladoEm, resultadoEm: sorteiosOficiais.resultadoEm })
    .from(sorteiosOficiais)
    .where(eq(sorteiosOficiais.id, sorteioId));
  const [s] = travar ? await consulta.for("share") : await consulta;
  if (!s || s.canceladoEm) return "O sorteio oficial desta rifa foi cancelado: escolha outro no calendário.";
  if (s.resultadoEm) return "O sorteio oficial desta rifa já aconteceu: escolha outro no calendário.";
  if (!drawAt || s.sorteioEm.getTime() !== drawAt.getTime()) {
    return "A data da rifa não é a do sorteio oficial: escolha o sorteio de novo no calendário.";
  }
  return null;
}

/**
 * Publica a campanha. É aqui que a semente do sorteio é comprometida:
 * o hash vai ao ar ANTES da primeira venda, e a semente só depois do sorteio.
 */
export async function publishCampaign(campaignId: string): Promise<Campaign> {
  const blockers = await publishBlockers(campaignId);
  if (blockers.length > 0) {
    throw new CampaignRuleError(blockers.join(" "));
  }

  const liberados = (await getPlataforma()).metodosDeApuracao;
  return db.transaction(async (tx) => {
    // A ordem das travas é sempre sorteio oficial → rifa (a mesma de integrar
    // e de mudar o sorteio): primeiro o sorteio em que a rifa está, depois a
    // própria rifa (`FOR UPDATE`) — integrar ou mudar a data no meio espera,
    // e o que mudou antes desta trava aparece na conferência abaixo.
    const [lida] = await tx.select({ sorteioOficialId: campaigns.sorteioOficialId }).from(campaigns).where(eq(campaigns.id, campaignId));
    if (lida?.sorteioOficialId) {
      await tx.select({ id: sorteiosOficiais.id }).from(sorteiosOficiais).where(eq(sorteiosOficiais.id, lida.sorteioOficialId)).for("share");
    }
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .for("update");

    if (!campaign) throw new CampaignRuleError("Campanha não encontrada.");
    if (campaign.status !== "draft") {
      throw new CampaignRuleError("Esta campanha já foi publicada.");
    }
    if (campaign.sorteioOficialId !== (lida?.sorteioOficialId ?? null)) {
      throw new CampaignRuleError("O sorteio oficial da rifa mudou agora mesmo. Confira o calendário e publique de novo.");
    }
    assertQuotaRange(campaign.totalQuotas);

    // Promotora arquivada não põe rifa no ar. O FOR SHARE segura a linha da
    // organização até o fim da transação: um arquivamento simultâneo espera
    // esta publicação terminar, e uma publicação simultânea espera ele.
    const org = await tx.execute(sql`
      SELECT archived_at FROM organizations
       WHERE id = ${campaign.organizationId}::uuid
       FOR SHARE
    `);
    if ((org.rows[0] as { archived_at: Date | null } | undefined)?.archived_at) {
      throw new CampaignRuleError("A organização desta rifa está arquivada.");
    }

    // O contrato de novo, com a trava compartilhada: uma versão nova saindo
    // agora espera esta publicação, ou esta espera ela e confere a nova.
    await tx.execute(sql`select pg_advisory_xact_lock_shared(${TRAVA_CONTRATO})`);
    const contrato = await problemaDoContrato(campaign.organizationId, tx);
    if (contrato) throw new CampaignRuleError(contrato);

    // O método de novo, agora contra a rifa travada (a promotora pode ter
    // trocado o método no rascunho entre a conferência de fora e esta). Os
    // liberados foram lidos antes da transação: dentro dela, só o `tx`.
    const apuracao = problemaNaApuracao(campaign, liberados);
    if (apuracao) throw new CampaignRuleError(apuracao);

    // Integrada a um sorteio oficial: o sorteio fica travado (`FOR SHARE`) até
    // o fim — a plataforma não muda a data dele nem o cancela no meio — e a
    // data da rifa tem de ser a do concurso.
    if (campaign.sorteioOficialId) {
      const p = await problemaDoSorteioOficial(tx, campaign.sorteioOficialId, campaign.drawAt, true);
      if (p) throw new CampaignRuleError(p);
    }

    const { seed, seedHash } = commitSeed();

    // A semente fica guardada no draw; a campanha publica só o hash.
    await tx.execute(sql`
      INSERT INTO draws (campaign_id, seed, seed_hash)
      VALUES (${campaignId}::uuid, ${seed}, ${seedHash})
    `);

    await tx
      .insert(campaignStats)
      .values({ campaignId })
      .onConflictDoNothing();

    // O termo de afiliado em vigor fica fotografado na rifa e vale até o
    // sorteio. A mesma trava da publicação do termo: uma versão nova saindo
    // agora espera esta publicação (ou esta espera ela) — nunca meio a meio.
    await tx.execute(sql`select pg_advisory_xact_lock(811201, hashtext(${campaign.organizationId}))`);
    const termo = await termoAtual(campaign.organizationId, tx);

    const [updated] = await tx
      .update(campaigns)
      // Publicou (à mão ou pelo relógio): a agenda e a falha anterior saem juntas.
      .set({
        status: "published",
        publishedAt: new Date(),
        drawSeedHash: seedHash,
        termoId: termo?.id ?? null,
        publicarEm: null,
        publicacaoAgendadaFalha: null,
      })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "draft")))
      .returning();
    if (!updated) throw new CampaignRuleError("Esta campanha já foi publicada.");

    return updated;
  });
}

/** Vitrine: campanhas no ar, em destaque primeiro. */
/**
 * As rifas da vitrine. Com `ids` (salvos, republicações), traz também as já
 * encerradas e sorteadas — o que a pessoa guardou continua lá depois do
 * sorteio — mas nunca rascunho nem organização arquivada.
 */
export async function listPublicCampaigns(ids?: string[]) {
  if (ids && ids.length === 0) return [];
  return db
    .select({
      campaign: campaigns,
      stats: campaignStats,
      // O estado da rifa é o da promotora: é o que ordena a vitrine.
      organizacao: {
        nome: organizations.name,
        slug: organizations.slug,
        cidade: organizations.cidade,
        uf: organizations.uf,
        // O feed mostra o perfil no topo de cada cartão.
        fotoEm: organizacaoFotos.updatedAt,
        verificadaEm: organizations.verificadaEm,
      },
    })
    .from(campaigns)
    .leftJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
    .leftJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, campaigns.organizationId))
    // Travada pela plataforma sai da vitrine (a página segue, com o aviso).
    .where(
      ids
        ? and(inArray(campaigns.id, ids), sql`${campaigns.status} <> 'draft'`, isNull(organizations.archivedAt))
        : and(eq(campaigns.status, "published"), isNull(campaigns.travadaEm)),
    )
    .orderBy(
      sql`${campaigns.featured} DESC, ${campaigns.sortWeight} DESC, ${campaigns.publishedAt} DESC`,
    );
}

export async function campaignBySlug(slug: string) {
  const [row] = await db
    .select({ campaign: campaigns, stats: campaignStats })
    .from(campaigns)
    .leftJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
    .where(eq(campaigns.slug, slug));
  if (!row) return null;

  const media = await db
    .select()
    .from(campaignMedia)
    .where(
      // O vídeo só do Reels não entra no carrossel da página da rifa.
      and(eq(campaignMedia.campaignId, row.campaign.id), eq(campaignMedia.status, "ready"), ne(campaignMedia.role, "reels")),
    )
    .orderBy(campaignMedia.role, campaignMedia.position);

  return { ...row, media };
}

/* ------------------------------------------------------------------ *
 * Dados legais: autorização SPA/MF e data do sorteio
 * ------------------------------------------------------------------ */

/** Marca em `authorizationFileKey`: o arquivo está em `campaign_certificados`. */
export const CERTIFICADO_NO_BANCO = "banco";

/** Lê o `data:` URL, confere o conteúdo e devolve o arquivo que vai guardado. */
async function processarCertificado(dataUrl: string): Promise<{ mime: string; bytes: Buffer }> {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl ?? "");
  if (!m) throw new CampaignRuleError("Envie o certificado em PDF, JPG ou PNG.");
  const bruto = Buffer.from(m[2], "base64");
  if (bruto.length > CERTIFICADO_MAX_BYTES) {
    throw new CampaignRuleError("O certificado passa de 5 MB. Envie um arquivo menor.");
  }
  const tipo = tipoDoCertificado(bruto);
  if (tipo === "pdf") return { mime: "application/pdf", bytes: bruto };
  if (tipo === "imagem") {
    // Reprocessa: tira metadados e qualquer coisa escondida no arquivo.
    try {
      // Teto de pixels como nas outras fotos: imagem-bomba não derruba o processo.
      const bytes = await sharp(bruto, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2400, withoutEnlargement: true })
        .jpeg({ quality: 85 }).toBuffer();
      return { mime: "image/jpeg", bytes };
    } catch {
      throw new CampaignRuleError("Não consegui ler essa imagem. Envie o certificado em PDF, JPG ou PNG.");
    }
  }
  throw new CampaignRuleError("O arquivo não é PDF nem imagem. Envie o certificado em PDF, JPG ou PNG.");
}

/**
 * Grava número da autorização, arquivo do certificado e data do sorteio.
 * Só em rascunho: depois de publicar os três travam (`LOCKED_AFTER_PUBLISH`).
 */
export async function salvarDadosLegais(
  campaign: Campaign,
  entrada: {
    authorizationCode?: string | null;
    drawAt?: string | null;
    certificado?: { dataUrl: string; nome?: string } | null;
    regulamentoExtra?: unknown;
    /** Cota de bônus prevista no regulamento (etapa 13). Trava ao publicar. */
    aceitaCotaBonus?: boolean;
    /** Quantas cotas de bônus a autorização prevê. Trava ao publicar. */
    bonusMaxCotas?: unknown;
    /** Mínimo de cotas vendidas (%) para sortear. Trava ao publicar. */
    minimoVendidoPct?: unknown;
    /** Como a rifa chega ao sorteio (`MODOS_DO_SORTEIO`). Trava ao publicar. */
    modoSorteio?: unknown;
    /** O método de apuração da autorização, entre os liberados. Trava ao publicar. */
    metodoApuracao?: unknown;
  },
): Promise<Campaign> {
  if (campaign.status !== "draft") {
    throw new CampaignRuleError(
      "Autorização e data do sorteio travam ao publicar: quem comprou comprou aquela data.",
    );
  }

  // Integrada a um sorteio oficial, a data é a do concurso (o calendário a
  // acerta) e a rifa precisa ter data: tirar do sorteio vem antes.
  if (campaign.sorteioOficialId) {
    const dataPedida = entrada.drawAt === undefined ? undefined : entrada.drawAt ? new Date(entrada.drawAt).getTime() : null;
    if (dataPedida !== undefined && dataPedida !== (campaign.drawAt?.getTime() ?? null)) {
      throw new CampaignRuleError(
        "Esta rifa está num sorteio oficial: a data é a do concurso. Para outra data, tire a rifa do sorteio no calendário.",
      );
    }
    if (entrada.modoSorteio === "quando_completar") {
      throw new CampaignRuleError(
        "Rifa num sorteio oficial tem a data do concurso: para sortear quando completar, tire-a do sorteio no calendário.",
      );
    }
  }

  const codigo =
    entrada.authorizationCode === undefined ? undefined : entrada.authorizationCode?.trim() || null;
  const drawAt =
    entrada.drawAt === undefined ? undefined : entrada.drawAt ? new Date(entrada.drawAt) : null;
  const problema = problemaNosDadosLegais({ authorizationCode: codigo, drawAt }, new Date());
  if (problema) throw new CampaignRuleError(problema);

  if (entrada.minimoVendidoPct !== undefined) {
    const p = problemaNoMinimoVendido(entrada.minimoVendidoPct);
    if (p) throw new CampaignRuleError(p);
  }
  // Aceitar cota de bônus exige a quantidade da autorização; desligar zera.
  const aceitaBonus = entrada.aceitaCotaBonus ?? campaign.aceitaCotaBonus;
  const bonusMax = !aceitaBonus
    ? 0
    : entrada.bonusMaxCotas !== undefined
      ? entrada.bonusMaxCotas
      : campaign.bonusMaxCotas;
  if (entrada.aceitaCotaBonus !== undefined || entrada.bonusMaxCotas !== undefined) {
    const p = problemaNoBonusMax(aceitaBonus, bonusMax, campaign.totalQuotas);
    if (p) throw new CampaignRuleError(p);
  }
  if (entrada.metodoApuracao !== undefined) {
    const p = problemaNoMetodo(entrada.metodoApuracao, (await getPlataforma()).metodosDeApuracao);
    if (p) throw new CampaignRuleError(p);
    // Trocar a numeração (de 1 para a partir de zero) mudaria na tela o
    // número das cotas premiadas já escolhidas: tire-as antes.
    if (numeracaoZero(entrada.metodoApuracao as string) !== numeracaoZero(campaign.metodoApuracao)) {
      const [premiada] = await db.select({ id: prizedQuotas.id }).from(prizedQuotas).where(eq(prizedQuotas.campaignId, campaign.id)).limit(1);
      if (premiada) {
        throw new CampaignRuleError(
          "Este método muda a numeração da rifa (passa a começar em zero): tire as cotas premiadas e cadastre de novo depois de trocar.",
        );
      }
    }
  }
  if (entrada.modoSorteio !== undefined && !modoValido(entrada.modoSorteio)) {
    throw new CampaignRuleError("Modo do sorteio desconhecido.");
  }
  // O modo manda no mínimo e na data: rifa cheia exige 100%, "quando completar"
  // não tem data (é marcada ao completar) e a promotora que completa não tem mínimo.
  const modo = (entrada.modoSorteio ?? campaign.modoSorteio) as ModoDoSorteio;
  const minimoPedido =
    entrada.minimoVendidoPct !== undefined ? (entrada.minimoVendidoPct as number) : campaign.minimoVendidoPct;

  let regulamentoExtra: string | null | undefined;
  if (entrada.regulamentoExtra !== undefined) {
    try {
      regulamentoExtra = validarRegulamentoExtra(entrada.regulamentoExtra);
    } catch (e) {
      throw new CampaignRuleError((e as Error).message);
    }
  }

  const arquivo = entrada.certificado ? await processarCertificado(entrada.certificado.dataUrl) : null;
  const nome = (entrada.certificado?.nome ?? "certificado").replace(/[^\w.\- ]+/g, "_").slice(0, 120);

  return db.transaction(async (tx) => {
    if (arquivo) {
      await tx
        .insert(campaignCertificados)
        .values({ campaignId: campaign.id, mime: arquivo.mime, nome, bytes: arquivo.bytes, tamanho: arquivo.bytes.length })
        .onConflictDoUpdate({
          target: campaignCertificados.campaignId,
          set: { mime: arquivo.mime, nome, bytes: arquivo.bytes, tamanho: arquivo.bytes.length, createdAt: new Date() },
        });
    }
    const mudancas: Partial<Campaign> = {};
    if (codigo !== undefined) mudancas.authorizationCode = codigo;
    if (drawAt !== undefined) mudancas.drawAt = drawAt;
    if (regulamentoExtra !== undefined) mudancas.regulamentoExtra = regulamentoExtra;
    if (entrada.aceitaCotaBonus !== undefined) mudancas.aceitaCotaBonus = entrada.aceitaCotaBonus;
    if (entrada.aceitaCotaBonus !== undefined || entrada.bonusMaxCotas !== undefined) {
      mudancas.bonusMaxCotas = bonusMax as number;
    }
    if (entrada.modoSorteio !== undefined || entrada.minimoVendidoPct !== undefined) {
      mudancas.modoSorteio = modo;
      mudancas.minimoVendidoPct = minimoDoModo(modo, minimoPedido);
    }
    if (entrada.metodoApuracao !== undefined) mudancas.metodoApuracao = entrada.metodoApuracao as string;
    if (modoSemData(modo)) mudancas.drawAt = null;
    if (arquivo) mudancas.authorizationFileKey = CERTIFICADO_NO_BANCO;
    if (Object.keys(mudancas).length === 0) throw new CampaignRuleError("Nada para salvar.");

    // O status entra no WHERE: publicar ao mesmo tempo não deixa a data
    // mudar depois de a campanha ir ao ar.
    // A data e o modo dependem do sorteio oficial lido lá em cima: se a rifa
    // entrou (ou saiu) de um sorteio no meio, nada é gravado.
    const mexeNaData = mudancas.drawAt !== undefined || mudancas.modoSorteio !== undefined;
    const mesmoSorteio = campaign.sorteioOficialId
      ? eq(campaigns.sorteioOficialId, campaign.sorteioOficialId)
      : isNull(campaigns.sorteioOficialId);
    const [atualizada] = await tx
      .update(campaigns)
      .set(mudancas)
      .where(and(eq(campaigns.id, campaign.id), eq(campaigns.status, "draft"), mexeNaData ? mesmoSorteio : undefined))
      .returning();
    if (!atualizada) {
      throw new CampaignRuleError(
        "A rifa mudou enquanto você salvava (publicada, ou integrada a um sorteio oficial). Abra de novo e confira: autorização e data travam ao publicar.",
      );
    }
    return atualizada;
  });
}

/** O arquivo do certificado, para o painel e (depois de publicada) para o público. */
export async function certificadoDa(campaignId: string) {
  const [c] = await db
    .select()
    .from(campaignCertificados)
    .where(eq(campaignCertificados.campaignId, campaignId));
  return c ?? null;
}

/**
 * Tira do ar uma rifa publicada que ninguém comprou: volta a rascunho.
 *
 * Só sem venda — pedido pago ou pendente, ou cota tomada, barra — porque
 * com comprador o caminho é o estorno, não sumir com a rifa. A condição
 * está no próprio UPDATE (nunca consultar e depois gravar). O compromisso
 * do sorteio (semente e hash) é descartado junto: ninguém comprou com ele,
 * e publicar de novo sorteia outra semente.
 */
export async function tirarDoAr(campaignId: string) {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`
      UPDATE campaigns
         SET status = 'draft', published_at = NULL, draw_seed_hash = NULL
       WHERE id = ${campaignId}::uuid
         AND status = 'published'
         AND NOT EXISTS (SELECT 1 FROM orders
                          WHERE campaign_id = ${campaignId}::uuid
                            AND status IN ('paid', 'pending'))
         AND NOT EXISTS (SELECT 1 FROM quota_alloc WHERE campaign_id = ${campaignId}::uuid)
      RETURNING id
    `);
    if (!r.rows.length) {
      const [c] = await tx.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId));
      if (!c) throw new CampaignRuleError("Rifa não encontrada.");
      if (c.status !== "published") throw new CampaignRuleError("Esta rifa não está no ar.");
      throw new CampaignRuleError("Esta rifa já tem compra: não sai do ar sem estornar quem comprou.");
    }
    await tx.execute(sql`DELETE FROM draws WHERE campaign_id = ${campaignId}::uuid AND executed_at IS NULL`);
    return { ok: true };
  });
}

/**
 * Marca (ou desmarca) uma rifa como demonstração — "rifa de teste": fica na
 * vitrine com a marca "Demonstração" e `createOrder` recusa venda.
 *
 * Marcar só vale sem venda (pedido pago ou pendente, ou cota tomada): quem
 * comprou não pode acordar numa rifa "de exemplo". Desmarcar só vale para
 * rifa com autorização SPA/MF — a de demonstração criada sem ela não passa
 * a vender por um clique. As duas condições moram no próprio UPDATE.
 */
export async function marcarDemonstracao(campaignId: string, ligado: boolean) {
  const r = await db.execute(sql`
    UPDATE campaigns
       SET demonstracao = ${ligado}::boolean
     WHERE id = ${campaignId}::uuid
       AND demonstracao <> ${ligado}::boolean
       AND (
         (${ligado}::boolean AND NOT EXISTS (SELECT 1 FROM orders
                                     WHERE campaign_id = ${campaignId}::uuid
                                       AND status IN ('paid', 'pending'))
                    AND NOT EXISTS (SELECT 1 FROM quota_alloc WHERE campaign_id = ${campaignId}::uuid))
         OR (NOT ${ligado}::boolean AND authorization_code IS NOT NULL)
       )
    RETURNING id
  `);
  if (r.rows.length) return { ok: true };
  const [c] = await db
    .select({ demonstracao: campaigns.demonstracao })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!c) throw new CampaignRuleError("Rifa não encontrada.");
  if (c.demonstracao === ligado) {
    throw new CampaignRuleError(ligado ? "Esta rifa já é de teste." : "Esta rifa não é de teste.");
  }
  throw new CampaignRuleError(
    ligado
      ? "Esta rifa já tem compra: não vira teste sem estornar quem comprou."
      : "Rifa de teste sem autorização SPA/MF não passa a vender.",
  );
}

/**
 * Apaga a rifa de vez. Cabe em rifa que nunca vendeu: rascunho, rifa
 * publicada sem nenhuma cota tomada, e rifa de teste (a limpeza antes do
 * lançamento). Com comprador, o caminho é o estorno — nunca o apagar.
 *
 * A rifa é travada (`FOR UPDATE`) antes de conferir: a reserva que estiver
 * gravando cota espera, e a conferência já a enxerga. Dinheiro envolvido
 * (pedido pago ou estornado, cobrança da plataforma, chamado, anúncio)
 * barra sempre — são registros que a contabilidade precisa encontrar.
 * O resto vai pela cascata das chaves.
 */
export async function excluirRifa(campaignId: string) {
  return db.transaction(async (tx) => {
    const trava = await tx.execute(sql`
      SELECT status, demonstracao FROM campaigns WHERE id = ${campaignId}::uuid FOR UPDATE
    `);
    const c = trava.rows[0] as { status: string; demonstracao: boolean } | undefined;
    if (!c) throw new CampaignRuleError("Rifa não encontrada.");
    const r = await tx.execute(sql`
      SELECT
        EXISTS (SELECT 1 FROM orders WHERE campaign_id = ${campaignId}::uuid AND status IN ('paid', 'refunded')) AS vendeu,
        EXISTS (SELECT 1 FROM orders WHERE campaign_id = ${campaignId}::uuid AND status = 'pending') AS reservando,
        EXISTS (SELECT 1 FROM quota_alloc WHERE campaign_id = ${campaignId}::uuid) AS cota,
        EXISTS (SELECT 1 FROM draws WHERE campaign_id = ${campaignId}::uuid AND executed_at IS NOT NULL) AS sorteada,
        EXISTS (SELECT 1 FROM platform_charges pc JOIN orders o ON o.id = pc.order_id
                 WHERE o.campaign_id = ${campaignId}::uuid) AS cobrou,
        EXISTS (SELECT 1 FROM chamados ch JOIN orders o ON o.id = ch.order_id
                 WHERE o.campaign_id = ${campaignId}::uuid) AS chamado,
        EXISTS (SELECT 1 FROM patrocinio_anuncios WHERE campaign_id = ${campaignId}::uuid)
          OR EXISTS (SELECT 1 FROM banner_pedidos WHERE campaign_id = ${campaignId}::uuid) AS anuncio
    `);
    const f = r.rows[0] as Record<"vendeu" | "reservando" | "cota" | "sorteada" | "cobrou" | "chamado" | "anuncio", boolean>;
    if (f.vendeu || f.cobrou) throw new CampaignRuleError("Esta rifa teve venda paga: não pode ser apagada. Com comprador, o caminho é o estorno.");
    if (f.chamado) throw new CampaignRuleError("Esta rifa tem chamado de reembolso: não pode ser apagada.");
    if (f.anuncio) throw new CampaignRuleError("Esta rifa teve anúncio ou banner pago: não pode ser apagada.");
    if (f.sorteada) throw new CampaignRuleError("Esta rifa já foi sorteada: não pode ser apagada.");
    if (!c.demonstracao) {
      if (c.status !== "draft" && c.status !== "published") {
        throw new CampaignRuleError("Só dá para apagar rascunho ou rifa no ar sem nenhuma cota vendida.");
      }
      if (f.reservando || f.cota) {
        throw new CampaignRuleError("Esta rifa tem cota reservada ou comprada: não pode ser apagada.");
      }
    }
    // Indicação presa a pedido que nunca foi pago (sem chave estrangeira).
    await tx.execute(sql`
      DELETE FROM indicacoes WHERE status = 'pendente'
         AND order_id IN (SELECT id FROM orders WHERE campaign_id = ${campaignId}::uuid)
    `);
    // As linhas somem pela cascata; os arquivos não. Guarda o que apagar do armazenamento
    // e só apaga depois que a transação fechou (rollback não pode deixar mídia sem arquivo).
    // `FOR UPDATE`: o pôster que está sendo gravado em segundo plano espera, e o `UPDATE`
    // dele já não acha a mídia — sem isso o arquivo dele ficava órfão.
    const midias = (
      await tx.execute(sql`
        SELECT storage_key AS "storageKey", poster_key AS "posterKey", stream_uid AS "streamUid", variants
          FROM campaign_media WHERE campaign_id = ${campaignId}::uuid FOR UPDATE
      `)
    ).rows as { storageKey: string; posterKey: string | null; streamUid: string | null; variants: Parameters<typeof apagarArquivosDeMidias>[0][number]["variants"] }[];
    await tx.execute(sql`DELETE FROM campaigns WHERE id = ${campaignId}::uuid`);
    return { ok: true, midias };
  }).then(async ({ ok, midias }) => {
    await apagarArquivosDeMidias(midias);
    return { ok };
  });
}
