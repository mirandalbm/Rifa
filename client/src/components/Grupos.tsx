import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Flag, Send, Users } from "lucide-react";
import { Janela } from "@/components/Janela";
import { Empty } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { useConfigDoApp } from "@/components/Console";
import { GRUPO_MAX_MEMBROS, GRUPO_NOME_MAX, MOTIVOS_DA_DENUNCIA_DE_GRUPO, type MotivoDaDenunciaDeGrupo } from "@shared/grupos";
import { MENSAGEM_MAX } from "@shared/mensagens";

/**
 * Grupos da rifa: conversa de até 50 apostadores com compra paga na mesma
 * rifa. As regras (compra paga, teto, só texto) são do servidor — a tela só
 * mostra o que ele responde.
 */

interface ItemMeu {
  id: string;
  nome: string;
  rifa: string;
  slug: string;
  previa: string;
  ultimaEm: string;
  membros: number;
  encerrado: boolean;
  naoLidas: number;
}
interface DoGrupo {
  grupo: { id: string; nome: string; rifa: string; slug: string; membros: number; max: number; encerrado: boolean; podeEscrever: boolean; impedimento: string | null };
  pessoas: { apelido: string; eu: boolean }[];
  itens: { id: string; minha: boolean; de: string; texto: string; em: string }[];
}

