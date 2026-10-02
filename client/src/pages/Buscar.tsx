import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { FotoDoPerfil } from "@/components/Seguir";
import { SeloVerificado } from "@/components/SeloVerificado";
import { EmBreve } from "@/pages/EmBreve";
import { useConfigDoApp } from "@/components/Console";
import { Empty } from "@/components/bits";
import { BUSCA_TEXTO_MAX, ORDENS_DA_BUSCA, type OrdemDaBusca } from "@shared/buscar";
import { UFS } from "@shared/endereco";

interface Capa {
  url: string;
  srcSet: string | null;
  lqip: string | null;
}
interface Resposta {
  ligado: boolean;
  curto?: boolean;
  rifas: { slug: string; premio: string; organizacao: string; caminho: string; capa: Capa | null }[];
  organizacoes: { nome: string; caminho: string; local: string | null; foto: string | null; verificada: boolean }[];
  apostadores: { apelido: string; caminho: string; foto: string | null; verificado: boolean }[];
  proximo: string | null;
}

/**
 * Buscar: o campo no topo e, embaixo, a grade das publicações mais novas, como
 * a aba Buscar do Instagram. Com texto, acha rifas (título, prêmio e
 * organização), organizações e — se a plataforma ligar — o @apelido exato.
 * Desligada, é a tela "Em breve". Tudo vem do servidor, que só devolve o que a
 * vitrine mostraria.
 */
export default function BuscarPagina() {
  const { buscarLigado } = useConfigDoApp();
  if (!buscarLigado) return <EmBreve tela="buscar" />;
  return <Buscar />;
}

