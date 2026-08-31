"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FormRifa() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criada, setCriada] = useState(false);

  async function criar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    setCriada(false);

    const dados = Object.fromEntries(new FormData(evento.currentTarget));

    const resposta = await fetch("/api/organizadora/rifas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...dados,
        descricao: dados.descricao || null,
        autorizacaoNumero: dados.autorizacaoNumero || null,
        regulamentoUrl: dados.regulamentoUrl || null,
      }),
    });

    const corpo = await resposta.json();
    setEnviando(false);

    if (!resposta.ok) {
      setErro(corpo.erro ?? "Não foi possível criar a rifa.");
      return;
    }

    setCriada(true);
    (evento.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={criar} className="cartao space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Nova rifa</h2>
        <p className="text-sm text-slate-600">
          A rifa nasce em rascunho — os números são gerados na criação e a venda só abre quando
          você mudar a situação para aberta.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="titulo">Título</label>
          <input id="titulo" name="titulo" className="campo" required minLength={3} />
        </div>

        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="descricao">Descrição (opcional)</label>
          <textarea id="descricao" name="descricao" className="campo h-20" />
        </div>

        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="premio">Prêmio</label>
          <input id="premio" name="premio" className="campo" required minLength={3} />
        </div>

        <div>
          <label className="rotulo" htmlFor="precoPorNumero">Valor por número (R$)</label>
          <input
            id="precoPorNumero"
            name="precoPorNumero"
            type="number"
            step="0.01"
            min="0.01"
            className="campo"
            required
          />
        </div>

        <div>
          <label className="rotulo" htmlFor="quantidadeNumeros">Quantidade de números</label>
          <input
            id="quantidadeNumeros"
            name="quantidadeNumeros"
            type="number"
            min="10"
            max="100000"
            defaultValue={1000}
            className="campo"
            required
          />
        </div>

        <div>
          <label className="rotulo" htmlFor="dataSorteio">Data do sorteio</label>
          <input id="dataSorteio" name="dataSorteio" type="date" className="campo" required />
        </div>

        <div>
          <label className="rotulo" htmlFor="limiteNumerosPorCompra">Limite por compra</label>
          <input
            id="limiteNumerosPorCompra"
            name="limiteNumerosPorCompra"
            type="number"
            min="1"
            max="100"
            defaultValue={20}
            className="campo"
          />
        </div>

        <div>
          <label className="rotulo" htmlFor="minutosParaPagar">Minutos para pagar</label>
          <input
            id="minutosParaPagar"
            name="minutosParaPagar"
            type="number"
            min="5"
            max="1440"
            defaultValue={30}
            className="campo"
          />
        </div>

        <div>
          <label className="rotulo" htmlFor="autorizacaoNumero">Nº da autorização (opcional)</label>
          <input id="autorizacaoNumero" name="autorizacaoNumero" className="campo" />
        </div>

        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="regulamentoUrl">Link do regulamento (opcional)</label>
          <input id="regulamentoUrl" name="regulamentoUrl" type="url" className="campo" />
        </div>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {criada && (
        <p className="rounded-lg bg-marca-50 px-3 py-2 text-sm text-marca-700">
          Rifa criada em rascunho. Abra a venda pela lista acima quando estiver pronta.
        </p>
      )}

      <button type="submit" className="botao" disabled={enviando}>
        {enviando ? "Criando…" : "Criar rifa"}
      </button>
    </form>
  );
}
