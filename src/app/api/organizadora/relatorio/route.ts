import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPerfil } from "@/lib/auth";
import { formatarNumero, registrarAuditoria } from "@/lib/rifa";

/// Escapa um campo para CSV. O prefixo em campos que começam com =, +, - ou @
/// evita que uma planilha interprete o conteúdo como fórmula (CSV injection):
/// um comprador poderia cadastrar o nome como "=HYPERLINK(...)".
function campoCsv(valor: string | number | null | undefined): string {
  const texto = String(valor ?? "");
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const sessao = await exigirPerfil("ORGANIZADORA", "OPERADOR");
  if (!sessao) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const rifaId = req.nextUrl.searchParams.get("rifaId");
  if (!rifaId) return NextResponse.json({ erro: "Informe a rifa" }, { status: 400 });

  const rifa = await prisma.rifa.findFirst({
    where: { id: rifaId, organizacaoId: sessao.organizacaoId },
  });
  if (!rifa) return NextResponse.json({ erro: "Rifa não encontrada" }, { status: 404 });

  const compras = await prisma.compra.findMany({
    where: { rifaId },
    include: {
      comprador: true,
      afiliado: { select: { codigo: true, usuario: { select: { nome: true } } } },
      numeros: { select: { numero: true }, orderBy: { numero: "asc" } },
      pagamento: { select: { confirmadoEm: true, idExterno: true } },
      comissao: { select: { valor: true, status: true } },
    },
    orderBy: { criadaEm: "asc" },
  });

  const cabecalho = [
    "codigo_compra",
    "situacao",
    "comprador",
    "email",
    "telefone",
    "cpf",
    "numeros",
    "quantidade",
    "valor_total",
    "criada_em",
    "paga_em",
    "id_pagamento",
    "afiliado_codigo",
    "afiliado_nome",
    "comissao_valor",
    "comissao_situacao",
  ];

  const linhas = compras.map((compra) =>
    [
      compra.codigo,
      compra.status,
      compra.comprador.nome,
      compra.comprador.email,
      compra.comprador.telefone,
      compra.comprador.cpf ?? "",
      compra.numeros.map((n) => formatarNumero(n.numero, rifa.quantidadeNumeros)).join(" "),
      compra.quantidade,
      compra.valorTotal.toFixed(2).replace(".", ","),
      compra.criadaEm.toISOString(),
      compra.pagaEm?.toISOString() ?? "",
      compra.pagamento?.idExterno ?? "",
      compra.afiliado?.codigo ?? "",
      compra.afiliado?.usuario.nome ?? "",
      compra.comissao?.valor.toFixed(2).replace(".", ",") ?? "",
      compra.comissao?.status ?? "",
    ]
      .map(campoCsv)
      .join(";"),
  );

  await registrarAuditoria({
    usuarioId: sessao.usuarioId,
    acao: "relatorio.exportado",
    entidade: "Rifa",
    entidadeId: rifaId,
    dados: { compras: compras.length },
  });

  // BOM + separador ";" para o Excel em português abrir acentuação e colunas certas.
  const csv = `﻿${cabecalho.join(";")}\n${linhas.join("\n")}`;
  const arquivo = `rifa-${rifa.titulo.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase()}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
    },
  });
}
