/**
 * Carrega o assistente (Chatbase) **só depois de um toque** e só nos painéis
 * do master e do organizador: script de terceiro não entra na página sem a
 * pessoa pedir, e ao sair do painel tudo dele é desmontado — a vitrine pública
 * nunca mostra o balão, nem com a identidade de quem estava no painel.
 *
 * Quem se identifica é a sessão que o servidor entregou (`userId` + `userHash`,
 * este com o segredo que nunca chega aqui). Nada de nome, e-mail ou telefone.
 */
export interface SessaoDoAssistente {
  ligado: boolean;
  agenteId?: string;
  userId?: string;
  userHash?: string;
  metadata?: Record<string, string>;
}

type ChatbaseFn = ((...args: unknown[]) => unknown) & { q?: unknown[][] };
const W = () => window as unknown as { chatbase?: ChatbaseFn; chatbaseUserConfig?: unknown };

/** O mesmo carregador oficial: uma fila que o script, ao chegar, esvazia. */
function prepararFila() {
  const w = W();
  if (w.chatbase) return;
  const fila: ChatbaseFn = (...args) => {
    (fila.q = fila.q ?? []).push(args);
  };
  w.chatbase = new Proxy(fila, {
    get(alvo, prop) {
      if (prop === "q") return alvo.q;
      return (...args: unknown[]) => alvo(prop, ...args);
    },
  });
}

export function abrirAssistente(s: SessaoDoAssistente) {
  if (!s.ligado || !s.agenteId || !s.userId || !s.userHash) return;
  const w = W();
  w.chatbaseUserConfig = { user_id: s.userId, user_hash: s.userHash, user_metadata: s.metadata ?? {} };
  prepararFila();
  if (!document.getElementById(s.agenteId)) {
    const script = document.createElement("script");
    script.src = "https://www.chatbase.co/embed.min.js";
    script.id = s.agenteId;
    script.setAttribute("domain", "www.chatbase.co");
    document.body.appendChild(script);
  }
  const c = w.chatbase as unknown as { (...a: unknown[]): unknown; open?: () => void };
  c("identify", { user_id: s.userId, user_hash: s.userHash, user_metadata: s.metadata ?? {} });
  c("open");
}

export function fecharAssistente() {
  try {
    (W().chatbase as unknown as { (...a: unknown[]): unknown } | undefined)?.("close");
  } catch {
    /* o script pode ainda não ter chegado */
  }
}

/** Tira do documento tudo o que o Chatbase pôs: script, balão e janela. */
export function removerAssistente(agenteId?: string) {
  if (agenteId) document.getElementById(agenteId)?.remove();
  document.querySelectorAll<HTMLElement>('[id^="chatbase-"]').forEach((el) => el.remove());
  const w = W();
  delete w.chatbase;
  delete w.chatbaseUserConfig;
}
