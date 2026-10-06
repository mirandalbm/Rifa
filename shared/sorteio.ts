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

/** O texto da regra, igual no regulamento e na tela do resultado — a da rifa de antes, sem método de apuração. */
export const REGRA_DA_APROXIMACAO =
  "Se o número sorteado não tiver sido vendido e pago, o prêmio vai para o número vendido e pago imediatamente acima; se não houver nenhum acima, para o imediatamente abaixo.";

/* ------------------------------------------------------------------ *
 * Item 9 do advogado (05/10/2026): o número sem dono na rifa autorizada
 * ------------------------------------------------------------------ */

/**
 * 9.1, o texto exato da aproximação da rifa apurada pela Loteria Federal:
 * alternada, superior primeiro — +1, −1, +2, −2… a partir do número apurado.
 */
export const REGRA_DA_APROXIMACAO_ALTERNADA =
  "Caso o Número da Sorte apurado não tenha sido distribuído a um participante válido, o prêmio caberá ao portador do Número da Sorte distribuído imediatamente superior ou, na falta deste, ao imediatamente inferior, e assim alternadamente até que seja identificado um contemplado.";

/** 9.3: a fita é uma só e circular — na rifa de 1.000.000 a Série faz parte do número. */
export const REGRA_DA_FITA_CIRCULAR =
  "Para essa busca, a numeração é uma sequência contínua e circular: depois do maior número da rifa vem o primeiro, e antes do primeiro vem o maior. Na rifa de 1.000.000 de números a Série faz parte do número, e a busca passa de uma Série à outra.";

/** 9.2: o que é "distribuído" — pago, inclusive a cota de bônus; reserva não paga não conta. */
export const NUMERO_DISTRIBUIDO =
  "Considera-se distribuído o Número da Sorte pago, inclusive a cota recebida como bônus; número reservado e não pago não conta e é pulado na busca.";

/** 9.5, o texto exato do ressorteio do globo: no globo não há aproximação. */
export const REGRA_DO_RESSORTEIO =
  "Caso o Número da Sorte extraído do globo não tenha sido distribuído, proceder-se-á, no mesmo ato e imediatamente, ao sorteio de novos Números da Sorte, tantas vezes quantas forem necessárias, até que se apure um número que tenha sido validamente distribuído a um participante.";

/** O registro de cada extração do globo que não valeu (9.5): o mesmo texto no painel, na página e na ata. */
export const SORTEIO_INVALIDO = "Sorteio inválido – cota não vendida";

/** 9.4: na rifa autorizada não há "a promotora completa" — e quem não pode concorrer. */
export const IMPEDIDOS_DE_PARTICIPAR =
  "Não podem participar desta promoção a promotora, seus sócios e diretores, nem a plataforma e seus administradores. A compra feita com o telefone de um deles é recusada.";

/**
 * 9.1 e 9.3: o contemplado pela busca alternada na fita circular. A cota
 * interna vai de 1 ao total; a fita fecha (depois do total vem o 1). Quem
 * consulta o banco devolve o pago mais próximo **seguindo** a fita (acima, ou
 * o menor de todos ao dar a volta) e **voltando** (abaixo, ou o maior). A
 * distância de cada lado decide; empate fica com o de cima (+k antes de −k).
 * Sem nenhum pago, ninguém.
 */
export function contempladoNaFita(p: {
  sorteado: number;
  total: number;
  sorteadoVendido: boolean;
  seguinte: number | null;
  anterior: number | null;
}): number | null {
  if (p.sorteadoVendido) return p.sorteado;
  const n = p.total;
  const dist = (de: number, ate: number) => (((ate - de) % n) + n) % n;
  const frente = p.seguinte !== null && p.seguinte !== p.sorteado ? dist(p.sorteado, p.seguinte) : null;
  const tras = p.anterior !== null && p.anterior !== p.sorteado ? dist(p.anterior, p.sorteado) : null;
  if (frente === null && tras === null) return null;
  if (tras === null || (frente !== null && frente <= tras)) return p.seguinte;
  return p.anterior;
}

/**
 * A mesma regra, passo a passo como está escrita (+1, −1, +2, −2…): é a que
 * qualquer pessoa faz com papel e caneta. O teste compara as duas.
 */
export function contempladoPassoAPasso(sorteado: number, total: number, distribuido: (n: number) => boolean): number | null {
  const na = (x: number) => ((((x - 1) % total) + total) % total) + 1;
  if (distribuido(sorteado)) return sorteado;
  for (let k = 1; k <= Math.floor(total / 2); k++) {
    if (distribuido(na(sorteado + k))) return na(sorteado + k);
    if (distribuido(na(sorteado - k))) return na(sorteado - k);
  }
  return null;
}

/**
 * O texto do número sem dono, pelo método: o ressorteio no globo, a busca
 * alternada na Federal e a regra de antes (ou "a promotora completa") na rifa
 * sem método. O mesmo no regulamento, na página do resultado e na prestação.
 */
export function regraDoNumeroSemDono(metodo: string | null | undefined, modo?: string | null): string {
  if (metodo === "globo") return REGRA_DO_RESSORTEIO;
  if (metodo) return `${REGRA_DA_APROXIMACAO_ALTERNADA} ${REGRA_DA_FITA_CIRCULAR} ${NUMERO_DISTRIBUIDO}`;
  if (modo === "promotora_completa") {
    return "As cotas não vendidas até o sorteio ficam com a promotora. Se o número sorteado for uma delas, não há ganhador entre os participantes e o prêmio permanece com a promotora.";
  }
  return REGRA_DA_APROXIMACAO;
}
