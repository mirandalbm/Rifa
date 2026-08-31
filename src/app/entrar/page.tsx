"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PaginaEntrar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const resposta = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });

    const dados = await resposta.json();
    setEnviando(false);

    if (!resposta.ok) {
      setErro(dados.erro ?? "Não foi possível entrar.");
      return;
    }

    router.push(dados.destino);
    router.refresh();
  }

  return (
    <form onSubmit={entrar} className="cartao mx-auto max-w-sm space-y-4">
      <h1 className="text-xl font-bold">Entrar</h1>
      <p className="text-sm text-slate-600">Acesso para afiliados e para a organizadora.</p>

      <div>
        <label className="rotulo" htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          className="campo"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <label className="rotulo" htmlFor="senha">Senha</label>
        <input
          id="senha"
          type="password"
          className="campo"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <button type="submit" className="botao w-full" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
