/**
 * O formato em que cada modelo é submetido e enviado à Meta.
 *
 * Puro, sem rede: é o que os testes exercitam. A Meta recusa o modelo na
 * submissão (corpo começando ou terminando em parâmetro, dois parâmetros
 * colados) ou, pior, aceita e recusa cada envio depois (parâmetro faltando,
 * botão de código sem valor). Pegar isso aqui sai mais barato.
 */
import { TEMPLATES, orderedParams, type TemplateName } from "./templates";

/** Versão da Graph API. Uma só, para o envio e a submissão andarem juntos. */
export const GRAPH_VERSION = "v25.0";

export const IDIOMA_PADRAO = "pt_BR";

/** Corpo do pedido de criação de modelo (`POST /{conta}/message_templates`). */
export function definicaoMeta(nome: TemplateName, idioma = IDIOMA_PADRAO) {
  const spec = TEMPLATES[nome];

  if (spec.categoria === "AUTHENTICATION") {
    // Na autenticação a Meta escreve o texto ("… é seu código de
    // verificação"): o modelo só escolhe o aviso de segurança, o prazo e o
    // botão de copiar.
    return {
      name: spec.whatsappName,
      language: idioma,
      category: "AUTHENTICATION",
      components: [
        { type: "BODY", add_security_recommendation: true },
        { type: "FOOTER", code_expiration_minutes: 10 },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copiar código" }] },
      ],
    };
  }

  return {
    name: spec.whatsappName,
    language: idioma,
    category: spec.categoria,
    components: [
      {
        type: "BODY",
        text: spec.corpo,
        example: { body_text: [spec.exemplo] },
      },
    ],
  };
}

/** Os `components` de um envio: corpo e, no código de acesso, o botão. */
export function componentesDeEnvio(nome: TemplateName, params: Record<string, string>) {
  const valores = orderedParams(nome, params);
  const componentes: Record<string, unknown>[] = [
    { type: "body", parameters: valores.map((text) => ({ type: "text", text })) },
  ];
  if (TEMPLATES[nome].categoria === "AUTHENTICATION") {
    // O botão de copiar leva o mesmo código. Sem ele a Meta recusa o envio.
    componentes.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: valores[0] }],
    });
  }
  return componentes;
}

/** Regras de formato que a Meta confere na submissão. Devolve os problemas. */
export function problemasDeFormato(nome: TemplateName): string[] {
  const spec = TEMPLATES[nome];
  const erros: string[] = [];
  const marcas = [...spec.corpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));

  if (marcas.length !== spec.order.length) {
    erros.push(`${nome}: ${marcas.length} parâmetros no corpo, ${spec.order.length} declarados`);
  }
  if (!marcas.every((n, i) => n === i + 1)) {
    erros.push(`${nome}: parâmetros fora de ordem (${marcas.join(",")})`);
  }
  if (spec.exemplo.length !== spec.order.length) {
    erros.push(`${nome}: ${spec.exemplo.length} exemplos para ${spec.order.length} parâmetros`);
  }
  if (spec.categoria === "UTILITY") {
    const corpo = spec.corpo.trim();
    if (/^\{\{\d+\}\}/.test(corpo)) erros.push(`${nome}: começa com parâmetro`);
    if (/\{\{\d+\}\}[.!?]?$/.test(corpo)) erros.push(`${nome}: termina com parâmetro`);
    if (/\}\}[\s.,;:!?]*\{\{/.test(corpo)) erros.push(`${nome}: dois parâmetros colados`);
    const palavras = corpo.split(/\s+/).length;
    if (palavras < marcas.length * 3) erros.push(`${nome}: parâmetros demais para o texto`);
    if (corpo.length > 1024) erros.push(`${nome}: corpo longo demais`);
  }
  return erros;
}
