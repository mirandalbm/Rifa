import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Button, Empty } from "@/components/bits";
import { NOME_TEMA_AJUDA, buscarNaAjuda, perguntasDaAjuda, type Pergunta } from "@shared/ajuda";

/**
 * Central de ajuda. As respostas saem das regras do sistema (reembolso com
 * a taxa configurada, por exemplo) — não ficam desatualizadas sozinhas.
 */
export default function Ajuda() {
  const { data: checkout } = useQuery<{ reembolso?: { aceita: boolean; taxaPct: number } }>({
    queryKey: ["/api/public/checkout"],
  });
  const [termo, setTermo] = useState("");
  const perguntas = useMemo(
    () =>
      perguntasDaAjuda({
        taxaReembolsoPct: checkout?.reembolso?.taxaPct ?? 10,
        aceitaReembolso: checkout?.reembolso?.aceita ?? false,
      }),
    [checkout],
  );
  const achadas = buscarNaAjuda(perguntas, termo);

  // Atalho do rodapé (`/ajuda#reembolso`): abre a resposta, leva até ela e
  // põe o foco na pergunta. Vale ao chegar e também com a página já aberta
  // (o link do rodapé troca só a âncora: `hashchange`, ou o `pushState` do
  // roteador).
  useEffect(() => {
    const abrir = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "center" });
        el.querySelector("summary")?.focus({ preventScroll: true });
      }
    };
    abrir();
    window.addEventListener("hashchange", abrir);
    window.addEventListener("pushState", abrir);
    return () => {
      window.removeEventListener("hashchange", abrir);
      window.removeEventListener("pushState", abrir);
    };
  }, []);
  const temas = [...new Set(achadas.map((p) => p.tema))];

  return (
    <PublicShell>
      <h1 className="font-display text-2xl font-extrabold">Central de ajuda</h1>
      <label className="relative mt-4 block">
        <span className="sr-only">Buscar na ajuda</span>
        <Search size={18} aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar: pagamento, sorteio, reembolso…"
          className="campo mt-0 pl-10 text-sm"
        />
      </label>

      {achadas.length === 0 ? (
        <div className="mt-4 rounded-xl border border-line bg-white text-center">
          <Empty>Nada encontrado para "{termo}".</Empty>
          <div className="-mt-4 pb-6">
            <Button type="button" variant="cinza" onClick={() => setTermo("")}>
              Ver todas as perguntas
            </Button>
          </div>
        </div>
      ) : null}

      {temas.map((tema) => (
        <section key={tema} aria-labelledby={`tema-${tema}`} className="mt-4">
          <h2 id={`tema-${tema}`} className="label-xs text-ink-2">
            {NOME_TEMA_AJUDA[tema]}
          </h2>
          <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {achadas
              .filter((p) => p.tema === tema)
              .map((p: Pergunta) => (
                <details key={p.id} id={p.id} className="group" open={Boolean(termo.trim())}>
                  <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-[15px] font-bold leading-5 marker:hidden [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">{p.pergunta}</span>
                    <ChevronRight
                      size={16}
                      aria-hidden
                      className="shrink-0 text-muted transition-transform group-open:rotate-90"
                    />
                  </summary>
                  <div className="space-y-2 px-4 pb-4 text-sm leading-[21px] text-ink-2">
                    {p.resposta.map((r) => (
                      <p key={r}>{r}</p>
                    ))}
                  </div>
                </details>
              ))}
          </div>
        </section>
      ))}
    </PublicShell>
  );
}
