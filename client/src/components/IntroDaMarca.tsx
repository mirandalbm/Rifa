import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { TrevoDaMarca } from "@/components/TrevoDaMarca";
import {
  ABERTURA_ID,
  ABERTURA_TREVO_PX,
  INTRO_CHAVE,
  INTRO_DURACAO_MS,
  INTRO_ESPERA_IMAGENS_MS,
  INTRO_PARADA_MS,
  INTRO_SAIDA_MS,
  PECAS_DA_INTRO,
  deveMostrarIntro,
} from "@/lib/intro";

type Fase = "preparando" | "animando" | "saindo" | "fim";
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

/** Tira a abertura do `index.html` (o trevo desenhado antes do JavaScript). */
function tirarAbertura() {
  document.getElementById(ABERTURA_ID)?.remove();
  document.documentElement.classList.remove(ABERTURA_ID);
}

/**
 * A intro da marca: tela branca, o trevo (o do ícone) sai do meio da tela,
 * onde a abertura o deixou, e vai ao lugar dele na logo; o nome aparece da
 * esquerda para a direita, o sublinhado se desenha, os corações saltam e
 * batem. Só no celular e no tablet, uma vez por sessão; um toque ou uma tecla
 * pula. Com o movimento reduzido, a logo aparece pronta e some em seguida.
 * O fundo é sempre branco: a logo foi desenhada sobre o branco (como o
 * bilhete, é papel), nos dois temas.
 */
export function IntroDaMarca() {
  const [fase, setFase] = useState<Fase>(() => (mostrarAgora() ? "preparando" : "fim"));
  const caixa = useRef<HTMLDivElement>(null);
  // De onde o trevo parte: o meio da tela, do tamanho da abertura.
  const [partida, setPartida] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (fase === "fim") {
      tirarAbertura();
      return;
    }
    if (partida || !caixa.current) return;
    const r = caixa.current.getBoundingClientRect();
    const t = PECAS_DA_INTRO.trevo;
    const lado = (t.width / 100) * r.width;
    const cx = r.left + (t.left / 100) * r.width + lado / 2;
    const cy = r.top + (t.top / 100) * r.height + lado / 2;
    setPartida({
      ["--partida-x" as string]: `${window.innerWidth / 2 - cx}px`,
      ["--partida-y" as string]: `${window.innerHeight / 2 - cy}px`,
      ["--partida-escala" as string]: String(lado > 0 ? ABERTURA_TREVO_PX / lado : 1),
    });
  }, [fase, partida]);

  // A intro já desenhou o trevo no mesmo lugar: a abertura pode sair.
  useLayoutEffect(() => {
    if (partida) tirarAbertura();
  }, [partida]);

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
      <div ref={caixa} className="relative w-[78vw] max-w-[460px]" style={{ aspectRatio: String(p.proporcao) }}>
        <TrevoDaMarca
          brilho
          className={`intro-trevo absolute ${partida ? "intro-trevo-pronto" : ""}`}
          style={{ ...pos(p.trevo), ...partida }}
        />
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
