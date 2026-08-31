import { prisma } from "@/lib/prisma";
import { exigirPerfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { formatarBRL } from "@/lib/dinheiro";
import FormRifa from "@/components/FormRifa";
import AcoesRifa from "@/components/AcoesRifa";

export const dynamic = "force-dynamic";

export default async function PaginaRifas() {
  const sessao = await exigirPerfil("ORGANIZADORA", "OPERADOR");
  if (!sessao) redirect("/entrar");

  const rifas = await prisma.rifa.findMany({
    where: { organizacaoId: sessao.organizacaoId },
    include: {
      resultado: { select: { id: true } },
      _count: { select: { compras: true } },
    },
    orderBy: { criadaEm: "desc" },
  });

  const podeCriar = sessao.perfil === "ORGANIZADORA";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Rifas</h1>

      <section className="cartao">
        <h2 className="mb-3 text-lg font-semibold">Rifas cadastradas</h2>

        {rifas.length === 0 ? (
          <p className="text-slate-600">Nenhuma rifa cadastrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2">Rifa</th>
                  <th className="pb-2">Números</th>
                  <th className="pb-2">Valor</th>
                  <th className="pb-2">Sorteio</th>
                  <th className="pb-2">Compras</th>
                  <th className="pb-2">Situação</th>
                  {podeCriar && <th className="pb-2">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {rifas.map((rifa) => (
                  <tr key={rifa.id} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{rifa.titulo}</td>
                    <td className="py-2">{rifa.quantidadeNumeros}</td>
                    <td className="py-2">{formatarBRL(rifa.precoPorNumero)}</td>
                    <td className="py-2">{rifa.dataSorteio.toLocaleDateString("pt-BR")}</td>
                    <td className="py-2">{rifa._count.compras}</td>
                    <td className="py-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">
                        {rifa.status}
                      </span>
                    </td>
                    {podeCriar && (
                      <td className="py-2">
                        <AcoesRifa
                          id={rifa.id}
                          status={rifa.status}
                          jaSorteada={Boolean(rifa.resultado)}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {podeCriar && <FormRifa />}
    </div>
  );
}
