/**
 * Rifa nacional (`docs/PLANO-RIFA-NACIONAL.md`, PR 1): as regras puras.
 *
 * A organização com uma rifa grande pede o título de "nacional"; só o
 * administrador geral aprova; a rifa aprovada abre a vitrine de todo mundo.
 * Este arquivo é só a conta, a régua do mínimo, a ordem da vitrine e a
 * validação da configuração — sem banco, sem rota, sem tela. **Nada aqui
 * está ligado a nada ainda**: quem chama (o servidor e a tela, lendo a mesma
 * função) entra nas PRs seguintes do plano.
 *
 * Duas regras que valem acima do resto:
 * - **Dinheiro é inteiro, em centavos** (invariante 5): a arrecadação é o
 *   produto de dois inteiros, sem divisão e sem ponto flutuante.
 * - **Localização ordena, nunca esconde** (`CLAUDE.md`, "Endereço e
 *   região"): `ordenarVitrine()` só reordena; a lista que sai tem os mesmos
 *   elementos da que entrou, e sem nenhuma nacional é exatamente a de
 *   `ordenarPorProximidade()`, que continua intacta em `shared/endereco.ts`.
 */

import { ordenarPorProximidade, type Regiao } from "./endereco";
import { formatBRL } from "./format";

/* ------------------------------------------------------------------ *
 * Configuração da plataforma
 * ------------------------------------------------------------------ */

/** R$ 100.000,00 — decidido em 18/10/2026 (plano, seção 0). */
export const RIFA_NACIONAL_MINIMO_PADRAO_CENTS = 10_000_000;
/** Teto de sanidade do mínimo: R$ 100 milhões. A plataforma muda dentro dele. */
export const RIFA_NACIONAL_MINIMO_MAX_CENTS = 10_000_000_000;

/** Quantas nacionais cabem no topo. Proposta do plano (seção 1): 3. */
export const RIFA_NACIONAL_TETO_PADRAO = 3;
export const RIFA_NACIONAL_TETO_MIN = 1;
export const RIFA_NACIONAL_TETO_MAX = 10;

export interface ConfigRifaNacional {
  /** Nasce desligado: muda o que a vitrine mostra a todos. */
  ligado: boolean;
  /** O mínimo da arrecadação total (cotas × preço), em centavos inteiros. */
  minimoCents: number;
  /** Quantas nacionais aprovadas ficam no topo; a que passa do teto cai no resto. */
  teto: number;
}

export const CONFIG_RIFA_NACIONAL_PADRAO: ConfigRifaNacional = {
  ligado: false,
  minimoCents: RIFA_NACIONAL_MINIMO_PADRAO_CENTS,
  teto: RIFA_NACIONAL_TETO_PADRAO,
};

function recusa(mensagem: string): never {
  throw Object.assign(new Error(mensagem), { status: 400 });
}

/**
 * Só as chaves conhecidas, nos limites: isto vem do corpo da requisição.
 * Campo que não veio fica no padrão; para partir da configuração que já está
 * gravada, use `mesclarConfigRifaNacional()`.
 */
export function validarConfigRifaNacional(v: unknown): ConfigRifaNacional {
  if (v === undefined || v === null) return { ...CONFIG_RIFA_NACIONAL_PADRAO };
  if (typeof v !== "object" || Array.isArray(v)) recusa("Configuração da rifa nacional inválida.");
  const e = v as Record<string, unknown>;

  const minimo = e.minimoCents === undefined ? CONFIG_RIFA_NACIONAL_PADRAO.minimoCents : e.minimoCents;
  if (
    typeof minimo !== "number" ||
    !Number.isSafeInteger(minimo) ||
    minimo < 1 ||
    minimo > RIFA_NACIONAL_MINIMO_MAX_CENTS
  ) {
    recusa(
      `O mínimo da rifa nacional é um valor em centavos inteiros, de R$ 0,01 a ${formatBRL(RIFA_NACIONAL_MINIMO_MAX_CENTS)}.`,
    );
  }

  const teto = e.teto === undefined ? CONFIG_RIFA_NACIONAL_PADRAO.teto : e.teto;
  if (
    typeof teto !== "number" ||
    !Number.isInteger(teto) ||
    teto < RIFA_NACIONAL_TETO_MIN ||
    teto > RIFA_NACIONAL_TETO_MAX
  ) {
    recusa(`O topo da vitrine comporta de ${RIFA_NACIONAL_TETO_MIN} a ${RIFA_NACIONAL_TETO_MAX} rifas nacionais.`);
  }

  return { ligado: e.ligado === true, minimoCents: minimo, teto };
}

