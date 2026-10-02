import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import { MENSAGEM_IA_MAX, problemaNaMensagemDaIA, type MensagemDaIA, type SessaoDaIA } from "@shared/ia";
import { apiRequest } from "@/lib/queryClient";
import { assinarAssistente, assistenteAberto, definirAssistenteAberto } from "@/lib/assistente";

export const CONVERSA_DA_IA = ["/api/ia/conversa"];
export const SESSAO_DA_IA = ["/api/ia/sessao"];
const ID_DO_BOTAO = "botao-do-assistente";
const ID_DA_COLUNA = "coluna-do-assistente";

/**
 * O assistente de IA do painel (master, organizador e afiliado). Só existe se
 * o servidor disser que está ligado para esta sessão. Aberta, a coluna fica à
 * direita no computador (o conteúdo abre espaço) e por cima da tela, como
 * diálogo, no celular e no tablet.
 */
export function useAssistente(podeTer: boolean) {
  const { data } = useQuery<SessaoDaIA>({ queryKey: SESSAO_DA_IA, enabled: podeTer, staleTime: 5 * 60_000 });
  const aberto = useSyncExternalStore(assinarAssistente, assistenteAberto, () => false);
  const ligado = podeTer && data?.ligado === true;
  return {
    ligado,
    aberto: ligado && aberto,
    alternar: () => definirAssistenteAberto(!aberto),
    fechar: () => definirAssistenteAberto(false),
  };
}

/** Computador (lg): coluna ao lado. Abaixo disso: diálogo por cima da tela. */
function useLarga(): boolean {
  const consulta = "(min-width: 1024px)";
  const [larga, setLarga] = useState(() => typeof window !== "undefined" && window.matchMedia?.(consulta).matches === true);
  useEffect(() => {
    const m = window.matchMedia?.(consulta);
    if (!m) return;
    const mudou = () => setLarga(m.matches);
    m.addEventListener("change", mudou);
    return () => m.removeEventListener("change", mudou);
  }, []);
  return larga;
}

export function BotaoDoAssistente({ aberto, onAlternar }: { aberto: boolean; onAlternar: () => void }) {
  return (
    <button
      type="button"
      id={ID_DO_BOTAO}
      aria-pressed={aberto}
      aria-controls={aberto ? ID_DA_COLUNA : undefined}
      aria-label={aberto ? "Fechar o assistente" : "Abrir o assistente"}
      title="Assistente"
      onClick={onAlternar}
      className={`rounded-md p-1.5 hover:bg-mist-2 ${aberto ? "bg-mist-2 text-green-deep" : "text-ink-2"}`}
    >
      <Sparkles size={20} aria-hidden />
    </button>
  );
}

