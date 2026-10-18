import { useEffect, useRef, useState, type FormEvent } from "react";
import ConversaComAOrganizacao from "@/pages/ConversaComAOrganizacao";
import { noEnderecoDaOrganizacao } from "@/lib/endereco";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Flag, ImagePlus, PenSquare, Send } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Janela } from "@/components/Janela";
import { FotoDoPerfil } from "@/components/Seguir";
import { SeloVerificado } from "@/components/SeloVerificado";
import { EmBreve } from "@/pages/EmBreve";
import { acimaDoConsole, useConfigDoApp } from "@/components/Console";
import { Button, Caixa, Campo, Empty, Filtros, Pill, TONS_DO_BOTAO } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { lerFoto } from "@/lib/anexo";
import { GrupoAberto, ListaDeGrupos, painelAberto } from "@/components/Grupos";
import {
  MENSAGEM_MAX,
  MOTIVOS_DA_DENUNCIA_DE_MENSAGEM,
  ROTULO_ONLINE,
  TRECHO_DA_DENUNCIA,
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
  /** Só `true` quando eu também mostro o meu, a conversa foi aceita e a pessoa está na caixa. */
  online: boolean;
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
  /** Endereço da foto (só quem está na conversa a abre). */
  foto: string | null;
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
    online: boolean;
    podeEnviarFoto: boolean;
    impedimento: string | null;
    naoLidas: number;
  };
  itens: Mensagem[];
  proximo: string | null;
}

const ROTULO_DO_TIPO: Record<TipoDeParticipante, string> = { comprador: "Apostador", organizacao: "Organização", afiliado: "Afiliado" };

/**
 * A altura da caixa no celular e no tablet: a tela menos o topo (57 px), o
 * respiro de cima da página (16) e o console — a conversa tem a rolagem dela e o
 * campo de escrever fica sempre à vista. No computador, a tela menos o respiro.
 */
const ALTURA_DA_CAIXA = { ["--altura-da-caixa" as string]: `calc(100svh - 73px - ${acimaDoConsole})` };

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
/**
 * No endereço de uma organização, Mensagens é só a conversa com ela (docs/PLANO-SUBDOMINIO.md,
 * cap. 15.2); no domínio principal, a caixa inteira. A troca fica aqui, num invólucro sem estado,
 * para a rota do App seguir a mesma nos dois lugares.
 */
export default function Mensagens() {
  return noEnderecoDaOrganizacao() ? <ConversaComAOrganizacao /> : <MensagensPagina />;
}

