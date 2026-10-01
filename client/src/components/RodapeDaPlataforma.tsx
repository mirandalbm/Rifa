import { Link } from "wouter";
import { Facebook, Instagram, LifeBuoy, MessageCircle, Music2, Send, Twitter, Youtube, type LucideIcon } from "lucide-react";
import { useTemplate } from "@/lib/template";
import { Marca } from "@/components/Marca";
import { PreferenciaDeCookies } from "@/components/AppShell";
import { COLUNAS_DO_RODAPE } from "@shared/rodape";
import { REDES_DO_RODAPE, type Rede } from "@shared/template";

const ICONE_DA_REDE: Record<Rede, LucideIcon> = {
  instagram: Instagram,
  whatsapp: MessageCircle,
  youtube: Youtube,
  facebook: Facebook,
  tiktok: Music2,
  x: Twitter,
  telegram: Send,
};

/**
 * O rodapé da plataforma no tablet e no computador (no celular, o 18+, a
 * ajuda e os cookies moram em `/perfil`).
 *
 * Três zonas, como no rodapé de um produto: à esquerda a logo, o texto de
 * apresentação e as redes sociais em botão; no meio o espaço de apoio (logos
 * de ONGs, casas de apoio e órgãos públicos, mais o atalho da central de
 * ajuda); à direita quatro colunas de links, cada uma com o título em
 * negrito. No pé: o copyright, o 18+ com o aviso de jogo responsável, o Pix
 * e os cookies.
 *
 * Tudo vem do template — só dados; o link do logo e o de cada rede já foram
 * conferidos no servidor (`validarApoios()`, `validarRedes()`). As colunas
 * moram em `shared/rodape.ts`, onde o teste confere cada caminho.
 */
export function RodapeDaPlataforma() {
  const t = useTemplate();
  const apoios = t.apoios ?? [];
  const redes = t.redes ?? [];
  const ano = new Date().getFullYear();
  return (
    <footer className="hidden border-t border-line bg-mist md:block">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-8 gap-y-8 px-4 py-10 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:grid-cols-[16rem_minmax(0,1fr)_minmax(0,30rem)]">
        <div className="min-w-0 md:col-start-1 md:row-start-1">
          <Link href="/" className="text-lg" aria-label="Início">
            <Marca />
          </Link>
          {t.textos.rodape ? (
            <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-ink-2">{t.textos.rodape}</p>
          ) : null}
          {redes.length ? (
            <ul aria-label="Redes sociais" className="mt-4 flex flex-wrap gap-2">
              {redes.map((r) => {
                const Icone = ICONE_DA_REDE[r.rede];
                const nome = REDES_DO_RODAPE[r.rede].nome;
                return (
                  <li key={r.rede}>
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`${nome} (abre em outra aba)`}
                      title={nome}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-line-2 bg-white text-ink hover:border-marca hover:text-marca"
                    >
                      <Icone size={16} aria-hidden />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="min-w-0 md:col-span-2 md:row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
          <section aria-label="Apoio">
            {apoios.length ? (
              <>
                <h2 className="font-display text-sm font-bold">Projetos que apoiamos</h2>
                <ul className="mt-3 flex flex-row flex-wrap items-center gap-2.5">
                  {apoios.map((a) => {
                    // Redondo, em fileira: a logo cabe inteira no círculo, sem cortar.
                    const imagem = (
                      <span className="block h-14 w-14 overflow-hidden rounded-full border border-line-2 bg-white">
                        <img src={a.imagem} alt={a.nome} className="h-full w-full object-contain p-2" loading="lazy" />
                      </span>
                    );
                    const botao = "block rounded-full hover:ring-2 hover:ring-marca focus-visible:ring-2 focus-visible:ring-marca";
                    const externo = a.link?.startsWith("https:");
                    return (
                      <li key={a.id}>
                        {!a.link ? (
                          imagem
                        ) : externo ? (
                          <a href={a.link} target="_blank" rel="noopener noreferrer nofollow" className={botao} title={a.nome}>
                            {imagem}
                          </a>
                        ) : (
                          <Link href={a.link} className={botao} title={a.nome}>
                            {imagem}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
            <Link
              href="/ajuda"
              className={`${apoios.length ? "mt-4" : ""} inline-flex items-center gap-2 rounded-lg border border-line-2 bg-white px-3 py-2 text-xs font-semibold text-ink hover:border-marca hover:text-marca`}
            >
              <LifeBuoy size={14} aria-hidden />
              Central de ajuda
            </Link>
          </section>
        </div>

        <nav
          aria-label="Links do rodapé"
          className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-6 md:col-start-2 md:row-start-1 lg:col-start-3 lg:grid-cols-4"
        >
          {COLUNAS_DO_RODAPE.map((c) => (
            <section key={c.titulo} aria-label={c.titulo} className="min-w-0">
              <h2 className="font-display text-sm font-bold">{c.titulo}</h2>
              <ul className="mt-3 space-y-2 text-xs text-ink-2">
                {c.links.map((l) => (
                  <li key={l.rotulo}>
                    {l.para ? (
                      <Link href={l.para} className="hover:text-ink hover:underline">
                        {l.rotulo}
                      </Link>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {l.rotulo}
                        <span className="rounded-full border border-line-2 px-1.5 py-px text-[10px] font-semibold text-muted">
                          Em breve
                        </span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 text-[11px] text-muted">
          <span>
            © <span className="tnum">{ano}</span> {t.identidade.nome}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink text-[9px] font-bold text-ink"
              >
                18+
              </span>
              <span className="max-w-md">{t.textos.jogoResponsavel || "Proibido para menores de 18 anos."}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-md border border-line-2 bg-white px-1.5 py-0.5 font-semibold text-ink">
                Pix
              </span>
              só pela plataforma
            </span>
            <PreferenciaDeCookies className="underline hover:text-ink" />
          </span>
        </div>
      </div>
    </footer>
  );
}
