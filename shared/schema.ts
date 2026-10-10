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
  real,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

/**
 * Índice de trigrama (`pg_trgm`) sobre o texto sem acento e minúsculo — a
 * expressão da busca (`semAcentoSql`), letra por letra, senão o Postgres não
 * usa o índice. A extensão é criada antes do `db:push` (`scripts/extensoes.ts`).
 * O nome leva a versão da expressão (`trgm()`): o `drizzle-kit` não compara a
 * expressão de um índice, só o nome — mudar as letras sem mudar o nome deixaria
 * o índice antigo no banco, sem servir.
 */
const trigramaSemAcento = (coluna: unknown) =>
  sql`translate(lower(${coluna}), ${sql.raw(`'${ACENTOS_DE}'`)}, ${sql.raw(`'${ACENTOS_PARA}'`)}) gin_trgm_ops`;
const trgm = (nome: string) => `${nome}_trgm_v${VERSAO_SEM_ACENTO}`;

/** Bytes crus (o anexo do chamado). O driver `pg` entrega `Buffer`. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
import { createInsertSchema } from "drizzle-zod";
import { ACENTOS_DE, ACENTOS_PARA, VERSAO_SEM_ACENTO } from "./semAcentoSql";
import type { Figurinha } from "./figurinhasStory";
import { MODOS_DE_COBRANCA } from "./cobranca";
import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

/**
 * O que a plataforma lança contra a organização. Só `venda` é gravado hoje
 * (a taxa da venda e a do Pix numa linha, `shared/cobranca.ts`);
 * `mensalidade` ficou no tipo do banco porque o Postgres não tira valor de
 * enum, mas a mensalidade não existe mais e nada a grava.
 */
