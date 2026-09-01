/// Monta CSV para abrir no Excel em português: separador ";" e BOM no início.

/// Escapa um campo. O apóstrofo à frente de =, +, - e @ evita que a planilha
/// interprete o conteúdo como fórmula (CSV injection) — um comprador poderia
/// cadastrar o nome como `=HYPERLINK(...)` e a fórmula rodaria ao abrir o arquivo.
export function campoCsv(valor: string | number | null | undefined): string {
  const texto = String(valor ?? "");
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

export function montarCsv(cabecalho: string[], linhas: (string | number | null | undefined)[][]): string {
  const corpo = linhas.map((linha) => linha.map(campoCsv).join(";"));
  return `﻿${cabecalho.map(campoCsv).join(";")}\n${corpo.join("\n")}`;
}
