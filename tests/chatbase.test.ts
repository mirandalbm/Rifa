import { describe, expect, it } from "vitest";
import { CHATBASE_API_PADRAO, ChatbaseError, ClienteChatbase, baseDoChatbase, chaveValida } from "../server/services/chatbase";

const CHAVE = "chave-secreta-de-teste";
type Chamada = { url: string; metodo: string; auth: string | null; corpo: any };

function falso(resposta: (c: Chamada) => Response | Promise<Response>) {
  const chamadas: Chamada[] = [];
  const f = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const c: Chamada = {
      url: String(entrada),
      metodo: init?.method ?? "GET",
      auth: new Headers(init?.headers).get("authorization"),
      corpo: init?.body ? JSON.parse(String(init.body)) : null,
    };
    chamadas.push(c);
    return resposta(c);
  }) as typeof fetch;
  return { f, chamadas };
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

const RESPOSTA = {
  data: {
    id: "msg_1",
    role: "assistant",
    parts: [{ type: "text", text: "Olá! Como posso ajudar?" }],
    metadata: { userMessageId: "msg_0", conversationId: "conv_1", userId: "rifa-u-1", finishReason: "stop", usage: { credits: 2 } },
  },
};

describe("cliente do Chatbase: enviar", () => {
  it("manda a mensagem ao agente, com a chave só no cabeçalho, e lê texto, conversa e créditos", async () => {
    const s = falso(() => json(RESPOSTA));
    const c = new ClienteChatbase({ chave: CHAVE, fetch: s.f });
    const r = await c.enviar({ agenteId: "agente_abc-123", mensagem: "oi", userId: "rifa-u-1" });
    expect(r).toEqual({ id: "msg_1", texto: "Olá! Como posso ajudar?", conversationId: "conv_1", milicreditos: 2000 });
    expect(s.chamadas).toHaveLength(1);
    expect(s.chamadas[0].url).toBe(`${CHATBASE_API_PADRAO}/agents/agente_abc-123/chat`);
    expect(s.chamadas[0].metodo).toBe("POST");
    expect(s.chamadas[0].auth).toBe(`Bearer ${CHAVE}`);
    expect(s.chamadas[0].url).not.toContain(CHAVE);
    expect(s.chamadas[0].corpo).toEqual({ message: "oi", stream: false, userId: "rifa-u-1" });
  });

  it("continua a conversa quando há id dela", async () => {
    const s = falso(() => json(RESPOSTA));
    await new ClienteChatbase({ chave: CHAVE, fetch: s.f }).enviar({ agenteId: "agente_abc-123", mensagem: "e agora?", conversationId: "conv_1", userId: "rifa-u-1" });
    expect(s.chamadas[0].corpo.conversationId).toBe("conv_1");
  });

  it("resposta sem os créditos: segue, mas fica 'sem medida' (null) e avisa no log", async () => {
    const semUso = JSON.parse(JSON.stringify(RESPOSTA));
    delete semUso.data.metadata.usage;
    const s = falso(() => json(semUso));
    const avisos: string[] = [];
    const original = console.warn;
    console.warn = (m: string) => avisos.push(String(m));
    try {
      const r = await new ClienteChatbase({ chave: CHAVE, fetch: s.f }).enviar({ agenteId: "agente_abc-123", mensagem: "oi", userId: "u" });
      expect(r.milicreditos).toBeNull();
    } finally {
      console.warn = original;
    }
    expect(avisos.some((a) => a.includes("sem usage.credits"))).toBe(true);
    expect(avisos.join(" ")).not.toContain(CHAVE);
  });

  it("o 404 do Chatbase vem marcado (agente ou conversa que não existe mais)", async () => {
    const s = falso(() => json({ error: { code: "NOT_FOUND" } }, 404));
    await expect(new ClienteChatbase({ chave: CHAVE, fetch: s.f }).enviar({ agenteId: "agente_abc-123", mensagem: "oi", conversationId: "velha", userId: "u" })).rejects.toMatchObject({ http: 404, status: 503 });
  });

  it("resposta sem id ou sem conversa é erro (nada é contado à toa)", async () => {
    const s = falso(() => json({ data: { parts: [] } }));
    await expect(new ClienteChatbase({ chave: CHAVE, fetch: s.f }).enviar({ agenteId: "agente_abc-123", mensagem: "oi", userId: "u" })).rejects.toBeInstanceOf(ChatbaseError);
  });

  it("os erros do Chatbase viram mensagens em português, sem a chave", async () => {
    const casos: [Response, number, RegExp][] = [
      [json({ error: { code: "CHAT_CREDITS_EXHAUSTED" } }, 402), 503, /sem créditos/],
      [json({ error: { code: "RATE_LIMIT_TOO_MANY_REQUESTS" } }, 429), 429, /Muitas mensagens/],
      [json({}, 401), 503, /mal configurado/],
      [json({}, 404), 503, /não foi encontrado/],
      [json({}, 500), 502, /não respondeu/],
    ];
    for (const [resposta, status, texto] of casos) {
      const s = falso(() => resposta.clone());
      const p = new ClienteChatbase({ chave: CHAVE, fetch: s.f }).enviar({ agenteId: "agente_abc-123", mensagem: "oi", userId: "u" });
      await expect(p).rejects.toMatchObject({ status });
      await expect(p).rejects.toThrow(texto);
      await p.catch((e: Error) => expect(e.message).not.toContain(CHAVE));
    }
  });

  it("rede caindo e prazo estourado viram erro de assistente, não exceção solta", async () => {
    const cai = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(new ClienteChatbase({ chave: CHAVE, fetch: cai }).enviar({ agenteId: "agente_abc-123", mensagem: "oi", userId: "u" })).rejects.toMatchObject({ status: 502 });
    const demora = ((_: unknown, init?: RequestInit) =>
      new Promise((_r, rejeita) => init?.signal?.addEventListener("abort", () => rejeita(Object.assign(new Error("tempo"), { name: "TimeoutError" }))))) as unknown as typeof fetch;
    await expect(new ClienteChatbase({ chave: CHAVE, fetch: demora, prazoMs: 30 }).enviar({ agenteId: "agente_abc-123", mensagem: "oi", userId: "u" })).rejects.toMatchObject({ status: 504 });
  });
});