function MensagensPagina() {
  const { mensagensLigado } = useConfigDoApp();
  const { data: sessao, isLoading } = useSession();
  const [, parametros] = useRoute<{ id: string }>("/mensagens/:id");
  const grupo = new URLSearchParams(useSearch()).get("grupo");
  if (!mensagensLigado) return <EmBreve tela="mensagens" />;
  const temConta = Boolean(sessao?.buyer || (sessao?.user && (sessao.role === "organizer" || sessao.role === "affiliate")));
  if (!isLoading && !temConta) {
    return (
      <PublicShell>
        <section className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
          <h1 className="font-display text-2xl font-extrabold">Mensagens</h1>
          <p className="max-w-sm text-sm text-ink-2">Entre na sua conta para conversar com apostadores, organizações e afiliados.</p>
          <Link href="/entrar?volta=/mensagens" className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-[13px] font-semibold ${TONS_DO_BOTAO.primario}`}>
            Entrar
          </Link>
        </section>
      </PublicShell>
    );
  }
  const aberta = parametros?.id && parametros.id !== "nova" ? parametros.id : null;
  const grupoAberto = !aberta && grupo && /^[0-9a-f-]{36}$/i.test(grupo) ? grupo : null;
  return (
    <PublicShell larga>
      {/* Celular e tablet: a lista, e a conversa por cima dela (no lugar dela, com o
          "Voltar"). Computador: a lista de 340 px e a conversa ao lado, na altura da tela. */}
      <div
        style={ALTURA_DA_CAIXA}
        className="-mx-4 -mb-8 grid grid-cols-1 lg:mx-0 lg:mb-0 lg:h-[calc(100svh-3rem)] lg:grid-cols-[340px_minmax(0,1fr)] lg:overflow-hidden lg:rounded-xl lg:border lg:border-line"
      >
        <div className={`min-w-0 lg:flex lg:min-h-0 lg:flex-col lg:border-r lg:border-line ${aberta || grupoAberto ? "hidden" : ""}`}>
          <ListaDeConversas ativa={aberta} grupoAtivo={grupoAberto} />
        </div>
        <div className={`min-w-0 lg:min-h-0 ${aberta || grupoAberto ? "" : "hidden lg:block"}`}>
          {grupoAberto ? (
            <GrupoAberto id={grupoAberto} />
          ) : aberta ? (
            <Conversa id={aberta} />
          ) : (
            <p className="hidden h-full items-center justify-center p-8 text-center text-sm text-muted lg:flex">Escolha uma conversa ou comece uma nova.</p>
          )}
        </div>
      </div>
    </PublicShell>
  );
}

/* ------------------------------------------------------------------ *
 * A lista
 * ------------------------------------------------------------------ */

/** A bolinha com o texto ao lado: o estado nunca vai só na cor. */
function OnlineAgora() {
  return (
    <span>
      <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-green align-middle" />
      {ROTULO_ONLINE}
    </span>
  );
}

/**
 * "Mostrar quando estou online": nasce desligado. Quem esconde também não vê
 * o dos outros (como no Instagram), e nunca aparece o horário — só "online agora".
 */
function MostrarOnline() {
  const qc = useQueryClient();
  const { data } = useQuery<{ mostrar: boolean }>({ queryKey: ["/api/public/mensagens/presenca"] });
  const alternar = useMutation({
    mutationFn: (mostrar: boolean) => apiRequest("PUT", "/api/public/mensagens/presenca", { mostrar }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/public/mensagens/presenca"] });
      qc.invalidateQueries({ queryKey: ["/api/public/mensagens/conversas"] });
    },
  });
  return (
    <Caixa
      className="border-t border-line px-4 py-3"
      marcada={data?.mostrar === true}
      disabled={!data || alternar.isPending}
      aoMudar={(v) => alternar.mutate(v)}
      sub={`Só aparece "${ROTULO_ONLINE}" para quem também mostra o dele, nas conversas aceitas. Nunca o horário.`}
    >
      <span className="font-semibold">Mostrar quando estou online</span>
    </Caixa>
  );
}

/** Quem está online agora entre as conversas aceitas (o servidor só manda quando os dois mostram). */
function FileiraOnline({ itens }: { itens: ItemDaLista[] }) {
  if (!itens.length) return null;
  return (
    <section aria-labelledby="fileira-online" className="border-b border-line px-4 pb-3">
      <h2 id="fileira-online" className="font-mono text-[11px] uppercase tracking-wider text-ink-2">
        {ROTULO_ONLINE}
      </h2>
      <ul className="relative mt-2 flex gap-3 overflow-x-auto">
        {itens.map((c) => (
          <li key={c.id} className="w-16 shrink-0">
            <Link href={`/mensagens/${c.id}`} className="flex flex-col items-center gap-1 rounded-lg p-0.5 hover:bg-mist">
              <span className="relative">
                <FotoDoPerfil nome={c.com.nome} foto={c.com.foto} tamanho={52} />
                <span aria-hidden className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-green" />
              </span>
              <span className="w-full truncate text-center text-[11px] text-ink-2">{c.com.nome}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type AbaDaCaixa = "conversas" | "pedidos" | "grupos";

function ListaDeConversas({ ativa, grupoAtivo }: { ativa: string | null; grupoAtivo: string | null }) {
  const [aba, setAba] = useState<AbaDaCaixa>(grupoAtivo ? "grupos" : "conversas");
  // Quem chega de um botão "Mensagem" (`?para=` ou `?rifa=`) já abre a nova conversa.
  const [nova, setNova] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return q.has("para") || q.has("rifa");
  });
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
    <section aria-label="Conversas" className="bg-white lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 lg:pt-3">
        <h1 className="font-display text-2xl font-extrabold">Mensagens</h1>
        <button
          type="button"
          onClick={() => setNova(true)}
          aria-label="Nova conversa"
          title="Nova conversa"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-mist"
        >
          <PenSquare size={22} aria-hidden />
        </button>
      </div>
      {aba === "conversas" ? <FileiraOnline itens={itens.filter((c) => c.online)} /> : null}
      <Filtros
        exclusivo
        rotulo="Caixa de mensagens"
        className="border-b border-line px-3 py-2"
        ativa={aba}
        aoMudar={setAba}
        opcoes={[
          { valor: "conversas", rotulo: "Conversas" },
          { valor: "pedidos", rotulo: temPedido ? "Pedidos (novos)" : "Pedidos" },
          { valor: "grupos", rotulo: "Grupos" },
        ]}
      />
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {aba === "grupos" ? <ListaDeGrupos ativo={grupoAtivo} /> : null}
        {aba !== "grupos" && lista.isLoading ? <Empty>Carregando…</Empty> : null}
        {aba !== "grupos" && lista.isError ? <Empty>Não foi possível carregar as conversas.</Empty> : null}
        {aba !== "grupos" && !lista.isLoading && !lista.isError && itens.length === 0 ? (
          aba === "pedidos" ? (
            <Empty>Nenhum pedido de mensagem.</Empty>
          ) : (
            <div className="px-4 pb-6 text-center">
              <Empty>Nenhuma conversa ainda.</Empty>
              <Button icone={<PenSquare />} className="-mt-4" onClick={() => setNova(true)}>
                Nova conversa
              </Button>
            </div>
          )
        ) : null}
        <ul className={aba === "grupos" ? "hidden" : "divide-y divide-line"}>
          {itens.map((c) => {
            const pedidoParaMim = c.situacao === "pedido" && !c.euIniciei;
            const marcas = [c.bloqueada ? "bloqueada" : null, c.situacao === "pedido" && c.euIniciei ? "pedido enviado" : null].filter(Boolean);
            return (
              <li key={c.id}>
                <Link
                  href={`/mensagens/${c.id}`}
                  aria-current={ativa === c.id ? "page" : undefined}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-mist ${ativa === c.id ? "bg-mist" : ""}`}
                >
                  <FotoDoPerfil nome={c.com.nome} foto={c.com.foto} tamanho={48} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-[15px] font-semibold">
                      <span className="truncate">{c.com.nome}</span>
                      {c.com.verificado ? <SeloVerificado sujeito={c.com.tipo === "organizacao" ? "organizacao" : c.com.tipo === "afiliado" ? "afiliado" : "apostador"} tamanho={14} /> : null}
                    </span>
                    <span className={`line-clamp-2 break-words text-sm ${c.naoLidas ? "font-semibold text-ink" : "text-ink-2"}`}>
                      {pedidoParaMim ? `Pedido de mensagem${c.previa ? ` · ${c.previa}` : ""}` : (c.previa ?? "Sem mensagens")}
                    </span>
                    {c.online || marcas.length ? (
                      <span className="block text-[11px] text-muted">
                        {c.online ? <OnlineAgora /> : null}
                        {c.online && marcas.length ? " · " : ""}
                        {marcas.join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 self-start pt-1">
                    <span className="tnum text-[11px] text-muted">{hora(c.ultimaEm)}</span>
                    {c.naoLidas ? (
                      <span className="tnum min-w-[18px] rounded-full bg-green px-1.5 text-center text-[11px] font-bold leading-[15px] text-on-green">
                        <span className="sr-only">{c.naoLidas} não lida(s)</span>
                        <span aria-hidden>{c.naoLidas > 99 ? "99+" : c.naoLidas}</span>
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {aba !== "grupos" && lista.hasNextPage ? (
          <div className="p-3 text-center">
            <Button variant="cinza" onClick={() => void lista.fetchNextPage()} disabled={lista.isFetchingNextPage}>
              {lista.isFetchingNextPage ? "Carregando…" : "Ver mais"}
            </Button>
          </div>
        ) : null}
      </div>
      <MostrarOnline />
      {nova ? <NovaConversa aoFechar={() => setNova(false)} /> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Nova conversa
 * ------------------------------------------------------------------ */

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
        className="mt-3 flex items-start gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (busca.trim()) procurar.mutate(busca.trim());
        }}
      >
        <Campo className="min-w-0 flex-1" rotulo="Para quem" dica="O @apelido, o endereço da organização ou o código do afiliado, exatos.">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
        </Campo>
        <Button type="submit" variant="cinza" disabled={procurar.isPending} className="mt-[22px] shrink-0">
          Buscar
        </Button>
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
          {rifa ? <p className="rounded-lg bg-mist px-3 py-2 text-xs text-ink-2">O cartão da rifa vai junto com a mensagem.</p> : null}
          <Campo rotulo={`Mensagem${rifa ? " (opcional)" : ""}`} dica="Sem link e sem telefone. Quem não segue você recebe um pedido de mensagem.">
            <textarea rows={3} maxLength={MENSAGEM_MAX} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
          <Button type="submit" className="w-full" disabled={enviar.isPending || (!texto.trim() && !rifa)}>
            {enviar.isPending ? "Enviando…" : "Enviar"}
          </Button>
        </form>
      ) : null}
      {erro ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-soft px-3 py-2 text-sm text-red">
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
  const enviarFoto = useMutation({
    mutationFn: async (arquivo: File) => {
      const imagem = await lerFoto(arquivo);
      return apiRequest("POST", `/api/public/mensagens/conversas/${id}/mensagens`, { imagem });
    },
    onSuccess: () => {
      setErro(null);
      invalidar();
    },
    onError: (e: Error) => setErro(e.message),
  });
  const escolherFoto = useRef<HTMLInputElement>(null);
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

  if (pagina.isError) return <p role="alert" className="p-6 text-center text-sm text-red">{(pagina.error as Error).message}</p>;
  if (!c) return <p className="p-6 text-center text-sm text-muted">Carregando…</p>;

  const pedidoParaMim = c.situacao === "pedido" && !c.euIniciei;
  return (
    <section aria-label={`Conversa com ${c.com.nome}`} className={painelAberto}>
      <header className="flex items-center gap-3 border-b border-line px-3 py-3 lg:px-4">
        <Link href="/mensagens" aria-label="Voltar para a lista" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-mist lg:hidden">
          <ArrowLeft size={22} aria-hidden />
        </Link>
        <FotoDoPerfil nome={c.com.nome} foto={c.com.foto} tamanho={40} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="flex items-center gap-1 text-[15px] font-semibold">
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
            {c.online ? (
              <span className="text-green-deep">
                <OnlineAgora />
              </span>
            ) : (
              ROTULO_DO_TIPO[c.com.tipo]
            )}
            {c.encerrada ? " · encerrada pela plataforma" : c.bloqueada ? " · bloqueada" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => bloquear.mutate(!c.bloqueadaPorMim)}
          disabled={bloquear.isPending || (c.bloqueada && !c.bloqueadaPorMim) || c.encerrada}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium text-ink-2 hover:bg-mist disabled:opacity-40 sm:w-auto sm:px-2"
        >
          <Ban size={16} aria-hidden />
          {/* No celular só o ícone: o nome de quem fala é o que precisa de espaço. */}
          <span className="sr-only sm:not-sr-only">{c.bloqueadaPorMim ? "Desbloquear" : "Bloquear"}</span>
        </button>
        <button
          type="button"
          onClick={() => setDenunciando(true)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium text-ink-2 hover:bg-mist sm:w-auto sm:px-2"
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
            <Button onClick={() => pedido.mutate("aceitar")} disabled={pedido.isPending}>
              Aceitar
            </Button>
            <Button variant="cinza" onClick={() => pedido.mutate("recusar")} disabled={pedido.isPending}>
              Recusar
            </Button>
          </div>
        </div>
      ) : c.situacao === "pedido" && c.euIniciei ? (
        <p className="border-b border-line bg-mist px-4 py-2 text-xs text-ink-2">
          <Pill status="pending">pedido enviado</Pill> A pessoa precisa aceitar para você mandar mais mensagens.
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
        {todas.length === 0 ? <Empty>Sem mensagens.</Empty> : null}
        {todas.map((m) => (
          <div key={m.id} className={`flex ${m.minha ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm lg:max-w-[388px] ${m.minha ? "bg-green text-on-green" : "bg-mist-2 text-ink"}`}>
              {m.rifa ? (
                <Link href={m.rifa.caminho} className={`mb-1 block rounded-lg border px-3 py-2 text-xs font-semibold ${m.minha ? "border-current" : "border-line bg-white"}`}>
                  Rifa · {m.rifa.titulo}
                </Link>
              ) : null}
              {m.foto ? (
                <a href={m.foto} target="_blank" rel="noopener noreferrer" aria-label="Abrir a foto (abre em outra aba)" className="mb-1 block">
                  <img src={m.foto} alt="Foto enviada na conversa" loading="lazy" className="max-h-72 w-full rounded-lg object-cover" />
                </a>
              ) : null}
              {m.texto ? <p className="whitespace-pre-wrap break-words">{m.texto}</p> : null}
              <p className={`tnum mt-0.5 text-right text-[10px] ${m.minha ? "opacity-80" : "text-muted"}`}>{hora(m.em)}</p>
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>

      {c.podeEnviar ? (
        <form
          className="flex items-center gap-2 border-t border-line px-3 py-3 lg:px-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (texto.trim()) enviar.mutate();
          }}
        >
          {c.podeEnviarFoto ? (
            <>
              <input
                ref={escolherFoto}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) enviarFoto.mutate(f);
                }}
              />
              <button
                type="button"
                onClick={() => escolherFoto.current?.click()}
                disabled={enviarFoto.isPending}
                aria-label={enviarFoto.isPending ? "Enviando a foto…" : "Enviar uma foto"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-mist disabled:opacity-50"
              >
                <ImagePlus size={22} aria-hidden />
              </button>
            </>
          ) : null}
          <div className="min-w-0 flex-1">
            <label htmlFor="msg-resposta" className="sr-only">
              Mensagem
            </label>
            <textarea
              id="msg-resposta"
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
        <p className="border-t border-line px-4 py-3 text-center text-sm text-ink-2">{c.impedimento}</p>
      )}
      {erro ? (
        <p role="alert" className="mx-3 mb-3 rounded-lg bg-red-soft px-3 py-2 text-sm text-red">
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
    onSuccess: (r) => setAviso({ ok: true, texto: `Denúncia registrada — protocolo ${r.protocolo}. A plataforma vai analisar as últimas ${TRECHO_DA_DENUNCIA} mensagens.` }),
    onError: (e: Error) => setAviso({ ok: false, texto: e.message }),
  });
  return (
    <Janela onFechar={aoFechar} rotulo="Denunciar conversa" className="p-4">
      <h2 className="font-display text-lg font-extrabold">Denunciar conversa</h2>
      <p className="mt-1 text-xs text-muted">
        Só as últimas <span className="tnum">{TRECHO_DA_DENUNCIA}</span> mensagens vão para a plataforma — ela nunca lê a conversa inteira. A outra
        pessoa não vê quem denunciou.
      </p>
      <div className="mt-3 space-y-3">
        <Campo rotulo="Motivo">
          <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoDaDenunciaDeMensagem)}>
            {(Object.entries(MOTIVOS_DA_DENUNCIA_DE_MENSAGEM) as [MotivoDaDenunciaDeMensagem, string][]).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Quer explicar? (opcional)">
          <textarea rows={3} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </Campo>
        {aviso ? <p role="status" className={`rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{aviso.texto}</p> : null}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => enviar.mutate()} disabled={enviar.isPending || aviso?.ok}>
            Denunciar
          </Button>
          <Button variant="cinza" onClick={aoFechar}>
            {aviso?.ok ? "Fechar" : "Cancelar"}
          </Button>
        </div>
      </div>
    </Janela>
  );
}
