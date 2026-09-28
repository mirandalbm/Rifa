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

/**
 * Desenhos de terceiros, como vêm da fonte (créditos em `/perfil` e em
 * `docs/LICENCAS-DE-TERCEIROS.md`): **Solar** (480 Design, CC BY 4.0) para
 * mensagens, buscar, sacola, perfil, publicar e comentar — cada um com a
 * versão cheia para o botão aceso; **Tabler** (MIT) para republicar;
 * **Iconoir** (MIT) para o reels, com os cantos arredondados. São
 * constantes do próprio código, nunca texto vindo de fora.
 */
function Desenho({ corpo, tamanho = 26, className }: { corpo: string; tamanho?: number; className?: string }) {
  return <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden className={className} dangerouslySetInnerHTML={{ __html: corpo }} />;
}

const SOLAR = {
  aviao:
    '<g fill="none"><path stroke="currentColor" stroke-width="1.5" d="m18.636 15.67l1.716-5.15c1.5-4.498 2.25-6.747 1.062-7.934s-3.436-.438-7.935 1.062L8.33 5.364C4.7 6.574 2.885 7.18 2.37 8.067a2.72 2.72 0 0 0 0 2.73c.515.888 2.33 1.493 5.96 2.704c.584.194.875.291 1.119.454c.236.158.439.361.597.597c.163.244.26.535.454 1.118c1.21 3.63 1.816 5.446 2.703 5.962a2.72 2.72 0 0 0 2.731 0c.887-.516 1.492-2.331 2.703-5.962Z"/><path fill="currentColor" d="M16.212 8.848a.75.75 0 0 0-1.055-1.066zm-5.55 5.488l5.55-5.488l-1.055-1.066l-5.55 5.488z"/></g>',
  aviaoCheio:
    '<path fill="currentColor" d="M18.6357 15.6701L20.3521 10.5208C21.8516 6.02242 22.6013 3.77322 21.414 2.58595C20.2268 1.39869 17.9776 2.14842 13.4792 3.64788L8.32987 5.36432C4.69923 6.57453 2.88392 7.17964 2.36806 8.06698C1.87731 8.91112 1.87731 9.95369 2.36806 10.7978C2.88392 11.6852 4.69923 12.2903 8.32987 13.5005C8.77981 13.6505 9.28601 13.5434 9.62294 13.2096L15.1286 7.75495C15.4383 7.44808 15.9382 7.45041 16.245 7.76015C16.5519 8.06989 16.5496 8.56975 16.2398 8.87662L10.8231 14.2432C10.4518 14.6111 10.3342 15.1742 10.4995 15.6701C11.7097 19.3007 12.3148 21.1161 13.2022 21.6319C14.0463 22.1227 15.0889 22.1227 15.933 21.6319C16.8204 21.1161 17.4255 19.3008 18.6357 15.6701Z"/>',
  lupa: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><circle cx="11.5" cy="11.5" r="9.5"/><path d="M18.2173 18.2178L21.9999 22.0004"/></g>',
  lupaCheia:
    '<path fill="currentColor" d="M11.5 2C16.7467 2 21 6.25329 21 11.5C21 13.8541 20.1417 16.0064 18.7236 17.666C18.7315 17.6732 18.7404 17.6799 18.748 17.6875L22.5303 21.4697C22.8228 21.7626 22.8228 22.2384 22.5303 22.5312C22.2375 22.8236 21.7625 22.8237 21.4697 22.5312L17.6875 18.748C17.6797 18.7403 17.6724 18.7317 17.665 18.7236C16.0055 20.1414 13.8538 21 11.5 21C6.25329 21 2 16.7467 2 11.5C2 6.25329 6.25329 2 11.5 2Z"/>',
  sacola:
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path stroke-linejoin="round" d="M9 9H9.0001"/><path stroke-linejoin="round" d="M15 9H15.0001"/><path d="M3.79424 12.0291C4.33141 9.34329 4.59999 8.00036 5.48746 7.13543C5.65149 6.97557 5.82894 6.8301 6.01786 6.70061C7.04004 6 8.40956 6 11.1486 6H12.8515C15.5906 6 16.9601 6 17.9823 6.70061C18.1712 6.8301 18.3486 6.97557 18.5127 7.13543C19.4001 8.00036 19.6687 9.34329 20.2059 12.0291C20.9771 15.8851 21.3627 17.8131 20.475 19.1793C20.3143 19.4267 20.1267 19.6555 19.9157 19.8616C18.7501 21 16.7839 21 12.8515 21H11.1486C7.21622 21 5.25004 21 4.08447 19.8616C3.87342 19.6555 3.68582 19.4267 3.5251 19.1793C2.63744 17.8131 3.02304 15.8851 3.79424 12.0291Z"/><path d="M9 6.01973V5C9 3.34315 10.3431 2 12 2C13.6569 2 15 3.34315 15 5V6.01973"/></g>',
  sacolaCheia:
    '<path fill="currentColor" fill-rule="evenodd" d="M8.25012 7.01346C8.25004 7.00898 8.25 7.00449 8.25 7V6C8.25 3.92893 9.92893 2.25 12 2.25C14.0711 2.25 15.75 3.92893 15.75 6V7C15.75 7.0045 15.75 7.00898 15.7499 7.01346C17.0472 7.04975 17.8375 7.18393 18.4425 7.67997C19.272 8.35995 19.5029 9.5144 19.9646 11.8233L20.5646 14.8233C21.2287 18.1437 21.5608 19.8039 20.6606 20.902C19.7604 22 18.0673 22 14.6812 22H9.3188C5.93262 22 4.23954 22 3.33936 20.902C2.43919 19.8039 2.77123 18.1437 3.43532 14.8233L4.03532 11.8233C4.4971 9.5144 4.72799 8.35995 5.55742 7.67997C6.16251 7.18392 6.95273 7.04975 8.25012 7.01346ZM9.75 6C9.75 4.75736 10.7574 3.75 12 3.75C13.2426 3.75 14.25 4.75736 14.25 6V7C14.25 7 14.25 7 14.25 7C14.1944 6.99999 14.1381 7 14.0812 7H9.9188C9.86185 7 9.80559 7 9.75 7.00001C9.75 7.00001 9.75 7.00001 9.75 7.00001V6ZM15 11C15.5523 11 16 10.5523 16 10C16 9.44772 15.5523 9 15 9C14.4477 9 14 9.44772 14 10C14 10.5523 14.4477 11 15 11ZM9.99998 10C9.99998 10.5523 9.55226 11 8.99998 11C8.44769 11 7.99998 10.5523 7.99998 10C7.99998 9.44772 8.44769 9 8.99998 9C9.55226 9 9.99998 9.44772 9.99998 10Z" clip-rule="evenodd"/>',
  perfil:
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><circle cx="12" cy="9" r="3"/><circle cx="12" cy="12" r="10"/><path d="M17.9691 20C17.81 17.1085 16.9247 15 11.9999 15C7.07521 15 6.18991 17.1085 6.03076 20"/></g>',
  varinha:
    '<g fill="none" stroke="currentColor" stroke-linecap="round"><path stroke-width="1.5" d="M3.84453 7.92226C2.71849 6.79623 2.71849 4.97056 3.84453 3.84453C4.97056 2.71849 6.79623 2.71849 7.92226 3.84453L20.1555 16.0777C21.2815 17.2038 21.2815 19.0294 20.1555 20.1555C19.0294 21.2815 17.2038 21.2815 16.0777 20.1555L3.84453 7.92226Z"/><path stroke-width="1.5" d="M6 10L10 6"/><path d="M16.1 2.30719C16.261 1.8976 16.8385 1.8976 16.9994 2.30719L17.4298 3.40247C17.479 3.52752 17.5776 3.62651 17.7022 3.67583L18.7934 4.1078C19.2015 4.26934 19.2015 4.849 18.7934 5.01054L17.7022 5.44252C17.5776 5.49184 17.479 5.59082 17.4298 5.71587L16.9995 6.81115C16.8385 7.22074 16.261 7.22074 16.1 6.81116L15.6697 5.71587C15.6205 5.59082 15.5219 5.49184 15.3973 5.44252L14.3061 5.01054C13.898 4.849 13.898 4.26934 14.3061 4.1078L15.3973 3.67583C15.5219 3.62651 15.6205 3.52752 15.6697 3.40247L16.1 2.30719Z"/><path d="M19.9672 9.12945C20.1281 8.71987 20.7057 8.71987 20.8666 9.12945L21.0235 9.5288C21.0727 9.65385 21.1713 9.75284 21.2959 9.80215L21.6937 9.95965C22.1018 10.1212 22.1018 10.7009 21.6937 10.8624L21.2959 11.0199C21.1713 11.0692 21.0727 11.1682 21.0235 11.2932L20.8666 11.6926C20.7057 12.1022 20.1281 12.1022 19.9672 11.6926L19.8103 11.2932C19.7611 11.1682 19.6625 11.0692 19.5379 11.0199L19.14 10.8624C18.732 10.7009 18.732 10.1212 19.14 9.95965L19.5379 9.80215C19.6625 9.75284 19.7611 9.65385 19.8103 9.5288L19.9672 9.12945Z"/><path d="M5.1332 15.3072C5.29414 14.8976 5.87167 14.8976 6.03261 15.3072L6.18953 15.7065C6.23867 15.8316 6.33729 15.9306 6.46188 15.9799L6.85975 16.1374C7.26783 16.2989 7.26783 16.8786 6.85975 17.0401L6.46188 17.1976C6.33729 17.2469 6.23867 17.3459 6.18953 17.471L6.03261 17.8703C5.87167 18.2799 5.29414 18.2799 5.1332 17.8703L4.97628 17.471C4.92714 17.3459 4.82852 17.2469 4.70393 17.1976L4.30606 17.0401C3.89798 16.8786 3.89798 16.2989 4.30606 16.1374L4.70393 15.9799C4.82852 15.9306 4.92714 15.8316 4.97628 15.7065L5.1332 15.3072Z"/></g>',
  comentar:
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88837 21.6244 10.4003 22 12 22Z"/><path d="M8 10.5H16"/><path d="M8 14H13.5"/></g>',
} as const;

