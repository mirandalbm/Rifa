/**
 * Exportações — a camada que fala com o banco.
 *
 * A regra que organiza o arquivo inteiro: **nada é montado inteiro na
 * memória.** A exportação de cotas de uma rifa de 1.000.000 tem mais de meio
 * milhão de linhas; juntar isso num array antes de responder derruba o
 * processo, e derruba justamente no dia em que a rifa deu certo.
 *
 * Então cada relatório é um gerador que devolve página por página, por
 * paginação de chave (keyset), e a rota escreve cada página na resposta
 * respeitando a contrapressão do socket. `OFFSET` não serve: com 500 mil
 * linhas o Postgres relê tudo a cada página, e linha nova durante a leitura
 * desloca o resto.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  csvRow,
  csvMoney,
  csvDate,
  type ExportKey,
} from "@shared/exports";
import { maskPhone } from "@shared/format";

/** Linhas por ida ao banco. Grande o bastante para render, pequeno para caber. */
const PAGINA = 1_000;

export class ExportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ExportError";
  }
}

export interface ExportScope {
  campaignId: string | null;
  /**
   * Recorte por organização. **Nulo é a plataforma** — mesma convenção de
   * `services/orgs.ts`. Sem isto, um relatório sem campanha escolhida
   * entregaria a carteira de clientes inteira de todo mundo num CSV.
   */
  organizationId: string | null;
  /** Recorte de data pelo momento do pedido. Ausente = tudo. */
  de: Date | null;
  ate: Date | null;
}

/** Um relatório pronto para escrever: o cabeçalho e as linhas em pedaços. */
export interface ExportStream {
  header: string[];
  /** Valores crus: quem escapa e formata é `csvCell`, uma vez só. */
  linhas: AsyncGenerator<unknown[], void, unknown>;
}

async function rows<T>(query: SQL): Promise<T[]> {
  const r = await db.execute(query);
  return r.rows as T[];
}

/**
 * Recorte de data aplicado a uma coluna.
 *
 * Volta como fragmento para entrar no meio do WHERE de cada relatório: o
 * organizador exporta "o mês passado", não a vida inteira da plataforma.
 */
/** Recorte de organização sobre uma coluna que aponta para `campaigns`. */
function daOrganizacao(coluna: SQL, escopo: ExportScope): SQL {
  return escopo.organizationId
    ? sql`AND ${coluna} = ${escopo.organizationId}::uuid`
    : sql``;
}

function janela(coluna: SQL, escopo: ExportScope): SQL {
  const partes: SQL[] = [];
  if (escopo.de) partes.push(sql`AND ${coluna} >= ${escopo.de}`);
  if (escopo.ate) partes.push(sql`AND ${coluna} < ${escopo.ate}`);
  return partes.length ? sql.join(partes, sql` `) : sql``;
}

const SITUACAO_PEDIDO: Record<string, string> = {
  pending: "aguardando pagamento",
  paid: "pago",
  expired: "expirado",
  refunded: "estornado",
};

const SITUACAO_COMISSAO: Record<string, string> = {
  pending: "em carência",
  available: "disponível",
  paid: "paga",
  cancelled: "cancelada",
};

const METODO: Record<string, string> = {
  pix_online: "Pix",
  dinheiro: "dinheiro",
  cartao_maquininha: "cartão (maquininha)",
  pix_maquininha: "Pix (maquininha)",
};

/* ------------------------------------------------------------------ *
 * Pedidos
 * ------------------------------------------------------------------ */

interface LinhaPedido {
  code: number;
  created_at: string;
  id: string;
  paid_at: string | null;
  campanha: string;
  comprador: string;
  telefone: string;
  cpf: string | null;
  email: string | null;
  quantity: number;
  amount_cents: number;
  discount_cents: number;
  status: string;
  method: string;
  pos_auth_code: string | null;
  afiliado: string | null;
  cambista: string | null;
  cupom: string | null;
}

