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
import { and, eq, sql, isNull, isNotNull, type SQL } from "drizzle-orm";
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

/**
 * A carteira de clientes. Arquivada some da lista padrão, mas continua no
 * banco — e nos relatórios —, e aparece no filtro `arquivadas`.
 */
export type SituacaoOrg = "ativas" | "arquivadas" | "todas";

export async function listOrganizations(situacao: SituacaoOrg = "ativas") {
  const filtro =
    situacao === "todas"
      ? undefined
      : situacao === "arquivadas"
        ? isNotNull(organizations.archivedAt)
        : isNull(organizations.archivedAt);
  return db.select().from(organizations).where(filtro).orderBy(organizations.name);
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

  // Reativar uma arquivada pelo botão de suspender a traria de volta pela
  // metade: ativa, mas fora da lista. Quem traz de volta é "restaurar".
  const [alterada] = await db
    .update(organizations)
    .set(patch)
    .where(
      patch.active === true
        ? and(eq(organizations.id, id), isNull(organizations.archivedAt))
        : eq(organizations.id, id),
    )
    .returning();

  if (!alterada) {
    if (patch.active === true && (await organizacaoArquivada(id))) {
      throw new OrgScopeError("Organização arquivada: restaure antes de reativar.", 409);
    }
    throw new OrgScopeError("Organização não encontrada.");
  }
  return alterada;
}

async function organizacaoArquivada(id: string): Promise<boolean> {
  const [org] = await db
    .select({ archivedAt: organizations.archivedAt })
    .from(organizations)
    .where(eq(organizations.id, id));
  return Boolean(org?.archivedAt);
}

/**
 * Arquiva: tira da carteira ativa e fecha a porta de quem é dela, sem apagar
 * nada. Venda, cota, comissão e cobrança continuam onde estavam — é o
 * histórico que a contabilidade e o comprador conferem.
 *
 * Rifa no ar (ou encerrada esperando sorteio) barra o arquivamento: há quem
 * pagou e espera o resultado, e arquivar a promotora no meio disso deixaria
 * o comprador sem ninguém do outro lado. A checagem e a gravação são o mesmo
 * `UPDATE` — consultar antes e gravar depois deixaria uma rifa ser publicada
 * no intervalo.
 */
export async function archiveOrganization(id: string) {
  const resultado = await db.execute(sql`
    UPDATE organizations
       SET archived_at = now(), active = false
     WHERE id = ${id}::uuid
       AND archived_at IS NULL
       AND NOT EXISTS (
             SELECT 1 FROM campaigns
              WHERE organization_id = ${id}::uuid
                AND status IN ('published', 'closed'))
    RETURNING id, name
  `);
  const arquivada = resultado.rows[0] as { id: string; name: string } | undefined;
  if (arquivada) return arquivada;

  // Não gravou: agora sim vale perguntar por quê, só para explicar.
  const [org] = await db
    .select({ archivedAt: organizations.archivedAt })
    .from(organizations)
    .where(eq(organizations.id, id));
  if (!org) throw new OrgScopeError("Organização não encontrada.");
  if (org.archivedAt) throw new OrgScopeError("Esta organização já está arquivada.", 409);
  throw new OrgScopeError(
    "Esta organização tem rifa no ar ou esperando sorteio. Sorteie ou encerre antes de arquivar.",
    409,
  );
}

/** Volta para a carteira, suspensa: reativar é uma segunda decisão. */
export async function restoreOrganization(id: string) {
  const [restaurada] = await db
    .update(organizations)
    .set({ archivedAt: null })
    .where(and(eq(organizations.id, id), isNotNull(organizations.archivedAt)))
    .returning({ id: organizations.id, name: organizations.name });
  if (!restaurada) throw new OrgScopeError("Organização arquivada não encontrada.");
  return restaurada;
}
