/**
 * O contrato de um tipo de trabalho do trabalhador (`server/worker.ts`):
 * recebe o trabalho tomado e as entradas, devolve a saída. Erro que não
 * adianta repetir lança `ErroDefinitivo`; qualquer outro volta para a fila
 * (`falharTrabalho`), até as tentativas acabarem.
 */
import type { ArquivoDoTrabalho, TrabalhoTomado } from "../services/fila";

export class ErroDefinitivo extends Error {}

export interface SaidaDoTrabalho {
  saidas: ArquivoDoTrabalho[];
  resultado?: Record<string, unknown>;
}

export type FazerTrabalho = (t: TrabalhoTomado, entradas: ArquivoDoTrabalho[]) => Promise<SaidaDoTrabalho>;