describe("cliente do Chatbase: histórico", () => {
  it("lê as mensagens da conversa em ordem, só texto, e em milissegundos", async () => {
    const s = falso(() =>
      json({
        data: [
          { id: "m1", role: "user", parts: [{ type: "text", text: "oi" }], createdAt: 1770681600 },
          { id: "m2", role: "assistant", parts: [{ type: "text", text: "olá" }, { type: "tool-call", toolName: "x" }], createdAt: 1770681605 },
          { id: "m3", role: "system", parts: [{ type: "text", text: "interno" }], createdAt: 1770681606 },
          { id: "m4", role: "assistant", parts: [{ type: "tool-call", toolName: "x" }], createdAt: 1770681607 },
        ],
        pagination: { hasMore: false },
      }),
    );
    const lista = await new ClienteChatbase({ chave: CHAVE, fetch: s.f }).mensagens({ agenteId: "agente_abc-123", conversationId: "conv_1" });
    expect(lista).toEqual([
      { id: "m1", papel: "voce", texto: "oi", criadoEm: 1770681600_000 },
      { id: "m2", papel: "assistente", texto: "olá", criadoEm: 1770681605_000 },
    ]);
    expect(s.chamadas[0].url).toBe(`${CHATBASE_API_PADRAO}/agents/agente_abc-123/conversations/conv_1/messages?limit=50`);
  });
});

describe("cliente do Chatbase: configuração", () => {
  it("chave curta ou vazia não conta", () => {
    expect(chaveValida(undefined)).toBeNull();
    expect(chaveValida(null)).toBeNull();
    expect(chaveValida("   ")).toBeNull();
    expect(chaveValida("curta")).toBeNull();
    expect(chaveValida(" chave-de-verdade ")).toBe("chave-de-verdade");
  });

  it("em produção o endereço é sempre o do Chatbase; fora dela, a prova pode trocar", () => {
    expect(baseDoChatbase({ NODE_ENV: "production", CHATBASE_API_URL: "http://127.0.0.1:5099/api/v2" } as NodeJS.ProcessEnv)).toBe(CHATBASE_API_PADRAO);
    expect(baseDoChatbase({ NODE_ENV: "development", CHATBASE_API_URL: "http://127.0.0.1:5099/api/v2/" } as NodeJS.ProcessEnv)).toBe("http://127.0.0.1:5099/api/v2");
    expect(baseDoChatbase({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(CHATBASE_API_PADRAO);
  });
});
