import { numeracaoZero } from "@shared/apuracao";
import { CartaoDoFeed, type RifaDoFeed } from "@/components/CartaoDoFeed";
import { Janela } from "@/components/Janela";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Button, Caixa, Campo, Card, Money, Pill, Empty, TONS_DO_BOTAO } from "@/components/bits";
import { usePendencias } from "@/components/Console";
import { Conversa, type Mensagem } from "@/components/Conversa";
import { BonusDoComprador, type EstadoBonus } from "@/components/BonusDoComprador";
import { apiRequest, ApiError, getQueryFn } from "@/lib/queryClient";
import { lerImagem } from "@/lib/anexo";
import { PerfilPublicoCard } from "@/components/PerfilDoApostador";
import { VerificacaoCard } from "@/components/Verificacao";
import { estadoPush, ligarPush, desligarPush, type EstadoPush } from "@/lib/push";
import { cepValido, cidadeUf, maskCep } from "@shared/endereco";
import { formatQuota, maskPhone, maskCpf, cpfValido, formatBRL } from "@shared/format";
import {
  calcularReembolso,
  NOME_TIPO_REEMBOLSO,
  regraDoReembolso,
  regraSemReembolsoPeloSite,
  TAXA_REEMBOLSO_PADRAO_PCT,
} from "@shared/reembolso";
import { abaDoTeclado } from "@shared/abas";
import { useSession } from "@/lib/session";
import {
  DISPUTA_PRAZO_DIAS,
  DIREITO_DO_CONSUMIDOR,
  NOME_STATUS_DISPUTA,
  situacaoDoChamado,
  PILL_DISPUTA,
  bloqueioDoReembolso,
  problemaNaDisputa,
  type StatusChamado,
  type StatusDisputa,
} from "@shared/chamados";

interface OrderRow {
  order: {
    code: number;
    status: string;
    quantity: number;
    amountCents: number;
    createdAt: string;
    paidAt?: string | null;
    method?: string;
    sellerId?: string | null;
  };
  campaign: {
    title: string;
    slug: string;
    totalQuotas: number;
    /** O método de apuração: com ele, a numeração da tela começa em zero. */
    metodoApuracao?: string | null;
    status: string;
    drawAt?: string | null;
    /** Último adiamento aprovado: quem pagou antes recebe tudo de volta. */
    adiadoEm?: string | null;
    prizeTitle?: string;
  };
  organizador?: { nome: string | null; slug: string | null };
  numbers: number[];
}

interface Conta {
  orders: OrderRow[];
  phone: string;
  cliente: string | null;
  reembolso: boolean;
  /** Taxa administrativa do reembolso fora dos 7 dias (shared/reembolso.ts). */
  taxaReembolsoPct?: number;
  /**
   * Sobrou compra antiga, feita só pelo telefone e sem CPF gravado, que a
   * conta ainda não provou ser dela. A tela avisa e oferece a confirmação do
   * telefone da própria conta (`ConfirmarTelefoneDaConta`: o código vai ao
   * número gravado e a sessão não troca) — a mesma de "Complete sua conta".
   */
  comprasAntigasOcultas?: boolean;
}

/** A lista de Minhas compras: confirmar o telefone e resgatar bônus a invalidam. */
const MINHAS_COMPRAS = ["/api/public/my-quotas"];

interface ChamadoResumo {
  id: string;
  protocolo: string;
  status: StatusChamado;
  disputa: StatusDisputa | null;
  pedido: number;
  rifa: string;
  prazoEstornoAte: string | null;
  createdAt: string;
}

/** Sem senha: telefone + código de acesso. */
export default function MinhasCotas() {
  const qc = useQueryClient();
  // Quem já confirmou o telefone nesta sessão não digita o código de novo. É
  // uma consulta (não um efeito solto): confirmar o telefone ou resgatar bônus
  // a invalida e a lista se refaz — com as compras antigas e a taxa do reembolso.
  const { data, isPending, isFetching } = useQuery<Conta | null>({
    queryKey: MINHAS_COMPRAS,
    queryFn: getQueryFn({ on401: "returnNull" }),
    refetchOnMount: "always",
  });
  const conta = data ?? null;
  const restaurando = isPending || (isFetching && !conta);
  const setConta = (c: Conta | null) => {
    qc.setQueryData(MINHAS_COMPRAS, c);
    // A resposta de quem acabou de entrar não traz tudo o que a lista traz
    // (`comprasAntigasOcultas`, `taxaReembolsoPct`): a tela busca de novo.
    if (c) qc.invalidateQueries({ queryKey: MINHAS_COMPRAS });
  };

  return (
    <PublicShell>
      <h1 className="font-display text-xl font-extrabold">Minhas compras</h1>
      <p className="mt-1 text-sm text-muted">
        Suas cotas em cada rifa, com a segunda via do bilhete.
      </p>
      {restaurando ? null : conta ? (
        <Painel conta={conta} aoMudar={setConta} />
      ) : (
        <>
          <Entrar aoEntrar={setConta} />
          <p className="mt-3 text-center text-sm text-muted">
            Tem conta?{" "}
            <Link href="/entrar" className="text-green-deep underline">
              entre com a senha
            </Link>{" "}
            ·{" "}
            <Link href="/criar-conta" className="text-green-deep underline">
              criar conta
            </Link>
          </p>
        </>
      )}
    </PublicShell>
  );
}

/**
 * Entrar sem conta, pelo telefone e o código do WhatsApp (a sessão nasce de
 * novo). A conta que já entrou confirma o telefone dela por
 * `ConfirmarTelefoneDaConta`, que não troca a sessão.
 */
