import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Pill } from "@/components/bits";
import { CartaoDoPainel } from "@/components/painel";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL, groupNumber } from "@shared/format";
import {
  ADIAMENTO_MAX_DIAS,
  MOTIVO_MIN,
  RESERVA_MAX,
  RESERVA_MIN,
} from "@shared/solicitacoes";

export interface RifaEditavel {
  id: string;
  status: string;
  title: string;
  description: string | null;
  prizeTitle: string;
  totalQuotas: number;
  priceCents: number;
  minPerOrder: number;
  maxPerOrder: number;
  reservationTtlMin: number;
  commissionPctDefault: number;
  drawAt: string | null;
}

type Aviso = { ok: boolean; texto: string } | null;

const CAMPO = "campo text-sm";

function Campo({
  id,
  rotulo,
  children,
  dica,
}: {
  id: string;
  rotulo: string;
  children: React.ReactNode;
  dica?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label-xs">
        {rotulo}
      </label>
      {children}
      {dica ? <p className="mt-1 text-[11px] text-muted">{dica}</p> : null}
    </div>
  );
}

/**
 * Editar a rifa. Rascunho muda na hora. Publicada: o prêmio, o preço e o
 * total ficam travados; o resto, a organização pede e a plataforma analisa
 * (a conversa fica no Atendimento). A plataforma aplica direto.
 */
