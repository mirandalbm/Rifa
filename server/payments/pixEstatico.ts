/**
 * Código "copia e cola" de Pix (BR Code, padrão EMV do Banco Central) para uma
 * chave fixa. Serve só ao provedor de desenvolvimento (`DEV_PIX_CHAVE`): o
 * código vira um Pix de verdade que o aplicativo do banco lê, mas **nada aqui
 * confirma pagamento** — no teste, quem confirma continua sendo a rota
 * `/api/dev`. Em produção quem gera e confirma o Pix é o provedor (Asaas ou
 * Mercado Pago), pelo webhook.
 */

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), o do BR Code. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;

/** Só letras, números e espaço, sem acento, em maiúsculas: o que todo banco lê. */
const limpo = (s: string, max: number) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, "").trim().toUpperCase().slice(0, max);

/** A chave como o Banco Central aceita: até 77 caracteres e sem espaço. */
export function chavePixValida(chave: string): boolean {
  return chave.length > 0 && chave.length <= 77 && !/\s/.test(chave);
}

export function pixCopiaECola(p: {
  chave: string;
  valorCents: number;
  /** Identificador da cobrança (o código do pedido). */
  txid: string;
  nome?: string;
  cidade?: string;
}): string {
  if (!chavePixValida(p.chave)) throw new Error("Chave Pix inválida.");
  if (!Number.isInteger(p.valorCents) || p.valorCents <= 0) throw new Error("Valor do Pix inválido.");
  const txid = p.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const corpo =
    campo("00", "01") +
    campo("26", campo("00", "br.gov.bcb.pix") + campo("01", p.chave)) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("54", (p.valorCents / 100).toFixed(2)) +
    campo("58", "BR") +
    campo("59", limpo(p.nome ?? "", 25) || "RIFA TESTE") +
    campo("60", limpo(p.cidade ?? "", 15) || "SAO PAULO") +
    campo("62", campo("05", txid)) +
    "6304";
  return corpo + crc16(corpo);
}
