import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Campo de senha com o "mostrar/esconder" dentro dele, para as telas de
 * entrar e de criar conta. É o `Campo` do kit com um botão por cima: o rótulo
 * visível, a classe `.campo` (16 px no celular pela regra global), a dica e o
 * erro ligados por `aria-describedby`. O `Campo` não serve aqui porque o
 * filho dele é o próprio `<input>`, e o botão precisa de uma caixa em volta.
 */
export function CampoDeSenha({
  id,
  rotulo,
  valor,
  aoMudar,
  autoComplete,
  name,
  dica,
  erro,
  aoSair,
  verSenha: verDeFora,
  aoVerSenha,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  name?: string;
  dica?: string;
  erro?: string | null;
  aoSair?: () => void;
  /** Quem quiser mostrar outro campo junto (o "repita a senha") controla de fora. */
  verSenha?: boolean;
  aoVerSenha?: (ver: boolean) => void;
}) {
  const [verDeDentro, setVerDeDentro] = useState(false);
  const ver = verDeFora ?? verDeDentro;
  const trocar = () => (aoVerSenha ? aoVerSenha(!ver) : setVerDeDentro(!ver));
  const base = useId();
  const idDica = dica ? `${base}-dica` : undefined;
  const idErro = erro ? `${base}-erro` : undefined;
  return (
    <div>
      <label htmlFor={id} className="label-xs text-ink-2">
        {rotulo}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          name={name}
          type={ver ? "text" : "password"}
          autoComplete={autoComplete}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          onBlur={aoSair}
          aria-describedby={[idDica, idErro].filter(Boolean).join(" ") || undefined}
          aria-invalid={erro ? true : undefined}
          className="campo mt-0 pr-11 text-sm"
        />
        <button
          type="button"
          onClick={trocar}
          aria-label={ver ? "Esconder senha" : "Mostrar senha"}
          title={ver ? "Esconder senha" : "Mostrar senha"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-ink"
        >
          {ver ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      </div>
      {dica ? (
        <p id={idDica} className="mt-1 text-xs text-muted">
          {dica}
        </p>
      ) : null}
      {erro ? (
        <p id={idErro} role="alert" className="mt-1 text-xs text-red">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
