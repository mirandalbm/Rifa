import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { CartaoDoFeed, type RifaDoFeed } from "@/components/CartaoDoFeed";
import { UFS, ufValida } from "@shared/endereco";

/**
 * As rifas de um estado (`/estado/UF`), aberto pelos círculos da vitrine.
 * Aqui filtrar é o que a pessoa pediu; a vitrine em si só ordena. O feed vai
 * em 1 coluna no celular, 2 no tablet e 3 no computador, com os mesmos
 * cartões da vitrine — cada um da altura dele (Figma "10 · Loja", 04).
 */
export default function EstadoPage() {
  const { uf: bruto } = useParams<{ uf: string }>();
  const uf = String(bruto ?? "").toUpperCase();
  const valida = ufValida(uf);
  const { data, isLoading } = useQuery<RifaDoFeed[]>({
    queryKey: ["/api/public/campaigns", { estado: uf }],
    enabled: valida,
  });

  const voltar = (
    <Link href="/" className="inline-flex items-center gap-1.5 py-0.5 text-sm text-ink-2 hover:text-ink">
      <ArrowLeft size={14} aria-hidden /> Todo o Brasil
    </Link>
  );

  if (!valida) {
    // UF que não existe é página não encontrada, com o caminho de volta.
    return (
      <PublicShell larga>
        {voltar}
        <h1 className="mt-1.5 font-display text-[22px] font-bold md:text-[28px]">Estado não encontrado</h1>
        <p className="mt-2 text-sm text-ink-2">
          Este endereço não é de nenhum estado.{" "}
          <Link href="/" className="font-semibold text-marca hover:underline">
            Ver as rifas de todo o Brasil
          </Link>
        </p>
      </PublicShell>
    );
  }

  return (
    <PublicShell larga>
      {voltar}
      <h1 className="mt-1.5 font-display text-[22px] font-bold md:text-[28px]">Rifas em {UFS[uf]}</h1>
      {isLoading ? <p className="py-2 text-sm text-muted">Carregando rifas…</p> : null}
      {!isLoading && (data?.length ?? 0) === 0 ? (
        <div>
          <Empty>Nenhuma rifa no ar neste estado agora.</Empty>
          <p className="-mt-4 text-center text-sm">
            <Link href="/" className="font-semibold text-marca hover:underline">
              Ver as rifas de todo o Brasil
            </Link>
          </p>
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {data?.map((c) => <CartaoDoFeed key={c.id} rifa={c} origem="estado" />)}
      </div>
    </PublicShell>
  );
}