function pedidos(escopo: ExportScope): ExportStream {
  return {
    header: [
      "Pedido",
      "Data",
      "Pagamento em",
      "Rifa",
      "Comprador",
      "Telefone",
      "CPF",
      "E-mail",
      "Cotas",
      "Valor",
      "Desconto",
      "Situação",
      "Meio",
      "Autorização",
      "Afiliado",
      "Cambista",
      "Cupom",
    ],
    linhas: (async function* () {
      // Chave composta: data e id. Data sozinha empata quando 500 pedidos
      // entram no mesmo segundo — e empate em keyset pula linha.
      let cursor: { createdAt: string; id: string } | null = null;

      for (;;) {
        const depois: SQL = cursor
          ? sql`AND (o.created_at, o.id) > (${cursor.createdAt}::timestamp, ${cursor.id}::uuid)`
          : sql``;

        const page = await rows<LinhaPedido>(sql`
          SELECT o.code, o.created_at, o.id, o.paid_at,
                 c.title AS campanha,
                 b.name AS comprador, b.phone AS telefone, b.cpf, b.email,
                 o.quantity, o.amount_cents, o.discount_cents,
                 o.status::text, o.method::text, o.pos_auth_code,
                 af.code AS afiliado, cb.code AS cambista, cp.code AS cupom
            FROM orders o
            JOIN campaigns c ON c.id = o.campaign_id
            JOIN buyers b ON b.id = o.buyer_id
            LEFT JOIN affiliates af ON af.id = o.affiliate_id
            LEFT JOIN affiliates cb ON cb.id = o.seller_id
            LEFT JOIN coupons cp ON cp.id = o.coupon_id
           WHERE TRUE
             ${escopo.campaignId ? sql`AND o.campaign_id = ${escopo.campaignId}::uuid` : sql``}
             ${daOrganizacao(sql`c.organization_id`, escopo)}
             ${janela(sql`o.created_at`, escopo)}
             ${depois}
           ORDER BY o.created_at, o.id
           LIMIT ${PAGINA}
        `);

        if (page.length === 0) return;

        for (const p of page) {
          yield [
            p.code,
            csvDate(p.created_at),
            csvDate(p.paid_at),
            p.campanha,
            p.comprador,
            p.telefone,
            p.cpf,
            p.email,
            p.quantity,
            csvMoney(p.amount_cents),
            csvMoney(p.discount_cents),
            SITUACAO_PEDIDO[p.status] ?? p.status,
            METODO[p.method] ?? p.method,
            p.pos_auth_code,
            p.afiliado,
            p.cambista,
            p.cupom,
          ];
        }

        if (page.length < PAGINA) return;
        const ultimo = page[page.length - 1];
        cursor = { createdAt: ultimo.created_at, id: ultimo.id };
      }
    })(),
  };
}

/* ------------------------------------------------------------------ *
 * Cotas — o relatório grande
 * ------------------------------------------------------------------ */

interface LinhaCota {
  number: number;
  status: string;
  code: number;
  comprador: string;
  telefone: string;
  created_at: string;
  premio: string | null;
}

function cotas(escopo: ExportScope): ExportStream {
  const campaignId = escopo.campaignId!;

  return {
    header: [
      "Número",
      "Situação",
      "Pedido",
      "Comprador",
      "Telefone",
      "Tomada em",
      "Cota premiada",
    ],
    linhas: (async function* () {
      // Aqui a chave é o próprio número: é único dentro da campanha (é a PK)
      // e já é a ordem que o organizador quer ler.
      let depoisDe = 0;

      for (;;) {
        const page = await rows<LinhaCota>(sql`
          SELECT a.number, a.status::text, a.created_at,
                 o.code, b.name AS comprador, b.phone AS telefone,
                 pq.prize_label AS premio
            FROM quota_alloc a
            -- LEFT, nao INNER: quota_alloc.order_id nao tem chave
            -- estrangeira (a cota e gravada antes de tudo, pela PK, e e ela
            -- que manda). Com INNER, uma cota cujo pedido sumisse
            -- desapareceria do relatorio em silencio -- e relatorio de
            -- conferencia que omite linha calado e pior que relatorio que
            -- falha. Assim o numero aparece como tomado, sem dono.
            LEFT JOIN orders o ON o.id = a.order_id
            LEFT JOIN buyers b ON b.id = o.buyer_id
            LEFT JOIN prized_quotas pq
                   ON pq.campaign_id = a.campaign_id AND pq.number = a.number
           WHERE a.campaign_id = ${campaignId}::uuid
             AND a.number > ${depoisDe}
             ${janela(sql`a.created_at`, escopo)}
           ORDER BY a.number
           LIMIT ${PAGINA}
        `);

        if (page.length === 0) return;

        for (const c of page) {
          yield [
            c.number,
            c.status === "paid" ? "paga" : "reservada",
            c.code,
            c.comprador,
            c.telefone,
            csvDate(c.created_at),
            c.premio,
          ];
        }

        if (page.length < PAGINA) return;
        depoisDe = page[page.length - 1].number;
      }
    })(),
  };
}

