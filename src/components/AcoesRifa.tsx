"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  status: string;
  jaSorteada: boolean;
  gerandoNumeros?: boolean;
};

export default function AcoesRifa({ id, status, jaSorteada, gerandoNumeros = false }: Props) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function retomarGeracao() {
    setOcupado(true);
    const resposta = await fetch("/api/organizadora/rifas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setOcupado(false);

    if (!resposta.ok) {
      window.alert("Não foi possível retomar a geração.");
      return;
    }
    router.refresh();
  }

  async function mudarStatus(novo: string, confirmacao?: string) {
    // Cancelar no aviso não fazia nada visível: a rifa continuava em rascunho
    // e quem cancelou sem querer não tinha como saber que nada aconteceu.
    if (confirmacao && !window.confirm(confirmacao)) {
      setAviso("Nada mudou — a rifa continua como estava.");
      return;
    }
    setAviso(null);

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

  // Enquanto os números não existem todos, abrir a venda é proibido pelo
  // servidor — então a tela oferece retomar a geração em vez de um botão que
  // só resultaria em erro.
  if (gerandoNumeros) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-amber-700">gerando números</span>
        <button
          type="button"
          disabled={ocupado}
          onClick={retomarGeracao}
          className="rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 disabled:opacity-50"
        >
          {ocupado ? "Retomando…" : "Retomar"}
        </button>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700"
        >
          Atualizar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {aviso && <span className="w-full text-xs text-amber-700">{aviso}</span>}

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
        href={`/organizadora/rifas/${id}/midia`}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700"
      >
        Fotos e vídeo
      </a>

      <a
        href={`/api/organizadora/relatorio?rifaId=${id}`}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700"
      >
        Exportar CSV
      </a>
    </div>
  );
}
