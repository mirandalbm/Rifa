/**
 * Enquete no story da organização, como a do Instagram: uma pergunta e de 2
 * a 4 opções. Vota quem tem conta, um voto por pessoa (quem decide é a chave
 * do voto, nunca um `SELECT` antes). O resultado aparece para quem já votou,
 * em percentual; a organização vê os totais no painel e nunca quem votou em
 * quê. As regras ficam aqui, puras: o servidor confere e a tela desenha.
 */
import { temLinkOuTelefone } from "./comentarios";

export const ENQUETE_PERGUNTA_MIN = 3;
export const ENQUETE_PERGUNTA_MAX = 80;
export const ENQUETE_OPCAO_MAX = 30;
export const ENQUETE_OPCOES_MIN = 2;
export const ENQUETE_OPCOES_MAX = 4;
/** Votos por pessoa a cada 10 minutos, em todos os stories (o erro de preenchimento sai antes). */
export const ENQUETE_VOTOS_POR_JANELA = 30;

export interface Enquete {
  pergunta: string;
  opcoes: string[];
}

function limpar(t: string) {
  return t.replace(/\s+/g, " ").trim();
}

/**
 * A enquete que veio do painel. Ausente (ou `null`) é story sem enquete. Só
 * as duas chaves conhecidas; texto sem link e sem telefone (a régua do
 * comentário), opções diferentes entre si.
 */
export function validarEnquete(bruta: unknown): Enquete | null {
  if (bruta === null || bruta === undefined) return null;
  if (typeof bruta !== "object" || Array.isArray(bruta)) throw new Error("A enquete veio num formato que não reconheço.");
  const { pergunta, opcoes } = bruta as Record<string, unknown>;
  if (typeof pergunta !== "string") throw new Error("Escreva a pergunta da enquete.");
  const p = limpar(pergunta);
  if (p.length < ENQUETE_PERGUNTA_MIN) throw new Error("Escreva a pergunta da enquete.");
  if (p.length > ENQUETE_PERGUNTA_MAX) throw new Error(`A pergunta passa de ${ENQUETE_PERGUNTA_MAX} caracteres.`);
  const problemaP = temLinkOuTelefone(p);
  if (problemaP) throw new Error(`Na pergunta: ${problemaP.charAt(0).toLowerCase()}${problemaP.slice(1)}`);
  if (!Array.isArray(opcoes)) throw new Error("Escreva as opções da enquete.");
  const os = opcoes.map((o) => (typeof o === "string" ? limpar(o) : "")).filter((o) => o.length > 0);
  if (os.length !== opcoes.length) throw new Error("Toda opção precisa de texto.");
  if (os.length < ENQUETE_OPCOES_MIN || os.length > ENQUETE_OPCOES_MAX) {
    throw new Error(`A enquete tem de ${ENQUETE_OPCOES_MIN} a ${ENQUETE_OPCOES_MAX} opções.`);
  }
  for (const o of os) {
    if (o.length > ENQUETE_OPCAO_MAX) throw new Error(`Cada opção tem até ${ENQUETE_OPCAO_MAX} caracteres.`);
    const problema = temLinkOuTelefone(o);
    if (problema) throw new Error(`Numa opção: ${problema.charAt(0).toLowerCase()}${problema.slice(1)}`);
  }
  if (new Set(os.map((o) => o.toLocaleLowerCase("pt-BR"))).size !== os.length) {
    throw new Error("As opções precisam ser diferentes entre si.");
  }
  return { pergunta: p, opcoes: os };
}

/** O índice da opção escolhida, se existir naquela enquete. */
export function opcaoValida(bruta: unknown, quantas: number): number | null {
  return typeof bruta === "number" && Number.isInteger(bruta) && bruta >= 0 && bruta < quantas ? bruta : null;
}

/**
 * Percentuais inteiros que somam exatamente 100 (maior resto): a tela nunca
 * mostra 33 + 33 + 33. Sem voto, tudo zero.
 */
export function percentuais(votos: number[]): number[] {
  const total = votos.reduce((a, b) => a + b, 0);
  if (total <= 0) return votos.map(() => 0);
  const exatos = votos.map((v) => (v * 100) / total);
  const base = exatos.map(Math.floor);
  let falta = 100 - base.reduce((a, b) => a + b, 0);
  const ordem = exatos
    .map((e, i) => ({ i, resto: e - Math.floor(e) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordem) {
    if (falta <= 0) break;
    base[i] += 1;
    falta -= 1;
  }
  return base;
}
