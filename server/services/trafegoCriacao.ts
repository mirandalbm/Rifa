/**
 * Tráfego pago, fase 3: a campanha aprovada criada na rede pela API, pela
 * plataforma. Hoje só o Meta (Facebook e Instagram, Marketing API); Google e
 * TikTok entram depois pela mesma interface (`CriadorDeCampanha`). As regras
 * puras moram em `shared/trafegoCriacao.ts`; o plano, em
 * `docs/PLANO-TRAFEGO-PAGO.md`.
 *
 * - **Nasce desligado** (`criarPelaApi` na config do tráfego) e só existe com
 *   as variáveis do Meta no servidor (`META_ADS_TOKEN`, `META_AD_ACCOUNT_ID`,
 *   `META_PAGE_ID`); sem elas, a tela diz o que falta e nada é chamado.
 * - **Só a plataforma cria**, pelo botão, na campanha no ar que tem o Meta —
 *   nunca sozinho na aprovação. Campanha, conjunto e anúncio nascem
 *   **PAUSADOS**: ligar é no gerenciador do Meta, onde o anúncio de rifa passa
 *   pela revisão de política. Nada gasta sem uma pessoa ligar lá.
 * - **Nunca cria duas vezes**: o `INSERT … ON CONFLICT DO NOTHING` em
 *   `criando` (índice único por campanha e rede) vem **antes** de chamar a
 *   rede; quem não entrou recebe 409. Falhou, grava `falhou` com o motivo e
 *   pode tentar de novo (`UPDATE` condicional); o que a rede criou pela
 *   metade vai para `restos`, para a plataforma apagar no gerenciador.
 * - **Encerrar pausa na rede** depois da transação, em segundo plano, sem
 *   nunca derrubar o encerramento; a falha vai ao log e à tela da plataforma.
 * - **O token só no cabeçalho** (`Authorization: Bearer`): nunca na URL, em
 *   log, resposta ou erro. O endereço do Meta só muda fora de produção
 *   (`META_API_URL`), para a prova.
 */
import type { Request } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { campaigns, organizations, trafegoCampanhas, trafegoCriacoes } from "@shared/schema";
import { linkDoAnuncio, type RedeDeAnuncio } from "@shared/trafego";
import {
  PASSOS_DA_CRIACAO,
  PRAZO_DA_CRIACAO_MIN,
  ROTULO_DO_ALVO,
  alvoDoPedido,
  erroDoMeta,
  faltaNoMeta,
  fimDaVerba,
  hashDaImagem,
  idDaRede,
  localDoMeta,
  nomeNaRede,
  problemaNoTextoDoAnuncio,
  segmentacaoDoMeta,
  textoDoAnuncio,
  type AlvoDoPedido,
  type PassoDaCriacao,
} from "@shared/trafegoCriacao";
import { orgOf } from "./orgs";
import { desenharArte, rifaDaArte } from "./artes";
import { emSegundoPlano } from "./push";
import { getPlataforma } from "./settings";
import { TrafegoError, auditar, idValido, rifaSegueNoAr, travar } from "./trafego";
import { baseDoSite } from "./urls";

const META_PADRAO = "https://graph.facebook.com/v22.0";
const PRAZO_MS = 30_000;

/** Erro de uma chamada à rede, já em português e sem nada sensível. */
export class CriacaoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CriacaoError";
  }
}

/** O que a criação precisa saber — tudo do banco, nada do navegador. */
export interface PedidoDeCriacao {
  nome: string;
  verbaDiaCents: number;
  inicio: Date;
  fim: Date;
  alvo: AlvoDoPedido;
  link: string;
  mensagem: string;
  titulo: string;
  imagem: Buffer;
}

export type IdsNaRede = Partial<Record<"campanha" | "conjunto" | "criativo" | "anuncio" | "imagem", string>>;

/**
 * Uma rede onde a plataforma cria a campanha. `criar` vai anotando os ids
 * (`anotar`) à medida que cada peça nasce: se parar no meio, quem chama sabe
 * o que ficou criado. `pausar` para a campanha inteira na rede.
 */
export interface CriadorDeCampanha {
  rede: RedeDeAnuncio;
  criar(p: PedidoDeCriacao, anotar: (ids: IdsNaRede) => void): Promise<IdsNaRede>;
  pausar(ids: IdsNaRede): Promise<void>;
}

export function baseDoMeta(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV === "production") return META_PADRAO;
  return env.META_API_URL?.trim().replace(/\/+$/, "") || META_PADRAO;
}

