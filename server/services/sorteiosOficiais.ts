/**
 * Sorteios oficiais da plataforma (regras em shared/sorteiosOficiais.ts).
 *
 * O calendário é da plataforma: só ela cadastra, muda, cancela e lança o
 * resultado oficial. A organização vê o calendário e integra a rifa dela, em
 * rascunho, num concurso — a data da rifa passa a ser a do concurso e trava
 * ao publicar como sempre. Toda escrita trava a linha do sorteio (`FOR
 * UPDATE` na plataforma, `FOR SHARE` na integração): mudar a data de um
 * sorteio e integrar uma rifa nele ao mesmo tempo nunca deixa a rifa com a
 * data velha.
 */
import { numeracaoZero } from "@shared/apuracao";
import { formatQuota } from "@shared/format";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { campaigns, draws, organizacaoFotos, organizations, sorteioAtas, sorteioReextracoes, sorteiosOficiais, type Campaign } from "@shared/schema";
import { SORTEIO_INVALIDO } from "@shared/sorteio";
import sharp from "sharp";
import { tipoDoCertificado } from "@shared/campanhaLegal";
import {
  ATA_MAX_BYTES,
  LOTERIAS,
  ataGuardada,
  validarAtaDoGlobo,
  RIFAS_NA_FILEIRA,
  nomeDoSorteioOficial,
  problemaParaIntegrar,
  problemaParaLancarResultado,
  seloDoSorteioOficial,
  situacaoDoSorteio,
  validarResultado,
  validarSorteioOficial,
  type Loteria,
} from "@shared/sorteiosOficiais";
import { DURACAO_DA_TRANSMISSAO_MS, videoDoSorteioOficial } from "@shared/aoVivo";
import { getPlataforma } from "./settings";
import { isUniqueViolation } from "../pgError";
import { midiasDas, ultimoStorySql, urlDaFoto } from "./perfil";

export class SorteioOficialError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
    this.name = "SorteioOficialError";
  }
}

type Linha = typeof sorteiosOficiais.$inferSelect;

function paraTela(s: Linha) {
  return {
    id: s.id,
    loteria: s.loteria as Loteria,
    loteriaNome: LOTERIAS[s.loteria as Loteria]?.nome ?? s.loteria,
    concurso: s.concurso,
    sorteioEm: s.sorteioEm,
    titulo: s.titulo,
    nome: nomeDoSorteioOficial({ loteria: s.loteria as Loteria, concurso: s.concurso, titulo: s.titulo }),
    transmissaoUrl: s.transmissaoUrl,
    resultado: s.resultado,
    resultadoEm: s.resultadoEm,
    situacao: situacaoDoSorteio(s),
    comentarios: s.comentariosCount,
    // A ata da sessão do globo (nula nas loterias da Caixa).
    ata: ataGuardada(s.ata),
  };
}

