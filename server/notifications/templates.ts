/**
 * Mensagens que o sistema envia.
 *
 * Cada modelo declara o texto em português e a ordem dos parâmetros que a
 * API do WhatsApp espera. Manter as duas coisas no mesmo lugar evita o erro
 * clássico: mudar o texto e esquecer que lá fora o modelo aprovado continua
 * com a ordem antiga.
 */

export type TemplateName =
  | "codigo_acesso"
  | "pagamento_confirmado"
  | "cota_premiada"
  | "reserva_expirando"
  | "venda_afiliado"
  | "sorteio_realizado"
  | "estorno_confirmado"
  | "estorno_pos_sorteio";

export interface TemplateSpec {
  /** Nome do modelo aprovado na conta do WhatsApp Business. */
  whatsappName: string;
  /** Ordem dos parâmetros no corpo do modelo aprovado. */
  order: string[];
  /** Texto legível, usado no console em desenvolvimento e no registro. */
  text(params: Record<string, string>): string;
}

export const TEMPLATES: Record<TemplateName, TemplateSpec> = {
  codigo_acesso: {
    whatsappName: "codigo_acesso",
    order: ["codigo"],
    text: (p) =>
      `Seu código de acesso é ${p.codigo}. Ele vale por 10 minutos e serve para ver suas cotas.`,
  },

  pagamento_confirmado: {
    whatsappName: "pagamento_confirmado",
    order: ["nome", "rifa", "quantidade", "numeros", "link"],
    text: (p) =>
      `${p.nome}, pagamento confirmado! Você tem ${p.quantidade} cota(s) na rifa ${p.rifa}: ${p.numeros}. Acompanhe em ${p.link}`,
  },

  cota_premiada: {
    whatsappName: "cota_premiada",
    order: ["nome", "premio", "numero"],
    text: (p) =>
      `${p.nome}, você tirou uma cota premiada! A cota ${p.numero} vale ${p.premio}. Vamos entrar em contato para a entrega.`,
  },

  reserva_expirando: {
    whatsappName: "reserva_expirando",
    order: ["nome", "rifa", "minutos", "link"],
    text: (p) =>
      `${p.nome}, seus números da rifa ${p.rifa} estão reservados por mais ${p.minutos} minutos. Pague o Pix para garantir: ${p.link}`,
  },

  venda_afiliado: {
    whatsappName: "venda_afiliado",
    order: ["nome", "valor", "comissao", "rifa"],
    text: (p) =>
      `${p.nome}, você fez uma venda de ${p.valor} na rifa ${p.rifa}. Sua comissão é ${p.comissao}.`,
  },

  estorno_confirmado: {
    whatsappName: "estorno_confirmado",
    order: ["nome", "rifa", "valor", "quantidade"],
    // O comprador precisa saber que perdeu os números, não só que recebeu o
    // dinheiro: senão fica esperando o sorteio de uma cota que não é mais
    // dele.
    text: (p) =>
      `${p.nome}, seu pagamento de ${p.valor} na rifa ${p.rifa} foi estornado. As ${p.quantidade} cota(s) voltaram para o estoque e não concorrem mais.`,
  },

  /**
   * Depois do sorteio a cota não volta ao estoque, então a mensagem não pode
   * dizer que voltou. Modelo separado porque o texto muda de sentido — e no
   * WhatsApp cada modelo é aprovado por fora, um de cada vez.
   */
  estorno_pos_sorteio: {
    whatsappName: "estorno_pos_sorteio",
    order: ["nome", "rifa", "valor"],
    text: (p) =>
      `${p.nome}, seu pagamento de ${p.valor} na rifa ${p.rifa} foi estornado. Como o sorteio já aconteceu, seus números seguem no registro da rifa.`,
  },

  sorteio_realizado: {
    whatsappName: "sorteio_realizado",
    order: ["rifa", "numero", "link"],
    text: (p) =>
      `O sorteio da rifa ${p.rifa} saiu! Número sorteado: ${p.numero}. Confira em ${p.link}`,
  },
};

/** Parâmetros na ordem do modelo aprovado — faltando um, a API recusa. */
export function orderedParams(
  template: TemplateName,
  params: Record<string, string>,
): string[] {
  const spec = TEMPLATES[template];
  return spec.order.map((key) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Modelo ${template} exige o parâmetro "${key}".`);
    }
    // A API do WhatsApp recusa quebra de linha e espaço duplo em parâmetro.
    return value.replace(/\s+/g, " ").trim();
  });
}

export function renderText(
  template: TemplateName,
  params: Record<string, string>,
): string {
  return TEMPLATES[template].text(params);
}
