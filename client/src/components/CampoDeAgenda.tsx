/**
 * "Publicar em (opcional)": a hora em que algo agendado entra no ar. O campo é
 * `datetime-local` (no fuso do aparelho); o servidor recebe o instante ISO com
 * o fuso (`paraInstante`), nunca o texto do campo.
 */

/** Instante ISO → valor do `datetime-local`, no fuso de quem está vendo. */
export function paraCampoLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Valor do campo → instante ISO (vazio é `null`: sem agenda). */
export function paraInstante(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

/** "04/10/2026, 14:00". */
export function quandoCurto(iso: string | Date): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Agendada para depois de agora? */
export function aindaAgendado(iso: string | null | undefined): boolean {
  return Boolean(iso) && new Date(iso as string).getTime() > Date.now();
}

export function CampoDeAgenda({
  id,
  valor,
  aoMudar,
  dica,
}: {
  id: string;
  valor: string;
  aoMudar: (v: string) => void;
  dica: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label-xs">
        Publicar em (opcional)
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          id={id}
          type="datetime-local"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          className="campo tnum max-w-[16rem]"
          aria-describedby={`${id}-dica`}
        />
        {valor ? (
          <button type="button" className="text-xs font-semibold text-ink-2 underline" onClick={() => aoMudar("")}>
            Sem agenda
          </button>
        ) : null}
      </div>
      <p id={`${id}-dica`} className="mt-1 text-xs text-muted">
        {dica}
      </p>
    </div>
  );
}
