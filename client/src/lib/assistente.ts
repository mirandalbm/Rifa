/**
 * Carrega o assistente (Chatbase) **só depois de um toque** e só nos painéis
 * do master e do organizador: script de terceiro não entra na página sem a
 * pessoa pedir, e ao sair do painel tudo dele é desmontado — a vitrine pública
 * nunca mostra o balão, nem com a identidade de quem estava no painel.
 *
 * Quem se identifica é a sessão que o servidor entregou (`userId` + `userHash`,
 * este com o segredo que nunca chega aqui). Nada de nome, e-mail ou telefone.
 *
 * ATENÇÃO: o script do Chatbase roda **na página do painel**, com a sessão de
 * quem está nela — enxerga o que a tela mostra. É risco aceito (ver
 * `docs/SEGURANCA.md`), por isso o assistente nasce desligado.
 */
import type { SessaoDaIA } from "@shared/ia";

export type SessaoDoAssistente = SessaoDaIA;

type ChatbaseFn = ((...args: unknown[]) => unknown) & { q?: unknown[][] };
const W = () => window as unknown as { chatbase?: ChatbaseFn; chatbaseUserConfig?: unknown };

/** Sobe a cada remoção: o script que ainda estava a caminho sabe que chegou tarde. */
let geracao = 0;
let aberto = false;
let agenteCarregado: string | undefined;

/** A janela do assistente está aberta? Lembrado entre as telas do painel. */
export const assistenteAberto = () => aberto;

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
  const identidade = { user_id: s.userId, user_hash: s.userHash, user_metadata: s.metadata ?? {} };
  w.chatbaseUserConfig = identidade;
  prepararFila();
  if (!document.getElementById(s.agenteId)) {
    const minha = geracao;
    const script = document.createElement("script");
    script.src = "https://www.chatbase.co/embed.min.js";
    script.id = s.agenteId;
    script.setAttribute("domain", "www.chatbase.co");
    // Tirar o elemento não cancela um script que já estava a caminho: se o
    // painel foi deixado antes de ele chegar, ele chega, desenha o balão e
    // precisa ser desmontado de novo — senão apareceria na tela seguinte.
    script.addEventListener("load", () => {
      if (minha !== geracao) removerAssistente();
    });
    document.body.appendChild(script);
    agenteCarregado = s.agenteId;
  }
  const c = w.chatbase as ChatbaseFn;
  c("identify", identidade);
  c("open");
  aberto = true;
}

export function fecharAssistente() {
  aberto = false;
  try {
    (W().chatbase as ChatbaseFn | undefined)?.("close");
  } catch {
    /* o script pode ainda não ter chegado */
  }
}

/**
 * Tira do documento tudo o que o Chatbase pôs (script, balão e janela) e
 * esquece a identidade — o logout não deixa o próximo usuário da mesma aba
 * falando como o anterior.
 */
export function removerAssistente() {
  geracao++;
  aberto = false;
  try {
    (W().chatbase as ChatbaseFn | undefined)?.("resetUser");
  } catch {
    /* sem script, nada a esquecer */
  }
  if (agenteCarregado) document.getElementById(agenteCarregado)?.remove();
  agenteCarregado = undefined;
  document.querySelectorAll<HTMLElement>('[id^="chatbase-"]').forEach((el) => el.remove());
  const w = W();
  delete w.chatbase;
  delete w.chatbaseUserConfig;
}

/**
 * O assistente vive **entre as telas do painel**: cada tela monta a própria
 * casca, então ir de uma para outra desmonta e monta o botão no mesmo
 * instante. Só quando ninguém monta de novo — saiu do painel, ou saiu da
 * conta — o assistente é removido. Puro, para a prova rodar sem navegador.
 */
export function criarCiclo(
  remover: () => void,
  esperaMs = 400,
  agendar: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  cancelar: (id: unknown) => void = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
) {
  let montados = 0;
  let pendente: unknown = null;
  return {
    get montados() {
      return montados;
    },
    montou() {
      montados++;
      if (pendente !== null) {
        cancelar(pendente);
        pendente = null;
      }
    },
    desmontou() {
      montados = Math.max(0, montados - 1);
      if (montados === 0 && pendente === null) {
        pendente = agendar(() => {
          pendente = null;
          if (montados === 0) remover();
        }, esperaMs);
      }
    },
  };
}

export const cicloDoPainel = criarCiclo(() => removerAssistente());
