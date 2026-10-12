import { useState } from "react";
import { DESCRICAO_DA_NOTA_DO_AFILIADO, NOTA_FISCAL_MAX_BYTES } from "@shared/fiscal";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { AbrirEditorDeImagem, ArtesParaDivulgar } from "@/components/ArtesParaDivulgar";
import { Card, Money, Pill, Button, Empty, Campo, Filtros } from "@/components/bits";
import { CartaoDoPainel, Estatistica, TabelaOuCartoes } from "@/components/painel";
import { Banknote, MousePointerClick, Percent, ShoppingBag } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL, formatarCnpj } from "@shared/format";

interface Overview {
  affiliate: { code: string; pixKey: string | null; commissionPct: number | null; status: string };
  clicks: number;
  sales: number;
  conversion: number;
  revenueCents: number;
  commission: {
    pendingCents: number;
    availableCents: number;
    paidCents: number;
    reversedCents: number;
  };
  daily: { day: string; sales: number }[];
}

/** O saldo por quem paga: cada organização paga o que é dela; a comissão guardada, a plataforma. */
interface SaldoPorQuemPaga {
  organizacaoId: string;
  organizacao: string;
  disponivelCents: number;
  pendenteCents: number;
  /** IRRF retido no saque (Lucro Presumido ou Real); zero para MEI e Simples. */
  irrfCents?: number;
  notaContra?: { nome: string; cnpj: string | null };
}

/** A comissão guardada é paga pela plataforma e vem à parte, com o nome dela. */
const ehDaPlataforma = (o: SaldoPorQuemPaga) => o.organizacaoId === "plataforma";

/** Contra quem a nota fiscal do saque sai (resposta 11.2 do advogado), em texto. */
function NotaContra({ o }: { o: SaldoPorQuemPaga }) {
  if (!o.notaContra) return null;
  return (
    <span className="block text-xs text-muted">
      Nota contra {o.notaContra.nome}
      {o.notaContra.cnpj ? (
        <>
          , CNPJ <span className="tnum whitespace-nowrap">{formatarCnpj(o.notaContra.cnpj)}</span>
        </>
      ) : " (CNPJ ainda não cadastrado)"}
    </span>
  );
}

/**
 * Gráfico de uma série só, verde (dinheiro que entrou), sem legenda: o pico
 * vai rotulado, o dia aparece ao passar o ponteiro, e a lista inteira vai no
 * `aria-label` para quem não enxerga o desenho.
 */
