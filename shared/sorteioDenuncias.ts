/**
 * Denúncia de comentário do sorteio oficial — regras puras. O sorteio é da
 * plataforma, sem organização dona: quem denuncia é o apostador com conta, e
 * só a plataforma vê e decide. Procedente apaga o comentário (o do topo leva
 * as respostas) na mesma transação; improcedente deixa como está.
 *
 * - Ninguém denuncia o próprio comentário (apaga, se quiser).
 * - Uma aberta por comentário e pessoa — o índice decide.
 * - A fila não traz texto; o trecho só abre na tela da denúncia, com a
 *   auditoria gravada antes.
 */

export const MOTIVOS_DA_DENUNCIA_DE_COMENTARIO_DO_SORTEIO = {
  pix_fora: "Pediu pagamento por Pix ou transferência fora da plataforma",
  golpe: "Parece golpe (resultado falso, link ou contato)",
  ofensa: "Ofensa, assédio ou ameaça",
  spam: "Spam ou propaganda",
  outro: "Outro motivo",
} as const;

export type MotivoDaDenunciaDoSorteio = keyof typeof MOTIVOS_DA_DENUNCIA_DE_COMENTARIO_DO_SORTEIO;

export const motivoDoSorteioValido = (m: unknown): m is MotivoDaDenunciaDoSorteio =>
  typeof m === "string" && Object.prototype.hasOwnProperty.call(MOTIVOS_DA_DENUNCIA_DE_COMENTARIO_DO_SORTEIO, m);

export type DecisaoDaDenunciaDoSorteio = "procedente" | "improcedente";

export const decisaoDoSorteioValida = (d: unknown): d is DecisaoDaDenunciaDoSorteio =>
  d === "procedente" || d === "improcedente";

/** Por que esta pessoa não denuncia este comentário; `null` se pode. */
export function problemaParaDenunciar(e: { temConta: boolean; meu: boolean }): string | null {
  if (!e.temConta) return "Entre na sua conta para denunciar.";
  if (e.meu) return "Este comentário é seu: você pode apagá-lo.";
  return null;
}

/** Procedente pede explicação (fica na auditoria e na fila); improcedente, não. */
export function problemaNaDecisao(decisao: unknown, resposta: string): string | null {
  if (!decisaoDoSorteioValida(decisao)) return "Escolha: procedente ou improcedente.";
  if (decisao === "procedente" && !resposta.trim()) return "Explique a decisão.";
  return null;
}
