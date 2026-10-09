/**
 * Tráfego pago, fase 3 — a campanha aprovada criada na rede pela API, pela
 * plataforma (hoje, só o Meta: Facebook e Instagram). Regras puras: o nome
 * com o código (para a importação da fase 2 casar), o orçamento e a data de
 * fim, o alvo, o texto do anúncio e a leitura do que a rede devolve. Quem
 * chama a rede é `server/services/trafegoCriacao.ts`.
 *
 * O que não pode afrouxar:
 * - **Tudo nasce PAUSADO.** Ligar é no gerenciador da rede, onde o anúncio de
 *   rifa passa pela revisão de política: nada gasta sem uma pessoa ligar lá.
 * - **O que vai para a rede sai do banco**, nunca do navegador: o nome, a
 *   verba por dia, a região do pedido, o link com a UTM e o texto montado dos
 *   dados públicos da rifa.
 * - **A região é a do pedido ou nenhuma**: estado ou cidade que a rede não
 *   acha é recusa com motivo — nunca o Brasil todo calado.
 * - **O texto passa pela régua** (sem link, sem telefone, sem promessa de
 *   ganho, sem Pix por fora): o prêmio é texto da organização.
 */
import { dataDoSorteio, quemApura } from "./artes";
import { temLinkOuTelefone } from "./comentarios";
import { UFS, type UF } from "./endereco";
import { formatBRL } from "./format";
import { prometeGanho } from "./marketingIA";
import { pedePagamentoPorFora } from "./seguranca";
import { codigoDaCampanha } from "./trafego";

export const SITUACOES_DA_CRIACAO = {
  criando: "Criando",
  criada: "Criada (pausada)",
  falhou: "Falhou",
} as const;
export type SituacaoDaCriacao = keyof typeof SITUACOES_DA_CRIACAO;

/**
 * Uma criação que ficou em `criando` mais do que isto (o processo caiu no meio
 * das chamadas) pode ser tentada de novo. As chamadas à rede têm prazo de
 * 30 s cada, e a criação inteira cabe bem abaixo disto.
 */
export const PRAZO_DA_CRIACAO_MIN = 10;

/** As variáveis do servidor que o Meta exige (o nome, nunca o valor, vai para a tela). */
export const VARIAVEIS_DO_META = ["META_ADS_TOKEN", "META_AD_ACCOUNT_ID", "META_PAGE_ID"] as const;

/**
 * O que falta (ou está fora do formato) nas variáveis do Meta. Sem nada
 * faltando, lista vazia. Só os nomes saem daqui: o valor nunca vai à tela.
 */
export function faltaNoMeta(env: Partial<Record<string, string | undefined>>): string[] {
  const falta: string[] = [];
  const v = (k: string) => env[k]?.trim() ?? "";
  if (!v("META_ADS_TOKEN")) falta.push("META_ADS_TOKEN");
  if (!v("META_AD_ACCOUNT_ID")) falta.push("META_AD_ACCOUNT_ID");
  else if (!/^act_\d{5,30}$/.test(v("META_AD_ACCOUNT_ID"))) falta.push("META_AD_ACCOUNT_ID (no formato act_…)");
  if (!v("META_PAGE_ID")) falta.push("META_PAGE_ID");
  else if (!/^\d{5,30}$/.test(v("META_PAGE_ID"))) falta.push("META_PAGE_ID (só números)");
  return falta;
}

/** Limite do nome na rede; o código vai na frente, então nunca é cortado. */
export const NOME_NA_REDE_MAX = 200;

/** `trafego-<código> · <título da rifa>`: o código casa a importação do gasto (fase 2). */
export function nomeNaRede(id: string, titulo: string): string {
  const limpo = titulo.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const nome = `trafego-${codigoDaCampanha(id)} · ${limpo}`;
  return nome.length > NOME_NA_REDE_MAX ? `${nome.slice(0, NOME_NA_REDE_MAX - 1)}…` : nome;
}

/** Quantos dias a verba dura pela conta: investimento ÷ por dia, para baixo (nunca menos de 1). */
export function diasDaVerba(investimentoCents: number, verbaDiaCents: number): number {
  if (!(verbaDiaCents > 0)) return 1;
  return Math.max(1, Math.floor(investimentoCents / verbaDiaCents));
}

/** A data de fim na rede: o começo mais os dias que a verba dura. */
export function fimDaVerba(inicio: Date, investimentoCents: number, verbaDiaCents: number): Date {
  return new Date(inicio.getTime() + diasDaVerba(investimentoCents, verbaDiaCents) * 86_400_000);
}

