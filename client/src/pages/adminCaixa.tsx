import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { CabecalhoDaTabela, CartaoDoPainel } from "@/components/painel";
import { Empty } from "@/components/bits";
import { TIPOS_DA_CAIXA, contarPorTipo, destinoDaPendencia, type PendenciaDaCaixa, type TipoDaCaixa } from "@shared/caixa";

const TOM = { red: "bg-red-soft text-red", yellow: "bg-yellow-soft text-yellow-deep", green: "bg-green-soft text-green-deep" } as const;

const quando = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
};

/**
 * A caixa de entrada da plataforma: tudo que espera uma decisão, numa lista
 * só. Cada linha leva à tela que decide aquele tipo — a caixa não decide nada.
 * Sem dado pessoal: organização, afiliado ou apelido.
 */
export function AdminCaixa() {
  const { data = [], isLoading } = useQuery<PendenciaDaCaixa[]>({
    queryKey: ["/api/admin/caixa-de-entrada"],
    refetchInterval: 60_000,
  });
  const [tipo, setTipo] = useState<TipoDaCaixa | "tudo">("tudo");
  const contagem = contarPorTipo(data);
  const linhas = tipo === "tudo" ? data : data.filter((l) => l.tipo === tipo);

  return (
    <PanelShell title="Caixa de entrada">
      <CartaoDoPainel titulo="Esperando a plataforma" subtitulo="Disputas e denúncias primeiro; dentro de cada grupo, o mais antigo.">
        <div role="group" aria-label="Filtrar por tipo" className="flex gap-2 overflow-x-auto px-5 pb-4">
          {(["tudo", ...(Object.keys(TIPOS_DA_CAIXA) as TipoDaCaixa[])] as const).map((t) => {
            const n = t === "tudo" ? data.length : (contagem[t] ?? 0);
            if (t !== "tudo" && !n) return null;
            const aceso = tipo === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={aceso}
                onClick={() => setTipo(t)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${
                  aceso ? "bg-green font-semibold text-on-green" : "text-ink-2 hover:bg-mist-2"
                }`}
              >
                {t === "tudo" ? "Tudo" : TIPOS_DA_CAIXA[t].rotulo}
                <span className="tnum text-xs opacity-80">{n}</span>
              </button>
            );
          })}
        </div>
        {isLoading ? (
          <Empty>Carregando…</Empty>
        ) : linhas.length === 0 ? (
          <Empty>Nada esperando por você agora.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <CabecalhoDaTabela colunas={["Tipo", "Quem", "O que", "Quando", ""]} />
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.chave} className="border-t border-line">
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${TOM[TIPOS_DA_CAIXA[l.tipo].tom]}`}>{TIPOS_DA_CAIXA[l.tipo].rotulo}</span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 font-medium">{l.quem}</td>
                    <td className="max-w-[420px] px-4 py-3 text-xs text-ink-2">{l.oQue}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{quando(l.desde)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={destinoDaPendencia(l)} aria-label={`Abrir ${TIPOS_DA_CAIXA[l.tipo].rotulo} de ${l.quem}`} className="inline-flex min-h-6 items-center text-xs font-semibold uppercase tracking-wide text-green-deep hover:underline">
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CartaoDoPainel>
    </PanelShell>
  );
}
