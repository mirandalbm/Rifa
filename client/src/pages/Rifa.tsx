import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Money, Progress, Button, Card } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import {
  formatQuota,
  groupNumber,
  percent,
  formatBRL,
  cpfValido,
  maskCpf,
  maskPhone,
} from "@shared/format";
import { priceOrder } from "@shared/pricing";
import { regraDoReembolso } from "@shared/reembolso";
import { ResponsiveImage } from "@/components/ResponsiveImage";
import { SeguirBotoes, FotoDoPerfil } from "@/components/Seguir";

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
    temCertificado?: boolean;
  };
  stats: { soldCount: number; reservedCount: number };
  media: {
    role: "banner" | "photo" | "video";
    url: string;
    srcSetAvif: string | null;
    srcSetWebp: string | null;
    lqip: string | null;
    poster: string | null;
    durationS: number | null;
    altText: string | null;
  }[];
  packages: { quantity: number; discountPct: number; highlight: boolean }[];
  blockSize: number;
  pagamento: { online: boolean; fisico: string[]; somenteFisico: boolean };
  organizacao: { slug: string; nome: string; foto: string | null } | null;
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
  const { slug, org } = useParams<{ slug: string; org?: string }>();
  const [, navigate] = useLocation();
  const [quantity, setQuantity] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [block, setBlock] = useState(0);
  const [search, setSearch] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [playVideo, setPlayVideo] = useState(false);
  const [buyer, setBuyer] = useState({ name: "", phone: "", coupon: "", cpf: "" });
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery<CampaignDetail>({
    queryKey: [`/api/public/campaigns/${slug}`],
  });
  // O provedor do Pix em uso decide se o CPF é pedido (o Asaas exige).
  const { data: checkout } = useQuery<{
    exigeCpf: boolean;
    reembolso?: { aceita: boolean; taxaPct: number };
  }>({
    queryKey: ["/api/public/checkout"],
  });
  // Dentro da conta, nome, WhatsApp e CPF vêm dela — o servidor usa os da
  // conta de qualquer jeito; a tela só não pede o que não vai usar.
  const { data: sessao } = useSession();
  const naConta = Boolean(sessao?.buyer?.conta);
  const exigeCpf = (checkout?.exigeCpf ?? false) && !naConta;

  // A rifa abre dentro do perfil de quem a promove. Endereço com a
  // organização errada leva para a certa — nunca mostra a rifa "dentro" de
  // outro organizador.
  useEffect(() => {
    const dona = data?.organizacao?.slug;
    if (org && dona && org !== dona) navigate(`/o/${dona}/r/${slug}`, { replace: true });
  }, [org, slug, data?.organizacao?.slug, navigate]);
  const cpfOk = !exigeCpf || cpfValido(buyer.cpf);
  const comprador = naConta
    ? { name: sessao!.buyer!.name || "Conta", phone: sessao!.buyer!.phone }
    : { name: buyer.name, phone: buyer.phone };

  // Primeiro clique de afiliado: registra e guarda por 30 dias na sessão.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      apiRequest("POST", "/api/public/track-click", { ref, slug }).catch(() => {});
    }
  }, [slug]);

  const { data: premios } = useQuery<{
    total: number;
    restantes: number;
    premios: { label: string; total: number; restantes: number }[];
  }>({ queryKey: [`/api/public/campaigns/${slug}/premios`] });

  const { data: ranking } = useQuery<{ nome: string; telefone: string; quotas: number }[]>({
    queryKey: [`/api/public/campaigns/${slug}/ranking`],
  });

  const { data: ultimas } = useQuery<
    { nome: string; telefone: string; quantidade: number; quando: string }[]
  >({ queryKey: [`/api/public/campaigns/${slug}/ultimas-compras`] });

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
        buyer: {
          name: comprador.name,
          phone: comprador.phone,
          ...(exigeCpf ? { cpf: buyer.cpf.replace(/\D/g, "") } : {}),
        },
        couponCode: buyer.coupon || undefined,
      });
      return (await res.json()) as { code: number };
    },
    onSuccess: (order) => navigate(`/pedido/${order.code}`),
    onError: (err: Error) => setError(err.message),
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
      {data?.organizacao ? (
        <div className="-mt-1 mb-3 flex items-center gap-2">
          <Link href={`/o/${data.organizacao.slug}`} className="flex min-w-0 flex-1 items-center gap-2">
            <FotoDoPerfil nome={data.organizacao.nome} foto={data.organizacao.foto} tamanho={32} />
            <span className="truncate text-sm font-semibold">{data.organizacao.nome}</span>
          </Link>
          <SeguirBotoes slug={data.organizacao.slug} compacto />
        </div>
      ) : null}
      {/* Banner, vídeo e fotos: a propaganda vem antes de tudo. */}
      <div
        className="relative -mx-4 flex min-h-[150px] flex-col justify-end overflow-hidden p-4 text-branco"
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
            <ResponsiveImage
              key={i}
              media={p}
              alt={p.altText ?? `Foto ${i + 1} do prêmio`}
              // Cinco miniaturas lado a lado: cada uma vale ~20% da largura.
              sizes="(max-width: 640px) 20vw, 130px"
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

      {/* Sem Pix online, a página não promete o que não entrega. */}
      {data.pagamento && !data.pagamento.online ? (
        <div className="mt-4 rounded-lg border border-yellow bg-yellow-soft p-3">
          <h2 className="font-display text-sm font-bold text-yellow-deep">
            Esta rifa está vendendo só presencialmente
          </h2>
          <p className="mt-1 text-xs text-yellow-deep">
            Procure um de nossos cambistas para garantir seus números. O pagamento pela
            loja online está desligado no momento.
          </p>
        </div>
      ) : null}

      {/* Compra rápida — o caminho de 95% das vendas. */}
      <div
        className="mt-5 grid grid-cols-4 gap-2"
        hidden={data.pagamento ? !data.pagamento.online : false}
      >
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

      {/* Cotas premiadas: mostramos o prêmio e quantos restam, nunca o número. */}
      {premios && premios.total > 0 ? (
        <div className="mt-4 rounded-lg border border-yellow bg-yellow-soft p-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-sm font-bold text-yellow-deep">
              Cotas premiadas
            </h2>
            <span className="tnum text-xs text-yellow-deep">
              {premios.restantes} de {premios.total} em jogo
            </span>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {premios.premios.map((p) => (
              <li
                key={p.label}
                className={`rounded-md px-2 py-1 text-xs ${
                  p.restantes === 0
                    ? "bg-mist-2 text-muted line-through"
                    : "bg-white text-ink-2"
                }`}
              >
                {p.label}
                {p.restantes === 0 ? (
                  // Prêmio que já saiu continua na lista: é prova de que
                  // as cotas premiadas são reais.
                  <span className="ml-1 no-underline">já saiu</span>
                ) : p.total > 1 ? (
                  <span className="tnum ml-1 text-muted">×{p.restantes}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-yellow-deep">
            Os números premiados são secretos e aparecem na hora que você paga.
          </p>
        </div>
      ) : null}

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
      {count > 0 && (data.pagamento?.online ?? true) ? (
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

            {naConta ? (
              <p className="rounded-md bg-green-soft px-3 py-2 text-sm text-green-deep">
                Comprando como <strong>{comprador.name}</strong> ·{" "}
                <span className="tnum">{maskPhone(comprador.phone)}</span>
              </p>
            ) : (
              <>
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
              </>
            )}
            {exigeCpf ? (
              <div>
                <label htmlFor="cpf" className="label-xs">
                  CPF
                </label>
                <input
                  id="cpf"
                  value={buyer.cpf}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="000.000.000-00"
                  onChange={(e) => setBuyer({ ...buyer, cpf: maskCpf(e.target.value) })}
                  className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                />
                {buyer.cpf.replace(/\D/g, "").length === 11 && !cpfOk ? (
                  <p className="mt-1 text-[11px] text-red">CPF inválido. Confira os números.</p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted">
                    Exigido pelo banco para gerar o Pix. Não aparece para ninguém.
                  </p>
                )}
              </div>
            ) : null}
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
            {checkout?.reembolso?.aceita ? (
              <p className="text-[11px] text-muted">{regraDoReembolso(checkout.reembolso.taxaPct)}</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Barra fixa: o total nunca sai da tela. */}
      {count > 0 && price && (data.pagamento?.online ?? true) ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-mist px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <span className="tnum text-base">
              <span className="label-xs block">{count} cota(s)</span>
              {formatBRL(price.totalCents)}
            </span>
            <Button
              className="flex-1"
              disabled={
                createOrder.isPending ||
                comprador.name.length < 2 ||
                comprador.phone.length < 10 ||
                !cpfOk
              }
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

      {ultimas && ultimas.length > 0 ? (
        <Card title="Últimas compras">
          <ul className="divide-y divide-line">
            {ultimas.map((u, i) => (
              <li key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="flex-1">{u.nome}</span>
                <span className="tnum text-xs text-muted">{u.telefone}</span>
                <span className="tnum text-xs text-green-deep">
                  {u.quantidade} cota{u.quantidade > 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {ranking && ranking.length > 0 ? (
        <Card title="Quem mais comprou">
          <ul className="divide-y divide-line">
            {ranking.map((r, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span
                  className={`tnum flex h-5 w-5 items-center justify-center rounded text-[10px] ${
                    i === 0 ? "bg-yellow text-on-yellow" : "bg-mist-2 text-muted"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1">{r.nome}</span>
                <span className="tnum text-xs text-muted">{r.telefone}</span>
                <span className="tnum text-sm">{r.quotas}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <footer className="mt-8 space-y-1 border-t border-line pt-4 text-[11px] text-muted">
        {campaign.authorizationCode ? (
          <p>
            Autorização SPA/MF: <span className="tnum">{campaign.authorizationCode}</span>
            {campaign.temCertificado ? (
              <>
                {" · "}
                <a
                  href={`/api/public/campaigns/${slug}/certificado`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  ver certificado
                </a>
              </>
            ) : null}
          </p>
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
