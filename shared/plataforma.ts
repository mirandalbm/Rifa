/**
 * Decisões da plataforma que o administrador geral liga e desliga pelo painel
 * — e as regras puras que dependem delas. Puro, sem banco: o servidor decide
 * com isto e a tela mostra com isto.
 */

/* ------------------------------------------------------------------ *
 * Provedor do Pix
 * ------------------------------------------------------------------ */

import { CONFIG_BUSCA_PADRAO, validarConfigBusca, type ConfigBusca } from "./buscar";
import { AVISO_DO_TREVO_PADRAO, validarAvisoDoTrevo, type AvisoDoTrevo } from "./console";
import { CONFIG_PRESENTE_PADRAO, validarConfigPresente, type ConfigPresente } from "./presente";
import { TAXA_REEMBOLSO_MAX_PCT, TAXA_REEMBOLSO_PADRAO_PCT } from "./reembolso";
import { BONUS_POR_INDICACAO_MAX, BONUS_POR_INDICACAO_PADRAO } from "./bonus";
import { CONFIG_IA_PADRAO, configIAGuardada, type ConfigIA } from "./ia";
import { CONFIG_BANNER_PAGO_PADRAO, validarConfigBannerPago, type ConfigBannerPago } from "./bannerPago";
import { CONFIG_TRAFEGO_PADRAO, validarConfigTrafego, type ConfigTrafegoPago } from "./trafego";
import { CONFIG_PATROCINIO_PADRAO, validarConfigPatrocinio, type ConfigPatrocinio } from "./patrocinio";
import { validarPixels, type Pixels } from "./marketing";
import { CORES_DO_SELO_PADRAO, validarCoresDoSelo, type CoresDoSelo } from "./verificacao";
import { idDoCanal } from "./aoVivo";
import { LOTERIAS, type Loteria } from "./sorteiosOficiais";
import { METODOS_LIBERADOS_PADRAO, metodosLiberadosGuardados, type MetodoDeApuracao } from "./apuracao";
import { CONFIG_COBRANCA_PADRAO, validarConfigCobranca, type ConfigCobranca } from "./cobranca";

export const PROVEDORES_PIX = ["mercadopago", "asaas"] as const;
export type ProvedorPix = (typeof PROVEDORES_PIX)[number];

export const NOME_PROVEDOR: Record<ProvedorPix, string> = {
  mercadopago: "Mercado Pago",
  asaas: "Asaas",
};

/** Variáveis que cada provedor precisa no Railway para funcionar. */
export const CREDENCIAIS_PROVEDOR: Record<ProvedorPix, string[]> = {
  mercadopago: ["MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET"],
  asaas: ["ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"],
};

/**
 * O Asaas cobra de um cliente cadastrado com CPF/CNPJ — sem ele, não emite o
 * Pix. O Mercado Pago aceita sem. A tela do comprador pede o CPF só quando o
 * provedor em uso exige.
 */
export const EXIGE_CPF: Record<ProvedorPix, boolean> = {
  mercadopago: false,
  asaas: true,
};

/* ------------------------------------------------------------------ *
 * Configuração da plataforma
 * ------------------------------------------------------------------ */

