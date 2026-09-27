/**
 * Rifas patrocinadas por clique (etapa 15). As regras puras estão em
 * `shared/patrocinio.ts`.
 *
 * Dinheiro que anda aqui:
 * - a **recarga** (Pix para a conta da plataforma, sem split) credita o
 *   saldo pelo livro (`patrocinio_lancamentos`, chave única — o webhook
 *   repetido não credita duas vezes);
 * - a **compra do anúncio** debita o saldo de uma vez (pacote de cliques);
 * - o **clique** gasta um clique do pacote num `UPDATE` condicional
 *   (usados < comprados) — o anúncio nunca gasta mais do que comprou;
 * - o que não pôde ser gasto (cancelado antes do 1º clique, rifa que saiu
 *   do ar) volta ao saldo, proporcional, pelo mesmo livro.
 *
 * A fila não é gravada: é calculada. Em cada segmento, os anúncios ativos
 * com clique sobrando, por ordem de chegada; os primeiros `vagas` estão no
 * ar. Quando um gasta o último clique, o próximo passa a estar no ar na
 * consulta seguinte — ninguém precisa apertar botão.
 */
import { randomInt, randomUUID } from "node:crypto";
import type { Request } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  organizations,
  patrocinioAnuncios,
  patrocinioCliques,
  patrocinioLancamentos,
  patrocinioRecargas,
  users,
} from "@shared/schema";
import {
  ALCANCES,
  JANELA_DA_VENDA_DIAS,
  JANELA_DO_CLIQUE_HORAS,
  ehRobo,
  gastoAte,
  indicadores,
  precoDoPacote,
  previsaoDaFila,
  problemaNaRecarga,
  segmentoDe,
  segmentosDeQuemOlha,
  type Alcance,
  type ConfigPatrocinio,
} from "@shared/patrocinio";
import { EXIGE_CPF, type ProvedorPix } from "@shared/plataforma";
import { UFS } from "@shared/endereco";
import { diaNoFuso, serieDiaria } from "@shared/resultados";
import { activePaymentProvider } from "../payments";
import { isUniqueViolation } from "../pgError";
import { assertCampaignInScope, orgOf } from "./orgs";
import { getPlataforma } from "./settings";

export class PatrocinioError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "PatrocinioError";
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;

const ufValida = (uf: unknown): uf is string => typeof uf === "string" && uf in UFS;
const uuidValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);

async function exigirLigado() {
  const cfg = await getPlataforma();
  if (!cfg.patrocinioLigado) throw new PatrocinioError("As rifas patrocinadas não estão ativas na plataforma.", 409);
  return cfg;
}

/** Credita (ou debita) o saldo pelo livro. Só mexe no saldo se a chave for nova; nunca deixa negativo. */
async function lancar(
  tx: Tx,
  p: { organizationId: string; valorCents: number; motivo: string; chave: string; descricao?: string; userId?: string | null },
) {
  const [linha] = await tx
    .insert(patrocinioLancamentos)
    .values({
      organizationId: p.organizationId,
      valorCents: p.valorCents,
      motivo: p.motivo,
      chave: p.chave,
      descricao: p.descricao ?? null,
      userId: p.userId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: patrocinioLancamentos.id });
  if (!linha) return false;
  const [ok] = await tx
    .update(organizations)
    .set({ patrocinioSaldoCents: sql`${organizations.patrocinioSaldoCents} + ${p.valorCents}` })
    .where(and(eq(organizations.id, p.organizationId), sql`${organizations.patrocinioSaldoCents} + ${p.valorCents} >= 0`))
    .returning({ id: organizations.id });
  if (!ok) throw new PatrocinioError("Saldo insuficiente. Faça uma recarga.", 409);
  return true;
}

/** Soma nos números do dia (por anúncio e estado de quem olhou). */
async function somarNoDia(
  ex: Executor,
  a: { anuncioId: string; organizationId: string },
  uf: string | null,
  n: { exibicoes?: number; cliques?: number; barrados?: number; gastoCents?: number },
) {
  const dia = diaNoFuso(new Date());
  const u = uf && ufValida(uf) ? uf : "";
  await ex.execute(sql`
    insert into patrocinio_diario (anuncio_id, organization_id, dia, uf, exibicoes, cliques, barrados, gasto_cents)
    values (${a.anuncioId}::uuid, ${a.organizationId}::uuid, ${dia}, ${u},
            ${n.exibicoes ?? 0}, ${n.cliques ?? 0}, ${n.barrados ?? 0}, ${n.gastoCents ?? 0})
    on conflict (anuncio_id, dia, uf) do update set
      exibicoes = patrocinio_diario.exibicoes + excluded.exibicoes,
      cliques = patrocinio_diario.cliques + excluded.cliques,
      barrados = patrocinio_diario.barrados + excluded.barrados,
      gasto_cents = patrocinio_diario.gasto_cents + excluded.gasto_cents`);
}

