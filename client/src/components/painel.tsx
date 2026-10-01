import type { ReactNode } from "react";
import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";

/**
 * As peças do painel no padrão do kit (Materialize), reusadas pelo
 * organizador, pela plataforma e pelo afiliado: o cartão de estatística
 * (ícone num quadrado colorido, o número e o rótulo), o cartão com título e
 * subtítulo, e a tabela com o cabeçalho cinza.
 *
 * As cores seguem o significado de sempre (verde = dinheiro que entrou,
 * amarelo = espera, vermelho = erro); o azul é o neutro de contagem.
 */

const TOM = {
  green: "bg-green-soft text-green-deep",
  yellow: "bg-yellow-soft text-yellow-deep",
  red: "bg-red-soft text-red",
  azul: "bg-azul/10 text-azul",
} as const;

export function Estatistica({
  icone: Icone,
  tom = "green",
  valor,
  rotulo,
  dica,
  href,
}: {
  icone: LucideIcon;
  tom?: keyof typeof TOM;
  /** O número (vai em `tnum`). */
  valor: ReactNode;
  rotulo: string;
  /** Texto de apoio; número dentro dele vai num <span className="tnum">. */
  dica?: ReactNode;
  href?: string;
}) {
  const miolo = (
    <>
      <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TOM[tom]}`}>
        <Icone size={22} />
      </span>
      <span className="min-w-0">
        <span className="tnum block truncate text-xl font-medium leading-8 text-ink">{valor}</span>
        <span className="block text-xs leading-4 text-muted">{rotulo}</span>
        {dica ? <span className="block text-[11px] leading-4 text-muted">{dica}</span> : null}
      </span>
    </>
  );
  const classe = "cartao flex min-w-0 items-center gap-4 rounded-xl border border-line bg-white px-5 py-4";
  return href ? (
    <Link href={href} className={`${classe} hover:bg-mist`} aria-label={`${rotulo}: ${typeof valor === "string" ? valor : ""}`}>
      {miolo}
    </Link>
  ) : (
    <div className={classe}>{miolo}</div>
  );
}

export function CartaoDoPainel({
  titulo,
  subtitulo,
  acao,
  className = "",
  children,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  /** O que fica à direita do título (botão, filtro, selo). */
  acao?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={titulo} className={`cartao min-w-0 overflow-hidden rounded-xl border border-line bg-white ${className}`}>
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <h2 className="text-lg font-medium leading-7">{titulo}</h2>
          {subtitulo ? <p className="text-xs text-muted">{subtitulo}</p> : null}
        </div>
        {acao ? <div className="shrink-0">{acao}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** O cabeçalho cinza da tabela do kit: letras pequenas, maiúsculas, espaçadas. */
export function CabecalhoDaTabela({ colunas }: { colunas: string[] }) {
  return (
    <thead>
      <tr className="bg-mist">
        {colunas.map((c, i) => (
          <th key={`${c}-${i}`} scope="col" className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.1em] text-ink-2">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * Grade ou lista, lembrado no aparelho: o botão aceso tem `aria-pressed` e o
 * nome em texto para o leitor de tela — nunca só o ícone.
 */
export function AlternarVisao({
  visao,
  aoMudar,
  opcoes,
}: {
  visao: string;
  aoMudar: (v: string) => void;
  opcoes: { valor: string; rotulo: string; icone: LucideIcon }[];
}) {
  return (
    <div role="group" aria-label="Como mostrar" className="inline-flex overflow-hidden rounded-md border border-line-2">
      {opcoes.map(({ valor, rotulo, icone: Icone }) => {
        const aceso = visao === valor;
        return (
          <button
            key={valor}
            type="button"
            aria-pressed={aceso}
            aria-label={rotulo}
            title={rotulo}
            onClick={() => aoMudar(valor)}
            className={`flex h-9 w-10 items-center justify-center ${aceso ? "bg-green-soft text-green-deep" : "text-muted hover:text-ink"}`}
          >
            <Icone size={18} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