export const chargeKind = pgEnum("charge_kind", ["venda", "mensalidade"]);
export const chargeStatus = pgEnum("charge_status", [
  "aberta",
  "paga",
  "cancelada",
  /** Já ficou com a plataforma no split do Pix (Asaas): nada a cobrar. */
  "retida",
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
/**
 * `reels`: vídeo que a organização publica **só no Reels** (fora do
 * carrossel da rifa), em pé e de até 3 min, medido no servidor.
 */
export const mediaRole = pgEnum("media_role", ["banner", "photo", "video", "reels"]);
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
  // Cota grátis do programa de bônus (etapa 13): pedido de R$ 0,00.
  "bonus",
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
     * Como o afiliado (influenciador) publica com o material desta
     * organização: `autorizacao` (padrão — nada vai ao ar sem ela) ou
     * `direta`. Ver `shared/divulgacao.ts`.
     */
    divulgacaoAfiliado: text("divulgacao_afiliado").notNull().default("autorizacao"),
    /** Saldo para rifas patrocinadas (etapa 15), em centavos. Anda com o livro, na mesma transação. */
    patrocinioSaldoCents: integer("patrocinio_saldo_cents").notNull().default(0),
    /**
     * Números de rastreamento da organização (Meta, GA4, Google Ads, TikTok),
     * conferidos por formato em `validarPixels()` — só dados, nunca script.
     * Valem nas páginas dela (perfil e rifas), com o aviso de cookies aceito.
     */
    pixels: jsonb("pixels").$type<import("./marketing").Pixels>().notNull().default({}),
    /**
     * Dias que a organização se compromete a levar para devolver o dinheiro
     * depois de aprovar um pedido de reembolso. O prazo de cada chamado é
     * calculado sozinho na aprovação.
     */
    prazoEstornoDias: integer("prazo_estorno_dias").notNull().default(7),
    /** WhatsApp que recebe o aviso de chamado novo. Nulo: os organizadores. */
    avisoTelefone: text("aviso_telefone"),
    /**
     * O telefone do organizador: provado pelo código do WhatsApp e aprovado
     * pela plataforma antes da primeira rifa (`publishBlockers`). Trocar o
     * número zera as duas marcas.
     */
    telefoneOrganizador: text("telefone_organizador"),
    telefoneConfirmadoEm: timestamp("telefone_confirmado_em"),
    telefoneAprovadoEm: timestamp("telefone_aprovado_em"),
    telefoneAprovadoPor: uuid("telefone_aprovado_por"),
    /**
     * A organização declarou que a lista de sócios e diretores
     * (`organizacao_socios`) está completa (resposta 5.6 do advogado). Mexer
     * na lista apaga a declaração na mesma transação; a rifa autorizada não
     * publica sem ela.
     */
    sociosDeclaradosEm: timestamp("socios_declarados_em"),
    sociosDeclaradosPor: uuid("socios_declarados_por"),
    /** Banida por fraude (ex.: Pix fora da plataforma): porta fechada e rifas travadas. */
    banidaEm: timestamp("banida_em"),
    banidaMotivo: text("banida_motivo"),
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
    /**
     * White label do perfil: cor de destaque nos dois temas (nula = a da
     * plataforma; contraste conferido em `validarDestaque()`) e os links da
     * bio (só https, `validarLinks()`). A capa fica em `organizacao_capas`.
     */
    destaqueClaro: text("destaque_claro"),
    destaqueEscuro: text("destaque_escuro"),
    links: jsonb("links").$type<{ rotulo: string; url: string }[]>().notNull().default([]),
    /** Organização verificada (selo de trevo): espelho de `verificacoes`, na mesma transação. */
    verificadaEm: timestamp("verificada_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_organizations_slug").on(t.slug),
    // A busca por texto (Buscar): nome e endereço da organização, sem acento.
    index(trgm("idx_organizations_nome")).using("gin", trigramaSemAcento(t.name)),
    index(trgm("idx_organizations_slug")).using("gin", trigramaSemAcento(t.slug)),
  ],
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
    /** Quando abriu o sino do painel pela última vez: o que veio depois conta como novo. */
    avisosVistosEm: timestamp("avisos_vistos_em"),
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
    /** Código do link de indicação (etapa 13). Diferente do ID do cliente, que prova identidade no reembolso. */
    codigoIndicacao: text("codigo_indicacao"),
    /** Cotas de bônus a resgatar. Anda com `bonus_lancamentos`, na mesma transação. */
    bonusSaldo: integer("bonus_saldo").notNull().default(0),
    /**
     * Apelido público, como o nome de usuário do Instagram (minúsculas,
     * números, ponto e sublinhado). Exigido para comentar; o perfil
     * `/u/<apelido>` mostra também o primeiro e o último nome reais.
     */
    apelido: text("apelido"),
    /** Quando a foto do perfil mudou (a foto em si fica em `comprador_fotos`). */
    fotoEm: timestamp("foto_em"),
    /**
     * Perfil verificado (selo de trevo). Espelho de `verificacoes.status =
     * 'verificado'`, gravado na mesma transação — a vitrine e os
     * comentários leem daqui sem juntar a tabela do cofre.
     */
    verificadoEm: timestamp("verificado_em"),
    /** Identificador (`sub`) da conta Google ligada. Único: uma conta Google, um apostador. */
    googleSub: text("google_sub"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_buyers_phone").on(t.phone),
    uniqueIndex("uq_buyers_google_sub").on(t.googleSub).where(sql`google_sub is not null`),
    uniqueIndex("uq_buyers_apelido").on(t.apelido).where(sql`apelido is not null`),
    uniqueIndex("uq_buyers_codigo").on(t.codigo),
    // "Quem também joga": parte dos poucos que abriram o perfil (opt-in), não de todos os compradores da rifa.
    index("ix_buyers_perfil_publico").on(t.apelido).where(sql`perfil_publico and apelido is not null and excluido_em is null`),
    uniqueIndex("uq_buyers_codigo_indicacao").on(t.codigoIndicacao),
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
    /** Quando a foto do perfil mudou (a foto fica em `afiliado_fotos`). */
    fotoEm: timestamp("foto_em"),
    /** Afiliado verificado (selo de trevo): espelho de `verificacoes`, na mesma transação. */
    verificadoEm: timestamp("verificado_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_affiliates_code").on(t.code),
    uniqueIndex("uq_affiliates_user").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ *
 * Sorteios oficiais (calendário da plataforma)
 * ------------------------------------------------------------------ */

/**
 * Os concursos das loterias da Caixa que a plataforma põe no calendário
 * (shared/sorteiosOficiais.ts). As organizações integram as rifas neles; a
 * tela do sorteio no Início do celular transmite só estes. O resultado é o
 * oficial, lançado pela plataforma, e fica guardado para sempre.
 */
export const sorteiosOficiais = pgTable(
  "sorteios_oficiais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `federal`, `mega_sena`, `quina`, `lotofacil` ou `globo` (`LOTERIAS`). */
    loteria: text("loteria").notNull(),
    concurso: integer("concurso").notNull(),
    sorteioEm: timestamp("sorteio_em").notNull(),
    titulo: text("titulo"),
    transmissaoUrl: text("transmissao_url"),
    /** Os números oficiais, no formato da loteria (`validarResultado`). */
    resultado: jsonb("resultado").$type<string[]>(),
    resultadoEm: timestamp("resultado_em"),
    canceladoEm: timestamp("cancelado_em"),
    criadoPor: uuid("criado_por"),
    criadoEm: timestamp("criado_em").notNull().defaultNow(),
    /** Comentários no ar — anda na mesma transação que grava ou apaga (nunca `COUNT(*)`). */
    comentariosCount: integer("comentarios_count").notNull().default(0),
    /**
     * A ata da sessão do globo (`AtaDoGlobo`, `validarAtaDoGlobo`), gravada
     * com o resultado: local, tabelionato, auditor ou testemunhas e o relato
     * de cada bola. Nula nas loterias da Caixa.
     */
    ata: jsonb("ata"),
  },
  // O mesmo concurso não entra duas vezes: o índice decide, não um SELECT antes.
  (t) => [uniqueIndex("uq_sorteio_oficial_concurso").on(t.loteria, t.concurso), index("idx_sorteios_oficiais_data").on(t.sorteioEm)],
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
    /**
     * Disposições da promotora no regulamento (o resto é montado dos dados
     * da rifa: `montarRegulamento()`). Trava ao publicar, com a autorização.
     */
    regulamentoExtra: text("regulamento_extra"),
    /**
     * A rifa aceita cotas de bônus (etapa 13). Cota grátis precisa estar no
     * regulamento aprovado: entra por `PUT /campaigns/:id/legal` e trava ao
     * publicar, como a autorização.
     */
    aceitaCotaBonus: boolean("aceita_cota_bonus").notNull().default(false),
    /**
     * Quantas cotas de bônus (grátis) a autorização prevê para esta rifa.
     * O resgate nunca passa disso (`campaign_stats.bonus_count`, teto no
     * `UPDATE`). 0 com `aceitaCotaBonus` desligado. Trava ao publicar.
     */
    bonusMaxCotas: integer("bonus_max_cotas").notNull().default(0),
    /**
     * A promotora declarou que a autorização da SPA/MF inclui o vale-brinde
     * (resposta 2.3 do advogado): a rifa autorizada com cota premiada só
     * publica com a declaração. Entra por `PUT /campaigns/:id/legal` e trava
     * ao publicar, como a autorização.
     */
    declaraValeBrinde: boolean("declara_vale_brinde").notNull().default(false),
    /**
     * Mínimo de cotas vendidas (percentual do total) para o sorteio acontecer,
     * pela autorização. 0 = sem mínimo. Entra por `salvarDadosLegais()` e
     * trava ao publicar; o sorteio recusa (409) abaixo dele.
     */
    minimoVendidoPct: integer("minimo_vendido_pct").notNull().default(0),
    /**
     * Como a rifa chega ao sorteio (`MODOS_DO_SORTEIO` em
     * `shared/campanhaLegal.ts`): na data, cheia com data, quando completar
     * ou a promotora fica com as não vendidas. Dado legal: trava ao publicar.
     */
    modoSorteio: text("modo_sorteio").notNull().default("data"),
    /**
     * Como o número contemplado sai do resultado (`METODOS_DE_APURACAO` em
     * `shared/apuracao.ts`): `federal_direta` (a leitura direta dos 5 prêmios
     * da Loteria Federal, numeração a partir de zero) ou `globo` (o globo da
     * plataforma, numa sessão do calendário com ata notarial; a plataforma o
     * liga depois da homologação). A promotora escolhe entre os
     * que a plataforma liberou, pela autorização que tem; trava ao publicar.
     * Nulo é a rifa de antes, apurada pela semente (hash + HMAC) — só para
     * conferir o que já foi sorteado assim.
     */
    metodoApuracao: text("metodo_apuracao"),
    /**
     * Como a plataforma cobra por esta rifa (`MODOS_DE_COBRANCA` em
     * `shared/cobranca.ts`): percentual sobre a venda ou valor fixo por cota
     * comprada. A organização escolhe no rascunho; trava ao publicar.
     */
    cobrancaModo: text("cobranca_modo").notNull().default("percentual"),
    /**
     * A tabela de cobrança fotografada na publicação (`cobrancaNaPublicacao()`):
     * o modo, o percentual, o valor por cota e as faixas da taxa Pix daquele
     * dia. Mudar a tabela da plataforma depois não mexe em rifa publicada.
     * Nulo: rascunho, ou rifa publicada antes da cobrança por rifa (não cobra).
     */
    cobranca: jsonb("cobranca").$type<import("./cobranca").CobrancaDaRifa>(),
    /**
     * Rifa de demonstração (perfil de exemplo): aparece na vitrine com a
     * marca "Demonstração" e nunca vende — `createOrder` recusa.
     */
    demonstracao: boolean("demonstracao").notNull().default(false),
    /**
     * Quantas vezes o sorteio foi adiado (pedido aprovado pela plataforma) e
     * a data que valia antes do primeiro adiamento — a página da rifa mostra
     * as duas, para ninguém descobrir o adiamento só no dia.
     */
    adiamentos: integer("adiamentos").notNull().default(0),
    /** Comentários visíveis na publicação — contador, nunca `COUNT(*)`. */
    comentariosCount: integer("comentarios_count").notNull().default(0),
    /**
     * A publicação, como no Instagram (`shared/publicacao.ts`): a legenda da
     * organização (muda a qualquer hora, fora do `PATCH`, pela régua do
     * comentário) e os contadores da barra de ações — cada um anda na mesma
     * transação que grava ou apaga a linha, nunca `COUNT(*)`.
     */
    legenda: text("legenda"),
    curtidasCount: integer("curtidas_count").notNull().default(0),
    republicacoesCount: integer("republicacoes_count").notNull().default(0),
    compartilhamentosCount: integer("compartilhamentos_count").notNull().default(0),
    /**
     * Travada pela plataforma (denúncia procedente, organização banida):
     * `createOrder` recusa, a vitrine esconde e a página avisa.
     */
    travadaEm: timestamp("travada_em"),
    travadaMotivo: text("travada_motivo"),
    drawAtOriginal: timestamp("draw_at_original"),
    /**
     * A data máxima do sorteio no modo "quando completar" (resposta 8.7 do
     * advogado): a data fixa registrada na SPA/MF, gravada ao publicar a
     * partir de `draw_at`. Encheu antes, `draw_at` é antecipado para a
     * próxima extração da Federal; o estorno que tira a rifa de cheia devolve
     * `draw_at` a ela. O adiamento aprovado move as duas.
     */
    drawAtMaximo: timestamp("draw_at_maximo"),
    /**
     * Publicação agendada do rascunho: na hora, o relógio chama a mesma
     * `publishCampaign()` (confere tudo de novo e trava total, autorização e
     * semente ali). Rota própria (`agendarPublicacao`), fora do `PATCH`.
     */
    publicarEm: timestamp("publicar_em"),
    /** Quem agendou (vai à auditoria da publicação feita pelo relógio). */
    publicarAgendadoPor: uuid("publicar_agendado_por"),
    /** Por que a publicação agendada não aconteceu (o painel mostra; some ao agendar de novo ou publicar). */
    publicacaoAgendadaFalha: text("publicacao_agendada_falha"),
    /** Link da live ou do vídeo do sorteio. Muda a qualquer hora (só https). */
    transmissaoUrl: text("transmissao_url"),
    authorizationFileKey: text("authorization_file_key"),
    status: campaignStatus("status").notNull().default("draft"),
    commissionPctDefault: integer("commission_pct_default").notNull().default(10),
    /**
     * O termo de adesão de afiliado em vigor quando a rifa foi publicada
     * (`organizacao_termos`). Fotografado na publicação e fixo até o sorteio:
     * a comissão das vendas desta rifa sai dele, e só ganha quem aceitou esta
     * versão. Nulo: a organização não tinha termo.
     */
    termoId: uuid("termo_id"),
    /**
     * A versão do contrato da plataforma com a promotora em vigor quando a rifa
     * foi publicada (`publishCampaign`). A rifa fica ligada a ela até o fim,
     * mesmo que saia versão nova. Nulo: publicada sem contrato em vigor.
     */
    contratoPromotoraId: uuid("contrato_promotora_id"),
    /**
     * Os anexos do contrato (por modalidade) em vigor e aceitos quando a rifa
     * foi publicada — ou depois, quando a modalidade entrou com a rifa no ar
     * (entidade beneficiada, cota premiada). Vazio: nenhum anexo valia.
     */
    contratoAnexoIds: uuid("contrato_anexo_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /**
     * O sorteio oficial da plataforma em que a rifa está integrada
     * (`sorteios_oficiais`): a data da rifa é a do concurso. Escolhido pelo
     * calendário do painel só no rascunho e trava ao publicar; fora do PATCH.
     */
    sorteioOficialId: uuid("sorteio_oficial_id").references(() => sorteiosOficiais.id, { onDelete: "restrict" }),
    /**
     * Rifa integrada cujo sorteio automático (pelo resultado oficial) não
     * pôde rodar: o motivo (mínimo não atingido, reserva esperando Pix) e
     * quando foi a última tentativa. Some quando o sorteio sai.
     */
    sorteioAutoMotivo: text("sorteio_auto_motivo"),
    sorteioAutoEm: timestamp("sorteio_auto_em"),
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
    // A fileira das rifas de um sorteio oficial (tela do sorteio no celular).
    index("idx_campaigns_sorteio_oficial").on(t.sorteioOficialId),
    // A busca por texto (Buscar): título e prêmio, sem acento.
    index(trgm("idx_campaigns_titulo")).using("gin", trigramaSemAcento(t.title)),
    index(trgm("idx_campaigns_premio")).using("gin", trigramaSemAcento(t.prizeTitle)),
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
    /**
     * O vídeo guardado no Cloudflare Stream para tocar em HLS (entrega
     * ligada): o `uid` (para apagar) e o endereço do HLS conferido por
     * `hlsDoStream()`. Nulos sem entrega — a tela toca o original.
     */
    streamUid: text("stream_uid"),
    streamHls: text("stream_hls"),
    /**
     * O vídeo do Stream foi marcado `requireSignedURLs`: só toca com token
     * (`hlsParaATela()`). Marcado no envio, ou pelo relógio nos de antes.
     */
    streamAssinado: boolean("stream_assinado").notNull().default(false),
    /** Variantes responsivas geradas na ingestão (AVIF/WebP em 400/800/1600). */
    variants: jsonb("variants").$type<
      { width: number; format: "avif" | "webp"; key: string; bytes: number }[]
    >(),
    /** Miniatura de 20 px embutida, exibida borrada enquanto a foto carrega. */
    lqip: text("lqip"),
    altText: text("alt_text"),
    /** A legenda do vídeo do Reels (só `reels`; a da rifa é `campaigns.legenda`). */
    legenda: text("legenda"),
    /**
     * As figurinhas do vídeo do Reels (só `reels`): a mesma régua das do story
     * (`validarFigurinhas()`), sempre com rifa — a do próprio vídeo.
     */
    figurinhas: jsonb("figurinhas").$type<Figurinha[]>().notNull().default([]),
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
  /**
   * Cotas de bônus (grátis) já resgatadas. Anda na transação do resgate, com
   * o teto de `campaigns.bonus_max_cotas` no próprio `UPDATE`. Estão dentro
   * de `sold_count`; o mínimo para sortear conta só as pagas (sold − bônus).
   */
  bonusCount: integer("bonus_count").notNull().default(0),
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
    /**
     * A comissão desta venda fica com a plataforma até o sorteio (etapa 12,
     * `guardaComissao`). Decidido na criação do pedido, junto com o split do
     * Pix — desligar a chave depois não muda o contrato desta venda.
     */
    comissaoGuardada: boolean("comissao_guardada").notNull().default(false),
    /**
     * Anúncio patrocinado que trouxe esta venda (etapa 15): o mesmo aparelho
     * clicou nele, nesta rifa, até 7 dias antes. Estatística do patrocínio.
     */
    anuncioId: uuid("anuncio_id"),
    /**
     * De onde a pessoa chegou à rifa (vitrine, perfil, story, banner,
     * estado, anúncio). Vem do navegador: é só estatística do painel de
     * resultados (`shared/resultados.ts`), nunca decide dinheiro.
     */
    origem: text("origem"),
    /** UTM e identificador de clique do anúncio (etapa 16). Estatística, como a origem. */
    utm: jsonb("utm").$type<import("./marketing").Utm>(),
    /**
     * O comprador tinha aceitado os cookies de marketing no aparelho quando
     * comprou. Sem isto, a compra não vai pelo servidor para nenhuma
     * plataforma de anúncio (LGPD).
     */
    marketingConsentimento: boolean("marketing_consentimento").notNull().default(false),
    /**
     * Pedido que saiu do carrinho, num Pix só com os das outras rifas
     * (`carrinho_pedidos`). A cobrança (`psp_charge_id`, QR) é a mesma em
     * todos eles; o valor de cada um continua sendo o do pedido.
     */
    carrinhoId: uuid("carrinho_id").references(() => carrinhoPedidos.id),
    /**
     * O presente (`shared/presente.ts`): a parte da compra que a plataforma
     * pagou. O comprador pagou `amount_cents`; o rateio corre sobre a soma.
     */
    presenteCents: integer("presente_cents").notNull().default(0),
    /** Quem mandou o presente (o comprador dono do link de indicação). */
    presenteDe: uuid("presente_de"),
    pspProvider: text("psp_provider"),
    pspChargeId: text("psp_charge_id"),
    /**
     * O Pix deste pedido foi dividido na origem (split do Asaas para a
     * carteira da promotora): a taxa da plataforma já ficou retida, e o
     * lançamento em `platform_charges` nasce `retida`, nunca `aberta`.
     * Decidido quando o Pix é gerado — a carteira cadastrada depois não
     * muda o Pix que já saiu.
     */
    taxaRetidaNoSplit: boolean("taxa_retida_no_split").notNull().default(false),
    /**
     * A taxa da plataforma fotografada quando o pedido nasce (`taxaDoPedido()`
     * em `shared/cobranca.ts`): o modo da rifa, o percentual da venda e o da
     * taxa Pix em pontos-base (1% = 100), e o valor por cota. A faixa do Pix
     * é a do volume do mês da organização naquele instante; o que o contador
     * fizer depois não muda o pedido.
     */
    taxaModo: text("taxa_modo").notNull().default("percentual"),
    taxaVendaBp: integer("taxa_venda_bp").notNull().default(0),
    taxaPorCotaCents: integer("taxa_por_cota_cents").notNull().default(0),
    taxaPixBp: integer("taxa_pix_bp").notNull().default(0),
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
    index("idx_orders_carrinho").on(t.carrinhoId),
    // Um presente por pessoa: o pedido vencido sai do índice e libera outro.
    uniqueIndex("uq_presente_por_comprador")
      .on(t.buyerId)
      .where(sql`${t.presenteCents} > 0 and ${t.status} in ('pending', 'paid', 'refunded')`),
    index("idx_orders_charge").on(t.pspChargeId),
  ],
);

/**
 * O carrinho pago num Pix só: uma cobrança na conta da plataforma com o
 * total de várias rifas, de uma ou mais organizações, e o split do Asaas
 * mandando a parte de cada promotora para a carteira dela no mesmo Pix
 * (`splitDoCarrinho()` em `shared/carrinho.ts`). Cada rifa continua sendo
 * um pedido (`orders.carrinho_id`) — bilhete, comissão, taxa, estorno e
 * sorteio seguem pedido a pedido.
 */
export const carrinhoPedidos = pgTable(
  "carrinho_pedidos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Sorteado na faixa de 9 dígitos abaixo da recarga do patrocínio. */
    codigo: integer("codigo").notNull(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id),
    totalCents: integer("total_cents").notNull(),
    pspProvider: text("psp_provider"),
    pspChargeId: text("psp_charge_id"),
    pixQr: text("pix_qr"),
    pixCopyPaste: text("pix_copy_paste"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_carrinho_codigo").on(t.codigo), index("idx_carrinho_buyer").on(t.buyerId)],
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
    /**
     * A organização que dá o desconto. Cupom de uma organização não vale na
     * rifa de outra (o desconto sairia do bolso de quem não o criou).
     */
    organizationId: uuid("organization_id").references(() => organizations.id),
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
    /** Guardada pela plataforma (copiado do pedido): quem paga o saque é ela. */
    guardada: boolean("guardada").notNull().default(false),
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
  /** O bruto: a soma das comissões e o valor da nota fiscal. */
  amountCents: integer("amount_cents").notNull(),
  /**
   * IRRF retido no saque (empresa do Lucro Presumido ou Real, 1,5%,
   * `irrfDoSaque`), decidido ao pedir o saque. Quem paga transfere
   * `amountCents - irrfCents` e recolhe isto no DARF. Zero para MEI e Simples.
   */
  irrfCents: integer("irrf_cents").notNull().default(0),
  pixKey: text("pix_key").notNull(),
  /**
   * Quem paga este saque: a organização das rifas das comissões dele. O
   * afiliado é de várias organizações, e cada uma paga só o que é dela.
   */
  organizationId: uuid("organization_id").references(() => organizations.id),
  status: payoutStatus("status").notNull().default("requested"),
  receiptUrl: text("receipt_url"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
});

/**
 * A nota fiscal de cada saque (o saque só sai para MEI ou empresa: a nota é
 * o documento do pagamento, sem RPA; a nota é do valor bruto). Cifrada no cofre, como os
 * documentos fiscais; uma por saque, gravada na transação que cria o saque.
 */
export const saqueNotas = pgTable("saque_notas", {
  payoutId: uuid("payout_id")
    .primaryKey()
    .references(() => payouts.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  tamanho: integer("tamanho").notNull(),
  dados: bytea("dados").notNull(),
  iv: bytea("iv").notNull(),
  tag: bytea("tag").notNull(),
  chaveVersao: text("chave_versao").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  /**
   * O resultado oficial usado como entropia: os 5 prêmios da Federal, na
   * ordem, ou as dezenas da loteria do sorteio oficial (`loteria`).
   */
  federalPrizes: jsonb("federal_prizes").$type<string[]>(),
  /** A loteria do resultado (`entropiaDoSorteio`); nulo é a Federal. */
  loteria: text("loteria"),
  seed: text("seed").notNull(),
  seedHash: text("seed_hash").notNull(),
  resultNumber: integer("result_number"),
  /**
   * O número contemplado: o sorteado, se foi vendido e pago, ou o mais
   * próximo pela regra da aproximação (`contempladoPorAproximacao`). Nulo
   * só se nenhuma cota foi paga.
   */
  winnerNumber: integer("winner_number"),
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
 * O que cada organização deve à plataforma: uma linha por venda paga, com a
 * taxa da venda (percentual ou por cota, o que a rifa escolheu) e a taxa do
 * Pix juntas (`shared/cobranca.ts`). Não existe mensalidade.
 *
 * O índice único do pedido é o que impede cobrança dobrada: o webhook chamado
 * duas vezes não lança a taxa de novo.
 */
export const platformCharges = pgTable(
  "platform_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: chargeKind("kind").notNull(),
    /** O pedido da venda. */
    orderId: uuid("order_id"),
    /** A taxa inteira: a da venda mais a do Pix. */
    amountCents: integer("amount_cents").notNull(),
    /** A parte da venda (percentual ou por cota) e a do Pix, para o extrato. */
    vendaCents: integer("venda_cents").notNull().default(0),
    pixCents: integer("pix_cents").notNull().default(0),
    /** O modo da rifa no pedido (`percentual` ou `por_cota`). */
    modo: text("modo"),
    /** O percentual da venda em pontos-base (1% = 100), no modo percentual. */
    pct: integer("pct"),
    status: chargeStatus("status").notNull().default("aberta"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    paidAt: timestamp("paid_at"),
  },
  (t) => [
    uniqueIndex("uq_charge_order").on(t.orderId),
    index("idx_charges_org").on(t.organizationId, t.status),
  ],
);

/**
 * Quantas transações Pix pagas a organização teve no mês (de São Paulo,
 * `mesEmSaoPaulo()`): é o volume que escolhe a faixa da taxa Pix
 * (`faixaPixPara()`). Anda de 1 em 1, num `INSERT … ON CONFLICT DO UPDATE`
 * na mesma transação que confirma o pagamento — nunca `COUNT(*)`. O pedido
 * fotografa a faixa quando nasce; o estorno não desconta (a transação
 * aconteceu).
 */
export const pixVolumeMensal = pgTable(
  "pix_volume_mensal",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** `aaaa-mm`, no fuso de São Paulo. */
    mes: text("mes").notNull(),
    transacoes: integer("transacoes").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.mes] })],
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
 * Mudança em rifa publicada: edição e adiamento, analisados pela plataforma
 * ------------------------------------------------------------------ */

export const solicitacaoTipo = pgEnum("solicitacao_tipo", ["edicao", "adiamento", "remover_comentario"]);
export const solicitacaoStatus = pgEnum("solicitacao_status", [
  "em_analise",
  "aprovada",
  "recusada",
  "cancelada",
]);

/**
 * Pedido da organização para mudar uma rifa já publicada. Nada muda na rifa
 * até a plataforma aprovar; a aprovação aplica exatamente o que foi pedido
 * (`alteracoes` guarda o antes e o depois de cada campo). Um em análise por
 * rifa e tipo — o índice parcial decide, não um `SELECT` antes.
 */
export const campanhaSolicitacoes = pgTable(
  "campanha_solicitacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `RS-XXXXXX`: o número que as duas pontas usam para falar do pedido. */
    protocolo: text("protocolo").notNull(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    tipo: solicitacaoTipo("tipo").notNull(),
    status: solicitacaoStatus("status").notNull().default("em_analise"),
    /** Edição: `{ campo: { de, para } }`. */
    alteracoes: jsonb("alteracoes"),
    /** Adiamento: a data que valia no pedido e a pedida. */
    drawAtAtual: timestamp("draw_at_atual"),
    drawAtNovo: timestamp("draw_at_novo"),
    /**
     * Adiamento para um sorteio oficial do calendário: a rifa passa a
     * integrar este sorteio, e a data nova é a dele.
     */
    sorteioOficialNovoId: uuid("sorteio_oficial_novo_id").references(() => sorteiosOficiais.id, { onDelete: "restrict" }),
    /**
     * Remoção de comentário pedida pela organização. Comentário pode ser
     * denúncia contra ela mesma — por isso ela pede e a plataforma decide.
     */
    comentarioId: uuid("comentario_id"),
    motivo: text("motivo"),
    /** Resposta da plataforma (obrigatória na recusa). */
    decisao: text("decisao"),
    criadoPor: uuid("criado_por"),
    decididoPor: uuid("decidido_por"),
    decididoEm: timestamp("decidido_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_solicitacao_protocolo").on(t.protocolo),
    // Nome novo quando o filtro mudou: `db:push` não troca o filtro de um
    // índice existente. Edição e adiamento: um em análise por rifa e tipo;
    // remoção de comentário: um em análise por comentário.
    uniqueIndex("uq_solicitacao_rifa_em_analise")
      .on(t.campaignId, t.tipo)
      .where(sql`status = 'em_analise' and tipo <> 'remover_comentario'`),
    uniqueIndex("uq_solicitacao_comentario_em_analise")
      .on(t.comentarioId)
      .where(sql`status = 'em_analise'`),
    index("idx_solicitacoes_org").on(t.organizationId, t.status),
  ],
);

export const campanhaSolicitacaoMensagens = pgTable(
  "campanha_solicitacao_mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    solicitacaoId: uuid("solicitacao_id")
      .notNull()
      .references(() => campanhaSolicitacoes.id, { onDelete: "cascade" }),
    /** `organizacao` ou `plataforma` — a pessoa fica em `userId` e na auditoria. */
    autor: text("autor").notNull(),
    userId: uuid("user_id"),
    texto: text("texto").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_solicitacao_mensagens").on(t.solicitacaoId, t.createdAt)],
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
    /**
     * Disputa com a plataforma (`shared/chamados.ts`): nula, `aberta`,
     * `procedente` ou `improcedente`. Uma por chamado; a decisão é do
     * administrador geral e encerra.
     */
    disputa: text("disputa"),
    disputaMotivo: text("disputa_motivo"),
    disputaAbertaEm: timestamp("disputa_aberta_em"),
    disputaDecisao: text("disputa_decisao"),
    disputaDecididaEm: timestamp("disputa_decidida_em"),
    disputaDecididaPor: uuid("disputa_decidida_por"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_chamados_protocolo").on(t.protocolo),
    // Em andamento também é o recusado em disputa: senão um chamado novo
    // para o mesmo pedido correria em paralelo com a decisão da plataforma.
    // (Nome novo de propósito: o `db:push` não troca o filtro de um índice
    // existente, mas apaga o antigo e cria este.)
    uniqueIndex("uq_chamados_pedido_em_andamento")
      .on(t.orderId)
      .where(sql`status in ('aberto', 'aprovado') or disputa = 'aberta'`),
    index("idx_chamados_org").on(t.organizationId, t.status, t.createdAt),
    index("idx_chamados_disputa").on(t.disputa, t.disputaAbertaEm),
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

/** Foto do perfil do apostador: no banco, reprocessada (320 px, WebP, sem metadados). */
export const compradorFotos = pgTable("comprador_fotos", {
  buyerId: uuid("buyer_id")
    .primaryKey()
    .references(() => buyers.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Foto do perfil do afiliado — a que se compara com o documento na verificação. */
export const afiliadoFotos = pgTable("afiliado_fotos", {
  affiliateId: uuid("affiliate_id")
    .primaryKey()
    .references(() => affiliates.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * A entidade beneficiada pela rifa (ONG, fundação, outra organização) e o
 * banner dela em cima da rifa: só existe quando o organizador destina a rifa
 * a alguém. Tocado, o banner abre a tela da entidade (imagem grande, texto,
 * site e redes). Muda a qualquer hora. Uma por rifa; sem ela, nada aparece.
 * As imagens saem de um envio só, reprocessadas em WebP: o banner 1200×400
 * (corte ao centro) e a grande até 1200 px de lado, inteira.
 */
export const campaignBannersDivulgacao = pgTable("campaign_banners_divulgacao", {
  campaignId: uuid("campaign_id")
    .primaryKey()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  /** O nome da entidade — também o texto alternativo do banner. */
  nome: text("nome").notNull(),
  /** O que a entidade diz de si e o que já fez. */
  texto: text("texto").notNull(),
  site: text("site"),
  redes: jsonb("redes").$type<{ rede: string; link: string }[]>().notNull().default([]),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  bytesGrande: bytea("bytes_grande").notNull(),
  /**
   * O CNPJ da entidade e a conferência dos documentos dela pela plataforma
   * (resposta 2.5 do advogado): a entidade só aparece na rifa com
   * `documentos_status = 'aprovado'`. Trocar nome, CNPJ ou documento volta à
   * análise; `documentos_enviados_em` é a versão que a plataforma decide.
   */
  cnpj: text("cnpj"),
  documentosStatus: text("documentos_status").notNull().default("pendente"),
  documentosEnviadosEm: timestamp("documentos_enviados_em"),
  documentosMotivo: text("documentos_motivo"),
  documentosDecididoEm: timestamp("documentos_decidido_em"),
  documentosDecididoPor: uuid("documentos_decidido_por"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Os documentos da entidade beneficiada (CNPJ ativo, ata da diretoria,
 * certidão de regularidade fiscal e, se tiver, o CEBAS), cifrados no cofre
 * como os do cadastro fiscal. Só a plataforma os abre, com a auditoria
 * antes. Saem com a entidade (cascata da rifa e `removerBannerDeDivulgacao`).
 */
export const entidadeDocumentos = pgTable(
  "entidade_documentos",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    mime: text("mime").notNull(),
    tamanho: integer("tamanho").notNull(),
    dados: bytea("dados").notNull(),
    iv: bytea("iv").notNull(),
    tag: bytea("tag").notNull(),
    chaveVersao: text("chave_versao").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_entidade_documento_tipo").on(t.campaignId, t.tipo)],
);

/**
 * Sócios e diretores da organização (resposta 5.6 do advogado): não
 * concorrem nas rifas autorizadas dela. O CPF nunca fica em claro — só a
 * impressão (HMAC do cofre, para recusar a compra) e os dois últimos
 * dígitos (para a tela). O mesmo CPF não entra duas vezes na mesma
 * organização: quem decide é o índice.
 */
export const organizacaoSocios = pgTable(
  "organizacao_socios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    cargo: text("cargo").notNull(),
    cpfImpressao: text("cpf_impressao").notNull(),
    cpfFinal: text("cpf_final").notNull(),
    criadoPor: uuid("criado_por"),
    criadoEm: timestamp("criado_em").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_socio_cpf_por_org").on(t.organizationId, t.cpfImpressao),
    index("ix_socios_cpf").on(t.cpfImpressao),
  ],
);

/**
 * Capa do perfil da organização. Mesma regra da foto: no banco, reprocessada
 * (1500×500, WebP, sem metadados) — o arquivo enviado nunca é servido como
 * veio.
 */
export const organizacaoCapas = pgTable("organizacao_capas", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Endereço curto (`/c/<codigo>`): um por perfil e um por rifa, criado na
 * primeira vez que o painel pede. Os índices parciais decidem "um por
 * destino"; o `codigo` único decide colisão — nunca um `SELECT` antes.
 * `cliques` anda num `UPDATE` a cada acesso de gente (robô não conta).
 */
export const linksCurtos = pgTable(
  "links_curtos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codigo: text("codigo").notNull(),
    tipo: text("tipo").notNull(), // 'perfil' | 'rifa'
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    cliques: integer("cliques").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_link_curto_codigo").on(t.codigo),
    uniqueIndex("uq_link_curto_perfil").on(t.organizationId).where(sql`tipo = 'perfil'`),
    uniqueIndex("uq_link_curto_rifa").on(t.campaignId).where(sql`tipo = 'rifa'`),
  ],
);

/**
 * Cliques nos links do perfil (redes sociais e contato), por dia de São
 * Paulo. Chave (organização, link, dia): o clique é `INSERT … ON CONFLICT
 * DO UPDATE cliques + 1` — sem `COUNT(*)` no painel.
 */
export const perfilLinkCliques = pgTable(
  "perfil_link_cliques",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    dia: text("dia").notNull(), // AAAA-MM-DD em São Paulo
    cliques: integer("cliques").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.url, t.dia] })],
);

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

/**
 * Comentários na publicação da rifa: o apostador (com conta) comenta, a
 * organização dona da rifa responde e modera. Uma camada de resposta
 * (`parentId` aponta sempre para o comentário do topo). Apagar é marcar
 * (`removidoEm`): some da tela e do contador, fica para a auditoria.
 */
export const comentarios = pgTable(
  "comentarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    /** A dona da rifa, copiada para o recorte da moderação. */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    parentId: uuid("parent_id"),
    /** `comprador` ou `organizacao`. */
    autor: text("autor").notNull(),
    buyerId: uuid("buyer_id").references(() => buyers.id, { onDelete: "set null" }),
    userId: uuid("user_id"),
    texto: text("texto").notNull(),
    /** Curtidas — contador na mesma transação de `comentario_curtidas`. */
    curtidas: integer("curtidas").notNull().default(0),
    removidoEm: timestamp("removido_em"),
    removidoPor: uuid("removido_por"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_comentarios_rifa").on(t.campaignId, t.createdAt),
    index("idx_comentarios_parent").on(t.parentId),
  ],
);

/**
 * Comentários do sorteio oficial da plataforma (a tela do sorteio no
 * celular). Só apostador com conta e apelido escreve; quem não tem conta lê.
 * As mesmas regras dos comentários da rifa (`shared/comentarios.ts`), sem
 * organização dona: quem modera é a plataforma.
 */
export const sorteioComentarios = pgTable(
  "sorteio_comentarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sorteioOficialId: uuid("sorteio_oficial_id")
      .notNull()
      .references(() => sorteiosOficiais.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    buyerId: uuid("buyer_id").references(() => buyers.id, { onDelete: "set null" }),
    texto: text("texto").notNull(),
    curtidas: integer("curtidas").notNull().default(0),
    removidoEm: timestamp("removido_em"),
    removidoPor: uuid("removido_por"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_sorteio_comentarios").on(t.sorteioOficialId, t.createdAt),
    index("idx_sorteio_comentarios_parent").on(t.parentId),
  ],
);

/** Uma curtida por pessoa e comentário do sorteio: a chave decide. */
export const sorteioComentarioCurtidas = pgTable(
  "sorteio_comentario_curtidas",
  {
    comentarioId: uuid("comentario_id")
      .notNull()
      .references(() => sorteioComentarios.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.comentarioId, t.buyerId] })],
);

/**
 * Denúncia de comentário do sorteio oficial. Não há organização dona: só a
 * plataforma vê e decide. O `trecho` é o comentário (e, se for resposta, o de
 * cima) gravado na hora — quem escreveu pode apagar depois, a prova fica.
 * Uma aberta por comentário e pessoa (`uq_sorteio_denuncia_aberta`).
 */
export const sorteioComentarioDenuncias = pgTable(
  "sorteio_comentario_denuncias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolo: text("protocolo").notNull(),
    comentarioId: uuid("comentario_id")
      .notNull()
      .references(() => sorteioComentarios.id, { onDelete: "cascade" }),
    sorteioOficialId: uuid("sorteio_oficial_id")
      .notNull()
      .references(() => sorteiosOficiais.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    motivo: text("motivo").notNull(),
    texto: text("texto"),
    trecho: jsonb("trecho").$type<{ de: string; texto: string; em: string; denunciado: boolean }[]>().notNull(),
    status: text("status").notNull().default("aberta"),
    decisao: text("decisao"),
    decididaPor: uuid("decidida_por"),
    decididaEm: timestamp("decidida_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_sorteio_denuncia_protocolo").on(t.protocolo),
    uniqueIndex("uq_sorteio_denuncia_aberta").on(t.comentarioId, t.buyerId).where(sql`status = 'aberta'`),
    index("idx_sorteio_denuncias_status").on(t.status, t.createdAt),
  ],
);

/** Uma curtida por pessoa e comentário: a chave decide, não um `SELECT` antes. */
export const comentarioCurtidas = pgTable(
  "comentario_curtidas",
  {
    comentarioId: uuid("comentario_id")
      .notNull()
      .references(() => comentarios.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.comentarioId, t.buyerId] })],
);

/**
 * A barra de ações da publicação. Cada uma é a chave (rifa, pessoa):
 * `ON CONFLICT DO NOTHING`, e o contador da rifa só anda quando a linha
 * entrou ou saiu, na mesma transação. Salvar não tem contador (é privado,
 * como no Instagram); republicar aparece no perfil `/u/<apelido>`.
 */
function acaoDaPublicacao(nome: string) {
  return pgTable(
    nome,
    {
      campaignId: uuid("campaign_id")
        .notNull()
        .references(() => campaigns.id, { onDelete: "cascade" }),
      buyerId: uuid("buyer_id")
        .notNull()
        .references(() => buyers.id, { onDelete: "cascade" }),
      createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.campaignId, t.buyerId] }), index(`idx_${nome}_buyer`).on(t.buyerId, t.createdAt)],
  );
}
export const publicacaoCurtidas = acaoDaPublicacao("publicacao_curtidas");
export const publicacaoRepublicacoes = acaoDaPublicacao("publicacao_republicacoes");
export const publicacaoSalvos = acaoDaPublicacao("publicacao_salvos");

/**
 * Compartilhar conta uma vez por pessoa (ou aparelho, em hash) e rifa — o
 * contador é vitrine, e clicar dez vezes não pode virar dez.
 */
export const publicacaoCompartilhamentos = pgTable(
  "publicacao_compartilhamentos",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    quem: text("quem").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.quem] })],
);

