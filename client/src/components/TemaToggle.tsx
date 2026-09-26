import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { NOME_TEMA, proximoTema, useTema, type Tema } from "@/lib/tema";

const ICONE: Record<Tema, LucideIcon> = { automatico: Monitor, claro: Sun, escuro: Moon };

/**
 * As três opções lado a lado, no rodapé: só os ícones; a escolhida mostra o
 * nome. O leitor de tela ouve o nome de todas (`aria-label`).
 */
export function TemaEscolha({ className = "" }: { className?: string }) {
  const [tema, escolher] = useTema();
  return (
    <div role="radiogroup" aria-label="Tema" className={`inline-flex rounded-md border border-line p-0.5 ${className}`}>
      {(Object.keys(NOME_TEMA) as Tema[]).map((t) => {
        const Icone = ICONE[t];
        const ativo = tema === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={NOME_TEMA[t]}
            title={NOME_TEMA[t]}
            onClick={() => escolher(t)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
              ativo ? "bg-mist-2 font-semibold text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <Icone size={15} aria-hidden />
            {ativo ? <span aria-hidden>{NOME_TEMA[t]}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Um botão só, que passa para o próximo tema — para menus apertados. O rótulo
 * diz o tema atual em texto: estado nunca é só ícone.
 */
export function TemaCiclo({
  className = "",
  compacto = false,
}: {
  className?: string;
  compacto?: boolean;
}) {
  const [tema, escolher] = useTema();
  const Icone = ICONE[tema];
  const rotulo = `Tema: ${NOME_TEMA[tema]}`;
  return (
    <button
      type="button"
      onClick={() => escolher(proximoTema(tema))}
      title={compacto ? rotulo : undefined}
      aria-label={`${rotulo}. Trocar para ${NOME_TEMA[proximoTema(tema)]}`}
      className={className}
    >
      <Icone size={18} className="shrink-0" aria-hidden />
      {compacto ? null : <span>{rotulo}</span>}
    </button>
  );
}
