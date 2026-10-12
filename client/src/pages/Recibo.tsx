import type { ReactNode } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Card, Empty, Pill } from "@/components/bits";
import { formatBRL } from "@shared/format";

interface Conferencia {
  codigo: string;
  autentico: boolean;
  emitidoEm: string;
  pagador: string;
  beneficiario: string;
  valorCents: number;
  /** IRRF retido (Lucro Presumido ou Real); zero sem retenção. */
  irrfCents?: number;
  hash: string;
}

/** Uma linha do recibo: o rótulo à esquerda e o valor à direita (`numero` vai em DM Mono). */
function Linha({ rotulo, numero, children }: { rotulo: string; numero?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-ink-2">{rotulo}</dt>
      <dd className={`min-w-0 text-right font-semibold [overflow-wrap:anywhere] ${numero ? "tnum" : ""}`}>{children}</dd>
    </div>
  );
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Conferência pública de recibo (o QR do PDF abre aqui). Diz se o recibo é
 * autêntico — o hash e a assinatura da plataforma batem — sem mostrar CPF
 * nem chave Pix. O "confere" vai em texto com ícone, nunca só na cor.
 */
export default function ReciboPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const { data, isLoading, error } = useQuery<Conferencia>({ queryKey: [`/api/public/recibos/${codigo}`] });
  return (
    <PublicShell>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold">Recibo de comissão</h1>
          <p className="tnum mt-0.5 text-[13px] text-muted [overflow-wrap:anywhere]">{data?.codigo ?? codigo}</p>
        </div>
        {data ? (
          <p role="status">
            {data.autentico ? (
              <Pill status="paid">
                <CheckCircle2 size={13} aria-hidden />
                Confere com a assinatura da plataforma
              </Pill>
            ) : (
              <Pill status="expired">
                <XCircle size={13} aria-hidden />
                Não confere: este recibo não foi emitido assim
              </Pill>
            )}
          </p>
        ) : null}
      </div>
      {isLoading ? <p className="mt-4 text-sm text-muted">Conferindo…</p> : null}
      {error ? (
        <div className="mt-4">
          <Empty>Recibo não encontrado. Confira o código.</Empty>
          <p className="-mt-4 text-center text-sm">
            <Link href="/ajuda" className="text-green-deep underline">
              Central de ajuda
            </Link>
          </p>
        </div>
      ) : null}
      {data ? (
        <>
          <div className="mt-3.5">
            <Card>
              <dl className="divide-y divide-line px-4 py-1.5 text-sm">
                <Linha rotulo="Beneficiário">{data.beneficiario}</Linha>
                <Linha rotulo="Pagador">{data.pagador}</Linha>
                <Linha rotulo={data.irrfCents ? "Valor bruto" : "Valor"} numero>
                  {formatBRL(data.valorCents)}
                </Linha>
                {data.irrfCents ? (
                  <>
                    <Linha rotulo="IRRF retido (1,5%)" numero>
                      {formatBRL(data.irrfCents)}
                    </Linha>
                    <Linha rotulo="Líquido pago" numero>
                      {formatBRL(data.valorCents - data.irrfCents)}
                    </Linha>
                  </>
                ) : null}
                <Linha rotulo="Pago em" numero>
                  {quando(data.emitidoEm)}
                </Linha>
                <Linha rotulo="Impressão SHA-256" numero>
                  <span title={data.hash}>{`${data.hash.slice(0, 4)}…${data.hash.slice(-4)}`}</span>
                </Linha>
              </dl>
            </Card>
          </div>
          <p className="mt-3.5 text-xs leading-[17px] text-muted">
            O recibo é o retrato do saque no momento do pagamento, assinado pela plataforma (SHA-256 do texto canônico +
            HMAC). Esta página refaz os dois e compara; um centavo mexido vira "não confere". Só o primeiro nome, o
            pagador e o valor aparecem — nunca CPF nem chave Pix.
          </p>
          <p className="tnum mt-2 break-all text-[11px] leading-4 text-muted">Impressão completa: {data.hash}</p>
        </>
      ) : null}
    </PublicShell>
  );
}
