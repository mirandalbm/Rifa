import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StatusNumero, TipoMidia } from "@prisma/client";
import { formatarBRL } from "@/lib/dinheiro";

export const dynamic = "force-dynamic";

export default async function PaginaInicial({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const sufixoIndicacao = ref ? `?ref=${encodeURIComponent(ref)}` : "";

  const rifas = await prisma.rifa.findMany({
    where: { status: "ABERTA" },
    orderBy: { dataSorteio: "asc" },
    include: { midias: { where: { tipo: TipoMidia.BANNER }, select: { id: true }, take: 1 } },
  });

  if (rifas.length === 0) {
    return (
      <div className="cartao text-center">
        <h1 className="text-xl font-semibold">Nenhuma rifa aberta no momento</h1>
        <p className="mt-2 text-slate-600">Volte em breve — logo teremos uma nova rifa disponível.</p>
      </div>
    );
  }

  // Com uma rifa só, a lista teria um item e um clique a mais sem motivo:
  // o comprador vai direto para ela, preservando o código de indicação.
  if (rifas.length === 1) {
    redirect(`/rifa/${rifas[0].id}${sufixoIndicacao}`);
  }

  const vendidosPorRifa = await Promise.all(
    rifas.map((rifa) => prisma.numero.count({ where: { rifaId: rifa.id, status: StatusNumero.PAGO } })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-marca-700">Rifas abertas</h1>
        <p className="text-slate-600">Escolha uma rifa para ver os números disponíveis.</p>
      </div>

      {ref && (
        <p className="rounded-lg bg-marca-50 px-3 py-2 text-sm text-marca-700">
          Você chegou pela indicação <strong>{ref}</strong>.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {rifas.map((rifa, indice) => {
          const vendidos = vendidosPorRifa[indice];
          const porcentagem = Math.floor((vendidos / rifa.quantidadeNumeros) * 100);

          return (
            <Link
              key={rifa.id}
              href={`/rifa/${rifa.id}${sufixoIndicacao}`}
              className="cartao overflow-hidden p-0 transition hover:shadow-md"
            >
              {rifa.midias[0] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/midia/${rifa.midias[0].id}`}
                  alt={`Capa da ${rifa.titulo}`}
                  className="h-36 w-full object-cover"
                />
              ) : (
                <div className="flex h-36 w-full items-center justify-center bg-marca-50 text-marca-600">
                  <span className="text-4xl">🎟️</span>
                </div>
              )}

              <div className="p-4">
                <h2 className="font-semibold text-marca-700">{rifa.titulo}</h2>
                <p className="mt-1 text-sm text-slate-600">{rifa.premio}</p>

                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-lg font-bold">{formatarBRL(rifa.precoPorNumero)}</span>
                  <span className="text-xs text-slate-500">por número</span>
                </div>

                <div className="mt-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-marca-500" style={{ width: `${porcentagem}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {vendidos.toLocaleString("pt-BR")} de{" "}
                    {rifa.quantidadeNumeros.toLocaleString("pt-BR")} vendidos · sorteio em{" "}
                    {rifa.dataSorteio.toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
