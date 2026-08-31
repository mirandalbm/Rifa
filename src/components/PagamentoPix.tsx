"use client";

import { useEffect, useState } from "react";

type Compra = {
  codigo: string;
  status: "AGUARDANDO_PAGAMENTO" | "PAGA" | "EXPIRADA" | "CANCELADA";
  comprador: string;
  rifa: string;
  quantidade: number;
  valorTotal: string;
  expiraEm: string;
  numeros: string[];
  pix: { copiaECola: string | null; qrCodeBase64: string | null };
};

const brl = (valor: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor));

export default function PagamentoPix({ compraId }: { compraId: string }) {
  const [compra, setCompra] = useState<Compra | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [restante, setRestante] = useState<string>("");

  useEffect(() => {
    let ativo = true;

    async function consultar() {
      const resposta = await fetch(`/api/compras/${compraId}`, { cache: "no-store" });
      if (!resposta.ok || !ativo) return;
      const dados: Compra = await resposta.json();
      setCompra(dados);
      // Sem pagamento pendente não há o que acompanhar: para de consultar.
      if (dados.status !== "AGUARDANDO_PAGAMENTO") clearInterval(intervalo);
    }

    consultar();
    const intervalo = setInterval(consultar, 5000);

    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, [compraId]);

  useEffect(() => {
    if (!compra || compra.status !== "AGUARDANDO_PAGAMENTO") return;

    const tique = setInterval(() => {
      const faltam = new Date(compra.expiraEm).getTime() - Date.now();
      if (faltam <= 0) {
        setRestante("expirado");
        return;
      }
      const minutos = Math.floor(faltam / 60000);
      const segundos = Math.floor((faltam % 60000) / 1000);
      setRestante(`${minutos}:${String(segundos).padStart(2, "0")}`);
    }, 1000);

    return () => clearInterval(tique);
  }, [compra]);

  async function copiar() {
    if (!compra?.pix.copiaECola) return;
    await navigator.clipboard.writeText(compra.pix.copiaECola);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  if (!compra) return <p className="text-slate-500">Carregando pagamento…</p>;

  if (compra.status === "PAGA") {
    return (
      <div className="cartao text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-marca-100 text-2xl text-marca-700">
          ✓
        </div>
        <h1 className="text-xl font-bold text-marca-700">Pagamento confirmado!</h1>
        <p className="mt-2 text-slate-600">
          Obrigado, {compra.comprador}. Seus números estão garantidos.
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {compra.numeros.map((numero) => (
            <span key={numero} className="rounded-md bg-marca-600 px-3 py-1.5 font-mono font-semibold text-white">
              {numero}
            </span>
          ))}
        </div>

        <p className="mt-4 text-sm text-slate-500">
          Código da compra: <strong className="font-mono">{compra.codigo}</strong> — guarde para
          consultar em &quot;Meus números&quot;.
        </p>
      </div>
    );
  }

  if (compra.status === "EXPIRADA" || compra.status === "CANCELADA" || restante === "expirado") {
    return (
      <div className="cartao text-center">
        <h1 className="text-xl font-bold text-slate-700">Reserva expirada</h1>
        <p className="mt-2 text-slate-600">
          O prazo para pagamento acabou e os números voltaram a ficar disponíveis.
        </p>
        <a href="/" className="botao mt-4">Escolher números novamente</a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="cartao">
        <h1 className="text-xl font-bold">Pague com PIX para garantir seus números</h1>
        <p className="mt-1 text-slate-600">
          {compra.rifa} — {compra.quantidade} número{compra.quantidade === 1 ? "" : "s"}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="text-2xl font-bold text-marca-700">{brl(compra.valorTotal)}</span>
          {restante && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
              Expira em {restante}
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {compra.numeros.map((numero) => (
            <span key={numero} className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-sm">
              {numero}
            </span>
          ))}
        </div>
      </div>

      <div className="cartao text-center">
        {compra.pix.qrCodeBase64 && (
          <img
            src={`data:image/png;base64,${compra.pix.qrCodeBase64}`}
            alt="QR Code do PIX"
            className="mx-auto h-56 w-56"
          />
        )}

        {compra.pix.copiaECola && (
          <div className="mt-4">
            <p className="rotulo">PIX copia e cola</p>
            <textarea
              readOnly
              value={compra.pix.copiaECola}
              className="campo h-24 font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <button type="button" onClick={copiar} className="botao mt-3">
              {copiado ? "Copiado!" : "Copiar código PIX"}
            </button>
          </div>
        )}

        <p className="mt-4 text-sm text-slate-500">
          Assim que o pagamento cair, esta página confirma sozinha — pode deixá-la aberta.
        </p>
      </div>
    </div>
  );
}
