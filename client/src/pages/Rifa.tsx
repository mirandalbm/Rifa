import { BarraDeAcoes, Carrossel, Legenda, type Interacoes, type Peca } from "@/components/Publicacao";
import { SeloVerificado } from "@/components/SeloVerificado";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PublicShell, acimaDoRodape } from "@/components/AppShell";
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
import { DestaqueOrg } from "@/components/DestaqueOrg";
import { lerOrigem } from "@/lib/origem";
import { lerIndicacao } from "@/lib/indicacao";
import { textoDoPresente } from "@shared/presente";
import { Gift } from "lucide-react";
import { consentiu, definirOrganizacaoDaPagina, lerUtm } from "@/lib/marketing";
import { useRastreio } from "@/components/Marketing";
import { embaralharPagina } from "@/lib/embaralhar";
import type { CorDeDestaque } from "@shared/perfil";
import { SeguirBotoes, FotoDoPerfil } from "@/components/Seguir";
import { SorteioCard } from "@/components/SorteioCard";
import { Comentarios, PainelDeComentarios } from "@/components/Comentarios";
import { BotaoDenunciar, SoValePelaPlataforma } from "@/components/Seguranca";
import { Cartelas } from "@/components/Cartelas";

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
    adiamentos?: number;
    drawAtOriginal?: string | null;
    authorizationCode: string | null;
    temCertificado?: boolean;
    demonstracao?: boolean;
    travada?: boolean;
    legenda?: string | null;
    interacoes?: Interacoes;
  };
  stats: { soldCount: number; reservedCount: number };
  media: {
    role: "banner" | "photo" | "video";
    position: number;
    url: string;
    srcSetAvif: string | null;
    srcSetWebp: string | null;
    lqip: string | null;
    poster: string | null;
    durationS: number | null;
    width?: number | null;
    height?: number | null;
    altText: string | null;
  }[];
  packages: { quantity: number; discountPct: number; highlight: boolean }[];
  blockSize: number;
  pagamento: { online: boolean; fisico: string[]; somenteFisico: boolean };
  organizacao: { slug: string; nome: string; foto: string | null; destaque: CorDeDestaque | null; verificada?: boolean } | null;
}

interface BlockData {
  from: number;
  to: number;
  taken: string;
  takenCount: number;
}

/** Quantos números o mapa mostra por página (o bloco do servidor tem 1.000). */
const POR_PAGINA = 100;

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

/** Sem pacote cadastrado na rifa, a compra rápida oferece estes. */
const PACOTES_PADRAO = [
  { quantity: 5, discountPct: 0, highlight: false },
  { quantity: 10, discountPct: 0, highlight: true },
  { quantity: 25, discountPct: 0, highlight: false },
  { quantity: 50, discountPct: 0, highlight: false },
];

