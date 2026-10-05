/**
 * Sorteios oficiais da plataforma: os concursos das loterias da Caixa que o
 * administrador geral põe no calendário. As organizações integram as rifas
 * nelas pelo calendário do painel; a tela do sorteio no Início do celular
 * transmite só estes. Regras puras: o servidor confere, a tela mostra.
 *
 * - **Só a plataforma cadastra** (o sorteio é dela, não de uma rifa).
 * - **Integrar é escolher a data do calendário**: a data da rifa passa a ser
 *   a do concurso e trava ao publicar, como sempre (invariante 9). Depois de
 *   publicada, mudar só com autorização da plataforma.
 * - **O resultado é o oficial da Caixa**, lançado pela plataforma e conferido
 *   pelo formato de cada loteria. Fica na plataforma para sempre.
 */

/**
 * A cor de cada jogo nas Loterias Caixa — a identidade com que o apostador já
 * reconhece a loteria (o volante, o site e o app da Caixa). É cor de
 * **identidade de terceiro**, não do nosso sistema: só aparece junto do nome
 * da loteria (no calendário e na legenda), nunca como estado. Confira contra o
 * manual de identidade visual das Loterias Caixa e troque aqui se mudar.
 * `tests/sorteiosOficiais.test.ts` exige ≥ 3:1 com o texto branco por cima.
 */
export const CORES_DA_CAIXA = {
  federal: "#103099",
  mega_sena: "#209869",
  quina: "#260085",
  lotofacil: "#930089",
} as const;

export const LOTERIAS = {
  federal: {
    nome: "Loteria Federal",
    curto: "Federal",
    /** O nome que cabe no dia do calendário no tablet (abaixo de `lg`). */
    sigla: "Fed.",
    /** Os 5 prêmios, cada um com 5 algarismos (00000 a 99999). */
    /** A cor do jogo nas Loterias Caixa (`CORES_DA_CAIXA`). */
    cor: CORES_DA_CAIXA.federal,
    quantos: 5,
    tipo: "bilhete" as const,
    rotulo: "Os 5 prêmios, na ordem (5 algarismos cada)",
  },
  mega_sena: {
    nome: "Mega-Sena",
    curto: "Mega-Sena",
    /** O nome que cabe no dia do calendário no tablet (abaixo de `lg`). */
    sigla: "Mega",
    /** A cor do jogo nas Loterias Caixa (`CORES_DA_CAIXA`). */
    cor: CORES_DA_CAIXA.mega_sena,
    quantos: 6,
    tipo: "dezenas" as const,
    min: 1,
    max: 60,
    rotulo: "As 6 dezenas sorteadas (1 a 60)",
  },
  quina: {
    nome: "Quina",
    curto: "Quina",
    /** O nome que cabe no dia do calendário no tablet (abaixo de `lg`). */
    sigla: "Quina",
    /** A cor do jogo nas Loterias Caixa (`CORES_DA_CAIXA`). */
    cor: CORES_DA_CAIXA.quina,
    quantos: 5,
    tipo: "dezenas" as const,
    min: 1,
    max: 80,
    rotulo: "As 5 dezenas sorteadas (1 a 80)",
  },
  lotofacil: {
    nome: "Lotofácil",
    curto: "Lotofácil",
    /** O nome que cabe no dia do calendário no tablet (abaixo de `lg`). */
    sigla: "Lotof.",
    /** A cor do jogo nas Loterias Caixa (`CORES_DA_CAIXA`). */
    cor: CORES_DA_CAIXA.lotofacil,
    quantos: 15,
    tipo: "dezenas" as const,
    min: 1,
    max: 25,
    rotulo: "As 15 dezenas sorteadas (1 a 25)",
  },
} as const;

export type Loteria = keyof typeof LOTERIAS;

export function loteriaValida(v: unknown): v is Loteria {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(LOTERIAS, v);
}

/**
 * A rifa só entra num sorteio com pelo menos este tempo de folga: tempo de
 * vender, de avisar quem comprou e de os pedidos de reembolso fecharem (2 h
 * antes) sem pegar ninguém de surpresa.
 */
export const ANTECEDENCIA_PARA_INTEGRAR_MS = 24 * 3_600_000;

export const TITULO_MAX = 80;
export const CONCURSO_MAX = 99_999;

