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
export function GerarReels({ campaignId, cheio, aoFicarPronto }: { campaignId: string; cheio: boolean; aoFicarPronto: () => void }) {
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
      await apiRequest("POST", chave, { legenda });
      setLegenda("");
      await refetch();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setPedindo(false);
    }
  }

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
            O sistema monta um vídeo em pé com até <span className="tnum">{REELS_GERADO_FOTOS_MAX}</span> fotos (o banner primeiro), com o prêmio, o preço da cota e a
            autorização, e publica no Reels. A data do sorteio vai como contagem, que acompanha um adiamento.
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
          <label className="block">
            <span className="label-xs">Legenda do vídeo (opcional)</span>
            <textarea className="campo mt-1" rows={2} maxLength={LEGENDA_MAX} value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Sem link e sem telefone" />
          </label>
          <Button onClick={() => void pedir()} disabled={pedindo}>
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
