import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button, Card } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";

/**
 * Cadastro aberto: qualquer pessoa se inscreve, mas ninguém divulga antes
 * de o administrador aprovar.
 */
export default function CadastroAfiliado() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string } | null>(null);

  const signup = useMutation({
    mutationFn: async () => {
      // Vindo do "Seja um afiliado" de um perfil, o cadastro já vai para
      // aquela organização.
      const organizacao = new URLSearchParams(window.location.search).get("organizacao") ?? undefined;
      const res = await apiRequest("POST", "/api/public/afiliados/cadastro", { ...form, organizacao });
      return (await res.json()) as { code: string };
    },
    onSuccess: setDone,
    onError: (err: Error) => setError(err.message),
  });

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
        <Card title="Cadastro enviado">
          <div className="space-y-3 p-4 text-sm">
            <p className="text-ink-2">
              Seu código de afiliado será <span className="tnum font-medium">{done.code}</span>.
            </p>
            <p className="text-muted">
              O administrador precisa aprovar antes de você começar a divulgar. Assim que
              liberar, é só entrar com o seu e-mail e senha.
            </p>
            <Link href="/entrar" className="inline-block text-green-deep underline">
              ir para a entrada
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <h1 className="font-display text-2xl font-extrabold">Seja afiliado</h1>
      <p className="mt-1 text-sm text-muted">
        Divulgue as rifas com o seu link e receba comissão por venda paga, direto no Pix.
      </p>

      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          signup.mutate();
        }}
      >
        {(
          [
            ["name", "Nome completo", "text", "name"],
            ["email", "E-mail", "email", "email"],
            ["phone", "WhatsApp", "tel", "tel"],
            ["password", "Senha (mínimo 8 caracteres)", "password", "new-password"],
          ] as const
        ).map(([field, label, type, autoComplete]) => (
          <div key={field}>
            <label htmlFor={field} className="label-xs">
              {label}
            </label>
            <input
              id={field}
              type={type}
              autoComplete={autoComplete}
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              className={`mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm ${
                field === "phone" ? "tnum" : ""
              }`}
            />
          </div>
        ))}

        {error ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
        ) : null}

        <Button type="submit" className="w-full" disabled={signup.isPending}>
          {signup.isPending ? "Enviando…" : "Quero ser afiliado"}
        </Button>

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
