import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { groupNumber } from "@shared/format";

type Alvo = { tipo: "perfil"; id: string } | { tipo: "rifa"; id: string };

/**
 * Endereço curto (`/c/<codigo>`) do perfil ou da rifa: criado na primeira
 * vez que o painel pede, com botão de copiar e quantos acessos teve.
 */
export function EnderecoCurto({ alvo, rotulo }: { alvo: Alvo; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  const pedir = useMutation({
    mutationFn: async () =>
      (
        await apiRequest(
          "POST",
          alvo.tipo === "perfil" ? `/api/admin/organizacoes/${alvo.id}/link-curto` : `/api/admin/campaigns/${alvo.id}/link-curto`,
        )
      ).json() as Promise<{ codigo: string; caminho: string; cliques: number }>,
  });
  useEffect(() => {
    pedir.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo.tipo, alvo.id]);

  const d = pedir.data;
  const url = d ? `${window.location.origin}${d.caminho}` : "";
  return (
    <div className="text-sm">
      <p className="label-xs">{rotulo}</p>
      {pedir.isError ? (
        <p className="mt-1 text-xs text-red">{(pedir.error as Error).message}</p>
      ) : !d ? (
        <p className="mt-1 text-xs text-muted">Gerando…</p>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="tnum rounded-md border border-line-2 bg-mist px-2 py-1 text-xs font-bold">{url.replace(/^https?:\/\//, "")}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1500);
              });
            }}
            className="inline-flex items-center gap-1 rounded-md border border-line-2 px-2 py-1 text-xs font-semibold hover:bg-mist"
          >
            <Copy size={12} aria-hidden /> {copiado ? "Copiado" : "Copiar"}
          </button>
          <span className="text-xs text-muted">
            <span className="tnum">{groupNumber(d.cliques)}</span> acesso{d.cliques === 1 ? "" : "s"}
          </span>
        </div>
      )}
    </div>
  );
}

/** Quantas pessoas tocaram em cada link do perfil nos últimos 30 dias. */
export function CliquesDosLinks({ organizacaoId }: { organizacaoId: string }) {
  const { data } = useQuery<{ dias: number; links: { rotulo: string; url: string; cliques: number }[] }>({
    queryKey: [`/api/admin/organizacoes/${organizacaoId}/links/cliques`],
  });
  if (!data || data.links.length === 0) return null;
  return (
    <div className="text-sm">
      <p className="label-xs">
        Cliques nos links · últimos <span className="tnum">{data.dias}</span> dias
      </p>
      <ul className="mt-1 divide-y divide-line rounded-md border border-line">
        {data.links.map((l) => (
          <li key={l.url} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
            <span className="min-w-0 truncate">{l.rotulo}</span>
            <span className="tnum shrink-0 font-bold">{groupNumber(l.cliques)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
