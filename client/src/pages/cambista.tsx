import { numeracaoZero } from "@shared/apuracao";
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { PanelShell } from "@/components/AppShell";
import { Button, Campo, Card, Money, Pill, Empty, Kpi } from "@/components/bits";
import { CartaoDoPainel, TabelaOuCartoes } from "@/components/painel";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL, formatQuota, groupNumber } from "@shared/format";
import { pos, inPos, printTicket } from "@/lib/pos";

interface Overview {
  seller: { code: string; commissionPct: number | null };
  /** Só os meios que a administração deixou ligados. */
  meios: ("dinheiro" | "pix_maquininha")[];
  campanhas: {
    id: string;
    slug: string;
    title: string;
    prizeTitle: string;
    priceCents: number;
    minPerOrder: number;
    maxPerOrder: number;
    totalQuotas: number;
    /** O método de apuração: com ele, a numeração da tela começa em zero. */
    metodoApuracao?: string | null;
    pct: number;
  }[];
  hoje: { vendas: number; cotas: number; totalCents: number };
  acerto: {
    orderCount: number;
    grossCents: number;
    commissionCents: number;
    netCents: number;
  };
}

/** Uma venda do cambista, como `GET /api/seller/sales` devolve. */
interface Venda {
  code: number;
  status: string;
  method: string;
  quantity: number;
  amountCents: number;
  paidAt: string | null;
  buyerName: string;
  campaignTitle: string;
  settlementId: string | null;
}

type Etapa = "montando" | "cobrando" | "concluida";

/**
 * Toda espera da venda tem prazo: com o apostador na frente, um botão que
 * fica "Reservando…" para sempre é o pior que a tela pode fazer. Passado o
 * prazo, a tela solta o botão e diz o que conferir — a resposta que chegar
 * depois é ignorada (a reserva que entrou vence sozinha; confirmar de novo
 * uma venda já paga não cobra duas vezes).
 */
const PRAZO_DA_ESPERA_MS = 20_000;
function comPrazo<T>(promessa: Promise<T>, mensagem: string): Promise<T> {
  return new Promise((ok, falha) => {
    const relogio = setTimeout(() => falha(new Error(mensagem)), PRAZO_DA_ESPERA_MS);
    promessa.then(
      (v) => {
        clearTimeout(relogio);
        ok(v);
      },
      (e) => {
        clearTimeout(relogio);
        falha(e);
      },
    );
  });
}

const FORMA: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix_maquininha: "Pix",
  pix_online: "Pix online",
};

/**
 * A situação da venda em pílula: pendente azul (espera a cobrança), paga
 * verde (dinheiro que entrou), expirada e estornada neutras — não são erro,
 * só o fim da venda (a cancelada pelo cambista também volta como expirada).
 * O mesmo tom da lista de Pedidos do painel.
 */
const VENDA_NEUTRA: Record<string, string> = { expired: "expirada", refunded: "estornada" };
function SituacaoDaVenda({ status }: { status: string }) {
  if (VENDA_NEUTRA[status]) return <Pill status="closed">{VENDA_NEUTRA[status]}</Pill>;
  if (status === "paid") return <Pill status="paid">paga</Pill>;
  return <Pill status={status} />;
}

/* ------------------------------ nova venda ------------------------------ */

