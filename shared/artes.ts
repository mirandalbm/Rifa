/**
 * Artes prontas para divulgar a rifa (Fase A do `docs/PLANO-FERRAMENTAS.md`).
 *
 * O servidor desenha a arte com os dados da própria rifa — prêmio, preço,
 * data, autorização, faltam N cotas, resultado — nos três formatos das
 * redes. Aqui moram as regras puras: quais artes a rifa pode ter agora, os
 * textos de cada uma e o que é aceito na URL. Quem desenha é
 * `server/services/artes.ts`.
 *
 * O que não pode afrouxar:
 * - **Só dado real**: "faltam N cotas" é o número de agora; nada de "últimas
 *   cotas" quando sobra muita, nem contador inventado.
 * - **Só o que já é público**: o ganhador sai pelo nome curto (o mesmo da
 *   coluna ao vivo), e a cota premiada só depois de reclamada e paga.
 * - **Rifa de demonstração ou travada não tem arte**: seria anunciar uma
 *   rifa que não vende ou um sorteio que não acontece.
 */
import { formatBRL, formatQuota, groupNumber } from "./format";
import { numeracaoZero } from "./apuracao";

export const TIPOS_DE_ARTE = ["rifa", "faltam", "contagem", "resultado", "premiada"] as const;
export type TipoDeArte = (typeof TIPOS_DE_ARTE)[number];

export const ROTULO_DA_ARTE: Record<TipoDeArte, string> = {
  rifa: "Arte da rifa",
  faltam: "Cotas que faltam",
  contagem: "Data do sorteio",
  resultado: "Resultado",
  premiada: "Cota premiada",
};

/** Os três formatos das redes: feed (4:5), quadrado (1:1) e story/reels (9:16). */
export const FORMATOS_DA_ARTE = {
  retrato: { largura: 1080, altura: 1350, rotulo: "Feed 4:5" },
  quadrado: { largura: 1080, altura: 1080, rotulo: "Quadrado 1:1" },
  vertical: { largura: 1080, altura: 1920, rotulo: "Story e reels 9:16" },
} as const;
export type FormatoDaArte = keyof typeof FORMATOS_DA_ARTE;
export const FORMATOS_DA_ARTE_LISTA = Object.keys(FORMATOS_DA_ARTE) as FormatoDaArte[];

/**
 * No 9:16 a interface do story e do reels cobre o alto e a base (220 e 450
 * de 1920): o texto da arte fica fora dessas faixas.
 */
export const AREA_SEGURA_DO_VERTICAL = { topo: 220, base: 450 } as const;

/** Só valor conhecido vem da URL; o resto é nulo (a rota responde 404). */
export function interpretarTipoDeArte(v: unknown): TipoDeArte | null {
  return typeof v === "string" && (TIPOS_DE_ARTE as readonly string[]).includes(v) ? (v as TipoDeArte) : null;
}
export function interpretarFormatoDaArte(v: unknown): FormatoDaArte | null {
  if (v === undefined || v === null || v === "") return "retrato";
  return typeof v === "string" && Object.hasOwn(FORMATOS_DA_ARTE, v) ? (v as FormatoDaArte) : null;
}

export interface DadosDaArte {
  premio: string;
  precoCents: number;
  totalQuotas: number;
  vendidas: number;
  drawAt: Date | string | null;
  metodoApuracao: string | null;
  autorizacao: string | null;
  status: string;
  demonstracao: boolean;
  travada: boolean;
  /** A rifa vende agora (`rifaAVenda`). */
  vende: boolean;
  /** Sorteio feito: o número contemplado (interno) e o nome curto de quem levou. */
  resultado: { numero: number; nome: string | null } | null;
  /** Cotas premiadas já reclamadas e pagas, a mais nova primeiro. */
  premiadas: { numero: number; premio: string; nome: string }[];
}

/** As artes que a rifa pode ter agora, na ordem da tela. */
export function artesDisponiveis(d: DadosDaArte, agora = Date.now()): TipoDeArte[] {
  if (d.demonstracao || d.travada) return [];
  const lista: TipoDeArte[] = [];
  if (d.status === "published") lista.push("rifa");
  if (d.status === "published" && d.vende && d.vendidas < d.totalQuotas) lista.push("faltam");
  if (d.status === "published" && d.drawAt && new Date(d.drawAt).getTime() > agora) lista.push("contagem");
  if (d.resultado) lista.push("resultado");
  if (d.premiadas.length) lista.push("premiada");
  return lista;
}