/** Tabler (MIT). */
const REPUBLICAR =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12V9a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3m3 3v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3"/>';

/** Iconoir (MIT), com os cantos arredondados (raio 5 no lugar de 0,6). */
function reels(aceso: boolean) {
  return aceso
    ? '<rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor"/><path fill="var(--white)" d="M9.898 8.513a.6.6 0 0 0-.898.52v5.933a.6.6 0 0 0 .898.521l5.19-2.966a.6.6 0 0 0 0-1.042z"/>'
    : '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M9.898 8.513a.6.6 0 0 0-.898.52v5.933a.6.6 0 0 0 .898.521l5.19-2.966a.6.6 0 0 0 0-1.042z"/></g>';
}

export function IconeReels({ aceso = false, tamanho }: P) {
  return <Desenho corpo={reels(aceso)} tamanho={tamanho} />;
}

/** O avião de papel — compartilhar na publicação, mensagens no console. */
export function IconeAviao({ aceso, tamanho = 25 }: P) {
  return <Desenho corpo={aceso ? SOLAR.aviaoCheio : SOLAR.aviao} tamanho={tamanho} />;
}

export function IconeLupa({ aceso, tamanho }: P) {
  return <Desenho corpo={aceso ? SOLAR.lupaCheia : SOLAR.lupa} tamanho={tamanho} />;
}

/** A sacola — comprar na publicação, o carrinho final no console. */
export function IconeSacola({ aceso, tamanho }: P) {
  return <Desenho corpo={aceso ? SOLAR.sacolaCheia : SOLAR.sacola} tamanho={tamanho} />;
}

/** A varinha de publicar. */
export function IconeVarinha({ tamanho = 25 }: P) {
  return <Desenho corpo={SOLAR.varinha} tamanho={tamanho} />;
}

/** Quem não entrou na conta, no botão de perfil. */
export function IconePerfil({ tamanho }: P) {
  return <Desenho corpo={SOLAR.perfil} tamanho={tamanho} />;
}

export function IconeComentar({ tamanho }: P) {
  return <Desenho corpo={SOLAR.comentar} tamanho={tamanho} />;
}

export function IconeRepublicar({ tamanho, className }: P & { className?: string }) {
  return <Desenho corpo={REPUBLICAR} tamanho={tamanho} className={className} />;
}
