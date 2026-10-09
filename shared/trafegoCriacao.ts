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
import { temLink, temLinkOuTelefone } from "./comentarios";
import { UFS, type UF } from "./endereco";
import { formatBRL } from "./format";
import { prometeGanho } from "./marketingIA";
import { pedePagamentoPorFora } from "./seguranca";
import { codigoDaCampanha, codigoNoNome } from "./trafego";

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

/**
 * O que falta no servidor para criar: as variáveis do Meta e, em produção, o
 * endereço público do site (o link do anúncio leva a ele; sem a variável, o
 * endereço sairia do cabeçalho `Host` da requisição de quem clicou).
 */
export function faltaNoServidor(env: Partial<Record<string, string | undefined>>): string[] {
  const falta = faltaNoMeta(env);
  if (env.NODE_ENV === "production" && !basePublicaDoAnuncio(env.PUBLIC_BASE_URL)) {
    falta.push(env.PUBLIC_BASE_URL?.trim() ? "PUBLIC_BASE_URL (com https:// e sem usuário nem senha)" : "PUBLIC_BASE_URL");
  }
  return falta;
}

/**
 * O endereço público do site para o link do anúncio, em produção: aparado,
 * `https:`, sem usuário nem senha, sem consulta nem âncora; sem barra no fim.
 * Fora disso, `null` — a criação não acontece com um link que não é o do site.
 */
export function basePublicaDoAnuncio(bruto: string | undefined | null): string | null {
  const t = bruto?.trim();
  if (!t) return null;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || !u.hostname.includes(".")) return null;
  return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
}

/** Limite do nome na rede; o código vai na frente, então nunca é cortado. */
export const NOME_NA_REDE_MAX = 200;

/** `trafego-<código> · <título da rifa>`: o código casa a importação do gasto (fase 2). */
export function nomeNaRede(id: string, titulo: string): string {
  const limpo = titulo.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const nome = `trafego-${codigoDaCampanha(id)} · ${limpo}`;
  return nome.length > NOME_NA_REDE_MAX ? `${nome.slice(0, NOME_NA_REDE_MAX - 1)}…` : nome;
}

/**
 * O orçamento diário mínimo que se manda ao Meta (R$ 6,00). O piso do Meta
 * muda com a moeda e o lance; abaixo deste valor, o conjunto costuma ser
 * recusado — melhor dizer antes, com o motivo, do que deixar pela metade.
 */
export const DIARIO_MIN_DO_META_CENTS = 600;

export interface OrcamentoNoMeta {
  /** O que resta da verba da campanha (investimento − gasto já lançado em todas as redes). */
  restanteCents: number;
  /** Em quantas redes a campanha divide a verba. */
  redes: number;
  /** A parte do Meta: por dia e no total, e os dias que isso dura. */
  diarioCents: number;
  totalCents: number;
  dias: number;
  /**
   * O que vai ao Meta como `lifetime_budget` do conjunto (diário × dias, com
   * o mesmo `end_time`): o teto rígido. O diário pode passar do valor num dia
   * (o Meta distribui), o total da vida do conjunto não.
   */
  vidaCents: number;
}

/**
 * Quanto vai para o Meta, casado com a verba que sobra e com as redes da
 * campanha: a base é `investimento − gasto`, e com mais de uma rede a parte
 * do Meta é a divisão em partes iguais, para baixo — `floor(por dia ÷ redes)`
 * por dia e `floor(restante ÷ redes)` no total. Os dias são o total ÷ o
 * diário, para baixo, então diário × dias nunca passa do total (e o total
 * nunca passa do que resta). Se o total não dá um dia inteiro, vai num dia
 * só, com o total como diário. Nada restando, ou o diário abaixo do mínimo
 * que o Meta aceita, é recusa com o motivo.
 */
