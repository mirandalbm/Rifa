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
  /** Até quando o total vale no Meta (`end_time` do conjunto), gravado quando o conjunto nasce. */
  fimEm?: string;
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

/** A folga do fim: o total não muda, só a janela (a criação leva tempo entre o começo e o conjunto). */
export const FOLGA_DO_FIM_MS = 60 * 60 * 1000;

/**
 * A janela do conjunto, calculada logo antes do POST dele: o começo é agora,
 * o fim são os dias do orçamento mais a folga de 1 hora. O total
 * (`vidaCents`) não muda.
 */
export function janelaDoConjunto(agora: Date, o: Pick<OrcamentoNoMeta, "dias">): { inicio: Date; fim: Date } {
  return { inicio: agora, fim: new Date(agora.getTime() + o.dias * 86_400_000 + FOLGA_DO_FIM_MS) };
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
 * O número oficial do SCPC (o certificado de autorização da SPA/MF):
 * `NN.NNNNNN/AAAA`, ex.: `03.012345/2026`. É a **única** coisa que sai da
 * régua do número longo, e só na linha da autorização — uma lista positiva:
 * o número da autorização é texto livre da organização (os dados legais só
 * conferem de 5 a 80 caracteres), então o resto da linha passa pela régua
 * inteira, como qualquer outra.
 */
// Preso nas duas pontas: sem isso, o fim de um celular ("11987654321/2026") casava e o resto passava curto.
export const NUMERO_DO_SCPC = /(?<![\d.])\d{2}\.?\d{3}\.?\d{3}\/\d{4}(?!\d)/g;

/** A linha da autorização sem os trechos no formato do SCPC (o resto fica para a régua). */
export function semNumeroDoScpc(linha: string): string {
  return linha.replace(NUMERO_DO_SCPC, " ");
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
 * O texto passa na régua? Link nunca, em linha nenhuma. Telefone e número
 * longo em todas as linhas, com uma exceção só: na linha da autorização, o
 * trecho no formato oficial do número do SCPC (`semNumeroDoScpc()`) sai da
 * conta — e só ele; o resto da linha passa pela régua inteira. Nunca tirando
 * o número de dentro das outras linhas. Sem promessa de ganho (as redes
 * recusam e o CDC chama de enganosa) e sem Pix por fora. Devolve o motivo,
 * ou `null`.
 */
export function problemaNoTextoDoAnuncio(texto: string, autorizacao: string | null): string | null {
  // Link nunca, em linha nenhuma — nem na da autorização.
  if (temLink(texto)) return "O texto do anúncio não pode ter link (nem no prêmio, nem no número da autorização). Os dois travam ao publicar: monte esta campanha à mão no gerenciador do Meta.";
  const daAutorizacao = autorizacao ? linhaDaAutorizacao(autorizacao) : null;
  const linhas = texto.split("\n");
  const semScpc = linhas.map((l) => (l === daAutorizacao ? semNumeroDoScpc(l) : l)).join("\n");
  const p = temLinkOuTelefone(semScpc);
  if (p) {
    const naAutorizacao = daAutorizacao && linhas.includes(daAutorizacao) && temLinkOuTelefone(semNumeroDoScpc(daAutorizacao));
    return naAutorizacao
      ? "O número da autorização da rifa tem telefone ou número longo fora do formato do SCPC (NN.NNNNNN/AAAA, com ou sem os pontos, ex.: 03.012345/2026). A autorização trava ao publicar: monte esta campanha à mão no gerenciador do Meta."
      : `O texto do anúncio (o prêmio da rifa) ${p.charAt(0).toLowerCase()}${p.slice(1)} O prêmio trava ao publicar: monte esta campanha à mão no gerenciador do Meta.`;
  }
  if (prometeGanho(texto)) return "O texto do anúncio promete ganho (as redes recusam e o CDC chama de propaganda enganosa). O prêmio trava ao publicar: monte esta campanha à mão no gerenciador do Meta, com outro texto.";
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

const ORDEM_DAS_PECAS = ["campanha", "conjunto", "criativo", "anuncio", "imagem"];

/** Os ids de uma criação como peças, na ordem em que nascem. Só as chaves conhecidas; o que não é objeto vira nada. */
export function achatarIds(ids: unknown): Resto[] {
  if (!ids || typeof ids !== "object" || Array.isArray(ids)) return [];
  const o = ids as Record<string, unknown>;
  return ORDEM_DAS_PECAS.filter((k) => typeof o[k] === "string" && /^[0-9a-zA-Z]{1,64}$/.test(o[k] as string)).map((k) => ({ tipo: k, id: o[k] as string }));
}

/**
 * `restos` como gravado, lido com tolerância: o que não é lista vira lista
 * vazia (nunca derruba o painel), a entrada nula some, e a entrada no
 * formato de antes (`{ campanha, conjunto, … }`) é achatada — nunca
 * descartada calada.
 */
export function restosComoLista(restos: unknown): Resto[] {
  if (!Array.isArray(restos)) return [];
  const saida: Resto[] = [];
  for (const r of restos) {
    if (!r || typeof r !== "object") continue;
    const e = r as Record<string, unknown>;
    if (typeof e.tipo === "string" && typeof e.id === "string") saida.push({ tipo: e.tipo, id: e.id });
    else saida.push(...achatarIds(e));
  }
  return saida;
}

/**
 * Junta peças a `restos` sem repetir id, e nunca lista como "para apagar" um
 * id que é da criação viva (`vivos`) — o hash da imagem, igual entre
 * tentativas, inclusive.
 */
export function juntarRestos(restos: unknown, novos: readonly Resto[], vivos: Iterable<string> = []): Resto[] {
  const fora = new Set(vivos);
  const vistos = new Set<string>();
  const saida: Resto[] = [];
  for (const r of [...restosComoLista(restos), ...restosComoLista(novos)]) {
    if (!r || typeof r.id !== "string" || typeof r.tipo !== "string") continue;
    if (fora.has(r.id) || vistos.has(r.id)) continue;
    vistos.add(r.id);
    saida.push({ tipo: r.tipo, id: r.id });
  }
  return saida;
}

/** Os mesmos ids (sem olhar a ordem das chaves)? */
export function mesmosIds(a: unknown, b: unknown): boolean {
  const x = achatarIds(a);
  const y = achatarIds(b);
  return x.length === y.length && x.every((r, i) => r.tipo === y[i].tipo && r.id === y[i].id);
}

/** As peças que uma criação completa tem no Meta (a imagem é só o hash enviado). */
export const PECAS_DA_CRIACAO = ["campanha", "conjunto", "criativo", "anuncio"] as const;
export const criacaoCompleta = (ids: unknown) => {
  const tipos = new Set(achatarIds(ids).map((r) => r.tipo));
  return PECAS_DA_CRIACAO.every((k) => tipos.has(k));
};
