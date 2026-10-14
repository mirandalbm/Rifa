import { useId, type CSSProperties } from "react";
import {
  DEGRADE_CLARO,
  DEGRADE_ESCURO,
  DEGRADE_VERMELHO_CLARO,
  DEGRADE_VERMELHO_ESCURO,
  FOLHA_VERMELHA,
  contornoDaFolha,
  folhasDoTrevo,
} from "@/lib/intro";

const FOLHAS = folhasDoTrevo();

/**
 * O trevo da marca, o mesmo do ícone do app: quatro folhas em coração, cada
 * uma com a metade clara e a escura, e a folha da direita vermelha. Serve à
 * intro (com o brilho que passa) e ao topo, ao lado da frase. As cores são
 * as do ícone nos dois temas — é a marca, não estado. Decorativo: quem o usa
 * diz o nome em texto.
 */
export function TrevoDaMarca({
  className = "",
  style,
  brilho = false,
}: {
  className?: string;
  style?: CSSProperties;
  /** A faixa de luz da intro (`.intro-brilho`). */
  brilho?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const degrades = [
    ["c", DEGRADE_CLARO],
    ["e", DEGRADE_ESCURO],
    ["vc", DEGRADE_VERMELHO_CLARO],
    ["ve", DEGRADE_VERMELHO_ESCURO],
  ] as const;
  return (
    <svg className={className} style={style} viewBox="-660 -660 1320 1320" aria-hidden focusable="false">
      <defs>
        {degrades.map(([k, paradas]) => (
          <linearGradient key={k} id={`${id}${k}`} gradientUnits="userSpaceOnUse" x1="-660" y1="-660" x2="660" y2="660">
            {paradas.map(([o, cor]) => (
              <stop key={o} offset={o} stopColor={cor} />
            ))}
          </linearGradient>
        ))}
        {brilho && (
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0.38" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="0.62" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        )}
        {FOLHAS.map((f, i) => (
          <clipPath key={i} id={`${id}f${i}`}>
            <path d={contornoDaFolha(f)} />
          </clipPath>
        ))}
      </defs>
      {FOLHAS.map((f, i) => {
        const vermelha = i === FOLHA_VERMELHA;
        return (
          <g key={i} clipPath={`url(#${id}f${i})`}>
            <polygon points={f.metadeClara} fill={`url(#${id}${vermelha ? "vc" : "c"})`} />
            <polygon points={f.metadeEscura} fill={`url(#${id}${vermelha ? "ve" : "e"})`} />
            {brilho && <rect className="intro-brilho" x="-660" y="-660" width="1320" height="1320" fill={`url(#${id}b)`} />}
          </g>
        );
      })}
    </svg>
  );
}
