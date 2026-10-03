import { useEffect, useRef, useState } from "react";
import { ExternalLink, Globe, X } from "lucide-react";
import { ICONE_DA_REDE } from "@/components/RodapeDaPlataforma";
import { REDES_DO_RODAPE } from "@shared/template";
import type { RedeDaEntidade } from "@shared/bannerDivulgacao";

export interface Entidade {
  nome: string;
  texto: string;
  site: string | null;
  redes: { rede: RedeDaEntidade; link: string }[];
  url: string;
  urlGrande: string;
}

/**
 * O banner da entidade beneficiada (ONG, fundação) em cima da rifa: só a
 * imagem, com os cantos arredondados. Tocado, abre a tela da entidade por
 * cima da rifa; o X a fecha e devolve à rifa.
 */
export function BannerDaEntidade({ entidade }: { entidade: Entidade }) {
  const [aberta, setAberta] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => setAberta(true)}
        aria-label={`Entidade beneficiada: ${entidade.nome}. Ver mais`}
        className="mb-3 block w-full overflow-hidden rounded-xl"
      >
        <img src={entidade.url} alt="" width={1200} height={400} className="block aspect-[3/1] w-full object-cover" />
      </button>
      {aberta ? (
        <TelaDaEntidade
          entidade={entidade}
          onFechar={() => {
            setAberta(false);
            botao.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * A tela da entidade, por cima da rifa (no celular, a tela toda; do tablet
 * em diante, no centro): o X no alto, a imagem grande, o nome, o texto e, na
 * base, as redes e o site. Esc também fecha; a rifa de trás não rola.
 */
function TelaDaEntidade({ entidade, onFechar }: { entidade: Entidade; onFechar: () => void }) {
  const fechar = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fechar.current?.focus();
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  // Esc só com o foco aqui dentro (não fecha junto com outra janela por cima),
  // e o Tab não sai do diálogo para a rifa de trás.
  function tecla(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onFechar();
      return;
    }
    if (e.key !== "Tab" || !caixa.current) return;
    const focaveis = caixa.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
    if (!focaveis.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  const temLinks = entidade.redes.length > 0 || Boolean(entidade.site);
  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center md:items-center md:bg-black/60 md:p-6" onClick={onFechar}>
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entidade-titulo"
        onKeyDown={tecla}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col bg-white md:h-auto md:max-h-[90vh] md:max-w-lg md:overflow-hidden md:rounded-2xl"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted">Entidade beneficiada</p>
          <button ref={fechar} type="button" onClick={onFechar} aria-label="Fechar e voltar à rifa" className="rounded-full p-2 hover:bg-mist">
            <X size={22} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
          <img src={entidade.urlGrande} alt={entidade.nome} className="mx-auto block max-h-[50vh] w-full rounded-xl object-contain" />
          <h2 id="entidade-titulo" className="mt-4 font-display text-xl font-extrabold leading-tight">
            {entidade.nome}
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-2">{entidade.texto}</p>
        </div>
        {temLinks ? (
          <footer className="shrink-0 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <ul aria-label={`Redes e site de ${entidade.nome}`} className="flex flex-wrap items-center justify-center gap-3">
              {entidade.redes.map((r) => {
                const Icone = ICONE_DA_REDE[r.rede];
                const nome = REDES_DO_RODAPE[r.rede].nome;
                return (
                  <li key={r.rede}>
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer nofollow ugc"
                      aria-label={`${nome} de ${entidade.nome} (abre em outra aba)`}
                      title={nome}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-line-2 bg-white text-ink hover:border-marca hover:text-marca"
                    >
                      <Icone size={20} aria-hidden />
                    </a>
                  </li>
                );
              })}
              {entidade.site ? (
                <li>
                  <a
                    href={entidade.site}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    className="flex h-11 items-center gap-1.5 rounded-full border border-line-2 bg-white px-4 text-sm font-semibold text-ink hover:border-marca hover:text-marca"
                  >
                    <Globe size={18} aria-hidden /> Site <ExternalLink size={14} aria-hidden />
                    <span className="sr-only">(abre em outra aba)</span>
                  </a>
                </li>
              ) : null}
            </ul>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