/**
 * Parte da configuração **atual** e troca só o que veio: quem salva um pedaço
 * (só o interruptor, só o mínimo) não volta o resto ao padrão. É o que a rota
 * de gravar chama; `validarConfigRifaNacional()` sozinho trata o que falta
 * como padrão.
 */
export function mesclarConfigRifaNacional(atual: ConfigRifaNacional, parcial: unknown): ConfigRifaNacional {
  if (parcial === undefined || parcial === null) return validarConfigRifaNacional(atual);
  if (typeof parcial !== "object" || Array.isArray(parcial)) recusa("Configuração da rifa nacional inválida.");
  const p = parcial as Record<string, unknown>;
  const enviados: Record<string, unknown> = {};
  for (const chave of ["ligado", "minimoCents", "teto"] as const) {
    if (p[chave] !== undefined) enviados[chave] = p[chave];
  }
  return validarConfigRifaNacional({ ...atual, ...enviados });
}

/**
 * Ao **ler** o que está gravado: configuração que já não passe na régua volta
 * ao padrão (desligada) em vez de derrubar a configuração inteira da
 * plataforma. A rota de gravar valida antes, com `mesclarConfigRifaNacional()`.
 */
export function configRifaNacionalGuardada(v: unknown): ConfigRifaNacional {
  try {
    return validarConfigRifaNacional(v);
  } catch {
    return { ...CONFIG_RIFA_NACIONAL_PADRAO };
  }
}

/* ------------------------------------------------------------------ *
 * A arrecadação e o mínimo
 * ------------------------------------------------------------------ */

/**
 * A arrecadação total da rifa: **total de cotas × preço da cota**, em
 * centavos inteiros. Só estes dois entram — pacote com desconto, cupom, cota
 * de bônus e cota premiada não (decisão de 18/10/2026: "cotas × preço").
 * Produto de dois inteiros, sem divisão e sem ponto flutuante; o que não for
 * inteiro não negativo, ou o produto que passar do inteiro seguro do
 * JavaScript, é erro — nunca um número arredondado calado.
 *
 * No SQL a mesma conta é `total_quotas::bigint * price_cents::bigint`.
 */
export function arrecadacaoDaRifa(totalQuotas: number, priceCents: number): number {
  for (const [nome, valor] of [
    ["O total de cotas", totalQuotas],
    ["O preço da cota", priceCents],
  ] as const) {
    if (typeof valor !== "number" || !Number.isSafeInteger(valor) || valor < 0) {
      throw new Error(`${nome} precisa ser um número inteiro, zero ou maior.`);
    }
  }
  const produto = totalQuotas * priceCents;
  if (!Number.isSafeInteger(produto)) {
    throw new Error("A arrecadação passa do maior valor que o sistema calcula com exatidão.");
  }
  return produto;
}

function conferirCentavos(nome: string, valor: number): void {
  if (typeof valor !== "number" || !Number.isSafeInteger(valor) || valor < 0) {
    throw new Error(`${nome} precisa ser um valor em centavos inteiros, zero ou maior.`);
  }
}

/** O mínimo é **inclusivo**: arrecadar exatamente o mínimo atinge (proposta do plano, a confirmar). */
export function atingeOMinimo(arrecadacaoCents: number, minimoCents: number): boolean {
  conferirCentavos("A arrecadação", arrecadacaoCents);
  conferirCentavos("O mínimo", minimoCents);
  return arrecadacaoCents >= minimoCents;
}

export interface AvaliacaoDoMinimo {
  arrecadacaoCents: number;
  minimoCents: number;
  atinge: boolean;
  /** Quanto falta para o mínimo; zero quando atinge. */
  faltaCents: number;
}

/** A conta inteira de uma vez — o que a tela mostra e o que o servidor confere. */
export function avaliarMinimo(totalQuotas: number, priceCents: number, minimoCents: number): AvaliacaoDoMinimo {
  const arrecadacaoCents = arrecadacaoDaRifa(totalQuotas, priceCents);
  const atinge = atingeOMinimo(arrecadacaoCents, minimoCents);
  return { arrecadacaoCents, minimoCents, atinge, faltaCents: atinge ? 0 : minimoCents - arrecadacaoCents };
}

