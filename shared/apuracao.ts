/**
 * Apuração da rifa autorizada pela SPA/MF — a leitura direta da Loteria
 * Federal, como o advogado validou (05/10/2026, respostas 8.1 a 8.6 e 8.11).
 * Pura: o servidor sorteia com ela, a tela confere com ela, o regulamento
 * diz com ela e o teste prova os exemplos do advogado.
 *
 * A SPA/MF exige que qualquer pessoa, com o resultado da Federal e o
 * regulamento, chegue ao ganhador com papel e caneta. Por isso:
 *
 * - **Número da Sorte base**: as unidades do 1º ao 5º prêmio, lidas de cima
 *   para baixo (34.567, 12.348, 90.211, 55.603, 77.129 → 78.139).
 * - **Rifa de 100.000**: o próprio Número da Sorte (00.000 a 99.999).
 * - **Rifa menor** (100, 1.000, 10.000): os N últimos algarismos (139 em
 *   1.000 números).
 * - **Rifa de 1.000.000** (10 séries): a Série é a dezena do 1º prêmio, à
 *   frente do Número da Sorte (6 + 78.139 → 678.139).
 * - **Numeração a partir de zero** e **total só em potência de 10**: assim
 *   todo número que a leitura dá existe na rifa (sem "número fantasma"). O
 *   número lido sem dono segue a aproximação (`contempladoPorAproximacao`).
 *
 * O hash + HMAC (`server/services/draw.ts`) não é aceito pela portaria: fica
 * só para conferir a rifa sorteada antes deste método (sem `metodo_apuracao`).
 */

/**
 * Os métodos que a plataforma pode liberar. O globo próprio entra quando for
 * homologado (ata notarial, auditor ou testemunhas desvinculadas, relato bola
 * a bola): até lá ele aparece no painel, mas não pode ser ligado.
 */
export const METODOS_DE_APURACAO = ["federal_direta", "globo"] as const;
export type MetodoDeApuracao = (typeof METODOS_DE_APURACAO)[number];

export const ROTULO_DO_METODO: Record<MetodoDeApuracao, string> = {
  federal_direta: "Loteria Federal (leitura direta)",
  globo: "Globo próprio homologado",
};

export const EXPLICACAO_DO_METODO: Record<MetodoDeApuracao, string> = {
  federal_direta:
    "O número contemplado sai dos 5 prêmios da extração da Loteria Federal, lidos de cima para baixo, como a SPA/MF aprova. Qualquer pessoa confere com papel e caneta.",
  globo:
    "Sorteio no globo da plataforma, ao vivo, com ata notarial (local, data, hora, auditor ou testemunhas independentes e o relato de cada bola).",
};

/** O método ainda não pode ser usado (e o motivo), ou `null`. */
export const METODO_INDISPONIVEL: Partial<Record<MetodoDeApuracao, string>> = {
  globo: "Em breve: depende da homologação do globo.",
};

/** Liberado de fábrica: a Federal direta (o único autorizável hoje). */
export const METODOS_LIBERADOS_PADRAO: MetodoDeApuracao[] = ["federal_direta"];

export function metodoValido(m: unknown): m is MetodoDeApuracao {
  return typeof m === "string" && (METODOS_DE_APURACAO as readonly string[]).includes(m);
}

/**
 * O que vem do painel da plataforma: só métodos conhecidos e disponíveis,
 * sem repetir (400). Lista vazia vale — e aí nenhuma rifa publica.
 */
export function validarMetodosLiberados(v: unknown): MetodoDeApuracao[] {
  if (!Array.isArray(v)) throw Object.assign(new Error("Métodos de apuração em formato inválido."), { status: 400 });
  const saida: MetodoDeApuracao[] = [];
  for (const m of v) {
    if (!metodoValido(m)) throw Object.assign(new Error("Método de apuração desconhecido."), { status: 400 });
    if (METODO_INDISPONIVEL[m]) throw Object.assign(new Error(METODO_INDISPONIVEL[m]), { status: 400 });
    if (!saida.includes(m)) saida.push(m);
  }
  return saida;
}

