"use client";

import { useMemo, useState } from "react";

type Rifa = {
  id: string;
  titulo: string;
  quantidadeNumeros: number;
  dataSorteio: string;
};

type Publicado = {
  numeroSorteado: number;
  vencedor: { nome?: string; codigoCompra?: string } | null;
};

/// Cada prêmio da Federal tem 5 dígitos; rifas maiores que 100 mil precisam de
/// mais de um para que todo número tenha chance de sair.
const DIGITOS_POR_PREMIO = 5;
const ORDINAIS = ["1º", "2º", "3º", "4º", "5º"];

function premiosNecessarios(quantidadeNumeros: number) {
  return Math.ceil(String(quantidadeNumeros - 1).length / DIGITOS_POR_PREMIO);
}

export default function FormResultado({ rifas }: { rifas: Rifa[] }) {
  const [rifaId, setRifaId] = useState(rifas[0]?.id ?? "");
  const [premios, setPremios] = useState<string[]>([""]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [publicado, setPublicado] = useState<Publicado | null>(null);

  const rifa = rifas.find((r) => r.id === rifaId);
  const quantosPremios = rifa ? premiosNecessarios(rifa.quantidadeNumeros) : 1;

  // Prévia local do número vencedor, calculada da mesma forma que o servidor.
  // Serve para conferência antes de confirmar — quem decide é o servidor.
  const previa = useMemo(() => {
    if (!rifa) return null;

    const informados = premios
      .slice(0, quantosPremios)
      .map((premio) => premio.replace(/\D/g, ""));

    if (informados.length < quantosPremios || informados.some((p) => p.length === 0)) return null;

    const casas = String(rifa.quantidadeNumeros - 1).length;
    const combinado = informados
      .map((premio) => premio.slice(-DIGITOS_POR_PREMIO).padStart(DIGITOS_POR_PREMIO, "0"))
      .reverse()
      .join("");

    const sufixo = combinado.slice(-casas).padStart(casas, "0");
    const numero = BigInt(sufixo) % BigInt(rifa.quantidadeNumeros);
    return String(numero).padStart(casas, "0");
  }, [premios, quantosPremios, rifa]);

  async function publicar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!rifa) return;

    const confirmacao =
      `Publicar o resultado da rifa "${rifa.titulo}"?\n\n` +
      `Número sorteado: ${previa}\n\n` +
      "Esta ação é definitiva e fica visível publicamente.";
    if (!window.confirm(confirmacao)) return;

    setEnviando(true);
    setErro(null);

    const dados = Object.fromEntries(new FormData(evento.currentTarget));
    const informados = premios.slice(0, quantosPremios);

    const resposta = await fetch("/api/organizadora/resultado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...dados,
        primeiroPremio: informados[0],
        // Só o 2º em diante; o 1º vai no campo próprio.
        premiosFederal: informados.slice(1),
        observacao: dados.observacao || null,
      }),
    });

    const corpo = await resposta.json();
    setEnviando(false);

    if (!resposta.ok) {
      setErro(corpo.erro ?? "Não foi possível publicar o resultado.");
      return;
    }

    // Sem router.refresh() aqui de propósito: a rifa recém-apurada sai da lista
    // de "aguardando resultado", o componente seria desmontado e a confirmação
    // — que mostra quem ganhou — sumiria da tela no mesmo instante.
    // A tabela de resultados publicados já traz o ganhador na próxima navegação.
    setPublicado(corpo);
  }

  if (publicado) {
    return (
      <div className="cartao">
        <h2 className="text-lg font-semibold text-marca-700">Resultado publicado</h2>
        <p className="mt-2">
          Número sorteado:{" "}
          <strong className="font-mono text-xl">
            {String(publicado.numeroSorteado).padStart(
              String((rifa?.quantidadeNumeros ?? 1000) - 1).length,
              "0",
            )}
          </strong>
        </p>
        {publicado.vencedor ? (
          <p className="mt-2 rounded-lg bg-marca-50 px-3 py-2 text-marca-800">
            Ganhador: <strong>{publicado.vencedor.nome}</strong> — compra{" "}
            <span className="font-mono">{publicado.vencedor.codigoCompra}</span>
          </p>
        ) : (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
            O número sorteado não foi vendido. Siga o que diz o regulamento da rifa para este caso.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={publicar} className="cartao space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Apurar pelo resultado da Loteria Federal</h2>
        <p className="text-sm text-slate-600">
          {quantosPremios === 1 ? (
            <>
              Informe o 1º prêmio do concurso. O número vencedor é derivado dele — você não escolhe
              o número, e por isso qualquer participante pode conferir a apuração no site da Caixa.
            </>
          ) : (
            <>
              Esta rifa tem {rifa?.quantidadeNumeros.toLocaleString("pt-BR")} números, e cada prêmio
              da Federal tem só 5 dígitos. Por isso são necessários{" "}
              <strong>{quantosPremios} prêmios</strong>: o 1º forma as casas finais e os seguintes
              as casas mais altas. Com um prêmio só, os números altos nunca poderiam ser sorteados.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="rifaId">Rifa</label>
          <select
            id="rifaId"
            name="rifaId"
            className="campo"
            value={rifaId}
            onChange={(e) => setRifaId(e.target.value)}
            required
          >
            {rifas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.titulo} — sorteio em {new Date(r.dataSorteio).toLocaleDateString("pt-BR")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="rotulo" htmlFor="concurso">Concurso da Loteria Federal</label>
          <input id="concurso" name="concurso" className="campo" required placeholder="Ex.: 5920" />
        </div>

        {Array.from({ length: quantosPremios }, (_, indice) => (
          <div key={indice}>
            <label className="rotulo" htmlFor={`premio-${indice}`}>
              {ORDINAIS[indice] ?? `${indice + 1}º`} prêmio
            </label>
            <input
              id={`premio-${indice}`}
              className="campo font-mono"
              required
              inputMode="numeric"
              placeholder="Ex.: 47382"
              value={premios[indice] ?? ""}
              onChange={(e) =>
                setPremios((atual) => {
                  const proximo = [...atual];
                  proximo[indice] = e.target.value;
                  return proximo;
                })
              }
            />
          </div>
        ))}

        <div>
          <label className="rotulo" htmlFor="dataApuracao">Data da apuração</label>
          <input id="dataApuracao" name="dataApuracao" type="date" className="campo" required />
        </div>

        <div>
          <label className="rotulo" htmlFor="observacao">Observação (opcional)</label>
          <input id="observacao" name="observacao" className="campo" />
        </div>
      </div>

      {previa && (
        <div className="rounded-lg border border-marca-200 bg-marca-50 px-4 py-3">
          <p className="text-sm text-marca-800">Número vencedor que será publicado:</p>
          <p className="font-mono text-3xl font-bold text-marca-700">{previa}</p>
          <p className="mt-1 text-xs text-marca-700">
            Confira o 1º prêmio no site da Caixa antes de confirmar.
          </p>
        </div>
      )}

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <button type="submit" className="botao" disabled={enviando || !previa}>
        {enviando ? "Publicando…" : "Publicar resultado"}
      </button>
    </form>
  );
}
