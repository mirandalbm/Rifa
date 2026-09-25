import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, Button } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { minimoSenha, senhaInvalida } from "@shared/senha";

const VAZIO = { atual: "", nova: "", confirma: "" };

/**
 * Trocar a própria senha. Serve a todo mundo que entra no painel — o
 * administrador, o organizador, o afiliado e o cambista.
 *
 * Os campos são `new-password`/`current-password` de propósito: sem isso o
 * navegador preenche a senha salva onde não devia, e a pessoa grava uma
 * senha que nunca digitou.
 */
export function TrocarSenha() {
  const { data: session } = useSession();
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const role = session?.role ?? "affiliate";
  const problema =
    form.nova && senhaInvalida(form.nova, role)
      ? senhaInvalida(form.nova, role)
      : form.confirma && form.nova !== form.confirma
        ? "A confirmação não bate com a nova senha."
        : null;

  const trocar = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/auth/senha", { atual: form.atual, nova: form.nova }),
    onSuccess: () => {
      setForm(VAZIO);
      setErro(null);
      setOk(true);
    },
    onError: (err: Error) => {
      setOk(false);
      setErro(err.message);
    },
  });

  const campos = [
    ["atual", "Senha atual", "current-password"],
    ["nova", `Nova senha (mínimo ${minimoSenha(role)} caracteres)`, "new-password"],
    ["confirma", "Repita a nova senha", "new-password"],
  ] as const;

  return (
    <Card title="Trocar minha senha">
      <form
        className="space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          trocar.mutate();
        }}
      >
        {erro ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>
        ) : null}
        {ok ? (
          <p className="rounded-md bg-green-soft px-3 py-2 text-sm text-green-deep">
            Senha trocada. Use a nova no próximo acesso.
          </p>
        ) : null}
        {campos.map(([campo, rotulo, auto]) => (
          <div key={campo}>
            <label htmlFor={`senha-${campo}`} className="label-xs">
              {rotulo}
            </label>
            <input
              id={`senha-${campo}`}
              type="password"
              autoComplete={auto}
              value={form[campo]}
              onChange={(e) => {
                setOk(false);
                setForm({ ...form, [campo]: e.target.value });
              }}
              className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
            />
          </div>
        ))}
        {problema ? <p className="text-xs text-red">{problema}</p> : null}
        <Button
          type="submit"
          disabled={
            !form.atual || !form.nova || form.nova !== form.confirma || Boolean(problema) ||
            trocar.isPending
          }
        >
          Trocar senha
        </Button>
      </form>
    </Card>
  );
}
