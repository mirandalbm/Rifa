/**
 * Caixa de entrada da plataforma: tudo que espera a decisão de uma pessoa,
 * numa lista só. Cada tipo continua sendo decidido na tela dele (Atendimento,
 * Cadastros fiscais, Organizações) — a caixa só reúne, ordena e leva até lá.
 * Puro: o servidor monta as linhas e o cliente as desenha com as mesmas regras.
 */

export const TIPOS_DA_CAIXA = {
  disputa: { rotulo: "Disputa", tom: "red" },
  reembolso: { rotulo: "Reembolso", tom: "yellow" },
  edicao: { rotulo: "Edição de rifa", tom: "yellow" },
  adiamento: { rotulo: "Adiamento", tom: "yellow" },
  denuncia: { rotulo: "Denúncia", tom: "red" },
  conversa: { rotulo: "Conversa denunciada", tom: "red" },
  grupo: { rotulo: "Grupo denunciado", tom: "red" },
  comentario_sorteio: { rotulo: "Comentário do sorteio", tom: "red" },
  verificacao: { rotulo: "Verificação", tom: "yellow" },
  fiscal: { rotulo: "Cadastro fiscal", tom: "yellow" },
  telefone: { rotulo: "Telefone", tom: "green" },
  banner: { rotulo: "Banner pago", tom: "yellow" },
  trafego: { rotulo: "Tráfego pago", tom: "yellow" },
  entidade: { rotulo: "Entidade beneficiada", tom: "yellow" },
  pix_tardio: { rotulo: "Pix a devolver", tom: "red" },
  retencao: { rotulo: "Saldo retido", tom: "red" },
} as const;

export type TipoDaCaixa = keyof typeof TIPOS_DA_CAIXA;

export interface PendenciaDaCaixa {
  /** Chave estável: tipo + id de origem. */
  chave: string;
  tipo: TipoDaCaixa;
  /** Quem pediu: organização, afiliado ou apostador — nunca telefone nem CPF. */
  quem: string;
  /** O que é, numa frase. */
  oQue: string;
  /** ISO de quando entrou na fila. */
  desde: string;
}

/** Para onde a linha leva: a tela que decide aquele tipo. */
export function destinoDaPendencia(p: Pick<PendenciaDaCaixa, "tipo">): string {
  switch (p.tipo) {
    case "disputa":
    case "reembolso":
      return "/admin/atendimento";
    case "edicao":
    case "adiamento":
      return "/admin/atendimento?aba=rifas";
    case "denuncia":
    case "conversa":
    case "grupo":
    case "comentario_sorteio":
      return "/admin/atendimento?aba=denuncias";
    case "verificacao":
      return "/admin/atendimento?aba=verificacoes";
    case "fiscal":
      return "/admin/fiscal";
    case "telefone":
      return "/admin/organizacoes";
    case "banner":
      return "/admin/marketing/publicidade?aba=banner";
    case "trafego":
      return "/admin/marketing/trafego";
    case "entidade":
      return "/admin/atendimento?aba=entidades";
    case "pix_tardio":
      return "/admin/pedidos#pix-tardio";
    case "retencao":
      return "/admin/cobranca#retencoes";
  }
}

/** Disputa e denúncia primeiro (mexem com dinheiro e golpe); dentro do grupo, o mais antigo. */
const PESO: Record<TipoDaCaixa, number> = {
  disputa: 0,
  denuncia: 0,
  conversa: 0,
  grupo: 0,
  comentario_sorteio: 0,
  reembolso: 1,
  edicao: 1,
  adiamento: 1,
  verificacao: 2,
  fiscal: 2,
  telefone: 2,
  banner: 2,
  trafego: 2,
  entidade: 2,
  pix_tardio: 0,
  retencao: 1,
};

export function ordenarCaixa<T extends Pick<PendenciaDaCaixa, "tipo" | "desde">>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) => PESO[a.tipo] - PESO[b.tipo] || a.desde.localeCompare(b.desde));
}

/** Quantas há de cada tipo, para as abas da tela. */
export function contarPorTipo(linhas: Pick<PendenciaDaCaixa, "tipo">[]): Partial<Record<TipoDaCaixa, number>> {
  const out: Partial<Record<TipoDaCaixa, number>> = {};
  for (const l of linhas) out[l.tipo] = (out[l.tipo] ?? 0) + 1;
  return out;
}
