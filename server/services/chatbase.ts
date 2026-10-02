/**
 * Cliente da API do Chatbase (v2). Só o servidor fala com ela: a chave
 * (`CHATBASE_API_KEY`) nunca sai daqui, nem em resposta nem em log.
 *
 * Fora de produção, `CHATBASE_API_URL` aponta para outro endereço — é como a
 * prova (`npm run ia`) troca o Chatbase por um de mentira. Em produção o
 * endereço é sempre o do Chatbase.
 */
import { milicreditosUsados, textoDasPartes, type MensagemDaIA } from "@shared/ia";
import { chamadasDasPartes, type ChamadaDeAcao, type SaidaDaAcao } from "@shared/iaAcoes";

export const CHATBASE_API_PADRAO = "https://www.chatbase.co/api/v2";

export class ChatbaseError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    /** O HTTP que o Chatbase respondeu (404 = agente ou conversa não existe mais). */
    readonly http?: number,
  ) {
    super(message);
    this.name = "ChatbaseError";
  }
}

/** A chave só vale com 8 caracteres ou mais (sem espaços nas pontas). Puro: não lê o ambiente. */
export function chaveValida(valor: string | null | undefined): string | null {
  const s = valor?.trim();
  return s && s.length >= 8 ? s : null;
}

/** A chave do ambiente, ou `null` — sem ela o assistente não conversa. */
export const chaveDoChatbase = (): string | null => chaveValida(process.env.CHATBASE_API_KEY);

export function baseDoChatbase(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV === "production") return CHATBASE_API_PADRAO;
  const outra = env.CHATBASE_API_URL?.trim().replace(/\/+$/, "");
  return outra || CHATBASE_API_PADRAO;
}

export interface RespostaDoChatbase {
  id: string;
  texto: string;
  conversationId: string;
  /** Milésimos de crédito; `null` quando o Chatbase não informou. */
  milicreditos: number | null;
  /** As ações que o agente pediu nesta resposta ("client actions"); vazio na resposta comum. */
  chamadas: ChamadaDeAcao[];
}

export interface OpcoesDoCliente {
  chave: string;
  base?: string;
  fetch?: typeof fetch;
  prazoMs?: number;
}

/** O código de erro que o Chatbase manda no corpo (formatos diferentes, lido com cuidado). */
function codigoDoErro(j: unknown): string {
  const o = (j ?? {}) as { error?: { code?: unknown } | string; code?: unknown };
  const c = typeof o.error === "object" && o.error ? o.error.code : o.code;
  return typeof c === "string" ? c : "";
}

export class ClienteChatbase {
  private f: typeof fetch;
  private base: string;
  private prazoMs: number;
  constructor(private o: OpcoesDoCliente) {
    this.f = o.fetch ?? fetch;
    this.base = (o.base ?? CHATBASE_API_PADRAO).replace(/\/+$/, "");
    this.prazoMs = o.prazoMs ?? 60_000;
  }

  private cabecalhos() {
    return { Authorization: `Bearer ${this.o.chave}`, "Content-Type": "application/json" };
  }

  private async pedir(caminho: string, init: RequestInit): Promise<unknown> {
    let r: Response;
    try {
      r = await this.f(this.base + caminho, { ...init, headers: this.cabecalhos(), signal: AbortSignal.timeout(this.prazoMs) });
    } catch (e) {
      const nome = (e as { name?: string })?.name;
      if (nome === "TimeoutError" || nome === "AbortError") throw new ChatbaseError("O assistente demorou demais para responder. Tente de novo.", 504);
      throw new ChatbaseError("Não deu para falar com o assistente agora. Tente de novo.", 502);
    }
    const j: unknown = await r.json().catch(() => null);
    if (r.ok) return j;
    const codigo = codigoDoErro(j);
    if (codigo === "CHAT_CREDITS_EXHAUSTED") {
      console.warn("[ia] Chatbase: os créditos da conta da plataforma acabaram.");
      throw new ChatbaseError("O assistente está sem créditos na plataforma. Avise o suporte.", 503);
    }
    if (r.status === 429) throw new ChatbaseError("Muitas mensagens ao mesmo tempo. Tente em instantes.", 429);
    if (r.status === 401 || r.status === 403) {
      console.warn(`[ia] Chatbase recusou a chave (HTTP ${r.status}).`);
      throw new ChatbaseError("O assistente está mal configurado. Avise o suporte.", 503);
    }
    if (r.status === 404) {
      console.warn("[ia] Chatbase: agente ou conversa não encontrado.");
      throw new ChatbaseError("O assistente não foi encontrado. Avise o suporte.", 503, 404);
    }
    console.warn(`[ia] Chatbase respondeu HTTP ${r.status}${codigo ? ` (${codigo})` : ""}.`);
    throw new ChatbaseError("O assistente não respondeu. Tente de novo.", 502);
  }