/** Quantas rifas publicadas cada sorteio tem — o que trava mudar a data. */
async function publicadasPorSorteio(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const linhas = await db
    .select({ id: campaigns.sorteioOficialId, n: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(and(inArray(campaigns.sorteioOficialId, ids), inArray(campaigns.status, ["published", "drawn"])))
    .groupBy(campaigns.sorteioOficialId);
  return new Map(linhas.map((l) => [l.id as string, Number(l.n)]));
}

/**
 * O calendário do painel. A plataforma vê tudo (os de 60 dias para trás em
 * diante); a organização vê os que ainda aceitam rifa e os que têm rifa dela,
 * com as rifas dela integradas — nunca as do vizinho, nem quantas são.
 */
export async function calendario(org: string | null) {
  const desde = new Date(Date.now() - 60 * 86_400_000);
  const linhas = await db
    .select()
    .from(sorteiosOficiais)
    .where(gt(sorteiosOficiais.sorteioEm, desde))
    .orderBy(asc(sorteiosOficiais.sorteioEm));
  const ids = linhas.map((l) => l.id);
  const minhas = ids.length
    ? await db
        .select({
          id: campaigns.id,
          sorteioOficialId: campaigns.sorteioOficialId,
          title: campaigns.title,
          prizeTitle: campaigns.prizeTitle,
          status: campaigns.status,
          sorteioAutoMotivo: campaigns.sorteioAutoMotivo,
          totalQuotas: campaigns.totalQuotas,
          metodoApuracao: campaigns.metodoApuracao,
          orgNome: organizations.name,
        })
        .from(campaigns)
        .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
        .where(and(inArray(campaigns.sorteioOficialId, ids), org ? eq(campaigns.organizationId, org) : undefined))
    : [];
  const publicadas = org ? new Map<string, number>() : await publicadasPorSorteio(ids);
  const comAta = await sessoesComAta(ids.filter((id) => linhas.find((l) => l.id === id)?.loteria === "globo"));
  // 9.5: as novas extrações do globo de cada rifa (a plataforma vê e registra).
  const rifasDoGlobo = minhas.filter((m) => m.metodoApuracao === "globo").map((m) => m.id);
  const novas = rifasDoGlobo.length
    ? await db
        .select()
        .from(sorteioReextracoes)
        .where(inArray(sorteioReextracoes.campaignId, rifasDoGlobo))
        .orderBy(asc(sorteioReextracoes.ordem))
    : [];
  const agora = new Date();
  return linhas
    .map((s) => {
      const rifas = minhas.filter((m) => m.sorteioOficialId === s.id);
      return {
        ...paraTela(s),
        temArquivoDaAta: comAta.has(s.id),
        // Para a organização: pode integrar agora? (o motivo, se não pode)
        problemaParaIntegrar: problemaParaIntegrar(s, agora),
        rifas: rifas.map((r) => ({
          id: r.id,
          titulo: r.title,
          premio: r.prizeTitle,
          status: r.status,
          // Lançado o resultado, por que esta rifa ainda não sorteou.
          esperando: r.status === "published" ? r.sorteioAutoMotivo : null,
          // 9.5: o número lido no globo não foi distribuído — o globo gira de novo para ela.
          pedeNovaExtracao: Boolean(
            s.loteria === "globo" && s.resultadoEm && r.status === "published" && r.sorteioAutoMotivo?.startsWith(SORTEIO_INVALIDO),
          ),
          novasExtracoes: novas
            .filter((n) => n.campaignId === r.id)
            .map((n) => ({ ordem: n.ordem, bolas: n.bolas, horas: n.horas, numero: formatQuota(n.numero, r.totalQuotas, true) })),
          // A plataforma vê de quem é; a organização só vê as dela.
          organizacao: org ? undefined : r.orgNome,
        })),
        ...(org ? {} : { publicadas: publicadas.get(s.id) ?? 0 }),
      };
    })
    .filter((s) => !org || s.situacao === "agendado" || s.rifas.length > 0);
}

export async function criarSorteioOficial(corpo: unknown, criadoPor: string | undefined) {
  const v = validarSorteioOficial(corpo, new Date());
  if ("problema" in v) throw new SorteioOficialError(v.problema, 400);
  try {
    const [novo] = await db
      .insert(sorteiosOficiais)
      .values({ ...v.dados, criadoPor: criadoPor ?? null })
      .returning();
    return paraTela(novo);
  } catch (e) {
    if (isUniqueViolation(e, "uq_sorteio_oficial_concurso")) {
      throw new SorteioOficialError("Este concurso dessa loteria já está no calendário.", 409);
    }
    throw e;
  }
}

/**
 * Muda o sorteio. Com rifa publicada nele, loteria, concurso e data não
 * mudam (quem comprou comprou aquela data); só o título e a transmissão. As
 * rifas em rascunho integradas acompanham a data nova na mesma transação.
 */
export async function editarSorteioOficial(id: string, corpo: unknown) {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(sorteiosOficiais).where(eq(sorteiosOficiais.id, id)).for("update");
    if (!s) throw new SorteioOficialError("Sorteio oficial não encontrado.", 404);
    if (s.canceladoEm) throw new SorteioOficialError("Este sorteio oficial foi cancelado.", 409);
    if (s.resultadoEm) throw new SorteioOficialError("Este sorteio oficial já tem resultado.", 409);
    const atual = { loteria: s.loteria, concurso: s.concurso, sorteioEm: s.sorteioEm };
    const b = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const dataPedida = b.sorteioEm !== undefined ? new Date(String(b.sorteioEm)) : atual.sorteioEm;
    const v = validarSorteioOficial(
      {
        loteria: b.loteria ?? atual.loteria,
        concurso: b.concurso ?? atual.concurso,
        sorteioEm: b.sorteioEm ?? atual.sorteioEm.toISOString(),
        titulo: b.titulo !== undefined ? b.titulo : s.titulo,
        transmissaoUrl: b.transmissaoUrl !== undefined ? b.transmissaoUrl : s.transmissaoUrl,
      },
      new Date(),
      // A data só é conferida quando muda: depois da hora, título e transmissão ainda mudam.
      dataPedida.getTime() !== atual.sorteioEm.getTime(),
    );
    if ("problema" in v) throw new SorteioOficialError(v.problema, 400);
    // A loteria decide como a rifa é sorteada: com rifa no sorteio — ou pedido
    // de adiamento em análise para ele —, não muda. O concurso também não
    // muda com pedido em análise: a organização pediu aquele concurso. (A
    // data muda: a aprovação confere a data de novo e recusa.)
    if (v.dados.loteria !== atual.loteria || v.dados.concurso !== atual.concurso) {
      const [{ rifas, pedidos }] = (
        await tx.execute(sql`
          SELECT (SELECT count(*)::int FROM campaigns WHERE sorteio_oficial_id = ${id}::uuid) AS rifas,
                 (SELECT count(*)::int FROM campanha_solicitacoes
                   WHERE sorteio_oficial_novo_id = ${id}::uuid AND status = 'em_analise') AS pedidos
        `)
      ).rows as { rifas: number; pedidos: number }[];
      if (v.dados.loteria !== atual.loteria && Number(rifas) > 0) {
        throw new SorteioOficialError("Há rifa neste sorteio: a loteria não muda.", 409);
      }
      if (Number(pedidos) > 0) {
        throw new SorteioOficialError(
          "Há pedido de adiamento em análise para este sorteio: loteria e concurso não mudam até ele ser decidido.",
          409,
        );
      }
    }
    const mudouOConcurso =
      v.dados.loteria !== atual.loteria ||
      v.dados.concurso !== atual.concurso ||
      v.dados.sorteioEm.getTime() !== atual.sorteioEm.getTime();
    if (mudouOConcurso) {
      const [{ n }] = (
        await tx.execute(sql`
          SELECT count(*)::int AS n FROM campaigns
           WHERE sorteio_oficial_id = ${id}::uuid AND status IN ('published', 'drawn')
        `)
      ).rows as { n: number }[];
      if (Number(n) > 0) {
        throw new SorteioOficialError(
          "Há rifa publicada neste sorteio: loteria, concurso e data não mudam (quem comprou comprou aquela data). Só o título e a transmissão.",
          409,
        );
      }
    }
    try {
      const [atualizado] = await tx
        .update(sorteiosOficiais)
        .set(v.dados)
        .where(eq(sorteiosOficiais.id, id))
        .returning();
      // A rifa em rascunho integrada segue a data do concurso.
      await tx
        .update(campaigns)
        .set({ drawAt: v.dados.sorteioEm })
        .where(and(eq(campaigns.sorteioOficialId, id), eq(campaigns.status, "draft"), ne(campaigns.modoSorteio, "quando_completar")));
      return paraTela(atualizado);
    } catch (e) {
      if (isUniqueViolation(e, "uq_sorteio_oficial_concurso")) {
        throw new SorteioOficialError("Este concurso dessa loteria já está no calendário.", 409);
      }
      throw e;
    }
  });
}

