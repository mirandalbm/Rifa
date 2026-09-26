/**
 * Afiliado de todas as organizações: o vínculo com cada promotora, o termo
 * de adesão e quanto a venda paga. Puro, sem banco — o servidor decide com
 * isto e a tela explica com isto.
 *
 * O afiliado é **avulso**: a conta não tem organização. Ele adere a quantas
 * quiser; cada adesão é um vínculo (pendente → aprovado pela organização) e,
 * se a organização tem termo, um aceite gravado com cópia do texto. O termo
 * é **fotografado na publicação de cada rifa** (`campaigns.termo_id`): a
 * rifa em andamento segue a versão com que foi publicada, até o sorteio.
 */
import { NOME_LIBERACAO, type LiberacaoComissao } from "./plataforma";

export const STATUS_DO_VINCULO = {
  pendente: "Aguardando a organização",
  aprovado: "Aprovado",
  recusado: "Recusado",
  desfeito: "Desfeito",
} as const;
export type StatusDoVinculo = keyof typeof STATUS_DO_VINCULO;

export const COMISSAO_MAX_PCT = 50;
export const TEXTO_EXTRA_MAX = 3000;

export interface EntradaDoTermo {
  comissaoPct: number;
  textoExtra: string;
}

/** Confere o que a organização escreve no termo. Só chaves conhecidas. */
export function validarTermo(bruto: unknown): EntradaDoTermo {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const pct = Number(b.comissaoPct);
  if (!Number.isInteger(pct) || pct < 0 || pct > COMISSAO_MAX_PCT) {
    throw new Error(`Comissão de 0 a ${COMISSAO_MAX_PCT}%, em número inteiro.`);
  }
  const textoExtra = typeof b.textoExtra === "string" ? b.textoExtra.replace(/\r\n?/g, "\n").trim() : "";
  if (textoExtra.length > TEXTO_EXTRA_MAX) throw new Error(`As regras da organização passam de ${TEXTO_EXTRA_MAX} caracteres.`);
  return { comissaoPct: pct, textoExtra };
}

/**
 * O texto do termo, montado dos dados (como o regulamento): quem paga,
 * quanto, quando e as regras que valem para toda a plataforma. A
 * organização só acrescenta as dela. O texto montado é o que fica gravado
 * na versão e copiado em cada aceite — é ele que vale, não a tela.
 */
export function montarTermo(d: {
  organizacao: { nome: string; cnpj: string | null };
  versao: number;
  comissaoPct: number;
  liberacao: LiberacaoComissao;
  textoExtra: string;
}): string {
  const promotora = d.organizacao.cnpj ? `${d.organizacao.nome} (CNPJ ${d.organizacao.cnpj})` : d.organizacao.nome;
  const quando =
    d.liberacao === "imediata"
      ? "A comissão fica disponível para saque na confirmação do pagamento. Se a venda for estornada depois do saque, o valor é cobrado do afiliado."
      : "A comissão fica disponível para saque depois do sorteio da rifa e do fim do prazo de estorno.";
  const linhas = [
    `TERMO DE ADESÃO DE AFILIADO — ${promotora} — versão ${d.versao}`,
    "",
    `1. Quem paga. A comissão é paga por ${promotora}, promotora das rifas, sobre as vendas feitas pelo link ou cupom do afiliado.`,
    `2. Quanto. ${d.comissaoPct}% sobre o valor pago pelo comprador, depois da taxa da plataforma e já com descontos de pacote e cupom.`,
    `3. Quando. ${quando} (${NOME_LIBERACAO[d.liberacao]}.)`,
    "4. Só venda paga conta. Pedido não pago, cancelado ou estornado não gera comissão; estorno desfaz a comissão daquela venda.",
    "5. Autoindicação é proibida: a compra feita pelo próprio afiliado não gera comissão.",
    "6. Esta versão vale para as rifas publicadas enquanto ela estiver em vigor, até o sorteio de cada uma. Versão nova vale só para rifas publicadas depois e precisa de novo aceite.",
    "7. O afiliado pode sair a qualquer momento, sem perder o que já ganhou.",
  ];
  if (d.textoExtra) linhas.push("", "Regras da organização:", d.textoExtra);
  return linhas.join("\n");
}

/**
 * A venda paga comissão a este afiliado nesta rifa? Afiliado ativo, vínculo
 * aprovado com a dona da rifa e, se a rifa foi publicada com termo, o aceite
 * **daquela** versão. Sem isso, a venda segue — só não tem afiliado.
 */
export function podeReceberComissao(d: {
  afiliadoAtivo: boolean;
  vinculoAprovado: boolean;
  termoDaRifa: string | null;
  aceitouTermoDaRifa: boolean;
}): boolean {
  if (!d.afiliadoAtivo || !d.vinculoAprovado) return false;
  return d.termoDaRifa === null || d.aceitouTermoDaRifa;
}

/**
 * O percentual da venda. Com termo na rifa, vale o termo (é o que o afiliado
 * aceitou). Sem termo, o de antes: o combinado com a organização, o do
 * cadastro, o padrão da rifa.
 */
export function pctDaComissao(d: {
  termoPct: number | null;
  vinculoPct: number | null;
  afiliadoPct: number | null;
  rifaPct: number | null;
}): number {
  if (d.termoPct !== null) return d.termoPct;
  return d.vinculoPct ?? d.afiliadoPct ?? d.rifaPct ?? 0;
}

/* ------------------------------------------------------------------ *
 * "Seja um colaborador" (pedido para ser cambista)
 * ------------------------------------------------------------------ */

export const MENSAGEM_MAX = 500;

export function validarPedidoDeColaborador(bruto: unknown): { cidade: string; mensagem: string } {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const limpo = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const cidade = limpo(b.cidade);
  const mensagem = limpo(b.mensagem);
  if (cidade.length < 2) throw new Error("Diga em que cidade você vende.");
  if (cidade.length > 80) throw new Error("Nome da cidade longo demais.");
  if (mensagem.length > MENSAGEM_MAX) throw new Error(`A mensagem passa de ${MENSAGEM_MAX} caracteres.`);
  return { cidade, mensagem };
}
