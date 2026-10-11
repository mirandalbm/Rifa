import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { formatBRL, percent } from "@shared/format";

export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={`tnum ${className}`}>{formatBRL(cents)}</span>;
}

export function Progress({
  value,
  total,
  tone = "green",
}: {
  value: number;
  total: number;
  tone?: "green" | "yellow";
}) {
  const pct = percent(value, total);
  return (
    <div
      className="h-[7px] w-full overflow-hidden rounded-full bg-mist-2"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${tone === "yellow" ? "bg-yellow" : "bg-green"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const PILL: Record<string, string> = {
  paid: "bg-green-soft text-green-deep",
  available: "bg-green-soft text-green-deep",
  published: "bg-green-soft text-green-deep",
  pending: "bg-yellow-soft text-yellow-deep",
  reserved: "bg-yellow-soft text-yellow-deep",
  expired: "bg-red-soft text-red",
  refunded: "bg-red-soft text-red",
  reversed: "bg-red-soft text-red",
  draft: "bg-mist-2 text-muted",
  closed: "bg-mist-2 text-muted",
  drawn: "bg-mist-2 text-muted",
};

const LABEL: Record<string, string> = {
  paid: "pago",
  pending: "pendente",
  expired: "expirado",
  refunded: "estornado",
  available: "liberada",
  reversed: "estornada",
  draft: "rascunho",
  published: "no ar",
  closed: "encerrada",
  drawn: "sorteada",
  reserved: "reservada",
  active: "ativo",
  blocked: "bloqueado",
};

/**
 * Estado por forma e rótulo, nunca só por cor. A medida é a do kit congelado
 * (Figma, 00 · Fundamentos): o ponto de 6 px, 9 × 3 de respiro, DM Mono 11.
 */
export function Pill({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-[9px] py-[3px] font-mono text-[11px] font-medium ${
        PILL[status] ?? "bg-mist-2 text-muted"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {children ?? LABEL[status] ?? status}
    </span>
  );
}

export function Card({
  title,
  right,
  children,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="cartao overflow-hidden rounded-xl border border-line bg-white">
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="font-display text-sm font-bold">{title}</h2>
          {right}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  highlight = false,
}: {
  label: string;
  value: string;
  /** Texto de apoio; número dentro dele vai num <span className="tnum">. */
  hint?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`cartao min-w-0 rounded-[10px] border p-4 ${
        highlight ? "border-transparent bg-green-soft" : "border-line bg-white"
      }`}
    >
      <p className="label-xs">{label}</p>
      <p
        className={`tnum mt-1.5 break-words text-2xl font-medium leading-tight ${highlight ? "text-green-deep" : "text-ink"}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs leading-[17px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

/**
 * Os tons do botão são os do kit congelado (Figma, 00 · Fundamentos, `botao`):
 * `primario` (verde cheio), `branco` (sobre foto ou fundo escuro), `claro`
 * (verde-claro, a ação secundária dentro do cartão), `contorno` (só a borda),
 * `cinza` (neutro, "cancelar") e, para a espera e o prêmio, o `azul`. 40 px de
 * altura, cantos de 8, Inter Semi Bold 13, ícone opcional à esquerda. Os nomes
 * de antes (`primary`, `ghost`, `yellow`) seguem valendo como apelidos.
 */
export const TONS_DO_BOTAO = {
  primario: "bg-green text-on-green hover:brightness-95",
  branco: "bg-branco text-green-deep hover:bg-green-soft",
  claro: "bg-green-soft text-green-deep hover:brightness-95",
  contorno: "border-[1.5px] border-green bg-white text-green-deep hover:bg-green-soft",
  cinza: "border border-line-2 bg-white text-ink hover:bg-mist",
  azul: "bg-yellow text-on-yellow hover:brightness-95",
} as const;
export type TomDoBotao = keyof typeof TONS_DO_BOTAO;
const APELIDOS: Record<"primary" | "ghost" | "yellow", TomDoBotao> = { primary: "primario", ghost: "contorno", yellow: "azul" };

export function Button({
  children,
  variant = "primary",
  icone,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: TomDoBotao | keyof typeof APELIDOS;
  /** Ícone de 16 px à esquerda do texto (o texto continua obrigatório: ícone sozinho não diz o que faz). */
  icone?: ReactNode;
}) {
  const tom: TomDoBotao = variant in APELIDOS ? APELIDOS[variant as keyof typeof APELIDOS] : (variant as TomDoBotao);
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${TONS_DO_BOTAO[tom]} ${className}`}
    >
      {icone ? (
        <span aria-hidden className="flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">
          {icone}
        </span>
      ) : null}
      {children}
    </button>
  );
}

/**
 * As fichas de filtro do kit (`filtros` no Figma): a acesa em verde cheio, as
 * outras só em texto, e quebram a linha em vez de rolar. O estado vai em
 * `aria-pressed` — ou, com `exclusivo`, num grupo de rádio com `aria-checked` —
 * nunca só na cor. Tela nova com filtro por fichas usa isto, não monta à mão.
 */
export function Filtros<V extends string>({
  rotulo,
  opcoes,
  ativa,
  aoMudar,
  exclusivo = false,
  className = "",
}: {
  /** O nome do grupo, para o leitor de tela ("Filtrar por tipo", "Período"). */
  rotulo: string;
  opcoes: { valor: V; rotulo: ReactNode; extra?: ReactNode }[];
  ativa: V;
  aoMudar: (v: V) => void;
  /** Uma escolha entre várias (período, ordem): grupo de rádio em vez de botões de alternar. */
  exclusivo?: boolean;
  className?: string;
}) {
  return (
    <div role={exclusivo ? "radiogroup" : "group"} aria-label={rotulo} className={`flex flex-wrap gap-1 ${className}`}>
      {opcoes.map((o) => {
        const aceso = o.valor === ativa;
        return (
          <button
            key={o.valor}
            type="button"
            role={exclusivo ? "radio" : undefined}
            aria-checked={exclusivo ? aceso : undefined}
            aria-pressed={exclusivo ? undefined : aceso}
            onClick={() => aoMudar(o.valor)}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-[7px] text-[13px] ${
              aceso ? "bg-green font-semibold text-on-green" : "font-medium text-ink-2 hover:bg-mist-2"
            }`}
          >
            {o.rotulo}
            {o.extra !== undefined ? <span className="tnum text-xs opacity-80">{o.extra}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Caixa de marcar com o rótulo e, se houver, a explicação embaixo (`caixa` no
 * Figma): o `<input>` de verdade fica dentro do rótulo (o toque no texto
 * marca), com 16 px, cantos de 3 e verde quando marcada.
 */
export function Caixa({
  marcada,
  aoMudar,
  sub,
  className = "",
  children,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "checked" | "children" | "type"> & {
  marcada: boolean;
  aoMudar: (marcada: boolean) => void;
  /** A linha menor embaixo do rótulo (o que acontece ao marcar). */
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 text-sm ${className}`}>
      <input
        type="checkbox"
        {...props}
        checked={marcada}
        onChange={(e) => aoMudar(e.target.checked)}
        className="mt-[3px] h-4 w-4 shrink-0 rounded-[3px] border-line-2 accent-green"
      />
      <span className="min-w-0">
        <span className="block leading-[19px]">{children}</span>
        {sub ? <span className="block text-xs leading-[17px] text-muted">{sub}</span> : null}
      </span>
    </label>
  );
}

/**
 * Rótulo + campo + dica + erro, ligados pelo `id` (o rótulo é sempre visível:
 * placeholder não é rótulo — regra de `docs/VERSOES.md`). O campo vem como
 * filho (`<input>`, `<select>`, `<textarea>`) e recebe aqui o `id`, a classe
 * `.campo` se não tiver, o `aria-describedby` e o `aria-invalid` com erro.
 */
export function Campo({
  rotulo,
  dica,
  erro,
  className = "",
  children,
}: {
  rotulo: ReactNode;
  dica?: ReactNode;
  erro?: string | null;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const base = useId();
  const id = (isValidElement(children) && (children.props.id as string | undefined)) || `${base}-campo`;
  const idDica = dica ? `${base}-dica` : undefined;
  const idErro = erro ? `${base}-erro` : undefined;
  const classeDoFilho = String(children.props.className ?? "");
  const campo = cloneElement(children, {
    id,
    className: /\bcampo\b/.test(classeDoFilho) ? classeDoFilho : `campo text-sm ${classeDoFilho}`.trim(),
    "aria-describedby": [idDica, idErro].filter(Boolean).join(" ") || undefined,
    "aria-invalid": erro ? true : undefined,
  });
  return (
    <div className={className}>
      <label htmlFor={id} className="label-xs text-ink-2">
        {rotulo}
      </label>
      {campo}
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