/** Idade mínima de quem vê o anúncio de rifa (e o teto do Meta, 65 = 65 ou mais). */
export const IDADE_MINIMA_DO_ANUNCIO = 18;
export const IDADE_MAXIMA_DO_META = 65;

export type AlvoDoPedido =
  | { tipo: "pais" }
  | { tipo: "estado"; uf: UF; estado: string }
  | { tipo: "cidade"; uf: UF; estado: string; cidade: string };

/** A região do pedido: o Brasil, o estado ou a cidade (cidade sempre com o estado). */
export function alvoDoPedido(p: { uf: string | null; cidade: string | null }): AlvoDoPedido {
  if (!p.uf || !Object.hasOwn(UFS, p.uf)) return { tipo: "pais" };
  const uf = p.uf as UF;
  const estado = UFS[uf];
  if (p.cidade && p.cidade.trim()) return { tipo: "cidade", uf, estado, cidade: p.cidade.trim() };
  return { tipo: "estado", uf, estado };
}

const comparavel = (s: unknown) =>
  typeof s === "string"
    ? s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";

/**
 * Entre os locais que a busca de geolocalização do Meta devolveu, o que é o
 * do pedido: do Brasil, do tipo certo, com o nome igual (sem acento e sem
 * diferença de maiúscula) e, na cidade, no estado do pedido. A resposta vem
 * de fora: é dado, só as chaves conhecidas são lidas. Sem achar, `null` —
 * quem chama recusa com o motivo, nunca cai no Brasil todo.
 */
export function localDoMeta(resultados: unknown, alvo: AlvoDoPedido): string | null {
  if (alvo.tipo === "pais" || !Array.isArray(resultados)) return null;
  for (const bruto of resultados) {
    if (!bruto || typeof bruto !== "object") continue;
    const l = bruto as Record<string, unknown>;
    if (typeof l.key !== "string" || !/^\d{1,20}$/.test(l.key)) continue;
    if (l.country_code !== "BR") continue;
    if (alvo.tipo === "estado") {
      if (l.type === "region" && comparavel(l.name) === comparavel(alvo.estado)) return l.key;
    } else if (l.type === "city" && comparavel(l.name) === comparavel(alvo.cidade) && comparavel(l.region) === comparavel(alvo.estado)) {
      return l.key;
    }
  }
  return null;
}

/** O alvo do conjunto de anúncios no Meta: onde e a idade (maiores de 18). */
export function segmentacaoDoMeta(alvo: AlvoDoPedido, chaveDoLocal: string | null) {
  const geo =
    alvo.tipo === "pais"
      ? { countries: ["BR"] }
      : alvo.tipo === "estado"
        ? { regions: [{ key: chaveDoLocal }] }
        : { cities: [{ key: chaveDoLocal, radius: 10, distance_unit: "kilometer" }] };
  return { geo_locations: geo, age_min: IDADE_MINIMA_DO_ANUNCIO, age_max: IDADE_MAXIMA_DO_META };
}

export const ROTULO_DO_ALVO = (alvo: AlvoDoPedido) =>
  alvo.tipo === "pais" ? "Brasil todo" : alvo.tipo === "estado" ? alvo.estado : `${alvo.cidade}/${alvo.uf}`;

/** Os dados públicos da rifa que entram no texto do anúncio. */
export interface DadosDoAnuncio {
  premio: string;
  precoCents: number;
  drawAt: Date | string | null;
  metodoApuracao: string | null;
  autorizacao: string | null;
}

export const TITULO_DO_ANUNCIO_MAX = 40;
export const AVISO_DO_ANUNCIO = "Só vale bilhete pago pela plataforma.";

/**
 * O texto do anúncio, montado dos dados públicos da rifa: o prêmio, o preço,
 * a data e quem apura, a autorização e o aviso. O título é o prêmio, curto.
 */
export function textoDoAnuncio(d: DadosDoAnuncio): { mensagem: string; titulo: string } {
  const premio = d.premio.replace(/\s+/g, " ").trim();
  const sorteio = d.drawAt ? `Sorteio ${dataDoSorteio(d.drawAt)} ${quemApura(d.metodoApuracao)}.` : `Sorteio ${quemApura(d.metodoApuracao)}.`;
  const linhas = [
    `🎟️ ${premio}`,
    `${formatBRL(d.precoCents)} a cota. ${sorteio}`,
    d.autorizacao ? `Rifa autorizada SPA/MF nº ${d.autorizacao}.` : "",
    AVISO_DO_ANUNCIO,
  ].filter(Boolean);
  const titulo = premio.length > TITULO_DO_ANUNCIO_MAX ? `${premio.slice(0, TITULO_DO_ANUNCIO_MAX - 1)}…` : premio;
  return { mensagem: linhas.join("\n"), titulo };
}

