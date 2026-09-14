import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Money, Progress, Button, Card } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { formatQuota, groupNumber, percent, formatBRL } from "@shared/format";
import { priceOrder } from "@shared/pricing";

interface CampaignDetail {
  campaign: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    prizeTitle: string;
    totalQuotas: number;
    priceCents: number;
    minPerOrder: number;
    maxPerOrder: number;
    reservationTtlMin: number;
    drawAt: string | null;
    drawSeedHash: string | null;
    authorizationCode: string | null;
  };
  stats: { soldCount: number; reservedCount: number };
  media: {
    role: "banner" | "photo" | "video";
    url: string;
    poster: string | null;
    durationS: number | null;
    altText: string | null;
  }[];
  packages: { quantity: number; discountPct: number; highlight: boolean }[];
  blockSize: number;
}

interface BlockData {
  from: number;
  to: number;
  taken: string;
  takenCount: number;
}

/** Bitmap do bloco: 1.000 bits, 125 bytes. Bloco cheio e vazio custam igual. */
function useTakenSet(block: BlockData | undefined) {
  return useMemo(() => {
    if (!block) return null;
    const bytes = Uint8Array.from(atob(block.taken), (c) => c.charCodeAt(0));
    return (n: number) => {
      const offset = n - block.from;
      if (offset < 0 || offset >= (block.to - block.from + 1)) return false;
      return (bytes[offset >> 3] & (1 << (offset & 7))) !== 0;
    };
  }, [block]);
}

