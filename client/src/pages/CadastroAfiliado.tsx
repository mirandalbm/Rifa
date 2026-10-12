import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Caixa, Campo, Card } from "@/components/bits";
import { CampoDeSenha } from "@/components/CampoDeSenha";
import { apiRequest } from "@/lib/queryClient";

const LINK = "text-green-deep underline";

/** O cartão de 384 px no centro, sem casca, nas três larguras. */
function NoCentro({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[416px] flex-col justify-center px-4 py-8">{children}</main>
  );
}

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
      <NoCentro>
        <Card title="Cadastro feito">
          <div className="space-y-3 p-4 text-sm">
            <p className="text-ink-2">
              Seu código de afiliado será <span className="tnum font-medium">{done.code}</span>.
            </p>
            <p className="text-muted">{done.message}</p>
            <Link href="/entrar" className={`inline-block ${LINK}`}>
              ir para a entrada
            </Link>
          </div>
        </Card>
      </NoCentro>
    );
  }

  return (
    <NoCentro>
      <div className="space-y-3.5">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-[31px]">Seja afiliado</h1>
          <p className="mt-3.5 text-[15px] leading-[21px] text-ink-2">
            Divulgue as rifas com o seu link e receba comissão por venda paga, direto no Pix.
          </p>
        </div>

        {/* Antes do cadastro, para ninguém descobrir só no saque. */}
        <p className="rounded-lg bg-mist-2 px-3 py-2.5 text-[13px] leading-[18px] text-ink-2">
          A comissão é paga só a <strong className="font-semibold text-ink">MEI ou empresa</strong>: para sacar, você
          vai precisar do cadastro fiscal aprovado com o CNPJ e da nota fiscal de cada saque. O cadastro de afiliado
          entra na hora; isso pode ficar para depois.
        </p>

        <form
          className="space-y-3.5"
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
            ] as const
          ).map(([field, label, type, autoComplete]) => (
            <Campo key={field} rotulo={label}>
              <input
                id={field}
                type={type}
                autoComplete={autoComplete}
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                className={field === "phone" ? "campo tnum text-sm" : undefined}
              />
            </Campo>
          ))}
          <CampoDeSenha
            id="password"
            rotulo="Senha (mínimo 8 caracteres)"
            autoComplete="new-password"
            valor={form.password}
            aoMudar={(password) => setForm({ ...form, password })}
          />

          {termo?.termo ? (
            <div className="space-y-2 rounded-lg border border-line p-3 text-sm">
              <p className="font-semibold">
                Termo de adesão de {termo.organizacao}{" "}
                <span className="tnum font-normal text-muted">
                  · versão {termo.termo.versao} · {termo.termo.comissaoPct}%
                </span>
              </p>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-mist p-2 font-sans text-xs text-ink-2">
                {termo.termo.texto}
              </pre>
              <Caixa marcada={aceito} aoMudar={setAceito}>
                Li e aceito o termo de adesão de {termo.organizacao}.
              </Caixa>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg bg-red-soft px-3 py-2 text-sm text-red">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={signup.isPending || (precisaAceitar && !aceito)}>
            {signup.isPending ? "Enviando…" : "Quero ser afiliado"}
          </Button>

          <p className="text-center text-[13px] leading-[18px] text-ink-2">
            Já tem conta?{" "}
            <Link href="/entrar" className={LINK}>
              entrar
            </Link>
          </p>
        </form>
      </div>
    </NoCentro>
  );
}