const FUSO = "America/Sao_Paulo";

/** "sábado, 12/10 às 19h" (ou "19h30"), no fuso de São Paulo. */
export function dataDoSorteio(drawAt: Date | string): string {
  const d = new Date(drawAt);
  const semana = d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: FUSO });
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO });
  const [h, m] = d
    .toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: FUSO })
    .split(":");
  return `${semana}, ${dia} às ${Number(h)}h${m === "00" ? "" : m}`;
}

export function quemApura(metodo: string | null): string {
  return metodo === "globo" ? "no globo da plataforma" : "pela Loteria Federal";
}

/**
 * Os textos de cada arte: a chamada (pequena, no alto), o destaque (o
 * número grande), o título (o prêmio) e as linhas de apoio. Nunca telefone,
 * CPF ou nome inteiro: o ganhador é o nome curto.
 */
export interface TextosDaArte {
  chamada: string;
  destaque: string | null;
  titulo: string;
  linhas: string[];
}

export function textosDaArte(tipo: TipoDeArte, d: DadosDaArte): TextosDaArte {
  const preco = `${formatBRL(d.precoCents)} a cota`;
  const sorteio = d.drawAt ? `Sorteio ${dataDoSorteio(d.drawAt)} ${quemApura(d.metodoApuracao)}` : `Sorteio ${quemApura(d.metodoApuracao)}`;
  const autorizada = d.autorizacao ? `Autorizada SPA/MF nº ${d.autorizacao}` : null;
  const zero = numeracaoZero(d.metodoApuracao);
  switch (tipo) {
    case "rifa":
      return { chamada: "Rifa autorizada", destaque: preco, titulo: d.premio, linhas: [sorteio, autorizada].filter(Boolean) as string[] };
    case "faltam": {
      const faltam = Math.max(0, d.totalQuotas - d.vendidas);
      return {
        chamada: "Faltam",
        destaque: `${groupNumber(faltam)} ${faltam === 1 ? "cota" : "cotas"}`,
        titulo: d.premio,
        linhas: [preco, sorteio].filter(Boolean),
      };
    }
    case "contagem":
      return {
        chamada: "Sorteio",
        destaque: d.drawAt ? dataDoSorteio(d.drawAt) : "em breve",
        titulo: d.premio,
        linhas: [`Apuração ${quemApura(d.metodoApuracao)}`, preco],
      };
    case "resultado":
      return {
        chamada: "Resultado",
        destaque: d.resultado ? `Nº ${formatQuota(d.resultado.numero, d.totalQuotas, zero)}` : null,
        titulo: d.premio,
        linhas: [d.resultado?.nome ? `Contemplado: ${d.resultado.nome}` : "Sorteio realizado", autorizada].filter(Boolean) as string[],
      };
    case "premiada": {
      const p = d.premiadas[0];
      return {
        chamada: "Cota premiada",
        destaque: p ? `Nº ${formatQuota(p.numero, d.totalQuotas, zero)}` : null,
        titulo: p ? p.premio : d.premio,
        linhas: p ? [`${p.nome} levou`, `Na rifa: ${d.premio}`] : [],
      };
    }
  }
}

/** O nome do arquivo para baixar: `arte-<rifa>-<tipo>-<formato>.jpg`. */
export function nomeDoArquivoDaArte(slug: string, tipo: TipoDeArte, formato: FormatoDaArte): string {
  return `arte-${slug}-${tipo}-${formato}.jpg`;
}

/**
 * As duas linhas ao lado do QR. "Compre" só enquanto a rifa vende: na rifa
 * sorteada ou esgotada o QR leva à página dela, para conferir.
 */
export function rodapeDaArte(tipo: TipoDeArte, vende: boolean): [string, string] {
  if (tipo === "resultado") return ["Confira o resultado", "A conferência é pública, na página da rifa"];
  if (vende) return ["Compre pelo site", "Só vale bilhete pago pela plataforma"];
  return ["Veja a rifa no site", "Só vale bilhete pago pela plataforma"];
}
