/**
 * Conferência pública do sorteio — a mesma conta de `drawNumber()` em
 * `server/services/draw.ts`, escrita com WebCrypto para rodar no navegador
 * de quem quiser conferir (e no Node, onde o teste compara as duas).
 *
 *   1. SHA-256(semente) tem de dar o hash publicado antes da 1ª venda.
 *   2. HMAC-SHA256(semente, "p1-p2-p3-p4-p5:contador") → 64 bits → número,
 *      descartando a sobra da divisão (sem viés de módulo).
 *
 * Se mudar a conta do servidor, mude aqui: `tests/sorteio.test.ts` compara
 * as duas em centenas de casos e quebra na primeira diferença.
 */
import { LOTERIAS, loteriaValida } from "./sorteiosOficiais";

/**
 * A entropia pública: o resultado oficial da loteria. Na Federal são os 5
 * prêmios, "p1-p2-p3-p4-p5" — exatamente como sempre foi, para a conferência
 * de todo sorteio já feito continuar batendo. Nas outras (rifa integrada a
 * um sorteio oficial), as dezenas em ordem, com o nome da loteria na frente
 * ("mega_sena:04-11-23-35-48-59"): o mesmo conjunto de dezenas em outra
 * loteria nunca dá o mesmo número. Sem loteria (sorteio antigo) é Federal.
 */
export function entropiaDoSorteio(numeros: string[], loteria?: string | null): string {
  const l = loteria && loteria !== "federal" ? loteria : "federal";
  if (!loteriaValida(l)) throw new Error("Loteria desconhecida.");
  if (numeros.length !== LOTERIAS[l].quantos) {
    throw new Error(l === "federal" ? "São necessários os 5 prêmios do concurso." : `São necessárias as ${LOTERIAS[l].quantos} dezenas da ${LOTERIAS[l].nome}.`);
  }
  const junto = numeros.map((x) => x.trim()).join("-");
  return l === "federal" ? junto : `${l}:${junto}`;
}

const texto = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sutil(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Este navegador não confere o sorteio (sem WebCrypto).");
  return s;
}

export async function sha256Hex(valor: string): Promise<string> {
  return hex(await sutil().digest("SHA-256", texto.encode(valor)));
}

export async function numeroDoSorteio(p: {
  seed: string;
  /** O resultado oficial: os 5 prêmios da Federal ou as dezenas da loteria. */
  federalPrizes: string[];
  totalQuotas: number;
  /** A loteria do resultado; nulo (sorteio antigo) é a Federal. */
  loteria?: string | null;
}): Promise<number> {
  const entropia = entropiaDoSorteio(p.federalPrizes, p.loteria);
  const chave = await sutil().importKey(
    "raw",
    texto.encode(p.seed),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const total = BigInt(p.totalQuotas);
  const limite = ((1n << 64n) / total) * total;
  for (let contador = 0; contador < 1000; contador++) {
    const assinatura = await sutil().sign("HMAC", chave, texto.encode(`${entropia}:${contador}`));
    const valor = new DataView(assinatura).getBigUint64(0, false);
    if (valor < limite) return Number((valor % total) + 1n);
  }
  throw new Error("Não foi possível derivar o número sem viés.");
}

export interface Conferencia {
  /** A semente publicada depois bate com o hash publicado antes? */
  hashConfere: boolean;
  /** O número que a conta dá. */
  numero: number;
  /** E é o mesmo que foi anunciado? */
  numeroConfere: boolean;
}

export async function conferirSorteio(p: {
  seed: string;
  seedHash: string;
  federalPrizes: string[];
  totalQuotas: number;
  resultNumber: number;
  loteria?: string | null;
}): Promise<Conferencia> {
  const hashConfere = (await sha256Hex(p.seed)) === p.seedHash.toLowerCase();
  const numero = await numeroDoSorteio(p);
  return { hashConfere, numero, numeroConfere: numero === p.resultNumber };
}

/**
 * Link da transmissão (live ou vídeo). Só https: é endereço que o
 * apostador abre, e `javascript:` ou `http:` não entram.
 */
export function transmissaoValida(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 500) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && Boolean(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

/**
 * Regra da aproximação (a dos sorteios autorizados pela SPA/MF): se o número
 * sorteado não foi vendido e pago, o prêmio vai para o número vendido e pago
 * **imediatamente acima**; não havendo nenhum acima, para o **imediatamente
 * abaixo**. Quem consulta o banco devolve o mais próximo de cada lado (ou
 * nulo); a decisão mora aqui, para a tela, o regulamento e o teste lerem igual.
 */
export function contempladoPorAproximacao(p: {
  sorteado: number;
  sorteadoVendido: boolean;
  acima: number | null;
  abaixo: number | null;
}): number | null {
  if (p.sorteadoVendido) return p.sorteado;
  if (p.acima !== null && p.acima > p.sorteado) return p.acima;
  if (p.abaixo !== null && p.abaixo < p.sorteado) return p.abaixo;
  return null;
}

/** O texto da regra, igual no regulamento e na tela do resultado. */
export const REGRA_DA_APROXIMACAO =
  "Se o número sorteado não tiver sido vendido e pago, o prêmio vai para o número vendido e pago imediatamente acima; se não houver nenhum acima, para o imediatamente abaixo.";
