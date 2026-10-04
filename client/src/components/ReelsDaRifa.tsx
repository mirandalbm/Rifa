import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { LEGENDA_MAX, duracao } from "@shared/publicacao";
import { REELS_POR_RIFA } from "@shared/reels";

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
  const [legenda, setLegenda] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const cheio = reels.length >= REELS_POR_RIFA;

  async function enviar(file: File) {
    setErro(null);
    setEnviando(true);
    try {
      const ticket = (await (
        await apiRequest("POST", `${chave}/upload-url`, { role: "reels", filename: file.name, mime: file.type, bytes: file.size })
      ).json()) as { url: string; storageKey: string; headers: Record<string, string> };
      const put = await fetch(ticket.url, { method: "PUT", headers: ticket.headers, body: file, credentials: "include" });
      if (!put.ok) throw new Error("Falha ao enviar o vídeo.");
      await apiRequest("POST", chave, { role: "reels", storageKey: ticket.storageKey, mime: file.type, legenda });
      setLegenda("");
      await qc.invalidateQueries({ queryKey: [chave] });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
      if (arquivo.current) arquivo.current.value = "";
    }
  }

  return (
    <Card title="Reels da rifa">
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted">
          Vídeo que aparece <strong>só no Reels</strong>, fora do carrossel da publicação, e leva a quem assiste até a rifa. Em pé (9 por 16), até 3 minutos,
          MP4 ou MOV. Até <span className="tnum">{REELS_POR_RIFA}</span> por rifa. Duração e tamanho são medidos no servidor.
        </p>
        {erro ? (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
            {erro}
          </p>
        ) : null}
        {cheio ? (
          <p className="text-xs text-muted">
            Esta rifa já tem <span className="tnum">{REELS_POR_RIFA}</span> vídeos no Reels. Apague um para publicar outro.
          </p>
        ) : (
          <div className="space-y-2">
            <label className="block">
              <span className="label-xs">Legenda do vídeo (opcional)</span>
              <textarea
                className="campo mt-1"
                rows={2}
                maxLength={LEGENDA_MAX}
                value={legenda}
                onChange={(e) => setLegenda(e.target.value)}
                placeholder="Sem link e sem telefone"
              />
            </label>
            <label className="relative inline-flex cursor-pointer items-center rounded-full bg-green px-4 py-2 text-sm font-semibold text-white focus-within:ring-2 focus-within:ring-green">
              {enviando ? "Enviando…" : "Publicar vídeo no Reels"}
              <input
                ref={arquivo}
                type="file"
                accept="video/mp4,video/quicktime"
                disabled={enviando}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void enviar(f);
                }}
              />
            </label>
          </div>
        )}
        {reels.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-2 px-3 py-3 text-center text-xs text-muted">Nenhum vídeo no Reels ainda.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {reels.map((r) => (
              <ItemDoReels key={r.id} reels={r} aoMudar={() => qc.invalidateQueries({ queryKey: [chave] })} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function ItemDoReels({ reels, aoMudar }: { reels: Reels; aoMudar: () => void }) {
  const [texto, setTexto] = useState(reels.legenda ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const mudou = texto !== (reels.legenda ?? "");

  async function agir(fazer: () => Promise<unknown>) {
    setErro(null);
    setOcupado(true);
    try {
      await fazer();
      aoMudar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <li className="min-w-0 space-y-2 rounded-md border border-line p-3">
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
        <Button
          variant="ghost"
          className="px-3 py-1 text-xs"
          disabled={ocupado}
          onClick={() => {
            if (window.confirm("Apagar este vídeo do Reels?")) void agir(() => apiRequest("DELETE", `/api/admin/media/${reels.id}`));
          }}
        >
          Apagar
        </Button>
      </div>
    </li>
  );
}
