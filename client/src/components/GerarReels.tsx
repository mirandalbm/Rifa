import { useEffect, useRef, useState } from "react";
import { Clapperboard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { LEGENDA_MAX } from "@shared/publicacao";
import { REELS_GERADO_FOTOS_MAX } from "@shared/reelsGerado";
import { SITUACOES_EM_ABERTO, type SituacaoDoTrabalho } from "@shared/fila";

interface Situacao {
  ultimo: { id: string; situacao: SituacaoDoTrabalho; erro: string | null; fotos: number | null; criadoEm: string; terminadoEm: string | null; mediaId: string | null } | null;
  geradorNoAr: boolean;
}

const ROTULO: Record<SituacaoDoTrabalho, string> = {
  pendente: "Na fila",
  executando: "Montando o vídeo",
  pronto: "Quase pronto",
  recebendo: "Quase pronto",
  concluido: "Pronto, no Reels",
  falhou: "Não deu certo",
};

/**
 * "Gerar vídeo com as fotos" (Fase F): o sistema monta um vídeo em pé com as
 * fotos da rifa, o prêmio, o preço e a autorização, e o publica no Reels. O
 * pedido vai para a fila e quem monta é o gerador (um processo à parte); a
 * tela acompanha a situação e diz quando o gerador está parado — nunca
 * promete o que não está acontecendo.
 */
export interface FotoParaOVideo {
  id: string;
  role: string;
  url: string;
}

export function GerarReels({
  campaignId,
  cheio,
  fotos,
  aoFicarPronto,
}: {
  campaignId: string;
  cheio: boolean;
  /** O banner e as fotos do carrossel, prontos, na ordem da rifa. */
  fotos: FotoParaOVideo[];
  aoFicarPronto: () => void;
}) {
  const chave = `/api/admin/campaigns/${campaignId}/reels-gerado`;
  const { data, refetch } = useQuery<Situacao>({
    queryKey: [chave],
    // Enquanto o pedido anda, a tela pergunta a cada 3 s; parado, não pergunta.
    refetchInterval: (q) => {
      const s = (q.state.data as Situacao | undefined)?.ultimo?.situacao;
      return s && SITUACOES_EM_ABERTO.includes(s) ? 3000 : false;
    },
  });
  const [legenda, setLegenda] = useState("");
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // `null` é a escolha de sempre (o banner primeiro, depois o carrossel, até o máximo); o toque faz a escolha e a ordem.
  const [escolha, setEscolha] = useState<string[] | null>(null);
  const idsDasFotos = fotos.map((f) => f.id);
  const padrao = idsDasFotos.slice(0, REELS_GERADO_FOTOS_MAX);
  // A foto apagada depois de escolhida sai da escolha sozinha.
  const escolhidas = escolha ? escolha.filter((id) => idsDasFotos.includes(id)) : padrao;
  const ultimo = data?.ultimo ?? null;
  const emAberto = Boolean(ultimo && SITUACOES_EM_ABERTO.includes(ultimo.situacao));

  // Ficou pronto enquanto a tela olhava: a grade do Reels busca o vídeo novo.
  const antes = useRef<SituacaoDoTrabalho | null>(null);
  useEffect(() => {
    const agora = ultimo?.situacao ?? null;
    if (antes.current && SITUACOES_EM_ABERTO.includes(antes.current) && agora === "concluido") aoFicarPronto();
    antes.current = agora;
  }, [ultimo?.situacao, aoFicarPronto]);

  async function pedir() {
    setPedindo(true);
    setErro(null);
    try {
      await apiRequest("POST", chave, escolha ? { legenda, fotos: escolhidas } : { legenda });
      setLegenda("");
      setEscolha(null);
      await refetch();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setPedindo(false);
    }
  }

  function alternar(id: string) {
    const atual = escolhidas;
    if (atual.includes(id)) setEscolha(atual.filter((x) => x !== id));
    else if (atual.length < REELS_GERADO_FOTOS_MAX) setEscolha([...atual, id]);
  }

  const cheiaDeFotos = escolhidas.length >= REELS_GERADO_FOTOS_MAX;

  return (
    <section className="space-y-3 rounded-lg border border-line p-3" aria-labelledby={`gerar-${campaignId}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-full bg-green-soft p-2 text-green-deep" aria-hidden>
          <Clapperboard size={18} />
        </span>
        <div className="min-w-0">
          <h3 id={`gerar-${campaignId}`} className="text-sm font-semibold text-ink">
            Vídeo com as fotos da rifa
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            O sistema monta um vídeo em pé com até <span className="tnum">{REELS_GERADO_FOTOS_MAX}</span> fotos da rifa, na ordem que você escolher, com o prêmio,
            o preço da cota e a autorização, e publica no Reels. A data do sorteio vai como contagem, que acompanha um adiamento.
          </p>
        </div>
      </div>

      {ultimo ? (
        <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
          <span className="text-muted">Último pedido:</span>
          <Pill status={ultimo.situacao === "falhou" ? "expired" : ultimo.situacao === "concluido" ? "published" : "pending"}>{ROTULO[ultimo.situacao]}</Pill>
          {ultimo.fotos ? (
            <span className="text-muted">
              <span className="tnum">{ultimo.fotos}</span> {ultimo.fotos === 1 ? "foto" : "fotos"}
            </span>
          ) : null}
          {ultimo.situacao === "falhou" && ultimo.erro ? <span className="w-full text-red">{ultimo.erro}</span> : null}
        </div>
      ) : null}
      {emAberto && data && !data.geradorNoAr ? (
        <p className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
          O gerador de vídeo está parado agora. O pedido espera na fila e sai quando ele voltar.
        </p>
      ) : null}

      {!emAberto && !cheio ? (
        <>
          {fotos.length ? (
            <fieldset className="space-y-2">
              <legend className="label-xs">Fotos do vídeo, na ordem do toque</legend>
              <p className="text-xs text-muted">
                Toque para tirar ou pôr uma foto; o número é a ordem em que ela entra (até <span className="tnum">{REELS_GERADO_FOTOS_MAX}</span>).
              </p>
              <ul className="flex flex-wrap gap-2">
                {fotos.map((f, i) => {
                  const ordem = escolhidas.indexOf(f.id);
                  const escolhida = ordem >= 0;
                  const nome = f.role === "banner" ? "Banner" : `Foto ${i + (fotos[0]?.role === "banner" ? 0 : 1)}`;
                  return (
                    <li key={f.id} className="w-16 sm:w-20">
                      <button
                        type="button"
                        onClick={() => alternar(f.id)}
                        disabled={!escolhida && cheiaDeFotos}
                        aria-pressed={escolhida}
                        aria-label={escolhida ? `${nome}: entra em ${ordem + 1}º lugar` : `${nome}: fora do vídeo`}
                        className={`relative block aspect-[9/16] w-full overflow-hidden rounded-md border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green disabled:opacity-40 ${
                          escolhida ? "border-green" : "border-line opacity-60"
                        }`}
                      >
                        <img src={f.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        <span
                          aria-hidden
                          className={`tnum absolute left-1 top-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold ${
                            escolhida ? "bg-green text-on-green" : "bg-white text-muted"
                          }`}
                        >
                          {escolhida ? ordem + 1 : "–"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {escolha ? (
                <button type="button" onClick={() => setEscolha(null)} className="text-xs font-semibold text-green-deep underline underline-offset-2">
                  Voltar à ordem de sempre
                </button>
              ) : null}
              {!escolhidas.length ? <p className="text-xs text-red">Escolha pelo menos uma foto.</p> : null}
            </fieldset>
          ) : null}
          <label className="block">
            <span className="label-xs">Legenda do vídeo (opcional)</span>
            <textarea className="campo mt-1" rows={2} maxLength={LEGENDA_MAX} value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Sem link e sem telefone" />
          </label>
          <Button onClick={() => void pedir()} disabled={pedindo || (escolha !== null && !escolhidas.length)}>
            {pedindo ? "Pedindo…" : "Gerar vídeo com as fotos"}
          </Button>
        </>
      ) : null}
      {erro ? (
        <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
          {erro}
        </p>
      ) : null}
    </section>
  );
}
