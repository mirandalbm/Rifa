"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FormAfiliado() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [codigoCriado, setCodigoCriado] = useState<string | null>(null);

  async function criar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    setCodigoCriado(null);

    const formulario = evento.currentTarget;
    const dados = Object.fromEntries(new FormData(formulario));

    const resposta = await fetch("/api/organizadora/afiliados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...dados,
        telefone: dados.telefone || null,
        chavePixRecebimento: dados.chavePixRecebimento || null,
      }),
    });

    const corpo = await resposta.json();
    setEnviando(false);

    if (!resposta.ok) {
      setErro(corpo.erro ?? "Não foi possível cadastrar o afiliado.");
      return;
    }

    setCodigoCriado(corpo.codigo);
    formulario.reset();
    router.refresh();
  }

  return (
    <form onSubmit={criar} className="cartao space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Novo afiliado</h2>
        <p className="text-sm text-slate-600">
          Defina uma senha inicial e combine com o afiliado para que ele a troque no primeiro acesso.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="rotulo" htmlFor="nome">Nome</label>
          <input id="nome" name="nome" className="campo" required minLength={3} />
        </div>

        <div>
          <label className="rotulo" htmlFor="email">E-mail (login)</label>
          <input id="email" name="email" type="email" className="campo" required />
        </div>

        <div>
          <label className="rotulo" htmlFor="senha">Senha inicial</label>
          <input id="senha" name="senha" type="password" className="campo" required minLength={8} />
        </div>

        <div>
          <label className="rotulo" htmlFor="percentualComissao">Comissão (%)</label>
          <input
            id="percentualComissao"
            name="percentualComissao"
            type="number"
            step="0.5"
            min="0"
            max="50"
            defaultValue={10}
            className="campo"
            required
          />
        </div>

        <div>
          <label className="rotulo" htmlFor="telefone">Telefone (opcional)</label>
          <input id="telefone" name="telefone" className="campo" />
        </div>

        <div>
          <label className="rotulo" htmlFor="chavePixRecebimento">
            Chave PIX para repasse (opcional)
          </label>
          <input id="chavePixRecebimento" name="chavePixRecebimento" className="campo" />
        </div>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {codigoCriado && (
        <p className="rounded-lg bg-marca-50 px-3 py-2 text-sm text-marca-700">
          Afiliado cadastrado. Código de indicação:{" "}
          <strong className="font-mono">{codigoCriado}</strong> — ele encontra o link completo ao
          entrar no painel dele.
        </p>
      )}

      <button type="submit" className="botao" disabled={enviando}>
        {enviando ? "Cadastrando…" : "Cadastrar afiliado"}
      </button>
    </form>
  );
}