export function orcamentoNoMeta(c: { investimentoCents: number; gastoCents: number; verbaDiaCents: number; redes: readonly string[] }):
  | { ok: true; orcamento: OrcamentoNoMeta }
  | { ok: false; motivo: string } {
  const redes = Math.max(1, c.redes.length);
  const restanteCents = Math.max(0, c.investimentoCents - c.gastoCents);
  if (restanteCents <= 0) return { ok: false, motivo: "Nada resta da verba desta campanha: não há o que mandar ao Meta." };
  const totalCents = Math.floor(restanteCents / redes);
  let diarioCents = Math.floor(c.verbaDiaCents / redes);
  let dias = 0;
  if (diarioCents >= DIARIO_MIN_DO_META_CENTS) {
    if (totalCents < diarioCents) {
      // O que resta não dá um dia inteiro: vai num dia só, com o total como diário.
      diarioCents = totalCents;
      dias = 1;
    } else {
      dias = Math.floor(totalCents / diarioCents);
    }
  }
  if (diarioCents < DIARIO_MIN_DO_META_CENTS) {
    const porque = redes > 1 ? `, a ${diarioCents === Math.floor(c.verbaDiaCents / redes) ? "verba por dia" : "verba que resta"} dividida entre ${redes} redes` : "";
    return {
      ok: false,
      motivo: `A parte do Meta por dia (${formatBRL(diarioCents)}${porque}) fica abaixo do mínimo que o Meta aceita (${formatBRL(DIARIO_MIN_DO_META_CENTS)}).`,
    };
  }
  const vidaCents = diarioCents * dias;
  // O mínimo vale sobre o que o Meta recebe por dia na média: o total da vida ÷ os dias.
  if (Math.floor(vidaCents / dias) < DIARIO_MIN_DO_META_CENTS) {
    return { ok: false, motivo: `O orçamento do Meta por dia fica abaixo do mínimo (${formatBRL(DIARIO_MIN_DO_META_CENTS)}).` };
  }
  return { ok: true, orcamento: { restanteCents, redes, diarioCents, totalCents, dias, vidaCents } };
}

/** A frase da tela: quanto foi para o Meta e por quê. */
export function explicarOrcamento(o: OrcamentoNoMeta): string {
  const divisao = o.redes > 1 ? `, dividido em partes iguais entre as ${o.redes} redes da campanha` : "";
  const vida = o.vidaCents ?? o.diarioCents * o.dias;
  return `${formatBRL(vida)} no total em ${o.dias} ${o.dias === 1 ? "dia" : "dias"} (teto do conjunto no Meta; ${formatBRL(o.diarioCents)} por dia na média): o que resta da verba (${formatBRL(o.restanteCents)})${divisao}.`;
}

/** A data de fim na rede: o começo mais os dias do orçamento. */
export function fimDoOrcamento(inicio: Date, o: Pick<OrcamentoNoMeta, "dias">): Date {
  return new Date(inicio.getTime() + o.dias * 86_400_000);
}

/** Idade mínima de quem vê o anúncio de rifa (e o teto do Meta, 65 = 65 ou mais). */
export const IDADE_MINIMA_DO_ANUNCIO = 18;
export const IDADE_MAXIMA_DO_META = 65;

export type AlvoDoPedido =
  | { tipo: "pais" }
  | { tipo: "estado"; uf: UF; estado: string }
  | { tipo: "cidade"; uf: UF; estado: string; cidade: string };

/**
 * A região do pedido: o Brasil (sem UF), o estado ou a cidade (sempre com o
 * estado). UF fora da lista é `null` — quem chama recusa, nunca cai no Brasil todo.
 */