/**
 * O texto passa na régua? Sem link e sem telefone (o número da autorização
 * vem do banco, conferido nos dados legais, e fica fora desta conta), sem
 * promessa de ganho (as redes recusam e o CDC chama de enganosa) e sem Pix
 * por fora. Devolve o motivo, ou `null`.
 */
export function problemaNoTextoDoAnuncio(texto: string, autorizacao: string | null): string | null {
  const semAutorizacao = autorizacao ? texto.split(autorizacao).join(" ") : texto;
  const p = temLinkOuTelefone(semAutorizacao);
  if (p) return `O texto do anúncio (o prêmio da rifa) ${p.charAt(0).toLowerCase()}${p.slice(1)}`;
  if (prometeGanho(texto)) return "O texto do anúncio promete ganho (as redes recusam e o CDC chama de propaganda enganosa). Ajuste o prêmio da rifa.";
  if (pedePagamentoPorFora(texto)) return "O texto do anúncio pede pagamento por fora da plataforma.";
  return null;
}

/** O passo em que a criação parou, para a mensagem e para os ids da metade. */
export const PASSOS_DA_CRIACAO = {
  local: "ao procurar a região",
  imagem: "ao enviar a imagem",
  campanha: "ao criar a campanha",
  conjunto: "ao criar o conjunto de anúncios",
  criativo: "ao criar o criativo",
  anuncio: "ao criar o anúncio",
  pausar: "ao pausar a campanha",
} as const;
export type PassoDaCriacao = keyof typeof PASSOS_DA_CRIACAO;

/** Os ids que a criação vai juntando na rede (a metade, se parar no meio). */
export const ROTULO_DOS_IDS: Record<string, string> = {
  campanha: "Campanha",
  conjunto: "Conjunto de anúncios",
  criativo: "Criativo",
  anuncio: "Anúncio",
  imagem: "Imagem (hash)",
};

/**
 * O erro do Meta em português, sem nada da resposta crua (que pode trazer
 * ids e detalhes da conta) e nunca com o token: só o passo e o código.
 */
export function erroDoMeta(passo: PassoDaCriacao, status: number, corpo: unknown): string {
  const e = corpo && typeof corpo === "object" ? ((corpo as { error?: unknown }).error as Record<string, unknown> | undefined) : undefined;
  const codigo = e && typeof e.code === "number" ? e.code : null;
  const sub = e && typeof e.error_subcode === "number" ? e.error_subcode : null;
  const onde = PASSOS_DA_CRIACAO[passo];
  if (codigo === 190 || status === 401) return `O Meta recusou o token ${onde}. Confira a META_ADS_TOKEN (usuário do sistema com ads_management).`;
  if (codigo === 200 || codigo === 10 || (codigo !== null && codigo >= 200 && codigo < 300) || status === 403) {
    return `O Meta negou a permissão ${onde}. Confira se o usuário do sistema tem acesso à conta de anúncios e à página.`;
  }
  if (codigo === 4 || codigo === 17 || codigo === 32 || codigo === 613 || status === 429) return `O Meta pediu para esperar (limite de chamadas) ${onde}. Tente de novo em alguns minutos.`;
  if (codigo === 100) return `O Meta recusou um campo do pedido ${onde} (código 100${sub ? `/${sub}` : ""}). Confira a conta de anúncios e a página.`;
  if (codigo !== null) return `O Meta recusou o pedido ${onde} (código ${codigo}${sub ? `/${sub}` : ""}).`;
  return `O Meta respondeu com erro ${onde} (HTTP ${status}).`;
}

/** O id que a rede devolveu é um id de verdade (só dígitos), nunca qualquer coisa. */
export function idDaRede(v: unknown): string | null {
  return typeof v === "string" && /^\d{1,30}$/.test(v) ? v : null;
}

/** O hash da imagem enviada ao Meta (letras e números), nunca qualquer coisa. */
export function hashDaImagem(v: unknown): string | null {
  return typeof v === "string" && /^[0-9a-zA-Z]{8,64}$/.test(v) ? v : null;
}