/**
 * Cancela o sorteio. Com rifa publicada nele, não cancela (a data é de quem
 * comprou). As rifas em rascunho saem dele na mesma transação e ficam sem
 * data, para a organização escolher outra.
 */
export async function cancelarSorteioOficial(id: string) {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(sorteiosOficiais).where(eq(sorteiosOficiais.id, id)).for("update");
    if (!s) throw new SorteioOficialError("Sorteio oficial não encontrado.", 404);
    if (s.canceladoEm) throw new SorteioOficialError("Este sorteio oficial já foi cancelado.", 409);
    if (s.resultadoEm) throw new SorteioOficialError("Este sorteio oficial já tem resultado.", 409);
    const [{ n }] = (
      await tx.execute(sql`
        SELECT count(*)::int AS n FROM campaigns
         WHERE sorteio_oficial_id = ${id}::uuid AND status IN ('published', 'drawn')
      `)
    ).rows as { n: number }[];
    if (Number(n) > 0) {
      throw new SorteioOficialError("Há rifa publicada neste sorteio: ele não pode ser cancelado.", 409);
    }
    await tx
      .update(campaigns)
      .set({ sorteioOficialId: null, drawAt: null })
      .where(and(eq(campaigns.sorteioOficialId, id), eq(campaigns.status, "draft")));
    const [cancelado] = await tx
      .update(sorteiosOficiais)
      .set({ canceladoEm: new Date() })
      .where(eq(sorteiosOficiais.id, id))
      .returning();
    return paraTela(cancelado);
  });
}

