/**
 * Tráfego pago, fase 2: o gasto de cada dia fechado vem das redes em vez de
 * ser digitado. A fonte é o Windsor.ai (uma chave para Google, Meta e TikTok,
 * `WINDSOR_API_KEY`, só no servidor); sem a chave, a importação não existe e
 * o lançamento à mão segue como antes.
 *
 * - **A régua é a do lançamento à mão**: cada linha passa por
 *   `lancarGastoImportado()` (`server/services/trafego.ts`) — a mesma
 *   gravação, a mesma taxa, o mesmo teto da verba e a mesma auditoria (com o
 *   ator "sistema"). Um dia já lançado numa rede (à mão ou numa importação
 *   anterior) fica como está: o índice decide.
 * - **Só dias fechados** (`janelaDaImportacao()`): de 3 dias atrás até ontem,
 *   no fuso de São Paulo. O de hoje ainda muda na rede.
 * - **A resposta da fonte é dado, nunca instrução**: `lerLinhasDoGasto()` lê
 *   só as chaves conhecidas, casa a campanha pelo código `trafego-<código>`
 *   no nome dela na rede e conta o que ficou de fora, com o motivo.
 * - **A chave nunca sai**: vai só na chamada à fonte (o Windsor a pede no
 *   endereço), e o endereço nunca vai a log, resposta ou erro. O endereço da
 *   fonte só muda fora de produção (`WINDSOR_API_URL`), para a prova.
 * - O resumo da última volta fica em `app_settings` (`trafego_importacao`)
 *   para a tela da plataforma: quando, quantos, o que ficou de fora e o erro,
 *   em português e sem o endereço.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { appSettings } from "@shared/schema";
import { diaNoFuso } from "@shared/resultados";
import { janelaDaImportacao, lerLinhasDoGasto, type MotivoIgnorado } from "@shared/trafego";
import { lancarGastoImportado, type ResultadoDoImportado } from "./trafego";
import { getPlataforma } from "./settings";

const WINDSOR_PADRAO = "https://connectors.windsor.ai";
const CHAVE_DO_RESUMO = "trafego_importacao";
const PRAZO_MS = 30_000;

export class ImportacaoError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "ImportacaoError";
  }
}

/** De onde vem o gasto: as linhas cruas da fonte, entre dois dias (inclusive). */
export interface FonteDoGasto {
  nome: string;
  buscar(desde: string, ate: string): Promise<unknown[]>;
}

export function baseDoWindsor(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV === "production") return WINDSOR_PADRAO;
  return env.WINDSOR_API_URL?.trim().replace(/\/+$/, "") || WINDSOR_PADRAO;
}

/** O Windsor.ai, com a chave do servidor; `null` sem a chave. */
export function fonteDoWindsor(env: NodeJS.ProcessEnv = process.env): FonteDoGasto | null {
  const chave = env.WINDSOR_API_KEY?.trim();
  if (!chave) return null;
  const base = baseDoWindsor(env);
  return {
    nome: "Windsor.ai",
    async buscar(desde, ate) {
      const q = new URLSearchParams({
        api_key: chave,
        date_from: desde,
        date_to: ate,
        fields: "campaign,clicks,datasource,date,spend",
      });
      let r: Response;
      try {
        r = await fetch(`${base}/all?${q.toString()}`, { signal: AbortSignal.timeout(PRAZO_MS) });
      } catch (e) {
        const nome = (e as Error).name;
        throw new ImportacaoError(nome === "TimeoutError" || nome === "AbortError" ? "A fonte do gasto demorou demais para responder." : "Não deu para falar com a fonte do gasto.");
      }
      if (r.status === 401 || r.status === 403) throw new ImportacaoError("A fonte do gasto recusou a chave. Confira a WINDSOR_API_KEY.");
      if (!r.ok) throw new ImportacaoError(`A fonte do gasto respondeu com erro (${r.status}).`);
      const j = (await r.json().catch(() => null)) as { data?: unknown } | null;
      if (!j || !Array.isArray(j.data)) throw new ImportacaoError("A fonte do gasto respondeu num formato inesperado.");
      return j.data;
    },
  };
}

export interface ResumoDaImportacao {
  em: string;
  fonte: string;
  desde: string;
  ate: string;
  importados: number;
  jaLancados: number;
  semCampanha: number;
  foraDaJanela: number;
  verbaEsgotada: number;
  /** O que a rede gastou além da verba (a plataforma paga; a organização nunca). */
  excedenteCents: number;
  ignoradas: Partial<Record<MotivoIgnorado, number>>;
  erro: string | null;
}

async function guardarResumo(r: ResumoDaImportacao) {
  await db
    .insert(appSettings)
    .values({ key: CHAVE_DO_RESUMO, value: r as never })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: r as never, updatedAt: new Date() } });
}

export async function ultimoResumo(): Promise<ResumoDaImportacao | null> {
  const [l] = await db.select({ v: appSettings.value }).from(appSettings).where(eq(appSettings.key, CHAVE_DO_RESUMO));
  return (l?.v as ResumoDaImportacao | undefined) ?? null;
}

/**
 * Uma volta da importação: busca na fonte os dias fechados e lança cada um
 * pela régua de sempre. Erro da fonte não lança nada e fica no resumo.
 */
export async function importarGastos(fonte: FonteDoGasto | null = fonteDoWindsor(), agora = new Date()): Promise<ResumoDaImportacao | null> {
  if (!fonte) return null;
  const hoje = diaNoFuso(agora);
  const { desde, ate } = janelaDaImportacao(hoje);
  const resumo: ResumoDaImportacao = {
    em: agora.toISOString(),
    fonte: fonte.nome,
    desde,
    ate,
    importados: 0,
    jaLancados: 0,
    semCampanha: 0,
    foraDaJanela: 0,
    verbaEsgotada: 0,
    excedenteCents: 0,
    ignoradas: {},
    erro: null,
  };
  let linhas: unknown[];
  try {
    linhas = await fonte.buscar(desde, ate);
  } catch (e) {
    resumo.erro = e instanceof ImportacaoError ? e.message : "Não deu para ler a fonte do gasto.";
    if (!(e instanceof ImportacaoError)) console.error("[trafego] importação:", (e as Error).name);
    await guardarResumo(resumo);
    return resumo;
  }
  const { gastos, ignoradas } = lerLinhasDoGasto(linhas, { desde, ate });
  resumo.ignoradas = ignoradas;
  const conta: Record<ResultadoDoImportado, keyof ResumoDaImportacao> = {
    importado: "importados",
    ja_lancado: "jaLancados",
    sem_campanha: "semCampanha",
    fora_da_janela: "foraDaJanela",
    verba_esgotada: "verbaEsgotada",
  };
  for (const g of gastos) {
    try {
      const r = await lancarGastoImportado(g, ate);
      (resumo[conta[r.resultado]] as number)++;
      resumo.excedenteCents += r.excedenteCents;
    } catch (e) {
      // Uma linha que falha não segura as outras; a próxima volta tenta de novo.
      console.error("[trafego] importação de uma linha:", (e as Error).message);
      resumo.erro = "Parte das linhas não entrou; a próxima volta tenta de novo.";
    }
  }
  await guardarResumo(resumo);
  return resumo;
}

/** O relógio só importa com o produto ligado e a chave no servidor. */
export async function importarGastosSeLigado(): Promise<ResumoDaImportacao | null> {
  const cfg = (await getPlataforma()).trafegoPago;
  if (!cfg.ligado) return null;
  return importarGastos();
}
