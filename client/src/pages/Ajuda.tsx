import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
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
  const temas = [...new Set(achadas.map((p) => p.tema))];

  return (
    <PublicShell>
      <h1 className="font-display text-xl font-extrabold">Central de ajuda</h1>
      <label className="relative mt-3 block">
        <span className="sr-only">Buscar na ajuda</span>
        <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar: pagamento, sorteio, reembolso…"
          className="w-full rounded-md border border-line-2 py-2 pl-9 pr-3 text-sm"
        />
      </label>

      {achadas.length === 0 ? <Empty>Nada encontrado para "{termo}".</Empty> : null}

      {temas.map((tema) => (
        <section key={tema} className="mt-5">
          <h2 className="label-xs">{NOME_TEMA_AJUDA[tema]}</h2>
          <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {achadas
              .filter((p) => p.tema === tema)
              .map((p: Pergunta) => (
                <details key={p.id} id={p.id} className="group px-4 py-3" open={Boolean(termo.trim())}>
                  <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                    {p.pergunta}
                  </summary>
                  <div className="mt-2 space-y-2 text-sm text-ink-2">
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