/**
 * Lança o resultado oficial da Caixa, conferido pelo formato da loteria. Só
 * depois da hora do sorteio, uma vez só (`UPDATE` condicional): dois cliques
 * dão um resultado e um 409.
 */
export async function lancarResultado(id: string, numeros: unknown, ataBruta?: unknown) {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(sorteiosOficiais).where(eq(sorteiosOficiais.id, id)).for("update");
    if (!s) throw new SorteioOficialError("Sorteio oficial não encontrado.", 404);
    const problema = problemaParaLancarResultado(s, new Date());
    if (problema) throw new SorteioOficialError(problema, 409);
    const v = validarResultado(s.loteria as Loteria, numeros);
    if ("problema" in v) throw new SorteioOficialError(v.problema, 400);
    // O globo leva a ata junto (8.10): local, tabelionato, auditor ou
    // testemunhas e o relato de cada bola, conferido contra as bolas lançadas.
    let ata: unknown = null;
    if (s.loteria === "globo") {
      const a = validarAtaDoGlobo(ataBruta, v.numeros);
      if ("problema" in a) throw new SorteioOficialError(a.problema, 400);
      ata = a.ata;
    }
    const [feito] = await tx
      .update(sorteiosOficiais)
      .set({ resultado: v.numeros, resultadoEm: new Date(), ata })
      .where(and(eq(sorteiosOficiais.id, id), isNull(sorteiosOficiais.resultadoEm), isNull(sorteiosOficiais.canceladoEm)))
      .returning();
    if (!feito) throw new SorteioOficialError("O resultado deste sorteio já foi lançado.", 409);
    return paraTela(feito);
  });
}

/**
 * Integra a rifa (em rascunho) num sorteio oficial — ou tira (`null`). A data
 * da rifa passa a ser a do concurso no mesmo `UPDATE`, condicional ao
 * rascunho; o sorteio fica travado (`FOR SHARE`) até o fim, então a
 * plataforma não muda a data dele no meio. Depois de publicar, só com a
 * plataforma (pedido de adiamento).
 */
