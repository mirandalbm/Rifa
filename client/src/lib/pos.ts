/**
 * Ponte com a maquininha.
 *
 * O app é web e roda igual no navegador. Quando ele está dentro do
 * invólucro Android publicado na loja da adquirente (PagBank Smart POS,
 * Stone/Ton POS Android, Cielo LIO), o invólucro injeta `window.RifaPOS`
 * e passamos a cobrar no cartão e imprimir na bobina do próprio aparelho.
 *
 * Sem a ponte, nada quebra: o cambista escolhe dinheiro ou Pix e o bilhete
 * sai pela impressão do navegador. É a mesma tela nos dois casos.
 *
 * O contrato abaixo é o que o invólucro precisa implementar — ver
 * `docs/MAQUININHAS.md`.
 */

export interface PosPayRequest {
  amountCents: number;
  orderCode: number;
  /** "credito" | "debito" | "pix" — o invólucro traduz para o SDK. */
  method: "credito" | "debito" | "pix";
  installments?: number;
}

export interface PosPayResult {
  ok: boolean;
  /** NSU ou código de autorização devolvido pela adquirente. */
  authCode?: string;
  terminal?: string;
  message?: string;
}

export interface PosBridge {
  readonly version: string;
  /** Modelo do aparelho, para o registro da venda. */
  readonly terminal: string;
  readonly hasPrinter: boolean;
  pay(request: PosPayRequest): Promise<PosPayResult>;
  print(text: string): Promise<void>;
}

declare global {
  interface Window {
    RifaPOS?: PosBridge;
  }
}

export function pos(): PosBridge | null {
  return typeof window !== "undefined" && window.RifaPOS ? window.RifaPOS : null;
}

export function inPos(): boolean {
  return pos() !== null;
}

/**
 * Imprime o bilhete: bobina do aparelho quando existe, impressão do
 * navegador quando não.
 */
export async function printTicket(code: number): Promise<"pos" | "browser"> {
  const bridge = pos();

  if (bridge?.hasPrinter) {
    const res = await fetch(`/api/public/tickets/${code}/escpos`, {
      credentials: "include",
    });
    if (res.ok) {
      await bridge.print(await res.text());
      await fetch(`/api/public/tickets/${code}/printed`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
      return "pos";
    }
  }

  window.open(`/bilhete/${code}?auto=1`, "_blank", "width=420,height=640");
  return "browser";
}
