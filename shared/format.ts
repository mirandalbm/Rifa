/** Formatação de cota, dinheiro e telefone — compartilhada entre cliente e servidor. */

/**
 * Numeração da rifa. Por dentro, a cota é sempre de 1 ao total (a PK, a
 * reserva e o mapa não mudam). Na tela, a rifa apurada pela leitura direta
 * da Loteria Federal (`metodo_apuracao`, `shared/apuracao.ts`) começa em
 * **zero**, como a SPA/MF exige: a cota 1 aparece como 000 e a última como
 * 999. A rifa de antes (sem método, apurada pela semente) segue de 1 ao
 * total. `zero` é obrigatório de propósito: esquecer é erro de tipo, não
 * número trocado na tela.
 */
export function quotaDigits(totalQuotas: number, zero: boolean): number {
  return String(zero ? Math.max(1, totalQuotas - 1) : totalQuotas).length;
}

/** O número que a pessoa lê, a partir do número interno (1 ao total). */
export function numeroNaTela(n: number, zero: boolean): number {
  return zero ? n - 1 : n;
}

/** O número interno, a partir do que a pessoa leu ou digitou. */
export function numeroInterno(lido: number, zero: boolean): number {
  return zero ? lido + 1 : lido;
}

/**
 * Largura fixa: 1.000 cotas da rifa de antes -> "0001" a "1000"; da rifa
 * apurada pela Federal -> "000" a "999". 1.000.000 -> "000000" a "999999".
 */
export function formatQuota(n: number, totalQuotas: number, zero: boolean): string {
  return String(numeroNaTela(n, zero)).padStart(quotaDigits(totalQuotas, zero), "0");
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

/** Só os dígitos, sem o 55 do país: "+55 (11) 98888-7777" e "11988887777" são o mesmo. */
export function telefoneComparavel(bruto: string | null | undefined): string {
  const d = String(bruto ?? "").replace(/\D/g, "");
  return /^55\d{10,11}$/.test(d) ? d.slice(2) : d;
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

/**
 * CPF com dígitos verificadores certos. Não prova que o CPF é da pessoa — só
 * pega o erro de digitação antes de o provedor recusar o Pix.
 */
export function cpfValido(entrada: string): boolean {
  const d = entrada.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/** 12345678909 → 123.456.789-09, enquanto digita. */
export function maskCpf(entrada: string): string {
  const d = entrada.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/** CNPJ com os dois dígitos verificadores conferidos. */
export function cnpjValido(entrada: string): boolean {
  const d = entrada.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digito = (ate: number) => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

/** CNPJ com a máscara: 12.345.678/0001-90. Entrada sem 14 dígitos volta como veio. */
export function formatarCnpj(entrada: string): string {
  const d = String(entrada ?? "").replace(/\D/g, "");
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : entrada;
}
