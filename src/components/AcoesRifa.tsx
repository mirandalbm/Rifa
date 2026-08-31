"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  status: string;
  jaSorteada: boolean;
};

export default function AcoesRifa({ id, status, jaSorteada }: Props) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function mudarStatus(novo: string, confirmacao?: string) {
    if (confirmacao && !window.confirm(confirmacao)) return;

    setOcupado(true);
    const resposta = await fetch("/api/organizadora/rifas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: novo }),
    });
    setOcupado(false);

    if (!resposta.ok) {
      const corpo = await resposta.json();
      window.alert(corpo.erro ?? "Não foi possível alterar a situação.");
      return;
    }

    router.refresh();
  }

  if (jaSorteada || status === "SORTEADA") {
    return <span className="text-xs text-slate-400">sorteada</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "ABERTA" && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() =>
            mudarStatus("ABERTA", "Abrir esta rifa para venda ao público?")
          }
          className="rounded-md bg-marca-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Abrir venda
        </button>
      )}

      {status === "ABERTA" && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() =>
            mudarStatus(
              "ENCERRADA",
              "Encerrar as vendas desta rifa? Novas compras deixam de ser aceitas.",
            )
          }
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
        >
          Encerrar venda
        </button>
      )}

      <a
        href={`/api/organizadora/relatorio?rifaId=${id}`}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700"
      >
        Exportar CSV
      </a>
    </div>
  );
}
