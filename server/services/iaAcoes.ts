/**
 * O que cada ação do assistente faz no sistema. Regras e catálogo em
 * `shared/iaAcoes.ts`; a conversa (pedir, confirmar, devolver o resultado ao
 * Chatbase) em `services/ia.ts`.
 *
 * - **O recorte é o da sessão** (`orgOf(req)` para o painel, o cadastro do
 *   afiliado para ele): a rifa e o pedido do vizinho "não existem", como nas
 *   rotas. Quem confirma uma ação passa de novo pelo recorte com a sessão dele.
 * - **Gravar passa pelos mesmos serviços das rotas** (`publishCampaign`,
 *   `salvarLegenda`, `excluirRifa`, `executarEstorno`) — não existe um segundo
 *   caminho com regras diferentes — e entra em `audit_log` com `viaIA: true`.
 * - **Nada de dado pessoal no resultado**: nome, telefone e CPF de comprador
 *   nem são consultados aqui.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { Request } from "express";
import { db } from "../db";
import { affiliates, auditLog, campaigns, chamados } from "@shared/schema";
import { NOME_DA_SITUACAO, SITUACOES_DA_RIFA, type EntradaDaAcao, type QuemUsa } from "@shared/iaAcoes";
import type { TitularDaIA } from "@shared/ia";
import { problemaNaLegenda, limparLegenda } from "@shared/publicacao";
import { formatBRL } from "@shared/format";
import { orgOf } from "./orgs";
import { CampaignRuleError, excluirRifa, publishBlockers, publishCampaign } from "./campaigns";
import { salvarLegenda } from "./publicacao";
import { executarEstorno } from "./chamados";
import { getPlataforma } from "./settings";
import { avisarRifaNova, emSegundoPlano } from "./push";
import { estadoFiscal } from "./fiscal";
import { MENSAGEM_SAQUE_SO_COM_CNPJ } from "@shared/fiscal";

/** Recusa que volta para a IA (e para a pessoa) como texto, sem derrubar a conversa. */
export class AcaoRecusada extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcaoRecusada";
  }
}

export function quemUsa(t: TitularDaIA): QuemUsa {
  return t.tipo;
}

const linhas = <T>(r: { rows: unknown[] }) => r.rows as T[];
/** `timestamp` sem fuso lido por SQL cru volta como texto e é UTC: converta assim. */
const iso = (v: unknown) =>
  v instanceof Date ? v.toISOString() : v ? new Date(`${String(v).replace(" ", "T")}Z`).toISOString() : null;

/** A rifa pelo endereço, dentro do recorte. A do vizinho "não existe". */
async function rifaNoRecorte(req: Request, slug: string) {
  const org = orgOf(req);
  const [c] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.slug, slug), org ? eq(campaigns.organizationId, org) : undefined));
  if (!c) throw new AcaoRecusada(`Não achei a rifa "${slug}" no seu painel. Use listar_rifas para ver os endereços.`);
  return c;
}

const filtroDaOrg = (req: Request, coluna: string) => {
  const org = orgOf(req);
  return org ? sql`AND ${sql.raw(coluna)} = ${org}::uuid` : sql``;
};

/* ---------------- leituras (na hora) ---------------- */

/** As ações do painel usam `orgOf(req)`, que para o afiliado não é recorte: ele nunca chega aqui. */
function soDoPainel(titular: TitularDaIA) {
  if (titular.tipo === "afiliado") throw new AcaoRecusada("Esta ação é do painel da organização.");
}

