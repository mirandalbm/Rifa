import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, PlayCircle, XCircle } from "lucide-react";
import { Button, Card } from "@/components/bits";
import { REGRA_DA_APROXIMACAO, conferirSorteio, type Conferencia } from "@shared/sorteio";
import { lerFederal } from "@shared/apuracao";

interface Sorteio {
  drawAt: string | null;
  /** O método de apuração: `federal_direta` é a leitura direta (sem semente); nulo é a rifa de antes. */
  metodoApuracao?: string | null;
  seedHash: string | null;
  totalQuotas: number;
  transmissaoUrl: string | null;
  realizado: boolean;
  resultNumber?: number;
  numero?: string;
  /** O número que levou: o sorteado ou, se ele não foi vendido, o mais próximo vendido. */
  contemplado?: string | null;
  aproximacao?: boolean;
  semContemplado?: boolean;
  ficouComPromotora?: boolean;
  federalContest?: number | null;
  /** O resultado oficial: os 5 prêmios da Federal ou as dezenas da loteria. */
  federalPrizes?: string[] | null;
  /** A loteria do resultado (`federal`, `mega_sena`…) e o nome dela. */
  loteria?: string;
  loteriaNome?: string;
  /** "5 prêmios da Federal" / "6 dezenas da Mega-Sena". */
  rotuloDoResultado?: string;
  seed?: string | null;
  /** A leitura direta passo a passo, feita pelo servidor (a tela refaz a conta e compara). */
  leitura?: string[] | null;
  executedAt?: string;
  evidenceUrl?: string | null;
  fotoGanhador?: string | null;
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

  // Leitura direta da Federal: a conta é de papel e caneta, e a tela a refaz
  // aqui mesmo com os 5 prêmios (`lerFederal`), sem confiar no servidor.
  const direta = data.metodoApuracao === "federal_direta";
  let refeita: { passos: string[]; numero: string } | null = null;
  if (direta && data.federalPrizes) {
    try {
      const l = lerFederal(data.federalPrizes, data.totalQuotas);
      refeita = { passos: l.passos, numero: l.numeroTexto };
    } catch {
      refeita = null;
    }
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
          loteria: data.loteria,
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
        {data.fotoGanhador ? (
          <figure className="mx-auto max-w-xs overflow-hidden rounded-xl border border-line">
            <img src={data.fotoGanhador} alt="Foto do ganhador com o prêmio" className="aspect-[4/5] w-full object-cover" />
            <figcaption className="bg-yellow-soft px-3 py-1.5 text-center text-xs font-semibold text-yellow-deep">
              Ganhador
            </figcaption>
          </figure>
        ) : null}
        <div className="text-center">
          <p className="label-xs">{direta ? "número da sorte" : "número sorteado"}</p>
          <p className="tnum font-display text-4xl font-extrabold text-yellow-deep">{data.numero}</p>
          <p className="tnum text-xs text-muted">
            {data.loteriaNome ?? "Loteria Federal"}
            {data.federalContest ? `, concurso ${data.federalContest}` : ""}
            {data.executedAt ? ` · ${new Date(data.executedAt).toLocaleDateString("pt-BR")}` : ""}
          </p>
          {data.aproximacao && data.contemplado ? (
            <div className="mt-3 rounded-md bg-mist px-3 py-2">
              <p className="label-xs">número contemplado</p>
              <p className="tnum font-display text-2xl font-extrabold text-green-deep">{data.contemplado}</p>
              <p className="text-xs text-muted">O número sorteado não foi vendido. {REGRA_DA_APROXIMACAO}</p>
            </div>
          ) : data.ficouComPromotora ? (
            <p className="mt-2 text-xs text-muted">
              O número sorteado não foi vendido e era da promotora, como diz o regulamento: o prêmio fica com ela.
            </p>
          ) : data.semContemplado ? (
            <p className="mt-2 text-xs text-muted">Nenhuma cota foi paga nesta rifa: o sorteio não tem contemplado.</p>
          ) : null}
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

        {direta ? (
          <details open className="rounded-md bg-mist px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold">Como conferir (com papel e caneta)</summary>
            <p className="tnum mt-2 text-xs">
              {data.rotuloDoResultado ?? "5 prêmios da Federal"}: {data.federalPrizes?.join(" · ")}
            </p>
            {refeita ? (
              <>
                <ol className="tnum mt-2 list-decimal space-y-0.5 pl-5 text-xs">
                  {refeita.passos.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
                <ul className="mt-2 text-xs">
                  <Linha
                    ok={refeita.numero === data.numero}
                    texto={
                      refeita.numero === data.numero
                        ? `A leitura feita neste aparelho dá ${refeita.numero}, o número anunciado.`
                        : `A leitura feita neste aparelho dá ${refeita.numero}, diferente do anunciado.`
                    }
                  />
                </ul>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted">Não foi possível refazer a leitura com os prêmios publicados.</p>
            )}
            <p className="mt-2 text-[11px] text-muted">
              As unidades do 1º ao 5º prêmio, de cima para baixo, formam o Número da Sorte — a regra completa está no
              regulamento, item 5.
            </p>
          </details>
        ) : (
          <>
            <details className="rounded-md bg-mist px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold">Como conferir</summary>
              <dl className="mt-2 space-y-1 break-all text-xs">
                <div>
                  <dt className="label-xs">{data.rotuloDoResultado ?? "5 prêmios da Federal"}</dt>
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
                SHA-256 da semente tem de dar o resumo. O número é HMAC-SHA256(semente, "resultado:contador"),
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
          </>
        )}
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
