import { useEffect, useId, useState } from "react";
import { Janela } from "@/components/Janela";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { IconePresente } from "@/components/Icones";
import { corDaCasa } from "@/lib/quadro";

/** O que `/premios` devolve: prêmio e quantos restam — nunca o número. */
export interface PremiosDaRifa {
  total: number;
  restantes: number;
  premios: { label: string; total: number; restantes: number }[];
}

/** Quem levou uma cota premiada (os mesmos de cima dos comentários). */
interface Revelada {
  numero: number;
  cota: string;
  premio: string;
  nome: string;
}

/**
 * O que este aparelho já viu revelado, por rifa. Guardar só serve para abrir
 * o presente sozinho quando aparece um número novo; perder o armazenamento
 * só faz a próxima visita começar do zero, sem abrir nada.
 */
const CHAVE = (slug: string) => `rifa.surpresa.${slug}`;
function lerVistas(slug: string): number[] | null {
  try {
    const bruto = localStorage.getItem(CHAVE(slug));
    return bruto ? (JSON.parse(bruto) as number[]) : null;
  } catch {
    return null;
  }
}
function gravarVistas(slug: string, numeros: number[]) {
  try {
    localStorage.setItem(CHAVE(slug), JSON.stringify(numeros));
  } catch {
    /* sem armazenamento: o presente só não abre sozinho */
  }
}

/**
 * O número novo que este aparelho ainda não viu. Na primeira visita, o que
 * já estava revelado vira o ponto de partida: abrir sozinho para todo mundo
 * que chega seria barulho. Depois, quem comprou e voltou encontra o
 * presente aberto com o número dele.
 */
export function novosRevelados(vistas: number[] | null, reveladas: number[]): number[] {
  if (vistas === null) return [];
  const ja = new Set(vistas);
  return reveladas.filter((n) => !ja.has(n));
}

/**
 * A cota surpresa: o presente animado no canto de baixo da publicação.
 * Só aparece quando a rifa tem cota premiada (a organização ou a
 * plataforma escolhe ter). Fechado, diz quantos prêmios estão em jogo;
 * aberto, mostra cada prêmio — o número só depois de comprado (é o mesmo
 * que sobe para o topo dos comentários) e, antes disso, em segredo.
 */
export function CotaSurpresa({ slug, premios }: { slug: string; premios: PremiosDaRifa }) {
  const titulo = useId();
  const [aberta, setAberta] = useState(false);
  const [destaque, setDestaque] = useState<number[]>([]);
  // A mesma consulta dos comentários: quem levou a cota premiada.
  const { data } = useQuery<{ premiados?: Revelada[] }>({ queryKey: [`/api/public/campaigns/${slug}/comentarios`] });
  const reveladas = data?.premiados ?? [];

  // Número novo desde a última visita: o presente abre sozinho e revela.
  useEffect(() => {
    if (!data) return;
    const numeros = reveladas.map((r) => r.numero);
    const novos = novosRevelados(lerVistas(slug), numeros);
    gravarVistas(slug, numeros);
    if (novos.length) {
      setDestaque(novos);
      setAberta(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, slug]);

  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberta(false);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberta]);

  if (premios.total === 0) return null;
  const emJogo = premios.restantes;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-haspopup="dialog"
        aria-label={`Cota surpresa: ${emJogo} de ${premios.total} ${premios.total === 1 ? "prêmio" : "prêmios"} em jogo`}
        // Só o ícone, parado, sem fundo nem sombra, branco nos dois temas
        // (fica sobre a foto, como o botão de som). Tudo revelado, abre a tampa.
        className="flex h-12 w-12 items-center justify-center text-branco"
      >
        <IconePresente tamanho={34} aberto={emJogo === 0} />
      </button>

      {aberta ? (
        <Janela onFechar={() => setAberta(false)} rotuloPor={titulo} className="p-4">
          <header className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center text-ink">
              <IconePresente tamanho={30} aberto={destaque.length > 0} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titulo} className="font-display text-lg font-extrabold leading-tight">
                {destaque.length ? "Cota surpresa revelada!" : "Cota surpresa"}
              </h2>
              <p className="tnum text-xs text-muted">
                {emJogo} de {premios.total} em jogo
              </p>
            </div>
            <button type="button" onClick={() => setAberta(false)} aria-label="Fechar" className="rounded-md p-1 hover:bg-mist">
              <X size={22} aria-hidden />
            </button>
          </header>

          <ul className="mt-4 space-y-2">
            {reveladas.map((r) => (
              <li
                key={r.numero}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${destaque.includes(r.numero) ? "presente-revela border-yellow" : "border-line"}`}
              >
                <span className={`tnum quadro ${corDaCasa(r.numero)} w-14 shrink-0 text-[13px]`}>{r.cota}</span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-semibold">🏆 {r.premio}</span>
                  <span className="block text-xs text-muted">Saiu para {r.nome}</span>
                </span>
              </li>
            ))}
            {premios.premios
              .filter((p) => p.restantes > 0)
              .map((p) => (
                <li key={p.label} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                  <span aria-hidden className="quadro w-14 shrink-0 border-dashed border-line-2 bg-mist text-lg text-muted">
                    ?
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-semibold">{p.label}</span>
                    <span className="tnum block text-xs text-muted">
                      {p.restantes === 1 ? "Número em segredo" : `${p.restantes} números em segredo`}
                    </span>
                  </span>
                </li>
              ))}
          </ul>

          <p className="mt-4 text-xs text-muted">
            Os números premiados são secretos até a compra. Se um número seu for premiado, ele aparece aqui na hora
            que você paga, e você fica em destaque no topo dos comentários.
          </p>
        </Janela>
      ) : null}
    </>
  );
}
