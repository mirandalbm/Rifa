import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Card } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";

/**
 * Cadastro aberto de afiliado avulso: a conta entra na hora e adere a
 * quantas organizações quiser. Vindo do "Seja um afiliado" de um perfil
 * (`?organizacao=`), o pedido de adesão já vai junto, com o aceite do termo
 * dela — que aparece aqui para ler antes.
 */
export default function CadastroAfiliado() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; message: string } | null>(null);
  const [aceito, setAceito] = useState(false);
  const organizacao = new URLSearchParams(window.location.search).get("organizacao") ?? undefined;
  const { data: termo } = useQuery<{ organizacao: string; termo: { versao: number; comissaoPct: number; texto: string } | null }>({
    queryKey: [`/api/public/o/${organizacao}/termo-afiliado`],
    enabled: Boolean(organizacao),
  });
  const precisaAceitar = Boolean(termo?.termo);

  const signup = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/public/afiliados/cadastro", {
        ...form,
        organizacao,
        termoVersao: termo?.termo?.versao,
      });
      return (await res.json()) as { code: string; message: string };
    },
    onSuccess: setDone,
    onError: (err: Error) => setError(err.message),
  });

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
        <Card title="Cadastro feito">
          <div className="space-y-3 p-4 text-sm">
            <p className="text-ink-2">
              Seu código de afiliado será <span className="tnum font-medium">{done.code}</span>.
            </p>
            <p className="text-muted">{done.message}</p>
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

        {termo?.termo ? (
          <div className="space-y-2 rounded-md border border-line p-3 text-sm">
            <p className="font-semibold">
              Termo de adesão de {termo.organizacao}{" "}
              <span className="tnum font-normal text-muted">· versão {termo.termo.versao} · {termo.termo.comissaoPct}%</span>
            </p>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-mist p-2 font-sans text-xs text-ink-2">
              {termo.termo.texto}
            </pre>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} className="mt-0.5" />
              Li e aceito o termo de adesão de {termo.organizacao}.
            </label>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
        ) : null}

        <Button type="submit" className="w-full" disabled={signup.isPending || (precisaAceitar && !aceito)}>
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
