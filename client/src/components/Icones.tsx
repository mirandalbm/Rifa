import type { ReactNode } from "react";

/**
 * Os ícones do app, no desenho do Instagram: traço fino (1,75 em 24),
 * pontas e cantos redondos — suaves aos olhos. A barra de ações da
 * publicação e o console usam os mesmos. Aceso (o botão da tela atual), o
 * traço engrossa; a casa fica cheia, como no Instagram.
 */
export const TRACO = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const TRACO_ACESO = { ...TRACO, strokeWidth: 2.4 } as const;

export function Icone({ tamanho = 26, children, className }: { tamanho?: number; children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden className={className}>
      {children}
    </svg>
  );
}

type P = { aceso?: boolean; tamanho?: number };

export function IconeCasa({ aceso, tamanho }: P) {
  return (
    <Icone tamanho={tamanho}>
      <path
        {...(aceso ? TRACO_ACESO : TRACO)}
        fill={aceso ? "currentColor" : "none"}
        d="M3.75 10.4 12 3.5l8.25 6.9V19a1.75 1.75 0 0 1-1.75 1.75H15v-5a3 3 0 0 0-6 0v5H5.5A1.75 1.75 0 0 1 3.75 19Z"
      />
    </Icone>
  );
}

export function IconeReels({ aceso, tamanho }: P) {
  const t = aceso ? TRACO_ACESO : TRACO;
  return (
    <Icone tamanho={tamanho}>
      <rect {...t} x="3" y="3" width="18" height="18" rx="5" />
      <path {...t} d="M3 8.25h18M9.25 3l2.5 5.25M15.25 3l2.5 5.25" />
      <path {...t} fill={aceso ? "currentColor" : "none"} d="M10.25 11.75v5.25a.4.4 0 0 0 .6.35l4.35-2.6a.4.4 0 0 0 0-.7l-4.35-2.65a.4.4 0 0 0-.6.35Z" />
    </Icone>
  );
}

/** O avião de papel — compartilhar na publicação, mensagens no console. */
export function IconeAviao({ aceso, tamanho = 25 }: P) {
  return (
    <Icone tamanho={tamanho}>
      <path {...(aceso ? TRACO_ACESO : TRACO)} d="M22 3 9.22 10.08M11.7 20.33 22 3H2l7.22 7.08Z" />
    </Icone>
  );
}

export function IconeLupa({ aceso, tamanho }: P) {
  return (
    <Icone tamanho={tamanho}>
      <circle {...(aceso ? TRACO_ACESO : TRACO)} cx="10.75" cy="10.75" r="7" />
      <path {...(aceso ? TRACO_ACESO : TRACO)} d="m16 16 4.75 4.75" />
    </Icone>
  );
}

/** A sacola — comprar na publicação, o carrinho final no console. */
export function IconeSacola({ aceso, tamanho }: P) {
  const t = aceso ? TRACO_ACESO : TRACO;
  return (
    <Icone tamanho={tamanho}>
      <path {...t} d="M4.75 7.75h14.5l-1.1 11.6a1.9 1.9 0 0 1-1.9 1.65H7.75a1.9 1.9 0 0 1-1.9-1.65Z" />
      <path {...t} d="M8.75 10.25V6.75a3.25 3.25 0 0 1 6.5 0v3.5" />
    </Icone>
  );
}

/** A varinha de publicar: o cabo com a ponta e três brilhos, tudo arredondado. */
export function IconeVarinha({ tamanho = 25 }: P) {
  return (
    <Icone tamanho={tamanho}>
      <path {...TRACO} d="m4 20 10.5-10.5M14.5 9.5l1.25-1.25" />
      <path {...TRACO} d="M13.25 8.25 15.75 10.75" />
      <path {...TRACO} d="M18 2.75v3.5M16.25 4.5h3.5M20.25 9.25v2M19.25 10.25h2M9.75 3v2M8.75 4h2" />
    </Icone>
  );
}
