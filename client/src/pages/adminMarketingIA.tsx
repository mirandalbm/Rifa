import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Download, Sparkles } from "lucide-react";
import { PanelShell } from "@/components/AppShell";
import { Card, Empty, Pill } from "@/components/bits";
import { ArtesParaDivulgar } from "@/components/ArtesParaDivulgar";
import { ReelsDaRifa } from "@/components/ReelsDaRifa";
import { apiRequest } from "@/lib/queryClient";
import { ROTULO_DA_ARTE, type TipoDeArte } from "@shared/artes";
import type { SessaoDaIA } from "@shared/ia";
import {
  CAMPOS_DE_ANUNCIO,
  FORMATO_DE,
  LISTA_DE_CAMPOS,
  ONDE_POSTAR,
  type PassoDoPlano,
  type PontoDaLeitura,
  type TextosDeAnuncio,
  type TomDaLeitura,
} from "@shared/marketingIA";

interface Campanha {
  campaign: { id: string; title: string; prizeTitle: string; status: string; travadaEm?: string | null; demonstracao?: boolean };
}

/**
 * Marketing AI (menu Marketing): as ferramentas que criam o material de
 * divulgação de uma rifa num lugar só. "Criativos" junta o que já existia na
 * aba Publicação de cada rifa — artes prontas nos três formatos, o editor de
 * imagem (com as frases sugeridas pelo assistente) e o vídeo gerado com as
 * fotos. As mesmas rotas, o mesmo recorte e as mesmas regras de lá; esta tela
 * só escolhe a rifa.
 *
 * O plano de divulgação e a leitura dos resultados saem dos dados da rifa
 * (`GET /campaigns/:id/marketing`, sem IA e sem crédito); os textos de
 * anúncio vêm do assistente (`POST …/marketing/anuncios`, uma mensagem paga),
 * pela régua de `shared/marketingIA.ts`.
 */
