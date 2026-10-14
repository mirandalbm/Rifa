import { useEffect, useId, useState } from "react";
import {
  DEGRADE_CLARO,
  DEGRADE_ESCURO,
  INTRO_CHAVE,
  INTRO_DURACAO_MS,
  INTRO_ESPERA_IMAGENS_MS,
  INTRO_PARADA_MS,
  INTRO_SAIDA_MS,
  PECAS_DA_INTRO,
  RAIO_DO_LOBULO,
  deveMostrarIntro,
  folhasDoTrevo,
} from "@/lib/intro";

type Fase = "preparando" | "animando" | "saindo" | "fim";

const FOLHAS = folhasDoTrevo();
const IMAGENS = [
  PECAS_DA_INTRO.textoLoterias.src,
  PECAS_DA_INTRO.textoDoBem.src,
  PECAS_DA_INTRO.sublinhado.src,
  PECAS_DA_INTRO.coracaoEsq.src,
  PECAS_DA_INTRO.coracaoDir.src,
];

function jaViu(): boolean {
  try {
    return sessionStorage.getItem(INTRO_CHAVE) === "1";
  } catch {
    return false;
  }
}

function marcarVista() {
  try {
    sessionStorage.setItem(INTRO_CHAVE, "1");
  } catch {
    // sem armazenamento, a intro pode repetir ao recarregar; nada quebra
  }
}

/** Decide uma vez, ao abrir o app: a intro não aparece ao navegar entre telas. */
function mostrarAgora(): boolean {
  if (typeof window === "undefined") return false;
  let emMoldura = false;
  try {
    emMoldura = window.self !== window.top;
  } catch {
    emMoldura = true;
  }
  return deveMostrarIntro({
    largura: window.innerWidth,
    caminho: window.location.pathname,
    jaViuNaSessao: jaViu(),
    automatizado: Boolean(navigator.webdriver),
    emMoldura,
  });
}

function carregar(src: string): Promise<void> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok();
    img.onerror = () => ok();
    img.src = src;
  });
}

/**
 * A intro da marca: tela branca, o trevo entra girando, o nome aparece da
 * esquerda para a direita, o sublinhado se desenha, os corações saltam e
 * batem. Só no celular e no tablet, uma vez por sessão; um toque ou uma tecla
 * pula. Com o movimento reduzido, a logo aparece pronta e some em seguida.
 * O fundo é sempre branco: a logo foi desenhada sobre o branco (como o
 * bilhete, é papel), nos dois temas.
 */
export function IntroDaMarca() {
  const [fase, setFase] = useState<Fase>(() => (mostrarAgora() ? "preparando" : "fim"));
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    if (fase !== "preparando") return;
    marcarVista();
    let vivo = true;
    const espera = new Promise<void>((ok) => setTimeout(ok, INTRO_ESPERA_IMAGENS_MS));
    Promise.race([Promise.all(IMAGENS.map(carregar)), espera]).then(() => {
      if (vivo) setFase("animando");
    });
    return () => {
      vivo = false;
    };
  }, [fase]);

  useEffect(() => {
    if (fase !== "animando") return;
    const parado = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setFase("saindo"), parado ? INTRO_PARADA_MS : INTRO_DURACAO_MS);
    return () => clearTimeout(t);
  }, [fase]);

  useEffect(() => {
    if (fase !== "saindo") return;
    const t = setTimeout(() => setFase("fim"), INTRO_SAIDA_MS);
    return () => clearTimeout(t);
  }, [fase]);

  useEffect(() => {
    if (fase === "fim") return;
    const pular = () => setFase((f) => (f === "fim" ? f : "saindo"));
    window.addEventListener("keydown", pular);
    return () => window.removeEventListener("keydown", pular);
  }, [fase]);

  if (fase === "fim") return null;
  const p = PECAS_DA_INTRO;
  const pos = (x: { left: number; top: number; width: number }) => ({
    left: `${x.left}%`,
    top: `${x.top}%`,
    width: `${x.width}%`,
  });

  return (
    <div
      aria-hidden="true"
      data-sem-gesto
      onPointerDown={() => setFase("saindo")}
      className={`intro-marca fixed inset-0 z-[100] flex items-center justify-center bg-branco ${
        fase === "animando" || fase === "saindo" ? "intro-animando" : ""
      } ${fase === "saindo" ? "intro-saindo" : ""}`}
      style={{ transitionDuration: `${INTRO_SAIDA_MS}ms` }}
    >
      <div className="relative w-[78vw] max-w-[460px]" style={{ aspectRatio: String(p.proporcao) }}>
        <svg className="intro-trevo absolute" style={pos(p.trevo)} viewBox="-660 -660 1320 1320" focusable="false">
          <defs>
            {(
              [
                ["c", DEGRADE_CLARO],
                ["e", DEGRADE_ESCURO],
              ] as const
            ).map(([k, paradas]) => (
              <linearGradient key={k} id={`${id}${k}`} gradientUnits="userSpaceOnUse" x1="-660" y1="-660" x2="660" y2="660">
                {paradas.map(([o, cor]) => (
                  <stop key={o} offset={o} stopColor={cor} />
                ))}
              </linearGradient>
            ))}
            <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0.38" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
              <stop offset="0.62" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            {FOLHAS.map((f, i) => (
              <clipPath key={i} id={`${id}f${i}`}>
                <polygon points={f.poligono} />
                {f.circulos.map((c, j) => (
                  <circle key={j} cx={c.cx} cy={c.cy} r={RAIO_DO_LOBULO} />
                ))}
              </clipPath>
            ))}
          </defs>
          {FOLHAS.map((f, i) => (
            <g key={i} clipPath={`url(#${id}f${i})`}>
              <polygon points={f.metadeClara} fill={`url(#${id}c)`} />
              <polygon points={f.metadeEscura} fill={`url(#${id}e)`} />
              <rect className="intro-brilho" x="-660" y="-660" width="1320" height="1320" fill={`url(#${id}b)`} />
            </g>
          ))}
        </svg>
        <img className="intro-linha intro-loterias absolute" src={p.textoLoterias.src} alt="" style={pos(p.textoLoterias)} />
        <img className="intro-linha intro-do-bem absolute" src={p.textoDoBem.src} alt="" style={pos(p.textoDoBem)} />
        <img className="intro-sublinhado absolute" src={p.sublinhado.src} alt="" style={pos(p.sublinhado)} />
        <span className="intro-coracao intro-coracao-esq absolute" style={pos(p.coracaoEsq)}>
          <img className="intro-batida w-full" src={p.coracaoEsq.src} alt="" />
        </span>
        <span className="intro-coracao intro-coracao-dir absolute" style={pos(p.coracaoDir)}>
          <img className="intro-batida w-full" src={p.coracaoDir.src} alt="" />
        </span>
      </div>
    </div>
  );
}
