import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

/** Bytes crus (o anexo do chamado). O driver `pg` entrega `Buffer`. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const billingMode = pgEnum("billing_mode", [
  "gratis",
  "mensalidade",
  "comissao",
]);
export const chargeKind = pgEnum("charge_kind", ["venda", "mensalidade"]);
export const chargeStatus = pgEnum("charge_status", [
  "aberta",
  "paga",
  "cancelada",
]);

export const userRole = pgEnum("user_role", [
  "admin",
  "organizer",
  "affiliate",
  "cambista",
]);
export const campaignStatus = pgEnum("campaign_status", [
  "draft",
  "published",
  "closed",
  "drawn",
]);
export const mediaRole = pgEnum("media_role", ["banner", "photo", "video"]);
export const mediaStatus = pgEnum("media_status", ["processing", "ready", "rejected"]);
export const allocStatus = pgEnum("alloc_status", ["reserved", "paid"]);
export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "expired",
  "refunded",
]);
export const commissionStatus = pgEnum("commission_status", [
  "pending",
  "available",
  "paid",
  "reversed",
]);
export const payoutStatus = pgEnum("payout_status", ["requested", "paid", "failed"]);
export const affiliateStatus = pgEnum("affiliate_status", [
  "pending",
  "active",
  "blocked",
]);

/**
 * Divulgador online ganha comissão e RECEBE da casa; cambista vende na mão,
 * fica com o dinheiro e PAGA a casa no acerto. A comissão é a mesma
 * máquina; o que muda é a direção do caixa.
 */
export const affiliateKind = pgEnum("affiliate_kind", ["online", "cambista"]);

/** Como o dinheiro entrou numa venda física. */
export const paymentMethod = pgEnum("payment_method", [
  "pix_online",
  "dinheiro",
  "cartao_maquininha",
  "pix_maquininha",
]);

export const settlementStatus = pgEnum("settlement_status", [
  "aberto",
  "pago",
]);

/* ------------------------------------------------------------------ *
 * Sessão (connect-pg-simple) — admin e afiliado
 * ------------------------------------------------------------------ */

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (t) => [index("idx_sessions_expire").on(t.expire)],
);

/* ------------------------------------------------------------------ *
 * Pessoas
 * ------------------------------------------------------------------ */

/** Quem faz login com senha: administrador geral e afiliados. */
/**
 * Organização — o promotor da rifa.
 *
 * Existe porque a Lei 5.768/71 autoriza **o promotor**, não a plataforma: a
 * autorização SPA/MF é de quem promove, e cada campanha carrega a sua
 * (invariante 9). Com mais de um promotor no ar, o que o bilhete chama de
 * "administradora" deixa de ser configuração global e passa a ser desta
 * tabela.
 *
 * A raiz de todo o isolamento é o `organization_id` da campanha: pedido,
 * cota, comissão, sorteio e acerto penduram numa campanha ou num afiliado, e
 * os dois têm dono.
 */
