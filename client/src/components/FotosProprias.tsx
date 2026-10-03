import { useState } from "react";
import { Button } from "@/components/bits";
import { lerFoto } from "@/lib/anexo";
import { DIVULGACAO_FOTOS_MAX } from "@shared/divulgacao";

/**
 * As fotos próprias de quem publica sobre uma rifa (apostador ou afiliado).
 * Saem reduzidas do aparelho (`lerFoto`); o servidor reprocessa de todo
 * jeito. Na edição, as da peça (`atuais`, endereços) só vão de novo se a
 * pessoa trocar: sem `fotos` no corpo, o servidor mantém as que estavam.
 */
export function useFotosProprias(aoErrar: (texto: string) => void) {
  const [novas, setNovas] = useState<string[]>([]);
  const [atuais, setAtuais] = useState<string[]>([]);
  const [trocou, setTrocou] = useState(false);
  return {
    novas,
    atuais,
    trocou,
    /** Quantas a peça terá se salvar agora. */
    quantas: trocou ? novas.length : atuais.length,
    async escolher(arquivos: FileList | null) {
      if (!arquivos) return;
      try {
        const lidas = await Promise.all(Array.from(arquivos).map((a) => lerFoto(a)));
        setNovas((atual) => [...(trocou ? atual : []), ...lidas].slice(0, DIVULGACAO_FOTOS_MAX));
        setTrocou(true);
        setAtuais([]);
      } catch (e) {
        aoErrar((e as Error).message);
      }
    },
    tirar(i: number) {
      setNovas((atual) => atual.filter((_, j) => j !== i));
    },
    tirarTodas() {
      setTrocou(true);
      setNovas([]);
      setAtuais([]);
    },
    /** Abre a edição de uma peça: as fotos dela aparecem, sem ir de novo. */
    carregar(urls: string[]) {
      setNovas([]);
      setAtuais(urls);
      setTrocou(false);
    },
    limpar() {
      setNovas([]);
      setAtuais([]);
      setTrocou(false);
    },
    /** O pedaço do corpo: na peça nova vai sempre; na edição, só se trocou. */
    corpo(editando: boolean): { fotos?: string[] } {
      return !editando || trocou ? { fotos: novas } : {};
    },
  };
}

export type FotosPropriasEstado = ReturnType<typeof useFotosProprias>;

export function FotosProprias({ estado, editando, dica }: { estado: FotosPropriasEstado; editando: boolean; dica: string }) {
  const mostrar = estado.trocou ? estado.novas : estado.atuais;
  const temAtuais = editando && !estado.trocou && estado.atuais.length > 0;
  return (
    <fieldset>
      <legend className="label-xs">
        Suas fotos (até <span className="tnum">{DIVULGACAO_FOTOS_MAX}</span>, opcional)
      </legend>
      {mostrar.length ? (
        <ul className="mt-1 flex flex-wrap gap-2">
          {mostrar.map((f, i) => (
            <li key={`${i}-${f.slice(-16)}`} className="relative">
              <img src={f} alt={`Foto ${i + 1}`} className="h-20 w-20 rounded-lg object-cover" />
              {estado.trocou ? (
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded bg-white px-1.5 text-xs font-semibold text-ink"
                  aria-label={`Tirar a foto ${i + 1}`}
                  onClick={() => estado.tirar(i)}
                >
                  ✕
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {estado.novas.length < DIVULGACAO_FOTOS_MAX ? (
          <label className="inline-flex cursor-pointer items-center rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
            {temAtuais ? "Trocar as fotos" : "Escolher fotos"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                void estado.escolher(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        ) : null}
        {temAtuais ? (
          <Button variant="ghost" className="px-3 py-1 text-xs" onClick={estado.tirarTodas}>
            Tirar as fotos
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted">{dica}</p>
    </fieldset>
  );
}
