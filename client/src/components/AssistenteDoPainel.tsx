import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import { MENSAGEM_IA_MAX, problemaNaMensagemDaIA, type MensagemDaIA, type SessaoDaIA } from "@shared/ia";
import { apiRequest } from "@/lib/queryClient";
import { assinarAssistente, assistenteAberto, definirAssistenteAberto } from "@/lib/assistente";

const CONVERSA = ["/api/ia/conversa"];

/**
 * O assistente de IA do painel (master, organizador e afiliado). Só existe se
 * o servidor disser que está ligado para esta sessão. Aberta, a coluna fica à
 * direita no computador (o conteúdo abre espaço) e por cima da tela no
 * celular e no tablet.
 */
export function useAssistente(podeTer: boolean) {
  const { data } = useQuery<SessaoDaIA>({ queryKey: ["/api/ia/sessao"], enabled: podeTer, staleTime: 5 * 60_000 });
  const aberto = useSyncExternalStore(assinarAssistente, assistenteAberto, () => false);
  const ligado = podeTer && data?.ligado === true;
  return {
    ligado,
    aberto: ligado && aberto,
    alternar: () => definirAssistenteAberto(!aberto),
    fechar: () => definirAssistenteAberto(false),
  };
}

export function BotaoDoAssistente({ aberto, onAlternar }: { aberto: boolean; onAlternar: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={aberto}
      aria-controls="coluna-do-assistente"
      aria-label={aberto ? "Fechar o assistente" : "Abrir o assistente"}
      title="Assistente"
      onClick={onAlternar}
      className={`rounded-md p-1.5 hover:bg-mist-2 ${aberto ? "bg-mist-2 text-green-deep" : "text-ink-2"}`}
    >
      <Sparkles size={20} aria-hidden />
    </button>
  );
}

export function ColunaDoAssistente({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error: erroDoHistorico } = useQuery<{ mensagens: MensagemDaIA[] }>({ queryKey: CONVERSA, staleTime: Infinity });
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const mensagens = data?.mensagens ?? [];

  const enviar = useMutation({
    mutationFn: async (t: string) =>
      (await (await apiRequest("POST", "/api/ia/mensagens", { texto: t })).json()) as { mensagem: MensagemDaIA; creditos: number },
    onMutate: (t: string) => {
      setErro(null);
      setTexto("");
      const minha: MensagemDaIA = { id: `local-${Date.now()}`, papel: "voce", texto: t, criadoEm: Date.now() };
      qc.setQueryData<{ mensagens: MensagemDaIA[] }>(CONVERSA, (v) => ({ mensagens: [...(v?.mensagens ?? []), minha] }));
      return { minha };
    },
    onSuccess: (r) => qc.setQueryData<{ mensagens: MensagemDaIA[] }>(CONVERSA, (v) => ({ mensagens: [...(v?.mensagens ?? []), r.mensagem] })),
    onError: (e: Error, t, ctx) => {
      // A mensagem não foi: some da conversa e volta ao campo, para não se perder.
      qc.setQueryData<{ mensagens: MensagemDaIA[] }>(CONVERSA, (v) => ({ mensagens: (v?.mensagens ?? []).filter((m) => m.id !== ctx?.minha.id) }));
      setTexto(t);
      setErro(e.message);
    },
  });

  const nova = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/ia/conversa"),
    onSuccess: () => {
      setErro(null);
      qc.setQueryData(CONVERSA, { mensagens: [] });
      campo.current?.focus();
    },
    onError: (e: Error) => setErro(e.message),
  });

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, enviar.isPending]);

  // Esc fecha, menos dentro do campo (não perde o rascunho) — a regra do Atendimento.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "TEXTAREA" || alvo.tagName === "INPUT")) return;
      onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  const mandar = () => {
    const t = texto.trim();
    const p = problemaNaMensagemDaIA(t);
    if (p) return setErro(p);
    if (!enviar.isPending) enviar.mutate(t);
  };

  return (
    <aside
      id="coluna-do-assistente"
      aria-label="Assistente"
      className="painel fixed inset-0 z-40 flex flex-col bg-white lg:inset-y-0 lg:left-auto lg:right-0 lg:z-20 lg:w-[380px] lg:border-l lg:border-line"
    >
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-4">
        <Sparkles size={18} aria-hidden className="text-green-deep" />
        <h2 className="flex-1 truncate text-base font-semibold">Assistente</h2>
        <button
          type="button"
          onClick={() => nova.mutate()}
          disabled={nova.isPending || enviar.isPending || mensagens.length === 0}
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
        {erroDoHistorico ? <p className="text-red">Não deu para carregar a conversa. {(erroDoHistorico as Error).message}</p> : null}
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
