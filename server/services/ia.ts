/**
 * Assistente de IA (Chatbase): a sessão que o painel entrega ao navegador.
 *
 * O navegador carrega o script do Chatbase e se identifica com `user_id` +
 * `user_hash`. O hash (HMAC-SHA256 do id com o segredo de verificação) **só
 * nasce no servidor** (`iaIdentidade.ts`): o segredo vem de
 * `CHATBASE_IDENTITY_SECRET` e nunca sai dele. Sem o segredo, o assistente não
 * liga (não existe modo "sem verificação").
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "@shared/schema";
import { idDaIA, metadadosDaIA, quemTemIA, type ConfigIA, type SessaoDaIA } from "@shared/ia";
import type { Role } from "@shared/access";
import { getPlataforma } from "./settings";
import { hashDaIA, segredoDaIA } from "./iaIdentidade";

/** O que a plataforma vê ao configurar: a configuração e se o segredo está no ambiente (nunca o valor). */
export async function configDaIA(): Promise<{ config: ConfigIA; segredoNoAmbiente: boolean }> {
  return { config: (await getPlataforma()).assistenteIA, segredoNoAmbiente: segredoDaIA() !== null };
}

export async function sessaoDaIA(user: { id: string; role: Role; organizationId?: string | null }): Promise<SessaoDaIA> {
  const config = (await getPlataforma()).assistenteIA;
  const segredo = segredoDaIA();
  if (!segredo || !quemTemIA(user.role, config)) return { ligado: false };
  let organizacao: string | null = null;
  if (user.role === "organizer" && user.organizationId) {
    const [o] = await db.select({ nome: organizations.name }).from(organizations).where(eq(organizations.id, user.organizationId));
    organizacao = o?.nome ?? null;
  }
  const userId = idDaIA(user.id);
  return {
    ligado: true,
    agenteId: config.agenteId,
    userId,
    userHash: hashDaIA(userId, segredo),
    metadata: metadadosDaIA(user.role, organizacao),
  };
}
