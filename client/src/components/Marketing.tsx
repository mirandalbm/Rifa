import { acimaDoConsole } from "@/components/Console";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { TEXTO_DO_AVISO_DE_COOKIES, pixelsNoEndereco, textoDoAvisoNoEndereco, type Pixels } from "@shared/marketing";
import { enderecoDoApp, noEnderecoDaOrganizacao } from "@/lib/endereco";
import { useTemplate } from "@/lib/template";
import {
  apagarCookiesDeMedicao,
  carregarPixels,
  escolher,
  rastrear,
  useEscolha,
  useOrganizacaoDaPagina,
  type Evento,
} from "@/lib/marketing";

type Resposta = { plataforma: Pixels | null; organizacao: Pixels | null };

/** Os pixels que valem nesta página (plataforma + promotora da página) e se a resposta já chegou. */
function useAlvosComEstado(): { alvos: Pixels[]; carregado: boolean } {
  const org = useOrganizacaoDaPagina();
  const { data } = useQuery<Resposta>({
    queryKey: [org ? `/api/public/marketing?organizacao=${encodeURIComponent(org)}` : "/api/public/marketing"],
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    if (!data) return { alvos: [], carregado: false };
    // No endereço de uma organização, sem o isolamento dos cookies, Meta e TikTok não carregam (shared/marketing.ts).
    const todos = [data.plataforma, data.organizacao].filter(Boolean) as Pixels[];
    return { alvos: pixelsNoEndereco(todos, noEnderecoDaOrganizacao()), carregado: true };
  }, [data]);
}

/** Os pixels que valem nesta página. Vazio: nada a carregar. */
function useAlvos(): Pixels[] {
  return useAlvosComEstado().alvos;
}

/**
 * Fica no `PublicShell`. Sem pixel nenhum: não desenha nada e não carrega
 * nada. Com pixel e sem escolha: o aviso. Com
 * "aceito": carrega os pixels e conta a página vista a cada troca de rota.
 */
export function Marketing() {
  const { alvos, carregado } = useAlvosComEstado();
  const escolha = useEscolha();
  const [local] = useLocation();

  useEffect(() => {
    if (escolha === "recusado") apagarCookiesDeMedicao();
  }, [escolha]);

  useEffect(() => {
    // Sem a resposta ainda, nada a decidir (a página nova pode ter pixel). Com ela, e vazia, o pixel que
    // sobrou da página anterior também sai — `carregarPixels` recarrega.
    if (escolha !== "aceito" || !carregado) return;
    if (carregarPixels(alvos) === "recarregando" || !alvos.length) return;
    rastrear({ tipo: "pagina" }, alvos);
  }, [escolha, alvos, carregado, local]);

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
    if (carregarPixels(alvos) === "recarregando") return;
    rastrear(e, alvos);
  };
  return Object.assign(f, { pronto });
}

/**
 * O aviso (LGPD). Duas escolhas do mesmo tamanho — recusar tem de ser tão
 * fácil quanto aceitar. Fica acima do rodapé fixo.
 */
function AvisoDeCookies() {
  const template = useTemplate();
  const endereco = enderecoDoApp();
  const textos = endereco.tipo === "organizacao" ? textoDoAvisoNoEndereco(template.identidade.nome, endereco.nome) : TEXTO_DO_AVISO_DE_COOKIES;
  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-[calc(var(--acima-do-console)+0.5rem)] z-30 px-3 lg:bottom-4 lg:left-[72px]"
      style={{ ["--acima-do-console" as string]: acimaDoConsole }}
    >
      <div className="mx-auto max-w-3xl rounded-xl border border-line bg-white p-4 text-sm shadow-lg">
        {textos.map((t, i) => (
          <p key={i} className={i ? "mt-2 text-xs text-muted" : undefined}>
            {t}
          </p>
        ))}
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