/* ------------------------------------------------------------------ *
 * A fila (calculada)
 * ------------------------------------------------------------------ */

interface LinhaDaFila {
  id: string;
  organization_id: string;
  organizacao: string;
  campaign_id: string;
  titulo: string;
  alcance: Alcance;
  segmento: string;
  cliques_comprados: number;
  cliques_usados: number;
  valor_pago_cents: number;
  fila_desde: string;
  posicao: number;
  vagas: number;
}

/**
 * Os anúncios que disputam vaga: ativos, com clique sobrando, rifa no ar e
 * promotora não arquivada — numerados por ordem de chegada em cada segmento.
 */
async function fila(cfg: ConfigPatrocinio, filtro?: { segmentos?: string[]; organizationId?: string }) {
  const r = await db.execute(sql`
    select * from (
      select a.id, a.organization_id, o.name as organizacao, a.campaign_id, c.title as titulo, a.alcance, a.segmento,
             a.cliques_comprados, a.cliques_usados, a.valor_pago_cents, a.fila_desde,
             row_number() over (partition by a.segmento order by a.fila_desde, a.id)::int as posicao,
             (case a.alcance when 'cidade' then ${cfg.vagas.cidade} when 'estado' then ${cfg.vagas.estado} else ${cfg.vagas.nacional} end)::int as vagas
        from patrocinio_anuncios a
        join campaigns c on c.id = a.campaign_id and c.status = 'published'
        join organizations o on o.id = a.organization_id and o.archived_at is null
       where a.status = 'ativo' and a.cliques_usados < a.cliques_comprados
    ) f
    where true
      ${filtro?.segmentos ? sql`and f.segmento in (${sql.join(filtro.segmentos.map((s) => sql`${s}`), sql`, `)})` : sql``}
    order by f.segmento, f.posicao`);
  const linhas = r.rows as unknown as LinhaDaFila[];
  return filtro?.organizationId ? { todas: linhas, daOrg: linhas.filter((l) => l.organization_id === filtro.organizationId) } : { todas: linhas, daOrg: linhas };
}

/** Cliques por hora em cada segmento (últimas 24 h): é o ritmo da previsão. */
async function ritmoPorSegmento() {
  const r = await db.execute(sql`
    select a.segmento, count(*)::int as n
      from patrocinio_cliques k join patrocinio_anuncios a on a.id = k.anuncio_id
     where k.created_at > now() - interval '24 hours'
     group by a.segmento`);
  return new Map((r.rows as { segmento: string; n: number }[]).map((x) => [x.segmento, Number(x.n) / 24]));
}

/** Cada anúncio com a situação dele: no ar, ou na fila com a previsão de entrada. */
function situacoes(linhas: LinhaDaFila[], ritmo: Map<string, number>) {
  const porSegmento = new Map<string, LinhaDaFila[]>();
  for (const l of linhas) porSegmento.set(l.segmento, [...(porSegmento.get(l.segmento) ?? []), l]);
  const saida = new Map<string, { noAr: boolean; posicaoNaFila: number | null; entraEmCliques: number | null; entraEmHoras: number | null }>();
  for (const [seg, ls] of porSegmento) {
    const vagas = ls[0].vagas;
    const noAr = ls.filter((l) => l.posicao <= vagas);
    const esperando = ls.filter((l) => l.posicao > vagas);
    const prev = previsaoDaFila(
      noAr.map((l) => l.cliques_comprados - l.cliques_usados),
      esperando.map((l) => l.cliques_comprados - l.cliques_usados),
      vagas,
    );
    const porHora = ritmo.get(seg) ?? 0;
    for (const l of noAr) saida.set(l.id, { noAr: true, posicaoNaFila: null, entraEmCliques: null, entraEmHoras: null });
    esperando.forEach((l, i) =>
      saida.set(l.id, {
        noAr: false,
        posicaoNaFila: i + 1,
        entraEmCliques: Number.isFinite(prev[i]) ? prev[i] : null,
        entraEmHoras: Number.isFinite(prev[i]) && porHora > 0 ? Math.round((10 * prev[i]) / porHora) / 10 : null,
      }),
    );
  }
  return saida;
}

/* ------------------------------------------------------------------ *
 * Compra e cancelamento do anúncio (organizador)
 * ------------------------------------------------------------------ */

