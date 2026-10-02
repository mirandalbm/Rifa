/**
 * Relatórios da política de conteúdo (modo relatório, `shared/csp.ts`). Cada
 * par diretiva + origem vai ao log **uma vez por hora**, com quantas vezes
 * apareceu: um site com milhares de visitas mandaria milhares de relatórios
 * iguais. Guardado só na memória do processo, com teto — é sinal para a lista,
 * não registro.
 */
import { resumoDoRelatorioCsp } from "@shared/csp";

const HORA = 60 * 60_000;
const TETO = 500;
const vistos = new Map<string, { n: number; desde: number }>();

export function registrarRelatorioCsp(corpo: unknown, agora = Date.now()) {
  const r = resumoDoRelatorioCsp(corpo);
  if (!r) return false;
  const chave = `${r.diretiva} ${r.origem}`;
  const atual = vistos.get(chave);
  if (atual && agora - atual.desde < HORA) {
    atual.n += 1;
    return false;
  }
  if (atual) console.warn(`[csp] ${chave}: ${atual.n} relatório(s) na última hora`);
  else console.warn(`[csp] modo relatório barraria: ${chave}`);
  if (!atual && vistos.size >= TETO) vistos.delete(vistos.keys().next().value as string);
  vistos.set(chave, { n: 1, desde: agora });
  return true;
}
