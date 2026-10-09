/**
 * Tráfego pago, fase 3: a campanha aprovada criada na rede pela API, pela
 * plataforma. Hoje só o Meta (Facebook e Instagram, Marketing API); Google e
 * TikTok entram depois pela mesma interface (`CriadorDeCampanha`). As regras
 * puras moram em `shared/trafegoCriacao.ts`; o plano, em
 * `docs/PLANO-TRAFEGO-PAGO.md`.
 *
 * - **Nasce desligado** (`criarPelaApi` na config do tráfego) e só existe com
 *   as variáveis do Meta no servidor (`META_ADS_TOKEN`, `META_AD_ACCOUNT_ID`,
 *   `META_PAGE_ID`) e, em produção, `PUBLIC_BASE_URL`; sem elas, a tela diz o
 *   que falta e nada é chamado.
 * - **Só a plataforma cria**, pelo botão, na campanha no ar que tem o Meta —
 *   nunca sozinho na aprovação. Campanha, conjunto e anúncio nascem
 *   **PAUSADOS**: ligar é no gerenciador do Meta, onde o anúncio de rifa passa
 *   pela revisão de política. Nada gasta sem uma pessoa ligar lá.
 * - **Nunca cria duas vezes**: o `INSERT … ON CONFLICT DO NOTHING` em
 *   `criando` (índice único por campanha e rede) vem **antes** de chamar a
 *   rede; quem não entrou recebe 409. Antes de reservar, a conta precisa
 *   estar em BRL e no fuso de São Paulo, e nenhuma campanha com o código pode
 *   existir no Meta nem ter gasto do Meta lançado. Cada peça é gravada antes
 *   da próxima (`anotar`, o sinal de vida do prazo); perdeu a linha, para e
 *   guarda o que criou em `restos`. Falhou, grava `falhou` com o motivo e
 *   pode tentar de novo (`UPDATE` condicional), inclusive a criação presa
 *   além do prazo (retomar); o que a rede criou pela metade vai para
 *   `restos`, para a plataforma apagar no gerenciador.
 * - **O orçamento casa com a verba que sobra e com as redes**
 *   (`orcamentoNoMeta()`), e nunca passa do que resta.
 * - **Encerrar pausa na rede** depois da transação, em segundo plano, sem
 *   nunca derrubar o encerramento; a falha vai ao log e à tela da plataforma.
 * - **O token só no cabeçalho** (`Authorization: Bearer`): nunca na URL, em
 *   log, resposta ou erro. O endereço do Meta só muda fora de produção
 *   (`META_API_URL`), para a prova.
 */
