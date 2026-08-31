import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPerfil } from "@/lib/auth";
import { formatarNumero } from "@/lib/rifa";
import FormResultado from "@/components/FormResultado";

export const dynamic = "force-dynamic";

export default async function PaginaResultadoOrganizadora() {
  const sessao = await exigirPerfil("ORGANIZADORA");
  if (!sessao) redirect("/organizadora");

  const rifas = await prisma.rifa.findMany({
    where: {
      organizacaoId: sessao.organizacaoId,
      status: { in: ["ABERTA", "ENCERRADA"] },
      resultado: null,
    },
    select: { id: true, titulo: true, quantidadeNumeros: true, dataSorteio: true },
    orderBy: { dataSorteio: "asc" },
  });

  const publicados = await prisma.resultado.findMany({
    where: { rifa: { organizacaoId: sessao.organizacaoId } },
    include: { rifa: { select: { titulo: true, quantidadeNumeros: true } } },
    orderBy: { publicadoEm: "desc" },
    take: 10,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Publicar resultado</h1>

      {rifas.length === 0 ? (
        <p className="cartao text-slate-600">
          Nenhuma rifa aguardando resultado no momento.
        </p>
      ) : (
        <FormResultado rifas={rifas.map((r) => ({ ...r, dataSorteio: r.dataSorteio.toISOString() }))} />
      )}

      {publicados.length > 0 && (
        <section className="cartao">
          <h2 className="mb-3 text-lg font-semibold">Resultados já publicados</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-2">Rifa</th>
                <th className="pb-2">Número</th>
                <th className="pb-2">Concurso</th>
                <th className="pb-2">Publicado em</th>
              </tr>
            </thead>
            <tbody>
              {publicados.map((resultado) => (
                <tr key={resultado.id} className="border-b border-slate-100">
                  <td className="py-2">{resultado.rifa.titulo}</td>
                  <td className="py-2 font-mono font-semibold">
                    {formatarNumero(resultado.numeroSorteado, resultado.rifa.quantidadeNumeros)}
                  </td>
                  <td className="py-2">{resultado.concurso}</td>
                  <td className="py-2">{resultado.publicadoEm.toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