export interface ConfigPlataforma {
  /**
   * Quem gera o Pix das vendas novas. `null` segue a variável
   * `PAYMENT_PROVIDER` do servidor — o comportamento de antes deste ajuste.
   */
  provedorPix: ProvedorPix | null;
  /**
   * Estorno pelo painel. **Desligado por padrão**: numa rifa, a compra vale
   * como participação e não se desfaz depois do sorteio. Ligar é decisão da
   * plataforma para casos excepcionais (erro de operação, cobrança em
   * duplicidade). Estorno que o próprio provedor avisa (contestação, Pix
   * devolvido pelo banco) é registrado mesmo desligado: o dinheiro já saiu.
   */
  estornoManual: boolean;
  /**
   * Taxa administrativa retida no reembolso fora do arrependimento (depois de
   * 7 dias, ou compra presencial), de 0 a 10% — ver `shared/reembolso.ts`.
   */
  taxaReembolsoPct: number;
  /**
   * Guarda da comissão pela plataforma (etapa 12). **Desligada por padrão**:
   * liga-se quando o contador confirmar o modelo (a plataforma segurando
   * dinheiro de terceiro até o sorteio). Ligada, a venda online com afiliado
   * nasce marcada (`orders.comissao_guardada`): o split do Asaas tira a
   * comissão da parte do promotor, a comissão só libera depois do sorteio e
   * quem paga o saque é a plataforma. Desligar não mexe no que já foi
   * marcado — cada venda segue o contrato com que nasceu.
   */
  guardaComissao: boolean;
  /**
   * Programa de bônus (etapa 13: indicação, metas e cota grátis).
   * **Desligado por padrão**: cota grátis precisa estar prevista no
   * regulamento aprovado pela SPA/MF — liga-se depois de o advogado
   * confirmar. Desligado, nada acumula e nada se resgata; o saldo fica.
   */
  bonusLigado: boolean;
  /** Cotas de bônus para quem indica, quando o indicado paga a primeira compra. */
  bonusPorIndicacao: number;
  /** Rifas patrocinadas (etapa 15): tabela de preço por alcance, faixas de desconto, mínimo, vagas e recarga mínima. */
  patrocinio: ConfigPatrocinio;
  /**
   * Mostra ao organizador o pedido de reembolso do saldo de patrocínio.
   * Nasce desligado: desligado, o botão não existe na tela (nem se fala em
   * reembolso) e o servidor responde 404.
   */
  patrocinioReembolso: boolean;
  /** Os números de rastreamento da plataforma (valem em todas as páginas). */
  marketingPixels: Pixels;
  /** A cor do selo de verificado de cada um, da paleta de 12 (`PALETA_DO_SELO`). */
  coresDoSelo: CoresDoSelo;
  /**
   * O presente (desconto de primeira compra pago pela plataforma, mandado
   * pelos comentários). Nasce desligado — ver `shared/presente.ts`.
   */
  presente: ConfigPresente;
  /** Como o trevo do topo avisa que há novidade (ponto ou cheio, e a cor). */
  avisoDoTrevo: AvisoDoTrevo;
  /**
   * O ícone de publicação para o apostador. Nasce desligado: por ora só a
   * organização e o influenciador publicam.
   */
  publicarApostador: boolean;
  /**
   * A tela Reels (tela cheia vertical com os vídeos das rifas). Nasce
   * desligada: desligada, o botão do console segue levando a "Em breve".
   */
  reelsLigado: boolean;
  /** A caixa de mensagens (conversa de um para um). Nasce desligada, como o Reels. */
  mensagensLigado: boolean;
  /** A tela Buscar (grade das publicações e busca). Nasce desligada, como o Reels. */
  buscarLigado: boolean;
  /** Quais tipos de resultado a busca mostra (a tabela da plataforma). */
  buscarTipos: ConfigBusca;
  /**
   * O fundo da conversa por cima do vídeo, na tela cheia do sorteio, em % de
   * opacidade. Nasce sem fundo (0): só as mensagens na frente do vídeo; a
   * escolha é da plataforma, nunca de quem assiste.
   */
  fundoDaConversaPct: number;
  /**
   * O canal oficial do YouTube de cada loteria (o id `UC…`): sem link colado
   * no sorteio oficial, a tela toca a live que o canal estiver transmitindo.
   */
  canaisDasLoterias: CanaisDasLoterias;
  /**
   * Os métodos de apuração que a plataforma libera (`shared/apuracao.ts`):
   * a promotora escolhe um deles, pela autorização que tem. Nasce com a
   * Loteria Federal (leitura direta); o globo só entra depois de homologado.
   * Nenhum liberado, nenhuma rifa publica.
   */
  metodosDeApuracao: MetodoDeApuracao[];
  /** Banner pago na vitrine: preço do dia, prazo e vagas. Nasce desligado. */
  bannerPago: ConfigBannerPago;
  /** Gestão de tráfego pago: taxa de gestão, mínimos e redes oferecidas. Nasce desligada. */
  trafegoPago: ConfigTrafegoPago;
  /** O assistente de IA (Chatbase) nos painéis do master, do organizador e do afiliado. Nasce desligado. */
  assistenteIA: ConfigIA;
  /**
   * A tabela de cobrança das organizações (`shared/cobranca.ts`): o
   * percentual sobre a venda, o valor por cota e as faixas da taxa Pix.
   * Nasce zerada; cada rifa fotografa a tabela do dia ao publicar.
   */
  cobranca: ConfigCobranca;
}

/**
 * O fundo da conversa por cima do vídeo: por padrão não há fundo (só as
 * mensagens, com sombra no texto, como o chat sobre a live); a plataforma
 * pode pôr um fundo escuro, de 0% (sem fundo) a 100% (sólido).
 */
export const FUNDO_DA_CONVERSA_PADRAO_PCT = 0;
/** As escolhas que a tela da plataforma oferece. */
export const FUNDOS_DA_CONVERSA_PCT = [0, 30, 50, 70, 90, 100] as const;

/** A escolha que vem do painel: inteiro de 0 a 100, senão 400. */
export function validarFundoDaConversa(v: unknown): number {
  const n = typeof v === "number" ? v : Number.NaN;
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw Object.assign(new Error("O fundo da conversa vai de 0% (sem fundo) a 100% (sólido)."), { status: 400 });
  }
  return n;
}

