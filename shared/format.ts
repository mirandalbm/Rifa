/** Formatação de cota, dinheiro e telefone — compartilhada entre cliente e servidor. */

/**
 * Largura do número da cota: sempre o comprimento do total da campanha.
 * 1.000.000 cotas -> "0000001"; 10.000 -> "0001".
 */
export function quotaDigits(totalQuotas: number): number {
  return String(totalQuotas).length;
}

export function formatQuota(n: number, totalQuotas: number): string {
  return String(n).padStart(quotaDigits(totalQuotas), "0");
}

/** Agrupa em milhares para leitura: 847219 -> "847.219". */
export function groupNumber(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Aceita "11 98888-7777", "(11)988887777" etc. e devolve só os dígitos. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

export function maskPhone(digits: string): string {
  const d = normalizePhone(digits);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

/** Esconde o miolo do telefone em telas públicas (ranking, últimas compras). */
export function hidePhone(digits: string): string {
  const d = normalizePhone(digits);
  if (d.length < 7) return "•••";
  return `(${d.slice(0, 2)}) ••••-${d.slice(-4)}`;
}

/**
 * Esconde o CPF em tela pública, no padrão de mascaramento da LGPD: só os
 * dígitos do meio aparecem (`***.456.789-**`). O bilhete é público pelo
 * código do pedido — CPF inteiro ali vira lista de CPFs para quem varrer os
 * códigos.
 */
export function hideCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return "•••";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}
