/**
 * Mensagens — regras puras (as mesmas no servidor e na tela).
 *
 * Caixa de entrada geral, como a DM do Instagram: conversa de um para um
 * entre três tipos de participante — apostador (conta com apelido),
 * organização e afiliado/influenciador. Uma rifa entra na conversa como
 * cartão (o compartilhar), nunca como link no texto.
 *
 * - **A conversa de um par é uma só**: o par entra em ordem canônica e o
 *   índice único do banco decide, nunca um `SELECT` antes.
 * - **Quem não tem vínculo manda pedido de mensagem**: uma só mensagem até
 *   a outra pessoa aceitar (ou responder, que é aceitar).
 * - **Mesma régua dos comentários**: sem link e sem telefone. Emoji vale
 *   para todos aqui (conversa privada).
 */
import { temLinkOuTelefone, limparComentario } from "./comentarios";

export const MENSAGEM_MAX = 1000;
/** Conversas novas por pessoa por dia: contra quem procura gente para abordar. */
export const CONVERSAS_NOVAS_POR_DIA = 20;
/** Mensagens por pessoa na janela. */
export const MENSAGENS_POR_JANELA = 30;
export const JANELA_DE_MENSAGENS_MIN = 5;
/** Quantas mensagens a denúncia leva junto (é só o que a plataforma lê). */
export const TRECHO_DA_DENUNCIA = 30;
export const PAGINA_DE_MENSAGENS = 30;
export const PAGINA_DE_CONVERSAS = 25;
export const PREVIA_MAX = 90;

export type TipoDeParticipante = "comprador" | "organizacao" | "afiliado";
export const TIPOS_DE_PARTICIPANTE: TipoDeParticipante[] = ["comprador", "organizacao", "afiliado"];

export interface Participante {
  tipo: TipoDeParticipante;
  id: string;
}

export type Lado = "a" | "b";
export type SituacaoDaConversa = "pedido" | "aceita" | "recusada";

const chave = (p: Participante) => `${p.tipo}:${p.id}`;

/**
 * O par em ordem canônica: `a` é o menor. O mesmo par, em qualquer ordem,
 * dá a mesma linha — é o que faz o índice único valer.
 */
export function ordenarPar(x: Participante, y: Participante): { a: Participante; b: Participante; ladoDeX: Lado } {
  return chave(x) <= chave(y) ? { a: x, b: y, ladoDeX: "a" } : { a: y, b: x, ladoDeX: "b" };
}

export const outroLado = (l: Lado): Lado => (l === "a" ? "b" : "a");

export function problemaNaMensagem(texto: unknown): string | null {
  const t = typeof texto === "string" ? texto.trim() : "";
  if (!t) return "Escreva a mensagem.";
  if (t.length > MENSAGEM_MAX) return `A mensagem passa de ${MENSAGEM_MAX} caracteres.`;
  const p = temLinkOuTelefone(t);
  return p ? `Mensagem: ${p.charAt(0).toLowerCase()}${p.slice(1)}` : null;
}

export const limparMensagem = limparComentario;

/** A prévia da lista: a primeira linha, cortada. */
export function previaDoTexto(texto: string): string {
  const linha = texto.trim().split("\n")[0].replace(/\s+/g, " ");
  return linha.length > PREVIA_MAX ? `${linha.slice(0, PREVIA_MAX - 1).trimEnd()}…` : linha;
}

/**
 * Como a conversa nasce. Apostador que segue a organização (e a organização
 * falando com quem a segue) já conversa; o resto é pedido de mensagem.
 */
export function situacaoInicial(vinculo: { apostadorSegueAOrganizacao: boolean }): SituacaoDaConversa {
  return vinculo.apostadorSegueAOrganizacao ? "aceita" : "pedido";
}

export interface EstadoDaConversa {
  situacao: SituacaoDaConversa;
  iniciadaPor: Lado;
  bloqueadaPor: Lado | null;
  encerrada: boolean;
}

/** Quem pode escrever agora? `null` = pode. */
export function problemaParaEnviar(c: EstadoDaConversa, eu: Lado): string | null {
  if (c.encerrada) return "Esta conversa foi encerrada pela plataforma.";
  if (c.bloqueadaPor) return c.bloqueadaPor === eu ? "Você bloqueou esta conversa. Desbloqueie para escrever." : "Não é possível enviar mensagem nesta conversa.";
  if (eu === c.iniciadaPor) {
    if (c.situacao === "pedido") return "Aguarde: a pessoa ainda não aceitou o seu pedido de mensagem.";
    if (c.situacao === "recusada") return "O seu pedido de mensagem foi recusado.";
  }
  return null;
}

/** Quem responde um pedido (ou uma recusa) aceita a conversa. */
export function situacaoDepoisDeEnviar(c: EstadoDaConversa, eu: Lado): SituacaoDaConversa {
  return eu !== c.iniciadaPor && c.situacao !== "aceita" ? "aceita" : c.situacao;
}

export const MOTIVOS_DA_DENUNCIA_DE_MENSAGEM = {
  pix_fora: "Pediu pagamento por Pix ou transferência fora da plataforma",
  golpe: "Parece golpe",
  assedio: "Assédio ou ameaça",
  spam: "Spam ou propaganda",
  outro: "Outro motivo",
} as const;
export type MotivoDaDenunciaDeMensagem = keyof typeof MOTIVOS_DA_DENUNCIA_DE_MENSAGEM;
export const motivoDaMensagemValido = (m: unknown): m is MotivoDaDenunciaDeMensagem =>
  typeof m === "string" && m in MOTIVOS_DA_DENUNCIA_DE_MENSAGEM;

export type DecisaoDaDenunciaDeMensagem = "improcedente" | "procedente";
export const decisaoValida = (d: unknown): d is DecisaoDaDenunciaDeMensagem => d === "improcedente" || d === "procedente";

/** O número no rótulo do botão: "Mensagens, 3 não lidas". */
export function rotuloDasMensagens(naoLidas: number): string {
  if (naoLidas <= 0) return "Mensagens";
  return `Mensagens, ${naoLidas > 99 ? "mais de 99" : naoLidas} não lida${naoLidas === 1 ? "" : "s"}`;
}
