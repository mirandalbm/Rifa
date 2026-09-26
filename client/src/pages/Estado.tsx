import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { CartaoDoFeed, type RifaDoFeed } from "@/components/CartaoDoFeed";
import { UFS, ufValida } from "@shared/endereco";

/**
 * As rifas de um estado (`/estado/UF`), aberto pelos círculos da vitrine.
 * Aqui filtrar é o que a pessoa pediu; a vitrine em si só ordena.
 */
export default function EstadoPage() {
  const { uf: bruto } = useParams<{ uf: string }>();
  const uf = String(bruto ?? "").toUpperCase();
  const valida = ufValida(uf);
  const { data, isLoading } = useQuery<RifaDoFeed[]>({
    queryKey: ["/api/public/campaigns", { estado: uf }],
    enabled: valida,
  });

  return (
    <PublicShell>
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Todo o Brasil
      </Link>
      {!valida ? (
        <Empty>Estado não encontrado.</Empty>
      ) : (
        <>
          <h1 className="mt-2 font-display text-xl font-extrabold">Rifas em {UFS[uf]}</h1>
          {isLoading ? <p className="py-2 text-sm text-muted">Carregando rifas…</p> : null}
          {!isLoading && (data?.length ?? 0) === 0 ? <Empty>Nenhuma rifa no ar neste estado agora.</Empty> : null}
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {data?.map((c) => <CartaoDoFeed key={c.id} rifa={c} origem="estado" />)}
          </div>
        </>
      )}
    </PublicShell>
  );
}
