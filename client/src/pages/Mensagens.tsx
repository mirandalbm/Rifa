import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Flag, Send } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Janela } from "@/components/Janela";
import { FotoDoPerfil } from "@/components/Seguir";
import { SeloVerificado } from "@/components/SeloVerificado";
import { EmBreve } from "@/pages/EmBreve";
import { useConfigDoApp } from "@/components/Console";
import { Empty, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import {
  MENSAGEM_MAX,
  MOTIVOS_DA_DENUNCIA_DE_MENSAGEM,
  type MotivoDaDenunciaDeMensagem,
  type TipoDeParticipante,
} from "@shared/mensagens";

interface Perfil {
  tipo: TipoDeParticipante;
  nome: string;
  foto: string | null;
  href: string | null;
  verificado: boolean;
  ativo: boolean;
}
interface ItemDaLista {
  id: string;
  com: Perfil;
  previa: string | null;
  ultimaEm: string;
  naoLidas: number;
  situacao: "pedido" | "aceita" | "recusada";
  euIniciei: boolean;
  bloqueada: boolean;
}
interface PaginaDaLista {
  itens: ItemDaLista[];
  proximo: string | null;
}
interface Mensagem {
  id: string;
  minha: boolean;
  texto: string;
  em: string;
  rifa: { slug: string; titulo: string; caminho: string } | null;
}
interface PaginaDaConversa {
  conversa: {
    id: string;
    com: Perfil;
    situacao: "pedido" | "aceita" | "recusada";
    euIniciei: boolean;
    bloqueadaPorMim: boolean;
    bloqueada: boolean;
    encerrada: boolean;
    podeEnviar: boolean;
    impedimento: string | null;
    naoLidas: number;
  };
  itens: Mensagem[];
  proximo: string | null;
}

const ROTULO_DO_TIPO: Record<TipoDeParticipante, string> = { comprador: "Apostador", organizacao: "Organização", afiliado: "Afiliado" };

const hora = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

/**
 * Mensagens: a caixa de entrada de apostadores, organizações e afiliados,
 * conversa de um para um. Desligada pela plataforma, é a tela "Em breve".
 * Celular: a lista, e a conversa por cima dela; do computador em diante,
 * a lista à esquerda e a conversa ao lado. As regras (sem link e sem
 * telefone, pedido de mensagem, bloqueio) são do servidor — a tela só
 * mostra o que ele responde.
 */
export default function MensagensPagina() {
  const { mensagensLigado } = useConfigDoApp();
  const { data: sessao, isLoading } = useSession();
  const [, parametros] = useRoute<{ id: string }>("/mensagens/:id");
  if (!mensagensLigado) return <EmBreve tela="mensagens" />;
  const temConta = Boolean(sessao?.buyer || (sessao?.user && (sessao.role === "organizer" || sessao.role === "affiliate")));
  if (!isLoading && !temConta) {
    return (
      <PublicShell>
        <section className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
          <h1 className="font-display text-xl font-extrabold">Mensagens</h1>
          <p className="max-w-sm text-sm text-ink-2">Entre na sua conta para conversar com apostadores, organizações e afiliados.</p>
          <Link href="/entrar?volta=/mensagens" className="rounded-lg bg-green px-4 py-2 text-sm font-semibold text-on-green">
            Entrar
          </Link>
        </section>
      </PublicShell>
    );
  }
  const aberta = parametros?.id && parametros.id !== "nova" ? parametros.id : null;
  return (
    <PublicShell larga>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className={aberta ? "hidden min-w-0 lg:block" : "min-w-0"}>
          <ListaDeConversas ativa={aberta} />
        </div>
        <div className={aberta ? "min-w-0" : "hidden min-w-0 lg:block"}>
          {aberta ? <Conversa id={aberta} /> : <p className="hidden rounded-xl border border-line p-8 text-center text-sm text-muted lg:block">Escolha uma conversa ou comece uma nova.</p>}
        </div>
      </div>
    </PublicShell>
  );
}

/* ------------------------------------------------------------------ *
 * A lista
 * ------------------------------------------------------------------ */

function ListaDeConversas({ ativa }: { ativa: string | null }) {
  const [aba, setAba] = useState<"conversas" | "pedidos">("conversas");
  const lista = useInfiniteQuery<PaginaDaLista>({
    queryKey: ["/api/public/mensagens/conversas", aba],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const q = new URLSearchParams({ aba: aba === "pedidos" ? "pedidos" : "todas" });
      if (pageParam) q.set("depois", String(pageParam));
      const r = await fetch(`/api/public/mensagens/conversas?${q}`, { credentials: "include" });
      if (!r.ok) throw new Error("Não foi possível carregar as conversas.");
      return (await r.json()) as PaginaDaLista;
    },
    getNextPageParam: (u) => u.proximo ?? undefined,
    refetchInterval: 15_000,
  });
  const itens = lista.data?.pages.flatMap((p) => p.itens) ?? [];
  const { data: pedidos } = useQuery<PaginaDaLista>({
    queryKey: ["/api/public/mensagens/conversas", { aba: "pedidos", limite: 1 }],
    refetchInterval: 30_000,
  });
  const temPedido = (pedidos?.itens.length ?? 0) > 0;
  return (
    <section aria-label="Conversas" className="rounded-xl border border-line bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h1 className="font-display text-lg font-extrabold">Mensagens</h1>
        <NovaConversaBotao />
      </div>
      <div role="tablist" aria-label="Caixa" className="flex gap-1 border-b border-line px-3 py-2">
        {(["conversas", "pedidos"] as const).map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={aba === a}
            onClick={() => setAba(a)}
            className={aba === a ? "rounded-md bg-green px-3 py-1.5 text-sm font-semibold text-on-green" : "rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-mist-2"}
          >
            {a === "conversas" ? "Conversas" : temPedido ? "Pedidos (novos)" : "Pedidos"}
          </button>
        ))}
      </div>
      {lista.isLoading ? <Empty>Carregando…</Empty> : null}
      {lista.isError ? <Empty>Não foi possível carregar as conversas.</Empty> : null}
      {!lista.isLoading && !lista.isError && itens.length === 0 ? (
        <Empty>{aba === "pedidos" ? "Nenhum pedido de mensagem." : "Nenhuma conversa ainda. Use \"Nova\" para começar."}</Empty>
      ) : null}
      <ul className="divide-y divide-line">
        {itens.map((c) => (
          <li key={c.id}>
            <Link
              href={`/mensagens/${c.id}`}
              aria-current={ativa === c.id ? "page" : undefined}
              className={`flex items-center gap-3 px-4 py-3 hover:bg-mist ${ativa === c.id ? "bg-mist" : ""}`}
            >
              <FotoDoPerfil nome={c.com.nome} foto={c.com.foto} tamanho={44} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-semibold">
                  <span className="truncate">{c.com.nome}</span>
                  {c.com.verificado ? <SeloVerificado sujeito={c.com.tipo === "organizacao" ? "organizacao" : c.com.tipo === "afiliado" ? "afiliado" : "apostador"} tamanho={14} /> : null}
                  <span className="ml-auto shrink-0 text-xs font-normal text-muted">{hora(c.ultimaEm)}</span>
                </span>
                <span className={`block truncate text-sm ${c.naoLidas ? "font-semibold text-ink" : "text-ink-2"}`}>
                  {c.previa ?? "Sem mensagens"}
                </span>
                <span className="text-[11px] text-muted">
                  {ROTULO_DO_TIPO[c.com.tipo]}
                  {c.bloqueada ? " · bloqueada" : ""}
                  {c.situacao === "pedido" && c.euIniciei ? " · pedido enviado" : ""}
                </span>
              </span>
              {c.naoLidas ? (
                <span className="tnum min-w-[22px] rounded-full bg-marca px-1.5 py-0.5 text-center text-xs font-bold text-white">
                  <span className="sr-only">{c.naoLidas} não lida(s)</span>
                  <span aria-hidden>{c.naoLidas > 99 ? "99+" : c.naoLidas}</span>
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {lista.hasNextPage ? (
        <div className="p-3 text-center">
          <button type="button" onClick={() => void lista.fetchNextPage()} disabled={lista.isFetchingNextPage} className="rounded-md px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-mist-2">
            {lista.isFetchingNextPage ? "Carregando…" : "Ver mais"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Nova conversa
 * ------------------------------------------------------------------ */

function NovaConversaBotao() {
  const [aberta, setAberta] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return q.has("para") || q.has("rifa");
  });
  return (
    <>
      <button type="button" onClick={() => setAberta(true)} className="rounded-md bg-green px-3 py-1.5 text-sm font-semibold text-on-green hover:brightness-95">
        Nova
      </button>
      {aberta ? <NovaConversa aoFechar={() => setAberta(false)} /> : null}
    </>
  );
}

function NovaConversa({ aoFechar }: { aoFechar: () => void }) {
  const [, navegar] = useLocation();
  const qc = useQueryClient();
  const inicio = new URLSearchParams(window.location.search);
  const rifa = inicio.get("rifa");
  const [busca, setBusca] = useState(inicio.get("para") ?? "");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ para: { tipo: TipoDeParticipante; id: string }; com: Perfil } | null>(null);

  const procurar = useMutation({
    mutationFn: async (q: string) => {
      const r = await fetch(`/api/public/mensagens/destino?q=${encodeURIComponent(q)}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Ninguém encontrado.");
      return j as { para: { tipo: TipoDeParticipante; id: string }; com: Perfil };
    },
    onSuccess: (r) => {
      setAlvo(r);
      setErro(null);
    },
    onError: (e: Error) => {
      setAlvo(null);
      setErro(e.message);
    },
  });
  const enviar = useMutation({
    mutationFn: async () => (await (await apiRequest("POST", "/api/public/mensagens/conversas", { para: alvo!.para, texto, rifa: rifa ?? undefined })).json()) as { id: string },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/public/mensagens/conversas"] });
      qc.invalidateQueries({ queryKey: ["/api/public/mensagens/resumo"] });
      aoFechar();
      navegar(`/mensagens/${r.id}`);
    },
    onError: (e: Error) => setErro(e.message),
  });
  // Quem chega de um botão "Mensagem" já traz o destino: procura sozinho.
  useEffect(() => {
    if (busca.trim()) procurar.mutate(busca.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Janela onFechar={aoFechar} rotulo="Nova conversa" className="p-4">
      <h2 className="font-display text-lg font-extrabold">Nova conversa</h2>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (busca.trim()) procurar.mutate(busca.trim());
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="msg-busca" className="label-xs">
            Para quem
          </label>
          <input id="msg-busca" className="campo mt-1 w-full" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="@apelido, endereço da organização ou código" autoComplete="off" />
        </div>
        <button type="submit" disabled={procurar.isPending} className="mt-5 rounded-md border border-line px-3 text-sm font-semibold hover:bg-mist">
          Buscar
        </button>
      </form>
      {alvo ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            enviar.mutate();
          }}
        >
          <div className="flex items-center gap-3 rounded-lg border border-line p-3">
            <FotoDoPerfil nome={alvo.com.nome} foto={alvo.com.foto} tamanho={40} />
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold">{alvo.com.nome}</p>
              <p className="text-xs text-muted">{ROTULO_DO_TIPO[alvo.com.tipo]}</p>
            </div>
          </div>
          {rifa ? <p className="rounded-md bg-mist px-3 py-2 text-xs text-ink-2">O cartão da rifa vai junto com a mensagem.</p> : null}
          <div>
            <label htmlFor="msg-texto" className="label-xs">
              Mensagem{rifa ? " (opcional)" : ""}
            </label>
            <textarea id="msg-texto" className="campo mt-1 w-full" rows={3} maxLength={MENSAGEM_MAX} value={texto} onChange={(e) => setTexto(e.target.value)} />
            <p className="mt-1 text-xs text-muted">Sem link e sem telefone. Quem não segue você recebe um pedido de mensagem.</p>
          </div>
          <button type="submit" disabled={enviar.isPending || (!texto.trim() && !rifa)} className="w-full rounded-md bg-green px-4 py-2 text-sm font-semibold text-on-green disabled:opacity-50">
            {enviar.isPending ? "Enviando…" : "Enviar"}
          </button>
        </form>
      ) : null}
      {erro ? (
        <p role="alert" className="mt-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">
          {erro}
        </p>
      ) : null}
    </Janela>
  );
}

/* ------------------------------------------------------------------ *
 * A conversa
 * ------------------------------------------------------------------ */

function Conversa({ id }: { id: string }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [denunciando, setDenunciando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  const pagina = useInfiniteQuery<PaginaDaConversa>({
    queryKey: ["/api/public/mensagens/conversa", id],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const q = pageParam ? `?antes=${encodeURIComponent(String(pageParam))}` : "";
      const r = await fetch(`/api/public/mensagens/conversas/${id}${q}`, { credentials: "include" });
      if (r.status === 404) throw new Error("Conversa não encontrada.");
      if (!r.ok) throw new Error("Não foi possível carregar a conversa.");
      return (await r.json()) as PaginaDaConversa;
    },
    getNextPageParam: (u) => u.proximo ?? undefined,
    refetchInterval: 5_000,
  });
  const topo = pagina.data?.pages[0];
  const c = topo?.conversa;
  // As páginas vêm da mais nova para a mais antiga; a tela mostra de cima para baixo.
  const todas = (pagina.data?.pages ?? []).flatMap((p) => p.itens).reverse();

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["/api/public/mensagens/conversas"] });
    qc.invalidateQueries({ queryKey: ["/api/public/mensagens/resumo"] });
    qc.invalidateQueries({ queryKey: ["/api/public/mensagens/conversa", id] });
  };
  const lida = useMutation({ mutationFn: () => apiRequest("POST", `/api/public/mensagens/conversas/${id}/lida`, {}), onSuccess: invalidar });
  useEffect(() => {
    if (c && c.naoLidas > 0) lida.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.naoLidas, todas.length]);
  // Mensagem nova leva ao fim; a leitura de mensagens antigas não.
  const ultimo = todas[todas.length - 1]?.id;
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [ultimo]);

  const enviar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/public/mensagens/conversas/${id}/mensagens`, { texto }),
    onSuccess: () => {
      setTexto("");
      setErro(null);
      invalidar();
    },
    onError: (e: Error) => setErro(e.message),
  });
  const pedido = useMutation({
    mutationFn: (acao: "aceitar" | "recusar") => apiRequest("POST", `/api/public/mensagens/conversas/${id}/pedido`, { acao }),
    onSuccess: invalidar,
    onError: (e: Error) => setErro(e.message),
  });
  const bloquear = useMutation({
    mutationFn: (ligar: boolean) => apiRequest("PUT", `/api/public/mensagens/conversas/${id}/bloqueio`, { ligar }),
    onSuccess: invalidar,
    onError: (e: Error) => setErro(e.message),
  });

  if (pagina.isError) return <p role="alert" className="rounded-xl border border-line p-6 text-center text-sm text-red">{(pagina.error as Error).message}</p>;
  if (!c) return <p className="rounded-xl border border-line p-6 text-center text-sm text-muted">Carregando…</p>;

  const pedidoParaMim = c.situacao === "pedido" && !c.euIniciei;
  return (
    <section aria-label={`Conversa com ${c.com.nome}`} className="flex flex-col rounded-xl border border-line bg-white">
      <header className="flex items-center gap-3 border-b border-line px-3 py-3">
        <Link href="/mensagens" aria-label="Voltar para a lista" className="rounded-md p-1 hover:bg-mist lg:hidden">
          <ArrowLeft size={22} aria-hidden />
        </Link>
        <FotoDoPerfil nome={c.com.nome} foto={c.com.foto} tamanho={40} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="flex items-center gap-1 font-semibold">
            {c.com.href ? (
              <Link href={c.com.href} className="truncate hover:underline">
                {c.com.nome}
              </Link>
            ) : (
              <span className="truncate">{c.com.nome}</span>
            )}
            {c.com.verificado ? <SeloVerificado sujeito={c.com.tipo === "organizacao" ? "organizacao" : c.com.tipo === "afiliado" ? "afiliado" : "apostador"} tamanho={14} /> : null}
          </p>
          <p className="text-xs text-muted">
            {ROTULO_DO_TIPO[c.com.tipo]}
            {c.encerrada ? " · encerrada pela plataforma" : c.bloqueada ? " · bloqueada" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => bloquear.mutate(!c.bloqueadaPorMim)}
          disabled={bloquear.isPending || (c.bloqueada && !c.bloqueadaPorMim) || c.encerrada}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-md text-xs text-ink-2 hover:bg-mist disabled:opacity-40 sm:w-auto sm:px-2"
        >
          <Ban size={16} aria-hidden />
          {/* No celular só o ícone: o nome de quem fala é o que precisa de espaço. */}
          <span className="sr-only sm:not-sr-only">{c.bloqueadaPorMim ? "Desbloquear" : "Bloquear"}</span>
        </button>
        <button
          type="button"
          onClick={() => setDenunciando(true)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-md text-xs text-ink-2 hover:bg-mist sm:w-auto sm:px-2"
        >
          <Flag size={16} aria-hidden />
          <span className="sr-only sm:not-sr-only">Denunciar</span>
        </button>
      </header>

      {pedidoParaMim ? (
        <div className="space-y-2 border-b border-line bg-yellow-soft px-4 py-3 text-sm text-yellow-deep">
          <p>
            <strong>{c.com.nome}</strong> quer conversar com você. Só você decide se aceita; responder também aceita.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => pedido.mutate("aceitar")} disabled={pedido.isPending} className="rounded-md bg-green px-3 py-1.5 text-sm font-semibold text-on-green">
              Aceitar
            </button>
            <button type="button" onClick={() => pedido.mutate("recusar")} disabled={pedido.isPending} className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink">
              Recusar
            </button>
          </div>
        </div>
      ) : c.situacao === "pedido" && c.euIniciei ? (
        <p className="border-b border-line bg-mist px-4 py-2 text-xs text-ink-2">
          <Pill status="pending">pedido enviado</Pill> A pessoa precisa aceitar para você mandar mais mensagens.
        </p>
      ) : null}

      <div className="max-h-[60vh] min-h-[240px] space-y-2 overflow-y-auto px-4 py-4" aria-live="polite">
        {pagina.hasNextPage ? (
          <div className="text-center">
            <button type="button" onClick={() => void pagina.fetchNextPage()} disabled={pagina.isFetchingNextPage} className="rounded-md px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-mist-2">
              {pagina.isFetchingNextPage ? "Carregando…" : "Mensagens anteriores"}
            </button>
          </div>
        ) : null}
        {todas.length === 0 ? <Empty>Sem mensagens.</Empty> : null}
        {todas.map((m) => (
          <div key={m.id} className={`flex ${m.minha ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.minha ? "bg-marca text-white" : "bg-mist-2 text-ink"}`}>
              {m.rifa ? (
                <Link href={m.rifa.caminho} className={`mb-1 block rounded-lg border px-3 py-2 text-xs font-semibold ${m.minha ? "border-white/60" : "border-line bg-white"}`}>
                  Rifa · {m.rifa.titulo}
                </Link>
              ) : null}
              {m.texto ? <p className="whitespace-pre-wrap break-words">{m.texto}</p> : null}
              <p className={`tnum mt-0.5 text-right text-[10px] ${m.minha ? "text-white/80" : "text-muted"}`}>{hora(m.em)}</p>
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>

      {c.podeEnviar ? (
        <form
          className="flex items-end gap-2 border-t border-line p-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (texto.trim()) enviar.mutate();
          }}
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="msg-resposta" className="sr-only">
              Mensagem
            </label>
            <textarea
              id="msg-resposta"
              className="campo w-full resize-none"
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
          <button type="submit" disabled={enviar.isPending || !texto.trim()} aria-label="Enviar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green text-on-green disabled:opacity-50">
            <Send size={18} aria-hidden />
          </button>
        </form>
      ) : (
        <p className="border-t border-line px-4 py-3 text-center text-sm text-ink-2">{c.impedimento}</p>
      )}
      {erro ? (
        <p role="alert" className="mx-3 mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">
          {erro}
        </p>
      ) : null}
      {denunciando ? <DenunciarConversa id={id} aoFechar={() => setDenunciando(false)} /> : null}
    </section>
  );
}

function DenunciarConversa({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const [motivo, setMotivo] = useState<MotivoDaDenunciaDeMensagem>("spam");
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const enviar = useMutation({
    mutationFn: async () => (await (await apiRequest("POST", `/api/public/mensagens/conversas/${id}/denuncia`, { motivo, texto })).json()) as { protocolo: string },
    onSuccess: (r) => setAviso({ ok: true, texto: `Denúncia registrada — protocolo ${r.protocolo}. A plataforma vai analisar as últimas mensagens.` }),
    onError: (e: Error) => setAviso({ ok: false, texto: e.message }),
  });
  return (
    <Janela onFechar={aoFechar} rotulo="Denunciar conversa" className="p-4">
      <h2 className="font-display text-lg font-extrabold">Denunciar conversa</h2>
      <p className="mt-1 text-xs text-muted">Só as últimas mensagens vão para a plataforma. A outra pessoa não vê quem denunciou.</p>
      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="den-motivo" className="label-xs">
            Motivo
          </label>
          <select id="den-motivo" className="campo mt-1 w-full" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoDaDenunciaDeMensagem)}>
            {(Object.entries(MOTIVOS_DA_DENUNCIA_DE_MENSAGEM) as [MotivoDaDenunciaDeMensagem, string][]).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="den-texto" className="label-xs">
            Quer explicar? (opcional)
          </label>
          <textarea id="den-texto" className="campo mt-1 w-full" rows={3} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        {aviso ? <p role="status" className={`rounded-md px-3 py-2 text-sm ${aviso.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{aviso.texto}</p> : null}
        <div className="flex gap-2">
          <button type="button" onClick={() => enviar.mutate()} disabled={enviar.isPending || aviso?.ok} className="flex-1 rounded-md bg-green px-4 py-2 text-sm font-semibold text-on-green disabled:opacity-50">
            Denunciar
          </button>
          <button type="button" onClick={aoFechar} className="rounded-md border border-line px-4 py-2 text-sm font-semibold">
            {aviso?.ok ? "Fechar" : "Cancelar"}
          </button>
        </div>
      </div>
    </Janela>
  );
}
