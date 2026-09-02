"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  comissaoIds: string[];
  nome: string;
  valor: string;
  chavePix: string | null;
};

export default function PagarComissoes({ comissaoIds, nome, valor, chavePix }: Props) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function marcarComoPagas() {
    const aviso =
      `Confirmar o repasse de ${valor} para ${nome}?\n\n` +
      (chavePix ? `Chave PIX: ${chavePix}\n\n` : "") +
      "Isto apenas registra que você já fez a transferência — o sistema não envia dinheiro.";

    if (!window.confirm(aviso)) return;

    setOcupado(true);
    const resposta = await fetch("/api/organizadora/afiliados", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comissaoIds }),
    });
    setOcupado(false);

    if (!resposta.ok) {
      const corpo = await resposta.json();
      window.alert(corpo.erro ?? "Não foi possível registrar o repasse.");
      return;
    }

    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={marcarComoPagas}
      disabled={ocupado}
      className="rounded-md bg-marca-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
    >
      {ocupado ? "Registrando…" : "Registrar repasse"}
    </button>
  );
}