/* ------------------------------------------------------------------ *
 * Compradores
 * ------------------------------------------------------------------ */

interface LinhaComprador {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  cpf: string | null;
  email: string | null;
  pedidos_pagos: number;
  cotas: number;
  gasto_cents: number;
  ultima_compra: string | null;
}

function compradores(escopo: ExportScope): ExportStream {
  return {
    header: [
      "Comprador",
      "Telefone",
      "CPF",
      "E-mail",
      "Cadastro",
      "Pedidos pagos",
      "Cotas",
      "Total gasto",
      "Última compra",
    ],
    linhas: (async function* () {
      let cursor: { createdAt: string; id: string } | null = null;

      for (;;) {
        const depois: SQL = cursor
          ? sql`AND (b.created_at, b.id) > (${cursor.createdAt}::timestamp, ${cursor.id}::uuid)`
          : sql``;

        // O agregado é por comprador, então a soma tem que ser subconsulta
        // correlacionada: juntar com pedidos antes de paginar multiplicaria
        // a linha do comprador por pedido e quebraria a chave.
        const page = await rows<LinhaComprador>(sql`
          SELECT b.id, b.created_at, b.name, b.phone, b.cpf, b.email,
                 coalesce(p.pedidos, 0) AS pedidos_pagos,
                 coalesce(p.cotas, 0) AS cotas,
                 coalesce(p.gasto, 0) AS gasto_cents,
                 p.ultima AS ultima_compra
            FROM buyers b
            LEFT JOIN LATERAL (
              SELECT count(*)::int AS pedidos,
                     coalesce(sum(o.quantity), 0)::int AS cotas,
                     coalesce(sum(o.amount_cents), 0)::bigint AS gasto,
                     max(o.paid_at) AS ultima
                FROM orders o
               WHERE o.buyer_id = b.id
                 AND o.status = 'paid'
                 ${escopo.campaignId ? sql`AND o.campaign_id = ${escopo.campaignId}::uuid` : sql``}
                 ${
                   escopo.organizationId
                     ? sql`AND o.campaign_id IN (
                         SELECT id FROM campaigns
                          WHERE organization_id = ${escopo.organizationId}::uuid)`
                     : sql``
                 }
                 ${janela(sql`o.created_at`, escopo)}
            ) p ON TRUE
           -- Comprador sem nenhuma compra desta organização não é cliente
           -- dela: entregá-lo seria vazar a base de quem vende ao lado.
           WHERE ${escopo.organizationId ? sql`coalesce(p.pedidos, 0) > 0` : sql`TRUE`}
             ${depois}
           ORDER BY b.created_at, b.id
           LIMIT ${PAGINA}
        `);

        if (page.length === 0) return;

        for (const c of page) {
          yield [
            c.name,
            c.phone,
            c.cpf,
            c.email,
            csvDate(c.created_at),
            c.pedidos_pagos,
            c.cotas,
            csvMoney(Number(c.gasto_cents)),
            csvDate(c.ultima_compra),
          ];
        }

        if (page.length < PAGINA) return;
        const ultimo = page[page.length - 1];
        cursor = { createdAt: ultimo.created_at, id: ultimo.id };
      }
    })(),
  };
}

/* ------------------------------------------------------------------ *
 * Comissões
 * ------------------------------------------------------------------ */

interface LinhaComissao {
  id: string;
  created_at: string;
  code: number;
  campanha: string;
  afiliado: string;
  nome: string;
  tipo: string;
  pct: number;
  amount_cents: number;
  status: string;
  available_at: string;
  pago_em: string | null;
}