export async function integrarAoSorteioOficial(c: Campaign, sorteioId: string | null) {
  if (c.status !== "draft") {
    throw new SorteioOficialError(
      "Rifa publicada: a data do sorteio travou. Para mudar, peça à plataforma (Editar rifa → adiar).",
      409,
    );
  }
  return db.transaction(async (tx) => {
    if (sorteioId === null) {
      const [r] = await tx
        .update(campaigns)
        .set({ sorteioOficialId: null })
        .where(and(eq(campaigns.id, c.id), eq(campaigns.status, "draft")))
        .returning();
      if (!r) throw new SorteioOficialError("Rifa publicada: a data do sorteio travou.", 409);
      return r;
    }
    const [s] = await tx.select().from(sorteiosOficiais).where(eq(sorteiosOficiais.id, sorteioId)).for("share");
    if (!s) throw new SorteioOficialError("Sorteio oficial não encontrado.", 404);
    const problema = problemaParaIntegrar(s, new Date(), c.metodoApuracao);
    if (problema) throw new SorteioOficialError(problema, 409);
    if (c.modoSorteio === "quando_completar") {
      throw new SorteioOficialError(
        "Esta rifa é antecipada quando completar, para a próxima extração da Federal. Para entrar num sorteio oficial, mude o modo do sorteio em Autorização e sorteio.",
        409,
      );
    }
    const [r] = await tx
      .update(campaigns)
      .set({ sorteioOficialId: sorteioId, drawAt: s.sorteioEm })
      // O modo é conferido no próprio UPDATE: mudado no meio para "quando completar", não integra.
      .where(and(eq(campaigns.id, c.id), eq(campaigns.status, "draft"), ne(campaigns.modoSorteio, "quando_completar")))
      .returning();
    if (!r) {
      throw new SorteioOficialError(
        "A rifa mudou agora mesmo (publicada, ou o modo do sorteio virou \"quando completar\"). Abra de novo e confira.",
        409,
      );
    }
    return r;
  });
}

/** O selo da rifa integrada, para a página e o cartão da vitrine. */
export async function seloDaRifa(sorteioOficialId: string | null) {
  if (!sorteioOficialId) return null;
  const [s] = await db.select().from(sorteiosOficiais).where(eq(sorteiosOficiais.id, sorteioOficialId));
  if (!s || s.canceladoEm) return null;
  return {
    id: s.id,
    loteria: s.loteria as Loteria,
    concurso: s.concurso,
    sorteioEm: s.sorteioEm,
    loteriaNome: LOTERIAS[s.loteria as Loteria]?.nome ?? s.loteria,
    selo: seloDoSorteioOficial({ loteria: s.loteria as Loteria, concurso: s.concurso, sorteioEm: s.sorteioEm }),
  };
}

/**
 * O sorteio da tela do Início do celular: o próximo oficial (até 3 h depois
 * da hora, o tempo da transmissão) e, sem nenhum, o último com resultado.
 * A fileira traz as rifas integradas que a vitrine mostraria — nunca
 * rascunho, demonstração, rifa travada ou promotora arquivada ou banida.
 */
