import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { cpfValido, maskCpf } from "@shared/format";
import { problemaNoCadastro } from "@shared/contaComprador";

/**
 * Cadastro do apostador. Uma conta joga em todas as rifas de todos os
 * organizadores. Telefone e CPF são obrigatórios: o telefone recebe o
 * bilhete e o código de confirmação; o CPF é o que prova quem é o dono num
 * pedido de reembolso.
 */
export default function CriarConta() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [f, setF] = useState({ nome: "", telefone: "", cpf: "", email: "", senha: "", repetir: "" });
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const problema =
    problemaNoCadastro(f) ?? (f.senha !== f.repetir ? "As senhas não são iguais." : null);
  const tocou = Object.values(f).some(Boolean);

  const criar = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/public/conta", {
        nome: f.nome,
        telefone: f.telefone,
        cpf: f.cpf,
        email: f.email || undefined,
        senha: f.senha,
        lembrar: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      navigate("/minhas-cotas");
    },
    onError: (e: Error) => setErro(e.message),
  });

  const campo = (
    id: keyof typeof f,
    rotulo: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div>
      <label htmlFor={`cc-${id}`} className="label-xs">
        {rotulo}
      </label>
      <input
        id={`cc-${id}`}
        value={f[id]}
        onChange={(e) => {
          setErro(null);
          setF({ ...f, [id]: id === "cpf" ? maskCpf(e.target.value) : e.target.value });
        }}
        className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
        {...extra}
      />
    </div>
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-8">
      <Link href="/" className="font-display text-2xl font-extrabold">
        rifa<span className="text-green">.</span>br
      </Link>
      <h1 className="mt-4 font-display text-xl font-bold">Criar conta</h1>
      <p className="mt-1 text-sm text-muted">
        Uma conta para jogar em qualquer rifa e acompanhar tudo o que você comprou.
      </p>

      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          criar.mutate();
        }}
      >
        {campo("nome", "Nome completo", { autoComplete: "name" })}
        {campo("telefone", "WhatsApp com DDD", { inputMode: "tel", autoComplete: "tel" })}
        {campo("cpf", "CPF", { inputMode: "numeric", className: "tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm" })}
        {f.cpf.replace(/\D/g, "").length === 11 && !cpfValido(f.cpf) ? (
          <p className="-mt-2 text-xs text-red">CPF inválido.</p>
        ) : null}
        {campo("email", "E-mail (opcional)", { type: "email", inputMode: "email", autoComplete: "email" })}

        <div>
          <label htmlFor="cc-senha" className="label-xs">
            Senha (mínimo 8 caracteres)
          </label>
          <div className="relative mt-1">
            <input
              id="cc-senha"
              type={verSenha ? "text" : "password"}
              autoComplete="new-password"
              value={f.senha}
              onChange={(e) => setF({ ...f, senha: e.target.value })}
              className="w-full rounded-md border border-line-2 px-3 py-2 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setVerSenha(!verSenha)}
              aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-ink"
            >
              {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        {campo("repetir", "Repita a senha", {
          type: verSenha ? "text" : "password",
          autoComplete: "new-password",
        })}

        {erro ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>
        ) : problema && tocou ? (
          <p className="text-xs text-muted">{problema}</p>
        ) : null}

        <Button type="submit" className="w-full" disabled={Boolean(problema) || criar.isPending}>
          {criar.isPending ? "Criando…" : "Criar conta"}
        </Button>

        <p className="text-xs text-muted">
          Já comprou antes com este WhatsApp? As compras antigas aparecem na conta depois que você
          confirmar o telefone pelo código do WhatsApp — é o que impede outra pessoa de ver o que é
          seu.
        </p>
        <p className="text-center text-xs text-muted">
          Já tem conta?{" "}
          <Link href="/entrar" className="text-green-deep underline">
            entrar
          </Link>
        </p>
      </form>
    </div>
  );
}