import type { Request } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { auditLog, campaigns, organizations, trafegoCampanhas, trafegoCriacoes } from "@shared/schema";
import { codigoDaCampanha, linkDoAnuncio, type RedeDeAnuncio } from "@shared/trafego";
import {
  PASSOS_DA_CRIACAO,
  PRAZO_DA_CRIACAO_MIN,
  ROTULO_DO_ALVO,
  alvoDoPedido,
  campanhaJaNoMeta,
  criacaoCompleta,
  erroDoMeta,
  faltaNoMeta,
  faltaNoServidor,
  fimDoOrcamento,
  hashDaImagem,
  idDaRede,
  localDoMeta,
  nomeNaRede,
  orcamentoNoMeta,
  problemaNaContaDoMeta,
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
  /** A parte do Meta por dia (`orcamentoNoMeta()`), em centavos de real. */
  diarioCents: number;
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
 * Uma rede onde a plataforma cria a campanha. `criar` espera `anotar` depois
 * de cada peça que nasce (quem chama grava no banco): se `anotar` falhar, a
 * criação para ali — nada é criado sem ficar anotado. `conferirConta` diz o
 * que está errado na conta de anúncios (ou `null`); `campanhasComCodigo`
 * devolve as campanhas da conta com o código no nome (a resposta crua, que
 * quem chama lê pela régua); `pausar` para a campanha inteira na rede.
 */
export interface CriadorDeCampanha {
  rede: RedeDeAnuncio;
  conferirConta(): Promise<string | null>;
  campanhasComCodigo(codigo: string): Promise<unknown>;
  criar(p: PedidoDeCriacao, anotar: (ids: IdsNaRede) => Promise<void>): Promise<IdsNaRede>;
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
    async conferirConta() {
      const r = await chamar("conta", "GET", conta, undefined, new URLSearchParams({ fields: "currency,timezone_name" }));
      return problemaNaContaDoMeta(r);
    },
    async campanhasComCodigo(codigo) {
      const q = new URLSearchParams({
        fields: "id,name",
        filtering: JSON.stringify([{ field: "name", operator: "CONTAIN", value: `trafego-${codigo}` }]),
        limit: "50",
      });
      const r = await chamar("busca", "GET", `${conta}/campaigns`, undefined, q);
      return r.data;
    },
    async criar(p, anotar) {
      const ids: IdsNaRede = {};
      // Cada peça fica anotada no banco antes da próxima nascer; se não ficar, para aqui.
      const guardar = async (k: keyof IdsNaRede, v: string) => {
        ids[k] = v;
        await anotar({ [k]: v });
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
      await guardar("imagem", hash);

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
      await guardar("campanha", campanha);

      // 4. O conjunto: a parte do Meta por dia (centavos de real são a unidade do Meta), o fim e o alvo.
      const conj = await chamar("conjunto", "POST", `${conta}/adsets`, {
        name: p.nome,
        campaign_id: campanha,
        daily_budget: p.diarioCents,
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
      await guardar("conjunto", conjunto);

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
      await guardar("criativo", criativo);

      // 6. O anúncio, pausado.
      const an = await chamar("anuncio", "POST", `${conta}/ads`, {
        name: p.nome,
        adset_id: conjunto,
        creative: { creative_id: criativo },
        status: "PAUSED",
      });
      const anuncio = idDaRede(an.id);
      if (!anuncio) throw semId("anuncio");
      await guardar("anuncio", anuncio);
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

/** O agora do banco em UTC, o padrão do projeto para `timestamp` sem fuso (`streamPendentes.ts`). */
const AGORA_UTC = sql`(now() AT TIME ZONE 'UTC')`;

const linhaDaCriacao = {
  id: trafegoCriacoes.id,
  status: trafegoCriacoes.status,
  ids: trafegoCriacoes.ids,
  restos: trafegoCriacoes.restos,
  erro: trafegoCriacoes.erro,
  orcamento: trafegoCriacoes.orcamento,
  tentativas: trafegoCriacoes.tentativas,
  pausa: trafegoCriacoes.pausa,
  pausaErro: trafegoCriacoes.pausaErro,
  criadaEm: trafegoCriacoes.criadaEm,
};

/** A criação que a rede devolveu falhou: o motivo já está gravado (e vai em 502). */
export class CriacaoFalhou extends Error {
  constructor(message: string, readonly criacao: unknown) {
    super(message);
    this.name = "CriacaoFalhou";
  }
}

/** Outra tentativa tomou a linha no meio: esta para de criar. */
class LinhaPerdida extends Error {
  constructor() {
    super("linha perdida");
    this.name = "LinhaPerdida";
  }
}

/** A linha em `criando` além do prazo: o processo que a tomou caiu (ou travou). */
const presaSql = sql`(${trafegoCriacoes.status} = 'criando' and ${trafegoCriacoes.atualizadoEm} < (now() AT TIME ZONE 'UTC') - make_interval(mins => ${PRAZO_DA_CRIACAO_MIN}))`;

/** Anexa um conjunto de ids a `restos` sem repetir (o mesmo objeto já lá não entra de novo). */
const anexarARestos = (ids: IdsNaRede) => {
  const obj = JSON.stringify(ids);
  return sql`case when ${trafegoCriacoes.restos} @> jsonb_build_array(${obj}::jsonb) then ${trafegoCriacoes.restos} else ${trafegoCriacoes.restos} || jsonb_build_array(${obj}::jsonb) end`;
};

/** A auditoria fora de uma transação (quando a de quem chama voltou): melhor esforço, nunca derruba a resposta. */
async function auditarFora(req: Request | null, action: string, id: string, diff: Record<string, unknown>) {
  try {
    await db.insert(auditLog).values({
      actorId: req?.user?.id ?? null,
      actorRole: (req?.user?.role ?? null) as never,
      action,
      entity: "trafego_campanha",
      entityId: id,
      diff: diff as never,
      ip: req?.ip ?? null,
    });
  } catch (e) {
    console.error(`[trafego] auditoria ${action} da campanha ${id} não gravou: ${(e as Error).message}`);
  }
}

/**
 * Esta execução perdeu a linha (outra tentativa a tomou, ou o banco falhou no
 * fim): o que ela criou no Meta não pode sumir. Anexa a `restos` sem a
 * condição da tentativa — a plataforma vê para apagar no gerenciador — e a
 * auditoria vai fora da transação que voltou.
 */
async function guardarOQueSobrou(req: Request, campanhaId: string, linhaId: string, ids: IdsNaRede, motivo: string) {
  if (Object.keys(ids).length) {
    try {
      await db
        .update(trafegoCriacoes)
        .set({ restos: anexarARestos(ids), atualizadoEm: AGORA_UTC })
        .where(eq(trafegoCriacoes.id, linhaId));
    } catch (e) {
      console.error(`[trafego] não consegui anotar o que ficou no Meta (campanha ${campanhaId}): ${JSON.stringify(ids)} — ${(e as Error).message}`);
    }
  }
  await auditarFora(req, "trafego.meta.falhou", campanhaId, { erro: motivo, ids });
}

/** O que a criação lê da campanha e da rifa (tudo do banco). */
async function dadosDaCampanha(id: string) {
  const [c] = await db
    .select({
      id: trafegoCampanhas.id,
      status: trafegoCampanhas.status,
      campaignId: trafegoCampanhas.campaignId,
      redes: trafegoCampanhas.redes,
      uf: trafegoCampanhas.uf,
      cidade: trafegoCampanhas.cidade,
      investimentoCents: trafegoCampanhas.investimentoCents,
      gastoCents: trafegoCampanhas.gastoCents,
      verbaDiaCents: trafegoCampanhas.verbaDiaCents,
      titulo: campaigns.title,
      rifaSlug: campaigns.slug,
      orgSlug: organizations.slug,
      orgAtiva: organizations.active,
    })
    .from(trafegoCampanhas)
    .innerJoin(campaigns, eq(campaigns.id, trafegoCampanhas.campaignId))
    .innerJoin(organizations, eq(organizations.id, trafegoCampanhas.organizationId))
    .where(eq(trafegoCampanhas.id, id));
  return c ?? null;
}

const MSG_RIFA_FORA = "A rifa não está no ar (rascunho, encerrada, travada ou marcada como teste) ou a promotora foi arquivada ou banida: nada foi criado no Meta.";
const MSG_SUSPENSA = "A promotora está suspensa: nada foi criado no Meta.";
const MSG_GASTO_DO_META = "Esta campanha já tem gasto do Meta lançado (à mão ou importado): ela já foi montada lá. Nada foi criado.";

/** Já há gasto lançado no Meta para esta campanha? É o sinal de que ela foi montada lá. */
async function temGastoDoMeta(q: Pick<typeof db, "execute">, id: string): Promise<boolean> {
  const r = await q.execute(sql`select 1 from trafego_gastos where campanha_id = ${id}::uuid and rede = 'meta' limit 1`);
  return r.rows.length > 0;
}

/**
 * Cria a campanha no ar no Meta, tudo pausado (só a plataforma). Antes de
 * reservar, confere sem chamar a rede (produto, variáveis, campanha no ar com
 * o Meta, rifa no ar, promotora ativa, nenhum gasto do Meta lançado, região,
 * orçamento, texto) e, na rede, a conta (BRL e São Paulo) e se já existe
 * campanha com o código. Reserva pelo índice, e cada peça criada fica anotada
 * no banco antes da próxima.
 */
export async function criarNoMeta(req: Request, id: string, criador: CriadorDeCampanha | null = criadorDoMeta()) {
  if (orgOf(req)) throw new TrafegoError("Criar a campanha na rede é da plataforma.", 403);
  if (!idValido(id)) throw new TrafegoError("Campanha não encontrada.", 404);
  const cfg = (await getPlataforma()).trafegoPago;
  if (!cfg.criarPelaApi) throw new TrafegoError("A criação pela API está desligada. Ligue em Taxa e mínimos.", 409);
  const falta = faltaNoServidor(process.env);
  if (!criador || falta.length) throw new TrafegoError(`Falta no servidor: ${falta.join(", ")}. Nada foi chamado.`, 409);

  // 1. O que dá para conferir sem chamar o Meta.
  const c = await dadosDaCampanha(id);
  if (!c) throw new TrafegoError("Campanha não encontrada.", 404);
  if (c.status !== "ativa") throw new TrafegoError("Só a campanha no ar (aprovada) é criada na rede.", 409);
  if (!c.redes.includes("meta")) throw new TrafegoError("Esta campanha não pediu o Instagram e o Facebook.", 409);
  if (!c.orgAtiva) throw new TrafegoError(MSG_SUSPENSA, 409);
  const rifa = await rifaDaArte(c.campaignId);
  if (!rifa) throw new TrafegoError("Campanha não encontrada.", 404);
  if (rifa.dados.status !== "published" || rifa.dados.travada || rifa.dados.demonstracao) throw new TrafegoError(MSG_RIFA_FORA, 409);
  if (await temGastoDoMeta(db, id)) throw new TrafegoError(MSG_GASTO_DO_META, 409);
  const alvo = alvoDoPedido({ uf: c.uf, cidade: c.cidade });
  if (!alvo) throw new TrafegoError("A região do pedido não é um estado conhecido: nada foi criado no Meta.", 409);
  const previa = orcamentoNoMeta(c);
  if (!previa.ok) throw new TrafegoError(previa.motivo, 409);
  const { mensagem, titulo } = textoDoAnuncio(rifa.dados);
  const problema = problemaNoTextoDoAnuncio(`${mensagem}\n${titulo}`, rifa.dados.autorizacao);
  if (problema) throw new TrafegoError(problema, 422);

  const [antes] = await db
    .select({ ...linhaDaCriacao, presa: sql<boolean>`${presaSql}` })
    .from(trafegoCriacoes)
    .where(and(eq(trafegoCriacoes.campanhaId, id), eq(trafegoCriacoes.rede, "meta")));
  if (antes?.status === "criada") throw new TrafegoError("Esta campanha já foi criada no Meta.", 409);
  if (antes?.status === "criando" && !antes.presa) throw new TrafegoError("Esta campanha está sendo criada no Meta agora.", 409);

  // 2. Na rede, antes de reservar: a conta e se a campanha já existe lá.
  const codigo = codigoDaCampanha(id);
  try {
    const naConta = await criador.conferirConta();
    if (naConta) throw new TrafegoError(naConta, 409);
    // O que o sistema já conhece (a criação presa e as metades anotadas) não conta como "já existe".
    const conhecidos = new Set<string>();
    for (const grupo of [antes?.ids ?? {}, ...(antes?.restos ?? [])]) for (const v of Object.values(grupo)) conhecidos.add(v);
    const achada = campanhaJaNoMeta(await criador.campanhasComCodigo(codigo), codigo, conhecidos);
    if (achada) {
      throw new TrafegoError(
        `Já existe no Meta uma campanha com o código trafego-${codigo} (id ${achada}). Confira no gerenciador: nada foi criado de novo.`,
        409,
      );
    }
  } catch (e) {
    if (e instanceof CriacaoError) throw new TrafegoError(`${e.message} Nada foi criado.`, 409);
    throw e;
  }

  // 3. A reserva: a campanha e a rifa conferidas com as linhas travadas, e o índice decide.
  const reservada = await db.transaction(async (tx) => {
    const atual = await travar(tx, id);
    if (atual.status !== "ativa") throw new TrafegoError("Só a campanha no ar (aprovada) é criada na rede.", 409);
    if (!(await rifaSegueNoAr(tx, atual.campaignId))) throw new TrafegoError(MSG_RIFA_FORA, 409);
    const [org] = await tx.select({ ativa: organizations.active }).from(organizations).where(eq(organizations.id, atual.organizationId));
    if (!org?.ativa) throw new TrafegoError(MSG_SUSPENSA, 409);
    if (await temGastoDoMeta(tx, id)) throw new TrafegoError(MSG_GASTO_DO_META, 409);
    const orc = orcamentoNoMeta(atual);
    if (!orc.ok) throw new TrafegoError(orc.motivo, 409);

    const [nova] = await tx
      .insert(trafegoCriacoes)
      .values({ campanhaId: id, rede: "meta", status: "criando", orcamento: orc.orcamento, criadoPor: req.user!.id, atualizadoEm: AGORA_UTC })
      .onConflictDoNothing({ target: [trafegoCriacoes.campanhaId, trafegoCriacoes.rede] })
      .returning(linhaDaCriacao);
    if (nova) {
      await auditar(tx, req, "trafego.meta.criar", id, { tentativa: nova.tentativas, orcamento: orc.orcamento });
      return { linha: nova, pronta: false };
    }
    // De novo, só depois de falhar ou da criação presa além do prazo.
    const [anterior] = await tx
      .select({ ...linhaDaCriacao, presa: sql<boolean>`${presaSql}` })
      .from(trafegoCriacoes)
      .where(and(eq(trafegoCriacoes.campanhaId, id), eq(trafegoCriacoes.rede, "meta")))
      .for("update");
    if (!anterior || !(anterior.status === "falhou" || anterior.presa)) {
      throw new TrafegoError("Esta campanha já foi criada no Meta (ou está sendo criada agora).", 409);
    }
    if (anterior.presa && criacaoCompleta(anterior.ids)) {
      // O processo caiu depois de anotar o anúncio: tudo já existe no Meta. Retomar é só marcar criada.
      const [feita] = await tx
        .update(trafegoCriacoes)
        .set({
          status: "criada",
          erro: null,
          // Se o fim que caiu tinha anexado estes ids a `restos`, eles saem de lá: não são para apagar.
          restos: sql`(select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(${trafegoCriacoes.restos}) e where e <> ${trafegoCriacoes.ids})`,
          criadaEm: AGORA_UTC,
          atualizadoEm: AGORA_UTC,
        })
        .where(and(eq(trafegoCriacoes.id, anterior.id), eq(trafegoCriacoes.tentativas, anterior.tentativas), presaSql))
        .returning(linhaDaCriacao);
      if (!feita) throw new TrafegoError("Esta campanha está sendo criada no Meta agora.", 409);
      await auditar(tx, req, "trafego.meta.criada", id, { ids: feita.ids, tentativa: feita.tentativas, retomada: true });
      return { linha: feita, pronta: true };
    }
    const [deNovo] = await tx
      .update(trafegoCriacoes)
      .set({
        status: "criando",
        restos: sql`case when ${trafegoCriacoes.ids} = '{}'::jsonb or ${trafegoCriacoes.restos} @> jsonb_build_array(${trafegoCriacoes.ids}) then ${trafegoCriacoes.restos} else ${trafegoCriacoes.restos} || jsonb_build_array(${trafegoCriacoes.ids}) end`,
        ids: {},
        erro: null,
        orcamento: orc.orcamento,
        tentativas: sql`${trafegoCriacoes.tentativas} + 1`,
        atualizadoEm: AGORA_UTC,
        criadoPor: req.user!.id,
      })
      .where(
        and(
          eq(trafegoCriacoes.id, anterior.id),
          eq(trafegoCriacoes.tentativas, anterior.tentativas),
          sql`(${trafegoCriacoes.status} = 'falhou' or ${presaSql})`,
        ),
      )
      .returning(linhaDaCriacao);
    if (!deNovo) throw new TrafegoError("Esta campanha está sendo criada no Meta agora.", 409);
    await auditar(tx, req, "trafego.meta.criar", id, { tentativa: deNovo.tentativas, orcamento: orc.orcamento, retomada: anterior.status === "criando" });
    return { linha: deNovo, pronta: false };
  });
  if (reservada.pronta) {
    await pausarSeJaParou(id);
    return reservada.linha;
  }

  // 4. A rede, fora da transação: cada peça anotada no banco antes da próxima.
  const minha = reservada.linha;
  const orcamento = minha.orcamento!;
  const daTentativa = and(eq(trafegoCriacoes.id, minha.id), eq(trafegoCriacoes.status, "criando"), eq(trafegoCriacoes.tentativas, minha.tentativas));
  let ids: IdsNaRede = {};
  const anotar = async (parcial: IdsNaRede) => {
    ids = { ...ids, ...parcial };
    // O mesmo UPDATE é o sinal de vida do prazo. Não pegou a linha: outra tentativa a tomou.
    const [ok] = await db
      .update(trafegoCriacoes)
      .set({ ids: sql`${trafegoCriacoes.ids} || ${JSON.stringify(parcial)}::jsonb`, atualizadoEm: AGORA_UTC })
      .where(daTentativa)
      .returning({ id: trafegoCriacoes.id });
    if (!ok) throw new LinhaPerdida();
  };
  try {
    const link = linkDoAnuncio(baseDoSite(req), { id: c.id, orgSlug: c.orgSlug, rifaSlug: c.rifaSlug }, "meta");
    const imagem = await desenharArte({ rifa, tipo: "rifa", formato: "retrato", url: link });
    const inicio = new Date();
    const prontos = await criador.criar(
      {
        nome: nomeNaRede(c.id, c.titulo),
        diarioCents: orcamento.diarioCents,
        inicio,
        fim: fimDoOrcamento(inicio, orcamento),
        alvo,
        link,
        mensagem,
        titulo,
        imagem,
      },
      anotar,
    );
    ids = { ...ids, ...prontos };
  } catch (e) {
    if (e instanceof LinhaPerdida) {
      const msg = "Outra tentativa tomou esta criação no meio: o que esta já tinha criado no Meta ficou anotado para apagar no gerenciador.";
      await guardarOQueSobrou(req, id, minha.id, ids, msg);
      throw new TrafegoError(msg, 409);
    }
    if (e instanceof TrafegoError) throw e;
    const msg = e instanceof CriacaoError ? e.message : "Não deu para criar no Meta (erro inesperado). Tente de novo.";
    if (!(e instanceof CriacaoError)) console.error("[trafego] criar no Meta:", (e as Error).name, (e as Error).message);
    let falha: unknown = null;
    try {
      falha = await db.transaction(async (tx) => {
        const [f] = await tx
          .update(trafegoCriacoes)
          .set({ status: "falhou", erro: msg, ids: ids as Record<string, string>, atualizadoEm: AGORA_UTC })
          .where(daTentativa)
          .returning(linhaDaCriacao);
        if (!f) return null;
        await auditar(tx, req, "trafego.meta.falhou", id, { erro: msg, ids, tentativa: minha.tentativas });
        return f;
      });
    } catch (dbErro) {
      console.error("[trafego] gravar a falha no Meta:", (dbErro as Error).message);
    }
    if (!falha) {
      await guardarOQueSobrou(req, id, minha.id, ids, msg);
      throw new TrafegoError(`${msg} (A criação foi tomada por outra tentativa; o que ficou no Meta está anotado.)`, 409);
    }
    throw new CriacaoFalhou(msg, falha);
  }

  // 5. Sucesso: grava só se a tentativa ainda é esta. Perdeu a linha, os ids não somem.
  let feita: typeof minha | null = null;
  try {
    feita = await db.transaction(async (tx) => {
      const [f] = await tx
        .update(trafegoCriacoes)
        .set({ status: "criada", ids: ids as Record<string, string>, erro: null, criadaEm: AGORA_UTC, atualizadoEm: AGORA_UTC })
        .where(daTentativa)
        .returning(linhaDaCriacao);
      if (!f) return null;
      await auditar(tx, req, "trafego.meta.criada", id, { ids, tentativa: f.tentativas });
      return f;
    });
  } catch (dbErro) {
    console.error("[trafego] gravar a criação no Meta:", (dbErro as Error).message);
    feita = null;
  }
  if (!feita) {
    const msg = "A campanha foi criada no Meta (pausada), mas esta tentativa perdeu a vez de gravar: os ids ficaram anotados para conferir e apagar no gerenciador.";
    await guardarOQueSobrou(req, id, minha.id, ids, msg);
    throw new TrafegoError(msg, 409);
  }
  // Encerrada enquanto criava: o encerramento não achou o que pausar; pausa agora.
  await pausarSeJaParou(id);
  return feita;
}

/** A campanha já não está no ar (encerrada durante a criação): pausa no Meta, em segundo plano. */
async function pausarSeJaParou(id: string) {
  const [c] = await db.select({ status: trafegoCampanhas.status }).from(trafegoCampanhas).where(eq(trafegoCampanhas.id, id));
  if (c && c.status !== "ativa") pausarNaRedeDepois(id);
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
      .set({ pausa, pausaErro: erro, pausadaEm: erro ? null : AGORA_UTC, atualizadoEm: AGORA_UTC })
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
    .select({ campanhaId: trafegoCriacoes.campanhaId, rede: trafegoCriacoes.rede, ...linhaDaCriacao, presa: sql<boolean>`${presaSql}` })
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
        orcamento: l.orcamento,
        tentativas: l.tentativas,
        // Em `criando` além do prazo: o processo caiu, e a plataforma pode retomar.
        podeRetomar: l.presa,
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
  return { ligado, meta: { faltam: faltaNoServidor(process.env) } };
}
