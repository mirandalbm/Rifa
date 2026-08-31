import { Suspense } from "react";
import ComprarNumeros from "@/components/ComprarNumeros";

export const dynamic = "force-dynamic";

export default function PaginaInicial() {
  return (
    <Suspense fallback={<p className="text-slate-500">Carregando rifa…</p>}>
      <ComprarNumeros />
    </Suspense>
  );
}