export async function executarLeitura(req: Request, titular: TitularDaIA, e: EntradaDaAcao): Promise<unknown> {
  if (e.nome !== "minhas_comissoes" && e.nome !== "falta_para_sacar") soDoPainel(titular);
  switch (e.nome) {
    case "listar_rifas": {
      const situacao = e.situacao ? sql`AND c.status = ${SITUACOES_DA_RIFA[e.situacao]}` : sql``;
      const r = await db.execute(sql`
        SELECT c.title, c.slug, c.status, c.total_quotas, c.price_cents, c.draw_at,
               COALESCE(s.sold_count, 0) AS vendidas, o.name AS organizacao
        FROM campaigns c
        JOIN organizations o ON o.id = c.organization_id
        LEFT JOIN campaign_stats s ON s.campaign_id = c.id
        WHERE TRUE ${filtroDaOrg(req, "c.organization_id")} ${situacao}
        ORDER BY c.created_at DESC
        LIMIT 20
      `);
      const plataforma = orgOf(req) === null;
      return linhas<Record<string, unknown>>(r).map((x) => ({
        titulo: x.title,
        slug: x.slug,
        situacao: NOME_DA_SITUACAO[x.status as string] ?? x.status,
        cotasVendidas: Number(x.vendidas),
        totalDeCotas: Number(x.total_quotas),
        precoDaCota: formatBRL(Number(x.price_cents)),
        sorteioEm: iso(x.draw_at),
        ...(plataforma ? { organizacao: x.organizacao } : {}),
      }));
    }
    case "resumo_de_vendas": {
      // O dia é o de São Paulo: meia-noite do primeiro dia, convertida uma vez para
      // UTC sem fuso (o que `paid_at` guarda); a coluna fica crua.
      const inicio = sql`(((date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - (${e.dias - 1} || ' days')::interval) AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')`;
      const r = await db.execute(sql`
        SELECT COALESCE(SUM(o.amount_cents), 0) AS receita, COUNT(*) AS pedidos, COALESCE(SUM(o.quantity), 0) AS cotas
        FROM orders o JOIN campaigns c ON c.id = o.campaign_id
        WHERE o.status = 'paid' AND o.paid_at >= ${inicio} ${filtroDaOrg(req, "c.organization_id")}
      `);
      const est = await db.execute(sql`
        SELECT COUNT(*) AS n, COALESCE(SUM(ch.devolver_cents), 0) AS devolvido
        FROM chamados ch
        WHERE ch.status = 'estornado' AND ch.estornado_em >= ${inicio} ${filtroDaOrg(req, "ch.organization_id")}
      `);
      const v = linhas<Record<string, unknown>>(r)[0] ?? {};
      const s = linhas<Record<string, unknown>>(est)[0] ?? {};
      return {
        dias: e.dias,
        receitaPaga: formatBRL(Number(v.receita ?? 0)),
        pedidosPagos: Number(v.pedidos ?? 0),
        cotasVendidas: Number(v.cotas ?? 0),
        estornos: Number(s.n ?? 0),
        devolvidoEmEstornos: formatBRL(Number(s.devolvido ?? 0)),
      };
    }
    case "consultar_pedido": {
      const r = await db.execute(sql`
        SELECT o.status, o.quantity, o.amount_cents, o.created_at, o.paid_at, o.seller_id, o.affiliate_id, o.method,
               c.title, c.slug
        FROM orders o JOIN campaigns c ON c.id = o.campaign_id
        WHERE o.code = ${e.codigo} ${filtroDaOrg(req, "c.organization_id")}
        LIMIT 1
      `);
      const p = linhas<Record<string, unknown>>(r)[0];
      if (!p) throw new AcaoRecusada("Não achei esse pedido no seu painel.");
      const situacao: Record<string, string> = { pending: "aguardando o Pix", paid: "pago", expired: "vencido", refunded: "estornado" };
      return {
        codigo: String(e.codigo),
        situacao: situacao[p.status as string] ?? p.status,
        rifa: p.title,
        slug: p.slug,
        cotas: Number(p.quantity),
        valor: formatBRL(Number(p.amount_cents)),
        canal: p.seller_id ? "cambista" : p.affiliate_id ? "afiliado" : "site",
        criadoEm: iso(p.created_at),
        pagoEm: iso(p.paid_at),
      };
    }
    case "pendencias": {
      const r = await db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM chamados ch WHERE ch.status = 'aberto' ${filtroDaOrg(req, "ch.organization_id")}) AS abertos,
          (SELECT COUNT(*) FROM chamados ch WHERE ch.status = 'aprovado' ${filtroDaOrg(req, "ch.organization_id")}) AS aprovados,
          (SELECT COUNT(*) FROM campaigns c WHERE c.status = 'draft' ${filtroDaOrg(req, "c.organization_id")}) AS rascunhos,
          (SELECT COUNT(*) FROM (
             SELECT 1 FROM orders o JOIN campaigns c ON c.id = o.campaign_id
             WHERE o.status = 'pending' AND o.expires_at > now() ${filtroDaOrg(req, "c.organization_id")}
             LIMIT 1000) x) AS pix
      `);
      const v = linhas<Record<string, unknown>>(r)[0] ?? {};
      return {
        chamadosAbertos: Number(v.abertos ?? 0),
        reembolsosAprovadosEsperandoEstorno: Number(v.aprovados ?? 0),
        rascunhos: Number(v.rascunhos ?? 0),
        pixAguardandoPagamento: Number(v.pix ?? 0),
      };
    }
    case "minhas_comissoes": {
      if (titular.tipo !== "afiliado") throw new AcaoRecusada("Esta ação é do afiliado.");
      const r = await db.execute(sql`
        SELECT status, guardada, COALESCE(SUM(amount_cents), 0) AS total
        FROM commissions WHERE affiliate_id = ${titular.id}::uuid
        GROUP BY status, guardada
      `);
      const soma = (st: string, guardada?: boolean) =>
        linhas<Record<string, unknown>>(r)
          .filter((x) => x.status === st && (guardada === undefined || x.guardada === guardada))
          .reduce((t, x) => t + Number(x.total), 0);
      const v = await db.execute(sql`
        SELECT COUNT(*) AS n FROM orders WHERE affiliate_id = ${titular.id}::uuid AND status = 'paid'
      `);
      return {
        aguardandoLiberacao: formatBRL(soma("pending")),
        disponivelParaSaque: formatBRL(soma("available", false)),
        guardadaPelaPlataforma: formatBRL(soma("available", true)),
        jaPaga: formatBRL(soma("paid")),
        vendasPagasPeloLink: Number(linhas<Record<string, unknown>>(v)[0]?.n ?? 0),
      };
    }
    case "falta_para_publicar": {
      // Só consulta: a mesma régua do botão (publishBlockers), sem publicar.
      const c = await rifaNoRecorte(req, e.rifa);
      if (c.status !== "draft") {
        return { rifa: c.title, slug: c.slug, situacao: NOME_DA_SITUACAO[c.status] ?? c.status, podePublicar: false, falta: ["A rifa já foi publicada."] };
      }
      const falta = await publishBlockers(c.id);
      return { rifa: c.title, slug: c.slug, situacao: "rascunho", podePublicar: falta.length === 0, falta };
    }
    case "falta_para_sacar": {
      if (titular.tipo !== "afiliado") throw new AcaoRecusada("Esta ação é do afiliado.");
      const [a] = await db.select({ pixKey: affiliates.pixKey }).from(affiliates).where(eq(affiliates.id, titular.id));
      const fiscal = await estadoFiscal(titular.id, false);
      // Por quem paga, como o saque: a plataforma (comissão guardada) ou a organização da rifa. Só o nome público.
      const r = await db.execute(sql`
        SELECT CASE WHEN cm.guardada THEN 'Plataforma' ELSE o.name END AS quem,
               cm.status, COALESCE(SUM(cm.amount_cents), 0) AS total
        FROM commissions cm
        JOIN campaigns c ON c.id = cm.campaign_id
        JOIN organizations o ON o.id = c.organization_id
        WHERE cm.affiliate_id = ${titular.id}::uuid AND cm.status IN ('pending', 'available')
        GROUP BY 1, 2
      `);
      const pedidos = await db.execute(sql`
        SELECT COUNT(*) AS n FROM payouts WHERE affiliate_id = ${titular.id}::uuid AND status = 'requested'
      `);
      const grupos = linhas<Record<string, unknown>>(r);
      const porQuem = [...new Set(grupos.map((g) => String(g.quem)))].map((quem) => {
        const soma = (st: string) => grupos.filter((g) => g.quem === quem && g.status === st).reduce((t, g) => t + Number(g.total), 0);
        return { quemPaga: quem, liberado: formatBRL(soma("available")), aguardandoSorteio: formatBRL(soma("pending")) };
      });
      const temLiberado = grupos.some((g) => g.status === "available" && Number(g.total) > 0);
      const falta: string[] = [];
      if (!a?.pixKey) falta.push("Cadastrar a chave Pix (Meus dados).");
      if (fiscal.status !== "aprovado" || !fiscal.temCnpj) {
        falta.push(MENSAGEM_SAQUE_SO_COM_CNPJ);
        for (const f of fiscal.falta) falta.push(`No cadastro fiscal, falta ${f}.`);
        if (fiscal.status === "em_analise") falta.push("O cadastro fiscal está em análise pela plataforma.");
        if (fiscal.status === "recusado") falta.push("O cadastro fiscal foi recusado: veja o motivo em Meus dados e envie de novo.");
      }
      if (!temLiberado) falta.push("Não há comissão liberada agora: a comissão é liberada depois do sorteio e da janela de estorno.");
      return {
        podeSacar: falta.length === 0,
        falta,
        cadastroFiscal: fiscal.status,
        comCnpj: fiscal.temCnpj,
        porQuemPaga: porQuem,
        saquesPedidosEsperandoPagamento: Number(linhas<Record<string, unknown>>(pedidos)[0]?.n ?? 0),
        lembrete: "Cada saque vai com a nota fiscal do valor, emitida contra quem paga (a organização ou, com a comissão guardada, a plataforma).",
      };
    }
    default:
      throw new AcaoRecusada("Esta ação grava e precisa de confirmação.");
  }
}

/* ---------------- gravações (com confirmação) ---------------- */

/** A ação pronta para a pessoa confirmar: o alvo resolvido no recorte e o resumo com os dados de verdade. */
export interface Preparada {
  alvoId: string;
  resumo: string;
}

/**
 * Antes de pedir a confirmação: o alvo existe no recorte, e o que dá para
 * saber agora que vai falhar falha já (rifa já publicada, autorização
 * faltando, chamado não aprovado) — não faz sentido pedir confirmação do
 * impossível. As regras de verdade rodam de novo na execução.
 */
export async function prepararGravacao(req: Request, titular: TitularDaIA, e: EntradaDaAcao): Promise<Preparada> {
  soDoPainel(titular);
  switch (e.nome) {
    case "publicar_rifa": {
      const c = await rifaNoRecorte(req, e.rifa);
      if (c.status !== "draft") throw new AcaoRecusada(`A rifa "${c.title}" já foi publicada.`);
      const faltando = await publishBlockers(c.id);
      if (faltando.length) throw new AcaoRecusada(`A rifa "${c.title}" ainda não pode ser publicada: ${faltando.join(" ")}`);
      return {
        alvoId: c.id,
        resumo: `Publicar a rifa "${c.title}": ${c.totalQuotas.toLocaleString("pt-BR")} cotas a ${formatBRL(c.priceCents)}. Depois de publicar, o total de cotas, o preço, o prêmio e a autorização não mudam mais.`,
      };
    }
    case "atualizar_legenda": {
      const c = await rifaNoRecorte(req, e.rifa);
      const problema = problemaNaLegenda(e.legenda);
      if (problema) throw new AcaoRecusada(problema);
      const nova = limparLegenda(e.legenda);
      return {
        alvoId: c.id,
        resumo: nova ? `Trocar a legenda da rifa "${c.title}" para:\n${nova}` : `Apagar a legenda da rifa "${c.title}".`,
      };
    }
    case "excluir_rifa": {
      const c = await rifaNoRecorte(req, e.rifa);
      return {
        alvoId: c.id,
        resumo: `Apagar de vez a rifa "${c.title}" (${NOME_DA_SITUACAO[c.status]?.replace("_", " ") ?? c.status}). Não dá para desfazer; rifa com venda não se apaga.`,
      };
    }
    case "estornar_chamado": {
      const org = orgOf(req);
      const [ch] = await db
        .select()
        .from(chamados)
        .where(and(eq(chamados.protocolo, e.protocolo), org ? eq(chamados.organizationId, org) : undefined))
        .orderBy(desc(chamados.createdAt))
        .limit(1);
      if (!ch) throw new AcaoRecusada("Não achei esse chamado no seu painel.");
      if (ch.status !== "aprovado") {
        throw new AcaoRecusada(ch.status === "estornado" ? "Este reembolso já foi feito." : "Só chamado aprovado pode ser estornado.");
      }
      if (!(await getPlataforma()).estornoManual) throw new AcaoRecusada("O estorno está desligado nas configurações da plataforma.");
      const [ctx] = await db
        .select({ titulo: campaigns.title, code: sql<number>`(SELECT code FROM orders WHERE id = ${ch.orderId})` })
        .from(campaigns)
        .where(sql`${campaigns.id} = (SELECT campaign_id FROM orders WHERE id = ${ch.orderId})`);
      const valor = ch.devolverCents === null ? "o valor pago" : formatBRL(ch.devolverCents);
      return {
        alvoId: ch.id,
        resumo: `Estornar o chamado ${ch.protocolo}: devolver ${valor} do pedido ${ctx?.code ?? ""} (rifa "${ctx?.titulo ?? ""}"). O dinheiro volta a quem pagou e as cotas voltam ao estoque se a rifa ainda não foi sorteada.`,
      };
    }
    default:
      throw new AcaoRecusada("Esta ação não grava.");
  }
}

async function auditar(req: Request, acaoId: string, action: string, entity: string, entityId: string, diff: Record<string, unknown>) {
  await db.insert(auditLog).values({
    actorId: req.user?.id,
    actorRole: req.user?.role,
    action,
    entity,
    entityId,
    diff: { ...diff, viaIA: true, acaoIA: acaoId } as never,
    ip: req.ip,
  });
}

/**
 * Executa a gravação confirmada, com a sessão de quem confirmou. O alvo
 * passa de novo pelo recorte; as regras são as dos serviços de sempre. Erro de
 * regra vira `AcaoRecusada` (texto para a pessoa e para a IA).
 */
export async function executarGravacao(req: Request, titular: TitularDaIA, acaoId: string, e: EntradaDaAcao, alvoId: string): Promise<unknown> {
  soDoPainel(titular);
  const org = orgOf(req);
  const rifaDoAlvo = async () => {
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, alvoId));
    if (!c || (org && c.organizationId !== org)) throw new AcaoRecusada("A rifa não está mais no seu painel.");
    return c;
  };
  try {
    switch (e.nome) {
      case "publicar_rifa": {
        await rifaDoAlvo();
        const p = await publishCampaign(alvoId);
        await auditar(req, acaoId, "campaign.publish", "campaign", p.id, { totalQuotas: p.totalQuotas, seedHash: p.drawSeedHash, contratoPromotoraId: p.contratoPromotoraId, contratoAnexoIds: p.contratoAnexoIds });
        emSegundoPlano(avisarRifaNova(p.id), "rifa nova");
        return { publicada: true, slug: p.slug, titulo: p.title };
      }
      case "atualizar_legenda": {
        const c = await rifaDoAlvo();
        const salva = await salvarLegenda(c.id, c.organizationId, e.legenda);
        await auditar(req, acaoId, "campaign.legenda", "campaign", c.id, salva);
        return { legendaSalva: true, slug: c.slug };
      }
      case "excluir_rifa": {
        const c = await rifaDoAlvo();
        // A auditoria vai antes, como na rota: depois a linha não existe mais.
        await auditar(req, acaoId, "campaign.excluir", "campaign", c.id, { title: c.title, slug: c.slug, status: c.status, demonstracao: c.demonstracao });
        await excluirRifa(c.id);
        return { apagada: true, titulo: c.title };
      }
      case "estornar_chamado": {
        const { chamado, refund, devolverCents, taxaCents } = await executarEstorno(req, alvoId);
        await auditar(req, acaoId, "chamado.estornado", "chamado", chamado.id, {
          protocolo: chamado.protocolo,
          forma: chamado.formaDevolucao,
          devolverCents,
          taxaCents,
          liberadas: refund?.liberadas.length ?? 0,
          comissaoJaPagaCents: refund?.comissaoJaPagaCents ?? 0,
        });
        return {
          estornado: true,
          protocolo: chamado.protocolo,
          devolvido: formatBRL(devolverCents),
          forma: chamado.formaDevolucao === "manual" ? "à mão (venda do cambista)" : "pelo provedor do Pix",
          cotasLiberadas: refund?.liberadas.length ?? 0,
        };
      }
      default:
        throw new AcaoRecusada("Esta ação não grava.");
    }
  } catch (err) {
    if (err instanceof AcaoRecusada) throw err;
    // Erro de regra dos serviços (422/409/404) vira texto; o resto é falha de verdade.
    const status = (err as { status?: number })?.status;
    if (err instanceof CampaignRuleError || (typeof status === "number" && status < 500)) {
      throw new AcaoRecusada((err as Error).message);
    }
    throw err;
  }
}
