"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcessoApostador() {
  const router = useRouter();
  const [aba, setAba] = useState<"entrar" | "cadastrar">("entrar");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const dados = Object.fromEntries(new FormData(evento.currentTarget));
    const rota = aba === "entrar" ? "/api/apostador/entrar" : "/api/apostador/cadastro";

    const resposta = await fetch(rota, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aba === "entrar" ? dados : { ...dados, cpf: dados.cpf || null }),
    });

    const corpo = await resposta.json().catch(() => ({}));
    setEnviando(false);

    if (!resposta.ok) {
      setErro(corpo.erro ?? "Não foi possível concluir.");
      return;
    }

    router.push("/minha-conta");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(["entrar", "cadastrar"] as const).map((opcao) => (
          <button
            key={opcao}
            type="button"
            onClick={() => {
              setAba(opcao);
              setErro(null);
            }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              aba === opcao ? "bg-white text-marca-700 shadow-sm" : "text-slate-600"
            }`}
          >
            {opcao === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>

      <form onSubmit={enviar} className="cartao space-y-4">
        {aba === "entrar" ? (
          <>
            <h1 className="text-xl font-bold">Entrar</h1>
            <p className="text-sm text-slate-600">
              Acesse para ver todos os seus números sem precisar do código da compra.
            </p>

            <div>
              <label className="rotulo" htmlFor="identificador">Usuário ou e-mail</label>
              <input id="identificador" name="identificador" className="campo" required autoComplete="username" />
            </div>

            <div>
              <label className="rotulo" htmlFor="senha">Senha</label>
              <input id="senha" name="senha" type="password" className="campo" required autoComplete="current-password" />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Criar conta</h1>
            <p className="text-sm text-slate-600">
              Com conta, suas compras ficam todas reunidas — e os seus dados já vêm preenchidos na
              próxima vez.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="rotulo" htmlFor="usuario">Usuário</label>
                <input id="usuario" name="usuario" className="campo" required autoComplete="username" />
              </div>
              <div>
                <label className="rotulo" htmlFor="senha">Senha</label>
                <input id="senha" name="senha" type="password" className="campo" required minLength={6} autoComplete="new-password" />
              </div>
              <div className="sm:col-span-2">
                <label className="rotulo" htmlFor="nome">Nome completo</label>
                <input id="nome" name="nome" className="campo" required />
              </div>
              <div className="sm:col-span-2">
                <label className="rotulo" htmlFor="email">E-mail</label>
                <input id="email" name="email" type="email" className="campo" required />
              </div>
              <div>
                <label className="rotulo" htmlFor="telefone">Telefone (com DDD)</label>
                <input id="telefone" name="telefone" className="campo" required placeholder="(11) 90000-0000" />
              </div>
              <div>
                <label className="rotulo" htmlFor="cpf">CPF (opcional)</label>
                <input id="cpf" name="cpf" className="campo" />
              </div>
            </div>
          </>
        )}

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        <button type="submit" className="botao w-full" disabled={enviando}>
          {enviando ? "Aguarde…" : aba === "entrar" ? "Entrar" : "Criar conta"}
        </button>
      </form>

      <p className="text-center text-xs text-slate-500">
        Você também pode comprar sem criar conta — depois é só consultar pelo código em{" "}
        <a href="/meus-numeros" className="text-marca-600 underline">Meus números</a>.
      </p>
    </div>
  );
}