export async function comprarAnuncio(
  req: Request,
  entrada: { campaignId: unknown; alcance: unknown; uf?: unknown; cidade?: unknown; cliques: unknown },
) {
  const cfg = await exigirLigado();
  const campanha = await assertCampaignInScope(req, String(entrada.campaignId ?? ""));
  if (campanha.status !== "published") throw new PatrocinioError("Só rifa no ar pode ser patrocinada.", 409);
  const alcance = String(entrada.alcance) as Alcance;
  if (!(alcance in ALCANCES)) throw new PatrocinioError("Escolha cidade, estado ou Brasil inteiro.");
  const uf = alcance === "nacional" ? null : String(entrada.uf ?? "").toUpperCase();
  if (uf !== null && !ufValida(uf)) throw new PatrocinioError("Escolha o estado do anúncio.");
  const cidade = alcance === "cidade" ? String(entrada.cidade ?? "").replace(/\s+/g, " ").trim().slice(0, 80) : null;
  let segmento: string;
  let preco: ReturnType<typeof precoDoPacote>;
  try {
    segmento = segmentoDe(alcance, uf, cidade);
    preco = precoDoPacote(cfg.patrocinio, alcance, Number(entrada.cliques));
  } catch (e) {
    throw new PatrocinioError((e as Error).message);
  }
  const id = randomUUID();
  const cliques = Number(entrada.cliques);
  return db.transaction(async (tx) => {
    // Paga primeiro: sem saldo, a transação cai inteira e nada entra na fila.
    await lancar(tx, {
      organizationId: campanha.organizationId,
      valorCents: -preco.totalCents,
      motivo: "anuncio",
      chave: `anuncio:${id}`,
      descricao: `Anúncio: ${cliques} cliques (${ALCANCES[alcance]}${cidade ? ` — ${cidade}/${uf}` : uf ? ` — ${uf}` : ""})`,
      userId: req.user!.id,
    });
    const [a] = await tx
      .insert(patrocinioAnuncios)
      .values({
        id,
        organizationId: campanha.organizationId,
        campaignId: campanha.id,
        alcance,
        uf,
        cidade,
        segmento,
        cliquesComprados: cliques,
        precoCliqueCents: preco.precoCliqueCents,
        descontoPct: preco.descontoPct,
        valorPagoCents: preco.totalCents,
      })
      .returning();
    return a;
  });
}

/**
 * Cancelar só antes do primeiro clique (e o valor volta inteiro). Depois
 * disso o anúncio fica até gastar os cliques: é o combinado da vaga.
 */
export async function cancelarAnuncio(req: Request, id: string) {
  const [a] = uuidValido(id) ? await db.select().from(patrocinioAnuncios).where(eq(patrocinioAnuncios.id, id)) : [];
  const org = orgOf(req);
  if (!a || (org && a.organizationId !== org)) throw new PatrocinioError("Anúncio não encontrado.", 404);
  return db.transaction(async (tx) => {
    const [feito] = await tx
      .update(patrocinioAnuncios)
      .set({ status: "cancelado", encerradoEm: new Date(), reembolsoCents: a.valorPagoCents })
      .where(and(eq(patrocinioAnuncios.id, id), eq(patrocinioAnuncios.status, "ativo"), eq(patrocinioAnuncios.cliquesUsados, 0)))
      .returning();
    if (!feito) throw new PatrocinioError("Este anúncio já começou: ele fica até gastar os cliques comprados.", 409);
    await lancar(tx, {
      organizationId: a.organizationId,
      valorCents: a.valorPagoCents,
      motivo: "reembolso",
      chave: `reembolso-anuncio:${id}`,
      descricao: "Anúncio cancelado antes do primeiro clique",
      userId: req.user!.id,
    });
    return feito;
  });
}

/**
 * Relógio: anúncio ativo de rifa que saiu do ar (sorteada, encerrada) ou de
 * promotora arquivada é encerrado, e o que não foi gasto volta ao saldo.
 * Condicional em `status = 'ativo'`: duas réplicas, um reembolso.
 */
