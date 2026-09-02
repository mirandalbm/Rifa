import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPerfil } from "@/lib/auth";
import { decimal, formatarBRL } from "@/lib/dinheiro";
import FormAfiliado from "@/components/FormAfiliado";
import PagarComissoes from "@/components/PagarComissoes";

export const dynamic = "force-dynamic";

export default async function PaginaAfiliados() {
  const sessao = await exigirPerfil("ORGANIZADORA", "OPERADOR");
  if (!sessao) redirect("/entrar");

  const afiliados = await prisma.afiliado.findMany({
    where: { organizacaoId: sessao.organizacaoId },
    include: {
      usuario: { select: { nome: true, email: true, ativo: true } },
      comissoes: { select: { id: true, valor: true, status: true } },
      _count: { select: { compras: true } },
    },
    orderBy: { criadoEm: "desc" },
  });

  const podeGerir = sessao.perfil === "ORGANIZADORA";

  const linhas = afiliados.map((afiliado) => {
    const pendentes = afiliado.comissoes.filter((c) => c.status !== "PAGA" && c.status !== "CANCELADA");
    const aReceber = pendentes.reduce((soma, c) => soma.add(decimal(c.valor)), decimal(0));
    const recebido = afiliado.comissoes
      .filter((c) => c.status === "PAGA")
      .reduce((soma, c) => soma.add(decimal(c.valor)), decimal(0));

    return { afiliado, pendentes, aReceber, recebido };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Afiliados</h1>

      <section className="cartao">
        <h2 className="mb-1 text-lg font-semibold">Afiliados cadastrados</h2>
        <p className="mb-3 text-sm text-slate-600">
          O afiliado divulga pelo link de indicação. O pagamento do comprador vai sempre para a conta
          da organização — o repasse da comissão é feito por você e fica registrado aqui.
        </p>

        {linhas.length === 0 ? (
          <p className="text-slate-600">Nenhum afiliado cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2">Afiliado</th>
                  <th className="pb-2">Código</th>
                  <th className="pb-2">Comissão</th>
                  <th className="pb-2">Vendas</th>
                  <th className="pb-2">A repassar</th>
                  <th className="pb-2">Já repassado</th>
                  {podeGerir && <th className="pb-2">Ação</th>}
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ afiliado, pendentes, aReceber, recebido }) => (
                  <tr key={afiliado.id} className="border-b border-slate-100">
                    <td className="py-2">
                      {afiliado.usuario.nome}
                      <span className="block text-xs text-slate-400">{afiliado.usuario.email}</span>
                    </td>
                    <td className="py-2 font-mono text-xs">{afiliado.codigo}</td>
                    <td className="py-2">{afiliado.percentualComissao.toString()}%</td>
                    <td className="py-2">{afiliado._count.compras}</td>
                    <td className="py-2 font-medium text-amber-700">{formatarBRL(aReceber)}</td>
                    <td className="py-2 text-marca-700">{formatarBRL(recebido)}</td>
                    {podeGerir && (
                      <td className="py-2">
                        {pendentes.length > 0 ? (
                          <PagarComissoes
                            comissaoIds={pendentes.map((c) => c.id)}
                            nome={afiliado.usuario.nome}
                            valor={formatarBRL(aReceber)}
                            chavePix={afiliado.chavePixRecebimento}
                          />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {podeGerir && <FormAfiliado />}
    </div>
  );
}