function comissoes(escopo: ExportScope): ExportStream {
  return {
    header: [
      "Criada em",
      "Pedido",
      "Rifa",
      "Código",
      "Nome",
      "Tipo",
      "Percentual",
      "Comissão",
      "Situação",
      "Libera em",
      "Paga em",
    ],
    linhas: (async function* () {
      let cursor: { createdAt: string; id: string } | null = null;

      for (;;) {
        const depois: SQL = cursor
          ? sql`AND (k.created_at, k.id) > (${cursor.createdAt}::timestamp, ${cursor.id}::uuid)`
          : sql``;

        const page = await rows<LinhaComissao>(sql`
          SELECT k.id, k.created_at, k.pct, k.amount_cents, k.status::text,
                 k.available_at,
                 o.code, c.title AS campanha,
                 a.code AS afiliado, a.kind::text AS tipo,
                 u.name AS nome,
                 pay.paid_at AS pago_em
            FROM commissions k
            JOIN orders o ON o.id = k.order_id
            JOIN campaigns c ON c.id = k.campaign_id
            JOIN affiliates a ON a.id = k.affiliate_id
            JOIN users u ON u.id = a.user_id
            LEFT JOIN payouts pay ON pay.id = k.payout_id
           WHERE TRUE
             ${escopo.campaignId ? sql`AND k.campaign_id = ${escopo.campaignId}::uuid` : sql``}
             ${daOrganizacao(sql`c.organization_id`, escopo)}
             ${janela(sql`k.created_at`, escopo)}
             ${depois}
           ORDER BY k.created_at, k.id
           LIMIT ${PAGINA}
        `);

        if (page.length === 0) return;

        for (const k of page) {
          yield [
            csvDate(k.created_at),
            k.code,
            k.campanha,
            k.afiliado,
            k.nome,
            k.tipo === "cambista" ? "cambista" : "afiliado",
            `${k.pct}%`,
            csvMoney(k.amount_cents),
            SITUACAO_COMISSAO[k.status] ?? k.status,
            csvDate(k.available_at),
            csvDate(k.pago_em),
          ];
        }

        if (page.length < PAGINA) return;
        const ultimo = page[page.length - 1];
        cursor = { createdAt: ultimo.created_at, id: ultimo.id };
      }
    })(),
  };
}

/* ------------------------------------------------------------------ *
 * Acertos de cambista
 * ------------------------------------------------------------------ */

interface LinhaAcerto {
  id: string;
  created_at: string;
  cambista: string;
  nome: string;
  gross_cents: number;
  commission_cents: number;
  net_cents: number;
  order_count: number;
  status: string;
  settled_at: string | null;
  notes: string | null;
}

function acertos(escopo: ExportScope): ExportStream {
  return {
    header: [
      "Aberto em",
      "Cambista",
      "Nome",
      "Pedidos",
      "Recolhido",
      "Comissão dele",
      "Deve à casa",
      "Situação",
      "Fechado em",
      "Observação",
    ],
    linhas: (async function* () {
      let cursor: { createdAt: string; id: string } | null = null;

      for (;;) {
        const depois: SQL = cursor
          ? sql`AND (s.created_at, s.id) > (${cursor.createdAt}::timestamp, ${cursor.id}::uuid)`
          : sql``;

        const page = await rows<LinhaAcerto>(sql`
          SELECT s.id, s.created_at, s.gross_cents, s.commission_cents,
                 s.net_cents, s.order_count, s.status::text, s.settled_at,
                 s.notes, a.code AS cambista, u.name AS nome
            FROM settlements s
            JOIN affiliates a ON a.id = s.seller_id
            JOIN users u ON u.id = a.user_id
           WHERE TRUE
             ${daOrganizacao(sql`u.organization_id`, escopo)}
             ${janela(sql`s.created_at`, escopo)}
             ${depois}
           ORDER BY s.created_at, s.id
           LIMIT ${PAGINA}
        `);

        if (page.length === 0) return;

        for (const s of page) {
          yield [
            csvDate(s.created_at),
            s.cambista,
            s.nome,
            s.order_count,
            csvMoney(s.gross_cents),
            csvMoney(s.commission_cents),
            csvMoney(s.net_cents),
            s.status,
            csvDate(s.settled_at),
            s.notes,
          ];
        }

        if (page.length < PAGINA) return;
        const ultimo = page[page.length - 1];
        cursor = { createdAt: ultimo.created_at, id: ultimo.id };
      }
    })(),
  };
}

/* ------------------------------------------------------------------ *
 * Prestação de contas do sorteio
 * ------------------------------------------------------------------ */

interface LinhaSorteio {
  slug: string;
  title: string;
  prize_title: string;
  total_quotas: number;
  price_cents: number;
  authorization_code: string | null;
  seed: string;
  seed_hash: string;
  federal_contest: number | null;
  federal_prizes: string[] | null;
  result_number: number | null;
  executed_at: string | null;
  evidence_url: string | null;
  vencedor: string | null;
  vencedor_telefone: string | null;
  pedido: number | null;
  vendidas: number;
}