/** O Meta, com as variáveis do servidor; `null` se faltar alguma. */
export function criadorDoMeta(env: NodeJS.ProcessEnv = process.env): CriadorDeCampanha | null {
  if (faltaNoMeta(env).length) return null;
  const token = env.META_ADS_TOKEN!.trim();
  const conta = env.META_AD_ACCOUNT_ID!.trim();
  const pagina = env.META_PAGE_ID!.trim();
  const base = baseDoMeta(env);

  async function chamar(passo: PassoDaCriacao, metodo: "GET" | "POST", caminho: string, corpo?: unknown, consulta?: URLSearchParams) {
    let r: Response;
    try {
      r = await fetch(`${base}/${caminho}${consulta ? `?${consulta.toString()}` : ""}`, {
        method: metodo,
        // O token só no cabeçalho: nunca na URL (que vai a log de proxy) nem em mensagem.
        headers: { Authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { "Content-Type": "application/json" }) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(PRAZO_MS),
      });
    } catch (e) {
      const nome = (e as Error).name;
      throw new CriacaoError(
        nome === "TimeoutError" || nome === "AbortError"
          ? `O Meta demorou demais para responder ${PASSOS_DA_CRIACAO[passo]}.`
          : `Não deu para falar com o Meta ${PASSOS_DA_CRIACAO[passo]}.`,
      );
    }
    const json = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (!r.ok || (json && "error" in json)) throw new CriacaoError(erroDoMeta(passo, r.status, json));
    return json ?? {};
  }

  return {
    rede: "meta",
    async criar(p, anotar) {
      const ids: IdsNaRede = {};
      const guardar = (k: keyof IdsNaRede, v: string) => {
        ids[k] = v;
        anotar({ [k]: v });
      };
      const semId = (passo: PassoDaCriacao) => new CriacaoError(`O Meta respondeu sem o id ${PASSOS_DA_CRIACAO[passo]} — confira no gerenciador.`);

      // 1. A região do pedido: estado ou cidade, pela busca do Meta. Sem achar, recusa.
      let chave: string | null = null;
      if (p.alvo.tipo !== "pais") {
        const q = new URLSearchParams({
          type: "adgeolocation",
          location_types: JSON.stringify([p.alvo.tipo === "estado" ? "region" : "city"]),
          q: p.alvo.tipo === "estado" ? p.alvo.estado : p.alvo.cidade,
          country_code: "BR",
          limit: "25",
        });
        const achados = await chamar("local", "GET", "search", undefined, q);
        chave = localDoMeta(achados.data, p.alvo);
        if (!chave) {
          throw new CriacaoError(
            `O Meta não achou ${ROTULO_DO_ALVO(p.alvo)} entre os locais de anúncio. Confira o nome no pedido; nada foi criado com o Brasil todo no lugar.`,
          );
        }
      }

      // 2. A imagem (a arte pronta da rifa, 4:5).
      const img = await chamar("imagem", "POST", `${conta}/adimages`, { bytes: p.imagem.toString("base64"), name: `${p.nome.slice(0, 17)}.jpg` });
      const imagens = img.images && typeof img.images === "object" ? Object.values(img.images as Record<string, { hash?: unknown }>) : [];
      const hash = hashDaImagem(imagens[0]?.hash);
      if (!hash) throw new CriacaoError("O Meta não devolveu a imagem enviada.");
      guardar("imagem", hash);

      // 3. A campanha, pausada, com o objetivo de tráfego para o link.
      const camp = await chamar("campanha", "POST", `${conta}/campaigns`, {
        name: p.nome,
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED",
        buying_type: "AUCTION",
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: false,
      });
      const campanha = idDaRede(camp.id);
      if (!campanha) throw semId("campanha");
      guardar("campanha", campanha);

      // 4. O conjunto: a verba por dia (centavos de real são a unidade do Meta), o fim e o alvo.
      const conj = await chamar("conjunto", "POST", `${conta}/adsets`, {
        name: p.nome,
        campaign_id: campanha,
        daily_budget: p.verbaDiaCents,
        billing_event: "IMPRESSIONS",
        optimization_goal: "LINK_CLICKS",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        destination_type: "WEBSITE",
        targeting: segmentacaoDoMeta(p.alvo, chave),
        start_time: p.inicio.toISOString(),
        end_time: p.fim.toISOString(),
        status: "PAUSED",
      });
      const conjunto = idDaRede(conj.id);
      if (!conjunto) throw semId("conjunto");
      guardar("conjunto", conjunto);

      // 5. O criativo: a imagem, o texto e o link com a UTM da campanha.
      const criat = await chamar("criativo", "POST", `${conta}/adcreatives`, {
        name: p.nome,
        object_story_spec: {
          page_id: pagina,
          link_data: {
            image_hash: hash,
            link: p.link,
            message: p.mensagem,
            name: p.titulo,
            call_to_action: { type: "LEARN_MORE", value: { link: p.link } },
          },
        },
      });
      const criativo = idDaRede(criat.id);
      if (!criativo) throw semId("criativo");
      guardar("criativo", criativo);

      // 6. O anúncio, pausado.
      const an = await chamar("anuncio", "POST", `${conta}/ads`, {
        name: p.nome,
        adset_id: conjunto,
        creative: { creative_id: criativo },
        status: "PAUSED",
      });
      const anuncio = idDaRede(an.id);
      if (!anuncio) throw semId("anuncio");
      guardar("anuncio", anuncio);
      return ids;
    },
    async pausar(ids) {
      const campanha = ids.campanha ? idDaRede(ids.campanha) : null;
      if (!campanha) throw new CriacaoError("Sem o id da campanha no Meta.");
      await chamar("pausar", "POST", campanha, { status: "PAUSED" });
    },
  };
}

