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
  | "estorno_pos_sorteio"
  | "chamado_novo";

export interface TemplateSpec {
  /** Nome do modelo aprovado na conta do WhatsApp Business. */
  whatsappName: string;
  /**
   * Categoria na Meta. Código de acesso é AUTHENTICATION — a Meta fixa o
   * texto e exige o botão de copiar; o resto é UTILITY: é sobre a compra, o
   * pagamento ou o resultado de quem recebe, sem nada promocional.
   */
  categoria: "UTILITY" | "AUTHENTICATION";
  /** Ordem dos parâmetros no corpo do modelo aprovado. */
  order: string[];
  /**
   * O corpo como é submetido à Meta: `{{1}}`, `{{2}}`… na ordem de `order`.
   * O texto local sai daqui também, para os dois nunca se afastarem. No de
   * autenticação a Meta escreve o próprio texto; este é só o do registro.
   */
  corpo: string;
  /** Valores de exemplo que a Meta exige na submissão, na ordem de `order`. */
  exemplo: string[];
  /** Texto legível, usado no console em desenvolvimento e no registro. */
  text(params: Record<string, string>): string;
}

type Definicao = Omit<TemplateSpec, "text" | "whatsappName">;

/** O texto local é o corpo da Meta com os parâmetros no lugar. */
function modelo(nome: string, d: Definicao): TemplateSpec {
  return {
    ...d,
    whatsappName: nome,
    text: (p) =>
      d.corpo.replace(/\{\{(\d+)\}\}/g, (_, n: string) => p[d.order[Number(n) - 1]] ?? ""),
  };
}

export const TEMPLATES: Record<TemplateName, TemplateSpec> = {
  codigo_acesso: modelo("codigo_acesso", {
    categoria: "AUTHENTICATION",
    order: ["codigo"],
    corpo: "Seu código de acesso é {{1}}. Ele vale por 10 minutos e serve para ver suas cotas.",
    exemplo: ["482193"],
  }),

  pagamento_confirmado: modelo("pagamento_confirmado", {
    categoria: "UTILITY",
    order: ["nome", "rifa", "quantidade", "numeros", "link"],
    corpo:
      "Olá, {{1}}! Pagamento confirmado na rifa {{2}}. Suas {{3}} cota(s) são: {{4}}. Acompanhe o sorteio em {{5}} e boa sorte!",
    exemplo: ["Maria", "iPhone 17 Pro", "3", "000123, 004567, 089012", "https://rifa.br/pedido/48291734"],
  }),

  cota_premiada: modelo("cota_premiada", {
    categoria: "UTILITY",
    order: ["nome", "premio", "numero"],
    corpo:
      "Parabéns, {{1}}! Você ganhou {{2}} com a cota premiada {{3}}. Nossa equipe vai entrar em contato para combinar a entrega.",
    exemplo: ["Maria", "R$ 100,00 no Pix", "004567"],
  }),

  reserva_expirando: modelo("reserva_expirando", {
    categoria: "UTILITY",
    order: ["nome", "rifa", "minutos", "link"],
    corpo:
      "Olá, {{1}}. Seus números da rifa {{2}} estão reservados por mais {{3}} minutos. Para garantir, pague o Pix em {{4}} antes do prazo.",
    exemplo: ["Maria", "iPhone 17 Pro", "5", "https://rifa.br/pedido/48291734"],
  }),

  venda_afiliado: modelo("venda_afiliado", {
    categoria: "UTILITY",
    order: ["nome", "valor", "comissao", "rifa"],
    corpo:
      "Olá, {{1}}! Você fez uma venda de {{2}} e ganhou {{3}} de comissão na rifa {{4}}. O valor fica disponível depois do sorteio.",
    exemplo: ["João", "R$ 49,00", "R$ 4,90", "iPhone 17 Pro"],
  }),

  estorno_confirmado: modelo("estorno_confirmado", {
    categoria: "UTILITY",
    order: ["nome", "rifa", "valor", "quantidade"],
    // O comprador precisa saber que perdeu os números, não só que recebeu o
    // dinheiro: senão fica esperando o sorteio de uma cota que não é mais
    // dele.
    corpo:
      "Olá, {{1}}. Seu pagamento na rifa {{2}}, no valor de {{3}}, foi estornado. As {{4}} cota(s) voltaram para o estoque e não concorrem mais.",
    exemplo: ["Maria", "iPhone 17 Pro", "R$ 14,70", "3"],
  }),

  /**
   * Depois do sorteio a cota não volta ao estoque, então a mensagem não pode
   * dizer que voltou. Modelo separado porque o texto muda de sentido — e no
   * WhatsApp cada modelo é aprovado por fora, um de cada vez.
   */
  estorno_pos_sorteio: modelo("estorno_pos_sorteio", {
    categoria: "UTILITY",
    order: ["nome", "rifa", "valor"],
    corpo:
      "Olá, {{1}}. Seu pagamento na rifa {{2}}, no valor de {{3}}, foi estornado. Como o sorteio já aconteceu, seus números seguem no registro da rifa.",
    exemplo: ["Maria", "iPhone 17 Pro", "R$ 14,70"],
  }),

  /**
   * Para a organização, não para o comprador: chegou pedido de reembolso e o
   * prazo dela começa a contar quando aprovar. Sem nome nem telefone do
   * cliente — só o ID —, porque o WhatsApp do atendimento pode estar num
   * aparelho compartilhado.
   */
  chamado_novo: modelo("chamado_novo", {
    categoria: "UTILITY",
    order: ["rifa", "protocolo", "cliente", "valor", "link"],
    corpo:
      "Novo pedido de reembolso na rifa {{1}}. Protocolo {{2}}, cliente {{3}}, pedido de {{4}}. Veja o print e responda em {{5}} pelo painel.",
    exemplo: ["iPhone 17 Pro", "RB-20260926-483920", "C-7K2M9QXR", "R$ 14,70", "https://rifa.br/admin/atendimento"],
  }),

  sorteio_realizado: modelo("sorteio_realizado", {
    categoria: "UTILITY",
    order: ["rifa", "numero", "link"],
    corpo:
      "O sorteio da rifa {{1}} foi realizado! O número sorteado é {{2}}. Confira o resultado completo em {{3}} e obrigado por participar.",
    exemplo: ["iPhone 17 Pro", "004567", "https://rifa.br/r/iphone-17-pro"],
  }),
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