export async function encerrarAnunciosForaDoAr() {
  const r = await db.execute(sql`
    select a.id from patrocinio_anuncios a
      join campaigns c on c.id = a.campaign_id
      join organizations o on o.id = a.organization_id
     where a.status = 'ativo' and (c.status <> 'published' or o.archived_at is not null)`);
  let n = 0;
  for (const { id } of r.rows as { id: string }[]) {
    await db.transaction(async (tx) => {
      const [a] = await tx.select().from(patrocinioAnuncios).where(and(eq(patrocinioAnuncios.id, id), eq(patrocinioAnuncios.status, "ativo"))).for("update");
      if (!a) return;
      const volta = a.valorPagoCents - gastoAte(a.valorPagoCents, a.cliquesComprados, a.cliquesUsados);
      await tx
        .update(patrocinioAnuncios)
        .set({ status: "encerrado", encerradoEm: new Date(), reembolsoCents: volta })
        .where(eq(patrocinioAnuncios.id, id));
      if (volta > 0) {
        await lancar(tx, {
          organizationId: a.organizationId,
          valorCents: volta,
          motivo: "reembolso",
          chave: `reembolso-anuncio:${id}`,
          descricao: `Cliques não usados: a rifa saiu do ar (${a.cliquesComprados - a.cliquesUsados})`,
        });
      }
      n++;
    });
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * Recarga por Pix e ajuste da plataforma
 * ------------------------------------------------------------------ */

export async function pedirRecarga(req: Request, valorCents: number) {
  const cfg = await exigirLigado();
  const orgId = orgOf(req);
  if (!orgId) throw new PatrocinioError("A plataforma lança crédito pelo ajuste, não por recarga.", 400);
  const problema = problemaNaRecarga(valorCents, cfg.patrocinio.recargaMinimaCents);
  if (problema) throw new PatrocinioError(problema);

  const [org] = await db.select({ nome: organizations.name, cnpj: organizations.cnpj }).from(organizations).where(eq(organizations.id, orgId));
  const provider = await activePaymentProvider();
  const documento = (org?.cnpj ?? "").replace(/\D/g, "");
  if (EXIGE_CPF[provider.name as ProvedorPix] && documento.length !== 14 && documento.length !== 11) {
    throw new PatrocinioError("Cadastre o CNPJ da organização para gerar o Pix da recarga.", 400);
  }
  const [u] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, req.user!.id));
  const expiresAt = new Date(Date.now() + 30 * 60_000);

  // Faixa própria (9 dígitos): não colide com os códigos de pedido (8 dígitos).
  for (let i = 0; i < 5; i++) {
    const codigo = randomInt(900_000_000, 1_000_000_000);
    let recarga;
    try {
      [recarga] = await db.insert(patrocinioRecargas).values({ organizationId: orgId, codigo, valorCents, expiresAt }).returning();
    } catch (err) {
      if (isUniqueViolation(err, "uq_patrocinio_recarga_codigo")) continue;
      throw err;
    }
    // Chamada externa fora de transação; sem split: o dinheiro é da plataforma.
    const charge = await provider.createPixCharge({
      orderCode: codigo,
      amountCents: valorCents,
      description: `Recarga de rifas patrocinadas — ${org?.nome ?? "organização"}`,
      payer: { name: org?.nome ?? "Organização", phone: u?.phone ?? "", cpf: documento || undefined },
      expiresAt,
    });
    const [comPix] = await db
      .update(patrocinioRecargas)
      .set({ provider: charge.provider, chargeId: charge.chargeId, pixQr: charge.qr, pixCopyPaste: charge.copyPaste })
      .where(eq(patrocinioRecargas.id, recarga.id))
      .returning();
    return comPix;
  }
  throw new PatrocinioError("Não foi possível gerar a recarga. Tente de novo.", 500);
}

/**
 * Webhook "pago": se a cobrança é de uma recarga, credita (uma vez só) e
 * devolve `true` — o webhook não procura pedido. Recarga já paga também é
 * `true`: é o mesmo evento chegando de novo.
 */
export async function confirmarRecarga(chargeId: string): Promise<boolean> {
  const [r] = await db.select().from(patrocinioRecargas).where(eq(patrocinioRecargas.chargeId, chargeId));
  if (!r) return false;
  await db.transaction(async (tx) => {
    const [paga] = await tx
      .update(patrocinioRecargas)
      .set({ status: "paga", pagaEm: new Date() })
      .where(and(eq(patrocinioRecargas.id, r.id), eq(patrocinioRecargas.status, "pendente")))
      .returning();
    if (!paga) return;
    await lancar(tx, {
      organizationId: r.organizationId,
      valorCents: r.valorCents,
      motivo: "recarga",
      chave: `recarga:${r.id}`,
      descricao: `Recarga por Pix (${r.codigo})`,
    });
  });
  return true;
}