export type CanaisDasLoterias = Partial<Record<Loteria, string>>;

/** O que vem do painel: só loterias conhecidas e cada canal pela régua de `idDoCanal()` (400). Vazio tira o canal. */
export function validarCanaisDasLoterias(v: unknown): CanaisDasLoterias {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) {
    throw Object.assign(new Error("Canais das loterias em formato inválido."), { status: 400 });
  }
  const saida: CanaisDasLoterias = {};
  for (const [chave, valor] of Object.entries(v as Record<string, unknown>)) {
    if (!(chave in LOTERIAS)) throw Object.assign(new Error("Loteria desconhecida."), { status: 400 });
    const id = idDoCanal(valor);
    if (id) saida[chave as Loteria] = id;
  }
  return saida;
}

/** O guardado: o canal que não passe mais na régua sai, sem derrubar o resto. */
function canaisGuardados(v: unknown): CanaisDasLoterias {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const saida: CanaisDasLoterias = {};
  for (const [chave, valor] of Object.entries(v as Record<string, unknown>)) {
    try {
      const id = chave in LOTERIAS ? idDoCanal(valor) : null;
      if (id) saida[chave as Loteria] = id;
    } catch {
      // Canal estragado no banco: a loteria fica sem canal.
    }
  }
  return saida;
}

/** O guardado que não passe mais na régua volta ao padrão (sem fundo), sem derrubar o resto. */
function fundoDaConversaGuardado(v: unknown): number {
  if (v === undefined || v === null) return FUNDO_DA_CONVERSA_PADRAO_PCT;
  try {
    return validarFundoDaConversa(v);
  } catch {
    return FUNDO_DA_CONVERSA_PADRAO_PCT;
  }
}

export const CONFIG_PADRAO: ConfigPlataforma = {
  provedorPix: null,
  estornoManual: false,
  taxaReembolsoPct: TAXA_REEMBOLSO_PADRAO_PCT,
  guardaComissao: false,
  bonusLigado: false,
  bonusPorIndicacao: BONUS_POR_INDICACAO_PADRAO,
  patrocinio: CONFIG_PATROCINIO_PADRAO,
  patrocinioReembolso: false,
  marketingPixels: {},
  coresDoSelo: CORES_DO_SELO_PADRAO,
  presente: CONFIG_PRESENTE_PADRAO,
  avisoDoTrevo: AVISO_DO_TREVO_PADRAO,
  publicarApostador: false,
  reelsLigado: false,
  mensagensLigado: false,
  buscarLigado: false,
  buscarTipos: CONFIG_BUSCA_PADRAO,
  fundoDaConversaPct: FUNDO_DA_CONVERSA_PADRAO_PCT,
  canaisDasLoterias: {},
  metodosDeApuracao: [...METODOS_LIBERADOS_PADRAO],
  bannerPago: CONFIG_BANNER_PAGO_PADRAO,
  trafegoPago: CONFIG_TRAFEGO_PADRAO,
  assistenteIA: CONFIG_IA_PADRAO,
  cobranca: CONFIG_COBRANCA_PADRAO,
};

/** Só as chaves conhecidas: isto vem do corpo da requisição. */
export function validarConfigPlataforma(entrada: Partial<ConfigPlataforma>): ConfigPlataforma {
  const provedor = entrada.provedorPix ?? null;
  if (provedor !== null && !PROVEDORES_PIX.includes(provedor)) {
    throw Object.assign(new Error("Provedor de Pix desconhecido."), { status: 400 });
  }
  const taxa =
    entrada.taxaReembolsoPct === undefined ? TAXA_REEMBOLSO_PADRAO_PCT : Number(entrada.taxaReembolsoPct);
  if (!Number.isInteger(taxa) || taxa < 0 || taxa > TAXA_REEMBOLSO_MAX_PCT) {
    throw Object.assign(
      new Error(`A taxa de reembolso vai de 0 a ${TAXA_REEMBOLSO_MAX_PCT}% (limite do Código de Defesa do Consumidor).`),
      { status: 400 },
    );
  }
  return {
    provedorPix: provedor,
    estornoManual: entrada.estornoManual === true,
    taxaReembolsoPct: taxa,
    guardaComissao: entrada.guardaComissao === true,
    bonusLigado: entrada.bonusLigado === true,
    bonusPorIndicacao: bonusPorIndicacaoValido(entrada.bonusPorIndicacao),
    patrocinio: validarConfigPatrocinio(entrada.patrocinio),
    patrocinioReembolso: entrada.patrocinioReembolso === true,
    marketingPixels: validarPixels(entrada.marketingPixels),
    coresDoSelo: coresDoSeloValidas(entrada.coresDoSelo),
    presente: validarConfigPresente(entrada.presente),
    avisoDoTrevo: validarAvisoDoTrevo(entrada.avisoDoTrevo),
    publicarApostador: entrada.publicarApostador === true,
    reelsLigado: entrada.reelsLigado === true,
    mensagensLigado: entrada.mensagensLigado === true,
    buscarLigado: entrada.buscarLigado === true,
    buscarTipos: validarConfigBusca(entrada.buscarTipos),
    fundoDaConversaPct: fundoDaConversaGuardado(entrada.fundoDaConversaPct),
    canaisDasLoterias: canaisGuardados(entrada.canaisDasLoterias),
    metodosDeApuracao: metodosLiberadosGuardados(entrada.metodosDeApuracao),
    bannerPago: validarConfigBannerPago(entrada.bannerPago),
    trafegoPago: validarConfigTrafego(entrada.trafegoPago),
    assistenteIA: configIAGuardada(entrada.assistenteIA),
    cobranca: validarConfigCobranca(entrada.cobranca),
  };
}