/* ------------------------------------------------------------------ *
 * Criar
 * ------------------------------------------------------------------ */

const linhaDaCriacao = {
  id: trafegoCriacoes.id,
  status: trafegoCriacoes.status,
  ids: trafegoCriacoes.ids,
  restos: trafegoCriacoes.restos,
  erro: trafegoCriacoes.erro,
  tentativas: trafegoCriacoes.tentativas,
  pausa: trafegoCriacoes.pausa,
  pausaErro: trafegoCriacoes.pausaErro,
  criadaEm: trafegoCriacoes.criadaEm,
};

/**
 * Cria a campanha no ar no Meta, tudo pausado (só a plataforma). Confere
 * antes de chamar a rede — produto, variáveis, campanha no ar com o Meta,
 * rifa no ar, texto na régua — e reserva a criação pelo índice. Devolve a
 * linha criada; a falha da rede volta como `CriacaoFalhou`, já gravada.
 */
export class CriacaoFalhou extends Error {
  constructor(message: string, readonly criacao: unknown) {
    super(message);
    this.name = "CriacaoFalhou";
  }
}

export async function criarNoMeta(req: Request, id: string, criador: CriadorDeCampanha | null = criadorDoMeta()) {
  if (orgOf(req)) throw new TrafegoError("Criar a campanha na rede é da plataforma.", 403);
  if (!idValido(id)) throw new TrafegoError("Campanha não encontrada.", 404);
  const cfg = (await getPlataforma()).trafegoPago;
  if (!cfg.criarPelaApi) throw new TrafegoError("A criação pela API está desligada. Ligue em Taxa e mínimos.", 409);
  if (!criador) throw new TrafegoError(`Falta no servidor: ${faltaNoMeta(process.env).join(", ")}. Nada foi chamado.`, 409);

  const [c] = await db
    .select({
      id: trafegoCampanhas.id,
      campaignId: trafegoCampanhas.campaignId,
      redes: trafegoCampanhas.redes,
      uf: trafegoCampanhas.uf,
      cidade: trafegoCampanhas.cidade,
      investimentoCents: trafegoCampanhas.investimentoCents,
      verbaDiaCents: trafegoCampanhas.verbaDiaCents,
      titulo: campaigns.title,
      rifaSlug: campaigns.slug,
      orgSlug: organizations.slug,
    })
    .from(trafegoCampanhas)
    .innerJoin(campaigns, eq(campaigns.id, trafegoCampanhas.campaignId))
    .innerJoin(organizations, eq(organizations.id, trafegoCampanhas.organizationId))
    .where(eq(trafegoCampanhas.id, id));
  if (!c) throw new TrafegoError("Campanha não encontrada.", 404);
  if (!c.redes.includes("meta")) throw new TrafegoError("Esta campanha não pediu o Instagram e o Facebook.", 409);
  const rifa = await rifaDaArte(c.campaignId);
  if (!rifa) throw new TrafegoError("Campanha não encontrada.", 404);
  const { mensagem, titulo } = textoDoAnuncio(rifa.dados);
  const problema = problemaNoTextoDoAnuncio(`${mensagem}\n${titulo}`, rifa.dados.autorizacao);
  if (problema) throw new TrafegoError(problema, 422);

  // A reserva da criação: a campanha e a rifa conferidas com as linhas travadas, e o índice decide.
  const reservada = await db.transaction(async (tx) => {
    const atual = await travar(tx, id);
    if (atual.status !== "ativa") throw new TrafegoError("Só a campanha no ar (aprovada) é criada na rede.", 409);
    if (!(await rifaSegueNoAr(tx, atual.campaignId))) {
      throw new TrafegoError("A rifa saiu do ar (ou a promotora foi suspensa): nada foi criado no Meta.", 409);
    }
    const [nova] = await tx
      .insert(trafegoCriacoes)
      .values({ campanhaId: id, rede: "meta", status: "criando", criadoPor: req.user!.id })
      .onConflictDoNothing({ target: [trafegoCriacoes.campanhaId, trafegoCriacoes.rede] })
      .returning(linhaDaCriacao);
    let linha = nova;
    if (!linha) {
      // De novo, só depois de falhar (ou de um `criando` esquecido por um processo que caiu).
      const [deNovo] = await tx
        .update(trafegoCriacoes)
        .set({
          status: "criando",
          restos: sql`case when ${trafegoCriacoes.ids} <> '{}'::jsonb then ${trafegoCriacoes.restos} || jsonb_build_array(${trafegoCriacoes.ids}) else ${trafegoCriacoes.restos} end`,
          ids: {},
          erro: null,
          tentativas: sql`${trafegoCriacoes.tentativas} + 1`,
          atualizadoEm: new Date(),
          criadoPor: req.user!.id,
        })
        .where(
          and(
            eq(trafegoCriacoes.campanhaId, id),
            eq(trafegoCriacoes.rede, "meta"),
            sql`(${trafegoCriacoes.status} = 'falhou' or (${trafegoCriacoes.status} = 'criando' and ${trafegoCriacoes.atualizadoEm} < now() - make_interval(mins => ${PRAZO_DA_CRIACAO_MIN})))`,
          ),
        )
        .returning(linhaDaCriacao);
      if (!deNovo) throw new TrafegoError("Esta campanha já foi criada no Meta (ou está sendo criada agora).", 409);
      linha = deNovo;
    }
    await auditar(tx, req, "trafego.meta.criar", id, { tentativa: linha.tentativas });
    return linha;
  });

  // A rede, fora da transação: cada peça anotada à medida que nasce.
  let ids: IdsNaRede = {};
  const ondeEstou = and(eq(trafegoCriacoes.id, reservada.id), eq(trafegoCriacoes.status, "criando"), eq(trafegoCriacoes.tentativas, reservada.tentativas));
  try {
    const link = linkDoAnuncio(baseDoSite(req), { id: c.id, orgSlug: c.orgSlug, rifaSlug: c.rifaSlug }, "meta");
    const imagem = await desenharArte({ rifa, tipo: "rifa", formato: "retrato", url: link });
    const inicio = new Date();
    const prontos = await criador.criar(
      {
        nome: nomeNaRede(c.id, c.titulo),
        verbaDiaCents: c.verbaDiaCents,
        inicio,
        fim: fimDaVerba(inicio, c.investimentoCents, c.verbaDiaCents),
        alvo: alvoDoPedido({ uf: c.uf, cidade: c.cidade }),
        link,
        mensagem,
        titulo,
        imagem,
      },
      (parcial) => {
        ids = { ...ids, ...parcial };
      },
    );
    ids = { ...ids, ...prontos };
    return await db.transaction(async (tx) => {
      const [feita] = await tx
        .update(trafegoCriacoes)
        .set({ status: "criada", ids: ids as Record<string, string>, erro: null, criadaEm: new Date(), atualizadoEm: new Date() })
        .where(ondeEstou)
        .returning(linhaDaCriacao);
      if (!feita) throw new TrafegoError("A criação mudou de situação no meio. Atualize a tela.", 409);
      await auditar(tx, req, "trafego.meta.criada", id, { ids, tentativa: feita.tentativas });
      return feita;
    });
  } catch (e) {
    if (e instanceof TrafegoError) throw e;
    const msg = e instanceof CriacaoError ? e.message : "Não deu para criar no Meta (erro inesperado). Tente de novo.";
    if (!(e instanceof CriacaoError)) console.error("[trafego] criar no Meta:", (e as Error).name, (e as Error).message);
    const falha = await db.transaction(async (tx) => {
      const [f] = await tx
        .update(trafegoCriacoes)
        .set({ status: "falhou", erro: msg, ids: ids as Record<string, string>, atualizadoEm: new Date() })
        .where(ondeEstou)
        .returning(linhaDaCriacao);
      await auditar(tx, req, "trafego.meta.falhou", id, { erro: msg, ids, tentativa: reservada.tentativas });
      return f ?? null;
    });
    throw new CriacaoFalhou(msg, falha);
  }
}

