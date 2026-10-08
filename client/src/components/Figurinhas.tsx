import { useEffect, useId, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/bits";
import {
  EMOJIS_DA_FIGURINHA,
  FIGURINHAS_MAX,
  FIGURINHA_TEXTO_MAX,
  POSICOES_HORIZONTAIS,
  POSICOES_VERTICAIS,
  type Figurinha,
  type FigurinhaNaTela,
  type TipoDeFigurinha,
  nomeDoEmoji,
  textoDaContagem,
  validarFigurinhas,
} from "@shared/figurinhasStory";

/*
 * As figurinhas (contagem do sorteio, Comprar, texto e emoji) do story e do
 * reels: o desenho por cima da tela e o editor do painel. As regras moram em
 * `shared/figurinhasStory.ts`; aqui é só apresentação.
 */

export interface FigurinhaDoForm {
  tipo: TipoDeFigurinha;
  x: number;
  y: number;
  texto: string;
  emoji: string;
}

export const NOME_DA_FIGURINHA: Record<TipoDeFigurinha, string> = {
  contagem: "Contagem do sorteio",
  comprar: "Botão Comprar",
  texto: "Texto",
  emoji: "Emoji",
};

/** A figurinha nova entra no centro, um degrau abaixo da anterior. */
export function novaFigurinha(tipo: TipoDeFigurinha, quantas: number): FigurinhaDoForm {
  const alturas = POSICOES_VERTICAIS.map((p) => p.valor);
  return { tipo, x: 0.5, y: alturas[(quantas + 1) % alturas.length], texto: "", emoji: EMOJIS_DA_FIGURINHA[0].emoji };
}

/** Só as chaves que o tipo usa: o servidor confere do mesmo jeito. */
export function paraEnviar(f: FigurinhaDoForm) {
  if (f.tipo === "texto") return { tipo: f.tipo, x: f.x, y: f.y, texto: f.texto };
  if (f.tipo === "emoji") return { tipo: f.tipo, x: f.x, y: f.y, emoji: f.emoji };
  return { tipo: f.tipo, x: f.x, y: f.y };
}

/** A figurinha gravada, no formato do formulário (para editar a do reels). */
export function doGravado(f: Figurinha): FigurinhaDoForm {
  return {
    tipo: f.tipo,
    x: f.x,
    y: f.y,
    texto: f.tipo === "texto" ? f.texto : "",
    emoji: f.tipo === "emoji" ? f.emoji : EMOJIS_DA_FIGURINHA[0].emoji,
  };
}

/**
 * O quadro de figurinhas do painel: escolher o tipo, o texto ou o emoji e o
 * lugar, com a prévia ao lado. Avisa pela mesma régua do servidor; quem
 * decide é ele.
 */
export function EditorDeFigurinhas({
  figurinhas,
  mudar,
  temRifa,
  fundo,
  explicacao,
  semRifa,
}: {
  figurinhas: FigurinhaDoForm[];
  mudar: (f: FigurinhaDoForm[]) => void;
  temRifa: boolean;
  fundo?: string | null;
  explicacao: string;
  semRifa?: string;
}) {
  const id = useId();
  const mudarFigurinha = (k: number, campo: Partial<FigurinhaDoForm>) => mudar(figurinhas.map((f, j) => (j === k ? { ...f, ...campo } : f)));
  let problemaNasFigurinhas: string | null = null;
  try {
    validarFigurinhas(figurinhas.map(paraEnviar), { temRifa });
  } catch (e) {
    problemaNasFigurinhas = (e as Error).message;
  }
  return (
    <fieldset className="space-y-2 rounded-md border border-line p-3 text-ink">
      <legend className="px-1 label-xs">Figurinhas (opcional)</legend>
      <p className="text-[11px] text-muted">
        Até <span className="tnum">{FIGURINHAS_MAX}</span>, cada uma num ponto da tela. {explicacao}
      </p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["contagem", "Contagem do sorteio"],
            ["comprar", "Botão Comprar"],
            ["texto", "Texto"],
            ["emoji", "Emoji"],
          ] as [TipoDeFigurinha, string][]
        ).map(([tipo, rotulo]) => {
          const daRifa = tipo === "contagem" || tipo === "comprar";
          const bloqueada =
            figurinhas.length >= FIGURINHAS_MAX || (daRifa && (!temRifa || figurinhas.some((f) => f.tipo === tipo)));
          return (
            <Button
              key={tipo}
              type="button"
              variant="ghost"
              className="px-2 py-1 text-xs"
              disabled={bloqueada}
              onClick={() => mudar([...figurinhas, novaFigurinha(tipo, figurinhas.length)])}
            >
              + {rotulo}
            </Button>
          );
        })}
      </div>
      {!temRifa && semRifa ? <p className="text-[11px] text-muted">{semRifa}</p> : null}
      {figurinhas.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
          <ul className="min-w-0 space-y-2">
            {figurinhas.map((f, k) => (
              <li key={k} className="space-y-2 rounded-md bg-painel p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{NOME_DA_FIGURINHA[f.tipo]}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => mudar(figurinhas.filter((_, j) => j !== k))}
                    aria-label={`Tirar a figurinha ${k + 1} (${NOME_DA_FIGURINHA[f.tipo]})`}
                  >
                    Tirar
                  </Button>
                </div>
                {f.tipo === "texto" ? (
                  <div>
                    <label htmlFor={`${id}-texto-${k}`} className="label-xs">Texto</label>
                    <input
                      id={`${id}-texto-${k}`}
                      value={f.texto}
                      maxLength={FIGURINHA_TEXTO_MAX + 5}
                      onChange={(e) => mudarFigurinha(k, { texto: e.target.value })}
                      className="campo mt-1"
                    />
                  </div>
                ) : null}
                {f.tipo === "emoji" ? (
                  <div>
                    <label htmlFor={`${id}-emoji-${k}`} className="label-xs">Emoji</label>
                    <select id={`${id}-emoji-${k}`} value={f.emoji} onChange={(e) => mudarFigurinha(k, { emoji: e.target.value })} className="campo mt-1">
                      {EMOJIS_DA_FIGURINHA.map((e) => (
                        <option key={e.emoji} value={e.emoji}>
                          {e.emoji} {e.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`${id}-x-${k}`} className="label-xs">Lado</label>
                    <select id={`${id}-x-${k}`} value={f.x} onChange={(e) => mudarFigurinha(k, { x: Number(e.target.value) })} className="campo mt-1">
                      {POSICOES_HORIZONTAIS.map((p) => (
                        <option key={p.valor} value={p.valor}>
                          {p.rotulo}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${id}-y-${k}`} className="label-xs">Altura</label>
                    <select id={`${id}-y-${k}`} value={f.y} onChange={(e) => mudarFigurinha(k, { y: Number(e.target.value) })} className="campo mt-1">
                      {POSICOES_VERTICAIS.map((p) => (
                        <option key={p.valor} value={p.valor}>
                          {p.rotulo}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {/* Prévia do lugar de cada figurinha (só o desenho; a tela de verdade é o story ou o reels). */}
          <div aria-hidden className="relative mx-auto aspect-[9/16] w-[120px] overflow-hidden rounded-md bg-[#0b1f14]">
            {fundo ? <img src={fundo} alt="" className="h-full w-full object-cover opacity-80" /> : null}
            {figurinhas.map((f, k) => (
              <span
                key={k}
                className="absolute max-w-[90%] -translate-x-1/2 -translate-y-1/2 truncate rounded bg-black/60 px-1 text-[9px] font-semibold text-branco"
                style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }}
              >
                {f.tipo === "emoji" ? f.emoji : f.tipo === "texto" ? f.texto || "Texto" : NOME_DA_FIGURINHA[f.tipo]}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {problemaNasFigurinhas ? <p className="text-[11px] text-red">{problemaNasFigurinhas}</p> : null}
    </fieldset>
  );
}

/** Re-desenha a cada segundo enquanto há o que contar. */
function useAgora(ligado: boolean) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    if (!ligado) return;
    const t = window.setInterval(() => setAgora(new Date()), 1000);
    return () => window.clearInterval(t);
  }, [ligado]);
  return agora;
}

/**
 * As figurinhas por cima do story ou do reels, cada uma no ponto que a organização
 * escolheu. Texto, emoji e contagem não pegam o toque (o toque segue
 * para o story ou o vídeo); só o Comprar é botão. O estado vai em texto, nunca só
 * na cor.
 */
export function FigurinhasNaTela({ figurinhas, perfil, aoSair }: { figurinhas: FigurinhaNaTela[]; perfil: string; aoSair: () => void }) {
  const contagem = figurinhas.find((f) => f.tipo === "contagem");
  const agora = useAgora(Boolean(contagem && contagem.tipo === "contagem" && contagem.drawAt && !contagem.sorteada));
  return (
    <>
      {figurinhas.map((f, k) => {
        const lugar = { left: `${f.x * 100}%`, top: `${f.y * 100}%` };
        const base = "absolute z-10 max-w-[80%] -translate-x-1/2 -translate-y-1/2";
        if (f.tipo === "comprar") {
          return (
            <Link
              key={k}
              href={perfil ? `/o/${perfil}/r/${f.slug}?comprar=1` : `/r/${f.slug}?comprar=1`}
              onClick={aoSair}
              style={lugar}
              className={`${base} whitespace-nowrap rounded-full bg-[#0b6b3a] px-5 py-2.5 text-sm font-bold text-branco shadow-lg`}
            >
              Comprar
            </Link>
          );
        }
        if (f.tipo === "contagem") {
          const c = textoDaContagem(f.drawAt, f.sorteada, agora);
          return (
            <div
              key={k}
              role="timer"
              aria-label={c.texto}
              style={lugar}
              className={`${base} pointer-events-none rounded-xl bg-[#0b1f14]/85 px-3 py-2 text-center text-branco shadow-lg`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-branco/80" aria-hidden>
                {c.partes ? "Sorteio em" : c.texto}
              </p>
              {c.partes ? (
                <p className="tnum mt-0.5 flex gap-1.5 text-lg font-bold" aria-hidden>
                  {c.partes.map((p) => (
                    <span key={p.unidade}>
                      {String(p.valor).padStart(2, "0")}
                      <span className="text-xs font-semibold text-branco/70">{p.unidade}</span>
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          );
        }
        if (f.tipo === "texto") {
          return (
            <p
              key={k}
              style={lugar}
              className={`${base} pointer-events-none rounded-lg bg-black/60 px-3 py-1.5 text-center text-base font-semibold text-branco`}
            >
              {f.texto}
            </p>
          );
        }
        return (
          <span key={k} role="img" aria-label={nomeDoEmoji(f.emoji)} style={lugar} className={`${base} pointer-events-none text-5xl leading-none`}>
            {f.emoji}
          </span>
        );
      })}
    </>
  );
}
