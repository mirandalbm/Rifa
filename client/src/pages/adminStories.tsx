import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { PanelShell } from "@/components/AppShell";
import { Button, Card, Empty, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import {
  LEGENDA_MAX,
  STORIES_MAX,
  STORY_AGENDA_MAX_DIAS,
  STORY_HORAS,
  STORY_VIDEO_MAX_BYTES,
  STORY_VIDEO_MAX_SEGUNDOS,
  validarLegenda,
} from "@shared/vitrine";
import {
  EMOJIS_DA_FIGURINHA,
  FIGURINHAS_MAX,
  FIGURINHA_TEXTO_MAX,
  POSICOES_HORIZONTAIS,
  POSICOES_VERTICAIS,
  type FigurinhaNaTela,
  type TipoDeFigurinha,
  validarFigurinhas,
} from "@shared/figurinhasStory";
import { ENQUETE_OPCAO_MAX, ENQUETE_OPCOES_MAX, ENQUETE_OPCOES_MIN, ENQUETE_PERGUNTA_MAX, validarEnquete } from "@shared/enqueteStory";

interface StoryNoPainel {
  id: string;
  tipo: "imagem" | "video";
  poster?: string | null;
  imagem: string;
  legenda: string | null;
  criadoEm: string;
  expiraEm: string;
  rifa: { slug: string; premio: string } | null;
  organizacao: string;
  /** Agendado: entra no ar nesta hora (antes disso só o painel vê). */
  agendadoPara: string | null;
  /** Os totais da enquete — nunca quem votou em quê. */
  enquete: { pergunta: string; opcoes: string[]; votos: number[]; total: number; percentuais: number[] } | null;
  /** Só as que a tela mostra agora (o Comprar sai quando a rifa para de vender). */
  figurinhas: FigurinhaNaTela[];
  /** Todas as que foram gravadas, apareçam agora ou não. */
  figurinhasGravadas: TipoDeFigurinha[];
}

interface Campanha {
  campaign: { id: string; prizeTitle: string; status: string; organizationId: string };
}

const IMAGEM_MAX = 5 * 1024 * 1024;

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

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

  // A peça escolhida (imagem ou vídeo), já em data URL.
  const [peca, setPeca] = useState<{ url: string; video: boolean } | null>(null);
  const [legenda, setLegenda] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [organizacaoId, setOrganizacaoId] = useState("");
  // Vazio: publica agora. Preenchido: `datetime-local`, no fuso do aparelho.
  const [publicaEm, setPublicaEm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  // Enquete (opcional): a pergunta e de 2 a 4 opções.
  const [comEnquete, setComEnquete] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [opcoes, setOpcoes] = useState<string[]>(["", ""]);
  // Figurinhas (opcional): até 4, cada uma num ponto da tela.
  const [figurinhas, setFigurinhas] = useState<FigurinhaDoForm[]>([]);

  let problema: string | null = null;
  try {
    validarLegenda(legenda);
  } catch (e) {
    problema = (e as Error).message;
  }
  // A mesma régua do servidor, só para avisar antes; quem decide é ele.
  let problemaNaEnquete: string | null = null;
  if (comEnquete) {
    try {
      validarEnquete({ pergunta, opcoes });
    } catch (e) {
      problemaNaEnquete = (e as Error).message;
    }
  }

  let problemaNasFigurinhas: string | null = null;
  try {
    validarFigurinhas(figurinhas.map(paraEnviar), { temRifa: Boolean(campaignId) });
  } catch (e) {
    problemaNasFigurinhas = (e as Error).message;
  }
  const mudarFigurinha = (k: number, campo: Partial<FigurinhaDoForm>) =>
    setFigurinhas(figurinhas.map((f, j) => (j === k ? { ...f, ...campo } : f)));

  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/stories"] });
  const postar = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/stories", {
        ...(peca?.video ? { video: peca.url } : { imagem: peca?.url }),
        legenda,
        campaignId: campaignId || null,
        // O servidor recebe o instante (ISO, com o fuso), não o texto do campo.
        ...(publicaEm ? { publicaEm: new Date(publicaEm).toISOString() } : {}),
        ...(plataforma ? { organizacaoId } : {}),
        ...(comEnquete ? { enquete: { pergunta, opcoes } } : {}),
        ...(figurinhas.length ? { figurinhas: figurinhas.map(paraEnviar) } : {}),
      }),
    onSuccess: () => {
      setPeca(null);
      setLegenda("");
      setCampaignId("");
      setComEnquete(false);
      setPergunta("");
      setOpcoes(["", ""]);
      setFigurinhas([]);
      setMsg({
        ok: true,
        texto: publicaEm
          ? `Story agendado para ${quando(new Date(publicaEm).toISOString())}. Até lá, só você vê.`
          : "Story publicado. Quem segue já vê o anel aceso.",
      });
      setPublicaEm("");
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
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
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
                {peca?.video ? (
                  <video src={peca.url} muted playsInline loop autoPlay aria-label="Prévia do vídeo" className="h-full w-full object-cover" />
                ) : peca ? (
                  <img src={peca.url} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="inline-block cursor-pointer rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold hover:bg-mist">
                  {peca ? "Trocar" : "Escolher imagem ou vídeo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setMsg(null);
                      if (!f) return;
                      const video = f.type.startsWith("video/");
                      if (video && f.size > STORY_VIDEO_MAX_BYTES) {
                        return setMsg({ ok: false, texto: `O vídeo passa de ${STORY_VIDEO_MAX_BYTES / 1024 / 1024} MB. Exporte mais leve: o story não é recomprimido.` });
                      }
                      if (!video && f.size > IMAGEM_MAX) return setMsg({ ok: false, texto: "A imagem passa de 5 MB." });
                      const r = new FileReader();
                      r.onload = () => setPeca({ url: String(r.result), video });
                      r.readAsDataURL(f);
                    }}
                  />
                </label>
                <p className="text-[11px] text-muted">
                  Em pé (9 por 16, recortada em <span className="tnum">1080 × 1920</span>). Some em{" "}
                  <span className="tnum">{STORY_HORAS}</span> h. Até <span className="tnum">{STORIES_MAX}</span> no ar. JPG,
                  PNG ou WebP até 5 MB. Vídeo em pé, MP4 ou MOV, até <span className="tnum">{STORY_VIDEO_MAX_SEGUNDOS}</span> s e{" "}
                  <span className="tnum">{STORY_VIDEO_MAX_BYTES / 1024 / 1024}</span> MB — vai como foi gravado, sem recompressão.
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

            <div>
              <label htmlFor="story-quando" className="label-xs">Publicar em (opcional)</label>
              <input
                id="story-quando"
                type="datetime-local"
                value={publicaEm}
                onChange={(e) => setPublicaEm(e.target.value)}
                className="campo tnum mt-1"
                aria-describedby="story-quando-dica"
              />
              <p id="story-quando-dica" className="mt-1 text-[11px] text-muted">
                Vazio, vai ao ar agora. Agendado (até <span className="tnum">{STORY_AGENDA_MAX_DIAS}</span> dias à frente), entra
                no ar sozinho na hora e as <span className="tnum">{STORY_HORAS}</span> h contam dali.
              </p>
            </div>

            <fieldset className="space-y-2 rounded-md border border-line p-3">
              <legend className="px-1 label-xs">Enquete (opcional)</legend>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={comEnquete} onChange={(e) => setComEnquete(e.target.checked)} />
                Pôr uma enquete no story
              </label>
              {comEnquete ? (
                <>
                  <div>
                    <label htmlFor="story-pergunta" className="label-xs">Pergunta</label>
                    <input
                      id="story-pergunta"
                      value={pergunta}
                      maxLength={ENQUETE_PERGUNTA_MAX + 10}
                      onChange={(e) => setPergunta(e.target.value)}
                      className="campo mt-1"
                    />
                  </div>
                  {opcoes.map((o, k) => (
                    <div key={k} className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`story-opcao-${k}`} className="label-xs">
                          Opção <span className="tnum">{k + 1}</span>
                        </label>
                        <input
                          id={`story-opcao-${k}`}
                          value={o}
                          maxLength={ENQUETE_OPCAO_MAX + 5}
                          onChange={(e) => setOpcoes(opcoes.map((x, j) => (j === k ? e.target.value : x)))}
                          className="campo mt-1"
                        />
                      </div>
                      {opcoes.length > ENQUETE_OPCOES_MIN ? (
                        <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setOpcoes(opcoes.filter((_, j) => j !== k))} aria-label={`Tirar a opção ${k + 1}`}>
                          Tirar
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {opcoes.length < ENQUETE_OPCOES_MAX ? (
                    <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setOpcoes([...opcoes, ""])}>
                      Mais uma opção
                    </Button>
                  ) : null}
                  <p className="text-[11px] text-muted">
                    Vota quem tem conta, um voto por pessoa. Quem votou vê o resultado; você vê os totais aqui, nunca quem votou em quê.
                  </p>
                  {problemaNaEnquete ? <p className="text-[11px] text-red">{problemaNaEnquete}</p> : null}
                </>
              ) : null}
            </fieldset>

            <fieldset className="space-y-2 rounded-md border border-line p-3">
              <legend className="px-1 label-xs">Figurinhas (opcional)</legend>
              <p className="text-[11px] text-muted">
                Até <span className="tnum">{FIGURINHAS_MAX}</span>, cada uma num ponto da tela. A contagem e o Comprar são da rifa escolhida acima: o
                Comprar some sozinho quando a rifa para de vender.
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["contagem", "Contagem do sorteio"],
                    ["comprar", "Botão Comprar"],
                    ["texto", "Texto"],
                    ["emoji", "Emoji"],
                  ] as [TipoDeFigurinha, string][]
                ).map(([tipo, rotulo]) => {
                  const daRifa = tipo === "contagem" || tipo === "comprar";
                  const bloqueada =
                    figurinhas.length >= FIGURINHAS_MAX || (daRifa && (!campaignId || figurinhas.some((f) => f.tipo === tipo)));
                  return (
                    <Button
                      key={tipo}
                      type="button"
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      disabled={bloqueada}
                      onClick={() => setFigurinhas([...figurinhas, novaFigurinha(tipo, figurinhas.length)])}
                    >
                      + {rotulo}
                    </Button>
                  );
                })}
              </div>
              {!campaignId ? <p className="text-[11px] text-muted">Escolha a rifa do story para usar a contagem e o Comprar.</p> : null}
              {figurinhas.length ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                  <ul className="min-w-0 space-y-2">
                    {figurinhas.map((f, k) => (
                      <li key={k} className="space-y-2 rounded-md bg-painel p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{NOME_DA_FIGURINHA[f.tipo]}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            className="px-2 py-1 text-xs"
                            onClick={() => setFigurinhas(figurinhas.filter((_, j) => j !== k))}
                            aria-label={`Tirar a figurinha ${k + 1} (${NOME_DA_FIGURINHA[f.tipo]})`}
                          >
                            Tirar
                          </Button>
                        </div>
                        {f.tipo === "texto" ? (
                          <div>
                            <label htmlFor={`fig-texto-${k}`} className="label-xs">Texto</label>
                            <input
                              id={`fig-texto-${k}`}
                              value={f.texto}
                              maxLength={FIGURINHA_TEXTO_MAX + 5}
                              onChange={(e) => mudarFigurinha(k, { texto: e.target.value })}
                              className="campo mt-1"
                            />
                          </div>
                        ) : null}
                        {f.tipo === "emoji" ? (
                          <div>
                            <label htmlFor={`fig-emoji-${k}`} className="label-xs">Emoji</label>
                            <select id={`fig-emoji-${k}`} value={f.emoji} onChange={(e) => mudarFigurinha(k, { emoji: e.target.value })} className="campo mt-1">
                              {EMOJIS_DA_FIGURINHA.map((e) => (
                                <option key={e.emoji} value={e.emoji}>
                                  {e.emoji} {e.nome}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label htmlFor={`fig-x-${k}`} className="label-xs">Lado</label>
                            <select id={`fig-x-${k}`} value={f.x} onChange={(e) => mudarFigurinha(k, { x: Number(e.target.value) })} className="campo mt-1">
                              {POSICOES_HORIZONTAIS.map((p) => (
                                <option key={p.valor} value={p.valor}>
                                  {p.rotulo}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor={`fig-y-${k}`} className="label-xs">Altura</label>
                            <select id={`fig-y-${k}`} value={f.y} onChange={(e) => mudarFigurinha(k, { y: Number(e.target.value) })} className="campo mt-1">
                              {POSICOES_VERTICAIS.map((p) => (
                                <option key={p.valor} value={p.valor}>
                                  {p.rotulo}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {/* Prévia do lugar de cada figurinha (só o desenho; a tela de verdade é o story). */}
                  <div aria-hidden className="relative mx-auto aspect-[9/16] w-[120px] overflow-hidden rounded-md bg-[#0b1f14]">
                    {peca && !peca.video ? <img src={peca.url} alt="" className="h-full w-full object-cover opacity-80" /> : null}
                    {figurinhas.map((f, k) => (
                      <span
                        key={k}
                        className="absolute max-w-[90%] -translate-x-1/2 -translate-y-1/2 truncate rounded bg-black/60 px-1 text-[9px] font-semibold text-branco"
                        style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }}
                      >
                        {f.tipo === "emoji" ? f.emoji : f.tipo === "texto" ? f.texto || "Texto" : NOME_DA_FIGURINHA[f.tipo]}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {problemaNasFigurinhas ? <p className="text-[11px] text-red">{problemaNasFigurinhas}</p> : null}
            </fieldset>

            {msg ? (
              <p className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
            ) : null}
            <Button
              type="submit"
              disabled={!peca || Boolean(problema) || Boolean(problemaNaEnquete) || Boolean(problemaNasFigurinhas) || postar.isPending || (plataforma && !organizacaoId)}
            >
              {postar.isPending ? "Enviando…" : publicaEm ? "Agendar story" : "Publicar story"}
            </Button>
          </form>
        </Card>

        <Card
          title="No ar e agendados"
          right={<span className="tnum text-xs text-muted">{lista.length}</span>}
        >
          {lista.length === 0 ? <Empty>Nenhum story no ar nem agendado.</Empty> : null}
          <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            {lista.map((s) => (
              <li key={s.id} className="space-y-1 text-xs">
                <div className="relative aspect-[9/16] overflow-hidden rounded-md border border-line bg-mist-2">
                  {s.tipo === "video" ? (
                    <video src={s.imagem} poster={s.poster ?? undefined} muted playsInline preload="metadata" aria-label={s.legenda ?? "Story em vídeo"} className="h-full w-full object-cover" />
                  ) : (
                    <img src={s.imagem} alt={s.legenda ?? "Story"} className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    aria-label="Apagar este story"
                    onClick={() => {
                      if (window.confirm(s.agendadoPara ? "Apagar este story agendado? Ele não vai mais ao ar." : "Apagar este story? Ele some para todo mundo na hora.")) apagar.mutate(s.id);
                    }}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-branco hover:bg-black/80"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
                {plataforma ? <p className="truncate font-semibold">{s.organizacao}</p> : null}
                {s.legenda ? <p className="line-clamp-2 text-ink-2">{s.legenda}</p> : null}
                {s.rifa ? <p className="truncate text-muted">→ {s.rifa.premio}</p> : null}
                {s.enquete ? (
                  <div className="rounded-md bg-mist px-2 py-1.5">
                    <p className="font-semibold">{s.enquete.pergunta}</p>
                    <ul className="mt-1 space-y-0.5">
                      {s.enquete.opcoes.map((o, k) => (
                        <li key={k} className="flex justify-between gap-2">
                          <span className="min-w-0 truncate">{o}</span>
                          <span className="tnum shrink-0">
                            {s.enquete!.percentuais[k]}% · {s.enquete!.votos[k]}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="tnum mt-1 text-muted">
                      {s.enquete.total} {s.enquete.total === 1 ? "voto" : "votos"}
                    </p>
                  </div>
                ) : null}
                {s.figurinhasGravadas.length ? (
                  <p className="text-muted">
                    Figurinhas: {s.figurinhasGravadas.map((t) => NOME_DA_FIGURINHA[t]).join(", ")}
                    {s.figurinhasGravadas.includes("comprar") && !s.figurinhas.some((f) => f.tipo === "comprar")
                      ? " (o Comprar está escondido: a rifa não está vendendo agora)"
                      : ""}
                  </p>
                ) : null}
                {s.agendadoPara ? (
                  <p>
                    <Pill status="pending">Agendado</Pill> <span className="tnum text-muted">{quando(s.agendadoPara)}</span>
                  </p>
                ) : (
                  <p className="tnum text-muted">
                    {s.tipo === "video" ? "Vídeo · " : ""}
                    {faltam(s.expiraEm)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PanelShell>
  );
}

interface FigurinhaDoForm {
  tipo: TipoDeFigurinha;
  x: number;
  y: number;
  texto: string;
  emoji: string;
}

const NOME_DA_FIGURINHA: Record<TipoDeFigurinha, string> = {
  contagem: "Contagem do sorteio",
  comprar: "Botão Comprar",
  texto: "Texto",
  emoji: "Emoji",
};

/** A figurinha nova entra no centro, um degrau abaixo da anterior. */
function novaFigurinha(tipo: TipoDeFigurinha, quantas: number): FigurinhaDoForm {
  const alturas = POSICOES_VERTICAIS.map((p) => p.valor);
  return { tipo, x: 0.5, y: alturas[(quantas + 1) % alturas.length], texto: "", emoji: EMOJIS_DA_FIGURINHA[0].emoji };
}

/** Só as chaves que o tipo usa: o servidor confere do mesmo jeito. */
function paraEnviar(f: FigurinhaDoForm) {
  if (f.tipo === "texto") return { tipo: f.tipo, x: f.x, y: f.y, texto: f.texto };
  if (f.tipo === "emoji") return { tipo: f.tipo, x: f.x, y: f.y, emoji: f.emoji };
  return { tipo: f.tipo, x: f.x, y: f.y };
}