  /**
   * Uma mensagem, resposta inteira (sem streaming). Sem `mensagem` (só com a
   * conversa), o agente continua a partir do resultado de uma ação.
   */
  async enviar(p: { agenteId: string; mensagem?: string | null; conversationId?: string | null; userId: string }): Promise<RespostaDoChatbase> {
    const corpo: Record<string, unknown> = { stream: false, userId: p.userId };
    if (p.mensagem) corpo.message = p.mensagem;
    if (p.conversationId) corpo.conversationId = p.conversationId;
    const j = (await this.pedir(`/agents/${encodeURIComponent(p.agenteId)}/chat`, { method: "POST", body: JSON.stringify(corpo) })) as {
      data?: { id?: unknown; parts?: unknown; metadata?: { conversationId?: unknown; usage?: { credits?: unknown } } };
    } | null;
    const d = j?.data;
    const conversationId = typeof d?.metadata?.conversationId === "string" ? d.metadata.conversationId : "";
    const id = typeof d?.id === "string" ? d.id : "";
    if (!d || !id || !conversationId) throw new ChatbaseError("O assistente respondeu num formato inesperado. Tente de novo.", 502);
    const milicreditos = milicreditosUsados(d.metadata?.usage?.credits);
    if (milicreditos === null) console.warn(`[ia] Chatbase respondeu a mensagem ${id} sem usage.credits — fica sem medida.`);
    return { id, texto: textoDasPartes(d.parts), conversationId, milicreditos, chamadas: chamadasDasPartes(d.parts) };
  }

  /** O resultado de uma ação pedida pelo agente; depois, `enviar` sem mensagem para ele continuar. */
  async enviarResultado(p: { agenteId: string; conversationId: string; toolCallId: string; saida: SaidaDaAcao }): Promise<void> {
    await this.pedir(
      `/agents/${encodeURIComponent(p.agenteId)}/conversations/${encodeURIComponent(p.conversationId)}/tool-result`,
      { method: "POST", body: JSON.stringify({ toolCallId: p.toolCallId, output: p.saida }) },
    );
  }

  /** As mensagens mais recentes de uma conversa, na ordem em que aconteceram. */
  async mensagens(p: { agenteId: string; conversationId: string; limite?: number }): Promise<MensagemDaIA[]> {
    const limite = Math.min(100, Math.max(1, p.limite ?? 50));
    const j = (await this.pedir(
      `/agents/${encodeURIComponent(p.agenteId)}/conversations/${encodeURIComponent(p.conversationId)}/messages?limit=${limite}`,
      { method: "GET" },
    )) as { data?: unknown } | null;
    const lista = Array.isArray(j?.data) ? (j!.data as unknown[]) : [];
    const saida: MensagemDaIA[] = [];
    for (const m of lista) {
      const o = (m ?? {}) as { id?: unknown; role?: unknown; parts?: unknown; createdAt?: unknown };
      if (typeof o.id !== "string" || (o.role !== "user" && o.role !== "assistant")) continue;
      const texto = textoDasPartes(o.parts);
      if (!texto) continue;
      const seg = Number(o.createdAt);
      saida.push({ id: o.id, papel: o.role === "user" ? "voce" : "assistente", texto, criadoEm: Number.isFinite(seg) ? seg * 1000 : 0 });
    }
    return saida;
  }
}
