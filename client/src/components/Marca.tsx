import { useId } from "react";
import { useTemplate } from "@/lib/template";
import { NOME_DA_LOGO_ESCRITA, usaLogoEscrita } from "@/lib/marca";

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
 * O "B" da logo escrita: a folha vermelha do ícone deitada — o coração com
 * os dois lobos à direita e o recorte entre eles, como a folha da direita do
 * trevo, com o lado esquerdo reto para ler como B. A metade de cima no
 * vermelho e a de baixo no vermelho escuro, como a folha do ícone. A caixa do desenho é a altura da letra
 * maiúscula, então o B senta na linha de base como as outras letras.
 */
function BDeFolha() {
  const id = `${useId().replace(/:/g, "")}-folha`;
  return (
    <svg viewBox="4 4 92 92" aria-hidden className="inline-block h-[0.74em] w-[0.74em] align-baseline">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="96">
          <stop offset="0.5" style={{ stopColor: "var(--logo-vermelho)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--logo-vermelho-escuro)" }} />
        </linearGradient>
      </defs>
      <path
        style={{ fill: `url(#${id})` }}
        d="M10 4H58C80 4 94 15 94 29C94 40 86 47 72 50C88 53 96 62 96 72C96 87 84 96 62 96H10C6.7 96 4 93.3 4 90V10C4 6.7 6.7 4 10 4Z"
      />
    </svg>
  );
}

/**
 * A logo escrita: "Loterias do" no verde do ícone e "Bem" no vermelho da
 * folha, com o B desenhado como a folha em forma de coração. É uma imagem
 * para o leitor de tela (o nome inteiro no rótulo).
 */
export function LogoEscrita({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label={NOME_DA_LOGO_ESCRITA}
      className={`whitespace-nowrap font-display font-extrabold tracking-tight ${className}`}
    >
      <span style={{ color: "var(--logo-verde)" }}>Loterias do </span>
      <span style={{ color: "var(--logo-vermelho)" }}>
        <BDeFolha />
        em
      </span>
    </span>
  );
}

/**
 * Nome (ou logo) da plataforma, como o template manda. Sem logo enviada,
 * o nome com o ponto na cor de marca — o de sempre. Com o nome "Loterias do
 * Bem" publicado, a logo escrita (`LogoEscrita`) no lugar do texto, em todas
 * as larguras.
 *
 * A partir do tablet (`sm`), o símbolo e o nome novos: a primeira palavra em
 * tinta e o resto na cor de marca ("Loterias do Bem"). O celular fica como era
 * (só o texto), por decisão do dono: a mudança de marca é só para tablet e
 * computador.
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
      <>
        <LogoEscrita className={`sm:hidden ${className}`} />
        <span className={`hidden items-center gap-2 sm:inline-flex ${className}`}>
          <IconeDaMarca className="h-8 w-8" />
          <span className={lateral ? "hidden whitespace-nowrap group-hover/lateral:inline group-focus-within/lateral:inline" : "min-w-0 truncate"}>
            <LogoEscrita />
          </span>
        </span>
      </>
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