/** Quando a comissão do divulgador fica disponível. Ver `shared/plataforma.ts`. */
export const commissionRelease = pgEnum("commission_release", ["apos_sorteio", "imediata"]);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    /** Nome que aparece no bilhete, como administradora da rifa. */
    name: text("name").notNull(),
    cnpj: text("cnpj"),
    contato: text("contato"),
    /**
     * Endereço da promotora. A cidade sai no bilhete; cidade e UF ordenam a
     * vitrine (cidade → estado → resto). Toda rifa é nacional: localização
     * ordena, nunca esconde. Validação em `shared/endereco.ts`.
     */
    cidade: text("cidade"),
    uf: text("uf"),
    cep: text("cep"),
    logradouro: text("logradouro"),
    numero: text("numero"),
    complemento: text("complemento"),
    bairro: text("bairro"),
    /** Texto curto do regulamento impresso no rodapé do bilhete. */
    observacao: text("observacao"),
    /**
     * O contrato com a plataforma: mensalidade OU comissão, nunca os dois.
     * Nasce `gratis` — organização que existia antes desta decisão não pode
     * acordar devendo. Ver `shared/billing.ts`.
     */
    billingMode: billingMode("billing_mode").notNull().default("gratis"),
    /** Percentual sobre a venda. Só vale no modo `comissao`. */
    platformFeePct: integer("platform_fee_pct").notNull().default(0),
    /** Valor do mês em centavos. Só vale no modo `mensalidade`. */
    monthlyCents: integer("monthly_cents").notNull().default(0),
    active: boolean("active").notNull().default(true),
    /**
     * Arquivada: saiu da carteira ativa, mas **não sai do banco**. Venda,
     * cota, comissão e cobrança dela continuam nos relatórios — apagar a
     * linha levaria junto o histórico que a contabilidade confere. A tela de
     * organizações esconde por padrão e mostra no filtro "arquivadas".
     */
    archivedAt: timestamp("archived_at"),
    /**
     * Carteira da organização no Asaas. Com ela, a parte do promotor cai
     * direto na conta dele no momento do pagamento (split); sem ela, tudo
     * entra na conta da plataforma, como no Mercado Pago.
     */
    asaasWalletId: text("asaas_wallet_id"),
    /**
     * Comissão do divulgador: depois do sorteio (padrão, com carência) ou na
     * hora do pagamento. Escolha da organização.
     */
    liberacaoComissao: commissionRelease("liberacao_comissao").notNull().default("apos_sorteio"),
    /**
     * Dias que a organização se compromete a levar para devolver o dinheiro
     * depois de aprovar um pedido de reembolso. O prazo de cada chamado é
     * calculado sozinho na aprovação.
     */
    prazoEstornoDias: integer("prazo_estorno_dias").notNull().default(7),
    /** WhatsApp que recebe o aviso de chamado novo. Nulo: os organizadores. */
    avisoTelefone: text("aviso_telefone"),
    /**
     * Perfil público (`/o/:slug`). A bio é o texto do organizador; a parte da
     * rifa atual é montada sozinha (`bioAutomatica()` em `shared/perfil.ts`).
     */
    bio: text("bio"),
    /**
     * Seguidores, contados na mesma transação que segue ou deixa de seguir —
     * a mesma regra de `campaign_stats`: nada de `COUNT(*)` na página.
     */
    seguidoresCount: integer("seguidores_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_organizations_slug").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: userRole("role").notNull(),
    /**
     * A organização deste usuário. **Nulo é a plataforma**: o administrador
     * geral, que enxerga todas. Organizador sem organização não existe — é
     * recusado na entrada, senão viraria um admin geral por omissão.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    totpSecret: text("totp_secret"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_users_email").on(t.email)],
);

/** Comprador: identidade leve, sem senha. Achado por telefone. */
export const buyers = pgTable(
  "buyers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    cpf: text("cpf"),
    email: text("email"),
    /**
     * ID do cliente, visível para ele e para o atendimento (ex.: C-7F3K9Q2M).
     * Sorteado, nunca sequencial; quem garante que não repete é o índice.
     * Nasce na primeira vez que o comprador entra em "Minhas cotas".
     */
    codigo: text("codigo"),
    /**
     * Conta com senha (entrar por telefone, CPF ou e-mail). Nulo: comprador
     * que só compra e entra pelo código do WhatsApp — o jeito antigo.
     */
    passwordHash: text("password_hash"),
    contaCriadaEm: timestamp("conta_criada_em"),
    /**
     * Telefone provado pelo código do WhatsApp. Sem isso a conta só enxerga o
     * que comprou dentro dela (`orders.via_conta`) — senão quem criasse conta
     * com o número de outro veria as compras dele.
     */
    telefoneConfirmadoEm: timestamp("telefone_confirmado_em"),
    /**
     * Compras feitas antes da conta, pelo telefone, que passaram a ser da
     * conta porque o CPF delas bateu com o do cadastro. Vale para o que
     * existia até este instante — compra futura sem entrar não herda.
     */
    comprasVinculadasEm: timestamp("compras_vinculadas_em"),
    /** Exclusão pela LGPD: os dados pessoais saem, as compras ficam. */
    excluidoEm: timestamp("excluido_em"),
    /**
     * Aparecer em "seguido por…" nos perfis. Nasce desligado: seguir e
     * participar de rifa é dado pessoal (LGPD), só aparece quem liga.
     */
    perfilPublico: boolean("perfil_publico").notNull().default(false),
    /**
     * CEP do cadastro, e a cidade/UF que ele dá: é o que põe na frente as
     * rifas perto da pessoa, sem ela precisar escolher. Só ordena a vitrine.
     */
    cep: text("cep"),
    cidade: text("cidade"),
    uf: text("uf"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_buyers_phone").on(t.phone),
    uniqueIndex("uq_buyers_codigo").on(t.codigo),
    // CPF e e-mail entram como forma de login só entre contas: comprador sem
    // conta pode repetir (a mesma pessoa com dois telefones, digitação antiga).
    uniqueIndex("uq_buyers_conta_cpf").on(t.cpf).where(sql`password_hash is not null`),
    uniqueIndex("uq_buyers_conta_email").on(t.email).where(sql`password_hash is not null`),
  ],
);

