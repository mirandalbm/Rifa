import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { UFS, ufValida } from "@shared/endereco";
import { lerRegiao, gravarRegiao, regiaoEfetiva, type EscolhaDeRegiao } from "@/lib/regiao";
import { useSession } from "@/lib/session";
import { useTemplate } from "@/lib/template";
import { FotoDoPerfil } from "@/components/Seguir";
import { PublicShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { BannersVitrine } from "@/components/BannersVitrine";
import { EstadosVitrine } from "@/components/EstadosVitrine";
import { CartaoDoFeed, type RifaDoFeed } from "@/components/CartaoDoFeed";
import { FotoComStory, VisualizadorDeStories, useVistos } from "@/components/Stories";
import { vistoAte } from "@/lib/stories";
import { temStoryNovo } from "@shared/vitrine";
import { InstalarApp } from "@/components/InstalarApp";

/** Vitrine multi-rifas: todas as campanhas no ar, banner na frente. */
export default function Vitrine() {
  const template = useTemplate();
  const { data: sessao } = useSession();
  const naConta = Boolean(sessao?.buyer?.conta);
  // Com conta, a região vem do CEP do cadastro — sem ninguém precisar
  // escolher. O seletor de estado muda só neste aparelho.
  const { data: conta } = useQuery<{ uf: string | null; cidade: string | null }>({
    queryKey: ["/api/public/conta"],
    enabled: naConta,
  });
  const [escolha, setEscolha] = useState<EscolhaDeRegiao>(() => lerRegiao());
  const regiao = regiaoEfetiva(escolha, conta);
  const { data, isLoading } = useQuery<RifaDoFeed[]>({
    queryKey: ["/api/public/campaigns", regiao ? { uf: regiao.uf, cidade: regiao.cidade ?? undefined } : undefined],
  });
  const escolher = (r: EscolhaDeRegiao) => {
    gravarRegiao(r);
    setEscolha(r);
  };

  // Cada bloco da tela inicial vem do template (ordem, ligado, título).
  const blocoRegiao = (
      <div className="flex items-center gap-2 pb-1">
        <MapPin size={16} aria-hidden className="shrink-0 text-muted" />
        <label htmlFor="vitrine-uf" className="text-sm text-ink-2">
          Rifas perto de
        </label>
        <select
          id="vitrine-uf"
          value={escolha === "todos" ? "" : (regiao?.uf ?? "")}
          onChange={(e) => {
            const uf = e.target.value;
            if (!uf) return escolher("todos");
            // Voltar ao estado da conta devolve também a cidade dela.
            if (conta?.uf === uf) return escolher(null);
            if (ufValida(uf)) escolher({ uf, cidade: null });
          }}
          className="min-w-0 flex-1 rounded-md border border-line-2 bg-white px-2 py-1.5 text-sm font-semibold sm:flex-none"
        >
          <option value="">Todo o Brasil</option>
          {Object.entries(UFS).map(([sigla, nome]) => (
            <option key={sigla} value={sigla}>
              {nome}
            </option>
          ))}
        </select>
      </div>
  );
  const gradeDeRifas = (lista: RifaDoFeed[] | undefined) => (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      {lista?.map((c) => <CartaoDoFeed key={c.id} rifa={c} />)}
    </div>
  );

  return (
    <PublicShell>
      {template.blocos
        .filter((b) => b.ligado)
        .map((b) => {
          switch (b.tipo) {
            case "regiao":
              return <div key={b.id}>{blocoRegiao}</div>;
            case "banners":
              return <BannersVitrine key={b.id} />;
            case "seguidos":
              return <StoriesDosSeguidos key={b.id} />;
            case "estados":
              return <EstadosVitrine key={b.id} uf={regiao?.uf ?? null} />;
            case "rifas":
              return (
                <section key={b.id} aria-label={b.titulo || "Rifas no ar"}>
                  {b.titulo ? <h2 className="mt-4 font-display text-lg font-bold">{b.titulo}</h2> : null}
                  {isLoading ? <p className="py-2 text-sm text-muted">Carregando rifas…</p> : null}
                  {!isLoading && (data?.length ?? 0) === 0 ? <Empty>Nenhuma rifa publicada ainda.</Empty> : null}
                  {gradeDeRifas(b.quantidade ? data?.slice(0, b.quantidade) : data)}
                </section>
              );
            case "texto":
              return (
                <section key={b.id} className="mt-4 rounded-xl border border-line bg-mist p-4 text-sm">
                  {b.titulo ? <h2 className="font-display text-base font-bold">{b.titulo}</h2> : null}
                  <p className="mt-1 whitespace-pre-line text-ink-2">{b.corpo}</p>
                </section>
              );
            case "ajuda":
              return (
                <Link key={b.id} href="/ajuda" className="mt-4 block rounded-xl border border-line px-4 py-3 text-sm font-semibold text-marca hover:bg-mist">
                  {b.titulo || "Central de ajuda"} →
                </Link>
              );
            default:
              return null;
          }
        })}
      <InstalarApp />
    </PublicShell>
  );
}

/**
 * Stories dos perfis que a pessoa segue, em bolinhas no topo — como no
 * Instagram. Quem tem story novo vem primeiro, com o anel aceso; tocar abre
 * os stories (sem story, abre o perfil). Sem sessão ou sem ninguém seguido,
 * não ocupa espaço.
 */
function StoriesDosSeguidos() {
  useVistos();
  const [aberto, setAberto] = useState<string | null>(null);
  const { data } = useQuery<{ slug: string; nome: string; foto: string | null; ultimoStory: string | null }[]>({
    queryKey: ["/api/public/seguindo"],
  });
  if (!data?.length) return null;
  const peso = (o: { slug: string; ultimoStory: string | null }) =>
    !o.ultimoStory ? 2 : temStoryNovo(o.ultimoStory, vistoAte(o.slug)) ? 0 : 1;
  const ordem = [...data].sort((a, b) => peso(a) - peso(b));
  return (
    <nav aria-label="Stories de quem você segue" className="-mx-4 mb-3 overflow-x-auto px-4" style={{ scrollbarWidth: "none" }}>
      <ul className="flex gap-3">
        {ordem.map((o) => (
          <li key={o.slug} className="w-20 shrink-0 text-center">
            {o.ultimoStory ? (
              <span className="mx-auto block w-fit">
                <FotoComStory slug={o.slug} nome={o.nome} foto={o.foto} ultimoStory={o.ultimoStory} tamanho={62} onAbrir={() => setAberto(o.slug)} />
              </span>
            ) : (
              <Link href={`/o/${o.slug}`} className="mx-auto block w-fit rounded-full border border-transparent p-[2px]">
                <span className="block p-[2px]">
                  <FotoDoPerfil nome={o.nome} foto={o.foto} tamanho={62} />
                </span>
              </Link>
            )}
            <Link href={`/o/${o.slug}`} className="mt-1 block truncate text-xs text-ink-2">
              {o.nome}
            </Link>
          </li>
        ))}
      </ul>
      {aberto ? <VisualizadorDeStories slug={aberto} onFechar={() => setAberto(null)} /> : null}
    </nav>
  );
}