function Entrar({ aoEntrar }: { aoEntrar: (c: Conta) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/public/my-quotas/request-code", { phone });
      return (await res.json()) as { devCode?: string };
    },
    onSuccess: (data) => {
      setDevCode(data.devCode ?? null);
      setStep("code");
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const verify = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/public/my-quotas/verify", { code });
      return (await res.json()) as Conta;
    },
    onSuccess: aoEntrar,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card>
      <div className="space-y-3 p-4">
        <Campo rotulo="WhatsApp">
          <input
            value={phone}
            inputMode="tel"
            autoComplete="tel"
            disabled={step === "code"}
            onChange={(e) => setPhone(e.target.value)}
            className="campo tnum text-sm disabled:bg-mist"
          />
        </Campo>

        {step === "code" ? (
          <Campo
            rotulo="Código de 6 dígitos"
            dica={devCode ? <span className="tnum text-yellow-deep">desenvolvimento — seu código é {devCode}</span> : undefined}
          >
            <input
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="campo tnum text-lg tracking-[0.3em]"
            />
          </Campo>
        ) : null}

        {error ? <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p> : null}

        <Button
          className="w-full"
          disabled={request.isPending || verify.isPending}
          onClick={() => (step === "phone" ? request.mutate() : verify.mutate())}
        >
          {step === "phone" ? "Receber código" : "Confirmar"}
        </Button>
      </div>
    </Card>
  );
}

/**
 * Confirmar o telefone da própria conta (`/conta/telefone/codigo` e
 * `/confirmar`): o código vai ao número gravado na conta — não há campo de
 * número — e a sessão continua a mesma (o "lembrar" fica). Confirmado, a
 * lista de Minhas compras se refaz e as compras antigas aparecem.
 */
function ConfirmarTelefoneDaConta({ telefone }: { telefone: string }) {
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const erro = (e: Error) => setMsg({ ok: false, texto: e.message });
  const pedir = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/public/conta/telefone/codigo", {})).json() as Promise<{ devCode?: string }>,
    onSuccess: (r) => {
      setEnviado(true);
      setDevCode(r.devCode ?? null);
      setMsg({ ok: true, texto: "Enviamos um código pelo WhatsApp." });
    },
    onError: erro,
  });
  const confirmar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/public/conta/telefone/confirmar", { codigo }),
    onSuccess: () => {
      setEnviado(false);
      setCodigo("");
      setDevCode(null);
      setMsg({ ok: true, texto: "Telefone confirmado." });
      qc.invalidateQueries({ queryKey: MINHAS_COMPRAS });
      qc.invalidateQueries({ queryKey: ["/api/public/conta"] });
      qc.invalidateQueries({ queryKey: ["/api/public/conta/perfil"] });
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: erro,
  });
  return (
    <div className="space-y-2">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          pedir.mutate();
        }}
      >
        <p className="min-w-0 flex-1 basis-48 text-ink-2">
          O código vai para o WhatsApp da conta, <strong className="tnum whitespace-nowrap">{maskPhone(telefone)}</strong>.
        </p>
        <Button type="submit" variant={enviado ? "contorno" : "primario"} disabled={pedir.isPending}>
          {enviado ? "Enviar de novo" : "Enviar código"}
        </Button>
      </form>
      {enviado ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            confirmar.mutate();
          }}
        >
          <Campo
            rotulo="Código de 6 dígitos"
            className="min-w-0 flex-1 basis-40"
            dica={devCode ? <span className="tnum">desenvolvimento — seu código é {devCode}</span> : undefined}
          >
            <input
              className="campo tnum"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            />
          </Campo>
          <Button type="submit" disabled={confirmar.isPending || codigo.length < 6}>
            Confirmar telefone
          </Button>
        </form>
      ) : null}
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-green-deep" : "text-red"}>
          {msg.texto}
        </p>
      ) : null}
    </div>
  );
}

type AbaDaConta = "cotas" | "chamados" | "conta" | "bonus" | "salvos";
/** O nome de cada aba na URL (`?aba=`); a primeira não leva parâmetro. */
const ABA_NA_URL: Record<AbaDaConta, string | null> = {
  cotas: null,
  chamados: "reembolsos",
  bonus: "bonus",
  salvos: "salvos",
  conta: "conta",
};

