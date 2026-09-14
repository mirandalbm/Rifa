import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/bits";
import { useLogin } from "@/lib/session";
import { ApiError } from "@/lib/queryClient";

/**
 * Uma porta de entrada só. O papel gravado no banco decide onde a pessoa
 * cai — afiliado no painel de afiliado, administrador no painel geral.
 */
export default function Login() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ email: "", password: "", token: "" });
  const [error, setError] = useState<string | null>(null);
  // O campo do segundo fator só aparece quando o servidor pede.
  const [needsToken, setNeedsToken] = useState(false);
  const login = useLogin();

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <h1 className="font-display text-2xl font-extrabold">
        rifa<span className="text-green">.</span>br
      </h1>
      <p className="mt-1 text-sm text-muted">Acesso de afiliado e administrador.</p>

      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          login.mutate(form, {
            onSuccess: (session) => navigate(session.home),
            onError: (err: Error) => {
              const code = err instanceof ApiError ? err.code : undefined;
              if (code === "totp_required" || code === "totp_invalid") {
                setNeedsToken(true);
              }
              setError(err.message);
            },
          });
        }}
      >
        <div>
          <label htmlFor="email" className="label-xs">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="senha" className="label-xs">
            Senha
          </label>
          <input
            id="senha"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
          />
        </div>

        {needsToken ? (
          <div>
            <label htmlFor="token" className="label-xs">
              Código do autenticador
            </label>
            <input
              id="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={form.token}
              onChange={(e) =>
                setForm({ ...form, token: e.target.value.replace(/\D/g, "") })
              }
              className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-lg tracking-[0.3em]"
            />
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
        ) : null}

        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? "Entrando…" : "Entrar"}
        </Button>

        <p className="text-center text-xs text-muted">
          Quer divulgar as rifas?{" "}
          <Link href="/seja-afiliado" className="text-green-deep underline">
            seja afiliado
          </Link>
        </p>
      </form>
    </div>
  );
}
