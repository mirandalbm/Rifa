"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Rifa = {
  id: string;
  titulo: string;
  descricao: string | null;
  premio: string;
  precoPorNumero: string;
  quantidadeNumeros: number;
  limiteNumerosPorCompra: number;
  minutosParaPagar: number;
  dataSorteio: string;
  autorizacaoNumero: string | null;
  regulamentoUrl: string | null;
  vendidos: number;
  disponiveis: number;
  /// Falso em rifa grande: a grade não é enviada nem desenhada, e a compra
  /// passa a ser por quantidade, com o servidor sorteando os números.
  modoGrade: boolean;
};

const brl = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

export default function ComprarNumeros() {
  const router = useRouter();
  const parametros = useSearchParams();
  const codigoAfiliado = parametros.get("ref");

  const [rifa, setRifa] = useState<Rifa | null>(null);
  const [indisponiveis, setIndisponiveis] = useState<Set<number>>(new Set());
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", telefone: "", cpf: "" });
  // Quantidade pedida quando não há grade para clicar.
  const [quantidade, setQuantidade] = useState(1);

  useEffect(() => {
    fetch("/api/rifas/ativa")
      .then((r) => r.json())
      .then((dados) => {
        setRifa(dados.rifa);
        setIndisponiveis(new Set<number>(dados.indisponiveis ?? []));
      })
      .finally(() => setCarregando(false));
  }, []);

  const digitos = useMemo(
    () => (rifa ? String(rifa.quantidadeNumeros - 1).length : 3),
    [rifa],
  );

  // Quantos números a compra terá: os clicados na grade, ou os pedidos por
  // quantidade quando a rifa é grande demais para desenhar.
  const quantosNumeros = rifa?.modoGrade === false ? quantidade : selecionados.length;

  const total = useMemo(
    () => (rifa ? Number(rifa.precoPorNumero) * quantosNumeros : 0),
    [rifa, quantosNumeros],
  );

  function alternar(numero: number) {
    if (!rifa || indisponiveis.has(numero)) return;
    setErro(null);
    setSelecionados((atual) => {
      if (atual.includes(numero)) return atual.filter((n) => n !== numero);
      if (atual.length >= rifa.limiteNumerosPorCompra) {
        setErro(`Máximo de ${rifa.limiteNumerosPorCompra} números por compra.`);
        return atual;
      }
      return [...atual, numero];
    });
  }

  async function finalizar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!rifa || quantosNumeros === 0) {
      setErro(rifa?.modoGrade === false ? "Informe quantos números quer." : "Escolha ao menos um número.");
      return;
    }

    setEnviando(true);
    setErro(null);

    const resposta = await fetch("/api/compras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rifaId: rifa.id,
        // Um ou outro, nunca os dois: o servidor recusa se vierem juntos.
        ...(rifa.modoGrade ? { numeros: selecionados } : { quantidade }),
        comprador: { ...form, cpf: form.cpf || null },
        codigoAfiliado,
      }),
    });

    const dados = await resposta.json();
    setEnviando(false);

    if (!resposta.ok) {
      setErro(dados.erro ?? "Não foi possível concluir a compra.");
      return;
    }

    router.push(`/pagamento/${dados.compraId}`);
  }

  if (carregando) return <p className="text-slate-500">Carregando rifa…</p>;

  if (!rifa) {
    return (
      <div className="cartao text-center">
        <h1 className="text-xl font-semibold">Nenhuma rifa aberta no momento</h1>
        <p className="mt-2 text-slate-600">Volte em breve — logo teremos uma nova rifa disponível.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="cartao">
        <h1 className="text-2xl font-bold text-marca-700">{rifa.titulo}</h1>
        {rifa.descricao && <p className="mt-2 text-slate-600">{rifa.descricao}</p>}

        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-slate-500">Prêmio</dt>
            <dd className="font-medium">{rifa.premio}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Valor por número</dt>
            <dd className="font-medium">{brl(Number(rifa.precoPorNumero))}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Sorteio</dt>
            <dd className="font-medium">
              {new Date(rifa.dataSorteio).toLocaleDateString("pt-BR")}
            </dd>
          </div>
        </dl>

        {rifa.autorizacaoNumero && (
          <p className="mt-4 text-sm text-slate-500">
            Autorização nº {rifa.autorizacaoNumero}
            {rifa.regulamentoUrl && (
              <>
                {" · "}
                <a href={rifa.regulamentoUrl} className="text-marca-600 underline" target="_blank" rel="noreferrer">
                  ver regulamento
                </a>
              </>
            )}
          </p>
        )}

        {codigoAfiliado && (
          <p className="mt-3 rounded-lg bg-marca-50 px-3 py-2 text-sm text-marca-700">
            Você chegou pela indicação <strong>{codigoAfiliado}</strong>.
          </p>
        )}
      </section>

      <section className="cartao">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {rifa.modoGrade ? "Escolha seus números" : "Quantos números você quer?"}
          </h2>
          <span className="text-sm text-slate-500">
            {rifa.vendidos.toLocaleString("pt-BR")} de {rifa.quantidadeNumeros.toLocaleString("pt-BR")} vendidos
          </span>
        </div>

        {rifa.modoGrade ? (
          <div className="grid max-h-96 grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-10">
            {Array.from({ length: rifa.quantidadeNumeros }, (_, numero) => {
              const ocupado = indisponiveis.has(numero);
              const escolhido = selecionados.includes(numero);
              return (
                <button
                  key={numero}
                  type="button"
                  onClick={() => alternar(numero)}
                  disabled={ocupado}
                  className={`rounded-md py-2 text-sm font-medium transition ${
                    ocupado
                      ? "cursor-not-allowed bg-slate-100 text-slate-300 line-through"
                      : escolhido
                        ? "bg-marca-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-marca-100"
                  }`}
                >
                  {String(numero).padStart(digitos, "0")}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Esta rifa tem {rifa.quantidadeNumeros.toLocaleString("pt-BR")} números — grande
              demais para escolher um a um. Diga quantos você quer e o sistema sorteia entre os
              disponíveis, na hora do pagamento.
            </p>

            <div className="flex flex-wrap gap-2">
              {[1, 5, 10, 20, 50]
                .filter((atalho) => atalho <= rifa.limiteNumerosPorCompra)
                .map((atalho) => (
                  <button
                    key={atalho}
                    type="button"
                    onClick={() => setQuantidade(atalho)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      quantidade === atalho
                        ? "bg-marca-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-marca-100"
                    }`}
                  >
                    {atalho} número{atalho === 1 ? "" : "s"}
                  </button>
                ))}
            </div>

            <div className="max-w-xs">
              <label className="rotulo" htmlFor="quantidade">
                Ou informe a quantidade
              </label>
              <input
                id="quantidade"
                type="number"
                min={1}
                max={Math.min(rifa.limiteNumerosPorCompra, rifa.disponiveis)}
                className="campo"
                value={quantidade}
                onChange={(e) => {
                  const valor = Number(e.target.value);
                  const teto = Math.min(rifa.limiteNumerosPorCompra, rifa.disponiveis);
                  setErro(null);
                  setQuantidade(Number.isFinite(valor) ? Math.min(Math.max(valor, 1), teto) : 1);
                }}
              />
              <p className="mt-1 text-xs text-slate-500">
                Máximo de {rifa.limiteNumerosPorCompra} por compra ·{" "}
                {rifa.disponiveis.toLocaleString("pt-BR")} disponíveis
              </p>
            </div>
          </div>
        )}
      </section>

      <form onSubmit={finalizar} className="cartao space-y-4">
        <h2 className="text-lg font-semibold">Seus dados</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="nome">Nome completo</label>
            <input
              id="nome"
              className="campo"
              required
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              className="campo"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="telefone">Telefone (com DDD)</label>
            <input
              id="telefone"
              className="campo"
              required
              placeholder="(11) 90000-0000"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="cpf">CPF (opcional)</label>
            <input
              id="cpf"
              className="campo"
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: e.target.value })}
            />
          </div>
        </div>

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div>
            <p className="text-sm text-slate-500">
              {quantosNumeros} número{quantosNumeros === 1 ? "" : "s"}{" "}
              {rifa.modoGrade ? "selecionado" : "a sortear"}
              {quantosNumeros === 1 || rifa.modoGrade === false ? "" : "s"}
            </p>
            <p className="text-xl font-bold text-marca-700">{brl(total)}</p>
          </div>
          <button type="submit" className="botao" disabled={enviando || quantosNumeros === 0}>
            {enviando ? "Gerando PIX…" : "Pagar com PIX"}
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Você terá {rifa.minutosParaPagar} minutos para pagar. Os números ficam reservados nesse
          período e voltam a ficar disponíveis se o pagamento não for concluído.
        </p>
      </form>
    </div>
  );
}