export const affiliates = pgTable(
  "affiliates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    kind: affiliateKind("kind").notNull().default("online"),
    pixKey: text("pix_key"),
    /** Sobrepõe campaigns.commissionPctDefault quando preenchido. */
    commissionPct: integer("commission_pct"),
    status: affiliateStatus("status").notNull().default("pending"),
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_affiliates_code").on(t.code),
    uniqueIndex("uq_affiliates_user").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ *
 * Campanhas (multi-rifas)
 * ------------------------------------------------------------------ */

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Dono da campanha. É daqui que sai TODO o isolamento entre organizadores:
     * pedido, cota, comissão e sorteio chegam por aqui.
     */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    prizeTitle: text("prize_title").notNull(),
    /** 100 a 1.000.000. Travado na publicação — ver services/campaigns.ts */
    totalQuotas: integer("total_quotas").notNull(),
    priceCents: integer("price_cents").notNull(),
    minPerOrder: integer("min_per_order").notNull().default(1),
    maxPerOrder: integer("max_per_order").notNull().default(1000),
    reservationTtlMin: integer("reservation_ttl_min").notNull().default(15),
    drawAt: timestamp("draw_at"),
    /** Compromisso público do sorteio: hash publicado antes da 1ª venda. */
    drawSeedHash: text("draw_seed_hash"),
    /** Certificado SPA/MF da campanha — exigido para publicar. */
    authorizationCode: text("authorization_code"),
    authorizationFileKey: text("authorization_file_key"),
    status: campaignStatus("status").notNull().default("draft"),
    commissionPctDefault: integer("commission_pct_default").notNull().default(10),
    featured: boolean("featured").notNull().default(false),
    sortWeight: integer("sort_weight").notNull().default(0),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_campaigns_slug").on(t.slug),
    index("idx_campaigns_status").on(t.status, t.sortWeight),
    // Todo painel de organizador filtra por aqui.
    index("idx_campaigns_org").on(t.organizationId),
  ],
);

