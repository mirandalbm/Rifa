import { avisoDePrazoCurto } from "@shared/reembolso";

/**
 * O prazo de desistir menor que 7 dias, dito antes do Pix e com a data e a
 * hora exatas (`avisoDePrazoCurto()` em shared/reembolso.ts).
 */
export function AvisoDePrazo({ sorteioEm, rifa }: { sorteioEm: string | null | undefined; rifa?: string }) {
  const aviso = avisoDePrazoCurto(new Date(), sorteioEm ? new Date(sorteioEm) : null);
  if (!aviso) return null;
  return (
    <p role="note" className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
      {rifa ? <strong>{rifa}: </strong> : null}
      {aviso}
    </p>
  );
}