function coresDoSeloValidas(v: unknown): CoresDoSelo {
  try {
    return validarCoresDoSelo(v);
  } catch (e) {
    throw Object.assign(new Error((e as Error).message), { status: 400 });
  }
}

function bonusPorIndicacaoValido(v: unknown): number {
  if (v === undefined || v === null) return BONUS_POR_INDICACAO_PADRAO;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > BONUS_POR_INDICACAO_MAX) {
    throw Object.assign(new Error(`O bônus por indicação vai de 1 a ${BONUS_POR_INDICACAO_MAX} cota(s).`), { status: 400 });
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * Liberação da comissão (escolha de cada organização)
 * ------------------------------------------------------------------ */

export const LIBERACAO_COMISSAO = ["apos_sorteio", "imediata"] as const;
export type LiberacaoComissao = (typeof LIBERACAO_COMISSAO)[number];

export const NOME_LIBERACAO: Record<LiberacaoComissao, string> = {
  apos_sorteio: "Depois do sorteio",
  imediata: "Na hora do pagamento",
};

/**
 * Como a comissão nasce ao confirmar o pagamento.
 *
 * - `apos_sorteio` (padrão): `pending` até passar a janela de estorno e o
 *   sorteio — é a carência que evita pagar comissão por venda que voltou.
 * - `imediata`: já nasce `available`, pronta para saque. A organização escolhe
 *   assumir o risco: se houver estorno depois do saque, o valor aparece como
 *   comissão já paga, para cobrar do divulgador.
 */
export function comissaoInicial(
  modo: LiberacaoComissao,
  paidAt: Date,
  carenciaAte: Date,
  /** Comissão guardada pela plataforma: sempre depois do sorteio. */
  guardada = false,
): { status: "pending" | "available"; availableAt: Date } {
  return modo === "imediata" && !guardada
    ? { status: "available", availableAt: paidAt }
    : { status: "pending", availableAt: carenciaAte };
}

/* ------------------------------------------------------------------ *
 * Split do Asaas
 * ------------------------------------------------------------------ */

/**
 * Quanto do líquido vai para a carteira do promotor, em percentual.
 *
 * O Asaas desconta a tarifa dele antes de dividir; um valor fixo igual ao
 * "bruto menos a taxa" estouraria o líquido e a cobrança seria recusada. Em
 * percentual sobre o líquido, a tarifa se divide na mesma proporção entre
 * plataforma e promotor — e a divisão nunca passa do que entrou.
 *
 * A comissão do divulgador **não** vai no split: ela tem carência (ou não,
 * conforme a organização escolher) e é paga pelo saldo do painel. Mandá-la
 * junto com o pagamento tornaria o estorno impossível de desfazer.
 */
export function percentualDoPromotor(platformPct: number, comissaoGuardadaPct = 0): number {
  const semTaxa = Math.min(100, Math.max(0, 100 - platformPct));
  // Com a guarda da plataforma, a comissão incide sobre o que sobrou da taxa
  // (a mesma ordem de `splitOrder()`) e fica na conta da plataforma.
  const c = Math.min(100, Math.max(0, comissaoGuardadaPct));
  const pct = (semTaxa * (100 - c)) / 100;
  // O Asaas aceita até 4 casas. Para baixo: o split nunca manda ao promotor
  // mais do que a parte dele — a fração que sobra fica com a plataforma.
  return Math.floor(pct * 10_000 + 1e-9) / 10_000;
}

/** Carteira do Asaas: é um UUID. */
export function carteiraAsaasValida(walletId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(walletId.trim());
}
