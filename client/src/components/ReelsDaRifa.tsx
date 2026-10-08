import { useRef, useState, type ReactNode } from "react";
import { Clock, Film, Play, Plus, Smartphone, Type } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { LEGENDA_MAX, duracao } from "@shared/publicacao";
import { REELS_POR_RIFA } from "@shared/reels";
import { CriarReels, VerReels } from "@/components/CriarReels";
import { EscolherCapa } from "@/components/EscolherCapa";
import { CortarVideo } from "@/components/CortarVideo";
import { enviarReels } from "@/lib/enviarReels";
import { useNoComputador } from "@/lib/largura";

interface Reels {
  id: string;
  role: string;
  url: string;
  posterUrl: string | null;
  durationS: number | null;
  width: number | null;
  height: number | null;
  legenda: string | null;
}

/**
 * O vídeo que a organização publica **só no Reels** (fora do carrossel): em
 * pé, até 3 minutos, com legenda própria, e que leva à rifa. Duração e
 * medidas quem confere é o servidor; aqui a tela só avisa antes.
 */
export function ReelsDaRifa({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const chave = `/api/admin/campaigns/${campaignId}/media`;
  const { data } = useQuery<Reels[]>({ queryKey: [chave] });
  const reels = (data ?? []).filter((m) => m.role === "reels");
  const noComputador = useNoComputador();
  const [legenda, setLegenda] = useState("");
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const cheio = reels.length >= REELS_POR_RIFA;
  const atualizar = () => qc.invalidateQueries({ queryKey: [chave] });
  const doAberto = reels.find((r) => r.id === aberto) ?? null;

  // No computador o envio segue no cartão (legenda e arquivo); no celular e no tablet, a tela cheia.
  async function enviar(file: File) {
    setErro(null);
    setProgresso(0);
    try {
      await enviarReels(campaignId, file, legenda, setProgresso);
      setLegenda("");
      await atualizar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setProgresso(null);
      if (arquivo.current) arquivo.current.value = "";
    }
  }

  return (
    <Card title="Reels da rifa">
      <div className="space-y-4 p-4">
        <p className="text-xs text-muted">
          Vídeo que aparece <strong>só no Reels</strong>, fora do carrossel da publicação, e leva quem assiste até a rifa. Duração e tamanho são medidos no
          servidor.
        </p>
        {/* As regras do vídeo em ícones, não só em texto. */}
        <ul className="flex flex-wrap gap-2" aria-label="Regras do vídeo">
          <Regra icone={<Smartphone size={16} aria-hidden />}>Em pé, 9 por 16</Regra>
          <Regra icone={<Clock size={16} aria-hidden />}>Até 3 minutos</Regra>
          <Regra icone={<Film size={16} aria-hidden />}>MP4 ou MOV</Regra>
        </ul>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Vídeos no Reels</span>
            <span className="tnum font-semibold text-ink">
              {reels.length} de {REELS_POR_RIFA}
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-mist"
            role="progressbar"
            aria-label="Vídeos no Reels"
            aria-valuemin={0}
            aria-valuemax={REELS_POR_RIFA}
            aria-valuenow={reels.length}
          >
            <div className="h-full rounded-full bg-green" style={{ width: `${(reels.length / REELS_POR_RIFA) * 100}%` }} />
          </div>
        </div>
        {erro ? (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
            {erro}
          </p>
        ) : null}
        {!cheio && noComputador ? (
          <label className="block">
            <span className="label-xs">Legenda do próximo vídeo (opcional)</span>
            <textarea
              className="campo mt-1"
              rows={2}
              maxLength={LEGENDA_MAX}
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              placeholder="Sem link e sem telefone"
            />
          </label>
        ) : null}
        {cheio ? (
          <p className="text-xs text-muted">
            Esta rifa já tem <span className="tnum">{REELS_POR_RIFA}</span> vídeos no Reels. Apague um para publicar outro.
          </p>
        ) : null}

        {/* A grade de capas em pé, como no perfil do Instagram; o primeiro quadro é o "novo". */}
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
          {!cheio ? (
            <li>
              {noComputador ? (
                <label className="relative flex aspect-[9/16] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-2 text-center text-xs font-semibold text-muted hover:border-green hover:text-green focus-within:ring-2 focus-within:ring-green">
                  {progresso !== null ? (
                    <span className="tnum text-sm text-green">{Math.round(progresso * 100)}%</span>
                  ) : (
                    <Plus size={28} aria-hidden />
                  )}
                  {progresso !== null ? "Enviando…" : "Novo vídeo"}
                  <input
                    ref={arquivo}
                    type="file"
                    accept="video/mp4,video/quicktime"
                    disabled={progresso !== null}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void enviar(f);
                    }}
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() => setCriando(true)}
                  className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-2 text-xs font-semibold text-muted hover:border-green hover:text-green"
                >
                  <Plus size={28} aria-hidden />
                  Novo vídeo
                </button>
              )}
            </li>
          ) : null}
          {reels.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setAberto(r.id)}
                aria-pressed={noComputador ? aberto === r.id : undefined}
                aria-label={`Abrir o vídeo${r.durationS ? ` de ${duracao(r.durationS)}` : ""}${r.legenda ? `: ${r.legenda.slice(0, 60)}` : ", sem legenda"}`}
                className={`relative block aspect-[9/16] w-full overflow-hidden rounded-lg bg-black ${
                  noComputador && aberto === r.id ? "ring-2 ring-green ring-offset-2" : ""
                }`}
              >
                {r.posterUrl ? (
                  <img src={r.posterUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={r.url} muted playsInline preload="metadata" aria-hidden className="pointer-events-none h-full w-full object-cover" />
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[11px] font-semibold text-branco">
                  <Play size={12} aria-hidden fill="currentColor" />
                  <span className="tnum">{r.durationS ? duracao(r.durationS) : ""}</span>
                </span>
                {r.legenda ? (
                  <span className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-branco" aria-hidden>
                    <Type size={12} />
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        {reels.length === 0 ? <p className="text-center text-xs text-muted">Nenhum vídeo no Reels ainda.</p> : null}
        {noComputador && doAberto ? <ItemDoReels key={doAberto.id} reels={doAberto} aoMudar={atualizar} aoFechar={() => setAberto(null)} /> : null}
      </div>
      {criando ? <CriarReels campanhaInicial={campaignId} onFechar={() => setCriando(false)} onPublicado={() => void atualizar()} /> : null}
      {!noComputador && doAberto ? <VerReels reels={doAberto} onFechar={() => setAberto(null)} aoMudar={() => void atualizar()} /> : null}
    </Card>
  );
}

function Regra({ icone, children }: { icone: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5 rounded-full bg-mist px-3 py-1 text-xs font-semibold text-ink">
      {icone}
      {children}
    </li>
  );
}

function ItemDoReels({ reels, aoMudar, aoFechar }: { reels: Reels; aoMudar: () => void; aoFechar: () => void }) {
  const [texto, setTexto] = useState(reels.legenda ?? "");
  const [capa, setCapa] = useState(false);
  const [corte, setCorte] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const mudou = texto !== (reels.legenda ?? "");

  async function agir(fazer: () => Promise<unknown>): Promise<boolean> {
    setErro(null);
    setOcupado(true);
    try {
      await fazer();
      aoMudar();
      return true;
    } catch (e) {
      setErro((e as Error).message);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="min-w-0 space-y-2 rounded-md border border-line p-3">
      <div className="flex gap-3">
        <video
          src={reels.url}
          poster={reels.posterUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          aria-label="Vídeo do Reels"
          className="h-40 w-auto shrink-0 rounded bg-black"
          style={reels.width && reels.height ? { aspectRatio: `${reels.width} / ${reels.height}` } : undefined}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="tnum text-xs text-muted">{reels.durationS ? duracao(reels.durationS) : ""} · medido no servidor</p>
          <label className="block">
            <span className="label-xs">Legenda</span>
            <textarea className="campo mt-1" rows={3} maxLength={LEGENDA_MAX} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
        </div>
      </div>
      {erro ? (
        <p role="alert" className="text-xs text-red">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          className="px-3 py-1 text-xs"
          disabled={!mudou || ocupado}
          onClick={() => agir(() => apiRequest("PUT", `/api/admin/media/${reels.id}/legenda`, { legenda: texto }))}
        >
          Salvar legenda
        </Button>
        {reels.durationS ? (
          <Button variant="ghost" className="px-3 py-1 text-xs" disabled={ocupado} onClick={() => setCapa(true)}>
            Escolher a capa
          </Button>
        ) : null}
        {reels.durationS ? (
          <Button variant="ghost" className="px-3 py-1 text-xs" disabled={ocupado} onClick={() => setCorte(true)}>
            Cortar
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="px-3 py-1 text-xs"
          disabled={ocupado}
          onClick={() => {
            if (window.confirm("Apagar este vídeo do Reels?"))
              void agir(() => apiRequest("DELETE", `/api/admin/media/${reels.id}`)).then((ok) => ok && aoFechar());
          }}
        >
          Apagar
        </Button>
        <Button variant="ghost" className="ml-auto px-3 py-1 text-xs" onClick={aoFechar}>
          Fechar
        </Button>
      </div>
      {capa && reels.durationS ? (
        <EscolherCapa
          mediaId={reels.id}
          url={reels.url}
          poster={reels.posterUrl}
          durationS={reels.durationS}
          onFechar={() => setCapa(false)}
          aoEscolher={aoMudar}
        />
      ) : null}
      {corte && reels.durationS ? (
        <CortarVideo
          mediaId={reels.id}
          url={reels.url}
          poster={reels.posterUrl}
          durationS={reels.durationS}
          onFechar={() => setCorte(false)}
          aoCortar={aoMudar}
        />
      ) : null}
    </div>
  );
}
