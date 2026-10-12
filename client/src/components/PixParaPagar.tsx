import { useEffect, useState } from "react";
import { Clock, Copy } from "lucide-react";
import { Button, Money, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";

/**
 * Contagem regressiva da reserva, em mm:ss. `left` é nulo até a primeira
 * conta (sem isso a tela piscava "00:00" — e "o prazo acabou" — ao abrir).
 */
export function useCountdown(until: string | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!until) return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);
  const s = left ?? 0;
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return { left, label: `${mm}:${ss}` };
}

/** Situação do pedido em pílula com texto: espera em azul, pago em verde, vencido e estornado neutros. */
export function SituacaoDoPedido({ status }: { status: "pending" | "paid" | "expired" | "refunded" }) {
  if (status === "expired") return <Pill status="closed">vencido</Pill>;
  if (status === "refunded") return <Pill status="closed">estornado</Pill>;
  return <Pill status={status} />;
}

/**
 * O prazo da reserva em texto (nunca só a cor): quanto falta e o que
 * acontece depois. Passado o prazo, a tela diz que os números voltam — quem
 * devolve é o relógio de expiração; a situação da página muda quando ele
 * passar.
 */
export function PrazoDaReserva({ expiresAt }: { expiresAt: string | null }) {
  const { left, label } = useCountdown(expiresAt);
  if (!expiresAt || left === null) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg bg-yellow-soft px-3.5 py-2.5 text-[13px] leading-5 text-yellow-deep">
      <Clock size={16} aria-hidden className="mt-0.5 shrink-0" />
      {left > 0 ? (
        <span>
          A reserva vence em <b className="tnum text-[15px] font-medium">{label}</b> — depois disso os números voltam ao
          estoque.
        </span>
      ) : (
        <span>
          O prazo da reserva acabou: os números voltam ao estoque em instantes. Não pague mais este Pix — se você já
          pagou, o valor volta para a conta que pagou.
        </span>
      )}
    </p>
  );
}

/**
 * O Pix a pagar: QR, o valor, o copia e cola e o passo a passo. Serve ao
 * pedido avulso e ao carrinho num Pix só — `pedidoParaSimular` é o pedido
 * que o atalho de desenvolvimento paga (no carrinho, pagar um paga todos,
 * porque a cobrança é a mesma). O valor é o da cobrança, vindo do servidor.
 */
export function PixParaPagar({
  qr,
  copyPaste,
  amountCents,
  expiresAt,
  pedidoParaSimular,
}: {
  qr: string | null;
  copyPaste: string;
  amountCents: number;
  /** Com o prazo zerado o Pix sai da tela: o pedido só vira vencido na próxima volta do relógio. */
  expiresAt: string | null;
  pedidoParaSimular?: number;
}) {
  const [copia, setCopia] = useState<"" | "copiado" | "falhou">("");
  const { left } = useCountdown(expiresAt);
  if (expiresAt && left === 0) return null;
  return (
    <section aria-label="Pague com Pix" className="rounded-xl border border-line bg-white p-4">
      {qr ? <img src={qr} alt="QR Code do Pix" className="mx-auto h-52 w-52 rounded-lg border border-line" /> : null}
      <p className="mt-3 text-center">
        <Money cents={amountCents} className="text-3xl font-medium text-green-deep" />
      </p>

      <p
        className="tnum relative mt-3 truncate rounded-lg border border-line-2 px-3 py-3 text-[12px] text-muted"
        title={copyPaste}
      >
        <span className="sr-only">Código Pix copia e cola: </span>
        <span className="select-all">{copyPaste}</span>
      </p>
      <Button
        className="mt-3 w-full"
        icone={<Copy />}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(copyPaste);
            setCopia("copiado");
            setTimeout(() => setCopia(""), 4000);
          } catch {
            setCopia("falhou");
          }
        }}
      >
        {copia === "copiado" ? "Código copiado" : "Copiar código Pix"}
      </Button>
      {/* A confirmação vai em texto, não só na troca do botão. */}
      <p role="status" className="mt-2 min-h-[1lh] text-center text-xs font-medium text-green-deep">
        {copia === "copiado" ? (
          "Código copiado. Agora é só colar no app do banco."
        ) : copia === "falhou" ? (
          <span className="text-ink-2">Não deu para copiar: segure o código acima e copie à mão.</span>
        ) : null}
      </p>
      <p className="mt-1 text-center text-xs leading-[18px] text-muted">
        Abra o app do seu banco, escolha <b className="font-semibold">Pix copia e cola</b> e cole o código. O pagamento
        cai em segundos.
      </p>

      {import.meta.env.DEV && pedidoParaSimular ? (
        <Button
          variant="yellow"
          className="mt-3 w-full"
          onClick={async () => {
            await apiRequest("POST", `/api/dev/pay/${pedidoParaSimular}`);
          }}
        >
          simular pagamento (desenvolvimento)
        </Button>
      ) : null}
    </section>
  );
}
