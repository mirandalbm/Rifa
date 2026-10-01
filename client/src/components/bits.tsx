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

/** Estado por forma e rótulo, nunca só por cor. */
export function Pill({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-mono text-[11px] ${
        PILL[status] ?? "bg-mist-2 text-muted"
      }`}
    >
      <span className="h-[5px] w-[5px] rounded-full bg-current" aria-hidden />
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
      className={`cartao rounded-lg border p-3 ${
        highlight ? "border-transparent bg-green-soft" : "border-line bg-white"
      }`}
    >
      <p className="label-xs">{label}</p>
      <p
        className={`tnum mt-1 text-2xl leading-tight ${highlight ? "text-green-deep" : "text-ink"}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "yellow";
}) {
  const styles = {
    primary: "bg-green text-on-green hover:brightness-95",
    yellow: "bg-yellow text-on-yellow hover:brightness-95",
    ghost: "border-2 border-green bg-white text-green-deep hover:bg-green-soft",
  }[variant];

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
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
      <label htmlFor={id} className="label-xs">
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
