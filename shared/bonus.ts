/**
 * Indicação, bônus e metas (etapa 13) — regras puras, lidas pelo servidor
 * (que decide) e pela tela (que mostra o progresso).
 *
 * O bônus é **cota grátis**, e cota grátis numa promoção autorizada só
 * existe se o regulamento aprovado pela SPA/MF a prevê. Por isso:
 *
 * - o programa inteiro nasce desligado (`ConfigPlataforma.bonusLigado`) e só
 *   o administrador geral liga, depois de o advogado confirmar;
 * - a cota de bônus só é resgatada em rifa que marcou "aceita cotas de
 *   bônus" (`campaigns.aceita_cota_bonus`) antes de publicar — a marcação
 *   trava ao publicar e entra no regulamento da rifa.
 *
 * O saldo é um livro-razão (`bonus_lancamentos`) com chave única por motivo:
 * a mesma indicação, a mesma meta ou a mesma visita nunca creditam duas
 * vezes, e o resgate é um `UPDATE` condicional no saldo.
 */

export type TipoDeMeta = "rifas_compradas" | "indicacoes" | "visitas" | "organizacoes_seguidas";

export const TIPOS_DE_META: Record<TipoDeMeta, { nome: string; descreve: (alvo: number) => string }> = {
  rifas_compradas: {
    nome: "Comprar em rifas diferentes",
    descreve: (n) => `Compre em ${n} rifa${n === 1 ? "" : "s"} diferente${n === 1 ? "" : "s"}`,
  },
  indicacoes: {
    nome: "Indicar amigos",
    descreve: (n) => `Indique ${n} amigo${n === 1 ? "" : "s"} que comprem pela primeira vez`,
  },
  visitas: {
    nome: "Trazer visitas",
    descreve: (n) => `Traga ${n} visita${n === 1 ? "" : "s"} nova${n === 1 ? "" : "s"} pelo seu link`,
  },
  organizacoes_seguidas: {
    nome: "Seguir organizações",
    descreve: (n) => (n === 1 ? "Siga 1 organização que faz rifa" : `Siga ${n} organizações que fazem rifa`),
  },
};

export const BONUS_POR_INDICACAO_PADRAO = 1;
export const BONUS_POR_INDICACAO_MAX = 10;
/** Visitas novas que contam por dia, por quem indica: compartilhar não vira fazenda de cliques. */
export const VISITAS_POR_DIA = 20;
/** Cotas de bônus por resgate. */
export const RESGATE_MAX = 10;
export const METAS_MAX = 12;

/** Código do link de indicação: sorteado, sem caractere ambíguo (como o ID do cliente). */
export const ALFABETO_INDICACAO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function gerarCodigoDeIndicacao(sorteio: (max: number) => number): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO_INDICACAO[sorteio(ALFABETO_INDICACAO.length)];
  return s;
}
export function codigoDeIndicacaoValido(c: unknown): c is string {
  return typeof c === "string" && new RegExp(`^[${ALFABETO_INDICACAO}]{8}$`).test(c);
}

export interface Meta {
  id: string;
  titulo: string;
  tipo: TipoDeMeta;
  alvo: number;
  recompensa: number;
  ativa: boolean;
}

/** Confere a meta que o administrador cadastra. Só chaves conhecidas. */
export function validarMeta(bruto: unknown): Omit<Meta, "id"> {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const titulo = typeof b.titulo === "string" ? b.titulo.replace(/\s+/g, " ").trim() : "";
  if (titulo.length < 3 || titulo.length > 80) throw new Error("Dê um título de 3 a 80 caracteres à meta.");
  if (typeof b.tipo !== "string" || !(b.tipo in TIPOS_DE_META)) throw new Error("Tipo de meta desconhecido.");
  const alvo = Number(b.alvo);
  if (!Number.isInteger(alvo) || alvo < 1 || alvo > 1000) throw new Error("O alvo vai de 1 a 1000.");
  const recompensa = Number(b.recompensa);
  if (!Number.isInteger(recompensa) || recompensa < 1 || recompensa > RESGATE_MAX) {
    throw new Error(`A recompensa vai de 1 a ${RESGATE_MAX} cota(s).`);
  }
  return { titulo, tipo: b.tipo as TipoDeMeta, alvo, recompensa, ativa: b.ativa !== false };
}

export interface Progresso {
  rifas_compradas: number;
  indicacoes: number;
  visitas: number;
  organizacoes_seguidas: number;
}

/** Quanto falta em cada meta, e se já foi alcançada. */
export function progressoDasMetas(metas: Meta[], p: Progresso) {
  return metas
    .filter((m) => m.ativa)
    .map((m) => {
      const feito = Math.min(p[m.tipo], m.alvo);
      return { ...m, feito, alcancada: p[m.tipo] >= m.alvo, descricao: TIPOS_DE_META[m.tipo].descreve(m.alvo) };
    });
}

