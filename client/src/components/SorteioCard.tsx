import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, PlayCircle, XCircle } from "lucide-react";
import { Button, Card } from "@/components/bits";
import { conferirSorteio, type Conferencia } from "@shared/sorteio";

interface Sorteio {
  drawAt: string | null;
  seedHash: string | null;
  totalQuotas: number;
  transmissaoUrl: string | null;
  realizado: boolean;
  resultNumber?: number;
  numero?: string;
  federalContest?: number | null;
  federalPrizes?: string[] | null;
  seed?: string;
  executedAt?: string;
  evidenceUrl?: string | null;
}

/**
 * O sorteio na página da rifa. Antes: o link da live, se houver. Depois: o
 * número, a Federal, a semente — e o botão que refaz a conta aqui mesmo, no
 * aparelho de quem olha (`conferirSorteio`), sem confiar no servidor.
 */
export function SorteioCard({ slug }: { slug: string }) {
  const { data } = useQuery<Sorteio>({ queryKey: [`/api/public/campaigns/${slug}/sorteio`] });
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);

  if (!data) return null;
  const video = data.transmissaoUrl ?? data.evidenceUrl ?? null;

  if (!data.realizado) {
    if (!data.transmissaoUrl) return null;
    return (
      <a
        href={data.transmissaoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-mist px-4 py-3 text-sm hover:bg-mist-2"
      >
        <PlayCircle size={22} aria-hidden className="shrink-0 text-red" />
        <span>
          <strong className="block">Assista ao sorteio</strong>
          <span className="tnum text-xs text-muted">
            {data.drawAt ? new Date(data.drawAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "ao vivo"}
          </span>
        </span>
      </a>
    );
  }

  const conferir = async () => {
    setConferindo(true);
    setErro(null);
    try {
      setConf(
        await conferirSorteio({
          seed: data.seed!,
          seedHash: data.seedHash!,
          federalPrizes: data.federalPrizes!,
          totalQuotas: data.totalQuotas,
          resultNumber: data.resultNumber!,
        }),
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setConferindo(false);
    }
  };

  return (
    <Card title="Resultado do sorteio">
      <div className="space-y-3 p-4 text-sm">
        <div className="text-center">
          <p className="label-xs">número sorteado</p>
          <p className="tnum font-display text-4xl font-extrabold text-yellow-deep">{data.numero}</p>
          <p className="tnum text-xs text-muted">
            {data.federalContest ? `Loteria Federal, concurso ${data.federalContest}` : "Loteria Federal"}
            {data.executedAt ? ` · ${new Date(data.executedAt).toLocaleDateString("pt-BR")}` : ""}
          </p>
        </div>
        {video ? (
          <a
            href={video}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-md border border-line-2 px-3 py-2 hover:bg-mist"
          >
            <PlayCircle size={18} aria-hidden /> Ver o vídeo do sorteio
          </a>
        ) : null}

        <details className="rounded-md bg-mist px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold">Como conferir</summary>
          <dl className="mt-2 space-y-1 break-all text-xs">
            <div>
              <dt className="label-xs">5 prêmios da Federal</dt>
              <dd className="tnum">{data.federalPrizes?.join(" · ")}</dd>
            </div>
            <div>
              <dt className="label-xs">resumo publicado antes da 1ª venda</dt>
              <dd className="tnum">{data.seedHash}</dd>
            </div>
            <div>
              <dt className="label-xs">semente (publicada depois do sorteio)</dt>
              <dd className="tnum">{data.seed}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-muted">
            SHA-256 da semente tem de dar o resumo. O número é HMAC-SHA256(semente, "prêmios:contador"),
            reduzido ao total de cotas sem viés — a conta está no regulamento.
          </p>
        </details>

        <Button variant="ghost" className="w-full" onClick={conferir} disabled={conferindo}>
          {conferindo ? "Conferindo…" : "Conferir o sorteio neste aparelho"}
        </Button>
        {conf ? (
          <ul className="space-y-1 text-xs">
            <Linha ok={conf.hashConfere} texto={conf.hashConfere ? "A semente bate com o resumo publicado antes da 1ª venda." : "A semente NÃO bate com o resumo publicado."} />
            <Linha
              ok={conf.numeroConfere}
              texto={conf.numeroConfere ? `A conta dá ${data.numero}, o número anunciado.` : `A conta dá ${conf.numero}, diferente do anunciado.`}
            />
          </ul>
        ) : null}
        {erro ? <p className="text-xs text-red">{erro}</p> : null}
      </div>
    </Card>
  );
}

function Linha({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className={`flex items-start gap-1.5 ${ok ? "text-green-deep" : "text-red"}`}>
      {ok ? <CheckCircle2 size={14} aria-hidden className="mt-[1px] shrink-0" /> : <XCircle size={14} aria-hidden className="mt-[1px] shrink-0" />}
      <span>{texto}</span>
    </li>
  );
}