export default function Rifa() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const [quantity, setQuantity] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [block, setBlock] = useState(0);
  const [search, setSearch] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [playVideo, setPlayVideo] = useState(false);
  const [buyer, setBuyer] = useState({ name: "", phone: "", coupon: "" });
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery<CampaignDetail>({
    queryKey: [`/api/public/campaigns/${slug}`],
  });

  // Primeiro clique de afiliado: registra e guarda por 30 dias na sessão.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      apiRequest("POST", "/api/public/track-click", { ref, slug }).catch(() => {});
    }
  }, [slug]);

  const { data: blockData } = useQuery<BlockData>({
    queryKey: [`/api/public/campaigns/${slug}/blocks/${block}`],
    enabled: showMap,
  });
  const isTaken = useTakenSet(blockData);

  const createOrder = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/public/orders", {
        campaignId: data!.campaign.id,
        quantity: picked.length > 0 ? undefined : quantity,
        numbers: picked.length > 0 ? picked : undefined,
        buyer: { name: buyer.name, phone: buyer.phone },
        couponCode: buyer.coupon || undefined,
      });
      return (await res.json()) as { code: number };
    },
    onSuccess: (order) => navigate(`/pedido/${order.code}`),
    onError: (err: Error) => setError(err.message.replace(/^\d+:\s*/, "")),
  });

  if (!data) {
    return (
      <PublicShell>
        <p className="py-20 text-center text-sm text-muted">Carregando rifa…</p>
      </PublicShell>
    );
  }

  const { campaign, stats, media, packages } = data;
  const banner = media.find((m) => m.role === "banner");
  const video = media.find((m) => m.role === "video");
  const photos = media.filter((m) => m.role === "photo");
  const sold = stats.soldCount;
  const pct = percent(sold, campaign.totalQuotas);
  const count = picked.length > 0 ? picked.length : quantity;

  const price =
    count > 0
      ? priceOrder({ quantity: count, unitCents: campaign.priceCents, packages })
      : null;

  const totalBlocks = Math.ceil(campaign.totalQuotas / data.blockSize);

  function togglePick(n: number) {
    setPicked((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
    setQuantity(0);
  }

  return (
    <PublicShell>
      {/* Banner, vídeo e fotos: a propaganda vem antes de tudo. */}
      <div
        className="relative -mx-4 flex min-h-[150px] flex-col justify-end overflow-hidden p-4 text-white"
        style={{
          background: banner
            ? `center/cover url(${banner.url})`
            : "linear-gradient(150deg,#0B1F14,#0d3a22 55%,#00873E)",
        }}
      >
        {/* Véu: a foto do prêmio é imprevisível, o texto precisa ler em cima de qualquer uma. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(11,31,20,.88) 0%, rgba(11,31,20,.55) 45%, rgba(11,31,20,.15) 100%)",
          }}
        />
        <p className="relative font-mono text-[11px] uppercase tracking-widest text-yellow">
          {campaign.drawAt
            ? `Sorteio ${new Date(campaign.drawAt).toLocaleDateString("pt-BR")} · Loteria Federal`
            : "Sorteio a definir"}
        </p>
        <h1 className="relative mt-1 font-display text-2xl font-extrabold leading-tight">
          {campaign.prizeTitle}
        </h1>
      </div>

      {video ? (
        <div className="mt-3">
          {playVideo ? (
            <video
              src={video.url}
              poster={video.poster ?? undefined}
              controls
              autoPlay
              playsInline
              className="aspect-video w-full rounded-lg bg-ink"
            />
          ) : (
            // Nunca toca sozinho: carrega só o pôster e monta o player no toque.
            <button
              type="button"
              onClick={() => setPlayVideo(true)}
              className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-ink"
              style={
                video.poster
                  ? { background: `center/cover url(${video.poster})` }
                  : undefined
              }
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white pl-1 text-green-deep shadow">
                ▶
              </span>
              <span className="absolute bottom-2 right-2 rounded bg-ink/80 px-1.5 py-[2px] font-mono text-[10px] text-white">
                {video.durationS ? `0:${String(video.durationS).padStart(2, "0")}` : "vídeo"}
              </span>
            </button>
          )}
        </div>
      ) : null}

      {photos.length > 0 ? (
        <div className="mt-2 grid grid-cols-5 gap-1">
          {photos.map((p, i) => (
            <img
              key={i}
              src={p.url}
              alt={p.altText ?? `Foto ${i + 1} do prêmio`}
              loading="lazy"
              className="aspect-[4/3] w-full rounded-md border border-line object-cover"
            />
          ))}
        </div>
      ) : null}

      {/* Preço e progresso entram sem rolagem. */}
      <div className="mt-4 flex items-baseline gap-2">
        <Money cents={campaign.priceCents} className="text-2xl text-green-deep" />
        <span className="text-xs text-muted">
          por cota · mínimo {campaign.minPerOrder}
        </span>
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="label-xs">
            {groupNumber(sold)} de {groupNumber(campaign.totalQuotas)} vendidas
          </span>
          <span className="label-xs text-green-deep">{pct}%</span>
        </div>
        <Progress value={sold} total={campaign.totalQuotas} tone={pct >= 85 ? "yellow" : "green"} />
      </div>

      {/* Compra rápida — o caminho de 95% das vendas. */}
      <div className="mt-5 grid grid-cols-4 gap-2">
        {(packages.length > 0
          ? packages
          : [
              { quantity: 5, discountPct: 0, highlight: false },
              { quantity: 10, discountPct: 0, highlight: true },
              { quantity: 25, discountPct: 0, highlight: false },
              { quantity: 50, discountPct: 0, highlight: false },
            ]
        ).map((p) => (
          <button
            key={p.quantity}
            type="button"
            onClick={() => {
              setQuantity(p.quantity);
              setPicked([]);
            }}
            className={`rounded-md border px-2 py-2 text-center ${
              quantity === p.quantity
                ? "border-green bg-green-soft"
                : p.highlight
                  ? "border-yellow bg-yellow-soft"
                  : "border-line-2 bg-white"
            }`}
          >
            <span className="tnum block text-sm">+{p.quantity}</span>
            <span className="text-[10px] text-muted">
              {p.discountPct > 0
                ? `−${p.discountPct}%`
                : formatBRL(p.quantity * campaign.priceCents)}
            </span>
          </button>
        ))}
      </div>

      {/* Busca direta: quem sabe o número pula o mapa inteiro. */}
      <div className="mt-4 flex gap-2">
        <input
          id="busca-numero"
          value={search}
          onChange={(e) => setSearch(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder={`ir para o número (1 a ${groupNumber(campaign.totalQuotas)})`}
          className="tnum w-full rounded-md border border-line-2 px-3 py-2 text-sm"
        />
        <Button
          variant="ghost"
          onClick={() => {
            const n = Number(search);
            if (n >= 1 && n <= campaign.totalQuotas) {
              setBlock(Math.floor((n - 1) / data.blockSize));
              setShowMap(true);
            }
          }}
        >
          Buscar
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setShowMap((v) => !v)}
        className="mt-3 text-sm text-green-deep underline"
      >
        {showMap ? "esconder o mapa de números" : "escolher no mapa"}
      </button>

      {showMap ? (
        <Card
          title={`Bloco ${block + 1} de ${groupNumber(totalBlocks)}`}
          right={
            <span className="flex gap-1">
              <button
                type="button"
                aria-label="Bloco anterior"
                onClick={() => setBlock((b) => Math.max(0, b - 1))}
                className="h-7 w-7 rounded-md border border-line-2"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Próximo bloco"
                onClick={() => setBlock((b) => Math.min(totalBlocks - 1, b + 1))}
                className="h-7 w-7 rounded-md border border-line-2"
              >
                ›
              </button>
            </span>
          }
        >
          <div className="p-3">
            {blockData && isTaken ? (
              <>
                <p className="label-xs mb-2">
                  {blockData.takenCount} de {blockData.to - blockData.from + 1} tomadas ·{" "}
                  {groupNumber(blockData.from)}–{groupNumber(blockData.to)}
                </p>
                <div className="grid grid-cols-6 gap-1 sm:grid-cols-10">
                  {Array.from({ length: Math.min(120, blockData.to - blockData.from + 1) }).map(
                    (_, i) => {
                      const n = blockData.from + i;
                      const taken = isTaken(n);
                      const mine = picked.includes(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          disabled={taken}
                          onClick={() => togglePick(n)}
                          aria-label={`Cota ${formatQuota(n, campaign.totalQuotas)}${taken ? " — indisponível" : ""}`}
                          className={`tnum aspect-square rounded-md border text-[10px] ${
                            taken
                              ? "cursor-not-allowed border-green bg-green text-on-green"
                              : mine
                                ? "border-2 border-green bg-green-soft text-green-deep"
                                : "border-line-2 bg-white text-ink-2"
                          }`}
                        >
                          {String(n).slice(-3)}
                        </button>
                      );
                    },
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Mostrando os 120 primeiros números do bloco. Use a busca para ir direto a um
                  número.
                </p>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted">Carregando bloco…</p>
            )}
          </div>
        </Card>
      ) : null}

      {/* Checkout */}
      {count > 0 ? (
        <Card title="Seus dados">
          <div className="space-y-3 p-4">
            {picked.length > 0 ? (
              <p className="tnum text-xs text-muted">
                {picked.length} número(s) escolhido(s):{" "}
                {picked
                  .slice(0, 8)
                  .map((n) => formatQuota(n, campaign.totalQuotas))
                  .join(", ")}
                {picked.length > 8 ? "…" : ""}
              </p>
            ) : null}

            <div>
              <label htmlFor="nome" className="label-xs">
                Nome
              </label>
              <input
                id="nome"
                value={buyer.name}
                onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
                className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="whatsapp" className="label-xs">
                WhatsApp
              </label>
              <input
                id="whatsapp"
                value={buyer.phone}
                inputMode="tel"
                onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })}
                className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="cupom" className="label-xs">
                Cupom (opcional)
              </label>
              <input
                id="cupom"
                value={buyer.coupon}
                onChange={(e) => setBuyer({ ...buyer, coupon: e.target.value.toUpperCase() })}
                className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
              />
            </div>

            {error ? (
              <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
            ) : null}

            <p className="text-[11px] text-muted">
              A reserva vale por {campaign.reservationTtlMin} minutos. Pagou, o número é seu.
            </p>
          </div>
        </Card>
      ) : null}

      {/* Barra fixa: o total nunca sai da tela. */}
      {count > 0 && price ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-mist px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <span className="tnum text-base">
              <span className="label-xs block">{count} cota(s)</span>
              {formatBRL(price.totalCents)}
            </span>
            <Button
              className="flex-1"
              disabled={createOrder.isPending || buyer.name.length < 2 || buyer.phone.length < 10}
              onClick={() => {
                setError(null);
                createOrder.mutate();
              }}
            >
              {createOrder.isPending ? "Reservando…" : "Pagar com Pix"}
            </Button>
          </div>
        </div>
      ) : null}

      <footer className="mt-8 space-y-1 border-t border-line pt-4 text-[11px] text-muted">
        {campaign.authorizationCode ? (
          <p>Autorização SPA/MF: {campaign.authorizationCode}</p>
        ) : null}
        {campaign.drawSeedHash ? (
          <p className="tnum break-all">
            Semente do sorteio (hash publicado antes da 1ª venda): {campaign.drawSeedHash}
          </p>
        ) : null}
      </footer>
    </PublicShell>
  );
}
