import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { lerSessaoApostador } from "@/lib/auth";
import { formatarBRL } from "@/lib/dinheiro";
import { formatarNumero } from "@/lib/rifa";

export const dynamic = "force-dynamic";

const ROTULO: Record<string, { texto: string; classe: string }> = {
  PAGA: { texto: "Paga", classe: "bg-marca-50 text-marca-700" },
  AGUARDANDO_PAGAMENTO: { texto: "Aguardando pagamento", classe: "bg-amber-50 text-amber-700" },
  EXPIRADA: { texto: "Expirada", classe: "bg-slate-100 text-slate-500" },
  CANCELADA: { texto: "Cancelada", classe: "bg-slate-100 text-slate-500" },
};

export default async function PaginaMinhaConta() {
  const sessao = await lerSessaoApostador();
  if (!sessao) redirect("/apostador");

  const compras = await prisma.compra.findMany({
    where: { contaId: sessao.contaId },
    include: {
      numeros: { select: { numero: true }, orderBy: { numero: "asc" } },
      rifa: {
        select: {
          titulo: true,
          premio: true,
          quantidadeNumeros: true,
          dataSorteio: true,
          resultado: { select: { numeroSorteado: true, compraVencedora: true } },
        },
      },
    },
    orderBy: { criadaEm: "desc" },
  });

  const pagas = compras.filter((c) => c.status === "PAGA");
  const totalInvestido = pagas.reduce((soma, c) => soma + Number(c.valorTotal), 0);
  const numerosAtivos = pagas.reduce((soma, c) => soma + c.numeros.length, 0);
  const premiadas = pagas.filter((c) => c.rifa.resultado?.compraVencedora === c.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Olá, {sessao.nome.split(" ")[0]}</h1>
          <p className="text-slate-600">Seus números e compras.</p>
        </div>
        <form action="/api/apostador/sair" method="post">
          <button className="botao-secundario" type="submit">Sair</button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="cartao">
          <p className="text-sm text-slate-500">Números ativos</p>
          <p className="text-2xl font-bold text-marca-700">{numerosAtivos}</p>
        </div>
        <div className="cartao">
          <p className="text-sm text-slate-500">Total investido</p>
          <p className="text-2xl font-bold">{formatarBRL(totalInvestido.toFixed(2))}</p>
        </div>
        <div className="cartao">
          <p className="text-sm text-slate-500">Prêmios ganhos</p>
          <p className="text-2xl font-bold text-marca-700">{premiadas.length}</p>
        </div>
      </div>

      {compras.length === 0 ? (
        <div className="cartao text-center">
          <p className="text-slate-600">Você ainda não comprou nenhum número.</p>
          <Link href="/" className="botao mt-3 inline-block">Ver rifas abertas</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {compras.map((compra) => {
            const ganhou = compra.rifa.resultado?.compraVencedora === compra.id;
            const rotulo = ROTULO[compra.status] ?? { texto: compra.status, classe: "bg-slate-100" };

            return (
              <section key={compra.id} className="cartao">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{compra.rifa.titulo}</h2>
                    <p className="text-sm text-slate-600">{compra.rifa.premio}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${rotulo.classe}`}>
                    {rotulo.texto}
                  </span>
                </div>

                {ganhou && (
                  <p className="mt-3 rounded-lg bg-marca-50 px-3 py-2 font-medium text-marca-800">
                    🎉 Você ganhou esta rifa! Entre em contato com a organização.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {compra.numeros.map((n) => {
                    const premiado = compra.rifa.resultado?.numeroSorteado === n.numero;
                    return (
                      <span
                        key={n.numero}
                        className={`rounded-md px-2 py-1 font-mono text-sm ${
                          premiado ? "bg-marca-600 text-white" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {formatarNumero(n.numero, compra.rifa.quantidadeNumeros)}
                      </span>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-sm text-slate-500">
                  <span>
                    Código <span className="font-mono text-slate-700">{compra.codigo}</span>
                  </span>
                  <span>{formatarBRL(compra.valorTotal)}</span>
                  <span>Sorteio em {compra.rifa.dataSorteio.toLocaleDateString("pt-BR")}</span>
                </div>

                {compra.status === "AGUARDANDO_PAGAMENTO" && (
                  <Link href={`/pagamento/${compra.id}`} className="botao mt-3 inline-block">
                    Concluir pagamento
                  </Link>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
