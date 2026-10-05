/**
 * Os bilhetes do apostador como publicações privadas — regras puras, lidas
 * pelo servidor (que decide o que entra) e pela tela (que desenha).
 *
 * Cada compra **paga** da conta vira uma publicação que só a própria pessoa
 * vê (`/perfil/bilhetes`): a capa da rifa, o prêmio, a data e a hora da
 * compra e os números. Nunca aparece em `/u/<apelido>` nem em rota pública.
 *
 * O que entra: pedido pago **e** visível pela regra da conta
 * (`pedidoVisivel()` — compra feita dentro dela, CPF vinculado ou telefone
 * provado). Pendente, vencido e estornado ficam de fora: bilhete é o que
 * vale, e o que não vale mais está em Minhas compras, com a situação.
 */
import { pedidoVisivel, type Titularidade } from "./contaComprador";
import { formatQuota } from "./format";

/** Quantos bilhetes por página: cada um é um cartão inteiro, com carrossel. */
export const BILHETES_PAGINA = 10;

/** Números mostrados no cartão; o resto vai na página do bilhete. */
export const NUMEROS_NO_CARTAO = 60;

export interface PedidoDoBilhete {
  status: string;
  viaConta: boolean;
  createdAt: Date;
}

/** O pedido vira bilhete na conta? A mesma regra do SQL em `services/bilhetes.ts`. */
export function bilheteEntra(p: PedidoDoBilhete, t: Titularidade): boolean {
  return p.status === "paid" && pedidoVisivel(p, t);
}

const FUSO = "America/Sao_Paulo";

/** "28/09/2026 às 14:32", no fuso de São Paulo — a hora que a pessoa viu ao pagar. */
export function dataEHora(quando: Date | string | null | undefined): string {
  if (!quando) return "";
  const d = typeof quando === "string" ? new Date(quando) : quando;
  if (Number.isNaN(d.getTime())) return "";
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  const hora = p("hour") === "24" ? "00" : p("hour");
  return `${p("day")}/${p("month")}/${p("year")} às ${hora}:${p("minute")}`;
}

/** Onde está a rifa do bilhete: a pessoa quer saber se ainda vai sortear. */
export function situacaoDaRifa(r: { status: string; drawAt: string | Date | null }): string {
  if (r.status === "drawn") return "Sorteio realizado";
  if (r.status === "closed") return "Vendas encerradas";
  const quando = r.drawAt ? dataEHora(r.drawAt) : "";
  return quando ? `Sorteio em ${quando}` : "Sorteio a definir";
}

/**
 * Os números do cartão, já com o zero à esquerda da rifa (`formatQuota`),
 * até o teto; quantos ficaram de fora vai em `restantes`.
 */
export function numerosDoCartao(
  numeros: number[],
  totalQuotas: number,
  /** A rifa numera a partir de zero (`numeracaoZero`). */
  zero: boolean,
  max = NUMEROS_NO_CARTAO,
): { visiveis: string[]; restantes: number } {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const visiveis = ordenados.slice(0, max).map((n) => formatQuota(n, totalQuotas, zero));
  return { visiveis, restantes: Math.max(0, ordenados.length - visiveis.length) };
}

/** O rótulo lido pelo leitor de tela: "3 números: 0001, 0002 e 0003". */
export function rotuloDosNumeros(visiveis: string[], restantes: number): string {
  const total = visiveis.length + restantes;
  if (total === 0) return "Nenhum número";
  const lista =
    visiveis.length <= 1
      ? visiveis.join("")
      : `${visiveis.slice(0, -1).join(", ")} e ${visiveis[visiveis.length - 1]}`;
  const resto = restantes > 0 ? ` e mais ${restantes}` : "";
  return `${total} ${total === 1 ? "número" : "números"}: ${lista}${resto}`;
}