export const campaignMedia = pgTable(
  "campaign_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    role: mediaRole("role").notNull(),
    position: integer("position").notNull().default(0),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    /** Medida no servidor com ffprobe. Vídeo acima de 60 s é recusado. */
    durationS: integer("duration_s"),
    posterKey: text("poster_key"),
    /** Variantes responsivas geradas na ingestão (AVIF/WebP em 400/800/1600). */
    variants: jsonb("variants").$type<
      { width: number; format: "avif" | "webp"; key: string; bytes: number }[]
    >(),
    /** Miniatura de 20 px embutida, exibida borrada enquanto a foto carrega. */
    lqip: text("lqip"),
    altText: text("alt_text"),
    bytes: bigint("bytes", { mode: "number" }),
    status: mediaStatus("status").notNull().default("processing"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_media_campaign").on(t.campaignId, t.role, t.position)],
);

export const quotaPackages = pgTable(
  "quota_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    discountPct: integer("discount_pct").notNull().default(0),
    highlight: boolean("highlight").notNull().default(false),
  },
  (t) => [index("idx_packages_campaign").on(t.campaignId, t.quantity)],
);

export const prizedQuotas = pgTable(
  "prized_quotas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    prizeLabel: text("prize_label").notNull(),
    claimedByOrderId: uuid("claimed_by_order_id"),
    claimedAt: timestamp("claimed_at"),
  },
  (t) => [uniqueIndex("uq_prized_campaign_number").on(t.campaignId, t.number)],
);

/* ------------------------------------------------------------------ *
 * Cotas — armazenamento esparso (ver docs/PLANO-RIFA.md §4.1)
 *
 * Só existe linha para cota TOMADA. Disponível é a ausência de linha:
 * publicar uma campanha de 1.000.000 não cria nenhuma linha aqui.
 * ------------------------------------------------------------------ */

export const quotaAlloc = pgTable(
  "quota_alloc",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    status: allocStatus("status").notNull(),
    orderId: uuid("order_id").notNull(),
    reservedUntil: timestamp("reserved_until"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // A exclusividade da cota é esta chave. Nada mais.
    primaryKey({ columns: [t.campaignId, t.number] }),
    index("idx_alloc_order").on(t.orderId),
    index("idx_alloc_expiry").on(t.reservedUntil),
  ],
);

/** Contadores incrementais: a barra de progresso nunca faz COUNT(*) em 1M. */
export const campaignStats = pgTable("campaign_stats", {
  campaignId: uuid("campaign_id")
    .primaryKey()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  soldCount: integer("sold_count").notNull().default(0),
  reservedCount: integer("reserved_count").notNull().default(0),
  revenueCents: bigint("revenue_cents", { mode: "number" }).notNull().default(0),
  /** Acima de 85% vendido a amostragem aleatória colide demais: usa free_pool. */
  endgame: boolean("endgame").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Materializado só no endgame, com os números que sobraram. */
export const freePool = pgTable(
  "free_pool",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.number] })],
);

/* ------------------------------------------------------------------ *
 * Pedidos e pagamento
 * ------------------------------------------------------------------ */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Número curto que o comprador lê no WhatsApp. */
    code: integer("code").notNull(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id),
    quantity: integer("quantity").notNull(),
    amountCents: integer("amount_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    status: orderStatus("status").notNull().default("pending"),
    affiliateId: uuid("affiliate_id").references(() => affiliates.id),
    /** Preenchido quando a venda foi na mão de um cambista. */
    sellerId: uuid("seller_id").references(() => affiliates.id),
    method: paymentMethod("method").notNull().default("pix_online"),
    /** NSU/autorização devolvido pela maquininha, quando houver. */
    posAuthCode: text("pos_auth_code"),
    posTerminal: text("pos_terminal"),
    ticketPrintedAt: timestamp("ticket_printed_at"),
    /** Hash do identificador do aparelho — liga compras do mesmo celular. */
    deviceHash: text("device_hash"),
    ipHash: text("ip_hash"),
    settlementId: uuid("settlement_id"),
    couponId: uuid("coupon_id"),
    /** Feito dentro da conta do apostador: é da conta mesmo sem telefone confirmado. */
    viaConta: boolean("via_conta").notNull().default(false),
    pspProvider: text("psp_provider"),
    pspChargeId: text("psp_charge_id"),
    pixQr: text("pix_qr"),
    pixCopyPaste: text("pix_copy_paste"),
    expiresAt: timestamp("expires_at"),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_orders_code").on(t.code),
    index("idx_orders_campaign_status").on(t.campaignId, t.status),
    index("idx_orders_buyer").on(t.buyerId),
    index("idx_orders_affiliate").on(t.affiliateId),
    index("idx_orders_expiry").on(t.status, t.expiresAt),
  ],
);

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "cascade",
    }),
    affiliateId: uuid("affiliate_id").references(() => affiliates.id, {
      onDelete: "cascade",
    }),
    code: text("code").notNull(),
    discountPct: integer("discount_pct").notNull(),
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    expiresAt: timestamp("expires_at"),
  },
  (t) => [uniqueIndex("uq_coupons_code").on(t.code)],
);