function Painel({ conta, aoMudar }: { conta: Conta; aoMudar: (c: Conta | null) => void }) {
  const qc = useQueryClient();
  // A aba vai na URL (?aba=reembolsos, ?aba=conta): o menu do apostador abre
  // direto nela, trocar de aba a grava (sem entrada nova no histórico) e recarregar a mantém.
  const busca = useSearch();
  const [local, navegar] = useLocation();
  const abaDaUrl = (): AbaDaConta => {
    const q = new URLSearchParams(busca).get("aba");
    return q === "conta" ? "conta" : q === "reembolsos" ? "chamados" : q === "bonus" ? "bonus" : q === "salvos" ? "salvos" : "cotas";
  };
  const [aba, setAba] = useState(abaDaUrl);
  useEffect(() => setAba(abaDaUrl()), [busca]);
  const botoesDasAbas = useRef<Partial<Record<AbaDaConta, HTMLButtonElement | null>>>({});
  // A fileira rola para o lado no celular: a aba aberta pela URL fica à vista.
  useEffect(() => {
    botoesDasAbas.current[aba]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [aba]);
  const abrirAba = (v: AbaDaConta, foco = false) => {
    setAba(v);
    setChamadoAberto(null);
    const q = ABA_NA_URL[v];
    navegar(q ? `${local}?aba=${q}` : local, { replace: true });
    if (foco) botoesDasAbas.current[v]?.focus();
  };
  const [pedindo, setPedindo] = useState<OrderRow | null>(null);
  const [chamadoAberto, setChamadoAberto] = useState<string | null>(null);

  const { data: meus } = useQuery<{ cliente: string; chamados: ChamadoResumo[] }>({
    queryKey: ["/api/public/chamados"],
    enabled: Boolean(conta.cliente),
  });
  const chamados = meus?.chamados ?? [];
  // Programa de bônus (etapa 13): a aba só existe com ele ligado.
  const { data: bonus } = useQuery<EstadoBonus | { ligado: false }>({ queryKey: ["/api/public/bonus"] });
  const emAndamento = new Set(
    chamados.filter((c) => c.status === "aberto" || c.status === "aprovado").map((c) => c.pedido),
  );
  const abasDaConta: [AbaDaConta, string][] = [
    ["cotas", "Minhas compras"],
    ["chamados", `Reembolsos${chamados.length ? ` (${chamados.length})` : ""}`],
    ...(bonus?.ligado ? ([["bonus", `Bônus${bonus.saldo > 0 ? ` (${bonus.saldo})` : ""}`]] as [AbaDaConta, string][]) : []),
    ["salvos", "Salvos"],
    ["conta", "Minha conta"],
  ];

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="tnum text-muted">{maskPhone(conta.phone)}</span>
        {conta.cliente ? (
          <span className="rounded-md bg-mist-2 px-2 py-1 text-xs">
            Seu ID de cliente: <strong className="tnum">{conta.cliente}</strong>
          </span>
        ) : null}
      </div>

      {/* As abas numa fileira que rola para o lado no celular (o Figma corta "Minha conta" na borda). */}
      <div className="relative mt-3 overflow-x-auto">
        <div className="flex min-w-max gap-1" role="tablist" aria-label="Minhas compras e minha conta">
          {abasDaConta.map(([v, rotulo], i) => (
            <button
              key={v}
              ref={(el) => {
                botoesDasAbas.current[v] = el;
              }}
              type="button"
              role="tab"
              id={`aba-${v}`}
              aria-selected={aba === v}
              aria-controls={`painel-${v}`}
              tabIndex={aba === v ? 0 : -1}
              onClick={() => abrirAba(v)}
              onKeyDown={(e) => {
                const alvo = abaDoTeclado(e.key, i, abasDaConta.length);
                if (alvo === null) return;
                e.preventDefault();
                abrirAba(abasDaConta[alvo][0], true);
              }}
              className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-lg px-3.5 text-sm ${
                aba === v ? "bg-green font-semibold text-on-green" : "font-medium text-ink-2 hover:bg-mist-2"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {conta.comprasAntigasOcultas ? (
        <div className="mt-3 rounded-md border border-yellow bg-yellow-soft px-3 py-2 text-sm text-yellow-deep">
          <p className="font-semibold">Há compras antigas deste telefone para trazer</p>
          <p className="text-xs">
            Foram feitas antes da conta e sem CPF, então não dá para provar que são suas pelo
            cadastro. Confirme o número pelo código do WhatsApp e elas aparecem aqui.
          </p>
          {conta.phone ? (
            <div className="mt-2 rounded-lg bg-white p-3 text-ink">
              <ConfirmarTelefoneDaConta telefone={conta.phone} />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* A aba aberta pela URL pode não estar na fileira (o Bônus com o programa
          desligado): aí o painel leva o nome em texto, nunca um id que não existe. */}
      <div
        role="tabpanel"
        id={`painel-${aba}`}
        {...(abasDaConta.some(([v]) => v === aba)
          ? { "aria-labelledby": `aba-${aba}` }
          : { "aria-label": aba === "bonus" ? "Bônus" : "Minhas compras" })}
      >
      {aba === "salvos" ? (
        <Salvos />
      ) : aba === "conta" ? (
        <MinhaConta
          aoSair={() => aoMudar(null)}
          telefone={conta.phone}
          // O aviso das compras antigas, acima, já traz a confirmação do telefone.
          confirmarAqui={!conta.comprasAntigasOcultas}
        />
      ) : aba === "bonus" ? (
        bonus?.ligado ? <BonusDoComprador dados={bonus} /> : <Empty>O programa de bônus não está ativo.</Empty>
      ) : aba === "cotas" ? (
        <>
          {conta.orders.length === 0 ? (
            <Empty>
              Nenhuma compra ainda.{" "}
              <Link href="/" className="text-green-deep underline">
                Ver as rifas
              </Link>
              .
            </Empty>
          ) : null}
          <ComprasPorRifa
            orders={conta.orders}
            podePedir={(row) =>
              Boolean(
                conta.cliente &&
                  !emAndamento.has(row.order.code) &&
                  !bloqueioDoReembolso({
                    estornoLigado: conta.reembolso,
                    statusPedido: row.order.status,
                    statusRifa: row.campaign.status,
                    sorteioEm: row.campaign.drawAt ? new Date(row.campaign.drawAt) : null,
                  }),
              )
            }
            emAndamento={emAndamento}
            pedir={setPedindo}
          />
          {conta.orders.length ? <RegraDoReembolso conta={conta} /> : null}
        </>
      ) : chamadoAberto ? (
        <ChamadoDoComprador id={chamadoAberto} voltar={() => setChamadoAberto(null)} />
      ) : (
        <div className="mt-3">
          <Card>
            {chamados.length ? (
              <ul className="divide-y divide-line">
                {chamados.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left hover:bg-mist"
                      onClick={() => setChamadoAberto(c.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="tnum text-sm font-semibold">{c.protocolo}</span>
                        {c.disputa ? (
                          <Pill status={PILL_DISPUTA[c.disputa]}>{NOME_STATUS_DISPUTA[c.disputa]}</Pill>
                        ) : (
                          <Pill status={situacaoDoChamado(c, "comprador").pill}>{situacaoDoChamado(c, "comprador").rotulo}</Pill>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        {c.rifa} · pedido <span className="tnum">#{c.pedido}</span>
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhum pedido de reembolso. Quando couber, o pedido sai de cada compra, em “Minhas compras”.</Empty>
            )}
          </Card>
          <RegraDoReembolso conta={conta} />
        </div>
      )}
      </div>

      {pedindo ? (
        <PedirReembolso
          row={pedindo}
          taxaPct={conta.taxaReembolsoPct ?? TAXA_REEMBOLSO_PADRAO_PCT}
          fechar={() => setPedindo(null)}
          aoAbrir={(id) => {
            setPedindo(null);
            qc.invalidateQueries({ queryKey: ["/api/public/chamados"] });
            abrirAba("chamados");
            setChamadoAberto(id);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * A regra do reembolso em vigor, a mesma que a página da rifa mostra antes do
 * Pix (`regraDoReembolso()` com a taxa de agora; desligado o pedido pelo site,
 * `regraSemReembolsoPeloSite()`). Texto longo: fica num "Como funciona".
 */
function RegraDoReembolso({ conta }: { conta: Conta }) {
  return (
    <details className="mt-4 rounded-lg border border-line px-4 py-3 text-sm">
      <summary className="min-h-6 cursor-pointer font-semibold">Como funciona o reembolso</summary>
      <p className="mt-2 text-ink-2">
        {conta.reembolso ? regraDoReembolso(conta.taxaReembolsoPct ?? TAXA_REEMBOLSO_PADRAO_PCT) : regraSemReembolsoPeloSite()}
      </p>
    </details>
  );
}

function PedirReembolso({
  row,
  taxaPct,
  fechar,
  aoAbrir,
}: {
  row: OrderRow;
  taxaPct: number;
  fechar: () => void;
  aoAbrir: (id: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [cpf, setCpf] = useState("");
  const [pixChave, setPixChave] = useState("");
  const [anexo, setAnexo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const abrir = useMutation({
    mutationFn: async () =>
      (await (
        await apiRequest("POST", "/api/public/chamados", {
          orderCode: row.order.code,
          motivo,
          cpf,
          pixChave: pixChave || undefined,
          anexo,
        })
      ).json()) as { id: string; protocolo: string },
    onSuccess: (r) => aoAbrir(r.id),
    onError: (e: Error) => setErro(e instanceof ApiError ? e.message : "Não foi possível enviar."),
  });

  const pronto = motivo.trim().length >= 10 && cpfValido(cpf);

  return (
    <Janela onFechar={fechar} rotuloPor="titulo-reembolso" className="p-4">
      <h2 id="titulo-reembolso" className="font-display text-lg font-bold">
        Pedir reembolso
      </h2>
      <p className="mt-1 text-xs text-muted">
        {row.campaign.title} · pedido <span className="tnum">#{row.order.code}</span> ·{" "}
        <Money cents={row.order.amountCents} />
      </p>
      {(() => {
        // O mesmo cálculo que o servidor grava ao receber o pedido.
        const c = calcularReembolso({
          pagoCents: row.order.amountCents,
          vendaOnline: !row.order.sellerId && (row.order.method ?? "pix_online") === "pix_online",
          compradoEm: new Date(row.order.paidAt ?? row.order.createdAt),
          pedidoEm: new Date(),
          taxaPct,
          adiadoEm: row.campaign.adiadoEm ? new Date(row.campaign.adiadoEm) : null,
        });
        return (
          <div className="mt-2 rounded-md border border-line bg-mist px-3 py-2 text-sm">
            <p>
              Você recebe <strong className="tnum">{formatBRL(c.devolverCents)}</strong>
              {c.taxaCents > 0 ? (
                <>
                  {" "}
                  (taxa administrativa de <span className="tnum">{c.taxaPct}%</span>:{" "}
                  <span className="tnum">{formatBRL(c.taxaCents)}</span>)
                </>
              ) : null}
            </p>
            <p className="text-xs text-muted">{NOME_TIPO_REEMBOLSO[c.tipo]}</p>
          </div>
        );
      })()}
      <p className="mt-2 rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
        A organização da rifa analisa cada pedido. Aprovado, você recebe o protocolo e o prazo de
        devolução aqui. Com Pix, o valor volta para a mesma conta que pagou.
      </p>

      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          abrir.mutate();
        }}
      >
        <Campo rotulo="Motivo" dica="Conte o que aconteceu, com pelo menos 10 caracteres.">
          <textarea rows={3} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
        <Campo rotulo="CPF de quem comprou">
          <input
            inputMode="numeric"
            value={cpf}
            onChange={(e) => setCpf(maskCpf(e.target.value))}
            className="campo tnum text-sm"
          />
        </Campo>
        <Campo rotulo="Chave Pix (opcional — só se a compra não foi por Pix)">
          <input maxLength={140} value={pixChave} onChange={(e) => setPixChave(e.target.value)} />
        </Campo>
        <div>
          <span className="label-xs">Print do bilhete ou do comprovante (opcional)</span>
          {/* O botão é o rótulo: o campo nativo mostraria "Choose File" na língua do navegador. */}
          <label className="relative mt-1 flex w-fit cursor-pointer items-center rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold hover:bg-mist focus-within:ring-2 focus-within:ring-green">
            {anexo ? "Trocar o print" : "Anexar um print"}
            <input
              id="print"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return setAnexo(null);
                try {
                  setAnexo(await lerImagem(f));
                  setErro(null);
                } catch (err) {
                  setErro((err as Error).message);
                  e.target.value = "";
                }
              }}
            />
          </label>
          {anexo ? <img src={anexo} alt="Prévia do print" className="mt-2 max-h-40 rounded-md border border-line" /> : null}
        </div>

        {erro ? <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p> : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={!pronto || abrir.isPending}>
            {abrir.isPending ? "Enviando…" : "Enviar pedido"}
          </Button>
          <Button type="button" variant="ghost" onClick={fechar}>
            Cancelar
          </Button>
        </div>
      </form>
    </Janela>
  );
}

function ChamadoDoComprador({ id, voltar }: { id: string; voltar: () => void }) {
  const qc = useQueryClient();
  const chave = [`/api/public/chamados/${id}`];
  const { data } = useQuery<{
    protocolo: string;
    status: StatusChamado;
    formaDevolucao?: string | null;
    pedido: number;
    rifa: string;
    decisao: string | null;
    prazoEstornoAte: string | null;
    devolverCents: number | null;
    taxaCents: number | null;
    taxaPct: number | null;
    disputa: StatusDisputa | null;
    disputaDecisao: string | null;
    podeDisputar: boolean;
    disputaBloqueio: string | null;
    disputaLiberadaEm: string | null;
    mensagens: Mensagem[];
  }>({ queryKey: chave, refetchInterval: 20_000 });

  const enviar = useMutation({
    mutationFn: (m: { texto: string; anexo?: string }) =>
      apiRequest("POST", `/api/public/chamados/${id}/mensagens`, m),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  });

  if (!data) return <Empty>Carregando…</Empty>;
  const emAndamento = data.status === "aberto" || data.status === "aprovado" || data.disputa === "aberta";

  return (
    <div className="mt-3">
      <button type="button" onClick={voltar} className="mb-2 inline-flex min-h-6 items-center text-xs text-muted underline">
        ← todos os pedidos de reembolso
      </button>
      <Card
        title={`Protocolo ${data.protocolo}`}
        right={
          data.disputa ? (
            <Pill status={PILL_DISPUTA[data.disputa]}>{NOME_STATUS_DISPUTA[data.disputa]}</Pill>
          ) : (
            <Pill status={situacaoDoChamado(data, "comprador").pill}>{situacaoDoChamado(data, "comprador").rotulo}</Pill>
          )
        }
      >
        <p className="border-b border-line px-4 py-2 text-xs text-muted">
          {data.rifa} · pedido <span className="tnum">#{data.pedido}</span>
          {data.devolverCents !== null ? (
            <>
              {" "}
              · a devolver <strong className="tnum">{formatBRL(data.devolverCents)}</strong>
              {data.taxaCents ? (
                <span className="tnum"> (taxa {data.taxaPct}%: {formatBRL(data.taxaCents)})</span>
              ) : null}
            </>
          ) : null}
          {data.status === "aprovado" && data.prazoEstornoAte ? (
            <>
              {" "}
              · devolução até{" "}
              <strong className="tnum text-yellow-deep">
                {new Date(data.prazoEstornoAte).toLocaleDateString("pt-BR")}
              </strong>
            </>
          ) : null}
        </p>
        <Conversa
          mensagens={data.mensagens}
          meuLado="comprador"
          anexoBase="/api/public/chamados/anexos"
          podeEscrever={emAndamento}
          enviando={enviar.isPending}
          enviar={(m) => enviar.mutateAsync(m)}
        />
      </Card>
      <Disputa id={id} dados={data} aoAbrir={() => qc.invalidateQueries({ queryKey: chave })} />
    </div>
  );
}

/**
 * Levar o caso à plataforma: depois da recusa (até 7 dias) ou quando a
 * organização não responde. A régua é a do servidor (`bloqueioDaDisputa`);
 * aqui só se mostra o botão e o motivo de não poder.
 */
function Disputa({
  id,
  dados,
  aoAbrir,
}: {
  id: string;
  dados: {
    status: StatusChamado;
    formaDevolucao?: string | null;
    disputa: StatusDisputa | null;
    disputaDecisao: string | null;
    podeDisputar: boolean;
    disputaBloqueio: string | null;
    disputaLiberadaEm: string | null;
  };
  aoAbrir: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const abrir = useMutation({
    mutationFn: () => apiRequest("POST", `/api/public/chamados/${id}/disputa`, { motivo }),
    onSuccess: () => {
      setAberto(false);
      aoAbrir();
    },
    onError: (e: Error) => setErro(e.message),
  });

  if (dados.disputa === "aberta") {
    return (
      <p className="mt-3 rounded-md bg-yellow-soft px-3 py-2 text-sm text-yellow-deep">
        O caso está com a plataforma. A decisão dela encerra o caso aqui no site e chega aqui e no seu celular. {DIREITO_DO_CONSUMIDOR}
      </p>
    );
  }
  if (dados.disputa) {
    return (
      <div className="mt-3 rounded-md border border-line bg-white px-3 py-2 text-sm">
        <p className="font-semibold">Decisão da plataforma: {dados.disputa === "procedente" ? "a seu favor" : "recusa mantida"}</p>
        {dados.disputaDecisao ? <p className="mt-1 text-muted">{dados.disputaDecisao}</p> : null}
        {dados.disputa === "improcedente" ? <p className="mt-1 text-xs text-muted">{DIREITO_DO_CONSUMIDOR}</p> : null}
      </div>
    );
  }
  if (!dados.podeDisputar) {
    // Aberto e ainda no prazo da organização: diz quando poderá recorrer.
    if (dados.status === "aberto" && dados.disputaLiberadaEm && new Date(dados.disputaLiberadaEm) > new Date()) {
      return (
        <p className="mt-3 text-xs text-muted">
          Sem resposta até <span className="tnum">{new Date(dados.disputaLiberadaEm).toLocaleDateString("pt-BR")}</span>, você
          poderá levar o caso à plataforma.
        </p>
      );
    }
    return dados.status === "recusado" && dados.disputaBloqueio ? (
      <p className="mt-3 text-xs text-muted">
        {dados.disputaBloqueio} {DIREITO_DO_CONSUMIDOR}
      </p>
    ) : null;
  }

  const problema = problemaNaDisputa(motivo);
  return (
    <div className="mt-3">
      <Card title="Não concorda?">
        <div className="space-y-2 p-4 text-sm">
          <p className="text-muted">
            {dados.status === "recusado"
              ? `Você pode levar a recusa à plataforma em até ${DISPUTA_PRAZO_DIAS} dias. A decisão dela encerra o caso aqui no site. ${DIREITO_DO_CONSUMIDOR}`
              : `A organização não respondeu no prazo. Você pode levar o caso à plataforma, que decide no lugar dela. ${DIREITO_DO_CONSUMIDOR}`}
          </p>
          {aberto ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                setErro(null);
                abrir.mutate();
              }}
            >
              <Campo rotulo="Por que você discorda" erro={erro}>
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} maxLength={1000} />
              </Campo>
              <div className="flex gap-2">
                <Button type="submit" disabled={Boolean(problema) || abrir.isPending}>
                  {abrir.isPending ? "Enviando…" : "Enviar à plataforma"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                  Cancelar
                </Button>
              </div>
              {problema && motivo ? <p className="text-xs text-muted">{problema}</p> : null}
            </form>
          ) : (
            <Button variant="ghost" onClick={() => setAberto(true)}>
              Levar à plataforma
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

interface DadosConta {
  nome: string;
  telefone: string | null;
  google: boolean;
  soGoogle: boolean;
  falta: string[];
  cpf: string | null;
  email: string | null;
  codigo: string | null;
  temSenha: boolean;
  telefoneConfirmado: boolean;
  sessaoConfirmada: boolean;
  perfilPublico: boolean;
  cep: string | null;
  cidade: string | null;
  uf: string | null;
}

/** Dados da conta, senha, sair e exclusão (LGPD). */
/** As publicações que a pessoa salvou (o marcador da barra de ações) — só ela vê. */
function Salvos() {
  const { data } = useQuery<RifaDoFeed[]>({ queryKey: ["/api/public/conta/salvos"] });
  if (!data) return <Empty>Carregando…</Empty>;
  if (data.length === 0) {
    return <Empty>Nada salvo ainda. Toque no marcador embaixo de uma publicação para guardar a rifa aqui.</Empty>;
  }
  return (
    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {data.map((r) => (
        <CartaoDoFeed key={r.id} rifa={r} />
      ))}
    </div>
  );
}

/**
 * "Complete sua conta": a mesma lista do ponto na foto do perfil
 * (`pendenciasDaConta()`, por `usePendencias()`), e o que dá para fazer aqui
 * mesmo — o CPF e o telefone da conta do Google, e a confirmação do telefone
 * da conta pelo código do WhatsApp (`ConfirmarTelefoneDaConta`, sem trocar a
 * sessão). O apelido mora em "Meu perfil público", logo abaixo.
 */
function CompletarConta({
  dados,
  pendencias,
  telefone,
  confirmarAqui,
}: {
  dados: DadosConta;
  pendencias: string[];
  /** O telefone da conta: o código vai para ele, nunca para outro número. */
  telefone: string;
  confirmarAqui: boolean;
}) {
  const qc = useQueryClient();
  const { data: sessao } = useSession();
  const [cpf, setCpf] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["/api/public/conta"] });
    qc.invalidateQueries({ queryKey: ["/api/public/conta/perfil"] });
    qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    qc.invalidateQueries({ queryKey: MINHAS_COMPRAS });
  };
  const erro = (e: Error) => setMsg({ ok: false, texto: e.message });
  const salvarCpf = useMutation({
    mutationFn: () => apiRequest("POST", "/api/public/conta/cpf", { cpf }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "CPF salvo." });
      atualizar();
    },
    onError: erro,
  });
  const pedir = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/public/conta/telefone/codigo", { telefone: novoTelefone })).json(),
    onSuccess: (r: { devCode?: string }) => {
      setEnviado(true);
      setMsg({ ok: true, texto: r.devCode ? `Código (desenvolvimento): ${r.devCode}` : "Enviamos um código pelo WhatsApp." });
    },
    onError: erro,
  });
  const confirmar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/public/conta/telefone/confirmar", { codigo }),
    onSuccess: () => {
      setEnviado(false);
      setCodigo("");
      setMsg({ ok: true, texto: "Telefone confirmado." });
      atualizar();
    },
    onError: erro,
  });
  const faltaTelefoneDoGoogle = dados.falta.includes("telefone");
  const confirmarTelefone =
    confirmarAqui && !faltaTelefoneDoGoogle && Boolean(telefone) && !dados.telefoneConfirmado && !sessao?.buyer?.confirmado;
  return (
    <section aria-labelledby="titulo-completar" className="rounded-xl border border-green bg-green-soft p-3.5 text-sm">
      <h2 id="titulo-completar" className="font-bold text-green-deep">
        Complete sua conta
      </h2>
      <ul className="mt-1 list-disc pl-5 text-ink-2">
        {pendencias.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div className="mt-3 space-y-4">
        {dados.falta.includes("CPF") ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              salvarCpf.mutate();
            }}
          >
            <Campo rotulo="CPF" className="min-w-0 flex-1 basis-40">
              <input className="campo tnum" inputMode="numeric" autoComplete="off" value={cpf} onChange={(e) => setCpf(e.target.value)} />
            </Campo>
            <Button type="submit" disabled={salvarCpf.isPending || cpf.replace(/\D/g, "").length !== 11}>
              Salvar CPF
            </Button>
          </form>
        ) : null}
        {faltaTelefoneDoGoogle ? (
          <div className="space-y-2">
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                pedir.mutate();
              }}
            >
              <Campo rotulo="WhatsApp (com DDD)" className="min-w-0 flex-1 basis-40">
                <input className="campo tnum" inputMode="tel" autoComplete="tel" value={novoTelefone} onChange={(e) => setNovoTelefone(e.target.value)} />
              </Campo>
              <Button type="submit" disabled={pedir.isPending || novoTelefone.replace(/\D/g, "").length < 10}>
                {enviado ? "Enviar de novo" : "Enviar código"}
              </Button>
            </form>
            {enviado ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  confirmar.mutate();
                }}
              >
                <Campo rotulo="Código recebido" className="min-w-0 flex-1 basis-40">
                  <input className="campo tnum" inputMode="numeric" autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
                </Campo>
                <Button type="submit" disabled={confirmar.isPending || codigo.length < 6}>
                  Confirmar telefone
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
        {confirmarTelefone ? <ConfirmarTelefoneDaConta telefone={telefone} /> : null}
        {msg ? (
          <p role="status" className={msg.ok ? "text-green-deep" : "text-red"}>
            {msg.texto}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Ligar ou desligar o Google de uma conta que já existe (nunca por e-mail, só de dentro dela). */
function GoogleCard({ dados }: { dados: DadosConta }) {
  const qc = useQueryClient();
  const { data: disp } = useQuery<{ ligado: boolean }>({ queryKey: ["/api/public/conta/google/disponivel"] });
  const [msg, setMsg] = useState<string | null>(null);
  const desligar = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/public/conta/google"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/public/conta"] }),
    onError: (e: Error) => setMsg(e.message),
  });
  if (!disp?.ligado) return null;
  return (
    <Card title="Entrar com o Google">
      <div className="space-y-2 p-4 text-sm">
        {dados.google ? (
          <>
            <p>
              <Pill status="paid">ligado</Pill> Você pode entrar com o Google nesta conta.
            </p>
            {dados.soGoogle ? null : (
              <Button variant="ghost" onClick={() => desligar.mutate()} disabled={desligar.isPending}>
                Desligar o Google
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-muted">Ligue sua conta Google para entrar sem digitar a senha.</p>
            <a
              className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-[13px] font-semibold ${TONS_DO_BOTAO.contorno}`}
              href="/api/public/conta/google/ligar?volta=/minhas-cotas%3Faba%3Dconta"
            >
              Ligar o Google
            </a>
          </>
        )}
        {msg ? <p role="alert" className="text-red">{msg}</p> : null}
      </div>
    </Card>
  );
}

function MinhaConta({
  aoSair,
  telefone,
  confirmarAqui,
}: {
  aoSair: () => void;
  telefone: string;
  confirmarAqui: boolean;
}) {
  const qc = useQueryClient();
  const { data } = useQuery<DadosConta>({ queryKey: ["/api/public/conta"] });
  const pendencias = usePendencias();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [senhaExcluir, setSenhaExcluir] = useState("");
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const sair = useMutation({
    mutationFn: () => apiRequest("POST", "/api/public/conta/sair"),
    onSuccess: () => {
      qc.invalidateQueries();
      aoSair();
    },
  });
  const trocar = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/public/conta/senha", { atual, nova }),
    onSuccess: () => {
      setAtual("");
      setNova("");
      setMsg({ ok: true, texto: "Senha salva." });
      qc.invalidateQueries({ queryKey: ["/api/public/conta"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const publico = useMutation({
    mutationFn: (valor: boolean) => apiRequest("PUT", "/api/public/conta/perfil-publico", { publico: valor }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/public/conta"] }),
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const excluir = useMutation({
    mutationFn: () => apiRequest("POST", "/api/public/conta/excluir", { senha: senhaExcluir }),
    onSuccess: () => {
      qc.invalidateQueries();
      aoSair();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  if (!data) return <Empty>Carregando…</Empty>;
  const pedeAtual = data.temSenha && !data.sessaoConfirmada;
  const semSenhaMasConta = data.soGoogle;

  return (
    <div className="mt-3 space-y-3">
      {pendencias.length ? (
        <CompletarConta dados={data} pendencias={pendencias} telefone={telefone} confirmarAqui={confirmarAqui} />
      ) : null}
      <PerfilPublicoCard />
      {data.temSenha || semSenhaMasConta ? (
        <VerificacaoCard
          base="/api/public/conta/verificacao"
          sujeito="apostador"
          foto={<p className="rounded-md bg-yellow-soft px-3 py-2 text-yellow-deep">Ponha uma foto sua, de rosto, em “Meu perfil público”, acima.</p>}
        />
      ) : (
        <Card title="Perfil verificado">
          <p className="p-4 text-sm text-muted">Crie uma senha (abaixo) para ter perfil público e pedir o selo de verificado.</p>
        </Card>
      )}
      <Card title="Meus dados">
        <dl className="grid grid-cols-1 gap-3 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="label-xs">Nome</dt>
            <dd>{data.nome}</dd>
          </div>
          <div>
            <dt className="label-xs">ID de cliente</dt>
            <dd className="tnum">{data.codigo ?? "—"}</dd>
          </div>
          <div>
            <dt className="label-xs">WhatsApp</dt>
            <dd className="tnum">
              {data.telefone ? maskPhone(data.telefone) : "—"}{" "}
              <Pill status={data.telefoneConfirmado ? "paid" : "pending"}>
                {data.telefoneConfirmado ? "confirmado" : "não confirmado"}
              </Pill>
            </dd>
          </div>
          <div>
            <dt className="label-xs">CPF</dt>
            <dd className="tnum">{data.cpf ? maskCpf(data.cpf) : "—"}</dd>
          </div>
          <div>
            <dt className="label-xs">E-mail</dt>
            <dd>{data.email ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      <GoogleCard dados={data} />

      <MinhaRegiaoCard dados={data} />

      <AvisosNoAparelho />

      <Card title="Privacidade">
        <Caixa
          className="p-4"
          marcada={data.perfilPublico}
          disabled={publico.isPending}
          aoMudar={(v) => publico.mutate(v)}
          sub={
            <>
              Em "seguido por…" vai só o primeiro nome; em "quem também joga" vão seu apelido e sua foto (precisa de apelido). Desligado,
              você conta como seguidor e participante, mas ninguém vê quem é.
            </>
          }
        >
          Aparecer em "seguido por…" e em "quem também joga" nas rifas
        </Caixa>
      </Card>

      {msg ? (
        <p className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
          {msg.texto}
        </p>
      ) : null}

      <Card title={data.temSenha ? "Trocar senha" : "Criar senha"}>
        <form
          className="space-y-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            trocar.mutate();
          }}
        >
          {pedeAtual ? (
            <Campo rotulo="Senha atual">
              <input type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
            </Campo>
          ) : null}
          <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres.">
            <input type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
          </Campo>
          <Button type="submit" disabled={trocar.isPending || nova.length < 8 || (pedeAtual && !atual)}>
            Salvar senha
          </Button>
        </form>
      </Card>

      <Button variant="ghost" className="w-full" onClick={() => sair.mutate()}>
        Sair da conta
      </Button>

      <Card title="Excluir conta">
        <div className="space-y-2 p-4 text-sm">
          <p className="text-xs text-muted">
            Seus dados pessoais (nome, WhatsApp, CPF, e-mail e senha) são apagados. As compras,
            bilhetes e recibos continuam guardados pelo prazo que a lei exige, sem ligação com você.
            Cotas de rifas que ainda não foram sorteadas continuam valendo, mas você não conseguirá
            mais acessá-las por aqui.
          </p>
          {confirmaExcluir ? (
            <>
              {data.soGoogle || !data.sessaoConfirmada ? (
                <Campo rotulo={data.soGoogle ? "Digite EXCLUIR para confirmar" : "Sua senha, para confirmar"}>
                  <input
                    type={data.soGoogle ? "text" : "password"}
                    autoComplete={data.soGoogle ? "off" : "current-password"}
                    value={senhaExcluir}
                    onChange={(e) => setSenhaExcluir(e.target.value)}
                  />
                </Campo>
              ) : null}
              <div className="flex gap-2">
                <Button
                  onClick={() => excluir.mutate()}
                  disabled={excluir.isPending || ((data.soGoogle || !data.sessaoConfirmada) && !senhaExcluir)}
                  className="bg-red hover:brightness-95"
                >
                  Excluir definitivamente
                </Button>
                <Button variant="ghost" onClick={() => setConfirmaExcluir(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmaExcluir(true)} className="inline-flex min-h-6 items-center text-xs text-red underline">
              Quero excluir minha conta
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

/** A inicial do organizador no círculo — a foto de perfil entra com o perfil (Fase 5). */
function AvatarOrganizador({ nome }: { nome: string }) {
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green text-sm font-bold text-on-green ring-2 ring-green-soft ring-offset-2"
    >
      {nome.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * As compras agrupadas por rifa: o organizador no topo, o prêmio e a data do
 * sorteio, todos os números pagos juntos, e cada pedido com a segunda via do
 * bilhete.
 */
function ComprasPorRifa({
  orders,
  podePedir,
  emAndamento,
  pedir,
}: {
  orders: OrderRow[];
  podePedir: (row: OrderRow) => boolean;
  emAndamento: Set<number>;
  pedir: (row: OrderRow) => void;
}) {
  // Só compra paga: a pendente fica no carrinho até ser paga ou vencer.
  const grupos = new Map<string, OrderRow[]>();
  for (const o of orders) {
    if (o.order.status !== "paid") continue;
    const g = grupos.get(o.campaign.slug) ?? [];
    g.push(o);
    grupos.set(o.campaign.slug, g);
  }

  return (
    <div className="mt-3 space-y-4">
      {[...grupos.values()].map((pedidos) => {
        const c = pedidos[0].campaign;
        const org = pedidos[0].organizador?.nome ?? "Organizador";
        const pagos = pedidos
          .filter((p) => p.order.status === "paid")
          .flatMap((p) => p.numbers)
          .sort((a, b) => a - b);
        return (
          <Card key={c.slug}>
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <AvatarOrganizador nome={org} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{org}</p>
                <Link href={`/r/${c.slug}`} className="block truncate text-xs leading-6 text-muted underline">
                  {c.title}
                </Link>
              </div>
              <Pill status={c.status} />
            </div>
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
                <span>{c.prizeTitle}</span>
                <span className="tnum">
                  sorteio {c.drawAt ? new Date(c.drawAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "a definir"}
                </span>
              </div>

              <div>
                <p className="label-xs">
                  Suas cotas pagas · <span className="tnum">{pagos.length}</span>
                </p>
                {pagos.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {pagos.map((n) => (
                      <span key={n} className="tnum rounded bg-green px-1.5 py-[2px] text-[11px] text-on-green">
                        {formatQuota(n, c.totalQuotas, numeracaoZero(c.metodoApuracao))}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted">Nenhuma cota paga nesta rifa ainda.</p>
                )}
              </div>

              <ul className="divide-y divide-line rounded-md border border-line">
                {pedidos.map((row) => (
                  <li key={row.order.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                    <span className="tnum font-semibold">#{row.order.code}</span>
                    <Pill status={row.order.status} />
                    <span className="tnum text-muted">
                      {row.order.quantity} cota(s) · <Money cents={row.order.amountCents} />
                    </span>
                    <span className="ml-auto flex gap-3">
                      <Link href={`/bilhete/${row.order.code}`} className="inline-flex min-h-6 items-center text-green-deep underline">
                        2ª via do bilhete
                      </Link>
                      {emAndamento.has(row.order.code) ? (
                        <span className="inline-flex min-h-6 items-center text-yellow-deep">reembolso em andamento</span>
                      ) : podePedir(row) ? (
                        <button type="button" onClick={() => pedir(row)} className="inline-flex min-h-6 items-center text-muted underline">
                          pedir reembolso
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

const TEXTO_PUSH: Record<EstadoPush, string> = {
  sem_suporte: "Este navegador não recebe notificações. O WhatsApp continua avisando pagamento e bilhete.",
  instalar:
    "No iPhone, os avisos só chegam com o app instalado: toque em Compartilhar e em \"Adicionar à Tela de Início\", e abra por lá.",
  bloqueado:
    "As notificações estão bloqueadas neste aparelho. Libere nas configurações do navegador para o site e volte aqui.",
  desligado: "Rifa nova de quem você segue, sorteio chegando, resultado e resposta de reembolso.",
  ligado: "Você recebe: rifa nova de quem você segue (com o sino ligado), sorteio chegando, resultado e resposta de reembolso.",
};

/** Notificações deste aparelho: ligar, desligar e o porquê quando não dá. */
function AvisosNoAparelho() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    void estadoPush().then(setEstado);
  }, []);
  if (!estado) return null;
  const pode = estado === "ligado" || estado === "desligado";
  return (
    <Card
      title="Avisos neste aparelho"
      right={<Pill status={estado === "ligado" ? "active" : "pending"}>{estado === "ligado" ? "ligados" : "desligados"}</Pill>}
    >
      <div className="space-y-3 p-4 text-sm">
        <p className="text-muted">{TEXTO_PUSH[estado]}</p>
        {pode ? (
          <Button
            variant={estado === "ligado" ? "ghost" : "primary"}
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              try {
                setEstado(estado === "ligado" ? await desligarPush() : await ligarPush());
              } finally {
                setOcupado(false);
              }
            }}
          >
            {estado === "ligado" ? "Desligar avisos" : "Ligar avisos"}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** O CEP da conta decide quais rifas aparecem primeiro na vitrine. */
function MinhaRegiaoCard({ dados }: { dados: DadosConta }) {
  const qc = useQueryClient();
  const [cep, setCep] = useState(dados.cep ? maskCep(dados.cep) : "");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const salvar = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/public/conta/cep", { cep })).json(),
    onSuccess: (r: { cidade: string | null; uf: string | null }) => {
      setMsg({ ok: true, texto: r.uf ? `Pronto: ${cidadeUf(r.cidade, r.uf)}.` : "CEP salvo. A cidade aparece em instantes." });
      qc.invalidateQueries({ queryKey: ["/api/public/conta"] });
      qc.invalidateQueries({ queryKey: ["/api/public/campaigns"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  return (
    <Card title="Minha região">
      <form
        className="space-y-2 p-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          salvar.mutate();
        }}
      >
        <p className="text-muted">
          {dados.uf
            ? `As rifas de ${cidadeUf(dados.cidade, dados.uf)} aparecem primeiro na vitrine.`
            : "Informe seu CEP para ver primeiro as rifas perto de você."}
        </p>
        <div className="flex items-end gap-2">
          <Campo rotulo="CEP" className="w-36">
            <input
              inputMode="numeric"
              autoComplete="postal-code"
              value={cep}
              onChange={(e) => setCep(maskCep(e.target.value))}
              className="campo tnum text-sm"
            />
          </Campo>
          <Button type="submit" variant="ghost" disabled={!cepValido(cep) || salvar.isPending}>
            Salvar
          </Button>
        </div>
        {msg ? <p className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}>{msg.texto}</p> : null}
      </form>
    </Card>
  );
}