/* ------------------------------------------------------------------ *
 * Pausar ao encerrar
 * ------------------------------------------------------------------ */

/**
 * A campanha parou (encerrada pela organização, pela plataforma, pelo
 * relógio ou pela verba): se ela tem criação no Meta, pausa lá. Depois da
 * transação de quem chama, em segundo plano: nunca derruba o encerramento.
 */
export function pausarNaRedeDepois(campanhaId: string) {
  emSegundoPlano(pausarNaRede(campanhaId), "pausar a campanha no Meta");
}

export async function pausarNaRede(campanhaId: string, criador: CriadorDeCampanha | null = criadorDoMeta()): Promise<"pausada" | "falhou" | null> {
  const [l] = await db
    .select(linhaDaCriacao)
    .from(trafegoCriacoes)
    .where(
      and(
        eq(trafegoCriacoes.campanhaId, campanhaId),
        eq(trafegoCriacoes.rede, "meta"),
        eq(trafegoCriacoes.status, "criada"),
        sql`${trafegoCriacoes.pausa} is distinct from 'pausada'`,
      ),
    );
  if (!l || !l.ids.campanha) return null;
  let erro: string | null = null;
  if (!criador) erro = "Faltam as variáveis do Meta no servidor.";
  else {
    try {
      await criador.pausar(l.ids);
    } catch (e) {
      erro = e instanceof CriacaoError ? e.message : "Erro inesperado ao pausar no Meta.";
      if (!(e instanceof CriacaoError)) console.error("[trafego] pausar no Meta:", (e as Error).name);
    }
  }
  const pausa = erro ? "falhou" : "pausada";
  if (erro) console.error(`[trafego] não consegui pausar no Meta a campanha ${campanhaId}: ${erro}`);
  await db.transaction(async (tx) => {
    const [feito] = await tx
      .update(trafegoCriacoes)
      .set({ pausa, pausaErro: erro, pausadaEm: erro ? null : new Date(), atualizadoEm: new Date() })
      .where(and(eq(trafegoCriacoes.id, l.id), eq(trafegoCriacoes.status, "criada"), sql`${trafegoCriacoes.pausa} is distinct from 'pausada'`))
      .returning({ id: trafegoCriacoes.id });
    if (feito) await auditar(tx, null, "trafego.meta.pausar", campanhaId, { ok: !erro, erro });
  });
  return pausa;
}