/** Crédito ou débito lançado pela plataforma (só ela; auditado na rota). */
export async function ajustarSaldo(req: Request, organizationId: string, valorCents: number, descricao: string) {
  if (orgOf(req)) throw new PatrocinioError("Ajuste de saldo é da plataforma.", 403);
  if (!Number.isInteger(valorCents) || valorCents === 0 || Math.abs(valorCents) > 1_000_000) {
    throw new PatrocinioError("Informe o valor do ajuste em centavos (até R$ 10.000,00).");
  }
  const motivo = descricao?.trim() ?? "";
  if (motivo.length < 5) throw new PatrocinioError("Diga o motivo do ajuste.");
  if (!uuidValido(organizationId)) throw new PatrocinioError("Organização não encontrada.", 404);
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId));
  if (!org) throw new PatrocinioError("Organização não encontrada.", 404);
  await db.transaction((tx) =>
    lancar(tx, { organizationId, valorCents, motivo: "ajuste", chave: `ajuste:${randomUUID()}`, descricao: motivo.slice(0, 200), userId: req.user!.id }),
  );
  const [s] = await db.select({ saldo: organizations.patrocinioSaldoCents }).from(organizations).where(eq(organizations.id, organizationId));
  return { saldoCents: s.saldo };
}

/* ------------------------------------------------------------------ *
 * Vitrine: o que aparece, exibição, clique e venda atribuída
 * ------------------------------------------------------------------ */

/** As patrocinadas para quem olha: as que estão no ar na cidade, no estado e no Brasil, nessa ordem. */
export async function patrocinadasNoAr(uf?: unknown, cidade?: unknown) {
  const cfg = await getPlataforma();
  if (!cfg.patrocinioLigado) return [];
  const u = ufValida(String(uf ?? "").toUpperCase()) ? String(uf).toUpperCase() : null;
  const segs = segmentosDeQuemOlha(u, typeof cidade === "string" ? cidade.slice(0, 80) : null);
  const { todas } = await fila(cfg.patrocinio, { segmentos: segs.map((s) => s.segmento) });
  const ordem = new Map(segs.map((s, i) => [s.segmento, i]));
  const vistas = new Set<string>();
  return todas
    .filter((l) => l.posicao <= l.vagas)
    .sort((a, b) => (ordem.get(a.segmento)! - ordem.get(b.segmento)!) || a.posicao - b.posicao)
    .filter((l) => (vistas.has(l.campaign_id) ? false : (vistas.add(l.campaign_id), true)))
    .map((l) => ({ id: l.id, campaignId: l.campaign_id, alcance: l.alcance }));
}

/** Exibição do bloco (estatística do patrocinador). Só conta anúncio ativo. */
export async function registrarExibicoes(ids: unknown, uf: unknown) {
  if (!(await getPlataforma()).patrocinioLigado || !Array.isArray(ids)) return 0;
  const validos = [...new Set(ids.filter(uuidValido))].slice(0, 15);
  if (!validos.length) return 0;
  const anuncios = await db
    .select({ id: patrocinioAnuncios.id, organizationId: patrocinioAnuncios.organizationId })
    .from(patrocinioAnuncios)
    .where(and(sql`${patrocinioAnuncios.id} in (${sql.join(validos.map((v) => sql`${v}::uuid`), sql`, `)})`, eq(patrocinioAnuncios.status, "ativo")));
  for (const a of anuncios) await somarNoDia(db, { anuncioId: a.id, organizationId: a.organizationId }, String(uf ?? ""), { exibicoes: 1 });
  return anuncios.length;
}

/**
 * Clique no anúncio. Cobra (um clique do pacote) só se: o programa está
 * ligado, não é robô, há aparelho identificado, este visitante não clicou
 * neste anúncio nas últimas 24 h e ainda há clique no pacote. Clique
 * recusado entra em "barrados" — o patrocinador vê que não pagou por ele.
 */
