/**
 * Segurança contra organizador fraudulento — regras puras.
 *
 * O golpe: o organizador (ou alguém em nome dele) leva o apostador para um
 * Pix fora da plataforma. O apostador paga, não recebe bilhete válido, e o
 * dinheiro não passou por rateio, comissão nem estorno. Por isso:
 *
 * - **Só vale bilhete pago pela plataforma.** A tela diz isso antes da
 *   compra, no bilhete e no regulamento.
 * - **O telefone do organizador é provado** (código no WhatsApp) **e
 *   aprovado pela plataforma** antes da primeira rifa.
 * - **Quem desconfia denuncia**; o texto que o próprio organizador escreve
 *   (comentário, descrição, bio, legenda de story) é varrido e, se pedir
 *   pagamento por fora, vira denúncia automática.
 * - **A plataforma decide**: improcedente, travar a rifa (vendas param) ou
 *   banir a organização (a porta fecha e todas as rifas travam).
 */

export const MOTIVOS_DE_DENUNCIA = {
  pix_fora: "Pediu pagamento por Pix ou transferência fora da plataforma",
  golpe: "Parece golpe (prêmio falso, sorteio suspeito)",
  sem_entrega: "Não entregou o prêmio",
  conteudo: "Conteúdo ofensivo ou impróprio",
  outro: "Outro motivo",
} as const;

export type MotivoDeDenuncia = keyof typeof MOTIVOS_DE_DENUNCIA;

export function motivoValido(m: unknown): m is MotivoDeDenuncia {
  return typeof m === "string" && m in MOTIVOS_DE_DENUNCIA;
}

export const DENUNCIA_TEXTO_MAX = 1000;
export const DENUNCIAS_POR_DIA = 10;

export type StatusDenuncia = "aberta" | "improcedente" | "rifa_travada" | "organizacao_banida";

export const NOME_STATUS_DENUNCIA: Record<StatusDenuncia, string> = {
  aberta: "em análise",
  improcedente: "improcedente",
  rifa_travada: "rifa travada",
  organizacao_banida: "organização banida",
};

export const PILL_DENUNCIA: Record<StatusDenuncia, string> = {
  aberta: "pending",
  improcedente: "draft",
  rifa_travada: "expired",
  organizacao_banida: "expired",
};

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * O texto pede pagamento fora da plataforma? Procura o pedido ("faz um pix",
 * "chave pix", "deposita", "transfere", "paga direto", "chama no zap pra
 * pagar"), não a palavra "pix" sozinha — "pago com Pix pelo site" é o
 * caminho certo. Devolve o trecho que acendeu, para quem analisa.
 */
export function pedePagamentoPorFora(texto: string): string | null {
  const t = sem(texto);
  const padroes = [
    /chave\s*(do\s*)?pix/,
    /(faz|faca|fazer|manda|mande|envia|envie)\s+(um|o)?\s*pix/,
    /pix\s+(direto|pra\s*mim|para\s*mim|no\s*meu|na\s*minha|por\s*fora)/,
    /(paga|pague|pagar|pagamento)\s+(direto|por\s*fora|no\s*privado|pelo\s*(zap|whats))/,
    /(deposit|transfer)(a|e|ir|ar|encia)\b/,
    /(chama|me\s*chama|chamar)\s+(no|pelo)\s+(zap|whats|pv|privado|direct|dm)\s+(pra|para)\s+(pagar|comprar|garantir)/,
    /compra\s+(direto\s+)?comigo/,
  ];
  for (const p of padroes) {
    const m = p.exec(t);
    if (m) return m[0];
  }
  return null;
}

/**
 * Só Pix, dito antes da compra (resposta 6 do advogado, 10/10/2026): na
 * página da rifa e no carrinho, perto do botão; o cartão do feed diz "Pix"
 * junto ao preço e os Termos repetem.
 */
export const PAGAMENTO_SO_PIX = "Pagamento só por Pix: não aceitamos cartão de crédito nem de débito.";

/** O aviso que a tela mostra perto do botão de comprar. */
export const SO_VALE_PELA_PLATAFORMA =
  "Só vale bilhete pago aqui na plataforma. Nunca pague por Pix direto à organização — se pedirem, denuncie.";
