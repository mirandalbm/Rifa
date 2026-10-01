import type { Key, ReactNode } from "react";
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

/**
 * Gráfico pequeno dentro do cartão de estatística (o "sparkline" do kit):
 * barras ou linha com área, sem eixo — o número ao lado é que diz o valor;
 * a lista de pontos vai no `aria-label` para o leitor de tela.
 */
export function Sparkline({
  pontos,
  tipo = "linha",
  cor = "var(--green)",
  largura = 120,
  altura = 48,
  rotulo,
  cheio = false,
}: {
  pontos: number[];
  tipo?: "linha" | "barras";
  cor?: string;
  largura?: number;
  altura?: number;
  rotulo: string;
  /** Ocupa a largura do cartão (esticando o desenho), em vez da largura fixa. */
  cheio?: boolean;
}) {
  const classe = cheio ? "block h-auto w-full overflow-visible" : "shrink-0 overflow-visible";
  const ratio = cheio ? { preserveAspectRatio: "none" as const } : {};
  const max = Math.max(...pontos, 1);
  const n = Math.max(pontos.length, 1);
  if (tipo === "barras") {
    const passo = largura / n;
    return (
      <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label={rotulo} className={classe} {...ratio}>
        {pontos.map((p, i) => {
          const h = Math.max(3, Math.round((p / max) * (altura - 4)));
          return <rect key={i} x={i * passo + passo * 0.2} y={altura - h} width={passo * 0.6} height={h} rx={2} fill={cor} opacity={p === max ? 1 : 0.45} />;
        })}
      </svg>
    );
  }
  const passo = n > 1 ? largura / (n - 1) : 0;
  const y = (p: number) => altura - 4 - (p / max) * (altura - 8);
  const d = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${(i * passo).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label={rotulo} className={classe} {...ratio}>
      {n > 1 ? <path d={`${d} L${largura},${altura} L0,${altura} Z`} fill={cor} opacity={0.12} /> : null}
      <path d={n > 1 ? d : `M0,${y(pontos[0] ?? 0)} L${largura},${y(pontos[0] ?? 0)}`} fill="none" stroke={cor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Lista de barras horizontais com rótulo e valor (o "Sales by Country" do kit). */
export function BarrasHorizontais({
  linhas,
  cores = ["bg-green", "bg-azul", "bg-yellow", "bg-green-deep", "bg-red", "bg-muted"],
}: {
  linhas: { rotulo: string; valor: number; texto: string }[];
  cores?: string[];
}) {
  const max = Math.max(...linhas.map((l) => l.valor), 1);
  return (
    <ul className="space-y-3">
      {linhas.map((l, i) => (
        <li key={l.rotulo} className="flex items-center gap-3 text-sm">
          <span className="w-8 shrink-0 text-xs font-medium text-ink-2">{l.rotulo}</span>
          <span className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-mist-2">
            <span
              className={`tnum flex h-full items-center justify-end rounded pr-2 text-[11px] font-semibold text-branco ${cores[i % cores.length]}`}
              style={{ width: `${Math.max(10, Math.round((l.valor / max) * 100))}%` }}
            >
              {l.texto}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A lista longa do painel: **cartão por linha no celular, tabela a partir de
 * `sm`** (639 px). Uma tabela de cinco colunas num celular de 390 px rola
 * para o lado ou espreme o texto; o cartão conta a mesma linha de cima para
 * baixo. Só um dos dois fica na tela (o outro é `display: none`, então o
 * leitor de tela também lê uma vez só).
 */
export function TabelaOuCartoes<T>({
  itens,
  chave,
  colunas,
  cartao,
  aria,
}: {
  itens: T[];
  chave: (i: T) => Key;
  /** `direita` alinha número e dinheiro, como no kit. */
  colunas: { titulo: string; celula: (i: T) => ReactNode; direita?: boolean }[];
  /** A linha contada de cima para baixo, para o celular. */
  cartao: (i: T) => ReactNode;
  aria: string;
}) {
  return (
    <>
      <ul aria-label={aria} className="divide-y divide-line sm:hidden">
        {itens.map((i) => (
          <li key={chave(i)} className="px-4 py-3">
            {cartao(i)}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table aria-label={aria} className="w-full text-sm">
          <CabecalhoDaTabela colunas={colunas.map((c) => c.titulo)} />
          <tbody>
            {itens.map((i) => (
              <tr key={chave(i)} className="border-t border-line">
                {colunas.map((c) => (
                  <td key={c.titulo} className={`px-4 py-3 ${c.direita ? "text-right" : ""}`}>
                    {c.celula(i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** "Ver mais" no pé da lista paginada: some quando o servidor não mandou o próximo cursor. */
export function VerMais({
  temMais,
  carregando,
  aoPedir,
  mostradas,
}: {
  temMais: boolean;
  carregando: boolean;
  aoPedir: () => void;
  mostradas: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs text-muted">
      <span>
        <span className="tnum">{mostradas}</span> mostrad{mostradas === 1 ? "a" : "as"}
        {temMais ? "" : " — é tudo"}
      </span>
      {temMais ? (
        <button
          type="button"
          onClick={aoPedir}
          disabled={carregando}
          className="inline-flex min-h-9 items-center rounded-md border-2 border-green px-4 text-sm font-semibold text-green-deep hover:bg-green-soft disabled:opacity-50"
        >
          {carregando ? "Carregando…" : "Ver mais"}
        </button>
      ) : null}
    </div>
  );
}