export function EditarRifaCard({
  rifa,
  daPlataforma,
  edicaoEmAnalise,
  aoPedirAdiamento,
}: {
  rifa: RifaEditavel;
  daPlataforma: boolean;
  edicaoEmAnalise: boolean;
  /** Leva ao cartão do adiamento (aba "Autorização e sorteio"); só na rifa que pode pedir. */
  aoPedirAdiamento?: () => void;
}) {
  const qc = useQueryClient();
  const rascunho = rifa.status === "draft";
  const inicial = () => ({
    title: rifa.title,
    description: rifa.description ?? "",
    prizeTitle: rifa.prizeTitle,
    totalQuotas: rifa.totalQuotas,
    priceCents: rifa.priceCents,
    minPerOrder: rifa.minPerOrder,
    maxPerOrder: rifa.maxPerOrder,
    reservationTtlMin: rifa.reservationTtlMin,
    commissionPctDefault: rifa.commissionPctDefault,
    motivo: "",
  });
  const [f, setF] = useState(inicial);
  const [aviso, setAviso] = useState<Aviso>(null);
  // Outra rifa escolhida (ou a mesma salva): o formulário volta ao que está gravado.
  useEffect(() => {
    setF(inicial());
    setAviso(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rifa.id, rifa.status, rifa.title, rifa.description, rifa.minPerOrder, rifa.maxPerOrder]);

  const salvar = useMutation({
    mutationFn: async () => {
      const corpo: Record<string, unknown> = {
        title: f.title,
        description: f.description,
        minPerOrder: Number(f.minPerOrder),
        maxPerOrder: Number(f.maxPerOrder),
        reservationTtlMin: Number(f.reservationTtlMin),
        commissionPctDefault: Number(f.commissionPctDefault),
      };
      if (rascunho) {
        corpo.prizeTitle = f.prizeTitle;
        corpo.totalQuotas = Number(f.totalQuotas);
        corpo.priceCents = Number(f.priceCents);
      } else if (f.motivo.trim()) {
        corpo.motivo = f.motivo.trim();
      }
      const r = await apiRequest("POST", `/api/admin/campaigns/${rifa.id}/editar`, corpo);
      return (await r.json()) as { aplicada: boolean; protocolo?: string };
    },
    onSuccess: (r) => {
      setAviso(
        r.aplicada
          ? { ok: true, texto: "Rifa atualizada." }
          : {
              ok: true,
              texto: `Enviado para análise da plataforma — protocolo ${r.protocolo}. A rifa muda quando for aprovado; acompanhe em Atendimento › Rifas.`,
            },
      );
      qc.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/solicitacoes"] });
    },
    onError: (e: Error) => setAviso({ ok: false, texto: e.message }),
  });

  const precisaAnalise = !rascunho && !daPlataforma;

  const travado = (rotulo: string) => (rascunho ? rotulo : `${rotulo} (travado)`);
  return (
    <CartaoDoPainel
      titulo="Dados da rifa"
      subtitulo={
        rascunho
          ? "Rascunho: muda na hora. O prêmio, o preço e o total travam ao publicar."
          : precisaAnalise
            ? "Publicada: o prêmio, o preço, o total e a autorização travaram. Mudar o resto vira pedido para a plataforma, e só vale depois de aprovado."
            : "Publicada: o prêmio, o preço, o total e a autorização travaram. A plataforma aplica o resto direto."
      }
      acao={edicaoEmAnalise ? <Pill status="pending">edição em análise</Pill> : undefined}
    >
      <div className="space-y-3 px-5 pb-5 text-sm">
        <Campo id={`ed-titulo-${rifa.id}`} rotulo="Título">
          <input
            id={`ed-titulo-${rifa.id}`}
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            className={CAMPO}
          />
        </Campo>

        <Campo id={`ed-desc-${rifa.id}`} rotulo="Descrição">
          <textarea
            id={`ed-desc-${rifa.id}`}
            rows={4}
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
            className={CAMPO}
          />
        </Campo>

        <Campo
          id={`ed-premio-${rifa.id}`}
          rotulo={travado("Prêmio")}
          dica={rascunho ? "Bem ou serviço, nunca dinheiro. Trava ao publicar." : "Bem ou serviço, nunca dinheiro. Não muda depois de publicar: quem comprou comprou este prêmio."}
        >
          <input
            id={`ed-premio-${rifa.id}`}
            value={f.prizeTitle}
            disabled={!rascunho}
            onChange={(e) => setF({ ...f, prizeTitle: e.target.value })}
            className={`${CAMPO} disabled:bg-mist disabled:text-muted`}
          />
        </Campo>

        {/* Os seis números em duas colunas (o Figma, nó 54:4503): com o menu aberto no tablet, três quebravam os rótulos. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rascunho ? (
            <Campo id={`ed-preco-${rifa.id}`} rotulo="Preço da cota (centavos)" dica={formatBRL(Number(f.priceCents) || 0)}>
              <input
                id={`ed-preco-${rifa.id}`}
                type="number"
                value={f.priceCents}
                onChange={(e) => setF({ ...f, priceCents: Number(e.target.value) })}
                className={`tnum ${CAMPO}`}
              />
            </Campo>
          ) : (
            <Campo id={`ed-preco-${rifa.id}`} rotulo={travado("Preço da cota")}>
              <input id={`ed-preco-${rifa.id}`} value={formatBRL(rifa.priceCents)} disabled className={`tnum ${CAMPO} disabled:bg-mist disabled:text-muted`} />
            </Campo>
          )}
          <Campo id={`ed-total-${rifa.id}`} rotulo={travado("Total de cotas")}>
            {rascunho ? (
              <input
                id={`ed-total-${rifa.id}`}
                type="number"
                value={f.totalQuotas}
                onChange={(e) => setF({ ...f, totalQuotas: Number(e.target.value) })}
                className={`tnum ${CAMPO}`}
              />
            ) : (
              <input id={`ed-total-${rifa.id}`} value={groupNumber(rifa.totalQuotas)} disabled className={`tnum ${CAMPO} disabled:bg-mist disabled:text-muted`} />
            )}
          </Campo>
          <Campo id={`ed-min-${rifa.id}`} rotulo="Mínimo por pedido">
            <input
              id={`ed-min-${rifa.id}`}
              type="number"
              min={1}
              value={f.minPerOrder}
              onChange={(e) => setF({ ...f, minPerOrder: Number(e.target.value) })}
              className={`tnum ${CAMPO}`}
            />
          </Campo>
          <Campo id={`ed-max-${rifa.id}`} rotulo="Máximo por pedido">
            <input
              id={`ed-max-${rifa.id}`}
              type="number"
              min={1}
              value={f.maxPerOrder}
              onChange={(e) => setF({ ...f, maxPerOrder: Number(e.target.value) })}
              className={`tnum ${CAMPO}`}
            />
          </Campo>
          <Campo id={`ed-reserva-${rifa.id}`} rotulo="Tempo da reserva (min)" dica={`De ${RESERVA_MIN} a ${RESERVA_MAX}.`}>
            <input
              id={`ed-reserva-${rifa.id}`}
              type="number"
              min={RESERVA_MIN}
              max={RESERVA_MAX}
              value={f.reservationTtlMin}
              onChange={(e) => setF({ ...f, reservationTtlMin: Number(e.target.value) })}
              className={`tnum ${CAMPO}`}
            />
          </Campo>
          <Campo id={`ed-comissao-${rifa.id}`} rotulo="Comissão padrão do afiliado (%)">
            <input
              id={`ed-comissao-${rifa.id}`}
              type="number"
              min={0}
              max={50}
              value={f.commissionPctDefault}
              onChange={(e) => setF({ ...f, commissionPctDefault: Number(e.target.value) })}
              className={`tnum ${CAMPO}`}
            />
          </Campo>
        </div>

        {precisaAnalise ? (
          <Campo id={`ed-motivo-${rifa.id}`} rotulo="Por que mudar? (vai para quem analisa)">
            <textarea
              id={`ed-motivo-${rifa.id}`}
              rows={2}
              value={f.motivo}
              onChange={(e) => setF({ ...f, motivo: e.target.value })}
              className={CAMPO}
            />
          </Campo>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || edicaoEmAnalise}>
            {precisaAnalise ? "Pedir edição à plataforma" : "Salvar"}
          </Button>
          {aoPedirAdiamento ? (
            <Button variant="contorno" onClick={aoPedirAdiamento}>
              Pedir adiamento
            </Button>
          ) : null}
          {edicaoEmAnalise ? (
            <span className="text-xs text-muted">Já existe uma edição em análise. Veja em Atendimento › Rifas.</span>
          ) : null}
        </div>
        {aviso ? (
          <p role="status" className={`text-xs ${aviso.ok ? "text-green-deep" : "text-red"}`}>
            {aviso.texto}
          </p>
        ) : null}
      </div>
    </CartaoDoPainel>
  );
}

/** `datetime-local` no fuso do aparelho, a partir de uma data. */
function paraCampoDeData(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** O que o adiamento precisa de cada sorteio do calendário (`GET /sorteios-oficiais`). */
interface SorteioDoCalendario {
  id: string;
  loteriaNome: string;
  concurso: number;
  sorteioEm: string;
  problemaParaIntegrar: string | null;
}

/**
 * Adiar o sorteio por não atingir a meta. É pedido: a data só muda quando a
 * plataforma aprovar, e aí quem comprou e quem segue recebem o aviso. A data
 * nova pode ser um sorteio oficial do calendário — é assim que a rifa
 * publicada troca de sorteio oficial (sempre com a plataforma).
 */
export function AdiarSorteioCard({
  rifa,
  vendidas,
  adiamentoEmAnalise,
}: {
  rifa: RifaEditavel;
  vendidas: number;
  adiamentoEmAnalise: boolean;
}) {
  const qc = useQueryClient();
  const atual = rifa.drawAt ? new Date(rifa.drawAt) : null;
  const sugestao = new Date(Math.max(atual?.getTime() ?? 0, Date.now()) + 30 * 86_400_000);
  const [data, setData] = useState(paraCampoDeData(sugestao));
  // Ou um sorteio oficial do calendário: aprovado, a rifa passa a integrá-lo.
  const [oficial, setOficial] = useState("");
  const { data: calendario = [] } = useQuery<SorteioDoCalendario[]>({ queryKey: ["/api/admin/sorteios-oficiais"] });
  const oficiais = calendario.filter(
    (s) => !s.problemaParaIntegrar && (!atual || new Date(s.sorteioEm).getTime() > atual.getTime()),
  );
  const escolhido = oficiais.find((s) => s.id === oficial);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<Aviso>(null);
  const pct = rifa.totalQuotas ? Math.floor((vendidas / rifa.totalQuotas) * 100) : 0;

  const pedir = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/admin/campaigns/${rifa.id}/adiar`,
        escolhido ? { sorteioOficialId: escolhido.id, motivo } : { novaData: new Date(data).toISOString(), motivo },
      );
      return (await r.json()) as { protocolo: string };
    },
    onSuccess: (r) => {
      setAviso({
        ok: true,
        texto: `Pedido enviado — protocolo ${r.protocolo}. A data muda quando a plataforma aprovar; acompanhe em Atendimento › Rifas.`,
      });
      setMotivo("");
      qc.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/solicitacoes"] });
    },
    onError: (e: Error) => setAviso({ ok: false, texto: e.message }),
  });

  return (
    <CartaoDoPainel
      titulo="Adiar o sorteio"
      subtitulo="Só quando a meta não foi atingida. É pedido: a data muda quando a plataforma aprovar."
      acao={adiamentoEmAnalise ? <Pill status="pending">adiamento em análise</Pill> : undefined}
    >
      <div className="space-y-3 px-5 pb-5 text-sm">
        <p className="text-xs text-muted">
          Vendidas <span className="tnum">{groupNumber(vendidas)}</span> de{" "}
          <span className="tnum">{groupNumber(rifa.totalQuotas)}</span> (<span className="tnum">{pct}%</span>). Sorteio
          atual:{" "}
          <span className="tnum">{atual ? atual.toLocaleString("pt-BR") : "—"}</span>.
        </p>
        <p className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
          O adiamento passa por <b>análise da plataforma</b>. Confira antes se a sua autorização
          SPA/MF permite a nova data. Aprovado, quem comprou é avisado e os números continuam valendo.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {oficiais.length ? (
            <Campo
              id={`adiar-oficial-${rifa.id}`}
              rotulo="Sorteio oficial (opcional)"
              dica="Escolhido um sorteio do calendário, a data nova é a dele e a rifa passa a integrá-lo."
            >
              <select
                id={`adiar-oficial-${rifa.id}`}
                value={oficial}
                onChange={(e) => setOficial(e.target.value)}
                className={CAMPO}
              >
                <option value="">Outra data (sem sorteio oficial)</option>
                {oficiais.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.loteriaNome} {s.concurso} · {new Date(s.sorteioEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </option>
                ))}
              </select>
            </Campo>
          ) : null}
          {escolhido ? (
            <p className="self-end text-xs text-muted">
              Nova data: <span className="tnum">{new Date(escolhido.sorteioEm).toLocaleString("pt-BR")}</span>, a do
              sorteio oficial.
            </p>
          ) : (
            <Campo
              id={`adiar-data-${rifa.id}`}
              rotulo="Nova data do sorteio"
              dica={`Pelo menos 24 horas à frente e até ${ADIAMENTO_MAX_DIAS} dias depois da data atual.`}
            >
              <input
                id={`adiar-data-${rifa.id}`}
                type="datetime-local"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={`tnum ${CAMPO}`}
              />
            </Campo>
          )}
        </div>
        <Campo id={`adiar-motivo-${rifa.id}`} rotulo="Motivo do adiamento" dica={`Pelo menos ${MOTIVO_MIN} caracteres.`}>
          <textarea
            id={`adiar-motivo-${rifa.id}`}
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className={CAMPO}
          />
        </Campo>
        <Button
          onClick={() => pedir.mutate()}
          disabled={pedir.isPending || adiamentoEmAnalise || motivo.trim().length < MOTIVO_MIN || (!escolhido && !data)}
        >
          Pedir adiamento
        </Button>
        {aviso ? (
          <p role="status" className={`text-xs ${aviso.ok ? "text-green-deep" : "text-red"}`}>
            {aviso.texto}
          </p>
        ) : null}
      </div>
    </CartaoDoPainel>
  );
}