const FOCAVEIS = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function ColunaDoAssistente({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient();
  const larga = useLarga();
  const { data, isLoading, error: erroDoHistorico } = useQuery<{ mensagens: MensagemDaIA[] }>({ queryKey: CONVERSA_DA_IA, staleTime: Infinity });
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const coluna = useRef<HTMLElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  // Com erro na leitura, nada da conversa aparece — nem o que ficou guardado de antes.
  const mensagens = erroDoHistorico ? [] : (data?.mensagens ?? []);

  const enviar = useMutation({
    mutationFn: async (t: string) =>
      (await (await apiRequest("POST", "/api/ia/mensagens", { texto: t })).json()) as { mensagem: MensagemDaIA; creditos: number | null },
    onMutate: (t: string) => {
      setErro(null);
      setTexto("");
      const minha: MensagemDaIA = { id: `local-${Date.now()}`, papel: "voce", texto: t, criadoEm: Date.now() };
      qc.setQueryData<{ mensagens: MensagemDaIA[] }>(CONVERSA_DA_IA, (v) => ({ mensagens: [...(v?.mensagens ?? []), minha] }));
      return { minha };
    },
    onSuccess: (r) => qc.setQueryData<{ mensagens: MensagemDaIA[] }>(CONVERSA_DA_IA, (v) => ({ mensagens: [...(v?.mensagens ?? []), r.mensagem] })),
    onError: (e: Error, t, ctx) => {
      // A mensagem não foi: some da conversa e volta ao campo — sem apagar o que a pessoa já começou a escrever.
      qc.setQueryData<{ mensagens: MensagemDaIA[] }>(CONVERSA_DA_IA, (v) => ({ mensagens: (v?.mensagens ?? []).filter((m) => m.id !== ctx?.minha.id) }));
      setTexto((atual) => (atual.trim() ? atual : t));
      setErro(e.message);
    },
  });

  const nova = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/ia/conversa"),
    onSuccess: () => {
      setErro(null);
      qc.setQueryData(CONVERSA_DA_IA, { mensagens: [] });
      campo.current?.focus();
    },
    onError: (e: Error) => setErro(e.message),
  });

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, enviar.isPending]);

  // Abrir leva o foco para dentro (no computador, direto ao campo; no celular, à
  // coluna, para não abrir o teclado sozinho). Fechar devolve o foco ao botão.
  useEffect(() => {
    if (larga) campo.current?.focus();
    else coluna.current?.focus();
    return () => {
      document.getElementById(ID_DO_BOTAO)?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mandar = () => {
    const t = texto.trim();
    const p = problemaNaMensagemDaIA(t);
    if (p) return setErro(p);
    if (!enviar.isPending) enviar.mutate(t);
  };

  // Esc fecha só com o foco dentro da coluna, e não dentro do campo (não perde
  // o rascunho) — assim não fecha junto com a janela, o sino ou o Atendimento.
  // No celular, a coluna é diálogo: o Tab não sai dela.
  const aoTeclar = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "TEXTAREA" || alvo.tagName === "INPUT") return;
      e.preventDefault();
      onFechar();
      return;
    }
    if (e.key === "Tab" && !larga && coluna.current) {
      const lista = Array.from(coluna.current.querySelectorAll<HTMLElement>(FOCAVEIS));
      if (lista.length === 0) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === coluna.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
  };

  return (
    <aside
      id={ID_DA_COLUNA}
      ref={coluna}
      tabIndex={-1}
      onKeyDown={aoTeclar}
      aria-labelledby="titulo-do-assistente"
      {...(larga ? {} : { role: "dialog", "aria-modal": true })}
      className="painel fixed inset-0 z-40 flex flex-col bg-white outline-none lg:inset-y-0 lg:left-auto lg:right-0 lg:z-20 lg:w-[380px] lg:border-l lg:border-line"
    >
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-4">
        <Sparkles size={18} aria-hidden className="text-green-deep" />
        <h2 id="titulo-do-assistente" className="flex-1 truncate text-base font-semibold">
          Assistente
        </h2>
        <button
          type="button"
          onClick={() => nova.mutate()}
          disabled={nova.isPending || enviar.isPending || (mensagens.length === 0 && !erroDoHistorico)}
          className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-sm text-ink-2 hover:bg-mist disabled:opacity-50"
        >
          <RotateCcw size={16} aria-hidden /> Nova conversa
        </button>
        <button type="button" onClick={onFechar} aria-label="Fechar o assistente" className="rounded-md p-1.5 text-ink-2 hover:bg-mist">
          <X size={20} aria-hidden />
        </button>
      </div>

      <div role="log" aria-live="polite" aria-label="Conversa com o assistente" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {isLoading ? <p className="text-muted">Carregando a conversa…</p> : null}
        {erroDoHistorico ? (
          <p className="text-red">
            Não deu para carregar a conversa. {(erroDoHistorico as Error).message} Se continuar, toque em "Nova conversa".
          </p>
        ) : null}
        {!isLoading && !erroDoHistorico && mensagens.length === 0 ? (
          <p className="text-muted">
            Pergunte sobre o painel: como lançar uma rifa, ler os números de vendas, configurar pagamentos. Não envie telefone, CPF
            ou e-mail de clientes — use o código do pedido ou o ID do cliente.
          </p>
        ) : null}
        {mensagens.map((m) => (
          <div key={m.id} className={m.papel === "voce" ? "flex justify-end" : "flex justify-start"}>
            <p
              className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 ${
                m.papel === "voce" ? "bg-mist-2 text-ink" : "border border-line bg-white text-ink"
              }`}
            >
              <span className="sr-only">{m.papel === "voce" ? "Você: " : "Assistente: "}</span>
              {m.texto}
            </p>
          </div>
        ))}
        {enviar.isPending ? <p className="text-muted">O assistente está escrevendo…</p> : null}
        <div ref={fim} />
      </div>

      <form
        className="shrink-0 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          mandar();
        }}
      >
        {erro ? (
          <p role="alert" className="mb-2 text-xs text-red">
            {erro}
          </p>
        ) : null}
        <label htmlFor="ia-texto" className="label-xs">
          Sua pergunta
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="ia-texto"
            ref={campo}
            rows={2}
            maxLength={MENSAGEM_IA_MAX}
            value={texto}
            enterKeyHint="send"
            onChange={(e) => {
              setErro(null);
              setTexto(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                mandar();
              }
            }}
            className="campo min-h-[44px] flex-1 resize-none"
          />
          <button
            type="submit"
            aria-label="Enviar"
            disabled={!texto.trim() || enviar.isPending}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green text-on-green disabled:opacity-50"
          >
            <SendHorizontal size={18} aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted">Enter envia; Shift+Enter quebra a linha.</p>
      </form>
    </aside>
  );
}