/* ------------------------------------------------------------------ *
 * Afiliados: rastreio, comissão, saque
 * ------------------------------------------------------------------ */

export const clickEvents = pgTable(
  "click_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "cascade",
    }),
    /** IP e user-agent guardados como hash — LGPD, minimização. */
    ipHash: text("ip_hash"),
    uaHash: text("ua_hash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_clicks_affiliate").on(t.affiliateId, t.createdAt)],
);

export const commissions = pgTable(
  "commissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    pct: integer("pct").notNull(),
    status: commissionStatus("status").notNull().default("pending"),
    /** Liberação só depois da janela de estorno. */
    availableAt: timestamp("available_at").notNull(),
    payoutId: uuid("payout_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_commission_order").on(t.orderId),
    index("idx_commissions_affiliate").on(t.affiliateId, t.status),
  ],
);

export const payouts = pgTable("payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id")
    .notNull()
    .references(() => affiliates.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  pixKey: text("pix_key").notNull(),
  status: payoutStatus("status").notNull().default("requested"),
  receiptUrl: text("receipt_url"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
});

/* ------------------------------------------------------------------ *
 * Sorteio, webhooks, auditoria
 * ------------------------------------------------------------------ */

export const draws = pgTable("draws", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  /** Concurso da Loteria Federal usado como entropia pública. */
  federalContest: integer("federal_contest"),
  /** Os 5 prêmios do concurso, na ordem. */
  federalPrizes: jsonb("federal_prizes").$type<string[]>(),
  seed: text("seed").notNull(),
  seedHash: text("seed_hash").notNull(),
  resultNumber: integer("result_number"),
  winnerOrderId: uuid("winner_order_id").references(() => orders.id),
  evidenceUrl: text("evidence_url"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Tentativas registradas para contar janela — a base do limite por tempo. */
export const rateEvents = pgTable(
  "rate_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Ex.: "order:phone:11988887777" — já vem com hash quando é dado pessoal. */
    bucket: text("bucket").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_rate_bucket").on(t.bucket, t.createdAt)],
);

/** O que o antifraude barrou — a tela de quem precisa entender o que houve. */
export const fraudEvents = pgTable(
  "fraud_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rule: text("rule").notNull(),
    reason: text("reason").notNull(),
    /** Telefone mascarado, hash de IP/aparelho — nunca o dado cru. */
    subject: text("subject"),
    campaignId: uuid("campaign_id"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_fraud_created").on(t.createdAt)],
);

/** Bloqueio manual do administrador. */
export const fraudBlocks = pgTable(
  "fraud_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    /** Telefone em dígitos, ou hash de IP/aparelho. */
    value: text("value").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),
  },
  (t) => [uniqueIndex("uq_fraud_block").on(t.kind, t.value)],
);

/**
 * Ajustes gerais em chave/valor. Hoje guarda os dados da administradora
 * da rifa, que precisam sair impressos em todo bilhete.
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export interface OrganizerInfo {
  /** Nome que aparece no bilhete. */
  nome: string;
  cnpj?: string;
  contato?: string;
  cidade?: string;
  /** Texto curto do regulamento impresso no rodapé. */
  observacao?: string;
}

