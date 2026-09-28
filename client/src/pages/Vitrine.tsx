import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, MapPin, Plus } from "lucide-react";
import { UFS, ufValida } from "@shared/endereco";
import { lerRegiao, gravarRegiao, regiaoEfetiva, type EscolhaDeRegiao } from "@/lib/regiao";
import { useSession } from "@/lib/session";
import { useTemplate } from "@/lib/template";
import { PublicShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { BannersVitrine } from "@/components/BannersVitrine";
import { CartaoDoFeed, type RifaDoFeed } from "@/components/CartaoDoFeed";
import { FotoComStory, VisualizadorDeStories, useVistos } from "@/components/Stories";
import { vistoAte } from "@/lib/stories";
import { temStoryNovo } from "@shared/vitrine";
import { InstalarApp } from "@/components/InstalarApp";
import { Patrocinadas } from "@/components/Patrocinadas";
import type { Bloco } from "@shared/template";
import { formatBRL } from "@shared/format";

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
    <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {lista?.map((c) => <CartaoDoFeed key={c.id} rifa={c} />)}
    </div>
  );

  const blocos = comPatrocinadas(template.blocos).filter((b) => b.ligado);
  // A fileira de stories ocupa o lugar do primeiro bloco "seguidos" ou
  // "estados" do template (os estados deram lugar aos stories, como no
  // Instagram); o outro não repete a fileira.
  const lugarDosStories = blocos.find((b) => b.tipo === "seguidos" || b.tipo === "estados")?.id;

  return (
    <PublicShell larga>
      {blocos.map((b) => {
          switch (b.tipo) {
            case "regiao":
              return <div key={b.id}>{blocoRegiao}</div>;
            case "banners":
              // No computador, o banner divide a faixa com os sorteios mais
              // próximos (bento); no celular, só o banner, como sempre.
              return (
                <div key={b.id} className="lg:mb-3 lg:grid lg:grid-cols-[2fr_1fr] lg:items-stretch lg:gap-4">
                  <BannersVitrine />
                  <SorteiosChegando rifas={data} />
                </div>
              );
            case "seguidos":
            case "estados":
              return b.id === lugarDosStories ? <StoriesDaVitrine key={b.id} /> : null;
            case "rifas":
              return (
                <section key={b.id} aria-label={b.titulo || "Rifas no ar"}>
                  {b.titulo ? <h2 className="mt-4 font-display text-lg font-bold">{b.titulo}</h2> : null}
                  {isLoading ? <p className="py-2 text-sm text-muted">Carregando rifas…</p> : null}
                  {!isLoading && (data?.length ?? 0) === 0 ? <Empty>Nenhuma rifa publicada ainda.</Empty> : null}
                  {gradeDeRifas(b.quantidade ? data?.slice(0, b.quantidade) : data)}
                </section>
              );
            case "patrocinadas":
              return <Patrocinadas key={b.id} rifas={data} titulo={b.titulo} regiao={regiao ? { uf: regiao.uf, cidade: regiao.cidade ?? null } : null} />;
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
 * Template publicado antes do bloco "Patrocinadas" existir não o traz: entra
 * logo antes do feed, ligado. Quem quiser mudar a ordem ou desligar faz pelo
 * construtor — aí o bloco já vem salvo no template.
 */
function comPatrocinadas(blocos: Bloco[]): Bloco[] {
  if (blocos.some((b) => b.tipo === "patrocinadas")) return blocos;
  const i = blocos.findIndex((b) => b.tipo === "rifas");
  const novo: Bloco = { id: "patrocinadas", tipo: "patrocinadas", ligado: true };
  return i < 0 ? [...blocos, novo] : [...blocos.slice(0, i), novo, ...blocos.slice(i)];
}

/**
 * O cartão ao lado do banner no computador: as rifas à venda com o sorteio
 * mais perto (amarelo = espera e prêmio). Só aparece a partir de `lg` — no
 * celular o feed já traz as mesmas rifas.
 */
function SorteiosChegando({ rifas }: { rifas: RifaDoFeed[] | undefined }) {
  const agora = Date.now();
  const proximas = (rifas ?? [])
    .filter((r) => r.vende !== false && r.drawAt && new Date(r.drawAt).getTime() > agora)
    .sort((a, b) => new Date(a.drawAt!).getTime() - new Date(b.drawAt!).getTime())
    .slice(0, 4);
  if (proximas.length === 0) return null;
  const faltam = (iso: string) => {
    const dias = Math.ceil((new Date(iso).getTime() - agora) / 86_400_000);
    return dias <= 1 ? "amanhã ou hoje" : `em ${dias} dias`;
  };
  return (
    <section aria-label="Sorteios chegando" className="hidden rounded-xl border border-yellow bg-yellow-soft p-4 lg:block">
      <h2 className="flex items-center gap-2 font-display text-base font-bold text-yellow-deep">
        <CalendarClock size={18} aria-hidden />
        Sorteios chegando
      </h2>
      <ul className="mt-3 space-y-2">
        {proximas.map((r) => (
          <li key={r.id}>
            <Link
              href={r.organizacao ? `/o/${r.organizacao.slug}/r/${r.slug}` : `/r/${r.slug}`}
              className="flex items-center gap-3 rounded-lg bg-white p-2 hover:bg-mist"
            >
              <span
                aria-hidden
                className="h-12 w-12 shrink-0 rounded-md bg-mist-2 bg-cover bg-center"
                style={r.banner ? { backgroundImage: `url(${r.banner})` } : { background: "linear-gradient(145deg,#0B1F14,#00873E)" }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{r.prizeTitle}</span>
                <span className="block text-xs text-muted">
                  <span className="tnum">{new Date(r.drawAt!).toLocaleDateString("pt-BR")}</span> · {faltam(r.drawAt!)}
                </span>
              </span>
              <span className="tnum shrink-0 text-sm font-bold text-green-deep">{formatBRL(r.priceCents)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Tamanho da foto na fileira de stories — o do Instagram no celular. */
const FOTO_DO_STORY = 74;

/**
 * A fileira de stories no topo da vitrine, como no Instagram: todo perfil
 * com story no ar. Quem a pessoa segue vem primeiro; dentro disso, story
 * ainda não visto antes do já visto (o "visto" fica no aparelho). Tocar abre
 * os stories. O organizador vê "Seu story" no começo, que leva a postar.
 * Sem nenhum story e sem ser organizador, não ocupa espaço.
 */
function StoriesDaVitrine() {
  useVistos();
  const { data: sessao } = useSession();
  const [aberto, setAberto] = useState<string | null>(null);
  const { data = [] } = useQuery<
    { slug: string; nome: string; foto: string | null; ultimoStory: string; seguindo: boolean }[]
  >({ queryKey: ["/api/public/stories"], staleTime: 60_000 });
  const organizador = sessao?.role === "organizer";
  if (data.length === 0 && !organizador) return null;
  const visto = (o: { slug: string; ultimoStory: string }) => (temStoryNovo(o.ultimoStory, vistoAte(o.slug)) ? 0 : 1);
  // Estável: mantém a ordem do servidor (seguidos, mais novo) dentro de cada faixa.
  const ordem = [...data].sort((a, b) => visto(a) - visto(b));
  return (
    <nav aria-label="Stories" className="-mx-4 mb-3 overflow-x-auto px-4 pt-1" style={{ scrollbarWidth: "none" }}>
      <ul className="flex gap-3">
        {organizador ? (
          <li className="w-[86px] shrink-0 text-center">
            <Link href="/admin/stories" className="mx-auto block w-fit" aria-label="Postar no seu story">
              <span
                className="relative flex items-center justify-center rounded-full border border-line-2 bg-mist p-[5px]"
                style={{ width: FOTO_DO_STORY + 10, height: FOTO_DO_STORY + 10 }}
              >
                <span aria-hidden className="font-display text-2xl font-extrabold text-muted">
                  {sessao?.user?.name?.trim().charAt(0).toUpperCase() ?? "+"}
                </span>
                <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-ink text-white">
                  <Plus size={14} aria-hidden />
                </span>
              </span>
            </Link>
            <span className="mt-1 block truncate text-xs text-ink-2">Seu story</span>
          </li>
        ) : null}
        {ordem.map((o) => (
          <li key={o.slug} className="w-[86px] shrink-0 text-center">
            <span className="mx-auto block w-fit">
              <FotoComStory
                slug={o.slug}
                nome={o.nome}
                foto={o.foto}
                ultimoStory={o.ultimoStory}
                tamanho={FOTO_DO_STORY}
                onAbrir={() => setAberto(o.slug)}
              />
            </span>
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
