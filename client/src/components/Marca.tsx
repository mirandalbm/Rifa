import { useId } from "react";
import { TrevoDaMarca } from "@/components/TrevoDaMarca";
import { useTemplate } from "@/lib/template";
import { NOME_DA_LOGO_ESCRITA, usaLogoEscrita } from "@/lib/marca";
import { LOGO_ESCRITA } from "@/lib/logoEscritaDesenho";

/**
 * O símbolo da marca: um bilhete com um coração recortado (o recorte deixa
 * ver o fundo, então serve nos dois temas) e o talão na cor azul da paleta.
 * A cor do bilhete é a de marca do template (`--marca`).
 */
export function IconeDaMarca({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const corpo = `${id}-corpo`;
  const recorte = `${id}-recorte`;
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={`shrink-0 ${className}`}>
      <defs>
        <clipPath id={corpo}>
          <rect x="2" y="9" width="44" height="30" rx="8" />
        </clipPath>
        <mask id={recorte} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="#fff" />
          <circle cx="2" cy="24" r="4.2" fill="#000" />
          <circle cx="46" cy="24" r="4.2" fill="#000" />
          <path
            d="M20 31C14.5 27.2 12.5 24.6 12.5 21.9C12.5 19.6 14.2 18 16.4 18C17.9 18 19.2 18.8 20 20.1C20.8 18.8 22.1 18 23.6 18C25.8 18 27.5 19.6 27.5 21.9C27.5 24.6 25.5 27.2 20 31Z"
            fill="#000"
          />
          <line x1="33" y1="13.5" x2="33" y2="34.5" stroke="#000" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2.2 2.4" />
        </mask>
      </defs>
      <g mask={`url(#${recorte})`}>
        <g clipPath={`url(#${corpo})`}>
          <rect x="2" y="9" width="44" height="30" style={{ fill: "var(--marca)" }} />
          <rect x="33" y="9" width="13" height="30" style={{ fill: "var(--azul)" }} />
        </g>
      </g>
    </svg>
  );
}

/**
 * A frase "Loterias do Bem" com as letras da logo oficial da intro, numa
 * linha: os contornos vêm de `npm run logo-escrita` (`LOGO_ESCRITA`).
 * "Loterias do" no verde e "Bem" no vermelho; as cores são os tokens
 * `--logo-*`, que trocam com o tema.
 *
 * A altura acompanha a letra de quem a usa (1,2em), então ela ocupa o lugar
 * do nome escrito sem mexer no topo. O desenho é decorativo para o leitor de
 * tela; o nome vai em texto (`sr-only`).
 */
export function LogoEscrita({ className = "" }: { className?: string }) {
  const d = LOGO_ESCRITA;
  return (
    <span className={`relative inline-flex shrink-0 align-middle ${className}`}>
      <svg viewBox={`0 0 ${d.largura} ${d.altura}`} aria-hidden className="h-[1.2em] w-auto">
        <path d={d.verde} fillRule="evenodd" style={{ fill: "var(--logo-verde)" }} />
        <path d={d.vermelho} fillRule="evenodd" style={{ fill: "var(--logo-vermelho)" }} />
      </svg>
      <span className="sr-only">{NOME_DA_LOGO_ESCRITA}</span>
    </span>
  );
}

/**
 * O símbolo sozinho (a lateral recolhida do painel): com o nome "Loterias do
 * Bem" publicado, o trevo do ícone; com outro nome, o bilhete de sempre.
 */
export function SimboloDaMarca({ className = "" }: { className?: string }) {
  const { nome, logo } = useTemplate().identidade;
  if (!logo && usaLogoEscrita(nome)) return <TrevoDaMarca className={`shrink-0 ${className}`} />;
  return <IconeDaMarca className={className} />;
}

/**
 * Nome (ou logo) da plataforma, como o template manda. Sem logo enviada,
 * o nome com o ponto na cor de marca — o de sempre. Com o nome "Loterias do
 * Bem" publicado, o trevo do ícone à esquerda e a frase da logo oficial
 * (`LogoEscrita`) à direita, em todas as larguras.
 *
 * Com outro nome, o de antes: no celular só o texto; a partir do tablet
 * (`sm`), o símbolo e o nome com a primeira palavra em tinta e o resto na cor
 * de marca.
 *
 * `lateral`: na lateral do computador o símbolo fica sempre, e o nome só
 * aparece quando a lateral abre (ao passar o ponteiro ou entrar pelo teclado).
 */
export function Marca({ className = "", lateral = false }: { className?: string; lateral?: boolean }) {
  const { nome, logo } = useTemplate().identidade;
  if (logo) {
    return <img src={logo} alt={nome} className={`h-7 w-auto ${className}`} />;
  }
  if (usaLogoEscrita(nome)) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        <TrevoDaMarca className="h-[1.6em] w-[1.6em] shrink-0" />
        <span className={lateral ? "hidden whitespace-nowrap group-hover/lateral:inline-flex group-focus-within/lateral:inline-flex" : "inline-flex min-w-0"}>
          <LogoEscrita />
        </span>
      </span>
    );
  }
  const pontuado = nome.lastIndexOf(".");
  const textoDeSempre =
    pontuado > 0 ? (
      <>
        {nome.slice(0, pontuado)}
        <span className="text-marca">.</span>
        {nome.slice(pontuado + 1)}
      </>
    ) : (
      nome
    );
  const espaco = nome.indexOf(" ");
  const textoNovo =
    pontuado > 0 || espaco <= 0 ? (
      textoDeSempre
    ) : (
      <>
        {nome.slice(0, espaco)} <span className="text-marca">{nome.slice(espaco + 1)}</span>
      </>
    );
  return (
    <>
      <span className={`font-display font-extrabold tracking-tight sm:hidden ${className}`}>{textoDeSempre}</span>
      <span className={`hidden items-center gap-2 sm:inline-flex ${className}`}>
        <IconeDaMarca className="h-8 w-8" />
        <span className={lateral ? "hidden whitespace-nowrap group-hover/lateral:inline group-focus-within/lateral:inline" : "min-w-0 truncate"}>
          <span className="font-display font-extrabold tracking-tight">{textoNovo}</span>
        </span>
      </span>
    </>
  );
}