const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** A aba "Grupos" da caixa: os grupos de que participo. */
export function ListaDeGrupos({ ativo }: { ativo: string | null }) {
  const lista = useInfiniteQuery<{ itens: ItemMeu[]; proximo: string | null }>({
    queryKey: ["/api/public/mensagens/grupos"],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const q = pageParam ? `?depois=${encodeURIComponent(String(pageParam))}` : "";
      const r = await fetch(`/api/public/mensagens/grupos${q}`, { credentials: "include" });
      if (r.status === 401 || r.status === 409) throw new Error("Grupos pedem conta de apostador com apelido.");
      if (!r.ok) throw new Error("Não foi possível carregar os grupos.");
      return { itens: (await r.json()) as ItemMeu[], proximo: r.headers.get("X-Proximo") };
    },
    getNextPageParam: (u) => u.proximo ?? undefined,
    refetchInterval: 20_000,
  });
  const itens = lista.data?.pages.flatMap((p) => p.itens) ?? [];
  return (
    <div>
      {lista.isLoading ? <Empty>Carregando…</Empty> : null}
      {lista.isError ? <Empty>{(lista.error as Error).message}</Empty> : null}
      {!lista.isLoading && !lista.isError && itens.length === 0 ? (
        <Empty>Você ainda não está em nenhum grupo. Quem tem compra paga numa rifa cria ou entra nos grupos dela, na página da rifa.</Empty>
      ) : null}
      <ul className="divide-y divide-line">
        {itens.map((g) => (
          <li key={g.id}>
            <Link href={`/mensagens?grupo=${g.id}`} aria-current={ativo === g.id ? "page" : undefined} className={`flex items-center gap-3 px-4 py-3 hover:bg-mist ${ativo === g.id ? "bg-mist" : ""}`}>
              <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mist-2 text-ink-2">
                <Users size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-semibold">
                  <span className="truncate">{g.nome}</span>
                  <span className="ml-auto shrink-0 text-xs font-normal text-muted">{hora(g.ultimaEm)}</span>
                </span>
                <span className={`block truncate text-sm ${g.naoLidas ? "font-semibold text-ink" : "text-ink-2"}`}>{g.previa || "Sem mensagens"}</span>
                <span className="text-[11px] text-muted">
                  Rifa {g.rifa} · <span className="tnum">{g.membros}</span> pessoa(s){g.encerrado ? " · encerrado" : ""}
                </span>
              </span>
              {g.naoLidas ? (
                <span className="tnum min-w-[22px] rounded-full bg-marca px-1.5 py-0.5 text-center text-xs font-bold text-white">
                  <span className="sr-only">{g.naoLidas} não lida(s)</span>
                  <span aria-hidden>{g.naoLidas > 99 ? "99+" : g.naoLidas}</span>
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
    </div>
  );
}

/** O grupo aberto: as pessoas (só o apelido), as mensagens e o campo de escrever. */
export function GrupoAberto({ id }: { id: string }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [denunciando, setDenunciando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const pagina = useQuery<DoGrupo>({
    queryKey: ["/api/public/mensagens/grupos", id],
    queryFn: async () => {
      const r = await fetch(`/api/public/mensagens/grupos/${id}`, { credentials: "include" });
      if (r.status === 404) throw new Error("Grupo não encontrado.");
      if (!r.ok) throw new Error("Não foi possível carregar o grupo.");
      return (await r.json()) as DoGrupo;
    },
    refetchInterval: 10_000,
  });
  const g = pagina.data?.grupo;
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["/api/public/mensagens/grupos"] });
    qc.invalidateQueries({ queryKey: ["/api/public/mensagens/resumo"] });
  };
  useEffect(() => {
    if (!g) return;
    void apiRequest("POST", `/api/public/mensagens/grupos/${id}/lida`, {}).then(() => qc.invalidateQueries({ queryKey: ["/api/public/mensagens/resumo"] })).catch(() => {});
  }, [id, g?.id, pagina.data?.itens[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => fim.current?.scrollIntoView({ block: "end" }), [pagina.data?.itens.length]);
  const enviar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/public/mensagens/grupos/${id}/mensagens`, { texto }),
    onSuccess: () => {
      setTexto("");
      setErro(null);
      invalidar();
    },
    onError: (e: Error) => setErro(e.message),
  });
  const sair = useMutation({
    mutationFn: () => apiRequest("POST", `/api/public/mensagens/grupos/${id}/sair`, {}),
    onSuccess: () => {
      invalidar();
      window.location.assign("/mensagens");
    },
    onError: (e: Error) => setErro(e.message),
  });
  if (pagina.isError) return <p role="alert" className="rounded-xl border border-line p-6 text-center text-sm text-red">{(pagina.error as Error).message}</p>;
  if (!pagina.data || !g) return <p className="rounded-xl border border-line p-6 text-center text-sm text-muted">Carregando…</p>;
  const mensagens = [...pagina.data.itens].reverse();
  return (
    <section aria-label={`Grupo ${g.nome}`} className="flex flex-col rounded-xl border border-line bg-white">
      <header className="flex items-center gap-3 border-b border-line px-3 py-3">
        <Link href="/mensagens" aria-label="Voltar para a lista" className="rounded-md p-1 hover:bg-mist lg:hidden">
          <ArrowLeft size={22} aria-hidden />
        </Link>
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-semibold">{g.nome}</p>
          <p className="text-xs text-muted">
            <Link href={`/r/${g.slug}`} className="hover:underline">
              Rifa {g.rifa}
            </Link>{" "}
            · <span className="tnum">{g.membros}</span> de <span className="tnum">{g.max}</span> pessoas{g.encerrado ? " · encerrado pela plataforma" : ""}
          </p>
        </div>
        <button type="button" onClick={() => setDenunciando(true)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-md text-xs text-ink-2 hover:bg-mist sm:w-auto sm:px-2">
          <Flag size={16} aria-hidden />
          <span className="sr-only sm:not-sr-only">Denunciar</span>
        </button>
        <button type="button" onClick={() => sair.mutate()} disabled={sair.isPending} className="rounded-md px-2 py-1.5 text-xs text-ink-2 hover:bg-mist">
          Sair do grupo
        </button>
      </header>
      <p className="border-b border-line px-4 py-2 text-xs text-muted">
        <span className="font-semibold text-ink-2">Quem está aqui:</span> {pagina.data.pessoas.map((p) => `@${p.apelido}${p.eu ? " (você)" : ""}`).join(", ")}
      </p>
      <div className="max-h-[60vh] min-h-[240px] space-y-2 overflow-y-auto px-4 py-4" aria-live="polite">
        {mensagens.length === 0 ? <Empty>Sem mensagens. Comece a conversa.</Empty> : null}
        {mensagens.map((m) => (
          <div key={m.id} className={`flex ${m.minha ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.minha ? "bg-marca text-white" : "bg-mist-2 text-ink"}`}>
              {m.minha ? null : <p className="text-xs font-semibold">@{m.de}</p>}
              <p className="whitespace-pre-wrap break-words">{m.texto}</p>
              <p className={`tnum mt-0.5 text-right text-[10px] ${m.minha ? "text-white/80" : "text-muted"}`}>{hora(m.em)}</p>
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>
      {g.podeEscrever ? (
        <form
          className="flex items-end gap-2 border-t border-line p-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (texto.trim()) enviar.mutate();
          }}
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="grupo-texto" className="sr-only">
              Mensagem para o grupo
            </label>
            <textarea
              id="grupo-texto"
              className="campo w-full resize-none"
              rows={1}
              maxLength={MENSAGEM_MAX}
              placeholder="Escreva para o grupo…"
              value={texto}
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
          <button type="submit" disabled={!texto.trim() || enviar.isPending} aria-label="Enviar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green text-on-green disabled:opacity-50">
            <Send size={18} aria-hidden />
          </button>
        </form>
      ) : (
        <p className="border-t border-line bg-mist px-4 py-3 text-sm text-ink-2">{g.impedimento}</p>
      )}
      {erro ? <p role="alert" className="border-t border-line px-4 py-2 text-sm text-red">{erro}</p> : null}
      {denunciando ? <DenunciarGrupo id={id} aoFechar={() => setDenunciando(false)} /> : null}
    </section>
  );
}

function DenunciarGrupo({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const [motivo, setMotivo] = useState<MotivoDaDenunciaDeGrupo>("spam");
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const enviar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/public/mensagens/grupos/${id}/denuncia`, { motivo, texto }),
    onSuccess: async (r) => setAviso({ ok: true, texto: `Denúncia enviada. Protocolo ${(await r.json()).protocolo}. A plataforma lê só as últimas mensagens do grupo.` }),
    onError: (e: Error) => setAviso({ ok: false, texto: e.message }),
  });
  return (
    <Janela onFechar={aoFechar} rotulo="Denunciar o grupo" className="p-4">
      <h2 className="font-display text-lg font-extrabold">Denunciar o grupo</h2>
      <div className="mt-3 space-y-3 text-sm">
        <fieldset>
          <legend className="label-xs">Motivo</legend>
          <div className="mt-1 space-y-1">
            {(Object.keys(MOTIVOS_DA_DENUNCIA_DE_GRUPO) as MotivoDaDenunciaDeGrupo[]).map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="radio" name="motivo-grupo" checked={motivo === m} onChange={() => setMotivo(m)} />
                {MOTIVOS_DA_DENUNCIA_DE_GRUPO[m]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="grupo-denuncia-texto" className="label-xs">
            Quer contar mais? (opcional)
          </label>
          <textarea id="grupo-denuncia-texto" className="campo w-full" rows={3} maxLength={500} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        {aviso ? <p role="status" className={`rounded-md px-3 py-2 ${aviso.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{aviso.texto}</p> : null}
        <button type="button" onClick={() => enviar.mutate()} disabled={enviar.isPending || aviso?.ok === true} className="rounded-md bg-green px-4 py-2 font-semibold text-on-green disabled:opacity-50">
          Enviar denúncia
        </button>
      </div>
    </Janela>
  );
}

/**
 * "Grupos desta rifa", na página da rifa: só aparece com as mensagens ligadas e
 * conta de apostador. Quem ainda não comprou vê o motivo de não participar.
 */
export function GruposDaRifa({ slug }: { slug: string }) {
  const { mensagensLigado } = useConfigDoApp();
  const { data: sessao } = useSession();
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const logado = Boolean(sessao?.buyer);
  const { data } = useQuery<{ podeParticipar: boolean; itens: { id: string; nome: string; membros: number; max: number; cheio: boolean; souMembro: boolean }[] } | null>({
    queryKey: ["/api/public/mensagens/grupos/rifa", slug],
    enabled: mensagensLigado && logado,
    queryFn: async () => {
      const r = await fetch(`/api/public/mensagens/grupos/rifa/${encodeURIComponent(slug)}`, { credentials: "include" });
      if (!r.ok) return null; // sem apelido ou sem conta de apostador: o cartão some, sem barulho
      return await r.json();
    },
  });
  const criar = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/public/mensagens/grupos", { rifa: slug, nome })).json() as Promise<{ id: string }>,
    onSuccess: (r) => window.location.assign(`/mensagens?grupo=${r.id}`),
    onError: (e: Error) => setErro(e.message),
  });
  const entrar = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/public/mensagens/grupos/${id}/entrar`, {});
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["/api/public/mensagens/grupos"] });
      window.location.assign(`/mensagens?grupo=${id}`);
    },
    onError: (e: Error) => setErro(e.message),
  });
  if (!mensagensLigado || !logado || !data) return null;
  return (
    <section aria-label="Grupos desta rifa" className="rounded-xl border border-line bg-white p-4">
      <h2 className="flex items-center gap-2 font-display text-base font-extrabold">
        <Users size={18} aria-hidden /> Grupos desta rifa
      </h2>
      <p className="mt-1 text-xs text-muted">
        Conversa de até <span className="tnum">{GRUPO_MAX_MEMBROS}</span> apostadores com compra paga nesta rifa. Só texto, sem links nem telefone.
      </p>
      {!data.podeParticipar ? <p className="mt-2 rounded-md bg-mist px-3 py-2 text-sm text-ink-2">Quando sua compra desta rifa estiver paga, você cria ou entra nos grupos.</p> : null}
      <ul className="mt-2 divide-y divide-line">
        {data.itens.map((g) => (
          <li key={g.id} className="flex items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-semibold">{g.nome}</span>
            <span className="tnum text-xs text-muted">
              {g.membros}/{g.max}
            </span>
            {g.souMembro ? (
              <Link href={`/mensagens?grupo=${g.id}`} className="rounded-md px-3 py-1.5 text-xs font-semibold text-green-deep hover:bg-mist">
                Abrir
              </Link>
            ) : (
              <button type="button" disabled={!data.podeParticipar || g.cheio || entrar.isPending} onClick={() => entrar.mutate(g.id)} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:bg-mist disabled:opacity-50">
                {g.cheio ? "Cheio" : "Entrar"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {data.itens.length === 0 ? <p className="mt-2 text-sm text-muted">Ainda não há grupos. {data.podeParticipar ? "Crie o primeiro." : ""}</p> : null}
      {data.podeParticipar ? (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setErro(null);
            criar.mutate();
          }}
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="grupo-nome" className="label-xs">
              Criar um grupo
            </label>
            <input id="grupo-nome" className="campo w-full" maxLength={GRUPO_NOME_MAX} placeholder="Nome do grupo" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <button type="submit" disabled={criar.isPending || nome.trim().length < 3} className="rounded-md bg-green px-4 py-2 text-sm font-semibold text-on-green disabled:opacity-50">
            Criar
          </button>
        </form>
      ) : null}
      {erro ? <p role="alert" className="mt-2 text-sm text-red">{erro}</p> : null}
    </section>
  );
}
