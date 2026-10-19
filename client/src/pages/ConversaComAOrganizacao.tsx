import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { FotoDoPerfil } from "@/components/Seguir";
import { Button, Empty, Pill, TONS_DO_BOTAO } from "@/components/bits";
import { EmBreve } from "@/pages/EmBreve";
import { useConfigDoApp } from "@/components/Console";
import { apiRequest } from "@/lib/queryClient";
import { slugDoEndereco } from "@/lib/endereco";
import { useSession } from "@/lib/session";
import { MENSAGEM_MAX } from "@shared/mensagens";

interface Mensagem {
  id: string;
  minha: boolean;
  texto: string;
  em: string;
  rifa: { slug: string; titulo: string; caminho: string } | null;
}
interface Pagina {
  organizacao: { nome: string; foto: string | null };
  conversa: { situacao: "pedido" | "aceita" | "recusada"; euIniciei: boolean; podeEnviar: boolean; impedimento: string | null } | null;
  itens: Mensagem[];
  proximo: string | null;
}

const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * A conversa com a organização do endereço (docs/PLANO-SUBDOMINIO.md, cap. 15.2):
 * o endereço é a identidade da promotora e o canal direto dela com quem joga.
 * Só esta conversa — a caixa inteira da pessoa mora no domínio principal. As
 * regras são as das Mensagens de sempre (pedido para quem não segue, texto sem
 * link nem telefone); aqui só se escreve texto.
 */
export default function ConversaComAOrganizacao() {
  const slug = slugDoEndereco();
  const { mensagensLigado } = useConfigDoApp();
  const { data: sessao, isLoading } = useSession();
  if (!mensagensLigado) return <EmBreve tela="mensagens" />;
  const temConta = Boolean(sessao?.buyer?.conta);
  if (!isLoading && !temConta) {
    return (
      <PublicShell>
        <section className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
          <h1 className="font-display text-2xl font-extrabold">Mensagens</h1>
          <p className="max-w-sm text-sm text-ink-2">Entre na sua conta para falar com a organização.</p>
          <Link href="/entrar?volta=/mensagens" className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-[13px] font-semibold ${TONS_DO_BOTAO.primario}`}>
            Entrar
          </Link>
        </section>
      </PublicShell>
    );
  }
  if (!slug) return <EmBreve tela="mensagens" />;
  return (
    <PublicShell>
      <Conversa slug={slug} />
    </PublicShell>
  );
}

function Conversa({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const chave = ["/api/public/o", slug, "mensagens"];

  const pagina = useInfiniteQuery<Pagina>({
    queryKey: chave,
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const q = pageParam ? `?antes=${encodeURIComponent(String(pageParam))}` : "";
      const r = await fetch(`/api/public/o/${slug}/mensagens${q}`, { credentials: "include" });
      if (r.status === 401) throw new Error("Entre na sua conta para falar com a organização.");
      if (r.status === 409) throw new Error((await r.json().catch(() => null))?.message ?? "Complete sua conta para trocar mensagens.");
      if (!r.ok) throw new Error("Não foi possível carregar a conversa.");
      return (await r.json()) as Pagina;
    },
    getNextPageParam: (u) => u.proximo ?? undefined,
    refetchInterval: 8_000,
  });
  const topo = pagina.data?.pages[0];
  const c = topo?.conversa ?? null;
  const todas = (pagina.data?.pages ?? []).flatMap((p) => p.itens).reverse();

  const enviar = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/public/o/${slug}/mensagens`, { texto });
      return r.json();
    },
    onSuccess: () => {
      setTexto("");
      setErro(null);
      qc.invalidateQueries({ queryKey: chave });
      qc.invalidateQueries({ queryKey: ["/api/public/o", slug, "mensagens", "resumo"] });
    },
    onError: (e: Error) => setErro(e.message),
  });

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [todas.length]);

  if (pagina.isError) {
    return (
      <p role="alert" className="rounded-lg bg-red-soft px-3 py-2 text-sm text-red">
        {(pagina.error as Error).message}
      </p>
    );
  }
  const org = topo?.organizacao;
  const podeEnviar = c ? c.podeEnviar : true;
  return (
    <section aria-label="Conversa com a organização" className="flex min-h-[60vh] flex-col rounded-xl border border-line">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        {org ? <FotoDoPerfil foto={org.foto} nome={org.nome} tamanho={40} /> : null}
        <div className="min-w-0">
          <h1 className="truncate font-display text-base font-extrabold">{org?.nome ?? "Organização"}</h1>
          <p className="text-xs text-muted">Conversa direta com a organização</p>
        </div>
      </header>

      {c?.situacao === "pedido" && c.euIniciei ? (
        <p className="border-b border-line bg-mist px-4 py-2 text-xs text-ink-2">
          <Pill status="pending">pedido enviado</Pill> A organização precisa aceitar para você mandar mais mensagens. Quem segue a organização conversa direto.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-live="polite">
        {pagina.hasNextPage ? (
          <div className="text-center">
            <Button variant="cinza" onClick={() => void pagina.fetchNextPage()} disabled={pagina.isFetchingNextPage}>
              {pagina.isFetchingNextPage ? "Carregando…" : "Mensagens anteriores"}
            </Button>
          </div>
        ) : null}
        {!pagina.isLoading && todas.length === 0 ? <Empty>Escreva a primeira mensagem para a organização.</Empty> : null}
        {todas.map((m) => (
          <div key={m.id} className={`flex ${m.minha ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${m.minha ? "bg-green text-on-green" : "bg-mist-2 text-ink"}`}>
              {m.rifa ? (
                <Link href={m.rifa.caminho} className={`mb-1 block rounded-lg border px-3 py-2 text-xs font-semibold ${m.minha ? "border-current" : "border-line bg-white"}`}>
                  Rifa · {m.rifa.titulo}
                </Link>
              ) : null}
              {m.texto ? <p className="whitespace-pre-wrap break-words">{m.texto}</p> : null}
              <p className={`tnum mt-0.5 text-right text-[10px] ${m.minha ? "opacity-80" : "text-muted"}`}>{hora(m.em)}</p>
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>

      {podeEnviar ? (
        <form
          className="flex items-center gap-2 border-t border-line px-3 py-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (texto.trim() && !enviar.isPending) enviar.mutate();
          }}
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="msg-org" className="sr-only">
              Mensagem para a organização
            </label>
            <textarea
              id="msg-org"
              className="campo mt-0 resize-none rounded-full px-4"
              rows={1}
              maxLength={MENSAGEM_MAX}
              value={texto}
              placeholder="Mensagem…"
              enterKeyHint="send"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (texto.trim() && !enviar.isPending) enviar.mutate();
                }
              }}
            />
          </div>
          <button
            type="submit"
            disabled={enviar.isPending || !texto.trim()}
            aria-label="Enviar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-green-deep hover:bg-green-soft disabled:opacity-40"
          >
            <Send size={22} aria-hidden />
          </button>
        </form>
      ) : (
        <p className="border-t border-line px-4 py-3 text-center text-sm text-ink-2">{c?.impedimento}</p>
      )}
      {erro ? (
        <p role="alert" className="mx-3 mb-3 rounded-lg bg-red-soft px-3 py-2 text-sm text-red">
          {erro}
        </p>
      ) : null}
    </section>
  );
}
