import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPerfil } from "@/lib/auth";
import { formatarBRL, decimal } from "@/lib/dinheiro";
import { formatarNumero } from "@/lib/rifa";

export const dynamic = "force-dynamic";

export default async function PainelOrganizadora() {
  const sessao = await exigirPerfil("ORGANIZADORA", "OPERADOR");
  if (!sessao) redirect("/entrar");

  const rifas = await prisma.rifa.findMany({
    where: { organizacaoId: sessao.organizacaoId },
    include: {
      resultado: true,
      _count: { select: { compras: true } },
    },
    orderBy: { criadaEm: "desc" },
  });

  const rifaAtiva = rifas.find((r) => r.status === "ABERTA") ?? rifas[0];

  const [comprasPagas, numerosPagos, comissoesPendentes, ultimasCompras] = rifaAtiva
    ? await Promise.all([
        prisma.compra.aggregate({
          where: { rifaId: rifaAtiva.id, status: "PAGA" },
          _sum: { valorTotal: true },
          _count: true,
        }),
        prisma.numero.count({ where: { rifaId: rifaAtiva.id, status: "PAGO" } }),
        prisma.comissao.aggregate({
          where: { status: { in: ["PENDENTE", "APROVADA"] }, afiliado: { organizacaoId: sessao.organizacaoId } },
          _sum: { valor: true },
          _count: true,
        }),
        prisma.compra.findMany({
          where: { rifaId: rifaAtiva.id },
          include: {
            comprador: { select: { nome: true, telefone: true } },
            afiliado: { select: { codigo: true } },
            numeros: { select: { numero: true } },
          },
          orderBy: { criadaEm: "desc" },
          take: 20,
        }),
      ])
    : [null, 0, null, []];

  const arrecadado = comprasPagas?._sum.valorTotal ?? decimal(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Painel da organizadora</h1>
        <form action="/api/auth/logout" method="post">
          <button className="botao-secundario" type="submit">Sair</button>
        </form>
      </div>

      {!rifaAtiva ? (
        <p className="cartao text-slate-600">
          Nenhuma rifa cadastrada ainda. Crie a primeira pela API <code>POST /api/organizadora/rifas</code>.
        </p>
      ) : (
        <>
          <section className="cartao">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{rifaAtiva.titulo}</h2>
                <p className="text-sm text-slate-500">
                  {rifaAtiva.premio} · sorteio em {rifaAtiva.dataSorteio.toLocaleDateString("pt-BR")}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">
                {rifaAtiva.status}
              </span>
            </div>

            {rifaAtiva.resultado && (
              <p className="mt-3 rounded-lg bg-marca-50 px-3 py-2 text-sm text-marca-800">
                Número sorteado:{" "}
                <strong className="font-mono">
                  {formatarNumero(rifaAtiva.resultado.numeroSorteado, rifaAtiva.quantidadeNumeros)}
                </strong>{" "}
                · Loteria Federal concurso {rifaAtiva.resultado.concurso}
              </p>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-4">
            <div className="cartao">
              <p className="text-sm text-slate-500">Arrecadado</p>
              <p className="text-2xl font-bold text-marca-700">{formatarBRL(arrecadado)}</p>
            </div>
            <div className="cartao">
              <p className="text-sm text-slate-500">Compras pagas</p>
              <p className="text-2xl font-bold">{comprasPagas?._count ?? 0}</p>
            </div>
            <div className="cartao">
              <p className="text-sm text-slate-500">Números vendidos</p>
              <p className="text-2xl font-bold">
                {numerosPagos}
                <span className="text-base font-normal text-slate-400">/{rifaAtiva.quantidadeNumeros}</span>
              </p>
            </div>
            <div className="cartao">
              <p className="text-sm text-slate-500">Comissões a repassar</p>
              <p className="text-2xl font-bold text-amber-700">
                {formatarBRL(comissoesPendentes?._sum.valor ?? decimal(0))}
              </p>
              <p className="text-xs text-slate-500">{comissoesPendentes?._count ?? 0} lançamentos</p>
            </div>
          </section>

          <section className="cartao">
            <h2 className="mb-3 text-lg font-semibold">Últimas compras</h2>

            {ultimasCompras.length === 0 ? (
              <p className="text-slate-600">Nenhuma compra ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="pb-2">Código</th>
                      <th className="pb-2">Comprador</th>
                      <th className="pb-2">Números</th>
                      <th className="pb-2">Valor</th>
                      <th className="pb-2">Afiliado</th>
                      <th className="pb-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ultimasCompras.map((compra) => (
                      <tr key={compra.id} className="border-b border-slate-100">
                        <td className="py-2 font-mono">{compra.codigo}</td>
                        <td className="py-2">
                          {compra.comprador.nome}
                          <span className="block text-xs text-slate-400">{compra.comprador.telefone}</span>
                        </td>
                        <td className="py-2 font-mono text-xs">
                          {compra.numeros
                            .map((n) => formatarNumero(n.numero, rifaAtiva.quantidadeNumeros))
                            .join(", ")}
                        </td>
                        <td className="py-2">{formatarBRL(compra.valorTotal)}</td>
                        <td className="py-2 font-mono text-xs">{compra.afiliado?.codigo ?? "—"}</td>
                        <td className="py-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              compra.status === "PAGA"
                                ? "bg-marca-100 text-marca-700"
                                : compra.status === "AGUARDANDO_PAGAMENTO"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {compra.status === "PAGA"
                              ? "Paga"
                              : compra.status === "AGUARDANDO_PAGAMENTO"
                                ? "Aguardando"
                                : "Expirada"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