export function alvoDoPedido(p: { uf: string | null; cidade: string | null }): AlvoDoPedido | null {
  if (p.uf === null || p.uf === undefined || p.uf === "") return p.cidade && p.cidade.trim() ? null : { tipo: "pais" };
  if (!Object.hasOwn(UFS, p.uf)) return null;
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
/**
 * O número da autorização é texto da organização (os dados legais só conferem
 * de 5 a 80 caracteres). A linha dele só sai da régua do número longo se ele
 * tiver a cara de um número de autorização: letras, dígitos, espaço e
 * `. / - º`, sem link e sem nada com a forma de um celular (DDD, 9 e oito
 * dígitos). Fora disso, a linha passa pela régua inteira.
 */
const AUTORIZACAO_ESTRITA = /^[\p{L}\p{N} ./º-]{5,80}$/u;
const PARECE_CELULAR = /(?<!\d)\(?\d{2}\)?[\s.-]?9\d{4}[\s.-]?\d{4}(?!\d)/;
export function autorizacaoNoFormato(autorizacao: string): boolean {
  return AUTORIZACAO_ESTRITA.test(autorizacao) && !temLink(autorizacao) && !PARECE_CELULAR.test(autorizacao);
}

/** A linha da autorização, montada do número que veio do banco (conferido nos dados legais). */
export const linhaDaAutorizacao = (autorizacao: string) => `Rifa autorizada SPA/MF nº ${autorizacao}.`;

export function textoDoAnuncio(d: DadosDoAnuncio): { mensagem: string; titulo: string } {
  const premio = d.premio.replace(/\s+/g, " ").trim();
  const sorteio = d.drawAt ? `Sorteio ${dataDoSorteio(d.drawAt)} ${quemApura(d.metodoApuracao)}.` : `Sorteio ${quemApura(d.metodoApuracao)}.`;
  const linhas = [
    `🎟️ ${premio}`,
    `${formatBRL(d.precoCents)} a cota. ${sorteio}`,
    d.autorizacao ? linhaDaAutorizacao(d.autorizacao) : "",
    AVISO_DO_ANUNCIO,
  ].filter(Boolean);
  const titulo = premio.length > TITULO_DO_ANUNCIO_MAX ? `${premio.slice(0, TITULO_DO_ANUNCIO_MAX - 1)}…` : premio;
  return { mensagem: linhas.join("\n"), titulo };
}

/**
 * O texto passa na régua? Sem link e sem telefone nas linhas do texto **fora**
 * a linha da autorização (o número dela vem do banco, conferido nos dados
 * legais, e tem dígitos de sobra) — a linha inteira sai da conta, nunca o
 * número de dentro das outras; sem promessa de ganho (as redes recusam e o
 * CDC chama de enganosa) e sem Pix por fora. Devolve o motivo, ou `null`.
 */
export function problemaNoTextoDoAnuncio(texto: string, autorizacao: string | null): string | null {
  // Link nunca, em linha nenhuma — nem na da autorização.
  if (temLink(texto)) return "O texto do anúncio não pode ter link (nem no prêmio, nem no número da autorização). Ajuste os dados da rifa.";
  // Só a linha de uma autorização no formato estrito sai da conta do número longo.
  const daAutorizacao = autorizacao && autorizacaoNoFormato(autorizacao) ? linhaDaAutorizacao(autorizacao) : null;
  const semAutorizacao = texto
    .split("\n")
    .filter((l) => l !== daAutorizacao)
    .join("\n");
  const p = temLinkOuTelefone(semAutorizacao);
  if (p) {
    return autorizacao && !daAutorizacao
      ? "O texto do anúncio não pode ter telefone nem número longo — e o número da autorização, fora do formato de um número de autorização, também conta. Confira os dados legais e o prêmio da rifa."
      : `O texto do anúncio (o prêmio da rifa) ${p.charAt(0).toLowerCase()}${p.slice(1)}`;
  }
  if (prometeGanho(texto)) return "O texto do anúncio promete ganho (as redes recusam e o CDC chama de propaganda enganosa). Ajuste o prêmio da rifa.";
  if (pedePagamentoPorFora(texto)) return "O texto do anúncio pede pagamento por fora da plataforma.";
  return null;
}

/** O passo em que a criação parou, para a mensagem e para os ids da metade. */
export const PASSOS_DA_CRIACAO = {
  conta: "ao conferir a conta de anúncios",
  busca: "ao procurar campanhas com o código",
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

/** A conta de anúncios precisa estar em reais e no fuso de São Paulo (a verba e o dia do gasto dependem disso). */
export const MOEDA_DA_CONTA = "BRL";
export const FUSO_DA_CONTA = "America/Sao_Paulo";

/** O que está errado na conta de anúncios que o Meta descreveu, ou `null`. Só as duas chaves são lidas. */
export function problemaNaContaDoMeta(resposta: unknown): string | null {
  const r = resposta && typeof resposta === "object" ? (resposta as Record<string, unknown>) : {};
  const moeda = typeof r.currency === "string" ? r.currency : "";
  const fuso = typeof r.timezone_name === "string" ? r.timezone_name : "";
  if (moeda !== MOEDA_DA_CONTA) {
    return `A conta de anúncios do Meta está em ${moeda ? moeda.slice(0, 8) : "moeda desconhecida"}, não em reais (BRL): a verba seria cobrada errado. Nada foi criado.`;
  }
  if (fuso !== FUSO_DA_CONTA) {
    return `A conta de anúncios do Meta está no fuso ${fuso ? fuso.slice(0, 40) : "desconhecido"}, não no de São Paulo: o dia do gasto não casaria. Nada foi criado.`;
  }
  return null;
}

/**
 * Entre as campanhas que a busca do Meta devolveu, as que levam o código desta
 * (a mesma régua da importação, `codigoNoNome`) e que o sistema não conhece —
 * nem a criação atual, nem a metade anotada para apagar. Achou alguma, a
 * campanha já foi montada lá (à mão, ou por uma resposta que se perdeu no
 * prazo): quem chama recusa, com o id, para a plataforma conferir.
 */
export function campanhaJaNoMeta(resultados: unknown, codigo: string, conhecidos: ReadonlySet<string>): string | null {
  if (!Array.isArray(resultados)) return null;
  for (const bruto of resultados) {
    if (!bruto || typeof bruto !== "object") continue;
    const l = bruto as Record<string, unknown>;
    const id = idDaRede(l.id);
    if (id && codigoNoNome(l.name) === codigo && !conhecidos.has(id)) return id;
  }
  return null;
}

/**
 * A busca de campanhas por nome que o Meta devolveu: só a lista em `data`,
 * com `id` e `name`. Fora do formato, `null` — quem chama recusa, nunca lê
 * como "nenhuma campanha".
 */
export function lerBuscaDoMeta(resposta: unknown): { id: string; name: string }[] | null {
  if (!resposta || typeof resposta !== "object" || !Array.isArray((resposta as { data?: unknown }).data)) return null;
  const lista: { id: string; name: string }[] = [];
  for (const bruto of (resposta as { data: unknown[] }).data) {
    if (!bruto || typeof bruto !== "object") continue;
    const l = bruto as Record<string, unknown>;
    const id = idDaRede(l.id);
    if (id && typeof l.name === "string") lista.push({ id, name: l.name });
  }
  return lista;
}

/** A campanha `id` está viva no Meta, com o código no nome? (a retomada só adota assim) */
export function campanhaVivaNoMeta(lista: readonly { id: string; name: string }[], codigo: string, id: string | undefined): boolean {
  return Boolean(id) && lista.some((c) => c.id === id && codigoNoNome(c.name) === codigo);
}

/** Uma peça para apagar no gerenciador: o tipo e o id (a lista é achatada, um id uma vez só). */
export interface Resto {
  tipo: string;
  id: string;
}

/** Os ids de uma criação como peças, na ordem em que nascem. */
export function achatarIds(ids: Record<string, string> | null | undefined): Resto[] {
  const ordem = ["campanha", "conjunto", "criativo", "anuncio", "imagem"];
  return Object.entries(ids ?? {})
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .sort(([a], [b]) => ordem.indexOf(a) - ordem.indexOf(b))
    .map(([tipo, id]) => ({ tipo, id }));
}

/**
 * Junta peças a `restos` sem repetir id, e nunca lista como "para apagar" um
 * id que é da criação viva (`vivos`) — o hash da imagem, igual entre
 * tentativas, inclusive.
 */
export function juntarRestos(restos: readonly Resto[] | null | undefined, novos: readonly Resto[], vivos: Iterable<string> = []): Resto[] {
  const fora = new Set(vivos);
  const vistos = new Set<string>();
  const saida: Resto[] = [];
  for (const r of [...(restos ?? []), ...novos]) {
    if (!r || typeof r.id !== "string" || typeof r.tipo !== "string") continue;
    if (fora.has(r.id) || vistos.has(r.id)) continue;
    vistos.add(r.id);
    saida.push({ tipo: r.tipo, id: r.id });
  }
  return saida;
}

/** Os mesmos ids (sem olhar a ordem das chaves)? */
export function mesmosIds(a: Record<string, string> | null | undefined, b: Record<string, string> | null | undefined): boolean {
  const x = achatarIds(a);
  const y = achatarIds(b);
  return x.length === y.length && x.every((r, i) => r.tipo === y[i].tipo && r.id === y[i].id);
}

/** As peças que uma criação completa tem no Meta (a imagem é só o hash enviado). */
export const PECAS_DA_CRIACAO = ["campanha", "conjunto", "criativo", "anuncio"] as const;
export const criacaoCompleta = (ids: Record<string, string> | null | undefined) =>
  Boolean(ids) && PECAS_DA_CRIACAO.every((k) => typeof ids![k] === "string" && ids![k].length > 0);