/** O guardado que não passe mais na régua perde só o método estragado. */
export function metodosLiberadosGuardados(v: unknown): MetodoDeApuracao[] {
  if (v === undefined || v === null) return [...METODOS_LIBERADOS_PADRAO];
  if (!Array.isArray(v)) return [...METODOS_LIBERADOS_PADRAO];
  return METODOS_DE_APURACAO.filter((m) => v.includes(m) && !METODO_INDISPONIVEL[m]);
}

/** A escolha da promotora: um método liberado pela plataforma, ou o problema. */
export function problemaNoMetodo(metodo: unknown, liberados: readonly MetodoDeApuracao[]): string | null {
  if (!metodoValido(metodo)) return "Escolha o método de apuração da sua autorização.";
  if (METODO_INDISPONIVEL[metodo]) return METODO_INDISPONIVEL[metodo]!;
  if (!liberados.includes(metodo)) return "Este método de apuração não está liberado pela plataforma.";
  return null;
}

/** A numeração começa em zero? Toda rifa com método (a de antes, sem método, segue de 1). */
export function numeracaoZero(metodo: string | null | undefined): boolean {
  return metodoValido(metodo);
}

/** Os totais aceitos: só potência de 10, de 100 a 1.000.000 (resposta 8.3). */
export const TOTAIS_DA_APURACAO = [100, 1_000, 10_000, 100_000, 1_000_000] as const;

export function totalDaApuracao(total: number): boolean {
  return (TOTAIS_DA_APURACAO as readonly number[]).includes(total);
}

export const PROBLEMA_NO_TOTAL =
  "O total de cotas precisa ser 100, 1.000, 10.000, 100.000 ou 1.000.000: é o que a leitura da Loteria Federal alcança, sem número que não existe na rifa.";

/** Quantos algarismos tem o número da rifa (100 → 2; 1.000.000 → 6). */
export function casasDaRifa(total: number): number {
  if (!totalDaApuracao(total)) throw new Error(PROBLEMA_NO_TOTAL);
  return Math.round(Math.log10(total));
}

/** O exemplo do advogado, o mesmo no regulamento e no teste. */
export const PREMIOS_DE_EXEMPLO = ["34567", "12348", "90211", "55603", "77129"] as const;

export interface LeituraDaFederal {
  /** As unidades do 1º ao 5º prêmio, juntas ("78139"). */
  base: string;
  /** A Série (dezena do 1º prêmio), só na rifa de 1.000.000. */
  serie: string | null;
  /** O número lido, com as casas da rifa ("139", "678139"). */
  numeroTexto: string;
  /** O mesmo, como número (o que a pessoa lê: 0 ao total − 1). */
  numero: number;
  /** A leitura passo a passo, para a tela de conferência. */
  passos: string[];
}

const ORDINAL = ["1º", "2º", "3º", "4º", "5º"];

/** "34567" → "34.567", como o advogado escreve. */
export function premioComPonto(p: string): string {
  return `${p.slice(0, 2)}.${p.slice(2)}`;
}

function comPonto(n: string): string {
  return n.length > 3 ? `${n.slice(0, n.length - 3)}.${n.slice(-3)}` : n;
}

const EXTENSO: Record<number, string> = { 2: "2 (dois)", 3: "3 (três)", 4: "4 (quatro)" };
const POSICOES: Record<number, string> = {
  2: "dezena e unidade",
  3: "centena, dezena e unidade",
  4: "unidade de milhar, centena, dezena e unidade",
};

/**
 * A leitura direta: dos 5 prêmios ao número contemplado (o que a pessoa lê,
 * de 0 ao total − 1). Prêmio fora do formato (5 algarismos) é erro: quem
 * lança o resultado confere antes (`validarResultado`).
 */
