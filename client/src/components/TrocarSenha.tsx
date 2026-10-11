import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Campo } from "@/components/bits";
import { CartaoDoPainel } from "@/components/painel";
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
 *
 * A régua da senha (`senhaInvalida`, a mesma do servidor) aparece embaixo
 * do campo da nova senha enquanto a pessoa digita, antes de enviar; a
 * confirmação que não bate aparece embaixo do campo dela.
 */
export function TrocarSenha() {
  const { data: session } = useSession();
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const role = session?.role ?? "affiliate";
  const problemaNova = form.nova ? senhaInvalida(form.nova, role) : null;
  const problemaConfirma =
    !problemaNova && form.confirma && form.nova !== form.confirma ? "A confirmação não bate com a nova senha." : null;
  const problema = problemaNova ?? problemaConfirma;

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
    ["atual", "Senha atual", "current-password", null],
    ["nova", `Nova senha (mínimo ${minimoSenha(role)} caracteres)`, "new-password", problemaNova],
    ["confirma", "Repita a nova senha", "new-password", problemaConfirma],
  ] as const;

  return (
    <CartaoDoPainel titulo="Trocar minha senha">
      <form
        className="space-y-3 px-5 pb-5"
        onSubmit={(e) => {
          e.preventDefault();
          trocar.mutate();
        }}
      >
        {erro ? (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
            {erro}
          </p>
        ) : null}
        {ok ? (
          <p role="status" className="rounded-md bg-green-soft px-3 py-2 text-sm text-green-deep">
            Senha trocada. As suas outras sessões foram encerradas; esta continua aberta. Use a nova
            senha no próximo acesso.
          </p>
        ) : null}
        {campos.map(([campo, rotulo, auto, erroDoCampo]) => (
          <Campo key={campo} rotulo={rotulo} erro={erroDoCampo}>
            <input
              id={`senha-${campo}`}
              type="password"
              autoComplete={auto}
              value={form[campo]}
              onChange={(e) => {
                setOk(false);
                setForm({ ...form, [campo]: e.target.value });
              }}
            />
          </Campo>
        ))}
        <Button
          type="submit"
          disabled={
            !form.atual ||
            !form.nova ||
            form.nova !== form.confirma ||
            Boolean(problema) ||
            trocar.isPending
          }
        >
          Trocar senha
        </Button>
      </form>
    </CartaoDoPainel>
  );
}
