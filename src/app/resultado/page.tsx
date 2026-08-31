import { prisma } from "@/lib/prisma";
import { formatarNumero } from "@/lib/rifa";

export const dynamic = "force-dynamic";

export default async function PaginaResultado() {
  const resultados = await prisma.resultado.findMany({
    include: { rifa: { select: { titulo: true, premio: true, quantidadeNumeros: true } } },
    orderBy: { publicadoEm: "desc" },
    take: 10,
  });

  if (resultados.length === 0) {
    return (
      <div className="cartao text-center">
        <h1 className="text-xl font-bold">Nenhum resultado publicado ainda</h1>
        <p className="mt-2 text-slate-600">
          Assim que o sorteio acontecer, o número vencedor aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Resultados</h1>

      {resultados.map((resultado) => (
        <div key={resultado.id} className="cartao">
          <h2 className="text-lg font-semibold">{resultado.rifa.titulo}</h2>
          <p className="text-slate-600">{resultado.rifa.premio}</p>

          <div className="mt-4 flex items-center gap-4">
            <span className="rounded-xl bg-marca-600 px-5 py-3 font-mono text-3xl font-bold text-white">
              {formatarNumero(resultado.numeroSorteado, resultado.rifa.quantidadeNumeros)}
            </span>
            <div className="text-sm text-slate-600">
              <p>
                Loteria Federal, concurso <strong>{resultado.concurso}</strong>
              </p>
              <p>Apuração em {resultado.dataApuracao.toLocaleDateString("pt-BR")}</p>
            </div>
          </div>

          {resultado.observacao && (
            <p className="mt-3 text-sm text-slate-600">{resultado.observacao}</p>
          )}

          <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
            O número vencedor corresponde aos últimos dígitos do 1º prêmio da Loteria Federal do
            concurso indicado, conferível no site da Caixa Econômica Federal.
          </p>
        </div>
      ))}
    </div>
  );
}
