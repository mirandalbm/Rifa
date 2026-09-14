/**
 * Exportações.
 *
 * Duas coisas governam este arquivo, e as duas são armadilha conhecida de
 * quem gera planilha:
 *
 * 1. **A planilha executa o que você escreve nela.** Célula que começa com
 *    `=`, `+`, `@` — ou `-` que não é número — o Excel e o LibreOffice tratam
 *    como fórmula. O nome do comprador vem de um formulário público: é ele
 *    que acaba dentro da célula. Ver `neutralizarFormula()`.
 *
 * 2. **O Excel brasileiro não lê CSV internacional.** Separador é ponto e
 *    vírgula, decimal é vírgula, e sem BOM o acento vira caractere estranho.
 *    Exportação que abre torta não serve para nada.
 *
 * Fica em `shared/` sem dependência de banco porque é isto que os testes
 * exercitam — escapar célula é regra, não infraestrutura.
 */

/** Separador de campo. Ponto e vírgula: é o que o Excel pt-BR espera. */
export const CSV_SEP = ";";

/** Fim de linha do RFC 4180. */
export const CSV_EOL = "\r\n";

/**
 * Marca de ordem de bytes.
 *
 * Sem ela o Excel abre o arquivo em Latin-1 e "João" vira "JoÃ£o". É feio,
 * mas é o que faz o arquivo abrir certo no computador do organizador.
 */
export const CSV_BOM = "﻿";

/** Caracteres que fazem a planilha tratar a célula como fórmula. */
const GATILHOS_DE_FORMULA = ["=", "+", "@", "\t", "\r"];

/** Só dígitos, sinal, vírgula e ponto — o que de fato é número. */
const PARECE_NUMERO = /^-?[\d.,]+$/;

/**
 * Impede que a célula vire fórmula ao abrir a planilha.
 *
 * O ataque: o comprador se cadastra com o nome
 * `=HYPERLINK("http://malvado","clique")` ou, pior,
 * `=cmd|'/c calc'!A1`. O organizador exporta os pedidos, abre no Excel e a
 * célula executa. Ele não digitou nada — só abriu o próprio relatório.
 *
 * A defesa é o apóstrofo à esquerda: o Excel passa a ler como texto e o
 * apóstrofo não aparece na célula.
 *
 * O `-` merece cuidado: `-14,70` é dinheiro de verdade e precisa continuar
 * sendo número, senão a soma da coluna para de funcionar. Por isso ele só é
 * neutralizado quando o resto não parece número.
 */
export function neutralizarFormula(texto: string): string {
  if (!texto) return texto;

  const primeiro = texto[0];

  if (GATILHOS_DE_FORMULA.includes(primeiro)) return `'${texto}`;
  if (primeiro === "-" && !PARECE_NUMERO.test(texto)) return `'${texto}`;

  return texto;
}

/**
 * Uma célula pronta para o arquivo: fórmula neutralizada e aspas escapadas.
 *
 * `null` e `undefined` viram célula vazia — não a palavra "null", que já
 * apareceu em relatório entregue a contador.
 */
export function csvCell(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  const texto = neutralizarFormula(String(valor));

  // Aspas, separador e quebra de linha obrigam a envolver em aspas; aspas
  // internas dobram. RFC 4180.
  if (
    texto.includes('"') ||
    texto.includes(CSV_SEP) ||
    texto.includes("\n") ||
    texto.includes("\r")
  ) {
    return `"${texto.replace(/"/g, '""')}"`;
  }

  return texto;
}

export function csvRow(valores: unknown[]): string {
  return valores.map(csvCell).join(CSV_SEP) + CSV_EOL;
}

/**
 * Centavos no formato que o Excel pt-BR soma.
 *
 * Sem `R$` e sem separador de milhar: com eles a célula vira texto e a soma
 * da coluna devolve zero. A vírgula decimal é o que o Excel brasileiro
 * espera — a mesma coluna com ponto seria lida como milhar.
 */
export function csvMoney(cents: number): string {
  const sinal = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sinal}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Data no formato que o organizador lê: dd/mm/aaaa hh:mm. */
export function csvDate(valor: Date | string | null | undefined): string {
  if (!valor) return "";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "";

  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ------------------------------------------------------------------ *
 * Catálogo
 * ------------------------------------------------------------------ */

export type ExportKey =
  | "pedidos"
  | "cotas"
  | "compradores"
  | "comissoes"
  | "acertos"
  | "sorteio"
  | "cobranca";

export interface ExportInfo {
  key: ExportKey;
  label: string;
  hint: string;
  /** Exige escolher uma campanha — exportar cota de todas não faz sentido. */
  campanhaObrigatoria: boolean;
  /**
   * Leva nome, telefone ou CPF.
   *
   * Marcado no catálogo porque a tela precisa avisar antes do download: o
   * arquivo sai do controle do sistema e vira responsabilidade de quem baixa
   * (LGPD, art. 37 — o registro do tratamento está em `audit_log`).
   */
  dadoPessoal: boolean;
}

export const EXPORTS: ExportInfo[] = [
  {
    key: "pedidos",
    label: "Pedidos",
    hint: "Toda venda com comprador, valor, meio de pagamento e origem. É o arquivo que a contabilidade pede.",
    campanhaObrigatoria: false,
    dadoPessoal: true,
  },
  {
    key: "cotas",
    label: "Cotas vendidas",
    hint: "Um número por linha, com o dono. Numa rifa de 1M pode passar de meio milhão de linhas.",
    campanhaObrigatoria: true,
    dadoPessoal: true,
  },
  {
    key: "compradores",
    label: "Compradores",
    hint: "Lista única de quem comprou, com quanto gastou e quantas cotas tem.",
    campanhaObrigatoria: false,
    dadoPessoal: true,
  },
  {
    key: "comissoes",
    label: "Comissões",
    hint: "Comissão por pedido, com afiliado, percentual, carência e situação.",
    campanhaObrigatoria: false,
    dadoPessoal: false,
  },
  {
    key: "acertos",
    label: "Acertos de cambista",
    hint: "O que cada cambista recolheu, o que fica com ele e o que deve à casa.",
    campanhaObrigatoria: false,
    dadoPessoal: false,
  },
  {
    key: "cobranca",
    label: "Cobrança da plataforma",
    hint: "O que a organização deve à plataforma: taxa por venda e mensalidade, com a origem de cada lançamento.",
    campanhaObrigatoria: false,
    dadoPessoal: false,
  },
  {
    key: "sorteio",
    label: "Prestação de contas do sorteio",
    hint: "Semente, hash publicado, concurso da Federal e o número que saiu. É o que se entrega a quem contesta.",
    campanhaObrigatoria: true,
    dadoPessoal: true,
  },
];

export function exportInfo(key: string): ExportInfo | undefined {
  return EXPORTS.find((e) => e.key === key);
}

/**
 * Nome do arquivo baixado.
 *
 * Leva a data porque o organizador baixa o mesmo relatório toda semana e
 * `pedidos.csv` em cima de `pedidos.csv` não conta história nenhuma.
 */
export function exportFilename(
  key: string,
  escopo: string | null,
  agora = new Date(),
): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const data = `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
  const meio = escopo ? `-${escopo}` : "";
  return `${key}${meio}-${data}.csv`;
}
