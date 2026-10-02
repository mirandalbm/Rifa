/**
 * Grupos da rifa — regras puras (as mesmas no servidor e na tela).
 *
 * Um grupo é uma conversa de várias pessoas **sobre uma rifa**, só de
 * apostadores que têm compra paga nela. Organização e afiliado não entram:
 * a conversa privada deles é o canal do golpe do Pix por fora, e num grupo
 * o golpe alcançaria cinquenta pessoas de uma vez.
 *
 * - **Entrar é tudo ou nada**: a chave (grupo, pessoa) decide e o contador de
 *   membros só anda, com teto, na mesma transação.
 * - **Compra paga**: criar, entrar e escrever pedem pedido pago naquela rifa.
 *   O estorno tira o direito de escrever (a conversa continua legível).
 * - **Só texto**, na mesma régua das mensagens (sem link e sem telefone).
 */
import { problemaNaMensagem } from "./mensagens";

/** Teto de participantes: grupo grande vira praça, e praça precisa de moderação que não temos. */
export const GRUPO_MAX_MEMBROS = 50;
export const GRUPO_NOME_MIN = 3;
export const GRUPO_NOME_MAX = 40;
/** Grupos criados por pessoa por dia (`hit`). */
export const GRUPOS_NOVOS_POR_DIA = 3;
/** Entradas por pessoa por dia: contra quem pula de grupo em grupo. */
export const GRUPO_ENTRADAS_POR_DIA = 20;
/** Mensagens por pessoa a cada 5 minutos, em todos os grupos. */
export const GRUPO_MENSAGENS_POR_JANELA = 20;
export const GRUPO_JANELA_MIN = 5;
export const PAGINA_DE_GRUPOS = 20;
export const PAGINA_DE_MENSAGENS_DO_GRUPO = 30;
/** Quantas mensagens a denúncia guarda (a plataforma nunca lê o grupo inteiro). */
export const GRUPO_TRECHO_DA_DENUNCIA = 30;

export function problemaNoNomeDoGrupo(nome: unknown): string | null {
  const t = typeof nome === "string" ? nome.trim() : "";
  if (t.length < GRUPO_NOME_MIN) return `Dê um nome ao grupo (no mínimo ${GRUPO_NOME_MIN} letras).`;
  if (t.length > GRUPO_NOME_MAX) return `O nome passa de ${GRUPO_NOME_MAX} caracteres.`;
  // Sem link e sem telefone: o nome do grupo aparece para quem nem entrou.
  const p = problemaNaMensagem(t);
  return p ? `Nome do grupo: ${p.replace(/^Mensagem: /, "")}` : null;
}

export const grupoCheio = (membros: number) => membros >= GRUPO_MAX_MEMBROS;

export interface EstadoDoGrupo {
  encerrado: boolean;
  souMembro: boolean;
  compraPaga: boolean;
}

/** Por que a pessoa não escreve agora (o texto vai para a tela); `null` se pode. */
export function problemaParaEscreverNoGrupo(e: EstadoDoGrupo): string | null {
  if (!e.souMembro) return "Entre no grupo para escrever.";
  if (e.encerrado) return "Este grupo foi encerrado pela plataforma.";
  if (!e.compraPaga) return "Sua compra desta rifa não está mais paga: você segue lendo, mas não escreve.";
  return null;
}

export const MOTIVOS_DA_DENUNCIA_DE_GRUPO = {
  pix_fora: "Pediu pagamento por Pix ou transferência fora da plataforma",
  golpe: "Parece golpe",
  assedio: "Assédio ou ameaça",
  spam: "Spam ou propaganda",
  outro: "Outro motivo",
} as const;
export type MotivoDaDenunciaDeGrupo = keyof typeof MOTIVOS_DA_DENUNCIA_DE_GRUPO;
export const motivoDoGrupoValido = (m: unknown): m is MotivoDaDenunciaDeGrupo =>
  typeof m === "string" && m in MOTIVOS_DA_DENUNCIA_DE_GRUPO;

/** "Grupos, 3 não lidas" no rótulo: o número nunca vai só na bolinha. */
export function rotuloDosGrupos(naoLidas: number): string {
  if (naoLidas <= 0) return "Grupos";
  return `Grupos, ${naoLidas > 99 ? "mais de 99" : naoLidas} não lida${naoLidas === 1 ? "" : "s"}`;
}
