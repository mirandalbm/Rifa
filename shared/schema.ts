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
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", ["admin", "affiliate"]);
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
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: userRole("role").notNull(),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_buyers_phone").on(t.phone)],
);

export const affiliates = pgTable(
  "affiliates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
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
    /** Nulo hoje. Existe para não doer se o produto virar multi-organizador. */
    organizationId: uuid("organization_id"),
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
    couponId: uuid("coupon_id"),
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
}).omit({ id: true, createdAt: true, publishedAt: true, status: true });

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
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