export function CambistaVenda() {
  const qc = useQueryClient();
  const { data } = useQuery<Overview>({ queryKey: ["/api/seller/overview"] });

  const [campanha, setCampanha] = useState<string>("");
  const [quantidade, setQuantidade] = useState(1);
  const [comprador, setComprador] = useState({ name: "", phone: "", cpf: "" });
  const [etapa, setEtapa] = useState<Etapa>("montando");
  const [venda, setVenda] = useState<{
    code: number;
    numbers: number[];
    amountCents: number;
    expiresAt?: string | null;
  } | null>(null);
  const [premios, setPremios] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);

  const escolhida =
    data?.campanhas.find((c) => c.id === campanha) ?? data?.campanhas[0] ?? null;

  const reservar = useMutation({
    mutationFn: async () => {
      const res = await comPrazo(
        apiRequest("POST", "/api/seller/sales", {
          campaignId: escolhida!.id,
          quantity: quantidade,
          buyer: {
            name: comprador.name,
            phone: comprador.phone,
            cpf: comprador.cpf || undefined,
          },
        }),
        "O servidor não respondeu a tempo. Confira em Minhas vendas antes de reservar de novo: a reserva que entrou vence sozinha se não for cobrada.",
      );
      return (await res.json()) as {
        code: number;
        numbers: number[];
        amountCents: number;
        expiresAt?: string | null;
      };
    },
    onSuccess: (v) => {
      setVenda(v);
      setEtapa("cobrando");
      setErro(null);
    },
    onError: (err: Error) => setErro(err.message),
  });

  /** Dinheiro e Pix são confirmados na hora. Cartão não é aceito. */
  async function confirmar(method: "dinheiro" | "pix_maquininha") {
    if (!venda) return;
    setErro(null);
    setCobrando(true);

    try {
      const res = await comPrazo(
        apiRequest("POST", `/api/seller/sales/${venda.code}/confirm`, {
          method,
          posTerminal: pos()?.terminal,
        }),
        `A confirmação não voltou a tempo. Confira em Minhas vendas se a venda #${venda.code} ficou paga antes de cobrar de novo; confirmar outra vez não cobra duas vezes.`,
      );
      const confirmada = (await res.json()) as { prizes: string[] };

      setPremios(confirmada.prizes ?? []);
      setEtapa("concluida");
      qc.invalidateQueries();
      await printTicket(venda.code);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCobrando(false);
    }
  }

  const cancelar = useMutation({
    mutationFn: () =>
      comPrazo(
        apiRequest("POST", `/api/seller/sales/${venda!.code}/cancel`),
        "O cancelamento não voltou a tempo. Tente de novo; se a reserva já tiver vencido, as cotas voltaram sozinhas.",
      ),
    onSuccess: () => {
      setVenda(null);
      setEtapa("montando");
      setErro(null);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setErro(err.message),
  });

  function novaVenda() {
    setVenda(null);
    setPremios([]);
    setQuantidade(1);
    setComprador({ name: "", phone: "", cpf: "" });
    setEtapa("montando");
    setErro(null);
  }

  const zero = numeracaoZero(escolhida?.metodoApuracao);
  const validaAte = venda?.expiresAt
    ? new Date(venda.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <PanelShell title="Nova venda">
      {/*
        Celular e tablet: os números do dia em cima e a venda embaixo. No
        computador, a venda à esquerda e, à direita, o resumo e as últimas
        vendas. O DOM segue a ordem do celular; a grade só reposiciona.
      */}
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {data ? (
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6 xl:col-start-2 xl:row-start-1 xl:grid-cols-1 xl:self-start">
            <Kpi label="Vendas hoje" value={String(data.hoje.vendas)} />
            <Kpi label="Cotas hoje" value={groupNumber(data.hoje.cotas)} />
            <Kpi
              label="A acertar"
              value={formatBRL(data.acerto.netCents)}
              hint={
                <>
                  <span className="tnum">{data.acerto.orderCount}</span> venda(s) em aberto
                </>
              }
              highlight
            />
          </div>
        ) : null}

        <div className="min-w-0 space-y-4 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          {erro ? (
            <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
              {erro}
            </p>
          ) : null}

          {!data ? (
            <CartaoDoPainel titulo="Montar a venda">
              <Empty>Carregando as rifas…</Empty>
            </CartaoDoPainel>
          ) : null}

          {data && etapa === "montando" && !escolhida ? (
            <CartaoDoPainel titulo="Montar a venda">
              <Empty>
                Nenhuma rifa da sua organização está à venda agora. Quando a administradora publicar
                uma, ela aparece aqui para vender.
              </Empty>
            </CartaoDoPainel>
          ) : null}

          {etapa === "montando" && escolhida ? (
            <CartaoDoPainel titulo="Montar a venda">
              <div className="space-y-3 px-5 pb-5">
                <Campo
                  rotulo="Rifa"
                  dica={
                    <span className="label-xs text-green-deep">
                      sua comissão: <span className="tnum">{escolhida.pct}%</span>
                    </span>
                  }
                >
                  <select value={escolhida.id} onChange={(e) => setCampanha(e.target.value)}>
                    {data?.campanhas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.prizeTitle} — {formatBRL(c.priceCents)} a cota
                      </option>
                    ))}
                  </select>
                </Campo>

                <div>
                  <label htmlFor="quantidade" className="label-xs text-ink-2">
                    Quantas cotas
                  </label>
                  <div role="group" aria-label="Quantidade rápida" className="mt-1 grid grid-cols-4 gap-2">
                    {[1, 5, 10, 25].map((n) => (
                      <Button
                        key={n}
                        type="button"
                        variant={quantidade === n ? "primario" : "cinza"}
                        aria-pressed={quantidade === n}
                        onClick={() => setQuantidade(n)}
                        className="tnum px-2"
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                  <input
                    id="quantidade"
                    type="number"
                    min={escolhida.minPerOrder}
                    max={escolhida.maxPerOrder}
                    value={quantidade}
                    onChange={(e) => setQuantidade(Number(e.target.value))}
                    className="campo tnum mt-2 text-sm"
                  />
                </div>

                <Campo rotulo="Nome do apostador">
                  <input
                    autoComplete="off"
                    value={comprador.name}
                    onChange={(e) => setComprador({ ...comprador, name: e.target.value })}
                  />
                </Campo>
                <Campo rotulo="WhatsApp">
                  <input
                    inputMode="tel"
                    autoComplete="off"
                    value={comprador.phone}
                    onChange={(e) => setComprador({ ...comprador, phone: e.target.value })}
                    className="campo tnum text-sm"
                  />
                </Campo>
                <Campo rotulo="CPF (opcional)">
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    value={comprador.cpf}
                    onChange={(e) => setComprador({ ...comprador, cpf: e.target.value })}
                    className="campo tnum text-sm"
                  />
                </Campo>

                <div className="flex items-center justify-between gap-3 rounded-lg bg-mist px-3 py-3">
                  <span className="label-xs">Total a cobrar</span>
                  <span className="tnum text-lg">{formatBRL(quantidade * escolhida.priceCents)}</span>
                </div>

                <Button
                  className="w-full"
                  disabled={
                    reservar.isPending ||
                    comprador.name.trim().length < 2 ||
                    comprador.phone.replace(/\D/g, "").length < 10
                  }
                  onClick={() => reservar.mutate()}
                >
                  {reservar.isPending ? "Reservando…" : "Reservar cotas"}
                </Button>
                <p className="text-xs leading-[17px] text-muted">
                  As cotas são reservadas antes da cobrança — cartão aprovado com número já vendido
                  seria o pior dos mundos.
                </p>
              </div>
            </CartaoDoPainel>
          ) : null}

          {etapa === "cobrando" && venda ? (
            <CartaoDoPainel
              titulo={`Venda #${venda.code}`}
              subtitulo={
                validaAte ? (
                  <>
                    A reserva vale até <span className="tnum">{validaAte}</span>; sem cobrança, as
                    cotas voltam sozinhas.
                  </>
                ) : undefined
              }
              acao={<Pill status="reserved">reservada</Pill>}
            >
              <div className="space-y-4 px-5 pb-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="label-xs">
                    <span className="tnum">{venda.numbers.length}</span> cota(s) reservada(s)
                  </span>
                  <span className="tnum text-2xl text-green-deep">{formatBRL(venda.amountCents)}</span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {venda.numbers.slice(0, 40).map((n) => (
                    <span
                      key={n}
                      className="tnum rounded border border-dashed border-yellow-deep bg-yellow-soft px-1.5 py-[2px] text-[11px] text-yellow-deep"
                    >
                      {formatQuota(n, escolhida?.totalQuotas ?? 1000, zero)}
                    </span>
                  ))}
                  {venda.numbers.length > 40 ? (
                    <span className="text-[11px] text-muted">
                      e mais <span className="tnum">{venda.numbers.length - 40}</span>
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <span className="label-xs">Como o apostador pagou</span>
                  {(data?.meios ?? []).map((meio, i) => (
                    <Button
                      key={meio}
                      variant={i === 0 ? "primario" : "contorno"}
                      className="w-full"
                      disabled={cobrando}
                      onClick={() => confirmar(meio)}
                    >
                      {cobrando ? "Confirmando…" : FORMA[meio]}
                    </Button>
                  ))}
                  {(data?.meios ?? []).length === 0 ? (
                    <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">
                      A administração desligou todos os meios de venda na mão. Fale com ela antes de
                      cobrar.
                    </p>
                  ) : null}
                </div>

                {inPos() ? <p className="label-xs">maquininha detectada: {pos()?.terminal}</p> : null}

                <Button
                  variant="cinza"
                  className="w-full"
                  disabled={cobrando || cancelar.isPending}
                  onClick={() => cancelar.mutate()}
                >
                  {cancelar.isPending ? "Devolvendo as cotas…" : "Cancelar e devolver as cotas"}
                </Button>
              </div>
            </CartaoDoPainel>
          ) : null}

          {etapa === "concluida" && venda ? (
            <CartaoDoPainel titulo="Venda concluída">
              <div className="space-y-3 px-5 pb-5">
                <div className="rounded-lg bg-green-soft px-3 py-3 text-center text-green-deep">
                  <p className="text-base font-semibold">
                    Venda <span className="tnum">#{venda.code}</span> registrada
                  </p>
                  <p className="tnum mt-1 text-2xl">{formatBRL(venda.amountCents)}</p>
                </div>

                {premios.length > 0 ? (
                  <div className="rounded-lg border-2 border-yellow bg-yellow-soft px-3 py-3 text-center text-sm">
                    <p className="font-semibold text-yellow-deep">O apostador tirou cota premiada!</p>
                    <ul className="mt-1">
                      {premios.map((p) => (
                        <li key={p} className="tnum text-ink-2">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <Button className="w-full" icone={<Printer />} onClick={() => printTicket(venda.code)}>
                  Imprimir bilhete de novo
                </Button>
                <Button variant="contorno" className="w-full" onClick={novaVenda}>
                  Nova venda
                </Button>
              </div>
            </CartaoDoPainel>
          ) : null}
        </div>

        {/* As últimas vendas só no computador, ao lado da venda: no celular e no tablet elas moram em Minhas vendas. */}
        <div className="hidden min-w-0 xl:col-start-2 xl:row-start-2 xl:block">
          <UltimasVendas />
        </div>
      </div>
    </PanelShell>
  );
}

function UltimasVendas() {
  const { data } = useQuery<Venda[]>({ queryKey: ["/api/seller/sales"] });
  const ultimas = (data ?? []).slice(0, 5);
  return (
    <CartaoDoPainel
      titulo="Últimas vendas"
      acao={
        <Link href="/cambista/vendas" className="inline-flex min-h-6 items-center text-xs font-medium text-green-deep hover:underline">
          Ver todas
        </Link>
      }
    >
      {ultimas.length === 0 ? (
        <Empty>{data ? "Nenhuma venda ainda. A primeira aparece aqui." : "Carregando…"}</Empty>
      ) : (
        <ul aria-label="Últimas vendas" className="divide-y divide-line border-t border-line">
          {ultimas.map((v) => (
            <li key={v.code} className="space-y-1 px-5 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="tnum font-medium">#{v.code}</span>
                <SituacaoDaVenda status={v.status} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-ink-2">{v.buyerName}</span>
                <Money cents={v.amountCents} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </CartaoDoPainel>
  );
}

/* ----------------------------- minhas vendas ----------------------------- */

function SegundaVia({ codigo }: { codigo: number }) {
  return (
    <Button variant="contorno" icone={<Printer />} className="h-9 whitespace-nowrap px-3" onClick={() => printTicket(codigo)} aria-label={`Segunda via do bilhete da venda ${codigo}`}>
      Segunda via
    </Button>
  );
}

function Acertada({ v }: { v: Venda }) {
  return v.settlementId ? <Pill status="closed">acertada</Pill> : null;
}

export function CambistaVendas() {
  const { data } = useQuery<Venda[]>({ queryKey: ["/api/seller/sales"] });
  const vendas = data ?? [];

  return (
    <PanelShell title="Minhas vendas">
      <div className="space-y-4 md:space-y-6">
        <Card>
          <TabelaOuCartoes
            aria="Minhas vendas"
            itens={vendas}
            chave={(v) => v.code}
            colunas={[
              { titulo: "Venda", celula: (v) => <span className="tnum">#{v.code}</span> },
              { titulo: "Apostador", celula: (v) => v.buyerName },
              { titulo: "Rifa", celula: (v) => <span className="text-ink-2">{v.campaignTitle}</span> },
              { titulo: "Cotas", celula: (v) => <span className="tnum">{v.quantity}</span>, direita: true },
              { titulo: "Valor", celula: (v) => <Money cents={v.amountCents} />, direita: true },
              { titulo: "Forma", celula: (v) => <span className="text-ink-2">{FORMA[v.method] ?? v.method}</span> },
              {
                titulo: "Situação",
                celula: (v) => (
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <SituacaoDaVenda status={v.status} />
                    <Acertada v={v} />
                  </span>
                ),
              },
              { titulo: "Bilhete", celula: (v) => <SegundaVia codigo={v.code} /> },
            ]}
            cartao={(v) => (
              <div className="space-y-1.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="tnum font-medium">#{v.code}</span>
                  <span className="flex flex-wrap justify-end gap-1">
                    <SituacaoDaVenda status={v.status} />
                    <Acertada v={v} />
                  </span>
                </div>
                <p className="min-w-0 break-words">{v.buyerName}</p>
                <p className="min-w-0 truncate text-muted">{v.campaignTitle}</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">
                    <span className="tnum">{v.quantity}</span> cota{v.quantity === 1 ? "" : "s"} ·{" "}
                    {FORMA[v.method] ?? v.method}
                  </span>
                  <Money cents={v.amountCents} />
                </div>
                <SegundaVia codigo={v.code} />
              </div>
            )}
          />
          {data && vendas.length === 0 ? (
            <Empty>Nenhuma venda registrada. A venda feita em Nova venda aparece aqui.</Empty>
          ) : null}
          {!data ? <Empty>Carregando…</Empty> : null}
        </Card>

        <CartaoDoPainel titulo="O que aparece aqui">
          <ul className="list-disc space-y-2 px-5 pb-5 pl-9 text-sm text-ink-2">
            <li>
              Só as suas vendas. Quem comprou na sua mão aparece completo: é cliente da organização.
            </li>
            <li>
              Paga é a venda confirmada em dinheiro ou Pix na maquininha; a cancelada devolveu as
              cotas na hora e aparece como expirada; a pendente ainda espera a cobrança.
            </li>
            <li>
              Fechado o acerto pela administradora, a venda ganha a marca "acertada" e sai do que
              está em aberto no Meu acerto.
            </li>
          </ul>
        </CartaoDoPainel>
      </div>
    </PanelShell>
  );
}

/* ------------------------------- meu acerto ------------------------------ */

interface Acerto {
  id: string;
  grossCents: number;
  commissionCents: number;
  netCents: number;
  orderCount: number;
  status: string;
  createdAt: string;
  settledAt: string | null;
}

function dia(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
}

/** Pago com a data em texto; fechado e ainda não entregue, em azul (espera). */
function SituacaoDoAcerto({ a }: { a: Acerto }) {
  return a.status === "pago" ? (
    <Pill status="paid">entregue{a.settledAt ? ` em ${dia(a.settledAt)}` : ""}</Pill>
  ) : (
    <Pill status="pending">a entregar</Pill>
  );
}

export function CambistaAcerto() {
  const { data: conta } = useQuery<{
    aberto: {
      orderCount: number;
      grossCents: number;
      commissionCents: number;
      netCents: number;
    };
    historico: { settlement: Acerto }[];
  }>({ queryKey: ["/api/seller/settlement"] });

  return (
    <PanelShell title="Meu acerto">
      {!conta ? (
        <Empty>Carregando…</Empty>
      ) : (
        <div className="space-y-4 md:space-y-6">
          {/* Os três números vêm do servidor (`/api/seller/settlement`): recolhido − comissão = a entregar. */}
          <section aria-label="Em aberto" className="space-y-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
              <Kpi
                label="Recolhido"
                value={formatBRL(conta.aberto.grossCents)}
                hint={
                  <>
                    <span className="tnum">{conta.aberto.orderCount}</span> venda(s) em aberto
                  </>
                }
              />
              <Kpi
                label="Sua comissão"
                value={`− ${formatBRL(conta.aberto.commissionCents)}`}
                hint="fica com você"
              />
              <Kpi
                label="A entregar"
                value={formatBRL(conta.aberto.netCents)}
                hint="à administradora"
                highlight
              />
            </div>
            <p className="text-xs leading-[17px] text-muted">
              O acerto é fechado pela administradora. Depois de fechado, estas vendas saem daqui e vão
              para os acertos anteriores.
            </p>
          </section>

          <CartaoDoPainel titulo="Acertos anteriores">
            {conta.historico.length === 0 ? (
              <Empty>Nenhum acerto fechado ainda. O primeiro aparece aqui quando a administradora fechar.</Empty>
            ) : (
              <div className="border-t border-line">
                <TabelaOuCartoes
                  aria="Acertos anteriores"
                  itens={conta.historico.map((h) => h.settlement)}
                  chave={(a) => a.id}
                  colunas={[
                    { titulo: "Fechado em", celula: (a) => <span className="tnum">{dia(a.createdAt)}</span> },
                    { titulo: "Vendas", celula: (a) => <span className="tnum">{a.orderCount}</span>, direita: true },
                    { titulo: "Recolhido", celula: (a) => <Money cents={a.grossCents} />, direita: true },
                    {
                      titulo: "Comissão",
                      celula: (a) => <span className="tnum">− {formatBRL(a.commissionCents)}</span>,
                      direita: true,
                    },
                    { titulo: "À administradora", celula: (a) => <Money cents={a.netCents} className="font-medium" />, direita: true },
                    { titulo: "Situação", celula: (a) => <SituacaoDoAcerto a={a} /> },
                  ]}
                  cartao={(a) => (
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 text-muted">
                          Fechado em <span className="tnum">{dia(a.createdAt)}</span>
                        </span>
                        <span className="shrink-0 whitespace-nowrap">
                          <SituacaoDoAcerto a={a} />
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 text-ink-2">
                        <span>
                          <span className="tnum">{a.orderCount}</span> venda(s) recolhida(s)
                        </span>
                        <Money cents={a.grossCents} />
                      </div>
                      <div className="flex justify-between gap-3 text-ink-2">
                        <span>Sua comissão</span>
                        <span className="tnum">− {formatBRL(a.commissionCents)}</span>
                      </div>
                      <div className="flex justify-between gap-3 font-medium">
                        <span>Entregue à administradora</span>
                        <Money cents={a.netCents} />
                      </div>
                    </div>
                  )}
                />
              </div>
            )}
          </CartaoDoPainel>
        </div>
      )}
    </PanelShell>
  );
}