function Buscar() {
  const [texto, setTexto] = useState("");
  // Digitar não chama o servidor a cada letra: a busca sai quando a pessoa para.
  const [termo, setTermo] = useState("");
  // Escolhas da pessoa: a ordem e o estado (filtro explícito, como /estado/UF).
  const [ordem, setOrdem] = useState<OrdemDaBusca>("novas");
  const [estado, setEstado] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTermo(texto.trim()), 350);
    return () => clearTimeout(t);
  }, [texto]);

  const lista = useInfiniteQuery<Resposta>({
    queryKey: ["/api/public/buscar", termo, ordem, estado],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const q = new URLSearchParams();
      if (termo) q.set("q", termo);
      if (ordem !== "novas") q.set("ordem", ordem);
      if (estado) q.set("estado", estado);
      if (pageParam) q.set("depois", String(pageParam));
      const r = await fetch(`/api/public/buscar?${q}`, { credentials: "include" });
      if (r.status === 429) throw new Error("Muitas buscas seguidas. Espere um minuto.");
      if (!r.ok) throw new Error("Não foi possível buscar agora.");
      return (await r.json()) as Resposta;
    },
    getNextPageParam: (u) => u.proximo ?? undefined,
  });
  const paginas = lista.data?.pages ?? [];
  const rifas = paginas.flatMap((p) => p.rifas);
  const organizacoes = paginas[0]?.organizacoes ?? [];
  const apostadores = paginas[0]?.apostadores ?? [];
  const curto = paginas[0]?.curto;

  // A próxima leva vem quando o fim da grade aparece.
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = fim.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const olho = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && lista.hasNextPage && !lista.isFetchingNextPage) void lista.fetchNextPage();
    });
    olho.observe(el);
    return () => olho.disconnect();
  }, [lista, rifas.length]);

  const buscando = termo.length > 0;
  const filtrando = ordem !== "novas" || estado !== "";
  const vazio = !lista.isLoading && !lista.isError && !curto && rifas.length === 0 && organizacoes.length === 0 && apostadores.length === 0;
  return (
    <PublicShell larga>
      <h1 className="sr-only">Buscar</h1>
      <form role="search" onSubmit={(e) => { e.preventDefault(); setTermo(texto.trim()); }} className="mb-4">
        <label htmlFor="buscar-campo" className="sr-only">
          Buscar rifas, organizações e @apelidos
        </label>
        <div className="relative">
          <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="buscar-campo"
            type="search"
            className="campo w-full pl-10"
            placeholder="Buscar"
            maxLength={BUSCA_TEXTO_MAX}
            value={texto}
            autoComplete="off"
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Ordem das publicações" className="flex gap-1">
          {(Object.keys(ORDENS_DA_BUSCA) as OrdemDaBusca[]).map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={ordem === o}
              onClick={() => setOrdem(o)}
              className={`min-h-6 rounded-full border px-3 py-1 text-xs font-semibold ${ordem === o ? "border-green bg-green-soft text-green-deep" : "border-line-2 text-ink-2 hover:bg-mist"}`}
            >
              {ORDENS_DA_BUSCA[o]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <span>Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="campo py-1 text-sm">
            <option value="">Todo o Brasil</option>
            {Object.entries(UFS).map(([uf, nome]) => (
              <option key={uf} value={uf}>
                {uf} · {nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      {curto ? <p className="py-6 text-center text-sm text-muted">Digite pelo menos 2 letras.</p> : null}
      {lista.isError ? <p role="alert" className="py-6 text-center text-sm text-red">{(lista.error as Error).message}</p> : null}

      {apostadores.length || organizacoes.length ? (
        <section aria-label="Perfis" className="mb-4 overflow-hidden rounded-xl border border-line bg-white">
          <ul className="divide-y divide-line">
            {organizacoes.map((o) => (
              <li key={o.caminho}>
                <Link href={o.caminho} className="flex items-center gap-3 px-4 py-3 hover:bg-mist">
                  <FotoDoPerfil nome={o.nome} foto={o.foto} tamanho={44} />
                  <span className="min-w-0 text-sm">
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="truncate">{o.nome}</span>
                      {o.verificada ? <SeloVerificado sujeito="organizacao" tamanho={14} /> : null}
                    </span>
                    <span className="block text-xs text-muted">Organização{o.local ? ` · ${o.local}` : ""}</span>
                  </span>
                </Link>
              </li>
            ))}
            {apostadores.map((a) => (
              <li key={a.caminho}>
                <Link href={a.caminho} className="flex items-center gap-3 px-4 py-3 hover:bg-mist">
                  <FotoDoPerfil nome={a.apelido} foto={a.foto} tamanho={44} />
                  <span className="min-w-0 text-sm">
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="truncate">@{a.apelido}</span>
                      {a.verificado ? <SeloVerificado sujeito="apostador" tamanho={14} /> : null}
                    </span>
                    <span className="block text-xs text-muted">Apostador</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {lista.isLoading ? <p className="py-8 text-center text-sm text-muted">Carregando…</p> : null}
      {vazio ? <Empty>{buscando || filtrando ? "Nada encontrado para essa busca." : "Ainda não há publicações."}</Empty> : null}

      {rifas.length ? (
        <section aria-label={buscando ? "Rifas encontradas" : ordem === "curtidas" ? "Publicações mais curtidas" : "Publicações mais novas"}>
          <ul className="grid grid-cols-3 gap-0.5 sm:gap-1 md:grid-cols-4 xl:grid-cols-6">
            {rifas.map((r) => (
              <li key={r.slug} className="min-w-0">
                <Link href={r.caminho} className="group relative block aspect-square overflow-hidden bg-mist-2" aria-label={`${r.premio}, de ${r.organizacao}`}>
                  {r.capa ? (
                    <img
                      src={r.capa.url}
                      srcSet={r.capa.srcSet ?? undefined}
                      sizes="(min-width: 1024px) 25vw, 34vw"
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:brightness-90"
                      style={r.capa.lqip ? { backgroundImage: `url(${r.capa.lqip})`, backgroundSize: "cover" } : undefined}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center p-2 text-center text-xs font-semibold text-ink-2">{r.premio}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <div ref={fim} aria-hidden className="h-px" />
          {lista.isFetchingNextPage ? <p className="py-4 text-center text-xs text-muted">Carregando mais…</p> : null}
          {lista.hasNextPage && !lista.isFetchingNextPage ? (
            <div className="py-4 text-center">
              <button type="button" onClick={() => void lista.fetchNextPage()} className="rounded-md px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-mist-2">
                Ver mais
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </PublicShell>
  );
}