/* ------------------------------------------------------------------ *
 * Leitura
 * ------------------------------------------------------------------ */

/**
 * A criação de cada campanha, para o painel. A plataforma vê tudo (situação,
 * ids, o que sobrou pela metade, o erro); a organização só sabe que foi
 * criada no Meta (pausada) — nunca ids nem erro técnico.
 */
export async function criacoesDasCampanhas(ids: string[], plataforma: boolean) {
  if (!ids.length) return new Map<string, unknown>();
  const linhas = await db
    .select({ campanhaId: trafegoCriacoes.campanhaId, rede: trafegoCriacoes.rede, ...linhaDaCriacao })
    .from(trafegoCriacoes)
    .where(inArray(trafegoCriacoes.campanhaId, ids));
  const mapa = new Map<string, unknown>();
  for (const l of linhas) {
    if (l.rede !== "meta") continue;
    if (plataforma) {
      mapa.set(l.campanhaId, {
        status: l.status,
        ids: l.ids,
        restos: l.restos,
        erro: l.erro,
        tentativas: l.tentativas,
        pausa: l.pausa,
        pausaErro: l.pausaErro,
        criadaEm: l.criadaEm,
      });
    } else if (l.status === "criada") {
      mapa.set(l.campanhaId, { status: "criada" });
    }
  }
  return mapa;
}

/** Para a tela da plataforma: o interruptor e o que falta no servidor (só os nomes). */
export function situacaoDaCriacaoPelaApi(ligado: boolean) {
  return { ligado, meta: { faltam: faltaNoMeta(process.env) } };
}