/**
 * Acerto do cambista: o que ele recolheu, menos a comissão dele, é o que
 * ele deve à casa. Fechar o acerto carimba os pedidos incluídos.
 */
export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    grossCents: integer("gross_cents").notNull(),
    commissionCents: integer("commission_cents").notNull(),
    netCents: integer("net_cents").notNull(),
    orderCount: integer("order_count").notNull(),
    status: settlementStatus("status").notNull().default("aberto"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    settledAt: timestamp("settled_at"),
  },
  (t) => [index("idx_settlements_seller").on(t.sellerId, t.status)],
);

/**
 * Mensagens enviadas. A chave de deduplicação é o que impede o mesmo
 * lembrete de sair duas vezes — inclusive com duas réplicas acordando no
 * mesmo minuto.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    to: text("to").notNull(),
    template: text("template").notNull(),
    params: jsonb("params").$type<Record<string, string>>(),
    status: text("status").notNull().default("sent"),
    error: text("error"),
    /** Ex.: "order:<id>:reserva_expirando" */
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_notifications_dedupe").on(t.dedupeKey),
    index("idx_notifications_created").on(t.createdAt),
  ],
);

/** Idempotência do webhook do provedor de pagamento. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_webhook_external").on(t.provider, t.externalId)],
);

/**
 * O que cada organização deve à plataforma.
 *
 * Um razão só para os dois contratos, porque a pergunta que o administrador
 * faz é a mesma nos dois casos: quanto este cliente me deve? Cada linha diz
 * de onde veio — `venda` traz o pedido, `mensalidade` traz a competência.
 *
 * Os dois índices únicos são o que impede cobrança dobrada, e cada um pega um
 * jeito diferente de dobrar: o do pedido impede que o webhook chamado duas
 * vezes lance a taxa de novo; o da competência impede que o relógio, rodando
 * a cada minuto em quantas réplicas for, lance o mesmo mês outra vez.
 */
export const platformCharges = pgTable(
  "platform_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: chargeKind("kind").notNull(),
    /** Preenchido em `venda`. */
    orderId: uuid("order_id"),
    /** Preenchido em `mensalidade`, no formato `aaaa-mm`. */
    competencia: text("competencia"),
    amountCents: integer("amount_cents").notNull(),
    /** O percentual ou o valor combinado no dia — o contrato pode mudar. */
    pct: integer("pct"),
    status: chargeStatus("status").notNull().default("aberta"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    paidAt: timestamp("paid_at"),
  },
  (t) => [
    uniqueIndex("uq_charge_order").on(t.orderId),
    uniqueIndex("uq_charge_competencia").on(t.organizationId, t.competencia),
    index("idx_charges_org").on(t.organizationId, t.status),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    diff: jsonb("diff"),
    ip: text("ip"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_audit_entity").on(t.entity, t.entityId, t.createdAt)],
);

/* ------------------------------------------------------------------ *
 * Atendimento: chamados de reembolso com conversa
 * ------------------------------------------------------------------ */

export const chamadoStatus = pgEnum("chamado_status", [
  "aberto",
  "aprovado",
  "recusado",
  "estornado",
]);

/**
 * Pedido de reembolso. Só o comprador logado abre, só para pedido pago dele,
 * e só um chamado em andamento por pedido — quem garante é o índice parcial,
 * não uma consulta antes.
 */
export const chamados = pgTable(
  "chamados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Número que o comprador e o atendimento usam para falar do caso. */
    protocolo: text("protocolo").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "restrict" }),
    status: chamadoStatus("status").notNull().default("aberto"),
    motivo: text("motivo").notNull(),
    /** Chave Pix para devolução quando o provedor não devolve sozinho. */
    pixChave: text("pix_chave"),
    /** Prazo para devolver, calculado na aprovação com o prazo da organização. */
    prazoEstornoAte: timestamp("prazo_estorno_ate"),
    concluidoEm: timestamp("concluido_em"),
    concluidoPor: uuid("concluido_por"),
    /** Resposta final da organização (aprovação ou motivo da recusa). */
    decisao: text("decisao"),
    estornadoEm: timestamp("estornado_em"),
    /** Como o dinheiro voltou: pelo provedor, na conta que pagou, ou à mão. */
    formaDevolucao: text("forma_devolucao"),
    /**
     * Quanto volta, calculado quando o comprador pede (é a data do pedido que
     * decide os 7 dias do arrependimento) — ver `shared/reembolso.ts`. Nulo
     * nos chamados anteriores a esta regra: devolução integral.
     */
    tipoReembolso: text("tipo_reembolso"),
    taxaPct: integer("taxa_pct"),
    taxaCents: integer("taxa_cents"),
    devolverCents: integer("devolver_cents"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_chamados_protocolo").on(t.protocolo),
    uniqueIndex("uq_chamados_pedido_andamento")
      .on(t.orderId)
      .where(sql`status in ('aberto', 'aprovado')`),
    index("idx_chamados_org").on(t.organizationId, t.status, t.createdAt),
  ],
);

