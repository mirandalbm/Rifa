/**
 * O laço do trabalhador (Fase F, `shared/fila.ts`): toma um trabalho dos tipos
 * que sabe fazer, faz, grava a saída ou a falha, e volta. Sem trabalho, espera
 * alguns segundos. A cada volta avisa que está no ar (a tela do site diz quando
 * o gerador está parado) e devolve à fila o que outro trabalhador largou no
 * meio. Ao receber SIGTERM (deploy), para de tomar e espera o que está fazendo.
 */
import os from "node:os";
import { randomUUID } from "node:crypto";
import { erroParaATela } from "@shared/fila";
import { arquivosDoTrabalho, avisarNoAr, devolverPresos, falharTrabalho, terminarTrabalho, tomarTrabalho } from "../services/fila";
import { rodarAteOFim } from "../services/videoProcessor";
import { TIPOS_DE_TRABALHO } from "./index";
import { ErroDefinitivo, type FazerTrabalho } from "./tipos";

function registro(msg: string) {
  console.log(`${new Date().toISOString()} [trabalhador] ${msg}`);
}

/** Toma e faz **um** trabalho. `true` se havia um. Nunca lança. */
export async function executarUm(quem: string, tipos: Record<string, FazerTrabalho> = TIPOS_DE_TRABALHO): Promise<boolean> {
  let tomado;
  try {
    tomado = await tomarTrabalho(Object.keys(tipos), quem);
  } catch (e) {
    registro(`não conseguiu tomar trabalho: ${erroParaATela(e)}`);
    return false;
  }
  if (!tomado) return false;
  const inicio = Date.now();
  try {
    const fazer = tipos[tomado.tipo];
    if (!fazer) throw new ErroDefinitivo(`Tipo de trabalho desconhecido: ${tomado.tipo}.`);
    const entradas = await arquivosDoTrabalho(tomado.id, "entrada");
    const feito = await fazer(tomado, entradas);
    const gravou = await terminarTrabalho(tomado.id, quem, feito.saidas, feito.resultado);
    registro(`${tomado.tipo} ${tomado.id} ${gravou ? "pronto" : "não era mais deste trabalhador"} em ${Date.now() - inicio} ms`);
  } catch (e) {
    const fim = await falharTrabalho(tomado.id, quem, e, e instanceof ErroDefinitivo).catch(() => null);
    registro(`${tomado.tipo} ${tomado.id} falhou (${fim ?? "?"}): ${erroParaATela(e)}`);
  }
  return true;
}

function inteiro(v: string | undefined, padrao: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : padrao;
}

export interface OpcoesDoTrabalhador {
  /** Quantos trabalhos ao mesmo tempo (`TRABALHADOR_SIMULTANEOS`, 1 a 4; padrão 1). */
  simultaneos?: number;
  /** Quanto esperar sem trabalho (`TRABALHADOR_ESPERA_MS`, padrão 3 s). */
  esperaMs?: number;
}

/** Sobe o laço; devolve a função que para (espera o que está em andamento). */
export function iniciarTrabalhador(opcoes: OpcoesDoTrabalhador = {}): { nome: string; parar: () => Promise<void> } {
  const nome = `${process.env.RAILWAY_REPLICA_ID || os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const simultaneos = opcoes.simultaneos ?? inteiro(process.env.TRABALHADOR_SIMULTANEOS, 1, 1, 4);
  const esperaMs = opcoes.esperaMs ?? inteiro(process.env.TRABALHADOR_ESPERA_MS, 3000, 200, 60_000);
  const tipos = Object.keys(TIPOS_DE_TRABALHO);
  let parando = false;
  const dormindo = new Set<() => void>();
  const dormir = (ms: number) =>
    new Promise<void>((acordar) => {
      const t = setTimeout(() => {
        dormindo.delete(fim);
        acordar();
      }, ms);
      const fim = () => {
        clearTimeout(t);
        acordar();
      };
      dormindo.add(fim);
    });

  const sinal = async () => {
    await avisarNoAr(nome, tipos).catch((e) => registro(`não avisou que está no ar: ${erroParaATela(e)}`));
    const presos = await devolverPresos().catch(() => null);
    if (presos && presos.devolvidos + presos.falhos > 0) registro(`devolveu ${presos.devolvidos} e encerrou ${presos.falhos} trabalhos presos`);
  };
  void sinal();
  const relogio = setInterval(() => void sinal(), 30_000);

  void rodarAteOFim(process.env.FFMPEG_PATH || "ffmpeg", ["-version"], 10_000).then((tem) => {
    if (!tem) registro("AVISO: o ffmpeg não foi encontrado — os vídeos vão falhar. Instale o ffmpeg (no Railway, o railpack.json já pede).");
  });

  const lacos = Array.from({ length: simultaneos }, async () => {
    while (!parando) {
      const fez = await executarUm(nome);
      if (!fez && !parando) await dormir(esperaMs);
    }
  });
  registro(`no ar como ${nome}, ${simultaneos} por vez, tipos: ${tipos.join(", ")}`);

  return {
    nome,
    parar: async () => {
      parando = true;
      clearInterval(relogio);
      for (const acordar of dormindo) acordar();
      await Promise.all(lacos);
    },
  };
}