export const denunciaStatus = pgEnum("denuncia_status", [
  "aberta",
  "improcedente",
  "rifa_travada",
  "organizacao_banida",
]);

/**
 * Denúncia contra organização, rifa ou comentário. Vem do apostador (com
 * conta) ou é automática (texto do próprio organizador pedindo pagamento
 * por fora). Só a plataforma vê e decide — a organização denunciada nunca.
 */
export const denuncias = pgTable(
  "denuncias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolo: text("protocolo").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    comentarioId: uuid("comentario_id"),
    /** `apostador` ou `automatica`. */
    origem: text("origem").notNull(),
    buyerId: uuid("buyer_id").references(() => buyers.id, { onDelete: "set null" }),
    motivo: text("motivo").notNull(),
    texto: text("texto"),
    /** Automática: o trecho que acendeu e onde estava. */
    evidencia: text("evidencia"),
    status: denunciaStatus("status").notNull().default("aberta"),
    decisao: text("decisao"),
    decididaPor: uuid("decidida_por"),
    decididaEm: timestamp("decidida_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_denuncia_protocolo").on(t.protocolo),
    // Uma aberta por pessoa e organização: insistir não empilha denúncia.
    uniqueIndex("uq_denuncia_aberta_por_pessoa")
      .on(t.buyerId, t.organizationId)
      .where(sql`status = 'aberta' and buyer_id is not null`),
    index("idx_denuncias_status").on(t.status, t.createdAt),
  ],
);

