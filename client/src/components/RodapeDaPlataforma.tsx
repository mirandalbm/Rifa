import { Link } from "wouter";
import { useTemplate } from "@/lib/template";
import { Marca } from "@/components/Marca";
import { PreferenciaDeCookies } from "@/components/AppShell";

/**
 * O rodapé da plataforma no tablet e no computador (no celular, o 18+, a
 * ajuda e os cookies moram em `/perfil`): informações, como se paga, o
 * aviso de jogo responsável e a faixa de logos de apoio (casas de apoio,
 * ONGs, órgãos públicos), cada um como botão. Tudo vem do template — só
 * dados; o link do logo já foi conferido no servidor (`validarApoios()`).
 */
export function RodapeDaPlataforma() {
  const t = useTemplate();
  const apoios = t.apoios ?? [];
  const ano = new Date().getFullYear();
  return (
    <footer className="hidden border-t border-line bg-mist md:block">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 text-sm md:grid-cols-4">
        <div className="min-w-0">
          <Link href="/" className="text-lg" aria-label="Início">
            <Marca />
          </Link>
          {t.textos.rodape ? <p className="mt-2 whitespace-pre-line text-xs text-ink-2">{t.textos.rodape}</p> : null}
        </div>
        <nav aria-label="Plataforma" className="min-w-0">
          <h2 className="font-display text-sm font-bold">Plataforma</h2>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-2">
            <li>
              <Link href="/ajuda" className="hover:text-ink hover:underline">
                Central de ajuda
              </Link>
            </li>
            <li>
              <Link href="/minhas-cotas" className="hover:text-ink hover:underline">
                Minhas compras
              </Link>
            </li>
            <li>
              <Link href="/seja-afiliado" className="hover:text-ink hover:underline">
                Seja afiliado
              </Link>
            </li>
            <li>
              <Link href="/perfil" className="hover:text-ink hover:underline">
                Perfil e preferências
              </Link>
            </li>
          </ul>
        </nav>
        <section aria-label="Pagamento" className="min-w-0">
          <h2 className="font-display text-sm font-bold">Pagamento</h2>
          <p className="mt-2 text-xs text-ink-2">
            <span className="inline-flex items-center rounded-md border border-line-2 bg-white px-2 py-0.5 font-semibold text-ink">Pix</span>{" "}
            pago aqui na plataforma, com o bilhete na hora. Só vale bilhete pago pela plataforma — nunca pague por
            fora.
          </p>
        </section>
        <section aria-label="Jogo responsável" className="min-w-0">
          <h2 className="font-display text-sm font-bold">Jogo responsável</h2>
          <p className="mt-2 flex items-start gap-2 text-xs text-ink-2">
            <span
              aria-hidden
              className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink text-[10px] font-bold text-ink"
            >
              18+
            </span>
            <span>
              {t.textos.jogoResponsavel || "Proibido para menores de 18 anos."} Cada rifa mostra na página o número da
              autorização SPA/MF da promotora.
            </span>
          </p>
        </section>
      </div>

      {apoios.length ? (
        <section aria-label="Apoio" className="border-t border-line">
          <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-4 px-4 py-6">
            {apoios.map((a) => {
              const imagem = <img src={a.imagem} alt={a.nome} className="h-10 w-auto max-w-[160px] object-contain" loading="lazy" />;
              const externo = a.link?.startsWith("https:");
              return (
                <li key={a.id}>
                  {!a.link ? (
                    imagem
                  ) : externo ? (
                    <a href={a.link} target="_blank" rel="noopener noreferrer nofollow" className="block rounded-md p-1 hover:bg-white" title={a.nome}>
                      {imagem}
                    </a>
                  ) : (
                    <Link href={a.link} className="block rounded-md p-1 hover:bg-white" title={a.nome}>
                      {imagem}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="border-t border-line">
        <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-muted">
          <span>
            © <span className="tnum">{ano}</span> {t.identidade.nome}
          </span>
          <PreferenciaDeCookies className="underline hover:text-ink" />
        </p>
      </div>
    </footer>
  );
}