export function lerFederal(premios: readonly string[], total: number): LeituraDaFederal {
  const casas = casasDaRifa(total);
  const p = premios.map((x) => String(x ?? "").trim());
  if (p.length !== 5 || p.some((x) => !/^\d{5}$/.test(x))) {
    throw new Error("São necessários os 5 prêmios da Loteria Federal, com 5 algarismos cada.");
  }
  const base = p.map((x) => x[4]).join("");
  const passos = p.map((x, i) => `${ORDINAL[i]} prêmio ${premioComPonto(x)} → unidade ${x[4]}`);
  passos.push(`Número da Sorte base (as unidades, de cima para baixo): ${premioComPonto(base)}`);
  let serie: string | null = null;
  let numeroTexto: string;
  if (casas === 6) {
    serie = p[0][3];
    numeroTexto = `${serie}${base}`;
    passos.push(`Série: a dezena do 1º prêmio (${premioComPonto(p[0])}) → ${serie}`);
    passos.push(`Bilhete contemplado: Série ${serie} + Número da Sorte ${premioComPonto(base)} = ${comPonto(numeroTexto)}`);
  } else if (casas === 5) {
    numeroTexto = base;
    passos.push(`Esta rifa tem 100.000 números (00.000 a 99.999): o contemplado é ${premioComPonto(base)}`);
  } else {
    numeroTexto = base.slice(5 - casas);
    passos.push(
      `Esta rifa tem ${comPonto(String(total))} números (${"0".repeat(casas)} a ${"9".repeat(casas)}): valem os ${casas} últimos algarismos → ${numeroTexto}`,
    );
  }
  return { base, serie, numeroTexto, numero: Number(numeroTexto), passos };
}

/**
 * A cláusula do regulamento, nas palavras do advogado (8.1 e 8.2), com o
 * exemplo calculado pela mesma `lerFederal()` — o texto não tem como dizer
 * uma conta e o sistema fazer outra.
 */
export function clausulaDaApuracao(total: number): string {
  const casas = casasDaRifa(total);
  const ex = PREMIOS_DE_EXEMPLO;
  const exemplo = `Exemplo: 1º prêmio (${premioComPonto(ex[0])}), 2º prêmio (${premioComPonto(ex[1])}), 3º prêmio (${premioComPonto(
    ex[2],
  )}), 4º prêmio (${premioComPonto(ex[3])}), 5º prêmio (${premioComPonto(ex[4])}).`;
  const l = lerFederal(ex, total);
  if (casas === 6) {
    return `A apuração do contemplado ocorrerá em duas etapas. A Série será determinada pelo algarismo da dezena simples do 1º prêmio da Loteria Federal. O Número da Sorte será formado pela união dos algarismos das unidades simples do 1º ao 5º prêmio, lidos verticalmente de cima para baixo. ${exemplo} A Série vencedora será a ${l.serie}, e o Número da Sorte vencedor será o ${premioComPonto(l.base)}, formando o bilhete contemplado ${comPonto(l.numeroTexto)}.`;
  }
  if (casas === 5) {
    return `O Número da Sorte contemplado será formado pela união dos algarismos das unidades simples do 1º ao 5º prêmio da Loteria Federal, lidos verticalmente de cima para baixo. ${exemplo} O Número da Sorte ganhador será ${premioComPonto(l.base)}.`;
  }
  return `O Número da Sorte base será formado pela união dos algarismos das unidades simples do 1º ao 5º prêmio da Loteria Federal, lidos verticalmente de cima para baixo. ${exemplo} O Número da Sorte base será ${premioComPonto(
    l.base,
  )}. Para determinar o contemplado nesta campanha, que é composta por ${comPonto(String(total))} números (de ${"0".repeat(
    casas,
  )} a ${"9".repeat(casas)}), será considerado contemplado o bilhete correspondente aos ${EXTENSO[casas]} últimos algarismos (${
    POSICOES[casas]
  }) do Número da Sorte base. No exemplo (${premioComPonto(l.base)}), o ganhador será o detentor do número ${l.numeroTexto}.`;
}