export function AdminMarketingIA() {
  const { data: campanhas } = useQuery<Campanha[]>({ queryKey: ["/api/admin/campaigns"] });
  // As artes só existem para a rifa no ar, de verdade e não travada (a régua de `artesDisponiveis()`).
  const rifas = (campanhas ?? []).filter((c) => c.campaign.status === "published" && !c.campaign.travadaEm && !c.campaign.demonstracao);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const rifa = rifas.find((r) => r.campaign.id === escolhida) ?? rifas[0] ?? null;

  return (
    <PanelShell title="Marketing AI">
      <div className="space-y-3">
        <Card title="Criativos da rifa">
          <div className="space-y-3 px-4 py-3">
            <p className="text-sm text-ink-2">
              Artes prontas com os dados da rifa, o editor de imagem com frases sugeridas pelo assistente e o vídeo em pé gerado com as fotos.
            </p>
            {!campanhas ? (
              <p className="text-sm text-muted">Carregando…</p>
            ) : !rifas.length ? (
              <Empty>Nenhuma rifa no ar. Os criativos aparecem quando a rifa é publicada.</Empty>
            ) : (
              <label className="block max-w-md">
                <span className="label-xs">Rifa</span>
                <select className="campo mt-1" value={rifa?.campaign.id ?? ""} onChange={(e) => setEscolhida(e.target.value)}>
                  {rifas.map((r) => (
                    <option key={r.campaign.id} value={r.campaign.id}>
                      {r.campaign.title || r.campaign.prizeTitle}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </Card>
        {rifa ? (
          <div key={rifa.campaign.id} className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="min-w-0">
              <ArtesParaDivulgar base={`/api/admin/campaigns/${rifa.campaign.id}/artes`} />
            </div>
            <div className="min-w-0">
              <ReelsDaRifa campaignId={rifa.campaign.id} />
            </div>
          </div>
        ) : null}

        {rifa ? <FerramentasDaRifa key={`f-${rifa.campaign.id}`} campaignId={rifa.campaign.id} /> : null}
      </div>
    </PanelShell>
  );
}

interface MarketingDaRifa {
  noAr: boolean;
  artes: TipoDeArte[];
  plano: PassoDoPlano[];
  leitura: PontoDaLeitura[];
}

function FerramentasDaRifa({ campaignId }: { campaignId: string }) {
  const { data, error } = useQuery<MarketingDaRifa>({ queryKey: [`/api/admin/campaigns/${campaignId}/marketing`] });
  if (error) return <p className="text-sm text-red">{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-muted">Carregando…</p>;
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <PlanoDeDivulgacao campaignId={campaignId} plano={data.plano} artes={data.artes} />
      </div>
      <div className="min-w-0 space-y-3">
        <LeituraDosResultados leitura={data.leitura} />
        <TextosDeAnuncio campaignId={campaignId} />
      </div>
    </div>
  );
}

const SEMANA = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
/** "AAAA-MM-DD" (já no fuso de São Paulo) em "qua., 14/10". */
function diaNaTela(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  const semana = SEMANA[new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()];
  return `${semana}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function PlanoDeDivulgacao({ campaignId, plano, artes }: { campaignId: string; plano: PassoDoPlano[]; artes: TipoDeArte[] }) {
  return (
    <Card title="Plano de divulgação">
      <div className="space-y-2 px-4 py-3">
        <p className="text-sm text-ink-2">
          O roteiro de posts até o sorteio, montado com a data e as artes da rifa. Cada dia traz a arte pronta no formato do lugar.
        </p>
        {!plano.length ? (
          <Empty>Sem passos agora: o plano aparece com a rifa no ar.</Empty>
        ) : (
          <ol className="divide-y divide-line" aria-label="Roteiro de posts">
            {plano.map((p) => {
              const formato = FORMATO_DE[p.onde];
              const pronta = artes.includes(p.arte);
              return (
                <li key={p.dia} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
                  <span className="tnum w-full shrink-0 text-xs font-semibold text-ink sm:w-24">{diaNaTela(p.dia)}</span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-sm font-semibold text-ink">
                      {p.titulo} <span className="font-normal text-muted">· {ONDE_POSTAR[p.onde]}</span>
                    </p>
                    <p className="text-xs text-ink-2">{p.porque}</p>
                  </div>
                  {pronta ? (
                    <a
                      href={`/api/admin/campaigns/${campaignId}/artes/${p.arte}?formato=${formato}`}
                      download
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-semibold text-ink-2"
                      aria-label={`Baixar a arte "${ROTULO_DA_ARTE[p.arte]}" para ${ONDE_POSTAR[p.onde]} do dia ${diaNaTela(p.dia)}`}
                    >
                      <Download size={14} aria-hidden /> {ROTULO_DA_ARTE[p.arte]}
                    </a>
                  ) : (
                    <span className="text-[11px] text-muted">A arte aparece no dia</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
}

const TOM: Record<TomDaLeitura, { pill: string; rotulo: string }> = {
  bom: { pill: "paid", rotulo: "Bom sinal" },
  atencao: { pill: "pending", rotulo: "Atenção" },
  info: { pill: "draft", rotulo: "Informação" },
};

function LeituraDosResultados({ leitura }: { leitura: PontoDaLeitura[] }) {
  return (
    <Card title="Leitura dos resultados">
      <div className="space-y-2 px-4 py-3">
        <p className="text-sm text-ink-2">O que as vendas pagas, os canais e as campanhas de tráfego dizem agora. Só os números da rifa — nada estimado além da projeção, que diz que é projeção.</p>
        {!leitura.length ? (
          <Empty>Sem leitura enquanto a rifa não está no ar.</Empty>
        ) : (
          <ul className="space-y-2" aria-label="Leitura dos resultados">
            {leitura.map((p) => (
              <li key={p.titulo} className="rounded-md border border-line p-2.5">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                  <Pill status={TOM[p.tom].pill}>{TOM[p.tom].rotulo}</Pill>
                  {p.titulo}
                </p>
                <p className="mt-1 text-xs text-ink-2">
                  <ComNumeros texto={p.texto} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/** A frase na fonte do texto, e cada número nela (cota, real, percentual) em `tnum`. */
function ComNumeros({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(R\$\s?[\d.,]+|\d[\d.,]*%?)/).map((parte, i) =>
        i % 2 ? (
          <span key={i} className="tnum">
            {parte}
          </span>
        ) : (
          parte
        ),
      )}
    </>
  );
}

function TextosDeAnuncio({ campaignId }: { campaignId: string }) {
  const { data: sessao } = useQuery<SessaoDaIA>({ queryKey: ["/api/ia/sessao"], staleTime: 5 * 60_000 });
  const [pedindo, setPedindo] = useState(false);
  const [textos, setTextos] = useState<TextosDeAnuncio | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function pedir() {
    setPedindo(true);
    setErro(null);
    try {
      const r = await apiRequest("POST", `/api/admin/campaigns/${campaignId}/marketing/anuncios`, {});
      setTextos(((await r.json()) as { textos: TextosDeAnuncio }).textos);
    } catch (e) {
      setTextos(null);
      setErro((e as Error).message);
    } finally {
      setPedindo(false);
    }
  }

  const vazio = textos && LISTA_DE_CAMPOS.every((c) => !textos[c].length);
  const redes = [...new Set(LISTA_DE_CAMPOS.map((c) => CAMPOS_DE_ANUNCIO[c].rede))];
  return (
    <Card title="Textos de anúncio">
      <div className="space-y-2 px-4 py-3">
        <p className="text-sm text-ink-2">
          Títulos e descrições para o Google e para o Instagram e Facebook, no limite de cada rede. Passam pela régua (sem link, sem telefone, sem Pix por fora, sem
          promessa de ganho); leia antes de usar.
        </p>
        {!sessao ? null : !sessao.ligado ? (
          <p className="text-xs text-muted">O assistente de IA não está ligado para esta conta.</p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void pedir()}
              disabled={pedindo}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-semibold text-ink-2 disabled:opacity-50"
            >
              <Sparkles size={14} aria-hidden /> {pedindo ? "Pedindo ao assistente…" : textos ? "Gerar outros textos" : "Gerar com o assistente"}
            </button>
            {sessao.cobrado ? <p className="text-[11px] text-muted">Cada pedido usa créditos do assistente.</p> : null}
          </>
        )}
        <div aria-live="polite" className="space-y-3">
          {erro ? <p className="text-xs text-red">{erro}</p> : null}
          {vazio ? <p className="text-xs text-muted">O assistente não trouxe nada que passe na régua. Peça de novo.</p> : null}
          {textos && !vazio
            ? redes.map((rede) => (
                <section key={rede} aria-label={rede} className="space-y-2">
                  <h3 className="text-sm font-semibold text-ink">{rede}</h3>
                  {LISTA_DE_CAMPOS.filter((c) => CAMPOS_DE_ANUNCIO[c].rede === rede && textos[c].length).map((c) => (
                    <div key={c}>
                      <p className="label-xs">
                        {CAMPOS_DE_ANUNCIO[c].rotulo} (até <span className="tnum">{CAMPOS_DE_ANUNCIO[c].max}</span> caracteres)
                      </p>
                      <ul className="mt-1 space-y-1">
                        {textos[c].map((t) => (
                          <TextoParaCopiar key={t} texto={t} max={CAMPOS_DE_ANUNCIO[c].max} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))
            : null}
        </div>
      </div>
    </Card>
  );
}

function TextoParaCopiar({ texto, max }: { texto: string; max: number }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }
  return (
    <li className="flex items-start gap-2 rounded-md border border-line bg-white px-2.5 py-1.5">
      <span className="min-w-0 flex-1 break-words text-xs text-ink">{texto}</span>
      <span className="tnum shrink-0 text-[11px] text-muted" aria-label={`${texto.length} de ${max} caracteres`}>
        {texto.length}/{max}
      </span>
      <button
        type="button"
        onClick={() => void copiar()}
        className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded text-ink-2"
        aria-label={copiado ? "Copiado" : `Copiar: ${texto}`}
      >
        {copiado ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      </button>
    </li>
  );
}
