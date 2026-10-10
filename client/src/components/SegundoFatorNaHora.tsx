import { Campo } from "@/components/bits";

/** O que o servidor pede, na hora, nos atos mais sensíveis da plataforma. */
export interface SegundoFatorNaHora {
  password: string;
  code: string;
}

export const SEGUNDO_FATOR_VAZIO: SegundoFatorNaHora = { password: "", code: "" };

/** Está completo para enviar? (6 dígitos e senha preenchida) */
export const segundoFatorCompleto = (v: SegundoFatorNaHora) => Boolean(v.password) && v.code.length === 6;

/**
 * Senha e código do autenticador para um ato que decide dinheiro ou ganhador
 * (lançar o resultado do sorteio, nova extração do globo). O servidor confere
 * de novo: aqui é só o campo.
 */
export function CamposDoSegundoFator({
  valor,
  aoMudar,
  aviso,
}: {
  valor: SegundoFatorNaHora;
  aoMudar: (v: SegundoFatorNaHora) => void;
  aviso: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="label-xs">Confirme com o segundo fator</legend>
      <p className="text-xs text-muted">{aviso}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Campo rotulo="Sua senha">
          <input
            type="password"
            autoComplete="current-password"
            value={valor.password}
            onChange={(e) => aoMudar({ ...valor, password: e.target.value })}
          />
        </Campo>
        <Campo rotulo="Código do autenticador">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="tnum"
            value={valor.code}
            onChange={(e) => aoMudar({ ...valor, code: e.target.value.replace(/\D/g, "") })}
          />
        </Campo>
      </div>
    </fieldset>
  );
}
