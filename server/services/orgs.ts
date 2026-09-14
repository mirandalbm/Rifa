/**
 * Organizações — e o isolamento entre elas.
 *
 * A regra é uma só: **`null` é a plataforma, qualquer outra coisa é recorte.**
 * O administrador geral entra com `organizationId` nulo e enxerga tudo; o
 * organizador entra com a organização dele e não alcança mais nada.
 *
 * O perigo aqui não é a rota que esquece de barrar — é a que esquece de
 * *filtrar*. Barrar errado dá 403, que alguém reclama; filtrar errado entrega
 * pedido, telefone e caixa de outro organizador em silêncio. Por isso este
 * arquivo não oferece "pegue o id da organização": oferece
 * `assertCampaignInScope()` e `campaignScope()`, que já vêm com a decisão
 * tomada. Rota nova que precise de dado de campanha passa por um dos dois.
 */
import { eq, sql, type SQL } from "drizzle-orm";
import type { Request } from "express";
import { db } from "../db";
import { campaigns, organizations, affiliates, users } from "@shared/schema";
import type { OrganizerInfo } from "@shared/schema";

export class OrgScopeError extends Error {
  constructor(message: string, readonly status = 404) {
    super(message);
    this.name = "OrgScopeError";
  }
}

/**
 * A organização desta requisição, ou `null` para a plataforma.
 *
 * Só o administrador geral tem nulo — e isso é verificado na entrada
 * (`server/auth.ts`), não aqui: organizador sem organização nem sessão abre.
 */
export function orgOf(req: Request): string | null {
  return req.user?.organizationId ?? null;
}

/** É o administrador geral da plataforma? */
export function isPlatform(req: Request): boolean {
  return req.user?.role === "admin";
}

/**
 * Barra a rota que é da plataforma, não do organizador: antifraude, meios de
 * pagamento, auditoria, a lista de organizações.
 *
 * Devolve 403 de propósito, e não 404: estas rotas existem, o organizador só
 * não manda nelas. Esconder a existência aqui não protege nada e confunde
 * quem está integrando.
 */
export function requirePlatformAdmin(req: Request) {
  if (!isPlatform(req)) {
    throw new OrgScopeError(
      "Esta área é do administrador da plataforma.",
      403,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Recorte das consultas
 * ------------------------------------------------------------------ */

/**
 * Fragmento para o WHERE de qualquer consulta que passe por campanha.
 *
 * Plataforma recebe fragmento vazio — é o único caso em que ver tudo é o
 * comportamento certo.
 */
export function campaignScope(req: Request, coluna: SQL): SQL {
  const org = orgOf(req);
  return org ? sql`AND ${coluna} = ${org}::uuid` : sql``;
}

/**
 * Confere que a campanha é desta organização e devolve a campanha.
 *
 * **404, não 403.** Para quem não é dono, a campanha do vizinho não existe —
 * responder "existe, mas não é sua" já entrega que o id é válido, e com isso
 * dá para varrer a plataforma contando campanhas alheias.
 */
export async function assertCampaignInScope(req: Request, campaignId: string) {
  const [campanha] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));

  if (!campanha) throw new OrgScopeError("Campanha não encontrada.");

  const org = orgOf(req);
  if (org && campanha.organizationId !== org) {
    throw new OrgScopeError("Campanha não encontrada.");
  }

  return campanha;
}

/**
 * O mesmo para afiliado e cambista: eles pendurados no usuário, o usuário
 * pendurado na organização.
 */
export async function assertAffiliateInScope(req: Request, affiliateId: string) {
  const [linha] = await db
    .select({ afiliado: affiliates, organizationId: users.organizationId })
    .from(affiliates)
    .innerJoin(users, eq(users.id, affiliates.userId))
    .where(eq(affiliates.id, affiliateId));

  if (!linha) throw new OrgScopeError("Cadastro não encontrado.");

  const org = orgOf(req);
  if (org && linha.organizationId !== org) {
    throw new OrgScopeError("Cadastro não encontrado.");
  }

  return linha.afiliado;
}

/**
 * A organização que uma campanha nova deve receber.
 *
 * Organizador só cria na própria. O administrador geral precisa dizer em qual
 * — sem isso a campanha nasceria órfã, e `campaigns.organization_id` é NOT
 * NULL justamente para isso não acontecer.
 */
export function organizationForNewCampaign(
  req: Request,
  informada: string | undefined,
): string {
  const org = orgOf(req);
  if (org) return org;

  if (!informada) {
    throw new OrgScopeError(
      "Escolha a organização promotora da campanha.",
      400,
    );
  }
  return informada;
}

/* ------------------------------------------------------------------ *
 * Identidade da administradora — o que sai no bilhete
 * ------------------------------------------------------------------ */

/**
 * Antes era configuração global; agora é da organização, porque é ela que a
 * Lei 5.768/71 autoriza. O bilhete de cada rifa traz a administradora daquela
 * rifa, não a da plataforma.
 */
export async function organizerInfoOf(
  organizationId: string,
): Promise<OrganizerInfo> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId));

  if (!org) throw new OrgScopeError("Organização não encontrada.");

  return {
    nome: org.name,
    cnpj: org.cnpj ?? undefined,
    contato: org.contato ?? undefined,
    cidade: org.cidade ?? undefined,
    observacao: org.observacao ?? undefined,
  };
}

/* ------------------------------------------------------------------ *
 * Cadastro
 * ------------------------------------------------------------------ */

export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function listOrganizations() {
  return db.select().from(organizations).orderBy(organizations.name);
}

export async function createOrganization(input: {
  name: string;
  cnpj?: string;
  contato?: string;
  cidade?: string;
  observacao?: string;
}) {
  const name = input.name?.trim();
  if (!name || name.length < 2) {
    throw new OrgScopeError("Informe o nome da organização.", 400);
  }

  const slug = slugify(name);
  if (!slug) throw new OrgScopeError("Nome inválido para gerar o endereço.", 400);

  const [existe] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug));
  if (existe) {
    throw new OrgScopeError("Já existe uma organização com este nome.", 409);
  }

  const [criada] = await db
    .insert(organizations)
    .values({
      name,
      slug,
      cnpj: input.cnpj?.trim() || null,
      contato: input.contato?.trim() || null,
      cidade: input.cidade?.trim() || null,
      observacao: input.observacao?.trim() || null,
    })
    .returning();

  return criada;
}

export async function updateOrganization(
  id: string,
  input: Partial<{
    name: string;
    cnpj: string;
    contato: string;
    cidade: string;
    observacao: string;
    active: boolean;
  }>,
) {
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2) throw new OrgScopeError("Informe o nome da organização.", 400);
    patch.name = name;
  }
  // O slug não muda junto com o nome: ele já foi impresso em bilhete e pode
  // estar em link. Renomear a administradora não pode quebrar endereço.
  for (const campo of ["cnpj", "contato", "cidade", "observacao"] as const) {
    if (input[campo] !== undefined) patch[campo] = input[campo]?.trim() || null;
  }
  if (input.active !== undefined) patch.active = input.active;

  if (Object.keys(patch).length === 0) {
    throw new OrgScopeError("Nada para alterar.", 400);
  }

  const [alterada] = await db
    .update(organizations)
    .set(patch)
    .where(eq(organizations.id, id))
    .returning();

  if (!alterada) throw new OrgScopeError("Organização não encontrada.");
  return alterada;
}
