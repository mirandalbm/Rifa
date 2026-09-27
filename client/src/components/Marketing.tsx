import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Pixels } from "@shared/marketing";
import {
  carregarPixels,
  escolher,
  rastrear,
  useEscolha,
  useOrganizacaoDaPagina,
  type Evento,
} from "@/lib/marketing";

type Resposta = { plataforma: Pixels | null; organizacao: Pixels | null };

/** Os pixels que valem nesta página (plataforma + promotora da página). Vazio: nada a carregar. */
function useAlvos(): Pixels[] {
  const org = useOrganizacaoDaPagina();
  const { data } = useQuery<Resposta>({
    queryKey: [org ? `/api/public/marketing?organizacao=${encodeURIComponent(org)}` : "/api/public/marketing"],
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    if (!data) return [];
    return [data.plataforma, data.organizacao].filter(Boolean) as Pixels[];
  }, [data]);
}

/**
 * Fica no `PublicShell`. Sem pixel nenhum: não desenha nada e não carrega
 * nada. Com pixel e sem escolha: o aviso. Com
 * "aceito": carrega os pixels e conta a página vista a cada troca de rota.
 */
export function Marketing() {
  const alvos = useAlvos();
  const escolha = useEscolha();
  const [local] = useLocation();

  useEffect(() => {
    if (escolha !== "aceito" || !alvos.length) return;
    carregarPixels(alvos);
    rastrear({ tipo: "pagina" }, alvos);
  }, [escolha, alvos, local]);

  if (!alvos.length || escolha) return null;
  return <AvisoDeCookies />;
}

/** Para as páginas contarem ver rifa, checkout e compra — só com "aceito". */
export function useRastreio(): ((e: Evento) => void) & { pronto: boolean } {
  const alvos = useAlvos();
  const escolha = useEscolha();
  const pronto = escolha === "aceito" && alvos.length > 0;
  const f = (e: Evento) => {
    if (!pronto) return;
    carregarPixels(alvos);
    rastrear(e, alvos);
  };
  return Object.assign(f, { pronto });
}

/**
 * O aviso (LGPD). Duas escolhas do mesmo tamanho — recusar tem de ser tão
 * fácil quanto aceitar. Fica acima do rodapé fixo.
 */
function AvisoDeCookies() {
  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-12 z-30 px-3"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto max-w-3xl rounded-xl border border-line bg-white p-4 text-sm shadow-lg">
        <p>
          Usamos cookies de medição de anúncios (Meta, Google, TikTok) para saber quais campanhas trazem
          apostadores. Eles só são ativados se você aceitar; recusar não muda nada na compra.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => escolher("recusado")}
            className="rounded-md border border-line-2 px-3 py-2 font-semibold hover:bg-mist"
          >
            Só o necessário
          </button>
          <button
            type="button"
            onClick={() => escolher("aceito")}
            className="rounded-md border border-line-2 px-3 py-2 font-semibold hover:bg-mist"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Cookies" no rodapé: só existe quando há pixel para aceitar ou recusar. */
export function useTemMarketing() {
  return useAlvos().length > 0;
}

/** O aviso de cookies está na tela? (Outras faixas fixas esperam a escolha.) */
export function useAvisoDeCookiesAberto() {
  const alvos = useAlvos();
  const escolha = useEscolha();
  return alvos.length > 0 && !escolha;
}