/**
 * A central de avisos do apostador (o coração no topo, como no Instagram).
 * Todo aviso que sai por push também fica aqui — inclusive para quem não
 * ligou o push. A chave é a mesma do `push_envios`: uma linha por pessoa e
 * aviso, nunca repetida. O relógio apaga o que passou de 90 dias.
 */
export const notificacoes = pgTable(
  "notificacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    chave: text("chave").notNull(),
    titulo: text("titulo").notNull(),
    corpo: text("corpo").notNull(),
    /** Caminho interno aberto ao tocar. */
    url: text("url").notNull(),
    lidaEm: timestamp("lida_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_notificacao_chave").on(t.buyerId, t.chave),
    index("idx_notificacoes_buyer").on(t.buyerId, t.createdAt),
  ],
);

/**
 * Cada publicação do template da plataforma é uma linha nova — nada é
 * sobrescrito. A que vale é a mais recente; "voltar" publica de novo o
 * conteúdo de uma antiga, e o histórico continua linear.
 */
export const templateVersoes = pgTable("template_versoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  conteudo: jsonb("conteudo").notNull(),
  publicadoPor: uuid("publicado_por").references(() => users.id, { onDelete: "set null" }),
  /** De qual versão veio, quando é uma restauração. */
  restauradaDe: uuid("restaurada_de"),
  publicadoEm: timestamp("publicado_em").notNull().defaultNow(),
});