export async function sorteioOficialDaTela() {
  const agora = Date.now();
  const [proximo] = await db
    .select()
    .from(sorteiosOficiais)
    .where(
      and(
        isNull(sorteiosOficiais.canceladoEm),
        isNull(sorteiosOficiais.resultadoEm),
        gt(sorteiosOficiais.sorteioEm, new Date(agora - DURACAO_DA_TRANSMISSAO_MS)),
      ),
    )
    .orderBy(asc(sorteiosOficiais.sorteioEm))
    .limit(1);
  const [ultimo] = proximo
    ? []
    : await db
        .select()
        .from(sorteiosOficiais)
        .where(and(isNull(sorteiosOficiais.canceladoEm), isNotNull(sorteiosOficiais.resultadoEm)))
        .orderBy(desc(sorteiosOficiais.sorteioEm))
        .limit(1);
  const s = proximo ?? ultimo;
  if (!s) return { sorteio: null, proximas: await proximasRifas() };

  const rifas = await db
    .select({
      id: campaigns.id,
      slug: campaigns.slug,
      premio: campaigns.prizeTitle,
      orgSlug: organizations.slug,
      orgNome: organizations.name,
      orgFoto: organizacaoFotos.updatedAt,
      ultimoStory: ultimoStorySql,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .where(
      and(
        eq(campaigns.sorteioOficialId, s.id),
        inArray(campaigns.status, ["published", "drawn"]),
        eq(campaigns.demonstracao, false),
        isNull(campaigns.travadaEm),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    )
    .orderBy(desc(campaigns.featured), desc(campaigns.sortWeight), asc(campaigns.publishedAt))
    .limit(RIFAS_NA_FILEIRA);

  // A capa: o banner, senão a primeira foto — nunca o vídeo.
  const midias = await midiasDas(rifas.map((r) => r.id));
  const capaDe = (id: string) => midias.get(id)?.find((m) => m.role !== "video")?.url ?? null;

  // Rifa sorteada leva o número contemplado (o resultado da rifa é público).
  const sorteadas = rifas.length
    ? await db
        .select({
          campaignId: draws.campaignId,
          numero: sql<number>`coalesce(${draws.winnerNumber}, ${draws.resultNumber})`,
          total: campaigns.totalQuotas,
          metodo: campaigns.metodoApuracao,
        })
        .from(draws)
        .innerJoin(campaigns, eq(campaigns.id, draws.campaignId))
        .where(and(inArray(draws.campaignId, rifas.map((r) => r.id)), isNotNull(draws.executedAt)))
    : [];

  const tela = paraTela(s);
  // Sem link colado no sorteio, a live do canal oficial da loteria (cadastrado uma vez).
  const { canaisDasLoterias } = await getPlataforma();
  return {
    proximas: [],
    sorteio: {
      ...tela,
      // O endereço da transmissão sai só como o vídeo conferido (serviço conhecido) ou link.
      transmissaoUrl: undefined,
      video: videoDoSorteioOficial(s.transmissaoUrl, canaisDasLoterias[tela.loteria]),
      selo: seloDoSorteioOficial({ loteria: tela.loteria, concurso: s.concurso, sorteioEm: s.sorteioEm }),
      rifas: rifas.map((r) => ({
        slug: r.slug,
        premio: r.premio,
        capa: capaDe(r.id),
        organizacao: avatarDaOrganizacao(r),
        // Como a pessoa lê: a rifa com método numera a partir de zero.
        numeroContemplado: (() => {
          const d = sorteadas.find((x) => x.campaignId === r.id);
          return d ? formatQuota(Number(d.numero), d.total, numeracaoZero(d.metodo)) : null;
        })(),
      })),
    },
  };
}

/**
 * A organização como avatar da fileira (o modelo dos stories): nome, foto e
 * o story no ar — o anel abre o story, o meio abre a rifa. Nada além do que
 * o perfil público já mostra.
 */
function avatarDaOrganizacao(r: { orgSlug: string; orgNome: string; orgFoto: Date | null; ultimoStory: Date | null }) {
  return { slug: r.orgSlug, nome: r.orgNome, foto: urlDaFoto(r.orgSlug, r.orgFoto), ultimoStory: r.ultimoStory };
}

/**
 * Sem sorteio oficial no calendário, a tela do sorteio mostra as rifas dos
 * próximos sorteios (a mesma régua da vitrine e da coluna ao vivo: publicada,
 * de verdade, não sorteada, promotora no ar), a mais próxima primeiro — como
 * avatares, sem o detalhe de nenhuma.
 */
async function proximasRifas() {
  const rifas = await db
    .select({
      slug: campaigns.slug,
      premio: campaigns.prizeTitle,
      drawAt: campaigns.drawAt,
      orgSlug: organizations.slug,
      orgNome: organizations.name,
      orgFoto: organizacaoFotos.updatedAt,
      ultimoStory: ultimoStorySql,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .leftJoin(draws, and(eq(draws.campaignId, campaigns.id), isNotNull(draws.executedAt)))
    .where(
      and(
        eq(campaigns.status, "published"),
        eq(campaigns.demonstracao, false),
        isNull(campaigns.travadaEm),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
        isNull(draws.id),
        gt(campaigns.drawAt, new Date(Date.now() - DURACAO_DA_TRANSMISSAO_MS)),
      ),
    )
    .orderBy(asc(campaigns.drawAt))
    .limit(RIFAS_NA_FILEIRA);
  return rifas.map((r) => ({ slug: r.slug, premio: r.premio, organizacao: avatarDaOrganizacao(r) }));
}

/* ------------------------------------------------------------------ *
 * O arquivo da ata notarial do globo (PDF ou foto do cartório)
 * ------------------------------------------------------------------ */

/**
 * Guarda o arquivo da ata da sessão do globo. Só depois do resultado (a ata
 * relata a extração) e só do globo. Conferido pelo conteúdo como o
 * certificado da rifa: PDF vai como veio; foto é reprocessada (sem
 * metadados). Trocar substitui — o tabelião pode mandar a via definitiva.
 */
export async function salvarArquivoDaAta(id: string, dataUrl: unknown, nomeBruto: unknown) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(typeof dataUrl === "string" ? dataUrl : "");
  if (!m) throw new SorteioOficialError("Envie a ata em PDF, JPG ou PNG.", 400);
  const bruto = Buffer.from(m[2], "base64");
  if (bruto.length > ATA_MAX_BYTES) throw new SorteioOficialError("A ata passa de 8 MB. Envie um arquivo menor.", 413);
  const tipo = tipoDoCertificado(bruto);
  let arquivo: { mime: string; bytes: Buffer };
  if (tipo === "pdf") arquivo = { mime: "application/pdf", bytes: bruto };
  else if (tipo === "imagem") {
    try {
      const bytes = await sharp(bruto, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2400, withoutEnlargement: true })
        .jpeg({ quality: 85 }).toBuffer();
      arquivo = { mime: "image/jpeg", bytes };
    } catch {
      throw new SorteioOficialError("Não consegui ler essa imagem. Envie a ata em PDF, JPG ou PNG.", 400);
    }
  } else throw new SorteioOficialError("O arquivo não é PDF nem imagem. Envie a ata em PDF, JPG ou PNG.", 400);
  const nome = (typeof nomeBruto === "string" && nomeBruto ? nomeBruto : "ata").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(sorteiosOficiais).where(eq(sorteiosOficiais.id, id)).for("share");
    if (!s) throw new SorteioOficialError("Sorteio oficial não encontrado.", 404);
    if (s.loteria !== "globo") throw new SorteioOficialError("Só a sessão do globo tem ata notarial.", 409);
    if (!s.resultadoEm) throw new SorteioOficialError("Lance o resultado da sessão antes de anexar a ata.", 409);
    await tx
      .insert(sorteioAtas)
      .values({ sorteioOficialId: id, mime: arquivo.mime, nome, bytes: arquivo.bytes, tamanho: arquivo.bytes.length })
      .onConflictDoUpdate({
        target: sorteioAtas.sorteioOficialId,
        set: { mime: arquivo.mime, nome, bytes: arquivo.bytes, tamanho: arquivo.bytes.length, createdAt: new Date() },
      });
    return { nome, tamanho: arquivo.bytes.length };
  });
}

/** O arquivo da ata, público só com o resultado lançado (a ata é o relato da extração). */
export async function arquivoDaAta(id: string) {
  const [a] = await db
    .select({ mime: sorteioAtas.mime, nome: sorteioAtas.nome, bytes: sorteioAtas.bytes, createdAt: sorteioAtas.createdAt })
    .from(sorteioAtas)
    .innerJoin(sorteiosOficiais, eq(sorteiosOficiais.id, sorteioAtas.sorteioOficialId))
    .where(and(eq(sorteioAtas.sorteioOficialId, id), isNotNull(sorteiosOficiais.resultadoEm), isNull(sorteiosOficiais.canceladoEm)));
  return a ?? null;
}

/** Quais sessões já têm o arquivo da ata (o calendário mostra). */
export async function sessoesComAta(ids: string[]) {
  if (!ids.length) return new Set<string>();
  const linhas = await db.select({ id: sorteioAtas.sorteioOficialId }).from(sorteioAtas).where(inArray(sorteioAtas.sorteioOficialId, ids));
  return new Set(linhas.map((l) => l.id));
}

/** A ata da sessão do globo para a conferência pública: os dados e se o arquivo do cartório já chegou. */
export async function ataDaSessao(id: string) {
  const [s] = await db
    .select({ ata: sorteiosOficiais.ata, resultadoEm: sorteiosOficiais.resultadoEm })
    .from(sorteiosOficiais)
    .where(eq(sorteiosOficiais.id, id));
  if (!s?.resultadoEm) return null;
  return { ata: ataGuardada(s.ata), temArquivo: (await sessoesComAta([id])).has(id) };
}