/**
 * Este relatório não é uma tabela: é um documento de duas colunas, campo e
 * valor. É o que se entrega a quem contesta o resultado.
 *
 * **A semente não sai antes do sorteio.** Ela é o segredo que, junto com os
 * prêmios da Federal, determina o número — quem a tiver antes calcula o
 * resultado e compra a cota. Antes do sorteio só sai o hash, que é o
 * compromisso público. Isto vale inclusive para o administrador: arquivo
 * baixado sai do controle do sistema.
 */
function sorteio(escopo: ExportScope): ExportStream {
  const campaignId = escopo.campaignId!;

  return {
    header: ["Campo", "Valor"],
    linhas: (async function* () {
      const [d] = await rows<LinhaSorteio>(sql`
        SELECT c.slug, c.title, c.prize_title, c.total_quotas, c.price_cents,
               c.authorization_code,
               d.seed, d.seed_hash, d.federal_contest, d.federal_prizes,
               d.result_number, d.executed_at, d.evidence_url,
               b.name AS vencedor, b.phone AS vencedor_telefone,
               o.code AS pedido,
               st.sold_count AS vendidas
          FROM campaigns c
          JOIN draws d ON d.campaign_id = c.id
          LEFT JOIN campaign_stats st ON st.campaign_id = c.id
          LEFT JOIN orders o ON o.id = d.winner_order_id
          LEFT JOIN buyers b ON b.id = o.buyer_id
         WHERE c.id = ${campaignId}::uuid
           ${daOrganizacao(sql`c.organization_id`, escopo)}
         -- ASC, nao DESC: o compromisso que vale e o PRIMEIRO, cujo hash foi
         -- publicado antes da primeira venda. Se um dia existir uma segunda
         -- linha, mostrar a mais nova seria exibir um hash que ninguem viu.
         ORDER BY d.created_at
         LIMIT 1
      `);

      if (!d) {
        throw new ExportError(
          "Esta campanha ainda não tem sorteio criado — não há o que prestar contas.",
          404,
        );
      }

      const sorteado = Boolean(d.executed_at);

      yield ["Rifa", d.title];
      yield ["Endereço", d.slug];
      yield ["Prêmio", d.prize_title];
      yield ["Total de cotas", d.total_quotas];
      yield ["Preço da cota", csvMoney(d.price_cents)];
      yield ["Cotas vendidas", d.vendidas ?? 0];
      yield ["Autorização SPA/MF", d.authorization_code];
      yield ["", ""];

      yield ["Hash da semente (publicado antes da 1a venda)", d.seed_hash];
      yield [
        "Semente",
        sorteado
          ? d.seed
          : "não divulgada — só depois do sorteio, senão o resultado é calculável",
      ];
      yield ["", ""];

      yield ["Concurso da Loteria Federal", d.federal_contest];
      if (d.federal_prizes) {
        // Laço, não forEach: `yield` só existe dentro do gerador.
        for (const [i, premio] of d.federal_prizes.entries()) {
          yield [`${i + 1}o prêmio da Federal`, premio];
        }
      }
      yield ["", ""];

      yield ["Sorteio realizado em", csvDate(d.executed_at)];
      yield ["Número sorteado", d.result_number];
      yield ["Pedido vencedor", d.pedido];
      yield ["Ganhador", d.vencedor];
      // O telefone inteiro do ganhador não entra: o arquivo circula, e o
      // ganhador de rifa é alvo. Mascarado basta para conferir a identidade.
      yield ["Telefone do ganhador", d.vencedor_telefone ? maskPhone(d.vencedor_telefone) : null];
      yield ["Comprovação", d.evidence_url];
      yield ["", ""];

      yield [
        "Como conferir",
        "numero = 1 + (HMAC_SHA256(semente, os 5 premios da Federal) mod total), com rejeicao de amostra",
      ];
    })(),
  };
}

/* ------------------------------------------------------------------ *
 * Despacho
 * ------------------------------------------------------------------ */

const RELATORIOS: Record<ExportKey, (escopo: ExportScope) => ExportStream> = {
  pedidos,
  cotas,
  compradores,
  comissoes,
  acertos,
  sorteio,
};

export function buildExport(key: ExportKey, escopo: ExportScope): ExportStream {
  const montar = RELATORIOS[key];
  if (!montar) throw new ExportError("Relatório desconhecido.", 404);
  return montar(escopo);
}

/** Uma linha do arquivo, já escapada. */
export function toCsvLine(valores: unknown[]): string {
  return csvRow(valores);
}