/** A recusa em palavras ("Faltam R$ X para chegar ao mínimo…"), ou `null` se a rifa atinge o mínimo. */
export function problemaNoMinimo(totalQuotas: number, priceCents: number, minimoCents: number): string | null {
  const a = avaliarMinimo(totalQuotas, priceCents, minimoCents);
  if (a.atinge) return null;
  return `Faltam ${formatBRL(a.faltaCents)} para chegar ao mínimo de ${formatBRL(a.minimoCents)} de arrecadação (cotas × preço).`;
}

/* ------------------------------------------------------------------ *
 * A ordem da vitrine
 * ------------------------------------------------------------------ */

/** O estado da rifa nacional, como o plano o guarda em `campaigns.nacional_status`. Nulo = comum. */
export const NACIONAL_STATUS = ["em_analise", "aprovada"] as const;
export type NacionalStatus = (typeof NACIONAL_STATUS)[number];

/** O que a ordem da vitrine lê de cada rifa, além da região. */
export interface NacionalNaVitrine {
  /** Só `"aprovada"` vai ao topo; pedido em análise ainda é rifa comum. */
  nacionalStatus?: string | null;
  /** Quando o administrador geral aprovou — a ordem entre as nacionais (opção A do plano). */
  nacionalAprovadaEm?: Date | string | number | null;
  /** Desempata quando duas foram aprovadas no mesmo instante. */
  id?: string | null;
}

export function ehNacionalAprovada(r: NacionalNaVitrine): boolean {
  return r.nacionalStatus === "aprovada";
}

function instante(v: Date | string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const t = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * A ordem entre as nacionais — opção A do plano (inclinação técnica, a
 * confirmar): a aprovada há mais tempo primeiro; `id` desempata; sem data
 * legível vai depois das que têm; por fim, a ordem em que vieram. Total e
 * determinística, então a lista não pula entre uma visita e outra.
 */
function compararNacionais(
  a: { r: NacionalNaVitrine; i: number },
  b: { r: NacionalNaVitrine; i: number },
): number {
  const ta = instante(a.r.nacionalAprovadaEm);
  const tb = instante(b.r.nacionalAprovadaEm);
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta - tb;
  }
  const ia = a.r.id;
  const ib = b.r.id;
  if (ia != null && ib != null && ia !== ib) return ia < ib ? -1 : 1;
  return a.i - b.i;
}

/**
 * A vitrine:
 *
 *     [nacionais aprovadas, até o teto, em ordem própria]
 *   + ordenarPorProximidade(todas as outras, região de quem olha)
 *
 * - **Nunca esconde.** A lista que sai tem os mesmos elementos da que entrou,
 *   cada um uma vez. A nacional que passa do teto não some: cai no resto, na
 *   ordem em que veio, e é ordenada por proximidade como qualquer outra.
 * - **A região não mexe nas nacionais.** A de outro estado fica em cima mesmo
 *   para quem escolheu "perto de São Paulo".
 * - **Sem nacional (ou desligado, ou teto fora de 1 ou mais), o resultado é
 *   exatamente o de `ordenarPorProximidade()`** — a regra de hoje.
 * - Dentro do resto vale a ordem de entrada (destaque, peso, mais nova),
 *   porque `ordenarPorProximidade()` é estável.
 */
export function ordenarVitrine<T extends Regiao & NacionalNaVitrine>(
  rifas: readonly T[],
  perto: Regiao,
  config: Pick<ConfigRifaNacional, "ligado" | "teto">,
): T[] {
  const teto = Number.isInteger(config.teto) ? config.teto : 0;
  if (config.ligado !== true || teto < 1) return ordenarPorProximidade(rifas, perto);

  const nacionais = rifas
    .map((r, i) => ({ r, i }))
    .filter((x) => ehNacionalAprovada(x.r))
    .sort(compararNacionais);
  if (nacionais.length === 0) return ordenarPorProximidade(rifas, perto);

  const topo = nacionais.slice(0, teto);
  const noTopo = new Set(topo.map((x) => x.i));
  const resto = rifas.filter((_, i) => !noTopo.has(i));
  return [...topo.map((x) => x.r), ...ordenarPorProximidade(resto, perto)];
}