/**
 * Motivo pelo qual NÃO dá para resgatar cotas de bônus nesta rifa, ou `null`.
 * Mesmo corte do reembolso: a menos de 2 horas do sorteio o quadro fecha.
 */
export function bloqueioDoResgate(p: {
  bonusLigado: boolean;
  aceitaCotaBonus: boolean;
  statusRifa: string;
  sorteioEm: Date | null;
  saldo: number;
  quantidade: number;
  agora?: Date;
}): string | null {
  const agora = p.agora ?? new Date();
  if (!p.bonusLigado) return "O programa de bônus não está ativo.";
  if (p.statusRifa !== "published") return "Esta rifa não está vendendo.";
  if (!p.aceitaCotaBonus) return "Esta rifa não aceita cotas de bônus: o regulamento dela não prevê.";
  if (p.sorteioEm && p.sorteioEm.getTime() - agora.getTime() < 2 * 60 * 60 * 1000) {
    return "O resgate fecha 2 horas antes do sorteio.";
  }
  if (!Number.isInteger(p.quantidade) || p.quantidade < 1 || p.quantidade > RESGATE_MAX) {
    return `Resgate de 1 a ${RESGATE_MAX} cota(s) por vez.`;
  }
  if (p.quantidade > p.saldo) return "Saldo de bônus insuficiente.";
  return null;
}

/**
 * O que está errado na quantidade de cotas de bônus da rifa, ou `null`.
 * Aceitar cota grátis exige dizer quantas (é o que a autorização aprova);
 * não aceitar exige zero.
 */
export function problemaNoBonusMax(aceita: boolean, max: unknown, totalCotas: number): string | null {
  if (!aceita) return max === 0 || max === undefined || max === null ? null : "Sem cota de bônus, a quantidade é 0.";
  if (typeof max !== "number" || !Number.isInteger(max) || max < 1) {
    return "Diga quantas cotas de bônus a autorização prevê (pelo menos 1).";
  }
  if (max > totalCotas) return `As cotas de bônus não passam do total da rifa (${totalCotas}).`;
  return null;
}

/**
 * A cláusula do regulamento, quando a rifa aceita cotas de bônus. Diz a
 * quantidade autorizada, como se ganha, que concorre igual, que não vira
 * dinheiro nem reembolso e que não conta para o mínimo de cotas vendidas.
 */
export function clausulaDoBonus(maxCotas: number): string {
  const n = Math.max(0, Math.floor(maxCotas));
  // Rifa publicada antes da quantidade existir (0): segue a cláusula com que
  // foi publicada, sem número e sem teto — mudar agora mudaria o regulamento
  // de quem já comprou.
  if (n === 0) {
    return "Esta rifa aceita cotas de bônus do programa de indicação da plataforma: o participante que as resgata recebe cotas sem pagar, sorteadas entre os números livres, que concorrem em igualdade com as cotas pagas. As cotas de bônus não têm reembolso nem valor em dinheiro.";
  }
  return (
    `Esta rifa distribui até ${n} cota${n === 1 ? "" : "s"} de bônus, sem custo, pelo programa de indicação e metas da plataforma ` +
    "(indicar quem faça a primeira compra paga, comprar em rifas diferentes, trazer visitas pelo link e seguir organizações). " +
    "Quem resgata recebe números sorteados entre os livres, que concorrem em igualdade com as cotas pagas, inclusive às cotas premiadas. " +
    "O resgate fecha 2 horas antes do sorteio e acaba quando a quantidade autorizada se esgota. " +
    "As cotas de bônus não têm reembolso nem valor em dinheiro, não podem ser transferidas e não contam para o mínimo de cotas vendidas para o sorteio " +
    "(na rifa sorteada só quando cheia, contam para completá-la, porque o número já tem dono)."
  );
}

/**
 * Cotas que contam para o mínimo do sorteio. No mínimo em percentual, só as
 * pagas (as de bônus ficam de fora: cota grátis não pode inflar a venda). Na
 * rifa cheia (`cheia_com_data` e `quando_completar`), todas as distribuídas:
 * o número de bônus já tem dono, e sem ele a rifa cheia com bônus nunca
 * sortearia (o "quando completar" marca a data contando o `sold_count` inteiro).
 */
export function vendidasParaOMinimo(soldCount: number, bonusCount: number, modoSorteio?: string | null): number {
  // Os dois modos de rifa cheia: a última cota (paga ou grátis) é a que enche.
  if (modoSorteio === "cheia_com_data" || modoSorteio === "quando_completar") return Math.max(0, soldCount);
  return Math.max(0, soldCount - Math.max(0, bonusCount));
}
