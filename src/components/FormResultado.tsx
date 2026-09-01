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

export default function FormResultado({ rifas }: { rifas: Rifa[] }) {
  const [rifaId, setRifaId] = useState(rifas[0]?.id ?? "");
  const [primeiroPremio, setPrimeiroPremio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [publicado, setPublicado] = useState<Publicado | null>(null);

  const rifa = rifas.find((r) => r.id === rifaId);

  // Prévia local do número vencedor, calculada da mesma forma que o servidor.
  // Serve para conferência antes de confirmar — quem decide é o servidor.
  const previa = useMemo(() => {
    if (!rifa) return null;
    const digitos = primeiroPremio.replace(/\D/g, "");
    if (digitos.length === 0) return null;

    const casas = String(rifa.quantidadeNumeros - 1).length;
    const sufixo = digitos.slice(-casas).padStart(casas, "0");
    return String(Number(sufixo) % rifa.quantidadeNumeros).padStart(casas, "0");
  }, [primeiroPremio, rifa]);

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

    const resposta = await fetch("/api/organizadora/resultado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...dados, observacao: dados.observacao || null }),
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
          Informe o 1º prêmio do concurso. O número vencedor é derivado dele — você não escolhe o
          número, e por isso qualquer participante pode conferir a apuração no site da Caixa.
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

        <div>
          <label className="rotulo" htmlFor="primeiroPremio">1º prêmio</label>
          <input
            id="primeiroPremio"
            name="primeiroPremio"
            className="campo font-mono"
            required
            placeholder="Ex.: 47382"
            value={primeiroPremio}
            onChange={(e) => setPrimeiroPremio(e.target.value)}
          />
        </div>

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