/**
 * Anexo (o print do bilhete). Guardado no próprio banco, já reprocessado:
 * a imagem é decodificada e regravada em JPEG, o que descarta metadado
 * (localização da foto) e qualquer coisa que não seja imagem de verdade.
 */
/**
 * Arquivo do certificado de autorização da SPA/MF, um por campanha. Fica no
 * banco — é pequeno, é documento legal e não pode depender do armazenamento
 * de mídia estar configurado. Tabela à parte para `select()` de campanha
 * nunca arrastar o arquivo junto.
 */
/**
 * Foto do perfil da organização. Fica no banco, como o certificado: é pequena
 * (reprocessada em 400 px, WebP) e não pode depender do R2 estar configurado.
 */
export const organizacaoFotos = pgTable("organizacao_fotos", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Quem segue quem. A chave é o par: seguir duas vezes é `ON CONFLICT DO
 * NOTHING`, nunca um `SELECT` antes. `sino` liga junto com o seguir.
 */
export const seguidores = pgTable(
  "seguidores",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    sino: boolean("sino").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.buyerId] }),
    index("idx_seguidores_buyer").on(t.buyerId),
  ],
);

/**
 * Aparelhos que aceitaram notificação (Web Push). O `endpoint` é único: o
 * mesmo aparelho entrando com outra conta passa a ser da outra conta.
 */
export const pushInscricoes = pgTable(
  "push_inscricoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    ultimoEnvioEm: timestamp("ultimo_envio_em"),
  },
  (t) => [uniqueIndex("uq_push_endpoint").on(t.endpoint), index("idx_push_buyer").on(t.buyerId)],
);

/**
 * O que já foi avisado a quem. A chave é o par (comprador, chave do aviso):
 * o relógio rodando de novo, ou em duas réplicas, não repete notificação.
 */
export const pushEnvios = pgTable(
  "push_envios",
  {
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    chave: text("chave").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.buyerId, t.chave] })],
);

