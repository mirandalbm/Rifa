import { useEffect, useState } from "react";
import { Button, Card, Money } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";

/** Contagem regressiva da reserva, em mm:ss. */
export function useCountdown(until: string | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return { left, label: `${mm}:${ss}` };
}

/**
 * O Pix a pagar: QR, copia e cola e o passo a passo. Serve ao pedido
 * avulso e ao carrinho num Pix só — `pedidoParaSimular` é o pedido que o
 * atalho de desenvolvimento paga (no carrinho, pagar um paga todos, porque
 * a cobrança é a mesma).
 */
export function PixParaPagar({
  qr,
  copyPaste,
  amountCents,
  pedidoParaSimular,
}: {
  qr: string | null;
  copyPaste: string;
  amountCents: number;
  pedidoParaSimular?: number;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Card title="Pague com Pix">
      <div className="space-y-3 p-4">
        {qr ? <img src={qr} alt="QR Code do Pix" className="mx-auto h-44 w-44 rounded-lg border border-line" /> : null}

        <div className="flex items-center gap-2 rounded-md border border-line-2 px-3 py-2">
          <span className="tnum flex-1 truncate text-[11px] text-muted">{copyPaste}</span>
          <Button
            variant="ghost"
            className="px-3 py-1 text-xs"
            onClick={async () => {
              await navigator.clipboard.writeText(copyPaste);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "copiado" : "copiar"}
          </Button>
        </div>

        <ol className="space-y-2 text-sm text-ink-2">
          <li>
            1. Abra o app do banco e escolha <b>Pix Copia e Cola</b>.
          </li>
          <li>
            2. Cole o código e confirme os <Money cents={amountCents} />.
          </li>
          <li>3. A confirmação chega no seu WhatsApp em segundos.</li>
        </ol>

        {import.meta.env.DEV && pedidoParaSimular ? (
          <Button
            variant="yellow"
            className="w-full"
            onClick={async () => {
              await apiRequest("POST", `/api/dev/pay/${pedidoParaSimular}`);
            }}
          >
            simular pagamento (desenvolvimento)
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
