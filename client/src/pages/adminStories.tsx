import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { PanelShell } from "@/components/AppShell";
import { Button, Card, Empty } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { LEGENDA_MAX, STORIES_MAX, STORY_HORAS, validarLegenda } from "@shared/vitrine";

interface StoryNoPainel {
  id: string;
  imagem: string;
  legenda: string | null;
  criadoEm: string;
  expiraEm: string;
  rifa: { slug: string; premio: string } | null;
  organizacao: string;
}

interface Campanha {
  campaign: { id: string; prizeTitle: string; status: string; organizationId: string };
}

const IMAGEM_MAX = 5 * 1024 * 1024;

const faltam = (iso: string) => {
  const h = Math.max(0, (new Date(iso).getTime() - Date.now()) / 3_600_000);
  return h >= 1 ? `some em ${Math.floor(h)} h` : `some em ${Math.max(1, Math.round(h * 60))} min`;
};

/**
 * Stories da organização: uma imagem em pé (9:16) que aparece para quem
 * segue, no topo da vitrine e no anel da foto do perfil, e some em 24 h.
 * Pode levar para uma rifa publicada da própria organização.
 */
export function AdminStories() {
  const qc = useQueryClient();
  const { data: sessao } = useSession();
  const plataforma = sessao?.role === "admin";
  const { data: lista = [] } = useQuery<StoryNoPainel[]>({ queryKey: ["/api/admin/stories"] });
  const { data: campanhas = [] } = useQuery<Campanha[]>({ queryKey: ["/api/admin/campaigns"] });
  const { data: orgs = [] } = useQuery<{ id: string; name: string; archivedAt: string | null }[]>({
    queryKey: ["/api/admin/organizacoes"],
    enabled: plataforma,
  });

  const [imagem, setImagem] = useState<string | null>(null);
  const [legenda, setLegenda] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [organizacaoId, setOrganizacaoId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  let problema: string | null = null;
  try {
    validarLegenda(legenda);
  } catch (e) {
    problema = (e as Error).message;
  }

  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/stories"] });
  const postar = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/stories", {
        imagem,
        legenda,
        campaignId: campaignId || null,
        ...(plataforma ? { organizacaoId } : {}),
      }),
    onSuccess: () => {
      setImagem(null);
      setLegenda("");
      setCampaignId("");
      setMsg({ ok: true, texto: "Story publicado. Quem segue já vê o anel aceso." });
      recarregar();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const apagar = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/stories/${id}`),
    onSuccess: recarregar,
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  // Rifa do story: só as públicas da organização escolhida.
  const orgDoStory = plataforma ? organizacaoId : null;
  const rifas = campanhas.filter(
    (c) =>
      ["published", "closed", "drawn"].includes(c.campaign.status) &&
      (!orgDoStory || c.campaign.organizationId === orgDoStory),
  );

  return (
    <PanelShell title="Stories">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card title="Novo story">
          <form
            className="space-y-3 p-4 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              postar.mutate();
            }}
          >
            <div className="flex items-start gap-3">
              <div className="aspect-[9/16] w-28 shrink-0 overflow-hidden rounded-md border border-line bg-mist-2">
                {imagem ? <img src={imagem} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="space-y-2">
                <label className="inline-block cursor-pointer rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold hover:bg-mist">
                  {imagem ? "Trocar imagem" : "Escolher imagem"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setMsg(null);
                      if (!f) return;
                      if (f.size > IMAGEM_MAX) return setMsg({ ok: false, texto: "A imagem passa de 5 MB." });
                      const r = new FileReader();
                      r.onload = () => setImagem(String(r.result));
                      r.readAsDataURL(f);
                    }}
                  />
                </label>
                <p className="text-[11px] text-muted">
                  Em pé (9 por 16, recortada em <span className="tnum">1080 × 1920</span>). Some em{" "}
                  <span className="tnum">{STORY_HORAS}</span> h. Até <span className="tnum">{STORIES_MAX}</span> no ar.
                </p>
              </div>
            </div>

            {plataforma ? (
              <div>
                <label htmlFor="story-org" className="label-xs">Organização</label>
                <select
                  id="story-org"
                  value={organizacaoId}
                  onChange={(e) => {
                    setOrganizacaoId(e.target.value);
                    setCampaignId("");
                  }}
                  className="mt-1 w-full rounded-md border border-line-2 px-2 py-1.5"
                >
                  <option value="">Escolha…</option>
                  {orgs
                    .filter((o) => !o.archivedAt)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </div>
            ) : null}

            <div>
              <label htmlFor="story-legenda" className="label-xs">Legenda (opcional)</label>
              <input
                id="story-legenda"
                value={legenda}
                maxLength={LEGENDA_MAX + 20}
                onChange={(e) => setLegenda(e.target.value)}
                className="mt-1 w-full rounded-md border border-line-2 px-3 py-1.5"
              />
              <p className={`tnum text-right text-[11px] ${problema ? "text-red" : "text-muted"}`}>
                {legenda.trim().length}/{LEGENDA_MAX}
              </p>
            </div>

            <div>
              <label htmlFor="story-rifa" className="label-xs">Leva para a rifa (opcional)</label>
              <select
                id="story-rifa"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="mt-1 w-full rounded-md border border-line-2 px-2 py-1.5"
              >
                <option value="">Nenhuma</option>
                {rifas.map((c) => (
                  <option key={c.campaign.id} value={c.campaign.id}>
                    {c.campaign.prizeTitle}
                  </option>
                ))}
              </select>
            </div>

            {msg ? (
              <p className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
            ) : null}
            <Button
              type="submit"
              disabled={!imagem || Boolean(problema) || postar.isPending || (plataforma && !organizacaoId)}
            >
              {postar.isPending ? "Publicando…" : "Publicar story"}
            </Button>
          </form>
        </Card>

        <Card
          title="No ar agora"
          right={<span className="tnum text-xs text-muted">{lista.length}</span>}
        >
          {lista.length === 0 ? <Empty>Nenhum story no ar.</Empty> : null}
          <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            {lista.map((s) => (
              <li key={s.id} className="space-y-1 text-xs">
                <div className="relative aspect-[9/16] overflow-hidden rounded-md border border-line bg-mist-2">
                  <img src={s.imagem} alt={s.legenda ?? "Story"} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Apagar este story"
                    onClick={() => {
                      if (window.confirm("Apagar este story? Ele some para todo mundo na hora.")) apagar.mutate(s.id);
                    }}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-branco hover:bg-black/80"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
                {plataforma ? <p className="truncate font-semibold">{s.organizacao}</p> : null}
                {s.legenda ? <p className="line-clamp-2 text-ink-2">{s.legenda}</p> : null}
                {s.rifa ? <p className="truncate text-muted">→ {s.rifa.premio}</p> : null}
                <p className="tnum text-muted">{faltam(s.expiraEm)}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PanelShell>
  );
}