export const campaignCertificados = pgTable("campaign_certificados", {
  campaignId: uuid("campaign_id")
    .primaryKey()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  nome: text("nome").notNull(),
  bytes: bytea("bytes").notNull(),
  tamanho: integer("tamanho").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chamadoAnexos = pgTable("chamado_anexos", {
  id: uuid("id").primaryKey().defaultRandom(),
  chamadoId: uuid("chamado_id")
    .notNull()
    .references(() => chamados.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  tamanho: integer("tamanho").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chamadoMensagens = pgTable(
  "chamado_mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chamadoId: uuid("chamado_id")
      .notNull()
      .references(() => chamados.id, { onDelete: "cascade" }),
    /** Quem escreveu: o comprador ou a organização (qualquer pessoa do painel). */
    autor: text("autor").notNull(),
    /** Pessoa do painel que respondeu; nulo quando é o comprador. */
    userId: uuid("user_id"),
    texto: text("texto").notNull(),
    anexoId: uuid("anexo_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_chamado_mensagens").on(t.chamadoId, t.createdAt)],
);

/* ------------------------------------------------------------------ *
 * Relações
 * ------------------------------------------------------------------ */

export const campaignsRelations = relations(campaigns, ({ many, one }) => ({
  media: many(campaignMedia),
  packages: many(quotaPackages),
  orders: many(orders),
  stats: one(campaignStats, {
    fields: [campaigns.id],
    references: [campaignStats.campaignId],
  }),
}));

export const campaignMediaRelations = relations(campaignMedia, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignMedia.campaignId],
    references: [campaigns.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [orders.campaignId],
    references: [campaigns.id],
  }),
  buyer: one(buyers, { fields: [orders.buyerId], references: [buyers.id] }),
  affiliate: one(affiliates, {
    fields: [orders.affiliateId],
    references: [affiliates.id],
  }),
}));

export const affiliatesRelations = relations(affiliates, ({ one, many }) => ({
  user: one(users, { fields: [affiliates.userId], references: [users.id] }),
  commissions: many(commissions),
}));

/* ------------------------------------------------------------------ *
 * Validação
 * ------------------------------------------------------------------ */

export const MIN_QUOTAS = 100;
export const MAX_QUOTAS = 1_000_000;
export const MAX_VIDEO_SECONDS = 60;
export const MAX_PHOTOS = 5;

export const insertCampaignSchema = createInsertSchema(campaigns, {
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen."),
  title: z.string().min(3).max(120),
  prizeTitle: z.string().min(3).max(160),
  totalQuotas: z
    .number()
    .int()
    .min(MIN_QUOTAS, `O mínimo é ${MIN_QUOTAS} cotas.`)
    .max(MAX_QUOTAS, "O máximo é 1.000.000 de cotas."),
  priceCents: z.number().int().min(1),
  commissionPctDefault: z.number().int().min(0).max(50),
})
  // A organização não vem do formulário: o organizador cria na dele e o
  // administrador geral escolhe à parte (`organizationForNewCampaign`).
  // Pedi-la aqui barrava todo organizador com "Invalid uuid". O hash da
  // semente é do sistema: nasce na publicação. Autorização e data do sorteio
  // têm rota própria (`/campaigns/:id/legal`), que confere o arquivo: pelo
  // formulário genérico daria para marcar o certificado sem enviá-lo.
  .omit({
    id: true,
    createdAt: true,
    publishedAt: true,
    status: true,
    organizationId: true,
    drawSeedHash: true,
    authorizationCode: true,
    authorizationFileKey: true,
    drawAt: true,
  });

export const createOrderSchema = z.object({
  campaignId: z.string().uuid(),
  /** Compra rápida: só a quantidade. Escolha manual: a lista de números. */
  quantity: z.number().int().min(1).max(10_000).optional(),
  numbers: z.array(z.number().int().positive()).max(10_000).optional(),
  buyer: z.object({
    name: z.string().min(2).max(120),
    phone: z.string().min(10).max(20),
    cpf: z.string().optional(),
    email: z.string().email().optional(),
  }),
  couponCode: z.string().max(40).optional(),
  affiliateCode: z.string().max(40).optional(),
});

export type User = typeof users.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignMedia = typeof campaignMedia.$inferSelect;
export type CampaignStats = typeof campaignStats.$inferSelect;
export type QuotaPackage = typeof quotaPackages.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Buyer = typeof buyers.$inferSelect;
export type Affiliate = typeof affiliates.$inferSelect;
export type Commission = typeof commissions.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type Draw = typeof draws.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type FraudEvent = typeof fraudEvents.$inferSelect;
export type FraudBlock = typeof fraudBlocks.$inferSelect;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