/** Arquivos da marca da plataforma (a logo): no banco, pequenos e reprocessados. */
export const plataformaArquivos = pgTable("plataforma_arquivos", {
  chave: text("chave").primaryKey(),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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

/**
 * O arquivo da ata notarial da sessão do globo (PDF ou foto do cartório),
 * conferido pelo conteúdo como o certificado da rifa. No banco; público só
 * depois do resultado lançado.
 */
export const sorteioAtas = pgTable("sorteio_atas", {
  sorteioOficialId: uuid("sorteio_oficial_id")
    .primaryKey()
    .references(() => sorteiosOficiais.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  nome: text("nome").notNull(),
  bytes: bytea("bytes").notNull(),
  tamanho: integer("tamanho").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * 9.5 do advogado: no globo não há aproximação. A extração da sessão que dá
 * número não distribuído é "Sorteio inválido – cota não vendida", e no mesmo
 * ato o globo é girado de novo para aquela rifa, tantas vezes quantas forem
 * precisas. Cada nova extração é uma linha (a 1ª é a da própria sessão, em
 * `sorteios_oficiais.resultado`); a última é a que vale. O índice do par
 * (rifa, ordem) decide a vez — nunca um `SELECT` antes.
 */
export const sorteioReextracoes = pgTable(
  "sorteio_reextracoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sorteioOficialId: uuid("sorteio_oficial_id")
      .notNull()
      .references(() => sorteiosOficiais.id, { onDelete: "cascade" }),
    /** 2 para a primeira nova extração, 3 para a seguinte… (a 1ª é a da sessão). */
    ordem: integer("ordem").notNull(),
    /** As 6 bolas, uma por globo, na ordem. */
    bolas: text("bolas").array().notNull(),
    /** A hora em que saiu cada bola (HH:MM:SS), para a ata. */
    horas: text("horas").array().notNull(),
    /** O número lido (interno, 1 ao total), como `draws.result_number`. */
    numero: integer("numero").notNull(),
    criadoPor: uuid("criado_por"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_reextracao_ordem").on(t.campaignId, t.ordem)],
);

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
/** Vídeo até 15 min (até 3 min é reels) — `shared/publicacao.ts`. */
export const MAX_VIDEO_SECONDS = 900;
/** Fotos: o carrossel inteiro (banner + fotos + vídeos) vai até 10 peças. */
export const MAX_PHOTOS = 9;

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
  // Como a plataforma cobra por esta rifa: só os modos conhecidos.
  cobrancaModo: z.enum(MODOS_DE_COBRANCA).optional(),
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
    regulamentoExtra: true,
    // Cota de bônus é cláusula do regulamento: só por PUT /legal (etapa 13).
    aceitaCotaBonus: true,
    bonusMaxCotas: true,
    // A declaração do vale-brinde é dado legal: só pela rota `/legal`.
    declaraValeBrinde: true,
    // O mínimo para sortear é dado legal: só pela rota `/legal`, que trava ao publicar.
    minimoVendidoPct: true,
    modoSorteio: true,
    // O método de apuração é da autorização: só pela rota `/legal`, entre os liberados pela plataforma.
    metodoApuracao: true,
    termoId: true,
    contratoPromotoraId: true,
    contratoAnexoIds: true,
    // Integrar a um sorteio oficial é pelo calendário (`integrarAoSorteioOficial`), que acerta a data junto.
    sorteioOficialId: true,
    sorteioAutoMotivo: true,
    sorteioAutoEm: true,
    transmissaoUrl: true,
    // Rifa de teste tem rota própria (`marcarDemonstracao`), que confere
    // venda e autorização; pelo formulário genérico, desmarcar faria a
    // demonstração vender sem autorização SPA/MF.
    demonstracao: true,
    adiamentos: true,
    drawAtOriginal: true,
    drawAtMaximo: true,
    comentariosCount: true,
    legenda: true,
    curtidasCount: true,
    republicacoesCount: true,
    compartilhamentosCount: true,
    travadaEm: true,
    travadaMotivo: true,
    // Agendar a publicação tem rota própria (`agendarPublicacao`).
    publicarEm: true,
    publicarAgendadoPor: true,
    publicacaoAgendadaFalha: true,
    // A tabela de cobrança é fotografada pela publicação, nunca vem do formulário.
    cobranca: true,
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
  /** Estatística (`validarOrigem`); valor desconhecido é descartado. */
  origem: z.string().max(20).optional(),
  /** Código do link de indicação (etapa 13); conferido no servidor. */
  indicacao: z.string().max(20).optional(),
  /** UTM do anúncio (etapa 16); `validarUtm` descarta o que não conhece. */
  utm: z.record(z.string(), z.unknown()).optional(),
  /** O aparelho aceitou os cookies de marketing (etapa 16). */
  marketing: z.boolean().optional(),
});

/**
 * A parte da promotora no desconto do presente que a plataforma pagou
 * (`creditoDoPresente`): a plataforma deve isto à organização. Lançado na
 * transação que confirma o pagamento, um por pedido (índice único),
 * cancelado na do estorno e acertado junto com a cobrança (`darBaixa`).
 */
export const presenteCreditos = pgTable(
  "presente_creditos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** devido → pago (acerto), cancelado (estorno) ou abatido (retenção cautelar). */
    status: text("status").notNull().default("devido"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    pagoEm: timestamp("pago_em"),
  },
  (t) => [uniqueIndex("uq_presente_credito_pedido").on(t.orderId), index("idx_presente_creditos_org").on(t.organizationId, t.status)],
);

/** O carrinho pago num Pix só: rifa e quantidade — nunca preço nem número. */
export const carrinhoCheckoutSchema = z.object({
  itens: z
    .array(
      z.object({
        slug: z.string().min(1).max(120),
        quantidade: z.number().int().min(1).max(10_000),
        /** A cartela escolhida (sugestão): vai para `reserveSpecific`, tudo ou nada. */
        numeros: z.array(z.number().int().positive()).max(10_000).optional(),
      }),
    )
    .min(1)
    .max(20),
  buyer: createOrderSchema.shape.buyer,
  affiliateCode: z.string().max(40).optional(),
  origem: z.string().max(20).optional(),
  indicacao: z.string().max(20).optional(),
  utm: z.record(z.string(), z.unknown()).optional(),
  marketing: z.boolean().optional(),
});
export type CarrinhoCheckoutInput = z.infer<typeof carrinhoCheckoutSchema>;

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

/**
 * Banners da plataforma, no topo da vitrine (até 5, `BANNERS_MAX`). Só o
 * administrador geral mexe. A imagem fica no banco, reprocessada em
 * 1200×600 WebP, como a logo — não depende do R2.
 */
export const plataformaBanners = pgTable("plataforma_banners", {
  id: uuid("id").primaryKey().defaultRandom(),
  titulo: text("titulo").notNull(),
  /** Caminho do site ou endereço https (`validarLinkDoBanner`). */
  link: text("link"),
  segundos: integer("segundos").notNull().default(6),
  posicao: integer("posicao").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  inicio: timestamp("inicio"),
  fim: timestamp("fim"),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Banner pago na vitrine (`shared/bannerPago.ts`): a organização compra dias
 * de topo para uma rifa dela. A arte fica no banco (1200×600 WebP), o valor
 * sai do saldo pelo livro na hora do pedido, e a plataforma aprova a arte. O
 * relógio da compra só começa quando o banner pega uma vaga (`inicio`).
 * Um pedido em aberto por rifa — o índice parcial decide, nunca um SELECT.
 */
export const bannerPedidos = pgTable(
  "banner_pedidos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    titulo: text("titulo").notNull(),
    mime: text("mime").notNull(),
    bytes: bytea("bytes").notNull(),
    dias: integer("dias").notNull(),
    /** O preço do dia fotografado na compra: mudar a tabela não mexe no que já foi pago. */
    precoDiaCents: integer("preco_dia_cents").notNull(),
    valorPagoCents: integer("valor_pago_cents").notNull(),
    /** em_analise | aprovado | no_ar | encerrado | recusado | cancelado */
    status: text("status").notNull().default("em_analise"),
    motivo: text("motivo"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    aprovadoEm: timestamp("aprovado_em"),
    inicio: timestamp("inicio"),
    fim: timestamp("fim"),
    encerradoEm: timestamp("encerrado_em"),
    /** O que voltou ao saldo (recusa, cancelamento ou dias não usados). */
    devolvidoCents: integer("devolvido_cents").notNull().default(0),
  },
  (t) => [
    uniqueIndex("uq_banner_pedido_aberto_por_rifa")
      .on(t.campaignId)
      .where(sql`${t.status} in ('em_analise','aprovado','no_ar')`),
    index("ix_banner_pedidos_status").on(t.status, t.aprovadoEm),
    index("ix_banner_pedidos_org").on(t.organizationId, t.createdAt),
  ],
);

/**
 * Tráfego pago (`shared/trafego.ts`): a campanha que a plataforma monta nas
 * contas de anúncios dela para a rifa de uma organização. O pedido reserva no
 * saldo de publicidade (`patrocinio_lancamentos`, `trafego:<id>`) a verba de
 * mídia mais a taxa; cada gasto lançado consome a reserva e nunca passa dela;
 * no fim, a sobra volta (`trafego-sobra:<id>`). Taxa fotografada no pedido.
 */
export const trafegoCampanhas = pgTable(
  "trafego_campanhas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Dinheiro envolvido: a rifa com campanha não se apaga (`excluirRifa`). */
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    redes: text("redes").array().notNull(),
    uf: text("uf"),
    cidade: text("cidade"),
    observacao: text("observacao"),
    investimentoCents: integer("investimento_cents").notNull(),
    verbaDiaCents: integer("verba_dia_cents").notNull(),
    /** A taxa de gestão fotografada no pedido: mudar a tabela não mexe na campanha. */
    taxaPct: integer("taxa_pct").notNull(),
    reservaCents: integer("reserva_cents").notNull(),
    /** Mídia gasta e taxa cobrada até agora (somas dos lançamentos, na mesma transação). */
    gastoCents: integer("gasto_cents").notNull().default(0),
    taxaCents: integer("taxa_cents").notNull().default(0),
    /** em_analise | ativa | encerrada | recusada | cancelada */
    status: text("status").notNull().default("em_analise"),
    motivo: text("motivo"),
    criadoPor: uuid("criado_por").references(() => users.id, { onDelete: "set null" }),
    decididoPor: uuid("decidido_por").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    aprovadoEm: timestamp("aprovado_em"),
    encerradoEm: timestamp("encerrado_em"),
    /** O que voltou ao saldo no fim (recusa, cancelamento ou sobra). */
    devolvidoCents: integer("devolvido_cents").notNull().default(0),
    /**
     * Quando a taxa de gestão foi cobrada inteira (na aprovação, UTC). Nulo: a
     * campanha ainda não foi aprovada (nada cobrado) ou é de antes desta regra
     * (segue com a taxa diária de cada lançamento — `taxaDoLancamento()`).
     */
    taxaCobradaEm: timestamp("taxa_cobrada_em"),
    /** O aceite explícito da taxa no pedido: quando (UTC), a versão do texto e a impressão SHA-256 do texto exato mostrado. */
    taxaAceiteEm: timestamp("taxa_aceite_em"),
    taxaAceiteVersao: integer("taxa_aceite_versao"),
    taxaAceiteSha256: text("taxa_aceite_sha256"),
  },
  (t) => [
    uniqueIndex("uq_trafego_aberto_por_rifa")
      .on(t.campaignId)
      .where(sql`${t.status} in ('em_analise','ativa','encerrando')`),
    index("ix_trafego_campanhas_status").on(t.status, t.createdAt),
    index("ix_trafego_campanhas_org").on(t.organizationId, t.createdAt),
  ],
);

/**
 * O gasto de um dia numa rede, lançado pela plataforma: um por campanha, dia
 * e rede (o índice decide — lançar duas vezes é um 409, nunca dois débitos).
 */
export const trafegoGastos = pgTable(
  "trafego_gastos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campanhaId: uuid("campanha_id")
      .notNull()
      .references(() => trafegoCampanhas.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** O dia no fuso de São Paulo ("2026-10-09"). */
    dia: text("dia").notNull(),
    rede: text("rede").notNull(),
    gastoCents: integer("gasto_cents").notNull(),
    taxaCents: integer("taxa_cents").notNull(),
    /** Os cliques do dia no painel da rede (nulo no lançamento à mão sem o número). */
    cliques: integer("cliques"),
    /** `manual` (digitado pela plataforma) ou `importado` (pela fonte do gasto, fase 2). */
    origem: text("origem").notNull().default("manual"),
    /**
     * O que a rede gastou neste dia além do que se cobra da organização (verba
     * acabada, campanha parada ou fechada): é custo da plataforma, nunca da
     * organização. Só a importação grava; a organização não vê.
     */
    excedenteCents: integer("excedente_cents").notNull().default(0),
    lancadoPor: uuid("lancado_por").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_trafego_gasto_do_dia").on(t.campanhaId, t.dia, t.rede),
    index("ix_trafego_gastos_org_dia").on(t.organizationId, t.dia),
  ],
);

/**
 * Fase 3: a campanha aprovada criada na rede pela API (hoje, só o Meta), pela
 * plataforma, tudo PAUSADO. Uma linha por campanha e rede — o índice decide:
 * o `INSERT … ON CONFLICT DO NOTHING` em `criando` vem antes de chamar a rede,
 * e quem não entrou recebe 409. Falhou, volta a `criando` por um `UPDATE`
 * condicional; o que a rede criou pela metade fica em `restos` para a
 * plataforma apagar no gerenciador. Nunca guarda token nem resposta crua.
 */
export const trafegoCriacoes = pgTable(
  "trafego_criacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campanhaId: uuid("campanha_id")
      .notNull()
      .references(() => trafegoCampanhas.id, { onDelete: "cascade" }),
    rede: text("rede").notNull(),
    /** criando | criada | falhou */
    status: text("status").notNull().default("criando"),
    /** Os ids na rede (campanha, conjunto, criativo, anúncio, imagem) — os da tentativa atual. */
    ids: jsonb("ids").$type<Record<string, string>>().notNull().default({}),
    /**
     * O que tentativas que falharam (ou perderam a linha) deixaram criado na
     * rede, pausado, para apagar no gerenciador: a lista achatada de peças
     * (`{ tipo, id }`), um id uma vez só e nunca um id da criação viva.
     */
    restos: jsonb("restos").$type<import("./trafegoCriacao").Resto[]>().notNull().default([]),
    /** O motivo da falha em português, sem token nem resposta crua da rede. */
    erro: text("erro"),
    /** O orçamento mandado ao Meta (`orcamentoNoMeta()`): a parte da verba que sobra, por dia e no total. */
    orcamento: jsonb("orcamento").$type<import("./trafegoCriacao").OrcamentoNoMeta>(),
    tentativas: integer("tentativas").notNull().default(1),
    /** Pausar na rede ao encerrar: nulo (não pediu), `pausada` ou `falhou`. */
    pausa: text("pausa"),
    pausaErro: text("pausa_erro"),
    pausadaEm: timestamp("pausada_em"),
    criadoPor: uuid("criado_por").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /** O sinal de vida da criação (o prazo compara com `now() AT TIME ZONE 'UTC'`); toda escrita usa o mesmo padrão. */
    atualizadoEm: timestamp("atualizado_em").notNull().default(sql`(now() AT TIME ZONE 'UTC')`),
    criadaEm: timestamp("criada_em"),
  },
  (t) => [uniqueIndex("uq_trafego_criacao_por_rede").on(t.campanhaId, t.rede)],
);

/**
 * Stories do organizador: uma imagem 9:16 que entra no ar em `publica_em`
 * (na hora ou agendado) e some 24 h depois (`expira_em`).
 * Aparece para quem segue, no topo da vitrine, e acende o anel da foto no
 * perfil. O relógio apaga os vencidos — a tabela não cresce.
 */
export const stories = pgTable(
  "stories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    legenda: text("legenda"),
    /** Rifa da própria organização para onde o story leva (opcional). */
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    mime: text("mime").notNull(),
    bytes: bytea("bytes").notNull(),
    /** Pôster do vídeo (WebP), tirado em segundo plano. Nulo sem ffmpeg ou em imagem. */
    poster: bytea("poster"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /**
     * Quando entra no ar (agendado ou na hora). Antes disto o story não
     * aparece no público; as 24 h de `expira_em` contam daqui.
     */
    publicaEm: timestamp("publica_em").notNull().defaultNow(),
    expiraEm: timestamp("expira_em").notNull(),
    /**
     * Figurinhas (contagem do sorteio, Comprar, texto, emoji) na posição de
     * cada uma. Só dados, conferidos por `validarFigurinhas()`; vazio é story
     * sem figurinha.
     */
    figurinhas: jsonb("figurinhas").$type<Figurinha[]>().notNull().default([]),
  },
  (t) => [index("ix_stories_org_expira").on(t.organizationId, t.expiraEm)],
);

/**
 * Enquete do story (uma por story, opcional): a pergunta, de 2 a 4 opções e
 * o total de votos de cada uma (`votos[i]`), que anda na mesma transação do
 * voto — nunca `COUNT(*)`. Sai com o story.
 */
export const storyEnquetes = pgTable("story_enquetes", {
  storyId: uuid("story_id")
    .primaryKey()
    .references(() => stories.id, { onDelete: "cascade" }),
  pergunta: text("pergunta").notNull(),
  opcoes: jsonb("opcoes").$type<string[]>().notNull(),
  votos: integer("votos").array().notNull(),
});

/**
 * O voto de cada pessoa (conta com senha) na enquete: a chave (story,
 * pessoa) é o que faz ser um voto só — `ON CONFLICT DO NOTHING`. Fica só
 * para contar uma vez; a organização vê os totais, nunca a linha.
 */
export const storyVotos = pgTable(
  "story_votos",
  {
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    opcao: integer("opcao").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.buyerId] })],
);

/**
 * Foto do ganhador, depois do sorteio: vira a capa da rifa no perfil
 * (destaques) e aparece no resultado. Só entra com a rifa sorteada, e a
 * autorização de uso da imagem é do organizador com o ganhador. No banco,
 * reprocessada (1080×1350, 4:5, WebP, sem metadados).
 */
export const campaignGanhadorFotos = pgTable("campaign_ganhador_fotos", {
  campaignId: uuid("campaign_id")
    .primaryKey()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Afiliado × organização. O afiliado é avulso (a conta não tem organização)
 * e adere a quantas quiser; cada adesão passa pela organização. A chave é o
 * par — aderir duas vezes é `ON CONFLICT`, nunca um `SELECT` antes.
 */
export const afiliadoVinculos = pgTable(
  "afiliado_vinculos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** pendente | aprovado | recusado | desfeito (`STATUS_DO_VINCULO`). */
    status: text("status").notNull().default("pendente"),
    /** Percentual combinado com esta organização (só vale sem termo na rifa). */
    commissionPct: integer("commission_pct"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    decididoEm: timestamp("decidido_em"),
  },
  (t) => [uniqueIndex("uq_vinculo_afiliado_org").on(t.affiliateId, t.organizationId)],
);

/**
 * Termo de adesão de afiliado de cada organização, por versão. Publicar não
 * sobrescreve: versão nova é linha nova, e o texto montado fica gravado.
 */
export const organizacaoTermos = pgTable(
  "organizacao_termos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    versao: integer("versao").notNull(),
    comissaoPct: integer("comissao_pct").notNull(),
    textoExtra: text("texto_extra").notNull().default(""),
    /** O termo inteiro, como foi montado na publicação (`montarTermo`). */
    texto: text("texto").notNull(),
    criadoPor: uuid("criado_por"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_termo_org_versao").on(t.organizationId, t.versao)],
);

/**
 * Aceite do termo: cópia do texto, versão, quando, IP e aparelho (em hash,
 * como no antifraude). É a prova do combinado — por isso guarda o texto, não
 * só o id.
 */
export const termoAceites = pgTable(
  "termo_aceites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vinculoId: uuid("vinculo_id")
      .notNull()
      .references(() => afiliadoVinculos.id, { onDelete: "cascade" }),
    termoId: uuid("termo_id")
      .notNull()
      .references(() => organizacaoTermos.id),
    versao: integer("versao").notNull(),
    texto: text("texto").notNull(),
    /** SHA-256 do texto aceito — a mesma impressão da versão, guardada no aceite. */
    textoSha256: text("texto_sha256"),
    ipHash: text("ip_hash"),
    deviceHash: text("device_hash"),
    aceitoEm: timestamp("aceito_em").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_aceite_vinculo_termo").on(t.vinculoId, t.termoId)],
);

/**
 * Contrato da plataforma com a promotora, por versão (o texto do advogado,
 * colado pela plataforma). Publicar não sobrescreve: versão nova é linha nova.
 */
export const contratosPromotora = pgTable(
  "contratos_promotora",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versao: integer("versao").notNull(),
    /** O texto já preenchido com os dados da empresa: o que as organizações leem e aceitam. */
    texto: text("texto").notNull(),
    /** O texto como a plataforma colou, com os campos (`{{RAZAO_SOCIAL}}`…). Nulo nas versões de antes. */
    modelo: text("modelo"),
    /** SHA-256 (hex) do texto em UTF-8: a impressão da versão, gravada ao publicar. */
    textoSha256: text("texto_sha256"),
    publicadoPor: uuid("publicado_por"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_contrato_promotora_versao").on(t.versao)],
);

/**
 * Aceite do contrato pela organização: cópia do texto, versão, quem aceitou,
 * quando, IP e aparelho em hash. É a prova — por isso guarda o texto.
 */
export const contratoPromotoraAceites = pgTable(
  "contrato_promotora_aceites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contratoId: uuid("contrato_id")
      .notNull()
      .references(() => contratosPromotora.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    versao: integer("versao").notNull(),
    texto: text("texto").notNull(),
    /** SHA-256 do texto aceito — a mesma impressão da versão, guardada no aceite. */
    textoSha256: text("texto_sha256"),
    ipHash: text("ip_hash"),
    deviceHash: text("device_hash"),
    aceitoEm: timestamp("aceito_em").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_contrato_aceite_org").on(t.contratoId, t.organizationId)],
);

/**
 * Anexo do contrato por modalidade (cláusula 7, `shared/contratoAnexos.ts`):
 * uma linha por versão de cada modalidade. Publicar não sobrescreve. O texto
 * já vem preenchido com os dados da empresa, como o contrato.
 */
export const contratoAnexos = pgTable(
  "contrato_anexos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** federal | globo | vale_brinde | bonus | entidade */
    modalidade: text("modalidade").notNull(),
    versao: integer("versao").notNull(),
    titulo: text("titulo").notNull(),
    texto: text("texto").notNull(),
    modelo: text("modelo"),
    textoSha256: text("texto_sha256"),
    publicadoPor: uuid("publicado_por"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_contrato_anexo_versao").on(t.modalidade, t.versao)],
);

/** Aceite de um anexo pela organização: a mesma prova do aceite do contrato. */
export const contratoAnexoAceites = pgTable(
  "contrato_anexo_aceites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    anexoId: uuid("anexo_id")
      .notNull()
      .references(() => contratoAnexos.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    modalidade: text("modalidade").notNull(),
    versao: integer("versao").notNull(),
    texto: text("texto").notNull(),
    textoSha256: text("texto_sha256"),
    ipHash: text("ip_hash"),
    deviceHash: text("device_hash"),
    aceitoEm: timestamp("aceito_em").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_contrato_anexo_aceite_org").on(t.anexoId, t.organizationId)],
);

/**
 * "Seja um colaborador": o apostador pede para vender (ser cambista) de uma
 * organização. Um pedido em aberto por pessoa e organização — quem decide é
 * o índice parcial, não um `SELECT` antes.
 */
export const pedidosColaborador = pgTable(
  "pedidos_colaborador",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    cidade: text("cidade").notNull(),
    mensagem: text("mensagem").notNull().default(""),
    /** pendente | atendido | recusado */
    status: text("status").notNull().default("pendente"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    decididoEm: timestamp("decidido_em"),
  },
  (t) => [
    uniqueIndex("uq_pedido_colaborador_aberto")
      .on(t.organizationId, t.buyerId)
      .where(sql`status = 'pendente'`),
  ],
);

/**
 * Cadastro fiscal do afiliado. Os dados (nome completo, CPF, RG, nascimento,
 * endereço, conta) ficam **cifrados** (`dados`, AES-256-GCM, chave fora do
 * banco — `server/services/cofre.ts`). Em claro, só o status e a impressão
 * do CPF (HMAC), que barra o mesmo CPF em duas contas sem guardar o CPF.
 */
export const afiliadoFiscal = pgTable(
  "afiliado_fiscal",
  {
    affiliateId: uuid("affiliate_id")
      .primaryKey()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    /** incompleto | em_analise | aprovado | recusado (`STATUS_FISCAL`). */
    status: text("status").notNull().default("incompleto"),
    dados: bytea("dados"),
    iv: bytea("iv"),
    tag: bytea("tag"),
    chaveVersao: text("chave_versao"),
    cpfImpressao: text("cpf_impressao"),
    motivo: text("motivo"),
    enviadoEm: timestamp("enviado_em"),
    decididoEm: timestamp("decidido_em"),
    decididoPor: uuid("decidido_por"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_fiscal_cpf").on(t.cpfImpressao).where(sql`cpf_impressao is not null`)],
);

/** Documentos do cadastro fiscal, cifrados como os dados. Um por tipo. */
export const afiliadoDocumentos = pgTable(
  "afiliado_documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    mime: text("mime").notNull(),
    tamanho: integer("tamanho").notNull(),
    dados: bytea("dados").notNull(),
    iv: bytea("iv").notNull(),
    tag: bytea("tag").notNull(),
    chaveVersao: text("chave_versao").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_documento_afiliado_tipo").on(t.affiliateId, t.tipo)],
);

/**
 * Recibo de cada saque pago: o retrato do pagamento (quem pagou, quem
 * recebeu, quanto e de onde veio), o hash do texto canônico e a assinatura
 * da plataforma. Emitido na mesma transação que dá baixa no saque, e nunca
 * editado — o PDF é gerado dele a cada download.
 */
export const recibos = pgTable("recibos", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  payoutId: uuid("payout_id")
    .notNull()
    .unique()
    .references(() => payouts.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  affiliateId: uuid("affiliate_id")
    .notNull()
    .references(() => affiliates.id),
  snapshot: jsonb("snapshot").notNull(),
  hash: text("hash").notNull(),
  assinatura: text("assinatura").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Programa de bônus (etapa 13): indicação, visitas, metas, cotas grátis
 * ------------------------------------------------------------------ */

/**
 * Livro-razão do bônus. A `chave` diz por que entrou (ou saiu) e é única:
 * a mesma indicação, meta ou resgate nunca lança duas vezes.
 */
export const bonusLancamentos = pgTable(
  "bonus_lancamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    /** Positivo entra, negativo sai (resgate, estorno de indicação). */
    quantidade: integer("quantidade").notNull(),
    /** indicacao | meta | resgate | estorno_indicacao */
    motivo: text("motivo").notNull(),
    chave: text("chave").notNull(),
    descricao: text("descricao"),
    orderId: uuid("order_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_bonus_lancamento_chave").on(t.chave), index("idx_bonus_lancamentos_buyer").on(t.buyerId, t.createdAt)],
);

/** Quem indicou quem. Uma indicação por indicado: o primeiro link que trouxe a pessoa. */
export const indicacoes = pgTable(
  "indicacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    indicadorId: uuid("indicador_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    indicadoId: uuid("indicado_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    /** O primeiro pedido do indicado: é o pagamento dele que confirma. */
    orderId: uuid("order_id").notNull(),
    /** pendente | confirmada | estornada */
    status: text("status").notNull().default("pendente"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    confirmadaEm: timestamp("confirmada_em"),
  },
  (t) => [uniqueIndex("uq_indicacao_indicado").on(t.indicadoId), index("idx_indicacoes_indicador").on(t.indicadorId, t.status)],
);

/** Visita nova trazida pelo link: um aparelho conta uma vez por quem indica. */
export const bonusVisitas = pgTable(
  "bonus_visitas",
  {
    indicadorId: uuid("indicador_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    /** SHA-256 do identificador do aparelho: dado pessoal não vira chave crua. */
    aparelhoHash: text("aparelho_hash").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_bonus_visita").on(t.indicadorId, t.aparelhoHash)],
);

/** Metas da plataforma (ex.: comprar em 3 rifas, indicar 5 amigos). */
export const bonusMetas = pgTable("bonus_metas", {
  id: uuid("id").primaryKey().defaultRandom(),
  titulo: text("titulo").notNull(),
  /** rifas_compradas | indicacoes | visitas (`shared/bonus.ts`) */
  tipo: text("tipo").notNull(),
  alvo: integer("alvo").notNull(),
  recompensa: integer("recompensa").notNull(),
  ativa: boolean("ativa").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Rifas patrocinadas por clique (etapa 15)
 * ------------------------------------------------------------------ */

/**
 * O anúncio: um pacote de cliques para uma rifa, num alcance. Pago de uma
 * vez com o saldo. Fica na fila do seu segmento (`segmento`, por ordem de
 * `fila_desde`) e, quando entra na vaga, só sai ao gastar todos os cliques.
 */
export const patrocinioAnuncios = pgTable(
  "patrocinio_anuncios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    /** cidade | estado | nacional (`shared/patrocinio.ts`) */
    alcance: text("alcance").notNull(),
    uf: text("uf"),
    cidade: text("cidade"),
    /** A chave da fila: "nacional", "estado:SP", "cidade:SP:campinas". */
    segmento: text("segmento").notNull(),
    cliquesComprados: integer("cliques_comprados").notNull(),
    cliquesUsados: integer("cliques_usados").notNull().default(0),
    /** Preço da tabela e desconto no dia da compra: mudar a tabela não mexe no que já foi pago. */
    precoCliqueCents: integer("preco_clique_cents").notNull(),
    descontoPct: integer("desconto_pct").notNull().default(0),
    valorPagoCents: integer("valor_pago_cents").notNull(),
    /** ativo | encerrado (gastou tudo, ou a rifa saiu do ar) */
    status: text("status").notNull().default("ativo"),
    filaDesde: timestamp("fila_desde").notNull().defaultNow(),
    iniciadoEm: timestamp("iniciado_em"),
    encerradoEm: timestamp("encerrado_em"),
    /** O que não foi gasto e voltou ao saldo como crédito quando a rifa saiu do ar. */
    reembolsoCents: integer("reembolso_cents").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_anuncios_fila").on(t.segmento, t.status, t.filaDesde),
    index("idx_anuncios_org").on(t.organizationId, t.createdAt),
  ],
);

/**
 * Chaves de API das plataformas de anúncio (etapa 16), da plataforma
 * (`dono = 'plataforma'`) e de cada organização (`dono = <id>`). Cifradas
 * no cofre: vazar o banco não entrega o token que manda eventos em nome do
 * anunciante. A tela nunca recebe o valor, só se existe.
 */
export const marketingCredenciais = pgTable("marketing_credenciais", {
  dono: text("dono").primaryKey(),
  dados: bytea("dados").notNull(),
  iv: bytea("iv").notNull(),
  tag: bytea("tag").notNull(),
  chaveVersao: text("chave_versao").notNull(),
  atualizadoEm: timestamp("atualizado_em").notNull().defaultNow(),
});

/**
 * Compra a enviar pelo servidor para cada plataforma de anúncio (etapa 16).
 * Nasce na transação que confirma o pagamento; o relógio envia. A chave
 * única (pedido, destino) é a defesa contra mandar a mesma compra duas
 * vezes — webhook repetido, várias réplicas.
 */
export const marketingEventos = pgTable(
  "marketing_eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** "plataforma" ou o id da organização: de quem são o pixel e o token. */
    dono: text("dono").notNull(),
    /** meta | ga4 | tiktok */
    provedor: text("provedor").notNull(),
    /** O número do pixel/medição no momento da venda. */
    destino: text("destino").notNull(),
    /** pendente | enviado | falhou */
    status: text("status").notNull().default("pendente"),
    tentativas: integer("tentativas").notNull().default(0),
    ultimoErro: text("ultimo_erro"),
    proximaTentativa: timestamp("proxima_tentativa").notNull().defaultNow(),
    enviadoEm: timestamp("enviado_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_marketing_evento").on(t.orderId, t.dono, t.provedor),
    index("idx_marketing_eventos_fila").on(t.status, t.proximaTentativa),
  ],
);

/**
 * Pedido de reembolso, em dinheiro, do saldo de patrocínio. Só existe com o
 * interruptor da plataforma ligado (`patrocinioReembolso`). O valor sai do
 * saldo na abertura (reservado), para não ser gasto em anúncio enquanto o
 * suporte analisa; recusado, volta ao saldo. Crédito de anúncio de rifa no ar
 * não está no saldo — não há como pedir o reembolso dele.
 */
export const patrocinioReembolsos = pgTable(
  "patrocinio_reembolsos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** "PR-XXXXXX", sorteado: é como o suporte e a organização falam do pedido. */
    protocolo: text("protocolo").notNull(),
    /** aberto | aprovado (a pagar) | pago | recusado */
    status: text("status").notNull().default("aberto"),
    valorCents: integer("valor_cents").notNull(),
    /** Para onde o suporte devolve o dinheiro. */
    chavePix: text("chave_pix").notNull(),
    motivo: text("motivo").notNull(),
    abertoPor: uuid("aberto_por"),
    /** Na decisão: o que a plataforma retém (custo de divulgação externa) e o que devolve em dinheiro. */
    retidoCents: integer("retido_cents"),
    devolverCents: integer("devolver_cents"),
    explicacao: text("explicacao"),
    decididoPor: uuid("decidido_por"),
    decididoEm: timestamp("decidido_em"),
    pagoEm: timestamp("pago_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_patrocinio_reembolso_protocolo").on(t.protocolo),
    // Um pedido em aberto por organização: quem decide é o índice, não um SELECT antes.
    uniqueIndex("uq_patrocinio_reembolso_aberto").on(t.organizationId).where(sql`status = 'aberto'`),
    index("idx_patrocinio_reembolsos_org").on(t.organizationId, t.createdAt),
  ],
);

/** A conversa do pedido de reembolso: organização e suporte da plataforma. */
export const patrocinioReembolsoMensagens = pgTable(
  "patrocinio_reembolso_mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reembolsoId: uuid("reembolso_id")
      .notNull()
      .references(() => patrocinioReembolsos.id, { onDelete: "cascade" }),
    /** organizacao | plataforma */
    autor: text("autor").notNull(),
    userId: uuid("user_id"),
    texto: text("texto").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_patrocinio_reembolso_mensagens").on(t.reembolsoId, t.createdAt)],
);

/** Clique cobrado: um por visitante (aparelho em hash) a cada 24 h, por anúncio, conferido sob trava. */
export const patrocinioCliques = pgTable(
  "patrocinio_cliques",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    anuncioId: uuid("anuncio_id")
      .notNull()
      .references(() => patrocinioAnuncios.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    visitanteHash: text("visitante_hash").notNull(),
    /** IP em hash: um IP cobra no máximo `CLIQUES_POR_IP` por anúncio em 24 h. */
    ipHash: text("ip_hash"),
    /** O que este clique gastou do pacote (`gastoAte`): a soma é o valor pago. */
    valorCents: integer("valor_cents").notNull(),
    uf: text("uf"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_patrocinio_clique_visitante").on(t.anuncioId, t.visitanteHash, t.createdAt),
    index("idx_patrocinio_clique_ip").on(t.anuncioId, t.ipHash, t.createdAt),
    index("idx_patrocinio_clique_atribuicao").on(t.visitanteHash, t.campaignId, t.createdAt),
  ],
);

/**
 * Os números do dia, por anúncio e estado de quem olhou: é daqui que o
 * painel lê (somar dias, não varrer cliques). Incrementado por upsert.
 */
export const patrocinioDiario = pgTable(
  "patrocinio_diario",
  {
    anuncioId: uuid("anuncio_id")
      .notNull()
      .references(() => patrocinioAnuncios.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").notNull(),
    /** Dia no fuso de São Paulo (AAAA-MM-DD). */
    dia: text("dia").notNull(),
    /** Estado de quem olhou ("" quando não se sabe). */
    uf: text("uf").notNull().default(""),
    exibicoes: integer("exibicoes").notNull().default(0),
    cliques: integer("cliques").notNull().default(0),
    /** Cliques recusados: robô, repetido em 24 h, pacote esgotado. */
    barrados: integer("barrados").notNull().default(0),
    gastoCents: integer("gasto_cents").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.anuncioId, t.dia, t.uf] }),
    index("idx_patrocinio_diario_org").on(t.organizationId, t.dia),
  ],
);

/**
 * Entradas e ajustes do saldo de patrocínio (recarga paga, crédito ou
 * débito da plataforma). A `chave` é única: o webhook repetido não credita
 * duas vezes. Os cliques têm a tabela deles.
 */
export const patrocinioLancamentos = pgTable(
  "patrocinio_lancamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    valorCents: integer("valor_cents").notNull(),
    /** recarga | ajuste */
    motivo: text("motivo").notNull(),
    chave: text("chave").notNull(),
    descricao: text("descricao"),
    userId: uuid("user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_patrocinio_lancamento_chave").on(t.chave), index("idx_patrocinio_lancamentos_org").on(t.organizationId, t.createdAt)],
);

/** Recarga por Pix para a conta da plataforma (sem split). */
export const patrocinioRecargas = pgTable(
  "patrocinio_recargas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Número da cobrança no provedor (faixa própria, fora da dos pedidos). */
    codigo: integer("codigo").notNull(),
    valorCents: integer("valor_cents").notNull(),
    /** pendente | paga */
    status: text("status").notNull().default("pendente"),
    provider: text("provider"),
    chargeId: text("charge_id"),
    pixQr: text("pix_qr"),
    pixCopyPaste: text("pix_copy_paste"),
    expiresAt: timestamp("expires_at"),
    pagaEm: timestamp("paga_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_patrocinio_recarga_codigo").on(t.codigo), uniqueIndex("uq_patrocinio_recarga_charge").on(t.chargeId)],
);

/**
 * Verificação do perfil (selo de trevo) de apostador, afiliado e
 * organização — `shared/verificacao.ts`. Um pedido por sujeito. Os dados
 * ficam **cifrados** como o cadastro fiscal; em claro, só o status e a
 * impressão do CPF (HMAC), que impede o mesmo CPF de verificar duas contas
 * do mesmo tipo — o índice decide, nunca um `SELECT` antes.
 *
 * `foto_versao` é a foto do perfil que foi comparada: trocar a foto de um
 * perfil verificado tira o selo até a nova ser conferida.
 */
export const verificacoes = pgTable(
  "verificacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** apostador | afiliado | organizacao */
    sujeito: text("sujeito").notNull(),
    /** O id em `buyers`, `affiliates` ou `organizations`, conforme o sujeito. */
    sujeitoId: uuid("sujeito_id").notNull(),
    /** `STATUS_VERIFICACAO` */
    status: text("status").notNull().default("incompleto"),
    dados: bytea("dados"),
    iv: bytea("iv"),
    tag: bytea("tag"),
    chaveVersao: text("chave_versao"),
    cpfImpressao: text("cpf_impressao"),
    motivo: text("motivo"),
    enviadoEm: timestamp("enviado_em"),
    documentosAprovadosEm: timestamp("documentos_aprovados_em"),
    documentosAprovadosPor: uuid("documentos_aprovados_por"),
    fotoVersao: timestamp("foto_versao"),
    /** `automatico` (comparador) ou o id de quem conferiu. */
    fotoConferidaPor: text("foto_conferida_por"),
    /**
     * Consentimento biométrico (LGPD, art. 11, I): quando foi dado, a chave
     * do texto (versão e modo) e o SHA-256 do texto exato que a pessoa leu —
     * a prova é de quem trata o dado (art. 8º, § 2º). Nulo = sem autorização
     * (nunca deu, ou revogou): a foto não é comparada e o selo não sai.
     */
    consentimentoBiometricoEm: timestamp("consentimento_biometrico_em"),
    consentimentoBiometricoChave: text("consentimento_biometrico_chave"),
    consentimentoBiometricoHash: text("consentimento_biometrico_hash"),
    verificadoEm: timestamp("verificado_em"),
    decididoEm: timestamp("decidido_em"),
    decididoPor: uuid("decidido_por"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_verificacao_sujeito").on(t.sujeito, t.sujeitoId),
    uniqueIndex("uq_verificacao_cpf").on(t.sujeito, t.cpfImpressao).where(sql`cpf_impressao is not null`),
  ],
);

/** Documentos da verificação, cifrados como os dados. Um por tipo. */
export const verificacaoDocumentos = pgTable(
  "verificacao_documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    verificacaoId: uuid("verificacao_id")
      .notNull()
      .references(() => verificacoes.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    mime: text("mime").notNull(),
    tamanho: integer("tamanho").notNull(),
    dados: bytea("dados").notNull(),
    iv: bytea("iv").notNull(),
    tag: bytea("tag").notNull(),
    chaveVersao: text("chave_versao").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_verificacao_documento_tipo").on(t.verificacaoId, t.tipo)],
);

/**
 * Mensagens: a conversa de um par (um para um). O par entra em ordem
 * canônica (`a` é o menor de "tipo:id"), então o índice único é a defesa
 * contra duas conversas do mesmo par. Os contadores de não lidas andam na
 * mesma transação da mensagem — nada de `COUNT(*)`.
 */
export const conversas = pgTable(
  "conversas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aTipo: text("a_tipo").notNull(),
    aId: uuid("a_id").notNull(),
    bTipo: text("b_tipo").notNull(),
    bId: uuid("b_id").notNull(),
    /** `pedido`, `aceita` ou `recusada`. */
    situacao: text("situacao").notNull().default("pedido"),
    /** Quem abriu a conversa: `a` ou `b`. */
    iniciadaPor: text("iniciada_por").notNull(),
    /** Quem bloqueou, se alguém: `a` ou `b`. */
    bloqueadaPor: text("bloqueada_por"),
    /** Encerrada pela plataforma (denúncia procedente): ninguém mais escreve. */
    encerradaEm: timestamp("encerrada_em"),
    naoLidasA: integer("nao_lidas_a").notNull().default(0),
    naoLidasB: integer("nao_lidas_b").notNull().default(0),
    previa: text("previa"),
    ultimaEm: timestamp("ultima_em").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_conversa_par").on(t.aTipo, t.aId, t.bTipo, t.bId),
    index("idx_conversas_a").on(t.aTipo, t.aId, t.ultimaEm),
    index("idx_conversas_b").on(t.bTipo, t.bId, t.ultimaEm),
  ],
);

export const mensagens = pgTable(
  "mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversaId: uuid("conversa_id")
      .notNull()
      .references(() => conversas.id, { onDelete: "cascade" }),
    /** Quem escreveu: `a` ou `b`. */
    de: text("de").notNull(),
    texto: text("texto").notNull(),
    /** A rifa compartilhada no cartão (opcional). */
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_mensagens_conversa").on(t.conversaId, t.createdAt, t.id)],
);

/**
 * A foto de uma mensagem (só apostador envia). Fica no banco, reprocessada
 * (JPEG, sem metadados) e é servida só a quem está na conversa — e à plataforma,
 * se a mensagem está no trecho de uma denúncia (aberta ou já decidida: o trecho é a prova), com a leitura auditada.
 */
export const mensagemImagens = pgTable(
  "mensagem_imagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mensagemId: uuid("mensagem_id")
      .notNull()
      .references(() => mensagens.id, { onDelete: "cascade" }),
    conversaId: uuid("conversa_id")
      .notNull()
      .references(() => conversas.id, { onDelete: "cascade" }),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_mensagem_imagem_por_mensagem").on(t.mensagemId), index("idx_mensagem_imagens_conversa").on(t.conversaId)],
);

/**
 * Presença na caixa de mensagens, por participante (apostador, organização ou
 * afiliado). `mostrar` nasce desligado: quem não liga não aparece nem vê os
 * outros. `ultima_em` é só "esteve na caixa há pouco" — nunca sai como horário.
 */
export const mensagensPresenca = pgTable(
  "mensagens_presenca",
  {
    tipo: text("tipo").notNull(),
    id: uuid("id").notNull(),
    mostrar: boolean("mostrar").notNull().default(false),
    ultimaEm: timestamp("ultima_em").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tipo, t.id] })],
);

/**
 * Grupo de uma rifa: conversa de até `GRUPO_MAX_MEMBROS` apostadores com compra
 * paga naquela rifa. Um grupo aberto por criador e rifa (índice parcial). O
 * contador de membros anda na mesma transação da entrada/saída, com teto.
 */
export const grupos = pgTable(
  "grupos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    criadorId: uuid("criador_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    membrosCount: integer("membros_count").notNull().default(0),
    previa: text("previa").notNull().default(""),
    ultimaEm: timestamp("ultima_em").notNull().defaultNow(),
    encerradaEm: timestamp("encerrada_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_grupo_por_criador_e_rifa").on(t.campaignId, t.criadorId).where(sql`encerrada_em is null`),
    index("idx_grupos_rifa").on(t.campaignId, t.createdAt, t.id),
  ],
);

export const grupoMembros = pgTable(
  "grupo_membros",
  {
    grupoId: uuid("grupo_id")
      .notNull()
      .references(() => grupos.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    naoLidas: integer("nao_lidas").notNull().default(0),
    entrouEm: timestamp("entrou_em").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.grupoId, t.buyerId] }), index("idx_grupo_membros_pessoa").on(t.buyerId, t.entrouEm)],
);

export const grupoMensagens = pgTable(
  "grupo_mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grupoId: uuid("grupo_id")
      .notNull()
      .references(() => grupos.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    texto: text("texto").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_grupo_mensagens").on(t.grupoId, t.createdAt, t.id)],
);

/** Denúncia de grupo: a plataforma lê só o `trecho` (as últimas mensagens, gravadas na hora). */
export const grupoDenuncias = pgTable(
  "grupo_denuncias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolo: text("protocolo").notNull(),
    grupoId: uuid("grupo_id")
      .notNull()
      .references(() => grupos.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    motivo: text("motivo").notNull(),
    texto: text("texto"),
    trecho: jsonb("trecho").$type<{ de: string; texto: string; em: string }[]>().notNull(),
    status: text("status").notNull().default("aberta"),
    decisao: text("decisao"),
    decididaPor: uuid("decidida_por"),
    decididaEm: timestamp("decidida_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_grupo_denuncia_protocolo").on(t.protocolo),
    uniqueIndex("uq_grupo_denuncia_aberta").on(t.grupoId, t.buyerId).where(sql`status = 'aberta'`),
    index("idx_grupo_denuncias_status").on(t.status, t.createdAt),
  ],
);

/**
 * Denúncia de conversa. A plataforma só lê o `trecho` — as últimas
 * mensagens gravadas na hora da denúncia —, nunca a conversa inteira. Uma
 * aberta por conversa e lado (`uq_denuncia_conversa_aberta`).
 */
export const mensagemDenuncias = pgTable(
  "mensagem_denuncias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolo: text("protocolo").notNull(),
    conversaId: uuid("conversa_id")
      .notNull()
      .references(() => conversas.id, { onDelete: "cascade" }),
    /** Quem denunciou: `a`, `b` ou `automatica` (a varredura do Pix por fora). */
    lado: text("lado").notNull(),
    motivo: text("motivo").notNull(),
    texto: text("texto"),
    trecho: jsonb("trecho").$type<{ de: string; texto: string; em: string; imagem?: string }[]>().notNull(),
    status: text("status").notNull().default("aberta"),
    decisao: text("decisao"),
    decididaPor: uuid("decidida_por"),
    decididaEm: timestamp("decidida_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_mensagem_denuncia_protocolo").on(t.protocolo),
    uniqueIndex("uq_denuncia_conversa_aberta").on(t.conversaId, t.lado).where(sql`status = 'aberta'`),
    index("idx_mensagem_denuncias_status").on(t.status, t.createdAt),
  ],
);

/**
 * Divulgação de terceiros: a peça do afiliado (influenciador) ou do apostador
 * sobre a rifa de uma organização. Não altera a rifa — é uma legenda própria
 * e, para o afiliado, a escolha de mídias que a organização já publicou.
 * `em_analise` espera a organização; a decisão é `UPDATE` condicional com a
 * linha travada. Um pedido em análise por autor e rifa (índices parciais).
 * Regras em `shared/divulgacao.ts`.
 */
export const divulgacoes = pgTable(
  "divulgacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    /** Da dona da rifa: é o recorte de quem decide. */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** `afiliado` | `apostador`. */
    autor: text("autor").notNull(),
    affiliateId: uuid("affiliate_id").references(() => affiliates.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id").references(() => buyers.id, { onDelete: "cascade" }),
    legenda: text("legenda").notNull().default(""),
    /** Ids de `campaign_media` da própria rifa (só afiliado). */
    midiaIds: jsonb("midia_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** `em_analise` | `publicada` | `recusada` | `removida`. */
    status: text("status").notNull(),
    motivo: text("motivo"),
    decididoEm: timestamp("decidido_em"),
    decididoPor: uuid("decidido_por"),
    /**
     * Sobe a cada edição de quem publicou. A organização decide a versão que
     * leu (`versao` no pedido): editada no meio, a decisão é 409 — nunca
     * aprovar um texto que ninguém viu.
     */
    versao: integer("versao").notNull().default(0),
    /** A última edição de quem publicou (o "Editada" na tela). */
    editadaEm: timestamp("editada_em"),
    /**
     * Agendada: a peça só aparece na página da rifa a partir daqui (e depois
     * de aprovada). Nula: aparece assim que estiver no ar.
     */
    publicaEm: timestamp("publica_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_divulgacao_afiliado_em_analise")
      .on(t.campaignId, t.affiliateId)
      .where(sql`status = 'em_analise' and affiliate_id is not null`),
    uniqueIndex("uq_divulgacao_apostador_em_analise")
      .on(t.campaignId, t.buyerId)
      .where(sql`status = 'em_analise' and buyer_id is not null`),
    index("idx_divulgacoes_org").on(t.organizationId, t.status, t.createdAt),
    index("idx_divulgacoes_rifa").on(t.campaignId, t.status, t.createdAt),
  ],
);

/**
 * As fotos da peça do apostador (até `DIVULGACAO_FOTOS_MAX`). Ficam no banco,
 * reprocessadas (JPEG de até 1600 px, sem metadados), e saem só por três
 * portas: a pública, com a peça no ar e visível; a do painel, no recorte da
 * organização; e a do próprio autor.
 */
export const divulgacaoFotos = pgTable(
  "divulgacao_fotos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    divulgacaoId: uuid("divulgacao_id")
      .notNull()
      .references(() => divulgacoes.id, { onDelete: "cascade" }),
    posicao: integer("posicao").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_divulgacao_foto_posicao").on(t.divulgacaoId, t.posicao)],
);

/**
 * O vídeo próprio do afiliado na peça de divulgação (um por peça, no lugar das
 * fotos). Vai como veio (sem transcode), medido no servidor: duração e
 * medidas saem do arquivo, nunca do navegador. A peça com vídeo sempre passa
 * pela organização (a varredura do Pix por fora só lê texto). Recusada ou
 * retirada, o vídeo sai na mesma transação. O pôster vem depois, em segundo
 * plano, e fica nulo se não houver `ffmpeg`.
 */
export const divulgacaoVideos = pgTable("divulgacao_videos", {
  divulgacaoId: uuid("divulgacao_id")
    .primaryKey()
    .references(() => divulgacoes.id, { onDelete: "cascade" }),
  /** Muda a cada troca: o pôster só grava no vídeo que ele veio tirar. */
  id: uuid("id").notNull().defaultRandom(),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  segundos: real("segundos").notNull(),
  largura: integer("largura").notNull(),
  altura: integer("altura").notNull(),
  poster: bytea("poster"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Assistente de IA (Chatbase) — conversa e uso
 * ------------------------------------------------------------------ */

/**
 * A conversa de cada pessoa com o assistente: só o id da conversa no Chatbase
 * (o texto mora lá e é lido pela API quando a coluna abre) e o agente dela —
 * trocar o agente em Aparência faz a conversa velha ser esquecida, em vez de
 * travar o assistente. Uma por pessoa; "Nova conversa" apaga a linha.
 */
export const iaConversas = pgTable("ia_conversas", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  agenteId: text("agente_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  atualizadaEm: timestamp("atualizada_em").notNull().defaultNow(),
});

/**
 * O uso do assistente, mensagem a mensagem: os créditos que o Chatbase diz ter
 * gasto, em **milésimos** (exato; quem arredonda é a cobrança, sobre a soma).
 * Nulo = o Chatbase não informou ("sem medida", com aviso no log). Chave única
 * pela mensagem — a mesma resposta nunca conta duas vezes. `titular` é quem
 * responde pelo uso (plataforma, organização ou afiliado); a cobrança debita
 * daqui.
 */
export const iaUso = pgTable(
  "ia_uso",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mensagemId: text("mensagem_id").notNull(),
    titularTipo: text("titular_tipo").notNull(),
    titularId: uuid("titular_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    milicreditos: integer("milicreditos"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_ia_uso_mensagem").on(t.mensagemId),
    index("idx_ia_uso_titular").on(t.titularTipo, t.titularId, t.createdAt),
    // O relatório da plataforma lê por período, de todos os titulares.
    index("idx_ia_uso_data").on(t.createdAt),
  ],
);

/**
 * Cada ação que o assistente pediu ("client action" do Chatbase): quem
 * conversava, a entrada que a IA mandou (dado, nunca instrução) e o que
 * aconteceu. Ler executa na hora (`executada`); gravar nasce `pendente` e só
 * a pessoa confirma — `UPDATE` condicional (`pendente` → `executando`), então
 * dois cliques são uma execução. A chave (conversa, chamada) impede a mesma
 * chamada de entrar duas vezes. Regras em `shared/iaAcoes.ts`.
 */
/**
 * Vídeos que estão no Cloudflare Stream sem dono garantido: entram no envio
 * (antes de qualquer espera) e ao pedir para apagar, e saem quando o Stream
 * confirma o DELETE ou quando a mídia guarda o `uid`. O relógio
 * (`limparStreamPendente`) apaga o que ficou sem dono — o processo que caiu no
 * meio ou o DELETE que falhou —, porque o Stream cobra por minuto guardado.
 */
export const streamPendentes = pgTable("stream_pendentes", {
  uid: text("uid").primaryKey(),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
  tentativas: integer("tentativas").notNull().default(0),
});

export const iaAcoes = pgTable(
  "ia_acoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titularTipo: text("titular_tipo").notNull(),
    titularId: uuid("titular_id"),
    agenteId: text("agente_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    nome: text("nome").notNull(),
    entrada: jsonb("entrada"),
    /** O que a pessoa leu para confirmar, montado pelo servidor. */
    resumo: text("resumo"),
    /** pendente | executando | executada | falhou | recusada | expirada | recusada_pelo_sistema */
    status: text("status").notNull(),
    resultado: jsonb("resultado"),
    criadaEm: timestamp("criada_em").notNull().defaultNow(),
    decididaEm: timestamp("decidida_em"),
  },
  (t) => [
    uniqueIndex("uq_ia_acao_chamada").on(t.conversationId, t.toolCallId),
    index("idx_ia_acoes_pessoa").on(t.userId, t.status, t.criadaEm),
  ],
);

/**
 * A conta de quem paga o assistente (organização ou afiliado — o master não
 * paga): franquia do ciclo e créditos avulsos, em milésimos de crédito, como
 * o uso. Uma linha por titular (a chave decide; criada com `ON CONFLICT DO
 * NOTHING`). Toda mudança anda com uma linha em `ia_lancamentos`, na mesma
 * transação. Regras em `shared/iaCobranca.ts`.
 */
export const iaContas = pgTable(
  "ia_contas",
  {
    /** organizacao | afiliado */
    titularTipo: text("titular_tipo").notNull(),
    titularId: uuid("titular_id").notNull(),
    franquiaMilicreditos: bigint("franquia_milicreditos", { mode: "number" }).notNull().default(0),
    /** Pode ficar negativo por uma mensagem (o custo só é sabido depois): é dívida. */
    avulsoMilicreditos: bigint("avulso_milicreditos", { mode: "number" }).notNull().default(0),
    cicloAte: timestamp("ciclo_ate"),
    atualizadaEm: timestamp("atualizada_em").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.titularTipo, t.titularId] })],
);

/** Pix da assinatura ou de um pacote avulso, pago à plataforma (sem split). */
export const iaPagamentos = pgTable(
  "ia_pagamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titularTipo: text("titular_tipo").notNull(),
    titularId: uuid("titular_id").notNull(),
    /** Quem pediu o Pix (auditoria). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** assinatura | avulso */
    tipo: text("tipo").notNull(),
    /** Faixa própria (`IA_CODIGO_MIN`), fora da dos pedidos, do carrinho e da recarga. */
    codigo: integer("codigo").notNull(),
    valorCents: integer("valor_cents").notNull(),
    /** O que o Pix dá, fotografado no pedido: mudar a tabela não mexe no que já foi cobrado. */
    milicreditos: bigint("milicreditos", { mode: "number" }).notNull(),
    /** pendente | paga | estornada */
    status: text("status").notNull().default("pendente"),
    provider: text("provider"),
    chargeId: text("charge_id"),
    pixQr: text("pix_qr"),
    pixCopyPaste: text("pix_copy_paste"),
    expiresAt: timestamp("expires_at"),
    pagaEm: timestamp("paga_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_ia_pagamento_codigo").on(t.codigo),
    uniqueIndex("uq_ia_pagamento_charge").on(t.chargeId),
    index("idx_ia_pagamentos_titular").on(t.titularTipo, t.titularId, t.createdAt),
    index("idx_ia_pagamentos_paga_em").on(t.pagaEm),
  ],
);

/**
 * Livro da conta do assistente: assinatura e pacote pagos, cada mensagem
 * debitada e a franquia vencida. A `chave` é única — o webhook repetido não
 * credita duas vezes e a mesma mensagem não debita duas vezes.
 */
export const iaLancamentos = pgTable(
  "ia_lancamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titularTipo: text("titular_tipo").notNull(),
    titularId: uuid("titular_id").notNull(),
    /** Positivo entra, negativo sai. Em milésimos de crédito. */
    franquiaMilicreditos: bigint("franquia_milicreditos", { mode: "number" }).notNull().default(0),
    avulsoMilicreditos: bigint("avulso_milicreditos", { mode: "number" }).notNull().default(0),
    /** assinatura | avulso | uso | vencimento | estorno */
    motivo: text("motivo").notNull(),
    chave: text("chave").notNull(),
    descricao: text("descricao"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_ia_lancamento_chave").on(t.chave), index("idx_ia_lancamentos_titular").on(t.titularTipo, t.titularId, t.createdAt)],
);

/**
 * Pix que chegou tarde: o pagamento foi confirmado pelo provedor, mas o
 * pedido já não podia virar cota (reserva vencida, ou rifa já sorteada). É
 * dinheiro que entrou sem bilhete — fica numa fila para a plataforma
 * devolver. Um por pedido (o webhook repetido não duplica).
 */
export const pixTardios = pgTable(
  "pix_tardios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull(),
    provider: text("provider"),
    chargeId: text("charge_id"),
    valorCents: integer("valor_cents").notNull(),
    /** reserva_vencida | depois_do_sorteio */
    motivo: text("motivo").notNull(),
    /** pendente | devolvendo | devolvido | resolvido */
    status: text("status").notNull().default("pendente"),
    erro: text("erro"),
    observacao: text("observacao"),
    resolvidoPor: uuid("resolvido_por"),
    resolvidoEm: timestamp("resolvido_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_pix_tardio_pedido").on(t.orderId), index("idx_pix_tardios_status").on(t.status, t.createdAt)],
);

/**
 * Retenção cautelar de saldo (contrato com a promotora): enquanto `ativa`,
 * nada que a plataforma deve à organização sai da conta dela — saldo de
 * patrocínio em dinheiro, crédito do presente, reembolso do saldo aprovado.
 * Nasce no banimento (mesma transação) ou pela plataforma; termina liberada
 * ou abatida. Uma ativa por organização (o índice decide). Os valores são o
 * retrato da hora em que nasceu; o de agora é lido na tela.
 */
export const retencoesCautelares = pgTable(
  "retencoes_cautelares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** ativa | liberada | abatida */
    status: text("status").notNull().default("ativa"),
    /** banimento | manual */
    origem: text("origem").notNull(),
    motivo: text("motivo").notNull(),
    denunciaId: uuid("denuncia_id"),
    patrocinioCents: integer("patrocinio_cents").notNull().default(0),
    presenteCents: integer("presente_cents").notNull().default(0),
    reembolsoCents: integer("reembolso_cents").notNull().default(0),
    criadoPor: uuid("criado_por"),
    criadoEm: timestamp("criado_em").notNull().defaultNow(),
    decisao: text("decisao"),
    abatidoCents: integer("abatido_cents"),
    decididoPor: uuid("decidido_por"),
    decididoEm: timestamp("decidido_em"),
  },
  (t) => [
    uniqueIndex("uq_retencao_ativa_por_org").on(t.organizationId).where(sql`status = 'ativa'`),
    index("idx_retencoes_status").on(t.status, t.criadoEm),
  ],
);

/**
 * A fila de trabalho pesado (Fase F, `shared/fila.ts`): o site enfileira, o
 * trabalhador (`server/worker.ts`, processo à parte) toma com `FOR UPDATE SKIP
 * LOCKED` e devolve a saída, e o site a recebe. Uma linha por trabalho; a
 * chave impede dois iguais **em aberto** (índice parcial), e o trabalho sai
 * junto com a rifa (cascata).
 */
export const trabalhos = pgTable(
  "trabalhos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** O tipo (`reels_gerado`): o trabalhador só toma o que sabe fazer. */
    tipo: text("tipo").notNull(),
    chave: text("chave").notNull(),
    /** pendente | executando | pronto | recebendo | concluido | falhou */
    situacao: text("situacao").notNull().default("pendente"),
    /** Parâmetros pequenos, sem dado pessoal. */
    dados: jsonb("dados").notNull().default({}),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    pedidoPor: uuid("pedido_por"),
    tentativas: integer("tentativas").notNull().default(0),
    disponivelEm: timestamp("disponivel_em").notNull().defaultNow(),
    tomadoEm: timestamp("tomado_em"),
    tomadoPor: text("tomado_por"),
    erro: text("erro"),
    resultado: jsonb("resultado"),
    criadoEm: timestamp("criado_em").notNull().defaultNow(),
    terminadoEm: timestamp("terminado_em"),
  },
  (t) => [
    uniqueIndex("uq_trabalho_aberto").on(t.chave).where(sql`situacao in ('pendente', 'executando', 'pronto', 'recebendo')`),
    index("idx_trabalhos_fila").on(t.situacao, t.disponivelEm),
    index("idx_trabalhos_rifa").on(t.campaignId, t.criadoEm),
  ],
);

/** As entradas e a saída de cada trabalho, no banco (o trabalhador não alcança o volume do site). */
export const trabalhoArquivos = pgTable(
  "trabalho_arquivos",
  {
    trabalhoId: uuid("trabalho_id")
      .notNull()
      .references(() => trabalhos.id, { onDelete: "cascade" }),
    /** entrada | saida */
    papel: text("papel").notNull(),
    nome: text("nome").notNull(),
    bytes: bytea("bytes").notNull(),
  },
  (t) => [primaryKey({ columns: [t.trabalhoId, t.papel, t.nome] })],
);

/** O último aviso de cada trabalhador ("estou no ar"): a tela diz quando o gerador está parado. */
export const trabalhadores = pgTable("trabalhadores", {
  nome: text("nome").primaryKey(),
  vistoEm: timestamp("visto_em").notNull().defaultNow(),
  tipos: text("tipos").array().notNull().default(sql`'{}'::text[]`),
});
