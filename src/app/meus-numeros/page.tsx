"use client";

import { useState } from "react";

type Compra = {
  codigo: string;
  rifa: string;
  comprador: string;
  status: string;
  valorTotal: string;
  dataSorteio: string;
  criadaEm: string;
  numeros: string[];
};

const rotuloStatus: Record<string, { texto: string; classe: string }> = {
  PAGA: { texto: "Pago", classe: "bg-marca-100 text-marca-700" },
  AGUARDANDO_PAGAMENTO: { texto: "Aguardando pagamento", classe: "bg-amber-100 text-amber-800" },
  EXPIRADA: { texto: "Expirada", classe: "bg-slate-100 text-slate-500" },
  CANCELADA: { texto: "Cancelada", classe: "bg-red-100 text-red-700" },
};

export default function MeusNumeros() {
  const [termo, setTermo] = useState("");
  const [compras, setCompras] = useState<Compra[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function buscar(evento: React.FormEvent) {
    evento.preventDefault();
    setBuscando(true);
    setErro(null);

    const resposta = await fetch("/api/consulta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termo }),
    });

    const dados = await resposta.json();
    setBuscando(false);

    if (!resposta.ok) {
      setErro(dados.erro ?? "Não foi possível consultar agora.");
      return;
    }

    setCompras(dados.compras);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={buscar} className="cartao">
        <h1 className="text-xl font-bold">Consultar meus números</h1>
        <p className="mt-1 text-slate-600">
          Informe o código da compra, seu CPF ou seu telefone.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            className="campo flex-1"
            required
            placeholder="RFAB12CD34, CPF ou telefone"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
          <button type="submit" className="botao" disabled={buscando}>
            {buscando ? "Buscando…" : "Buscar"}
          </button>
        </div>

        {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </form>

      {compras?.length === 0 && (
        <p className="cartao text-slate-600">Nenhuma compra encontrada com esse dado.</p>
      )}

      {compras?.map((compra) => {
        const status = rotuloStatus[compra.status] ?? { texto: compra.status, classe: "bg-slate-100" };
        return (
          <div key={compra.codigo} className="cartao">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{compra.rifa}</p>
                <p className="text-sm text-slate-500">
                  {compra.comprador} · compra <span className="font-mono">{compra.codigo}</span>
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${status.classe}`}>
                {status.texto}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {compra.numeros.map((numero) => (
                <span key={numero} className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-sm">
                  {numero}
                </span>
              ))}
            </div>

            <p className="mt-3 text-sm text-slate-500">
              Sorteio em {new Date(compra.dataSorteio).toLocaleDateString("pt-BR")}
            </p>
          </div>
        );
      })}
    </div>
  );
}