export interface DadosDoSorteioOficial {
  loteria: Loteria;
  concurso: number;
  sorteioEm: Date;
  titulo: string | null;
  transmissaoUrl: string | null;
}

/** Link da transmissão: só `https:`, sem usuário e senha (o mesmo da rifa). */
export function transmissaoDoSorteioValida(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Confere o corpo do cadastro (só as chaves conhecidas). Devolve o problema
 * em português ou os dados limpos. A data é conferida contra `agora` só ao
 * criar ou mudar a data — o sorteio que já passou não volta a ser futuro.
 */
export function validarSorteioOficial(
  corpo: unknown,
  agora: Date,
  /** Ao editar sem mudar a data, a hora que já passou não é problema (título e transmissão mudam até o resultado). */
  conferirData = true,
): { problema: string } | { dados: DadosDoSorteioOficial } {
  const b = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  if (!loteriaValida(b.loteria)) return { problema: "Escolha a loteria." };
  const concurso = Number(b.concurso);
  if (!Number.isInteger(concurso) || concurso < 1 || concurso > CONCURSO_MAX) {
    return { problema: "Informe o número do concurso (de 1 a 99999)." };
  }
  const sorteioEm = new Date(String(b.sorteioEm ?? ""));
  if (!Number.isFinite(sorteioEm.getTime())) return { problema: "Informe a data e a hora do sorteio." };
  if (conferirData && sorteioEm.getTime() <= agora.getTime()) return { problema: "A data do sorteio já passou." };
  if (conferirData && sorteioEm.getTime() > agora.getTime() + 400 * 86_400_000) {
    return { problema: "A data do sorteio passa de um ano: confira." };
  }
  const titulo = typeof b.titulo === "string" ? b.titulo.trim().replace(/\s+/g, " ") : "";
  if (titulo.length > TITULO_MAX) return { problema: `O título passa de ${TITULO_MAX} letras.` };
  const link = typeof b.transmissaoUrl === "string" ? b.transmissaoUrl.trim() : "";
  if (link && !transmissaoDoSorteioValida(link)) {
    return { problema: "O link da transmissão precisa começar com https://." };
  }
  return {
    dados: {
      loteria: b.loteria,
      concurso,
      sorteioEm,
      titulo: titulo || null,
      transmissaoUrl: link || null,
    },
  };
}

/**
 * O resultado oficial, conferido pelo formato da loteria. A Federal guarda os
 * prêmios com os 5 algarismos (o zero à esquerda conta); as outras, as
 * dezenas em ordem crescente, sem repetir.
 */
export function validarResultado(
  loteria: Loteria,
  numeros: unknown,
): { problema: string } | { numeros: string[] } {
  const L = LOTERIAS[loteria];
  if (!Array.isArray(numeros) || numeros.length !== L.quantos) {
    return { problema: `${L.rotulo}.` };
  }
  const limpos = numeros.map((n) => String(n ?? "").trim());
  if (L.tipo === "bilhete") {
    if (!limpos.every((n) => /^\d{5}$/.test(n))) {
      return { problema: "Cada prêmio da Federal tem 5 algarismos (00000 a 99999)." };
    }
    return { numeros: limpos };
  }
  const valores = limpos.map((n) => (/^\d{1,2}$/.test(n) ? Number(n) : NaN));
  if (!valores.every((v) => Number.isInteger(v) && v >= L.min && v <= L.max)) {
    return { problema: `Cada dezena da ${L.nome} vai de ${L.min} a ${L.max}.` };
  }
  if (new Set(valores).size !== valores.length) return { problema: "Há dezena repetida no resultado." };
  return { numeros: [...valores].sort((a, b) => a - b).map((v) => String(v).padStart(2, "0")) };
}

export type SituacaoDoSorteioOficial = "agendado" | "com_resultado" | "cancelado";

export const ROTULO_DA_SITUACAO: Record<SituacaoDoSorteioOficial, string> = {
  agendado: "Agendado",
  com_resultado: "Resultado lançado",
  cancelado: "Cancelado",
};

export function situacaoDoSorteio(s: { canceladoEm: Date | string | null; resultadoEm: Date | string | null }): SituacaoDoSorteioOficial {
  if (s.canceladoEm) return "cancelado";
  if (s.resultadoEm) return "com_resultado";
  return "agendado";
}

/**
 * As loterias em que a rifa pode entrar: **só a Loteria Federal** — a
 * autorização SPA/MF da rifa prevê a apuração pela extração da Federal, e
 * o advogado confirmou (05/10/2026) que Mega-Sena, Quina e Lotofácil não
 * valem como apuração. As outras seguem no calendário da plataforma (a tela
 * do sorteio no celular transmite qualquer uma), mas não recebem rifa. A
 * conta por dezenas (`entropiaDoSorteio`) fica no código, para o sorteio já
 * feito conferir e para o dia em que a autorização permitir.
 */
export const LOTERIAS_QUE_RECEBEM_RIFA: readonly Loteria[] = ["federal"];

/** A rifa pode entrar neste sorteio agora? Devolve o motivo, ou `null`. */
export function problemaParaIntegrar(
  s: { loteria: string; canceladoEm: Date | string | null; resultadoEm: Date | string | null; sorteioEm: Date | string },
  agora: Date,
): string | null {
  if (!(LOTERIAS_QUE_RECEBEM_RIFA as readonly string[]).includes(s.loteria)) {
    const nome = loteriaValida(s.loteria) ? LOTERIAS[s.loteria].nome : s.loteria;
    return `A rifa só entra em sorteio da Loteria Federal (é a apuração da autorização SPA/MF); a ${nome} fica só no calendário.`;
  }
  const situacao = situacaoDoSorteio(s);
  if (situacao === "cancelado") return "Este sorteio oficial foi cancelado.";
  if (situacao === "com_resultado") return "Este sorteio oficial já tem resultado.";
  if (new Date(s.sorteioEm).getTime() < agora.getTime() + ANTECEDENCIA_PARA_INTEGRAR_MS) {
    return "Faltam menos de 24 horas para este sorteio: escolha uma data mais adiante.";
  }
  return null;
}

/** O resultado só pode ser lançado depois da hora do sorteio. */
export function problemaParaLancarResultado(
  s: { canceladoEm: Date | string | null; resultadoEm: Date | string | null; sorteioEm: Date | string },
  agora: Date,
): string | null {
  const situacao = situacaoDoSorteio(s);
  if (situacao === "cancelado") return "Este sorteio oficial foi cancelado.";
  if (situacao === "com_resultado") return "O resultado deste sorteio já foi lançado.";
  if (new Date(s.sorteioEm).getTime() > agora.getTime()) return "O sorteio ainda não aconteceu.";
  return null;
}

/** "Sorteio oficial · Federal 6012 · 02/12" — o selo que vai na rifa integrada. */
export function seloDoSorteioOficial(s: { loteria: Loteria; concurso: number; sorteioEm: Date | string }): string {
  const data = new Date(s.sorteioEm).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return `Sorteio oficial · ${LOTERIAS[s.loteria].curto} ${s.concurso} · ${data}`;
}

/** O nome do sorteio na tela: o título, senão "Federal · concurso 6012". */
export function nomeDoSorteioOficial(s: { loteria: Loteria; concurso: number; titulo: string | null }): string {
  return s.titulo || `${LOTERIAS[s.loteria].nome} · concurso ${s.concurso}`;
}

/** Quantas rifas integradas a fileira da tela do sorteio traz, no máximo. */
export const RIFAS_NA_FILEIRA = 30;

/** "os 5 prêmios da Loteria Federal" / "as 6 dezenas da Mega-Sena" — o regulamento e a tela. */
export function resultadoDaLoteria(l: Loteria): string {
  const L = LOTERIAS[l];
  return L.tipo === "bilhete" ? `os ${L.quantos} prêmios da ${L.nome}` : `as ${L.quantos} dezenas sorteadas da ${L.nome}`;
}

/**
 * A loteria de um sorteio já feito, para a tela do resultado: nula (todo
 * sorteio de antes da fase 2 e o de rifa fora do calendário) é a Federal.
 */
export function loteriaDoSorteio(loteria: string | null | undefined) {
  const l: Loteria = loteriaValida(loteria) ? loteria : "federal";
  const L = LOTERIAS[l];
  return {
    loteria: l,
    loteriaNome: L.nome,
    rotuloDoResultado: L.tipo === "bilhete" ? `${L.quantos} prêmios da ${L.curto}` : `${L.quantos} dezenas da ${L.nome}`,
  };
}