export async function registrarClique(anuncioId: string, visitanteHash: string | null, userAgent: string | undefined, uf: unknown) {
  const cfg = await getPlataforma();
  if (!cfg.patrocinioLigado || !uuidValido(anuncioId)) return false;
  const [a] = await db
    .select({ id: patrocinioAnuncios.id, organizationId: patrocinioAnuncios.organizationId, campaignId: patrocinioAnuncios.campaignId })
    .from(patrocinioAnuncios)
    .where(eq(patrocinioAnuncios.id, anuncioId));
  if (!a) return false;
  const chave = { anuncioId: a.id, organizationId: a.organizationId };
  const ufDeQuem = typeof uf === "string" ? uf.toUpperCase() : null;
  if (!visitanteHash || ehRobo(userAgent)) {
    await somarNoDia(db, chave, ufDeQuem, { barrados: 1 });
    return false;
  }
  const cobrou = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(811402, hashtext(${anuncioId} || ${visitanteHash}))`);
    const recente = await tx.execute(sql`
      select 1 from patrocinio_cliques
       where anuncio_id = ${anuncioId}::uuid and visitante_hash = ${visitanteHash}
         and created_at > now() - make_interval(hours => ${JANELA_DO_CLIQUE_HORAS})
       limit 1`);
    if (recente.rows.length) return false;
    const [g] = await tx
      .update(patrocinioAnuncios)
      .set({
        cliquesUsados: sql`${patrocinioAnuncios.cliquesUsados} + 1`,
        iniciadoEm: sql`coalesce(${patrocinioAnuncios.iniciadoEm}, now())`,
      })
      .where(
        and(
          eq(patrocinioAnuncios.id, anuncioId),
          eq(patrocinioAnuncios.status, "ativo"),
          sql`${patrocinioAnuncios.cliquesUsados} < ${patrocinioAnuncios.cliquesComprados}`,
          sql`exists (select 1 from campaigns c where c.id = ${patrocinioAnuncios.campaignId} and c.status = 'published')`,
        ),
      )
      .returning({
        usados: patrocinioAnuncios.cliquesUsados,
        comprados: patrocinioAnuncios.cliquesComprados,
        valor: patrocinioAnuncios.valorPagoCents,
      });
    if (!g) return false;
    // O último clique encerra o anúncio: a vaga passa para o próximo da fila.
    if (g.usados >= g.comprados) {
      await tx.update(patrocinioAnuncios).set({ status: "encerrado", encerradoEm: new Date() }).where(eq(patrocinioAnuncios.id, anuncioId));
    }
    const valorCents = gastoAte(g.valor, g.comprados, g.usados) - gastoAte(g.valor, g.comprados, g.usados - 1);
    await tx.insert(patrocinioCliques).values({
      anuncioId,
      organizationId: a.organizationId,
      campaignId: a.campaignId,
      visitanteHash,
      valorCents,
      uf: ufDeQuem && ufValida(ufDeQuem) ? ufDeQuem : null,
    });
    await somarNoDia(tx, chave, ufDeQuem, { cliques: 1, gastoCents: valorCents });
    return true;
  });
  if (!cobrou) await somarNoDia(db, chave, ufDeQuem, { barrados: 1 });
  return cobrou;
}

/**
 * Venda atribuída: o mesmo aparelho clicou num anúncio desta rifa até 7
 * dias antes. Vale o último clique. É estatística — não decide dinheiro.
 */
export async function anuncioDaVenda(deviceHash: string | null | undefined, campaignId: string): Promise<string | null> {
  if (!deviceHash) return null;
  const r = await db.execute(sql`
    select anuncio_id from patrocinio_cliques
     where visitante_hash = ${deviceHash} and campaign_id = ${campaignId}::uuid
       and created_at > now() - make_interval(days => ${JANELA_DA_VENDA_DIAS})
     order by created_at desc limit 1`);
  return (r.rows[0] as { anuncio_id: string } | undefined)?.anuncio_id ?? null;
}

/* ------------------------------------------------------------------ *
 * Painéis (a mesma rota, dois recortes)
 * ------------------------------------------------------------------ */

async function numeros(orgId: string | null, dias: number) {
  const desde = diaNoFuso(new Date(Date.now() - (dias - 1) * 86_400_000));
  const filtroOrg = orgId ? sql`and organization_id = ${orgId}::uuid` : sql``;
  const [tot] = (
    await db.execute(sql`
      select coalesce(sum(exibicoes), 0)::int as exibicoes, coalesce(sum(cliques), 0)::int as cliques,
             coalesce(sum(barrados), 0)::int as barrados, coalesce(sum(gasto_cents), 0)::int as gasto
        from patrocinio_diario where dia >= ${desde} ${filtroOrg}`)
  ).rows as { exibicoes: number; cliques: number; barrados: number; gasto: number }[];
  const filtroVendaOrg = orgId ? sql`and a.organization_id = ${orgId}::uuid` : sql``;
  const [vend] = (
    await db.execute(sql`
      select count(*)::int as pedidos,
             count(*) filter (where o.status = 'paid')::int as vendas,
             coalesce(sum(o.amount_cents) filter (where o.status = 'paid'), 0)::int as receita
        from orders o join patrocinio_anuncios a on a.id = o.anuncio_id
       where o.created_at > now() - make_interval(days => ${dias}) ${filtroVendaOrg}`)
  ).rows as { pedidos: number; vendas: number; receita: number }[];
  const porDia = (
    await db.execute(sql`
      select dia, sum(exibicoes)::int as exibicoes, sum(cliques)::int as cliques, sum(gasto_cents)::int as gasto
        from patrocinio_diario where dia >= ${desde} ${filtroOrg} group by dia`)
  ).rows as { dia: string; exibicoes: number; cliques: number; gasto: number }[];
  const receitaPorDia = (
    await db.execute(sql`
      select to_char((o.paid_at at time zone 'UTC') at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
             sum(o.amount_cents)::int as receita, count(*)::int as vendas
        from orders o join patrocinio_anuncios a on a.id = o.anuncio_id
       where o.status = 'paid' and o.paid_at > now() - make_interval(days => ${dias}) ${filtroVendaOrg}
       group by 1`)
  ).rows as { dia: string; receita: number; vendas: number }[];
  const rec = new Map(receitaPorDia.map((x) => [x.dia, x]));
  const serie = serieDiaria(
    porDia.map((d) => ({
      dia: d.dia,
      exibicoes: Number(d.exibicoes),
      cliques: Number(d.cliques),
      gastoCents: Number(d.gasto),
      receitaCents: Number(rec.get(d.dia)?.receita ?? 0),
      vendas: Number(rec.get(d.dia)?.vendas ?? 0),
    })),
    dias,
    new Date(),
    (dia) => ({ dia, exibicoes: 0, cliques: 0, gastoCents: 0, receitaCents: Number(rec.get(dia)?.receita ?? 0), vendas: Number(rec.get(dia)?.vendas ?? 0) }),
  );
  const porEstado = (
    await db.execute(sql`
      select uf, sum(exibicoes)::int as exibicoes, sum(cliques)::int as cliques, sum(gasto_cents)::int as gasto
        from patrocinio_diario where dia >= ${desde} ${filtroOrg}
       group by uf order by sum(cliques) desc, sum(exibicoes) desc limit 27`)
  ).rows as { uf: string; exibicoes: number; cliques: number; gasto: number }[];
  return {
    totais: {
      ...indicadores({
        exibicoes: Number(tot.exibicoes),
        cliques: Number(tot.cliques),
        gastoCents: Number(tot.gasto),
        pedidos: Number(vend.pedidos),
        vendas: Number(vend.vendas),
        receitaCents: Number(vend.receita),
      }),
      barrados: Number(tot.barrados),
    },
    serie,
    porEstado: porEstado.map((e) => ({ uf: e.uf || null, exibicoes: Number(e.exibicoes), cliques: Number(e.cliques), gastoCents: Number(e.gasto) })),
  };
}

export async function painelDoPatrocinio(req: Request, diasBrutos?: unknown) {
  const cfg = await getPlataforma();
  const org = orgOf(req);
  const dias = [7, 30, 90].includes(Number(diasBrutos)) ? Number(diasBrutos) : 30;
  const config = { ligado: cfg.patrocinioLigado, ...cfg.patrocinio };
  const ritmo = await ritmoPorSegmento();
  const { todas, daOrg } = await fila(cfg.patrocinio, org ? { organizationId: org } : undefined);
  const sit = situacoes(todas, ritmo);
  const n = await numeros(org, dias);

  if (!org) {
    // A fila por segmento, para o card da plataforma.
    const segmentos = new Map<string, { segmento: string; alcance: Alcance; vagas: number; cliquesPorHora: number; anuncios: unknown[] }>();
    for (const l of todas) {
      const s = segmentos.get(l.segmento) ?? { segmento: l.segmento, alcance: l.alcance, vagas: l.vagas, cliquesPorHora: Math.round(10 * (ritmo.get(l.segmento) ?? 0)) / 10, anuncios: [] };
      s.anuncios.push({
        id: l.id,
        organizacao: l.organizacao,
        rifa: l.titulo,
        comprados: l.cliques_comprados,
        usados: l.cliques_usados,
        gastoCents: gastoAte(l.valor_pago_cents, l.cliques_comprados, l.cliques_usados),
        ...sit.get(l.id),
      });
      segmentos.set(l.segmento, s);
    }
    const organizacoes = await db
      .select({ id: organizations.id, nome: organizations.name, saldoCents: organizations.patrocinioSaldoCents })
      .from(organizations)
      .where(sql`${organizations.archivedAt} is null`)
      .orderBy(desc(organizations.patrocinioSaldoCents));
    const [vendidos] = (
      await db.execute(sql`
        select coalesce(sum(valor_pago_cents - reembolso_cents), 0)::int as vendido, count(*)::int as anuncios
          from patrocinio_anuncios where created_at > now() - make_interval(days => ${dias}) and status <> 'cancelado'`)
    ).rows as { vendido: number; anuncios: number }[];
    return {
      plataforma: true as const,
      dias,
      config,
      fila: [...segmentos.values()],
      vendidoCents: Number(vendidos.vendido),
      anunciosVendidos: Number(vendidos.anuncios),
      organizacoes,
      ...n,
    };
  }

  const [o] = await db
    .select({ saldo: organizations.patrocinioSaldoCents, uf: organizations.uf, cidade: organizations.cidade })
    .from(organizations)
    .where(eq(organizations.id, org));
  const anuncios = await db
    .select({
      a: patrocinioAnuncios,
      titulo: campaigns.title,
    })
    .from(patrocinioAnuncios)
    .innerJoin(campaigns, eq(campaigns.id, patrocinioAnuncios.campaignId))
    .where(eq(patrocinioAnuncios.organizationId, org))
    .orderBy(desc(patrocinioAnuncios.createdAt))
    .limit(50);
  const porAnuncio = new Map(
    (
      (
        await db.execute(sql`
          select d.anuncio_id, sum(d.exibicoes)::int as exibicoes, sum(d.cliques)::int as cliques, sum(d.barrados)::int as barrados
            from patrocinio_diario d where d.organization_id = ${org}::uuid group by d.anuncio_id`)
      ).rows as { anuncio_id: string; exibicoes: number; cliques: number; barrados: number }[]
    ).map((x) => [x.anuncio_id, x]),
  );
  const vendasPorAnuncio = new Map(
    (
      (
        await db.execute(sql`
          select o.anuncio_id, count(*)::int as vendas, sum(o.amount_cents)::int as receita
            from orders o join patrocinio_anuncios a on a.id = o.anuncio_id
           where a.organization_id = ${org}::uuid and o.status = 'paid' group by o.anuncio_id`)
      ).rows as { anuncio_id: string; vendas: number; receita: number }[]
    ).map((x) => [x.anuncio_id, x]),
  );
  const noFila = new Set(daOrg.map((l) => l.id));
  const rifas = await db
    .select({ id: campaigns.id, titulo: campaigns.title })
    .from(campaigns)
    .where(and(eq(campaigns.organizationId, org), eq(campaigns.status, "published")));
  const extrato = await db
    .select({ valorCents: patrocinioLancamentos.valorCents, motivo: patrocinioLancamentos.motivo, descricao: patrocinioLancamentos.descricao, createdAt: patrocinioLancamentos.createdAt })
    .from(patrocinioLancamentos)
    .where(eq(patrocinioLancamentos.organizationId, org))
    .orderBy(desc(patrocinioLancamentos.createdAt))
    .limit(20);
  const [recargaPendente] = await db
    .select()
    .from(patrocinioRecargas)
    .where(and(eq(patrocinioRecargas.organizationId, org), eq(patrocinioRecargas.status, "pendente"), sql`${patrocinioRecargas.expiresAt} > now()`))
    .orderBy(desc(patrocinioRecargas.createdAt))
    .limit(1);
  return {
    plataforma: false as const,
    dias,
    config,
    saldoCents: o?.saldo ?? 0,
    padrao: { uf: o?.uf ?? null, cidade: o?.cidade ?? null },
    anuncios: anuncios.map(({ a, titulo }) => {
      const s = noFila.has(a.id) ? sit.get(a.id) : null;
      const m = porAnuncio.get(a.id);
      const v = vendasPorAnuncio.get(a.id);
      return {
        id: a.id,
        rifa: titulo,
        alcance: a.alcance as Alcance,
        uf: a.uf,
        cidade: a.cidade,
        comprados: a.cliquesComprados,
        usados: a.cliquesUsados,
        valorPagoCents: a.valorPagoCents,
        descontoPct: a.descontoPct,
        gastoCents: gastoAte(a.valorPagoCents, a.cliquesComprados, a.cliquesUsados),
        reembolsoCents: a.reembolsoCents,
        status: a.status,
        situacao: a.status !== "ativo" ? a.status : s ? (s.noAr ? "no_ar" : "na_fila") : "parado",
        posicaoNaFila: s?.posicaoNaFila ?? null,
        entraEmCliques: s?.entraEmCliques ?? null,
        entraEmHoras: s?.entraEmHoras ?? null,
        exibicoes: Number(m?.exibicoes ?? 0),
        cliques: Number(m?.cliques ?? 0),
        barrados: Number(m?.barrados ?? 0),
        vendas: Number(v?.vendas ?? 0),
        receitaCents: Number(v?.receita ?? 0),
        createdAt: a.createdAt,
      };
    }),
    rifas,
    extrato,
    recargaPendente: recargaPendente ?? null,
    ...n,
  };
}
