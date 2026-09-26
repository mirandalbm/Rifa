import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Card, Empty } from "@/components/bits";
import { formatBRL } from "@shared/format";

interface Conferencia {
  codigo: string;
  autentico: boolean;
  emitidoEm: string;
  pagador: string;
  beneficiario: string;
  valorCents: number;
  hash: string;
}

/**
 * Conferência pública de recibo (o QR do PDF abre aqui). Diz se o recibo é
 * autêntico — o hash e a assinatura da plataforma batem — sem mostrar CPF
 * nem chave Pix.
 */
export default function ReciboPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const { data, isLoading, error } = useQuery<Conferencia>({ queryKey: [`/api/public/recibos/${codigo}`] });
  return (
    <PublicShell>
      <h1 className="font-display text-xl font-extrabold">Conferência de recibo</h1>
      {isLoading ? <p className="mt-3 text-sm text-muted">Conferindo…</p> : null}
      {error ? <Empty>Recibo não encontrado. Confira o código.</Empty> : null}
      {data ? (
        <div className="mt-3">
          <Card>
            <div className="space-y-3 p-4 text-sm">
              <p className={`flex items-center gap-2 font-semibold ${data.autentico ? "text-green-deep" : "text-red"}`}>
                {data.autentico ? <CheckCircle2 size={18} aria-hidden /> : <XCircle size={18} aria-hidden />}
                {data.autentico ? "Recibo autêntico, emitido pela plataforma." : "Este recibo não confere: não foi emitido assim."}
              </p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="label-xs">Código</dt>
                  <dd className="tnum">{data.codigo}</dd>
                </div>
                <div>
                  <dt className="label-xs">Emitido em</dt>
                  <dd className="tnum">{new Date(data.emitidoEm).toLocaleDateString("pt-BR")}</dd>
                </div>
                <div>
                  <dt className="label-xs">Pagador</dt>
                  <dd>{data.pagador}</dd>
                </div>
                <div>
                  <dt className="label-xs">Recebedor</dt>
                  <dd>{data.beneficiario}</dd>
                </div>
                <div>
                  <dt className="label-xs">Valor</dt>
                  <dd className="tnum">{formatBRL(data.valorCents)}</dd>
                </div>
              </dl>
              <p className="tnum break-all text-[11px] text-muted">SHA-256 {data.hash}</p>
            </div>
          </Card>
        </div>
      ) : null}
    </PublicShell>
  );
}