export default function Rifa() {
  const { slug, org } = useParams<{ slug: string; org?: string }>();
  const base = org ? `/o/${org}/r/${slug}` : `/r/${slug}`;
  const [, navigate] = useLocation();
  // Pacote escolhido na compra rápida: mostra as cartelas daquele tamanho.
  const [pacote, setPacote] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  // Página do mapa, de 100 em 100; o bloco buscado no servidor sai dela.
  const [pagina, setPagina] = useState(0);
  const [trocarSinal, setTrocarSinal] = useState<{ numeros: number[]; vez: number } | null>(null);
  const [search, setSearch] = useState("");
  // O mapa mostra os números de cada página embaralhados (semente da visita)
  // e destaca o que a pessoa buscou.
  const [semente] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [buscado, setBuscado] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(false);
  // O ícone de comentar abre a janela de baixo para cima, como no Instagram.
  const [comentando, setComentando] = useState(false);
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

  const blockSize = data?.blockSize ?? 1000;
  const block = Math.floor((pagina * POR_PAGINA) / blockSize);
  const { data: blockData } = useQuery<BlockData>({
    queryKey: [`/api/public/campaigns/${slug}/blocks/${block}`],
    enabled: showMap,
  });
  const isTaken = useTakenSet(blockData);

  const rastreio = useRastreio();
  // Os pixels da promotora valem nesta página; ao sair, não valem mais.
  const donaDaRifa = data?.organizacao?.slug ?? null;
  useEffect(() => {
    definirOrganizacaoDaPagina(donaDaRifa);
    return () => definirOrganizacaoDaPagina(null);
  }, [donaDaRifa]);
  const campanhaVista = data?.campaign.id;
  useEffect(() => {
    if (!data) return;
    rastreio({ tipo: "ver_rifa", campanhaId: data.campaign.id, titulo: data.campaign.title, valorCents: data.campaign.priceCents });
    // Uma vez por rifa aberta, quando os pixels (e o "aceito") estiverem prontos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanhaVista, rastreio.pronto]);

  const createOrder = useMutation({
    // A compra vai sempre com os números — da cartela ou do mapa. Quem garante
    // que ninguém mais leva é a reserva no servidor, não a tela.
    mutationFn: async (numeros: number[]) => {
      const res = await apiRequest("POST", "/api/public/orders", {
        campaignId: data!.campaign.id,
        numbers: numeros,
        buyer: {
          name: comprador.name,
          phone: comprador.phone,
          ...(exigeCpf ? { cpf: buyer.cpf.replace(/\D/g, "") } : {}),
        },
        couponCode: buyer.coupon || undefined,
        origem: lerOrigem(),
        indicacao: lerIndicacao(),
        utm: lerUtm(),
        marketing: consentiu(),
      });
      return (await res.json()) as { code: number; amountCents?: number };
    },
    onSuccess: (order, numeros) => {
      if (data) {
        rastreio({
          tipo: "checkout",
          campanhaId: data.campaign.id,
          titulo: data.campaign.title,
          valorCents: order.amountCents ?? 0,
          quantidade: numeros.length,
        });
      }
      navigate(`/pedido/${order.code}`);
    },
    onError: (err: Error, numeros) => {
      setError(err.message);
      // Cartela com número que alguém acabou de levar: troca por outra.
      if (pacote && err.message.includes("acabaram de ser levados")) {
        setPicked([]);
        setTrocarSinal((t) => ({ numeros, vez: (t?.vez ?? 0) + 1 }));
        setError("Um número desta cartela acabou de ser levado. Trocamos a cartela — confira e pague de novo.");
      }
    },
  });

  // Chegou pelo "comprar" da publicação (`?comprar=1`) ou por um link com o
  // tamanho (`?pacote=N`, o do antigo "Comprar" do carrinho, que pode ter
  // sido compartilhado): abre a compra rápida — com as cartelas daquele
  // tamanho, se veio com ele. Só sugere: a cota só é tomada ao pagar.
  const rifaCarregada = data?.campaign.id;
  useEffect(() => {
    if (!data) return;
    const q = new URLSearchParams(window.location.search);
    const n = Number(q.get("pacote"));
    const { minPerOrder, maxPerOrder } = data.campaign;
    if (Number.isInteger(n) && n >= minPerOrder && n <= maxPerOrder) {
      setPacote(n);
      setPicked([]);
      setShowMap(false);
    } else if ((data.pagamento?.online ?? true) && !data.campaign.demonstracao && !data.campaign.travada) {
      // A rifa sempre abre no +10: quem chega vê as cartelas sem tocar em
      // nada. Fora da faixa da rifa, o pacote em destaque, senão o primeiro.
      const pacotes = data.packages.length ? data.packages : PACOTES_PADRAO;
      const cabe = (n: number) => n >= minPerOrder && n <= maxPerOrder;
      const inicial = cabe(10)
        ? 10
        : (pacotes.find((p) => p.highlight && cabe(p.quantity)) ?? pacotes.find((p) => cabe(p.quantity)))?.quantity;
      if (inicial) setPacote(inicial);
      else setShowMap(true);
    }
    if (q.has("pacote") || q.has("comprar")) {
      setTimeout(() => document.getElementById("comprar")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rifaCarregada]);

  if (!data) {
    return (
      <PublicShell>
        <p className="py-20 text-center text-sm text-muted">Carregando rifa…</p>
      </PublicShell>
    );
  }

  const { campaign, stats, media, packages } = data;
  const banner = media.find((m) => m.role === "banner");
  // Fotos e vídeos na ordem em que entraram (a posição é comum aos dois).
  const carrossel: Peca[] = media
    .filter((m) => m.role !== "banner")
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      role: m.role,
      url: m.url,
      srcSet: m.srcSetWebp,
      lqip: m.lqip,
      alt: m.altText,
      durationS: m.durationS,
      largura: m.width,
      altura: m.height,
    }));
  const sold = stats.soldCount;
  const pct = percent(sold, campaign.totalQuotas);
  // Vende pela loja: com Pix online ligado e nunca em rifa de demonstração.
  const vende = (data.pagamento?.online ?? true) && !campaign.demonstracao && !campaign.travada;
  const count = picked.length;
  const dadosOk = comprador.name.length >= 2 && comprador.phone.length >= 10 && cpfOk;

  const price =
    count > 0
      ? priceOrder({ quantity: count, unitCents: campaign.priceCents, packages })
      : null;

  const totalPaginas = Math.ceil(campaign.totalQuotas / POR_PAGINA);
  const inicioDaPagina = pagina * POR_PAGINA + 1;
  const fimDaPagina = Math.min(inicioDaPagina + POR_PAGINA - 1, campaign.totalQuotas);

  function togglePick(n: number) {
    setPicked((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  function pagarCartela(numeros: number[]) {
    setPicked(numeros);
    setError(null);
    if (dadosOk) {
      createOrder.mutate(numeros);
    } else {
      // Falta nome e WhatsApp: leva ao formulário; a barra de baixo paga esta cartela.
      setTimeout(() => document.getElementById("seus-dados")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  }

  return (
    <PublicShell larga>
      {/* No computador, duas colunas: a publicação à esquerda e a compra à
          direita, fixa enquanto rola. No celular, a mesma ordem de sempre:
          publicação, compra, e o resto (últimas compras, sorteio, comentários). */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start lg:gap-x-8">
      <div className="lg:col-start-1 lg:row-start-1">
      {data?.organizacao ? (
        <DestaqueOrg cor={data.organizacao.destaque} className="-mt-1 mb-3 flex items-center gap-2">
          <Link href={`/o/${data.organizacao.slug}`} className="flex min-w-0 flex-1 items-center gap-2">
            <FotoDoPerfil nome={data.organizacao.nome} foto={data.organizacao.foto} tamanho={32} />
            <span className="truncate text-sm font-semibold">{data.organizacao.nome}</span>
            {data.organizacao.verificada ? <SeloVerificado sujeito="organizacao" tamanho={16} /> : null}
          </Link>
          <SeguirBotoes slug={data.organizacao.slug} compacto />
        </DestaqueOrg>
      ) : null}
      {/* Banner, vídeo e fotos: a propaganda vem antes de tudo. */}
      <div
        className="relative -mx-4 flex min-h-[150px] flex-col justify-end overflow-hidden p-4 text-branco lg:mx-0 lg:rounded-xl"
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
        {campaign.adiamentos && campaign.drawAtOriginal ? (
          <p className="relative mt-1 text-xs text-branco">
            Sorteio adiado — a data era{" "}
            <span className="tnum">{new Date(campaign.drawAtOriginal).toLocaleDateString("pt-BR")}</span>. Seus
            números continuam valendo.
          </p>
        ) : null}
        <h1 className="relative mt-1 font-display text-2xl font-extrabold leading-tight">
          {campaign.prizeTitle}
        </h1>
      </div>

      {/* O carrossel da publicação (fotos e vídeos, até 10 com o banner),
          as ações e a legenda — como no feed. */}
      {carrossel.length ? (
        <div className="-mx-4 mt-3 lg:mx-0 lg:overflow-hidden lg:rounded-xl">
          <Carrossel pecas={carrossel} titulo={campaign.prizeTitle} />
        </div>
      ) : null}
      {campaign.interacoes ? (
        <div className="-mx-4 lg:mx-0">
          <BarraDeAcoes
            slug={campaign.slug}
            titulo={campaign.prizeTitle}
            caminho={data.organizacao ? `/o/${data.organizacao.slug}/r/${campaign.slug}` : `/r/${campaign.slug}`}
            interacoes={campaign.interacoes}
            aoComentar={() => setComentando(true)}
            vende={vende && stats.soldCount < campaign.totalQuotas}
            aoComprar={() => document.getElementById("comprar")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
          <Legenda autor={data.organizacao?.nome ?? ""} texto={campaign.legenda} />
        </div>
      ) : null}

      </div>

      {/* A compra: no computador, coluna da direita que acompanha a rolagem
          (com rolagem própria quando o mapa e o formulário passam da tela). */}
      <aside
        aria-label="Comprar"
        className="lg:sticky lg:top-[68px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100vh-68px-48px)] lg:overflow-y-auto lg:rounded-xl lg:border lg:border-line lg:px-4 lg:[scrollbar-width:thin]"
      >
      {/* No computador o prêmio encabeça a coluna da compra. */}
      <h2 className="mt-4 hidden font-display text-lg font-extrabold leading-tight lg:block">{campaign.prizeTitle}</h2>
      {/* Preço e progresso entram sem rolagem. */}
      <div className="mt-4 flex items-baseline gap-2">
        <Money cents={campaign.priceCents} className="text-2xl font-bold text-green-deep" />
        <span className="text-xs text-muted">
          por cota · mínimo <span className="tnum">{campaign.minPerOrder}</span>
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

      {campaign.demonstracao ? (
        <div className="mt-4 rounded-lg border border-yellow bg-yellow-soft p-3">
          <h2 className="font-display text-sm font-bold text-yellow-deep">Rifa de demonstração</h2>
          <p className="mt-1 text-xs text-yellow-deep">
            Exemplo de como fica uma rifa na plataforma. Não está à venda e não tem sorteio.
          </p>
        </div>
      ) : null}

      {campaign.travada ? (
        <div className="mt-4 rounded-lg border border-red bg-red-soft p-3">
          <h2 className="font-display text-sm font-bold text-red">Vendas suspensas pela plataforma</h2>
          <p className="mt-1 text-xs text-red">
            Esta rifa está em averiguação e não aceita novas compras. Quem já comprou mantém os bilhetes pagos pela
            plataforma; em dúvida, fale com o atendimento.
          </p>
        </div>
      ) : null}

      {/* Só vale bilhete pago aqui: o aviso vem antes do botão de comprar. */}
      {vende ? (
        <div className="mt-4">
          <SoValePelaPlataforma rifa={campaign.slug} />
        </div>
      ) : null}

      {/* Sem Pix online, a página não promete o que não entrega. */}
      {!campaign.demonstracao && data.pagamento && !data.pagamento.online ? (
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

      {vende ? <AvisoDePresente naConta={naConta} volta={base} /> : null}

      {/* Compra rápida — o caminho de 95% das vendas. Sem venda online, nem
          aparece: o atributo hidden perdia para a classe grid. */}
      {vende ? (
      <div id="comprar" className="mt-5 grid scroll-mt-20 grid-cols-5 gap-2">
        {/* O +0 abre o mapa: escolher número a número. */}
        <button
          type="button"
          onClick={() => {
            setPacote(0);
            setPicked([]);
            setShowMap(true);
            setError(null);
          }}
          aria-pressed={showMap && pacote === 0}
          className={`rounded-md border px-2 py-2 text-center ${
            showMap && pacote === 0 ? "border-green bg-green-soft" : "border-line-2 bg-white"
          }`}
        >
          <span className="tnum block text-sm font-bold">+0</span>
          <span className="text-[10px] text-muted">mapa</span>
        </button>
        {(packages.length > 0 ? packages : PACOTES_PADRAO).map((p) => (
          <button
            key={p.quantity}
            type="button"
            onClick={() => {
              setPacote(p.quantity);
              setPicked([]);
              setShowMap(false);
              setError(null);
            }}
            aria-pressed={pacote === p.quantity}
            className={`rounded-md border px-2 py-2 text-center ${
              pacote === p.quantity
                ? "border-green bg-green-soft"
                : p.highlight
                  ? "border-yellow bg-yellow-soft"
                  : "border-line-2 bg-white"
            }`}
          >
            <span className="tnum block text-sm font-bold">+{p.quantity}</span>
            <span className="tnum text-[10px] text-muted">
              {p.discountPct > 0
                ? `−${p.discountPct}%`
                : formatBRL(p.quantity * campaign.priceCents)}
            </span>
          </button>
        ))}
      </div>
      ) : null}

      {pacote > 0 && vende ? (
        <Cartelas
          slug={slug}
          quantidade={pacote}
          totalQuotas={campaign.totalQuotas}
          unitCents={campaign.priceCents}
          packages={packages}
          escolhida={picked.length ? picked : null}
          pagando={createOrder.isPending}
          onPagar={pagarCartela}
          trocarSinal={trocarSinal}
        />
      ) : null}
      {pacote > 0 && error && count === 0 ? (
        <p role="alert" className="mt-2 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
      ) : null}

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

      {showMap ? (
        <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white" aria-label="Mapa de números">
          {/* Cabeçalho: a faixa da página, a busca e as setas. */}
          <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <h2 className="tnum shrink-0 font-display text-sm font-bold">
              {formatQuota(inicioDaPagina, campaign.totalQuotas)} a {formatQuota(fimDaPagina, campaign.totalQuotas)}
            </h2>
            <form
              className="flex min-w-0 flex-1 gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(search);
                if (n >= 1 && n <= campaign.totalQuotas) {
                  setPagina(Math.floor((n - 1) / POR_PAGINA));
                  setBuscado(n);
                  // Embaralhado, o número pode cair em qualquer canto: rola até ele.
                  setTimeout(() => document.querySelector(`[data-numero="${n}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
                }
              }}
            >
              <label htmlFor="busca-numero" className="sr-only">
                Buscar número (1 a {groupNumber(campaign.totalQuotas)})
              </label>
              <input
                id="busca-numero"
                value={search}
                onChange={(e) => setSearch(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                enterKeyHint="search"
                placeholder="nº"
                className="tnum min-w-0 flex-1 rounded-md border border-line-2 bg-white px-2 py-1 text-sm"
              />
              <button type="submit" className="shrink-0 rounded-md border border-line-2 px-2 py-1 text-xs font-semibold hover:bg-mist">
                Buscar
              </button>
            </form>
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label="Números anteriores"
                disabled={pagina === 0}
                onClick={() => setPagina((b) => Math.max(0, b - 1))}
                className="h-7 w-7 rounded-md border border-line-2 disabled:opacity-40"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Próximos números"
                disabled={pagina >= totalPaginas - 1}
                onClick={() => setPagina((b) => Math.min(totalPaginas - 1, b + 1))}
                className="h-7 w-7 rounded-md border border-line-2 disabled:opacity-40"
              >
                ›
              </button>
            </span>
          </header>
          <div className="p-3">
            {blockData && isTaken && blockData.from <= inicioDaPagina && blockData.to >= fimDaPagina ? (
              <>
                <p className="label-xs mb-2">
                  Página <span className="tnum">{groupNumber(pagina + 1)}</span> de{" "}
                  <span className="tnum">{groupNumber(totalPaginas)}</span>
                </p>
                <div className="grid grid-cols-5 gap-1 sm:grid-cols-10 lg:grid-cols-5">
                  {embaralharPagina(inicioDaPagina, fimDaPagina, semente).map(
                    (n) => {
                      const taken = isTaken(n);
                      const mine = picked.includes(n);
                      return (
                        <button
                          key={n}
                          data-numero={n}
                          type="button"
                          disabled={taken}
                          onClick={() => togglePick(n)}
                          aria-pressed={taken ? undefined : mine}
                          aria-label={`Cota ${formatQuota(n, campaign.totalQuotas)}${taken ? " — indisponível" : mine ? " — escolhida" : ""}`}
                          className={`tnum rounded-md border py-2 text-[11px] font-bold ${
                            n === buscado ? "outline outline-2 outline-offset-1 outline-ink " : ""
                          }${
                            taken
                              ? "cursor-not-allowed border-line bg-mist-2 text-muted line-through"
                              : mine
                                ? "fundo-numero border-transparent"
                                : "texto-numero border-line-2 bg-white"
                          }`}
                        >
                          {formatQuota(n, campaign.totalQuotas)}
                        </button>
                      );
                    },
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Os números de cada página aparecem embaralhados. Use as setas para ver os próximos 100, ou a busca para achar um número (ele fica contornado). Toque para escolher.
                </p>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted">Carregando bloco…</p>
            )}
          </div>
        </section>
      ) : null}

      {/* Checkout */}
      {count > 0 && vende ? (
        <div id="seus-dados" className="scroll-mt-4">
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
            <p className="text-[11px] text-muted">
              Ao comprar, você aceita o{" "}
              <Link href={`${base}/regulamento`} className="underline">
                regulamento da rifa
              </Link>
              .
            </p>
          </div>
        </Card>
        </div>
      ) : null}

      {/* Barra fixa: o total nunca sai da tela. */}
      {count > 0 && price && vende ? (
        <div
          className="fixed inset-x-0 z-30 border-t border-line bg-mist px-4 py-3 lg:hidden"
          style={{ bottom: acimaDoRodape }}
        >
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <span className="tnum text-base">
              <span className="label-xs block">{count} cota(s)</span>
              {formatBRL(price.totalCents)}
            </span>
            <Button
              className="flex-1"
              disabled={createOrder.isPending || !dadosOk}
              onClick={() => {
                setError(null);
                createOrder.mutate(picked);
              }}
            >
              {createOrder.isPending ? "Reservando…" : "Pagar com Pix"}
            </Button>
          </div>
        </div>
      ) : null}
      {/* No computador, o total e o Pix ficam no pé da coluna da compra. */}
      {count > 0 && price && vende ? (
        <div className="sticky bottom-0 z-10 -mx-4 mt-3 hidden items-center gap-3 border-t border-line bg-mist px-4 py-3 lg:flex">
          <span className="tnum text-base">
            <span className="label-xs block">{count} cota(s)</span>
            {formatBRL(price.totalCents)}
          </span>
          <Button
            className="flex-1"
            disabled={createOrder.isPending || !dadosOk}
            onClick={() => {
              setError(null);
              createOrder.mutate(picked);
            }}
          >
            {createOrder.isPending ? "Reservando…" : "Pagar com Pix"}
          </Button>
        </div>
      ) : null}

      </aside>

      <div className="space-y-4 pt-4 lg:col-start-1 lg:row-start-2">
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

      <SorteioCard slug={slug} />

      <Comentarios slug={campaign.slug} />
      {comentando ? <PainelDeComentarios slug={campaign.slug} onFechar={() => setComentando(false)} /> : null}

      <footer className="mt-8 space-y-1 border-t border-line pt-4 text-[11px] text-muted">
        <p>
          <Link href={`${base}/regulamento`} className="underline">
            Regulamento
          </Link>
          {" · "}
          <Link href="/ajuda" className="underline">
            Ajuda
          </Link>
          {" · "}
          <BotaoDenunciar rifa={campaign.slug} comoLink />
        </p>
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
      </div>
      </div>
    </PublicShell>
  );
}

/**
 * Chegou por um presente (link de indicação com o presente ligado): diz de
 * quem é e o que vale. O desconto é do servidor, na primeira compra paga de
 * quem tem conta — aqui é só o aviso.
 */
function AvisoDePresente({ naConta, volta }: { naConta: boolean; volta: string }) {
  const codigo = lerIndicacao();
  const { data } = useQuery<{ ligado: boolean; valido?: boolean; de?: string; pct?: number; tetoCents?: number }>({
    queryKey: [`/api/public/presente?codigo=${codigo ?? ""}`],
    enabled: Boolean(codigo),
    staleTime: 60_000,
  });
  if (!codigo || !data?.ligado || !data.valido) return null;
  return (
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-marca px-3 py-3 text-sm">
      <Gift size={20} aria-hidden className="mt-0.5 shrink-0 text-marca" />
      <div>
        <p>
          <b>Presente{data.de ? ` de ${data.de}` : ""}:</b> {textoDoPresente({ pct: data.pct!, tetoCents: data.tetoCents! })}.
        </p>
        {naConta ? (
          <p className="mt-1 text-xs text-muted">Se esta for sua primeira compra, o desconto já entra no Pix.</p>
        ) : (
          <p className="mt-1 text-xs text-muted">
            Vale com conta:{" "}
            <Link href={`/criar-conta?volta=${encodeURIComponent(volta)}`} className="font-semibold underline">
              criar conta
            </Link>{" "}
            ou{" "}
            <Link href={`/entrar?volta=${encodeURIComponent(volta)}`} className="font-semibold underline">
              entrar
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
