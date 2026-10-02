/**
 * Assistente de IA nos painéis (Chatbase) — regras puras, lidas pelo servidor
 * (que decide quem recebe a sessão) e pela tela (que mostra o botão).
 *
 * Só dois painéis: o **administrador master** e o **organizador**. Afiliado e
 * cambista ficam de fora. Nasce desligado, e o organizador tem um interruptor
 * à parte (`paraOrganizador`, também desligado): a IA é receita da plataforma
 * — paga para o organizador, gratuita para o master —, e enquanto a cobrança
 * não existir, ligar para o organizador seria uso de graça.
 *
 * O que a IA recebe de nós é só **quem está falando** (identificador opaco,
 * papel e nome da organização). Nenhum dado pessoal de comprador entra no
 * contexto, e o recorte do painel (`orgOf`) vale para o que ela vier a fazer.
 */
import type { Role } from "./access";

export interface ConfigIA {
  /** Sem isto o botão não existe e o servidor não entrega sessão. */
  ligado: boolean;
  /** O id do agente no Chatbase (aparece no script de incorporação). */
  agenteId: string;
  /** O organizador também vê o assistente. Nasce desligado (cobrança pendente). */
  paraOrganizador: boolean;
}

export const CONFIG_IA_PADRAO: ConfigIA = { ligado: false, agenteId: "", paraOrganizador: false };

/** O id do agente vai parar numa tag `<script>`: só letras, números, `_` e `-`. */
export const AGENTE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const erro = (m: string) => Object.assign(new Error(m), { status: 400 });

/** Só as chaves conhecidas: isto vem do corpo da requisição. */
export function validarConfigIA(entrada: unknown): ConfigIA {
  if (entrada === undefined || entrada === null) return CONFIG_IA_PADRAO;
  if (typeof entrada !== "object") throw erro("Configuração do assistente inválida.");
  const e = entrada as Record<string, unknown>;
  const agenteId = typeof e.agenteId === "string" ? e.agenteId.trim() : "";
  if (agenteId && !AGENTE_ID_RE.test(agenteId)) {
    throw erro("O id do agente tem de 8 a 64 caracteres: letras, números, _ e -.");
  }
  const ligado = e.ligado === true;
  if (ligado && !agenteId) throw erro("Informe o id do agente do Chatbase antes de ligar o assistente.");
  return { ligado, agenteId, paraOrganizador: e.paraOrganizador === true };
}

/** Quem enxerga o assistente: o master sempre (com a IA ligada); o organizador só se a plataforma liberar. */
export function quemTemIA(role: Role | undefined, config: ConfigIA): boolean {
  if (!config.ligado || !config.agenteId) return false;
  if (role === "admin") return true;
  if (role === "organizer") return config.paraOrganizador;
  return false;
}

/** O identificador que o Chatbase conhece: opaco, nunca e-mail nem nome. */
export function idDaIA(userId: string): string {
  return `rifa-u-${userId}`;
}

/** O contexto de quem fala. Nada de nome de pessoa, e-mail, telefone ou CPF. */
export function metadadosDaIA(role: Role, organizacao?: string | null): Record<string, string> {
  const m: Record<string, string> = { papel: role === "admin" ? "administrador master" : "organizador" };
  const org = (organizacao ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 80);
  if (org && role !== "admin") m.organizacao = org;
  return m;
}