function SalesChart({ data }: { data: { day: string; sales: number }[] }) {
  if (data.length === 0) {
    return <Empty>Sem vendas nos últimos 14 dias.</Empty>;
  }
  const max = Math.max(...data.map((d) => d.sales), 1);
  const peak = data.reduce((a, b) => (b.sales > a.sales ? b : a));
  const dia = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const rotulo = `Vendas por dia: ${data.map((d) => `${dia(d.day)}, ${d.sales}`).join("; ")}`;

  return (
    <div role="img" aria-label={rotulo} className="flex h-32 items-end gap-1 px-5 pb-5 pt-2">
      {data.map((d) => {
        const h = Math.round((d.sales / max) * 100);
        const isPeak = d.day === peak.day;
        return (
          <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="tnum text-[9px] text-ink">{isPeak ? d.sales : ""}</span>
            <div
              title={`${new Date(d.day).toLocaleDateString("pt-BR")} · ${d.sales} venda(s)`}
              className={`w-full rounded-t bg-green ${isPeak ? "" : "opacity-60"}`}
              style={{ height: `${Math.max(4, h)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function AfiliadoPainel() {
  const { data } = useQuery<Overview>({ queryKey: ["/api/affiliate/overview"] });
  const { data: saldo = [] } = useQuery<SaldoPorQuemPaga[]>({ queryKey: ["/api/affiliate/saldo"] });

  return (
    <PanelShell title="Visão geral">
      {!data ? (
        <Empty>Carregando…</Empty>
      ) : (
        <div className="space-y-4 md:space-y-6">
          {/* Celular e tablet: 2 por linha (com o menu de 260 px, 3 no tablet deixavam uma sozinha); computador: as 4 numa linha. */}
          <div className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-4">
            <Estatistica icone={MousePointerClick} tom="azul" valor={String(data.clicks)} rotulo="Cliques no link" />
            <Estatistica
              icone={ShoppingBag}
              tom="azul"
              valor={String(data.sales)}
              rotulo="Vendas pelo link"
              dica={
                <>
                  conversão de{" "}
                  <span className="tnum">
                    {(data.conversion * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                  </span>
                </>
              }
            />
            <Estatistica icone={Banknote} tom="green" valor={formatBRL(data.revenueCents)} rotulo="Receita gerada" />
            <Estatistica
              icone={Percent}
              tom="yellow"
              valor={formatBRL(data.commission.pendingCents + data.commission.availableCents)}
              rotulo="Comissão"
              dica={
                <>
                  <span className="tnum">{formatBRL(data.commission.availableCents)}</span> já liberados
                </>
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
            <CartaoDoPainel titulo="Vendas por dia" acao={<span className="label-xs">últimos 14 dias</span>}>
              <SalesChart data={data.daily} />
            </CartaoDoPainel>

            <CartaoDoPainel
              titulo="Saldo"
              acao={
                <Pill status={data.affiliate.pixKey ? "paid" : "pending"}>
                  {data.affiliate.pixKey ? "Pix cadastrado" : "sem chave Pix"}
                </Pill>
              }
            >
              <div className="px-5 pb-5">
                <p className="label-xs">Disponível para saque</p>
                <p className="tnum my-1 text-2xl text-green-deep">{formatBRL(data.commission.availableCents)}</p>
                <p className="text-[11px] text-muted">
                  <span className="tnum text-yellow-deep">{formatBRL(data.commission.pendingCents)} pendentes</span> até
                  passar a carência contra estorno.
                </p>
                {saldo.length > 0 ? (
                  <ul aria-label="Saldo por quem paga" className="mt-3 divide-y divide-line border-t border-line">
                    {saldo.map((o) => (
                      <li key={o.organizacaoId} className="py-2 text-xs">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="min-w-0 font-semibold text-ink">
                            {o.organizacao}
                            {ehDaPlataforma(o) ? <span className="font-normal text-muted"> · comissão guardada</span> : null}
                          </span>
                          <span className="tnum text-green-deep">{formatBRL(o.disponivelCents)} disponível</span>
                        </span>
                        {o.pendenteCents > 0 ? (
                          <span className="tnum block text-yellow-deep">{formatBRL(o.pendenteCents)} pendente</span>
                        ) : null}
                        <NotaContra o={o} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Link
                  href="/afiliado/saques"
                  className="mt-3 inline-flex min-h-6 items-center text-xs font-semibold text-green-deep underline"
                >
                  Pedir saque
                </Link>
              </div>
            </CartaoDoPainel>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

interface LinkKit {
  slug: string;
  title: string;
  pct: number;
  url: string;
  qr: string;
  coupon: { code: string; discountPct: number } | null;
  texts: string[];
  organizacao: string;
  termoPendente: boolean;
}

export function AfiliadoLinks() {
  const { data } = useQuery<LinkKit[]>({ queryKey: ["/api/affiliate/links"] });
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <PanelShell title="Meus links">
      {data?.length === 0 ? (
        <Card>
          <Empty>
            Nenhuma rifa para divulgar. Entre em{" "}
            <Link href="/afiliado/organizacoes" className="text-green-deep underline">
              Organizações
            </Link>{" "}
            e peça adesão às que você quer divulgar.
          </Empty>
        </Card>
      ) : null}
      {/* Um cartão por rifa: uma coluna até o tablet, duas no computador largo. */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2 xl:items-start">
        {data?.map((l) => (
          <CartaoDoPainel
            key={l.slug}
            titulo={l.title}
            subtitulo={l.organizacao}
            acao={<span className="label-xs text-green-deep">comissão de {l.pct}%</span>}
          >
            <div className="space-y-3 px-5 pb-5">
              {l.termoPendente ? (
                <p className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
                  Esta rifa saiu com uma versão nova do termo de {l.organizacao}. Aceite em{" "}
                  <Link href="/afiliado/organizacoes" className="underline">
                    Organizações
                  </Link>{" "}
                  para receber comissão por ela.
                </p>
              ) : null}

              <div className="flex items-center gap-2.5 rounded-[10px] border-[1.5px] border-dashed border-green bg-green-soft py-2 pl-3.5 pr-2">
                <span className="tnum min-w-0 flex-1 break-all text-[13px] text-green-deep">{l.url}</span>
                <Button variant="branco" className="shrink-0" onClick={() => copy(l.slug, l.url)}>
                  {copied === l.slug ? "copiado" : "copiar"}
                  <span className="sr-only"> o link de {l.title}</span>
                </Button>
              </div>

              {l.coupon ? (
                <p className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
                  Seu cupom <b className="tnum">{l.coupon.code}</b> dá <span className="tnum">{l.coupon.discountPct}%</span> de
                  desconto ao comprador — e credita a venda a você mesmo que a pessoa não tenha entrado pelo seu link.
                </p>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
                <div className="flex flex-col items-start gap-1.5 sm:items-center">
                  <span className="label-xs text-ink-2">QR do seu link</span>
                  <img
                    src={l.qr}
                    alt={`QR Code do link de afiliado para ${l.title}`}
                    className="w-[120px] rounded-md border border-line-2 bg-white"
                  />
                  <a
                    href={l.qr}
                    download={`qr-${l.slug}.png`}
                    className="flex min-h-6 w-[120px] items-center justify-center text-xs font-medium text-green-deep underline"
                  >
                    baixar<span className="sr-only"> o QR de {l.title}</span>
                  </a>
                </div>

                <div className="min-w-0 space-y-1.5">
                  <span className="label-xs text-ink-2">Textos prontos</span>
                  {l.texts.map((t, i) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-lg border border-line-2 px-2.5 py-2">
                      <p className="min-w-0 flex-1 break-words text-xs leading-4 text-ink-2">{t}</p>
                      <Button variant="contorno" className="h-8 shrink-0" onClick={() => copy(`${l.slug}-${i}`, t)}>
                        {copied === `${l.slug}-${i}` ? "ok" : "copiar"}
                        <span className="sr-only">
                          {" "}
                          o texto <span className="tnum">{i + 1}</span>
                        </span>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <ArtesDoKit slug={l.slug} />
            </div>
          </CartaoDoPainel>
        ))}
      </div>
    </PanelShell>
  );
}

/**
 * As artes prontas da rifa, com o QR do link do afiliado. As imagens só são
 * desenhadas quando a pessoa abre — a lista de links pode ter muitas rifas;
 * a lista de artes (leve, sem desenho) vem antes, para a rifa sem arte
 * (demonstração, travada, termo a aceitar) não mostrar o bloco.
 */
function ArtesDoKit({ slug }: { slug: string }) {
  const [aberto, setAberto] = useState(false);
  const base = `/api/affiliate/artes/${encodeURIComponent(slug)}`;
  const { data } = useQuery<{ artes: unknown[] }>({ queryKey: [base], retry: false });
  if (!data || data.artes.length === 0) return null;
  return (
    <div className="border-t border-line pt-3">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-8 items-center gap-2 text-sm font-semibold text-green-deep"
      >
        <span aria-hidden>{aberto ? "−" : "+"}</span> Artes prontas para postar
      </button>
      {aberto ? (
        <div className="mt-3">
          <div className="space-y-4">
            <AbrirEditorDeImagem
              texto="Monte a sua imagem: foto, formato, texto, preço, selo e o QR com o seu link."
              portas={{
                dados: `/api/affiliate/editor/${encodeURIComponent(slug)}`,
                conferir: `/api/affiliate/editor/${encodeURIComponent(slug)}/conferir`,
                sugerir: `/api/affiliate/editor/${encodeURIComponent(slug)}/sugerir`,
                artes: base,
              }}
            />
            <ArtesParaDivulgar base={base} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface Comissao {
  id: string;
  amountCents: number;
  pct: number;
  status: string;
  orderCode: number;
  orderAmountCents: number;
  quantity: number;
  buyerName: string;
  campaignTitle: string;
  organizacao: string;
}

/** A situação da comissão em texto: pendente em azul, disponível e paga em verde, revertida neutra. */
const SITUACAO_DA_COMISSAO: Record<string, { pill: string; texto: string }> = {
  pending: { pill: "pending", texto: "pendente" },
  available: { pill: "available", texto: "disponível" },
  paid: { pill: "paid", texto: "paga" },
  reversed: { pill: "revertida", texto: "revertida" },
};

function SituacaoDaComissao({ status }: { status: string }) {
  const s = SITUACAO_DA_COMISSAO[status] ?? { pill: status, texto: status };
  return <Pill status={s.pill}>{s.texto}</Pill>;
}

/** O valor da comissão; a revertida diz, em texto, o valor que saiu. */
function ValorDaComissao({ c }: { c: Comissao }) {
  if (c.status !== "reversed") return <Money cents={c.amountCents} />;
  return (
    <span className="tnum text-muted">
      −{formatBRL(c.amountCents)}
      <span className="sr-only"> revertida</span>
    </span>
  );
}

export function AfiliadoComissoes() {
  const { data } = useQuery<Comissao[]>({ queryKey: ["/api/affiliate/commissions"] });
  // Extrato por origem: a organização que paga, a rifa e o pedido.
  const [origem, setOrigem] = useState("");
  const organizacoes = [...new Set((data ?? []).map((c) => c.organizacao))].sort();
  const linhas = (data ?? []).filter((c) => !origem || c.organizacao === origem);
  const total = linhas.filter((c) => c.status !== "reversed").reduce((s, c) => s + c.amountCents, 0);

  return (
    <PanelShell title="Comissões">
      <div className="space-y-4 md:space-y-6">
        {organizacoes.length > 1 ? (
          <div className="flex flex-wrap items-end gap-3">
            <Campo rotulo="Organização" className="w-full sm:w-72">
              <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
                <option value="">Todas as organizações</option>
                {organizacoes.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Campo>
            <p className="pb-2 text-sm text-muted">
              <span className="tnum">{formatBRL(total)}</span> em <span className="tnum">{linhas.length}</span> venda(s)
            </p>
          </div>
        ) : null}

        <Card>
          {data?.length === 0 ? (
            <Empty>
              Nenhuma comissão ainda. Divulgue o seu link em{" "}
              <Link href="/afiliado/links" className="text-green-deep underline">
                Meus links
              </Link>
              : cada venda paga por ele aparece aqui.
            </Empty>
          ) : (
            <TabelaOuCartoes
              itens={linhas}
              chave={(c) => c.id}
              aria="Comissões por venda"
              colunas={[
                { titulo: "Pedido", celula: (c) => <span className="tnum">#{c.orderCode}</span> },
                {
                  titulo: "Organização · rifa",
                  celula: (c) => (
                    <>
                      <span className="block">{c.organizacao}</span>
                      <span className="text-xs text-muted">{c.campaignTitle}</span>
                    </>
                  ),
                },
                { titulo: "Comprador", celula: (c) => c.buyerName },
                { titulo: "Cotas", direita: true, celula: (c) => <span className="tnum">{c.quantity}</span> },
                { titulo: "Venda", direita: true, celula: (c) => <Money cents={c.orderAmountCents} /> },
                { titulo: "Comissão", direita: true, celula: (c) => <ValorDaComissao c={c} /> },
                { titulo: "Status", celula: (c) => <SituacaoDaComissao status={c.status} /> },
              ]}
              cartao={(c) => (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="tnum font-semibold">#{c.orderCode}</span>
                    <SituacaoDaComissao status={c.status} />
                  </div>
                  <p className="min-w-0">
                    {c.organizacao} <span className="text-xs text-muted">· {c.campaignTitle}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {c.buyerName} · <span className="tnum">{c.quantity}</span> cota(s) · venda <Money cents={c.orderAmountCents} />
                  </p>
                  <p className="text-xs">
                    Comissão <ValorDaComissao c={c} />
                  </p>
                </div>
              )}
            />
          )}
        </Card>

        <CartaoDoPainel titulo="Como a comissão anda">
          <ul className="list-disc space-y-2 px-5 pb-5 pl-9 text-xs leading-[18px] text-ink-2">
            <li>
              Nasce pendente na venda paga e vira disponível depois da janela de estorno e do sorteio (a organização pode
              escolher liberação imediata; aí o risco do estorno é dela).
            </li>
            <li>
              Incide sobre o que sobrou da taxa da plataforma, nunca sobre o bruto; arredonda para baixo e o centavo fica com o
              promotor.
            </li>
            <li>
              Estorno reverte a comissão na mesma transação. Já sacada, o valor fica registrado — nunca some calado.
            </li>
            <li>Aqui aparece só o primeiro nome de quem comprou.</li>
          </ul>
        </CartaoDoPainel>
      </div>
    </PanelShell>
  );
}

interface Saque {
  id: string;
  amountCents: number;
  irrfCents?: number;
  status: string;
  requestedAt: string;
  processedAt?: string | null;
  recibo: string | null;
  organizacao: string | null;
}

/** A situação do saque em texto: pedido esperando o pagamento (azul), pago (verde). */
const SITUACAO_DO_SAQUE: Record<string, { pill: string; texto: string }> = {
  requested: { pill: "pending", texto: "aguardando pagamento" },
  paid: { pill: "paid", texto: "pago" },
  failed: { pill: "falhou", texto: "não pago" },
};

/** Bruto (o valor da nota), IRRF retido e líquido (o que cai na conta), sempre os três. */
function BrutoIrrfLiquido({ bruto, irrf }: { bruto: number; irrf: number }) {
  return (
    <dl className="grid grid-cols-3 gap-2 text-xs">
      <div>
        <dt className="text-muted">Bruto (a nota)</dt>
        <dd className="tnum text-ink">{formatBRL(bruto)}</dd>
      </div>
      <div>
        <dt className="text-muted">IRRF retido</dt>
        <dd className="tnum text-ink">{irrf > 0 ? `−${formatBRL(irrf)}` : formatBRL(0)}</dd>
      </div>
      <div>
        <dt className="text-muted">Líquido</dt>
        <dd className="tnum text-green-deep">{formatBRL(bruto - irrf)}</dd>
      </div>
    </dl>
  );
}

export function AfiliadoSaques() {
  const qc = useQueryClient();
  const { data: overview } = useQuery<Overview>({ queryKey: ["/api/affiliate/overview"] });
  const { data: payouts } = useQuery<Saque[]>({ queryKey: ["/api/affiliate/payouts"] });

  const [pixKey, setPixKey] = useState("");
  const [senhaPix, setSenhaPix] = useState("");
  const [avisoPix, setAvisoPix] = useState<{ ok: boolean; texto: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A chave é para onde vai o dinheiro: trocar pede a senha (o servidor confere).
  const savePix = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/affiliate/pix-key", { pixKey, senha: senhaPix }),
    onSuccess: () => {
      setPixKey("");
      setSenhaPix("");
      setAvisoPix({ ok: true, texto: "Chave Pix trocada." });
      qc.invalidateQueries({ queryKey: ["/api/affiliate/overview"] });
    },
    onError: (err: Error) => setAvisoPix({ ok: false, texto: err.message }),
  });

  const { data: saldo = [] } = useQuery<SaldoPorQuemPaga[]>({ queryKey: ["/api/affiliate/saldo"] });
  // O saque é pedido a um pagador de cada vez: só quem tem saldo disponível entra na escolha.
  const sacaveis = saldo.filter((o) => o.disponivelCents > 0);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const pagador = sacaveis.find((o) => o.organizacaoId === escolhida) ?? sacaveis[0] ?? null;

  // A nota fiscal do saque (o saque só sai para MEI ou empresa), lida como data URL, do pagador escolhido.
  const [nota, setNota] = useState<{ organizacaoId: string; nome: string; dataUrl: string } | null>(null);
  const notaDoPagador = nota && pagador && nota.organizacaoId === pagador.organizacaoId ? nota : null;
  const lerNota = (organizacaoId: string, arquivo: File | undefined) => {
    setError(null);
    if (!arquivo) return;
    if (arquivo.size > NOTA_FISCAL_MAX_BYTES) {
      setError("A nota fiscal passa de 3 MB.");
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => setNota({ organizacaoId, nome: arquivo.name, dataUrl: String(leitor.result) });
    leitor.readAsDataURL(arquivo);
  };
  const request = useMutation({
    mutationFn: (organizacaoId: string) =>
      apiRequest("POST", "/api/affiliate/payouts", { organizacaoId, notaFiscal: notaDoPagador?.dataUrl }),
    onSuccess: () => {
      setNota(null);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setError(err.message),
  });

  const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

  return (
    <PanelShell title="Saques">
      {/* Celular: chave, saldo, pedido e histórico, nessa ordem; no computador, chave e saldo à esquerda, pedido e histórico à direita. */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 space-y-4 md:space-y-6">
          <CartaoDoPainel titulo="Chave Pix" subtitulo="Para onde vai o dinheiro dos saques. Trocar pede a sua senha.">
            <div className="space-y-3 px-5 pb-5">
              <p className="text-sm text-muted">
                Atual: <span className="tnum text-ink">{overview?.affiliate.pixKey ?? "não cadastrada"}</span>
              </p>
              <Campo rotulo="Nova chave Pix">
                <input
                  id="pix-key"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="e-mail, CPF, telefone ou chave aleatória"
                />
              </Campo>
              <Campo rotulo="Sua senha, para confirmar">
                <input
                  id="pix-senha"
                  type="password"
                  autoComplete="current-password"
                  value={senhaPix}
                  onChange={(e) => setSenhaPix(e.target.value)}
                />
              </Campo>
              {avisoPix ? (
                <p className={`text-sm ${avisoPix.ok ? "text-green-deep" : "text-red"}`} role={avisoPix.ok ? "status" : "alert"}>
                  {avisoPix.texto}
                </p>
              ) : null}
              <Button onClick={() => savePix.mutate()} disabled={pixKey.length < 5 || !senhaPix || savePix.isPending}>
                Salvar chave
              </Button>
            </div>
          </CartaoDoPainel>

          <CartaoDoPainel
            titulo="Saldo por quem paga"
            subtitulo="Cada organização paga a comissão das rifas dela; a comissão guardada pela plataforma é paga por ela, sempre depois do sorteio."
          >
            {saldo.length === 0 ? (
              <Empty>
                Nenhuma comissão ainda. Divulgue o seu link em{" "}
                <Link href="/afiliado/links" className="text-green-deep underline">
                  Meus links
                </Link>
                .
              </Empty>
            ) : (
              <ul aria-label="Saldo por quem paga" className="divide-y divide-line border-t border-line">
                {saldo.map((o) => (
                  <li key={o.organizacaoId} className="space-y-0.5 px-5 py-3 text-sm">
                    <span className="block min-w-0 font-semibold">{o.organizacao}</span>
                    {ehDaPlataforma(o) ? (
                      <span className="block text-xs text-muted">Comissão guardada, paga pela plataforma.</span>
                    ) : null}
                    <span className="flex flex-wrap gap-x-4 text-xs">
                      <span className="tnum text-green-deep">{formatBRL(o.disponivelCents)} disponível</span>
                      <span className="tnum text-yellow-deep">{formatBRL(o.pendenteCents)} pendente</span>
                    </span>
                    <NotaContra o={o} />
                  </li>
                ))}
              </ul>
            )}
          </CartaoDoPainel>
        </div>

        <div className="min-w-0 space-y-4 md:space-y-6">
          <CartaoDoPainel titulo="Pedir saque" subtitulo="O saque é pedido a um de cada vez, a quem paga.">
            <div className="space-y-3 px-5 pb-5">
              <p className="text-xs text-muted">
                A comissão é paga a MEI ou empresa: anexe a nota fiscal emitida pelo seu CNPJ no valor bruto do saque, contra
                quem paga, em PDF, XML ou foto, até 3 MB. O CNPJ fica em{" "}
                <Link href="/afiliado/dados" className="underline">
                  Meus dados
                </Link>
                . Na descrição da nota, use “{DESCRICAO_DA_NOTA_DO_AFILIADO}”.
              </p>
              {!pagador ? (
                <p className="text-sm text-muted">Nenhum saldo disponível para saque agora.</p>
              ) : (
                <>
                  {sacaveis.length > 1 ? (
                    <Filtros
                      rotulo="Quem paga"
                      exclusivo
                      ativa={pagador.organizacaoId}
                      aoMudar={(v) => {
                        setError(null);
                        setEscolhida(v);
                      }}
                      opcoes={sacaveis.map((o) => ({ valor: o.organizacaoId, rotulo: o.organizacao }))}
                    />
                  ) : null}
                  <div className="space-y-2 rounded-lg border border-line px-3 py-3">
                    <p className="text-sm font-semibold">{pagador.organizacao}</p>
                    <NotaContra o={pagador} />
                    <BrutoIrrfLiquido bruto={pagador.disponivelCents} irrf={pagador.irrfCents ?? 0} />
                    {pagador.irrfCents ? (
                      <p className="text-xs text-muted">
                        O IRRF (1,5%, Lucro Presumido ou Real) é recolhido por quem paga; a nota é do valor bruto.
                      </p>
                    ) : null}
                  </div>
                  {/* O botão é o rótulo: o campo nativo mostraria "Choose File" na língua do navegador. */}
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                    <label className="relative inline-flex h-10 cursor-pointer items-center rounded-lg border border-line-2 bg-white px-4 text-[13px] font-semibold text-ink focus-within:ring-2 focus-within:ring-green hover:bg-mist">
                      {notaDoPagador ? "Trocar a nota fiscal" : "Anexar a nota fiscal"}
                      <span className="sr-only"> do saque de {pagador.organizacao}</span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf,application/xml,text/xml,.xml,image/jpeg,image/png"
                        onChange={(e) => {
                          lerNota(pagador.organizacaoId, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                        className="sr-only"
                      />
                    </label>
                    {notaDoPagador ? <span className="min-w-0 truncate text-muted">{notaDoPagador.nome}</span> : null}
                  </div>
                  <Button
                    disabled={request.isPending || !notaDoPagador}
                    onClick={() => {
                      setError(null);
                      request.mutate(pagador.organizacaoId);
                    }}
                  >
                    Sacar via Pix
                  </Button>
                </>
              )}
              {error ? (
                <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
                  {error}
                </p>
              ) : null}
            </div>
          </CartaoDoPainel>

          <CartaoDoPainel titulo="Histórico">
            {payouts?.length === 0 ? (
              <Empty>Nenhum saque solicitado.</Empty>
            ) : (
              <ul aria-label="Saques pedidos" className="divide-y divide-line border-t border-line">
                {payouts?.map((p) => {
                  const s = SITUACAO_DO_SAQUE[p.status] ?? { pill: p.status, texto: p.status };
                  return (
                    <li key={p.id} className="space-y-2 px-5 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{p.organizacao ?? "Plataforma"}</span>
                          <span className="block text-xs text-muted">
                            pedido em <span className="tnum">{data(p.requestedAt)}</span>
                            {p.status === "paid" && p.processedAt ? (
                              <>
                                {" "}
                                · pago em <span className="tnum">{data(p.processedAt)}</span>
                              </>
                            ) : null}
                          </span>
                        </span>
                        <Pill status={s.pill}>{s.texto}</Pill>
                      </div>
                      <BrutoIrrfLiquido bruto={p.amountCents} irrf={p.irrfCents ?? 0} />
                      <div className="flex flex-wrap gap-x-4 text-xs">
                        <a href={`/api/affiliate/payouts/${p.id}/nota`} className="inline-flex min-h-6 items-center text-green-deep underline">
                          nota fiscal
                        </a>
                        {p.recibo ? (
                          <>
                            <a href={`/api/affiliate/recibos/${p.recibo}/pdf`} className="inline-flex min-h-6 items-center text-green-deep underline">
                              recibo (PDF)
                            </a>
                            <Link href={`/recibo/${p.recibo}`} className="inline-flex min-h-6 items-center text-green-deep underline">
                              conferir o recibo <span className="tnum">{p.recibo}</span>
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CartaoDoPainel>
        </div>
      </div>
    </PanelShell>
  );
}

interface OrganizacaoParaAfiliado {
  slug: string;
  nome: string;
  local: string | null;
  vinculo: { status: "pendente" | "aprovado" | "recusado" | "desfeito"; commissionPct: number | null } | null;
  termo: { versao: number; comissaoPct: number; texto: string } | null;
  aceitouVersaoAtual: boolean;
}

/** O vínculo em texto: pendente em azul (espera), aprovado em verde, recusado e saiu neutros. */
const VINCULO: Record<string, { pill: string; texto: string }> = {
  pendente: { pill: "pending", texto: "pendente" },
  aprovado: { pill: "paid", texto: "aprovado" },
  recusado: { pill: "recusado", texto: "recusado" },
  desfeito: { pill: "desfeito", texto: "saiu" },
};

/**
 * As organizações da plataforma: o afiliado pede adesão (lendo e aceitando o
 * termo de cada uma), acompanha a aprovação, aceita versão nova do termo e
 * sai quando quiser — sem perder o que já ganhou.
 */
export function AfiliadoOrganizacoes() {
  const qc = useQueryClient();
  const { data = [] } = useQuery<OrganizacaoParaAfiliado[]>({ queryKey: ["/api/affiliate/organizacoes"] });
  const [lendo, setLendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["/api/affiliate/organizacoes"] });
    qc.invalidateQueries({ queryKey: ["/api/affiliate/links"] });
  };
  const aderir = useMutation({
    mutationFn: (o: OrganizacaoParaAfiliado) =>
      apiRequest("POST", `/api/affiliate/organizacoes/${o.slug}/aderir`, { versao: o.termo?.versao }),
    onSuccess: () => {
      setLendo(null);
      recarregar();
    },
    onError: (e: Error) => {
      setErro(e.message);
      recarregar();
    },
  });
  const sair = useMutation({
    mutationFn: (slug: string) => apiRequest("DELETE", `/api/affiliate/organizacoes/${slug}`),
    onSuccess: recarregar,
    onError: (e: Error) => setErro(e.message),
  });

  const comVinculo = data.filter((o) => o.vinculo);
  const semVinculo = data.filter((o) => !o.vinculo);

  /** O termo, inteiro, antes do aceite (o aceite é prova daquele texto). */
  const termoAberto = (o: OrganizacaoParaAfiliado) =>
    lendo === o.slug && o.termo ? (
      <div className="space-y-2">
        <p className="label-xs text-ink-2">
          Termo de {o.nome} · versão <span className="tnum">{o.termo.versao}</span>
        </p>
        <pre className="whitespace-pre-wrap rounded-lg bg-mist p-3 font-sans text-xs leading-[18px] text-ink-2">{o.termo.texto}</pre>
        <div className="flex flex-wrap gap-2">
          <Button disabled={aderir.isPending} onClick={() => aderir.mutate(o)}>
            Li e aceito o termo
          </Button>
          <Button variant="cinza" onClick={() => setLendo(null)}>
            Voltar
          </Button>
        </div>
      </div>
    ) : null;

  const pedirAdesao = (o: OrganizacaoParaAfiliado, rotulo: string) => (
    <Button
      variant="claro"
      disabled={aderir.isPending}
      onClick={() => {
        setErro(null);
        if (o.termo) setLendo(o.slug);
        else aderir.mutate(o);
      }}
    >
      {rotulo}
      <span className="sr-only"> — {o.nome}</span>
    </Button>
  );

  return (
    <PanelShell title="Organizações">
      <div className="space-y-4 md:space-y-6">
        <p className="text-sm text-muted">
          Você pode divulgar as rifas de quantas organizações quiser. Cada uma aprova a sua adesão e tem o próprio termo — é
          ele que diz quanto e quando você recebe.
        </p>
        {erro ? (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
            {erro}
          </p>
        ) : null}

        {comVinculo.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3 lg:items-start">
            {comVinculo.map((o) => {
              const ativo = o.vinculo && (o.vinculo.status === "aprovado" || o.vinculo.status === "pendente");
              const precisaAceitar = Boolean(ativo && o.termo && !o.aceitouVersaoAtual);
              const v = VINCULO[o.vinculo!.status];
              return (
                <CartaoDoPainel
                  key={o.slug}
                  titulo={o.nome}
                  subtitulo={o.local ?? undefined}
                  className={lendo === o.slug ? "md:col-span-2 lg:col-span-3" : ""}
                >
                  <div className="space-y-2 px-5 pb-5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill status={v.pill}>{v.texto}</Pill>
                      {o.termo ? (
                        <span className="text-xs text-muted">
                          comissão de <span className="tnum">{o.termo.comissaoPct}%</span> ·{" "}
                          {precisaAceitar ? (
                            <span className="text-yellow-deep">
                              nova versão do termo (v<span className="tnum">{o.termo.versao}</span>) a aceitar
                            </span>
                          ) : ativo ? (
                            <>
                              termo aceito na versão <span className="tnum">{o.termo.versao}</span>
                            </>
                          ) : (
                            <>
                              termo na versão <span className="tnum">{o.termo.versao}</span>
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">sem termo publicado</span>
                      )}
                    </div>

                    {precisaAceitar ? (
                      <p className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
                        Há uma versão nova do termo (v<span className="tnum">{o.termo!.versao}</span>). Leia e aceite para
                        receber pelas rifas publicadas a partir dela; as que já estavam no ar seguem com a versão antiga.
                      </p>
                    ) : null}

                    {termoAberto(o) ?? (
                      <div className="flex flex-wrap items-center gap-2">
                        {!ativo || precisaAceitar
                          ? pedirAdesao(o, precisaAceitar ? "Ler e aceitar a versão nova" : o.termo ? "Ler o termo e aderir" : "Pedir adesão")
                          : null}
                        {ativo ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Sair de ${o.nome}? O que você já ganhou continua seu.`)) sair.mutate(o.slug);
                            }}
                            className="inline-flex min-h-6 items-center text-xs text-red underline"
                          >
                            sair desta organização
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </CartaoDoPainel>
              );
            })}
          </div>
        ) : null}

        <CartaoDoPainel titulo="Aderir a outra organização">
          <div className="space-y-3 px-5 pb-5">
            <p className="text-xs leading-[18px] text-ink-2">
              Escolha abaixo, ou entre pela página da organização (o botão “Seja um afiliado” no perfil dela) ou pelo link de
              convite. O pedido fica em análise até a organização aprovar; o termo dela aparece para você ler e aceitar antes do
              primeiro link. Sem vínculo aprovado, o link não dá comissão.
            </p>
            {semVinculo.length === 0 ? (
              <p className="text-xs text-muted">Você já tem vínculo com todas as organizações da plataforma.</p>
            ) : (
              <ul aria-label="Outras organizações" className="divide-y divide-line border-t border-line">
                {semVinculo.map((o) => (
                  <li key={o.slug} className="space-y-2 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block font-semibold">{o.nome}</span>
                        <span className="block text-xs text-muted">
                          {o.local ? `${o.local} · ` : ""}
                          {o.termo ? (
                            <>
                              comissão de <span className="tnum">{o.termo.comissaoPct}%</span> · termo na versão{" "}
                              <span className="tnum">{o.termo.versao}</span>
                            </>
                          ) : (
                            "sem termo publicado"
                          )}
                        </span>
                      </span>
                      {lendo === o.slug ? null : pedirAdesao(o, o.termo ? "Ler o termo e aderir" : "Pedir adesão")}
                    </div>
                    {termoAberto(o)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CartaoDoPainel>
      </div>
    </PanelShell>
  );
}
