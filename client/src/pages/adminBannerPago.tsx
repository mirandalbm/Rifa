import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Campo, Card, Empty, Money, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { formatBRL } from "@shared/format";
import {
  SITUACOES_DO_BANNER,
  TITULO_MAX,
  precoDoBanner,
  type ConfigBannerPago,
  type SituacaoDoBanner,
} from "@shared/bannerPago";
import { BANNER_TAMANHO } from "@shared/vitrine";

interface Pedido {
  id: string;
  organizacao?: string;
  campaignId: string;
  rifa: string;
  titulo: string;
  dias: number;
  valorPagoCents: number;
  status: SituacaoDoBanner;
  motivo: string | null;
  createdAt: string;
  inicio: string | null;
  fim: string | null;
  devolvidoCents: number;
  imagem: string;
  posicaoNaFila: number | null;
  diasQueFaltam: number | null;
}

interface Painel {
  config: ConfigBannerPago;
  saldoCents: number | null;
  vagasOcupadas: number;
  pedidos: Pedido[];
}

interface Campanha {
  campaign: { id: string; prizeTitle: string; status: string; travadaEm?: string | null };
}

const IMAGEM_MAX = 5 * 1024 * 1024;

/** A situação vai em texto na pílula, nunca só pela cor. */
const TOM: Record<SituacaoDoBanner, string> = {
  em_analise: "pending",
  aprovado: "pending",
  no_ar: "paid",
  encerrado: "closed",
  recusado: "expired",
  cancelado: "closed",
};

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
/** "20,50" → 2050; texto que não é dinheiro vira 0 (o servidor confere de novo). */
const centavos = (texto: string) => {
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/**
 * Banner pago na vitrine. A organização escolhe uma rifa no ar, manda a arte
 * (2 por 1) e compra dias de topo com o saldo do patrocínio; a plataforma
 * confere a arte antes de ir ao ar. A plataforma vê todos os pedidos, decide
 * e fixa preço, prazo e vagas. Desligado, a organização não vê nada.
 */
export function AdminBannerPago() {
  const { data: sessao } = useSession();
  const plataforma = sessao?.role === "admin";
  const { data: painel, isError } = useQuery<Painel>({ queryKey: ["/api/admin/banner-pago"] });

  return (
    <PanelShell title="Banner na vitrine">
      {isError ? (
        <Card>
          <Empty>O banner pago ainda não está disponível. Quando a plataforma liberar, ele aparece aqui.</Empty>
        </Card>
      ) : !painel ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="min-w-0 space-y-3">
            {plataforma ? <ConfigDoBanner painel={painel} /> : <NovoPedido painel={painel} />}
          </div>
          <div className="min-w-0">
            <Pedidos painel={painel} plataforma={plataforma} />
          </div>
        </div>
      )}
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ *
 * Organização: pedir
 * ------------------------------------------------------------------ */

function NovoPedido({ painel }: { painel: Painel }) {
  const qc = useQueryClient();
  const { config, saldoCents } = painel;
  const { data: campanhas = [] } = useQuery<Campanha[]>({ queryKey: ["/api/admin/campaigns"] });
  const rifas = campanhas.filter((c) => c.campaign.status === "published" && !c.campaign.travadaEm);

  const [campaignId, setCampaignId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [imagem, setImagem] = useState<string | null>(null);
  const [dias, setDias] = useState(String(config.diasMin));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  let total: number | null = null;
  let erroDias: string | null = null;
  try {
    total = precoDoBanner(config, Number(dias)).totalCents;
  } catch (e) {
    erroDias = (e as Error).message;
  }
  const faltaSaldo = total !== null && (saldoCents ?? 0) < total;

  const pedir = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/banner-pago/pedidos", { campaignId, titulo, imagem, dias: Number(dias) }),
    onSuccess: () => {
      setImagem(null);
      setTitulo("");
      setCampaignId("");
      setMsg({ ok: true, texto: "Pedido enviado. A plataforma confere a arte antes de ir ao ar." });
      qc.invalidateQueries({ queryKey: ["/api/admin/banner-pago"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  return (
    <Card title="Pedir um banner">
      <form
        className="space-y-3 p-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          pedir.mutate();
        }}
      >
        <p className="text-xs text-muted">
          Seu banner aparece no topo da vitrine, ao lado dos da plataforma, marcado como patrocinado, e leva à sua rifa. Você paga com o
          saldo e escolhe quantos dias. O tempo só começa a contar quando ele entra no ar.
        </p>

        <Campo rotulo="Rifa">
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">Escolha…</option>
            {rifas.map((c) => (
              <option key={c.campaign.id} value={c.campaign.id}>
                {c.campaign.prizeTitle}
              </option>
            ))}
          </select>
        </Campo>

        <div>
          <span className="label-xs">Arte</span>
          <div className="mt-1 flex items-start gap-3">
            <div className="aspect-[2/1] w-40 shrink-0 overflow-hidden rounded-md border border-line bg-mist-2">
              {imagem ? <img src={imagem} alt="Prévia do banner" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="min-w-0 space-y-2">
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
                Deitada (2 por 1), recortada em{" "}
                <span className="tnum">
                  {BANNER_TAMANHO.largura} × {BANNER_TAMANHO.altura}
                </span>
                . JPG, PNG ou WebP até 5 MB.
              </p>
            </div>
          </div>
        </div>

        <Campo rotulo="Título da arte" dica="É o texto de quem não enxerga a imagem. Sem telefone nem link.">
          <input value={titulo} maxLength={TITULO_MAX} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>

        <Campo
          rotulo="Dias no topo"
          erro={erroDias}
          dica={
            <>
              De <span className="tnum">{config.diasMin}</span> a <span className="tnum">{config.diasMax}</span> dias,{" "}
              <span className="tnum">{formatBRL(config.precoDiaCents)}</span> por dia.
            </>
          }
        >
          <input type="number" inputMode="numeric" min={config.diasMin} max={config.diasMax} value={dias} onChange={(e) => setDias(e.target.value)} />
        </Campo>

        <div className="flex items-center justify-between rounded-md bg-mist px-3 py-2">
          <span className="text-muted">Total</span>
          <span className="tnum font-semibold">{total === null ? "—" : formatBRL(total)}</span>
        </div>
        <p className={`text-xs ${faltaSaldo ? "text-red" : "text-muted"}`}>
          Seu saldo: <Money cents={saldoCents ?? 0} />.{" "}
          {faltaSaldo ? (
            <>
              Falta saldo para este pedido.{" "}
              <Link href="/admin/patrocinio" className="font-semibold underline">
                Recarregar
              </Link>
            </>
          ) : null}
        </p>
        <p className="text-xs text-muted">
          Recusado ou cancelado antes de ir ao ar, o valor volta ao saldo. Se a rifa sair do ar antes do fim, os dias não usados voltam como
          crédito.
        </p>

        {msg ? (
          <p className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
        ) : null}
        <Button type="submit" disabled={!campaignId || !imagem || titulo.trim().length < 3 || total === null || faltaSaldo || pedir.isPending}>
          {pedir.isPending ? "Enviando…" : "Pedir banner"}
        </Button>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Plataforma: configuração
 * ------------------------------------------------------------------ */

function ConfigDoBanner({ painel }: { painel: Painel }) {
  const qc = useQueryClient();
  const c = painel.config;
  const [ligado, setLigado] = useState(c.ligado);
  const [preco, setPreco] = useState(reais(c.precoDiaCents));
  const [diasMin, setDiasMin] = useState(String(c.diasMin));
  const [diasMax, setDiasMax] = useState(String(c.diasMax));
  const [vagas, setVagas] = useState(String(c.vagas));
  const [segundos, setSegundos] = useState(String(c.segundos));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/banner-pago/config", {
        ligado,
        precoDiaCents: centavos(preco),
        diasMin: Number(diasMin),
        diasMax: Number(diasMax),
        vagas: Number(vagas),
        segundos: Number(segundos),
      }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Salvo." });
      qc.invalidateQueries({ queryKey: ["/api/admin/banner-pago"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  return (
    <Card title="Preço e vagas">
      <form
        className="space-y-3 p-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          salvar.mutate();
        }}
      >
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={ligado} onChange={(e) => setLigado(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            <span className="font-semibold">Vender banner na vitrine</span>
            <span className="block text-xs text-muted">
              Desligado, as organizações não veem o produto e os banners já pagos saem de cena (o que já foi pago fica guardado).
            </span>
          </span>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Preço do dia (R$)">
            <input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
          </Campo>
          <Campo rotulo="Vagas pagas ao mesmo tempo" dica="Os banners da plataforma não contam.">
            <input type="number" inputMode="numeric" min={0} max={10} value={vagas} onChange={(e) => setVagas(e.target.value)} />
          </Campo>
          <Campo rotulo="Mínimo de dias">
            <input type="number" inputMode="numeric" min={1} max={90} value={diasMin} onChange={(e) => setDiasMin(e.target.value)} />
          </Campo>
          <Campo rotulo="Máximo de dias">
            <input type="number" inputMode="numeric" min={1} max={90} value={diasMax} onChange={(e) => setDiasMax(e.target.value)} />
          </Campo>
          <Campo rotulo="Segundos na tela">
            <input type="number" inputMode="numeric" min={2} max={30} value={segundos} onChange={(e) => setSegundos(e.target.value)} />
          </Campo>
        </div>
        <p className="text-xs text-muted">
          O preço é fotografado em cada pedido: mudar aqui não mexe no que já foi pago. Agora há{" "}
          <span className="tnum">{painel.vagasOcupadas}</span> de <span className="tnum">{c.vagas}</span> vaga(s) ocupada(s).
        </p>
        {msg ? (
          <p className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
        ) : null}
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Os pedidos (os dois recortes)
 * ------------------------------------------------------------------ */

function Pedidos({ painel, plataforma }: { painel: Painel; plataforma: boolean }) {
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/banner-pago"] });
  const falhou = (e: Error) => setErro(e.message);

  const cancelar = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/banner-pago/pedidos/${id}/cancelar`),
    onSuccess: recarregar,
    onError: falhou,
  });
  const decidir = useMutation({
    mutationFn: (p: { id: string; aprovar: boolean; motivo?: string }) =>
      apiRequest("POST", `/api/admin/banner-pago/pedidos/${p.id}/decisao`, { aprovar: p.aprovar, motivo: p.motivo }),
    onSuccess: recarregar,
    onError: falhou,
  });

  const { pedidos } = painel;
  return (
    <Card title={plataforma ? "Pedidos" : "Meus pedidos"} right={<span className="tnum text-xs text-muted">{pedidos.length}</span>}>
      {erro ? <p className="m-4 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p> : null}
      {pedidos.length === 0 ? <Empty>Nenhum pedido ainda.</Empty> : null}
      <ul className="divide-y divide-line">
        {pedidos.map((p) => (
          <li key={p.id} className="space-y-2 p-4 text-sm">
            <div className="flex items-start gap-3">
              <img src={p.imagem} alt={p.titulo} className="aspect-[2/1] w-28 shrink-0 rounded-md border border-line object-cover sm:w-40" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill status={TOM[p.status]}>{SITUACOES_DO_BANNER[p.status]}</Pill>
                  <span className="tnum text-xs text-muted">{data(p.createdAt)}</span>
                </div>
                <p className="truncate font-semibold">{p.rifa}</p>
                {plataforma && p.organizacao ? <p className="truncate text-xs text-muted">{p.organizacao}</p> : null}
                <p className="text-xs text-ink-2">
                  <span className="tnum">{p.dias}</span> dia(s) · <Money cents={p.valorPagoCents} />
                </p>
                {p.status === "aprovado" && p.posicaoNaFila ? (
                  <p className="text-xs text-muted">
                    Esperando vaga: <span className="tnum">{p.posicaoNaFila}º</span> da fila.
                  </p>
                ) : null}
                {p.status === "no_ar" ? (
                  <p className="text-xs text-muted">
                    No ar até <span className="tnum">{data(p.fim)}</span> (faltam <span className="tnum">{p.diasQueFaltam}</span> dia(s)).
                  </p>
                ) : null}
                {p.devolvidoCents > 0 ? (
                  <p className="text-xs text-muted">
                    Voltou ao saldo: <Money cents={p.devolvidoCents} />.
                  </p>
                ) : null}
                {p.motivo && p.status === "recusado" ? <p className="text-xs text-red">Motivo: {p.motivo}</p> : null}
              </div>
            </div>
            {p.status === "em_analise" ? (
              plataforma ? (
                <Decisao pedido={p} ocupado={decidir.isPending} onDecidir={(aprovar, motivo) => decidir.mutate({ id: p.id, aprovar, motivo })} />
              ) : (
                <Button
                  variant="ghost"
                  disabled={cancelar.isPending}
                  onClick={() => {
                    setErro(null);
                    if (window.confirm("Cancelar este pedido? O valor volta ao saldo.")) cancelar.mutate(p.id);
                  }}
                >
                  Cancelar pedido
                </Button>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Decisao({ pedido, ocupado, onDecidir }: { pedido: Pedido; ocupado: boolean; onDecidir: (aprovar: boolean, motivo?: string) => void }) {
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  if (!recusando) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button disabled={ocupado} onClick={() => onDecidir(true)}>
          Aprovar a arte
        </Button>
        <Button variant="ghost" disabled={ocupado} onClick={() => setRecusando(true)}>
          Recusar…
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Campo rotulo={`Motivo da recusa — ${pedido.titulo}`} dica="A organização lê isto. O valor volta ao saldo dela.">
        <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      <div className="flex flex-wrap gap-2">
        <Button disabled={ocupado || motivo.trim().length < 10} onClick={() => onDecidir(false, motivo)}>
          Recusar e devolver o valor
        </Button>
        <Button variant="ghost" onClick={() => setRecusando(false)}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
