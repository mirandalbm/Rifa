import { avisoDePrazoCurto } from "@shared/reembolso";

/**
 * O prazo de desistir menor que 7 dias, dito antes do Pix e com a data e a
 * hora exatas (`avisoDePrazoCurto()` em shared/reembolso.ts).
 */
export function AvisoDePrazo({
  sorteioEm,
  modoSorteio,
  rifa,
}: {
  sorteioEm: string | null | undefined;
  modoSorteio?: string | null;
  rifa?: string;
}) {
  const aviso = avisoDePrazoCurto(new Date(), sorteioEm ? new Date(sorteioEm) : null, modoSorteio);
  if (!aviso) return null;
  return (
    <p role="note" className="tnum rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
      {rifa ? <strong>{rifa}: </strong> : null}
      {aviso}
    </p>
  );
}
