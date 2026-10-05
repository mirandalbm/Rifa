/**
 * Contrato da plataforma com a promotora (termos de uso para organizações).
 *
 * O texto é do advogado e a plataforma cola inteiro: aqui não se monta nada,
 * só se confere o tamanho. Cada publicação é uma versão nova (nunca edita a
 * anterior: o aceite é prova daquele texto), e enquanto houver versão em
 * vigor a organização só publica rifa depois de aceitá-la.
 */

export const CONTRATO_MIN = 200;
export const CONTRATO_MAX = 60_000;

export class ContratoError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Só a chave `texto`; o resto do corpo é ignorado. */
export function validarContrato(bruto: unknown): { texto: string } {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  if (typeof b.texto !== "string") throw new ContratoError("Cole o texto do contrato.");
  // Quebras de linha do Windows viram \n: o mesmo texto não vira duas versões.
  const texto = b.texto.replace(/\r\n?/g, "\n").trim();
  if (texto.length < CONTRATO_MIN) {
    throw new ContratoError(`O contrato precisa ter pelo menos ${CONTRATO_MIN} caracteres.`);
  }
  if (texto.length > CONTRATO_MAX) {
    throw new ContratoError(`O contrato passa de ${CONTRATO_MAX.toLocaleString("pt-BR")} caracteres.`);
  }
  return { texto };
}

/** A versão que a tela leu volta no aceite: número inteiro positivo. */
export function versaoLida(bruto: unknown): number {
  const v = Number(bruto);
  if (!Number.isInteger(v) || v < 1) throw new ContratoError("Informe a versão do contrato que você leu.");
  return v;
}

/** A frase que barra a publicação. */
export function bloqueioDoContrato(versao: number): string {
  return `Aceite o contrato da plataforma (versão ${versao}) em Configurações → Organização e perfil antes de publicar.`;
}
