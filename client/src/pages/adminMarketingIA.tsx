import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Download, Sparkles } from "lucide-react";
import { PanelShell } from "@/components/AppShell";
import { Button, Campo, Empty, Pill, TONS_DO_BOTAO } from "@/components/bits";
import { CartaoDoPainel } from "@/components/painel";
import { AbrirEditorDeImagem, ArtesParaDivulgar } from "@/components/ArtesParaDivulgar";
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
      <div className="space-y-4 md:space-y-6">
        <CartaoDoPainel
          titulo="Criativos da rifa"
          subtitulo="Artes prontas com os dados da rifa, o editor de imagem com frases sugeridas pelo assistente e o vídeo em pé gerado com as fotos."
        >
          <div className="px-5 pb-5">
            {!campanhas ? (
              <p className="text-sm text-muted">Carregando…</p>
            ) : !rifas.length ? (
              <Empty>Nenhuma rifa no ar. Os criativos aparecem quando a rifa é publicada.</Empty>
            ) : (
              <Campo rotulo="Rifa" className="max-w-sm">
                <select className="campo" value={rifa?.campaign.id ?? ""} onChange={(e) => setEscolhida(e.target.value)}>
                  {rifas.map((r) => (
                    <option key={r.campaign.id} value={r.campaign.id}>
                      {r.campaign.title || r.campaign.prizeTitle}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
          </div>
        </CartaoDoPainel>
        {rifa ? (
          <div key={rifa.campaign.id} className="grid grid-cols-1 items-start gap-4 md:gap-6 xl:grid-cols-2">
            <div className="min-w-0">
              {/* O mesmo cartão da aba Publicação: o editor e as artes prontas. */}
              <CartaoDoPainel titulo="Artes para divulgar" subtitulo="Prontas nos três formatos, ou monte a sua no editor.">
                <div className="space-y-4 px-5 pb-5">
                  <AbrirEditorDeImagem
                    portas={{
                      dados: `/api/admin/campaigns/${rifa.campaign.id}/editor`,
                      conferir: `/api/admin/campaigns/${rifa.campaign.id}/editor/conferir`,
                      sugerir: `/api/admin/campaigns/${rifa.campaign.id}/sugerir`,
                      artes: `/api/admin/campaigns/${rifa.campaign.id}/artes`,
                      carrossel: `/api/admin/campaigns/${rifa.campaign.id}/media`,
                    }}
                  />
                  <ArtesParaDivulgar base={`/api/admin/campaigns/${rifa.campaign.id}/artes`} />
                </div>
              </CartaoDoPainel>
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
  if (error) return <p role="alert" className="text-sm text-red">{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-muted">Carregando…</p>;
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:gap-6 xl:grid-cols-2">
      <div className="min-w-0 space-y-4 md:space-y-6">
        <PlanoDeDivulgacao campaignId={campaignId} plano={data.plano} artes={data.artes} />
      </div>
      <div className="min-w-0 space-y-4 md:space-y-6">
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
    <CartaoDoPainel titulo="Plano de divulgação" subtitulo="O roteiro de posts até o sorteio, montado com a data e as artes da rifa.">
      <div className="px-5 pb-4">
        {!plano.length ? (
          <Empty>Sem passos agora: o plano aparece com a rifa no ar.</Empty>
        ) : (
          <ol className="divide-y divide-line" aria-label="Roteiro de posts">
            {plano.map((p) => {
              const formato = FORMATO_DE[p.onde];
              const pronta = artes.includes(p.arte);
              return (
                <li key={p.dia} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                  <span className="tnum w-full shrink-0 text-xs text-muted sm:w-24">{diaNaTela(p.dia)}</span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-sm font-semibold text-ink">
                      {p.titulo} <span className="text-xs font-normal text-muted">· {ONDE_POSTAR[p.onde]}</span>
                    </p>
                    <p className="text-xs text-muted">{p.porque}</p>
                  </div>
                  {pronta ? (
                    <a
                      href={`/api/admin/campaigns/${campaignId}/artes/${p.arte}?formato=${formato}`}
                      download
                      className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${TONS_DO_BOTAO.contorno}`}
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
    </CartaoDoPainel>
  );
}

const TOM: Record<TomDaLeitura, { pill: string; rotulo: string }> = {
  bom: { pill: "paid", rotulo: "Bom sinal" },
  atencao: { pill: "pending", rotulo: "Atenção" },
  info: { pill: "draft", rotulo: "Informação" },
};

function LeituraDosResultados({ leitura }: { leitura: PontoDaLeitura[] }) {
  return (
    <CartaoDoPainel titulo="Leitura dos resultados" subtitulo="Só os números da rifa — nada estimado além da projeção, que diz que é projeção.">
      <div className="px-5 pb-5">
        {!leitura.length ? (
          <Empty>Sem leitura enquanto a rifa não está no ar.</Empty>
        ) : (
          <ul className="space-y-2" aria-label="Leitura dos resultados">
            {leitura.map((p) => (
              <li key={p.titulo} className="rounded-lg border border-line p-3">
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
    </CartaoDoPainel>
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
    <CartaoDoPainel
      titulo="Textos de anúncio"
      subtitulo="Títulos e descrições para o Google e para o Instagram e Facebook, no limite de cada rede. Passam pela régua (sem link, sem telefone, sem Pix por fora, sem promessa de ganho); leia antes de usar."
    >
      <div className="space-y-2 px-5 pb-5">
        {!sessao ? null : !sessao.ligado ? (
          <p className="text-xs text-muted">O assistente de IA não está ligado para esta conta.</p>
        ) : (
          <>
            <Button type="button" variant="claro" icone={<Sparkles />} onClick={() => void pedir()} disabled={pedindo}>
              {pedindo ? "Pedindo ao assistente…" : textos ? "Gerar outros textos" : "Gerar com o assistente"}
            </Button>
            {sessao.cobrado ? <p className="text-[11px] text-muted">Cada pedido usa créditos do assistente.</p> : null}
          </>
        )}
        <div aria-live="polite" className="space-y-3">
          {erro ? (
            <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">
              {erro}
            </p>
          ) : null}
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
    </CartaoDoPainel>
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
    <li className="flex items-start gap-2 rounded-lg border border-line bg-white px-3 py-2">
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
