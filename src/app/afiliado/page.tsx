import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPerfil } from "@/lib/auth";
import { formatarBRL, decimal } from "@/lib/dinheiro";
import CopiarLink from "@/components/CopiarLink";

export const dynamic = "force-dynamic";

export default async function PainelAfiliado() {
  const sessao = await exigirPerfil("AFILIADO");
  if (!sessao) redirect("/entrar");

  const afiliado = await prisma.afiliado.findUnique({
    where: { usuarioId: sessao.usuarioId },
    include: {
      comissoes: {
        include: { compra: { select: { codigo: true, valorTotal: true, pagaEm: true } } },
        orderBy: { criadaEm: "desc" },
        take: 50,
      },
    },
  });

  if (!afiliado) redirect("/entrar");

  const vendasPagas = await prisma.compra.count({
    where: { afiliadoId: afiliado.id, status: "PAGA" },
  });

  const totais = afiliado.comissoes.reduce(
    (acumulado, comissao) => {
      const valor = decimal(comissao.valor);
      if (comissao.status === "PAGA") acumulado.recebido = acumulado.recebido.add(valor);
      else acumulado.aReceber = acumulado.aReceber.add(valor);
      return acumulado;
    },
    { recebido: decimal(0), aReceber: decimal(0) },
  );

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const linkIndicacao = `${base}/?ref=${afiliado.codigo}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Olá, {sessao.nome}</h1>
        <form action="/api/auth/logout" method="post">
          <button className="botao-secundario" type="submit">Sair</button>
        </form>
      </div>

      <section className="cartao">
        <h2 className="text-lg font-semibold">Seu link de indicação</h2>
        <p className="mt-1 text-sm text-slate-600">
          Toda compra feita por este link entra como sua venda. O pagamento vai direto para a conta
          da organização — você não recebe dinheiro do comprador.
        </p>
        <CopiarLink link={linkIndicacao} codigo={afiliado.codigo} />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="cartao">
          <p className="text-sm text-slate-500">Vendas confirmadas</p>
          <p className="text-2xl font-bold">{vendasPagas}</p>
        </div>
        <div className="cartao">
          <p className="text-sm text-slate-500">Comissão a receber</p>
          <p className="text-2xl font-bold text-amber-700">{formatarBRL(totais.aReceber)}</p>
        </div>
        <div className="cartao">
          <p className="text-sm text-slate-500">Comissão já recebida</p>
          <p className="text-2xl font-bold text-marca-700">{formatarBRL(totais.recebido)}</p>
        </div>
      </section>

      <section className="cartao">
        <h2 className="mb-3 text-lg font-semibold">
          Suas comissões ({afiliado.percentualComissao.toString()}% por venda)
        </h2>

        {afiliado.comissoes.length === 0 ? (
          <p className="text-slate-600">Nenhuma venda confirmada ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-2">Compra</th>
                <th className="pb-2">Valor da venda</th>
                <th className="pb-2">Sua comissão</th>
                <th className="pb-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {afiliado.comissoes.map((comissao) => (
                <tr key={comissao.id} className="border-b border-slate-100">
                  <td className="py-2 font-mono">{comissao.compra.codigo}</td>
                  <td className="py-2">{formatarBRL(comissao.compra.valorTotal)}</td>
                  <td className="py-2 font-medium">{formatarBRL(comissao.valor)}</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        comissao.status === "PAGA"
                          ? "bg-marca-100 text-marca-700"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {comissao.status === "PAGA" ? "Paga" : "A receber"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
