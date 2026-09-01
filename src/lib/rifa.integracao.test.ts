/// Testes de integração — exigem PostgreSQL real (DATABASE_URL).
/// Rode com `npm run test:integracao`, que sobe o banco antes.
///
/// Cobrem o que teste de unidade não alcança: concorrência na reserva de
/// números, expiração e idempotência do webhook. É onde uma rifa perderia
/// dinheiro ou venderia o mesmo número duas vezes.

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { StatusCompra, StatusNumero, StatusPagamento } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { criarCompra, confirmarPagamento, liberarReservasExpiradas, ErroDeNegocio } from "@/lib/rifa";

let organizacaoId: string;
let rifaId: string;
let afiliadoId: string;

const comprador = { nome: "Maria Teste", email: "maria@exemplo.org", telefone: "11999990000" };

async function criarRifa(opcoes: { quantidadeNumeros?: number; minutosParaPagar?: number } = {}) {
  const quantidadeNumeros = opcoes.quantidadeNumeros ?? 50;

  const rifa = await prisma.rifa.create({
    data: {
      organizacaoId,
      titulo: `Rifa de teste ${crypto.randomUUID()}`,
      premio: "Cesta básica",
      precoPorNumero: "10.00",
      quantidadeNumeros,
      dataSorteio: new Date(Date.now() + 7 * 86_400_000),
      limiteNumerosPorCompra: 20,
      minutosParaPagar: opcoes.minutosParaPagar ?? 30,
      status: "ABERTA",
    },
  });

  await prisma.numero.createMany({
    data: Array.from({ length: quantidadeNumeros }, (_, numero) => ({ rifaId: rifa.id, numero })),
  });

  return rifa.id;
}

before(async () => {
  const organizacao = await prisma.organizacao.create({
    data: { nome: "ONG de Teste", cnpj: `teste-${Date.now()}`, email: `ong-${Date.now()}@exemplo.org` },
  });
  organizacaoId = organizacao.id;

  const usuario = await prisma.usuario.create({
    data: {
      organizacaoId,
      nome: "Afiliado Teste",
      email: `afiliado-${Date.now()}@exemplo.org`,
      senhaHash: "nao-usado-neste-teste",
      perfil: "AFILIADO",
    },
  });

  const afiliado = await prisma.afiliado.create({
    data: { organizacaoId, usuarioId: usuario.id, codigo: `AF${Date.now()}`, percentualComissao: "10" },
  });
  afiliadoId = afiliado.id;
});

beforeEach(async () => {
  rifaId = await criarRifa();
});

after(async () => {
  // Remove só o que este teste criou, na ordem que as chaves estrangeiras permitem.
  await prisma.comissao.deleteMany({ where: { afiliadoId } });
  await prisma.numero.deleteMany({ where: { rifa: { organizacaoId } } });
  await prisma.pagamento.deleteMany({ where: { compra: { rifa: { organizacaoId } } } });
  await prisma.compra.deleteMany({ where: { rifa: { organizacaoId } } });
  await prisma.resultado.deleteMany({ where: { rifa: { organizacaoId } } });
  await prisma.rifa.deleteMany({ where: { organizacaoId } });
  await prisma.afiliado.deleteMany({ where: { organizacaoId } });
  await prisma.logAuditoria.deleteMany({ where: { usuario: { organizacaoId } } });
  await prisma.usuario.deleteMany({ where: { organizacaoId } });
  await prisma.organizacao.delete({ where: { id: organizacaoId } });
  await prisma.$disconnect();
});

describe("criarCompra — reserva de números", () => {
  test("reserva exatamente os números escolhidos", async () => {
    const { compraId, valorTotal } = await criarCompra({ rifaId, numeros: [1, 2, 3], comprador });

    assert.equal(valorTotal.toString(), "30");

    const reservados = await prisma.numero.findMany({
      where: { compraId },
      select: { numero: true, status: true },
      orderBy: { numero: "asc" },
    });
    assert.deepEqual(
      reservados.map((n) => n.numero),
      [1, 2, 3],
    );
    assert.ok(reservados.every((n) => n.status === StatusNumero.RESERVADO));
  });

  test("recusa número já reservado por outra compra", async () => {
    await criarCompra({ rifaId, numeros: [7], comprador });

    await assert.rejects(
      () => criarCompra({ rifaId, numeros: [7], comprador }),
      (erro: Error) => erro instanceof ErroDeNegocio,
    );
  });

  test("não deixa rastro quando um dos números do lote está ocupado", async () => {
    await criarCompra({ rifaId, numeros: [10], comprador });

    const comprasAntes = await prisma.compra.count({ where: { rifaId } });

    await assert.rejects(() => criarCompra({ rifaId, numeros: [11, 10, 12], comprador }));

    // A transação inteira volta atrás: nem compra órfã, nem 11 e 12 presos.
    assert.equal(await prisma.compra.count({ where: { rifaId } }), comprasAntes);
    const livres = await prisma.numero.findMany({
      where: { rifaId, numero: { in: [11, 12] } },
      select: { status: true },
    });
    assert.ok(livres.every((n) => n.status === StatusNumero.DISPONIVEL));
  });

  test("duas compras simultâneas do mesmo número: uma só vence", async () => {
    // O caso que importa de verdade — duas pessoas clicando no mesmo instante.
    const resultados = await Promise.allSettled([
      criarCompra({ rifaId, numeros: [21], comprador }),
      criarCompra({ rifaId, numeros: [21], comprador }),
    ]);

    const vitorias = resultados.filter((r) => r.status === "fulfilled");
    assert.equal(vitorias.length, 1, "o mesmo número não pode ser vendido duas vezes");

    const donos = await prisma.numero.findMany({
      where: { rifaId, numero: 21 },
      select: { compraId: true },
    });
    assert.equal(donos.length, 1);
    assert.ok(donos[0].compraId, "o número deveria ter exatamente um dono");
  });

  test("dez compras simultâneas de números diferentes passam todas", async () => {
    const resultados = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => criarCompra({ rifaId, numeros: [30 + i], comprador })),
    );
    assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 10);
  });

  test("respeita o limite de números por compra", async () => {
    await assert.rejects(
      () => criarCompra({ rifaId, numeros: Array.from({ length: 21 }, (_, i) => i), comprador }),
      /Máximo de 20/,
    );
  });

  test("recusa número fora da faixa e seleção repetida", async () => {
    await assert.rejects(() => criarCompra({ rifaId, numeros: [50], comprador }), /fora da faixa/);
    await assert.rejects(() => criarCompra({ rifaId, numeros: [-1], comprador }), /fora da faixa/);
    await assert.rejects(() => criarCompra({ rifaId, numeros: [5, 5], comprador }), /repetidos/);
  });

  test("recusa venda em rifa que não está aberta", async () => {
    const rascunho = await criarRifa();
    await prisma.rifa.update({ where: { id: rascunho }, data: { status: "ENCERRADA" } });

    await assert.rejects(
      () => criarCompra({ rifaId: rascunho, numeros: [1], comprador }),
      /não está aberta/,
    );
  });
});

describe("criarCompra — sorteio automático (rifa grande, sem grade)", () => {
  test("sorteia a quantidade pedida entre os disponíveis", async () => {
    const { compraId, numeros: sorteados } = await criarCompra({ rifaId, quantidade: 5, comprador });

    assert.equal(sorteados.length, 5);
    assert.equal(new Set(sorteados).size, 5, "não pode sortear o mesmo número duas vezes");

    const reservados = await prisma.numero.findMany({
      where: { compraId },
      select: { numero: true, status: true },
    });
    assert.equal(reservados.length, 5);
    assert.ok(reservados.every((n) => n.status === StatusNumero.RESERVADO));
    assert.deepEqual(
      reservados.map((n) => n.numero).sort((a, b) => a - b),
      [...sorteados].sort((a, b) => a - b),
    );
  });

  test("nunca sorteia número já vendido", async () => {
    // Deixa só 3 livres numa rifa de 50 e pede exatamente 3.
    const livres = [11, 22, 33];
    await prisma.numero.updateMany({
      where: { rifaId, numero: { notIn: livres } },
      data: { status: StatusNumero.PAGO },
    });

    const { numeros: sorteados } = await criarCompra({ rifaId, quantidade: 3, comprador });
    assert.deepEqual([...sorteados].sort((a, b) => a - b), livres);
  });

  test("recusa quando não há números suficientes", async () => {
    await prisma.numero.updateMany({ where: { rifaId }, data: { status: StatusNumero.PAGO } });

    await assert.rejects(
      () => criarCompra({ rifaId, quantidade: 2, comprador }),
      /não há mais números|Restam apenas/i,
    );
  });

  test("compras simultâneas por quantidade não repetem número", async () => {
    const resultados = await Promise.allSettled(
      Array.from({ length: 5 }, () => criarCompra({ rifaId, quantidade: 8, comprador })),
    );

    const numerosVendidos = resultados
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof criarCompra>>> => r.status === "fulfilled")
      .flatMap((r) => r.value.numeros);

    assert.equal(
      new Set(numerosVendidos).size,
      numerosVendidos.length,
      "duas compras receberam o mesmo número",
    );
  });

  test("respeita o limite por compra também no sorteio", async () => {
    await assert.rejects(() => criarCompra({ rifaId, quantidade: 21, comprador }), /Máximo de 20/);
  });

  test("recusa pedir números e quantidade ao mesmo tempo", async () => {
    await assert.rejects(
      () => criarCompra({ rifaId, numeros: [1], quantidade: 1, comprador }),
      /ou a quantidade/,
    );
  });
});

describe("liberarReservasExpiradas", () => {
  test("devolve à venda os números de uma reserva vencida", async () => {
    const { compraId } = await criarCompra({ rifaId, numeros: [40, 41], comprador });

    // Empurra a reserva para o passado, como se o comprador tivesse sumido.
    await prisma.compra.update({
      where: { id: compraId },
      data: { expiraEm: new Date(Date.now() - 60_000) },
    });

    await liberarReservasExpiradas(rifaId);

    const numeros = await prisma.numero.findMany({
      where: { rifaId, numero: { in: [40, 41] } },
      select: { status: true, compraId: true, reservadoAte: true },
    });
    assert.ok(numeros.every((n) => n.status === StatusNumero.DISPONIVEL));
    assert.ok(numeros.every((n) => n.compraId === null && n.reservadoAte === null));

    const compra = await prisma.compra.findUniqueOrThrow({ where: { id: compraId } });
    assert.equal(compra.status, StatusCompra.EXPIRADA);
  });

  test("o número liberado pode ser comprado por outra pessoa", async () => {
    const { compraId } = await criarCompra({ rifaId, numeros: [45], comprador });
    await prisma.compra.update({
      where: { id: compraId },
      data: { expiraEm: new Date(Date.now() - 60_000) },
    });

    const segunda = await criarCompra({ rifaId, numeros: [45], comprador });
    assert.ok(segunda.compraId);
  });

  test("não mexe em reserva ainda dentro do prazo", async () => {
    const { compraId } = await criarCompra({ rifaId, numeros: [46], comprador });

    await liberarReservasExpiradas(rifaId);

    const compra = await prisma.compra.findUniqueOrThrow({ where: { id: compraId } });
    assert.equal(compra.status, StatusCompra.AGUARDANDO_PAGAMENTO);
  });

  test("não expira compra já paga, mesmo com a data vencida", async () => {
    const { compraId } = await criarCompra({ rifaId, numeros: [47], comprador });
    await confirmarPagamento({ compraId });
    await prisma.compra.update({
      where: { id: compraId },
      data: { expiraEm: new Date(Date.now() - 60_000) },
    });

    await liberarReservasExpiradas(rifaId);

    const compra = await prisma.compra.findUniqueOrThrow({ where: { id: compraId } });
    assert.equal(compra.status, StatusCompra.PAGA, "compra paga jamais pode voltar a ficar livre");
    const numero = await prisma.numero.findFirstOrThrow({ where: { rifaId, numero: 47 } });
    assert.equal(numero.status, StatusNumero.PAGO);
  });
});

describe("confirmarPagamento — idempotência", () => {
  test("marca compra e números como pagos", async () => {
    const { compraId } = await criarCompra({ rifaId, numeros: [2, 3], comprador });

    const confirmou = await confirmarPagamento({ compraId, idExterno: "mp-1" });
    assert.equal(confirmou, true);

    const compra = await prisma.compra.findUniqueOrThrow({
      where: { id: compraId },
      include: { numeros: true },
    });
    assert.equal(compra.status, StatusCompra.PAGA);
    assert.ok(compra.pagaEm);
    assert.ok(compra.numeros.every((n) => n.status === StatusNumero.PAGO));
  });

  test("webhook reprocessado não duplica nada", async () => {
    const { compraId } = await criarCompra({ rifaId, numeros: [4], comprador, codigoAfiliado: null });

    assert.equal(await confirmarPagamento({ compraId, idExterno: "mp-2" }), true);
    // O Mercado Pago reenvia o mesmo evento quando não recebe 200 rápido.
    assert.equal(await confirmarPagamento({ compraId, idExterno: "mp-2" }), false);
    assert.equal(await confirmarPagamento({ compraId, idExterno: "mp-2" }), false);

    const compra = await prisma.compra.findUniqueOrThrow({ where: { id: compraId } });
    assert.equal(compra.status, StatusCompra.PAGA);
  });

  test("a data do pagamento não é reescrita por reprocessamento", async () => {
    const { compraId } = await criarCompra({ rifaId, numeros: [6], comprador });
    await confirmarPagamento({ compraId });
    const primeira = await prisma.compra.findUniqueOrThrow({ where: { id: compraId } });

    await confirmarPagamento({ compraId });
    const segunda = await prisma.compra.findUniqueOrThrow({ where: { id: compraId } });

    assert.deepEqual(segunda.pagaEm, primeira.pagaEm);
  });

  test("registra a comissão do afiliado uma única vez", async () => {
    const afiliado = await prisma.afiliado.findUniqueOrThrow({ where: { id: afiliadoId } });
    const { compraId } = await criarCompra({
      rifaId,
      numeros: [8, 9],
      comprador,
      codigoAfiliado: afiliado.codigo,
    });

    await confirmarPagamento({ compraId });
    await confirmarPagamento({ compraId });

    const comissoes = await prisma.comissao.findMany({ where: { compraId } });
    assert.equal(comissoes.length, 1, "webhook repetido não pode gerar comissão dobrada");
    // 10% de R$ 20,00 (dois números a R$ 10,00).
    assert.equal(comissoes[0].valor.toString(), "2");
  });

  test("compra sem afiliado não gera comissão", async () => {
    const { compraId } = await criarCompra({ rifaId, numeros: [12], comprador });
    await confirmarPagamento({ compraId });

    assert.equal(await prisma.comissao.count({ where: { compraId } }), 0);
  });

  test("aprova o registro de pagamento quando ele existe", async () => {
    const { compraId, valorTotal } = await criarCompra({ rifaId, numeros: [14], comprador });
    await prisma.pagamento.create({
      data: {
        compraId,
        valor: valorTotal,
        idExterno: "mp-3",
        chaveIdempotencia: crypto.randomUUID(),
        pixCopiaECola: "pix-teste",
      },
    });

    await confirmarPagamento({ compraId, idExterno: "mp-3" });

    const pagamento = await prisma.pagamento.findUniqueOrThrow({ where: { compraId } });
    assert.equal(pagamento.status, StatusPagamento.APROVADO);
    assert.ok(pagamento.confirmadoEm);
  });

  test("confirma mesmo sem registro de pagamento (recebimento por fora)", async () => {
    // A organizadora pode receber em dinheiro e confirmar à mão. Dinheiro que
    // entrou tem de ser reconhecido, mesmo sem PIX gerado.
    const { compraId } = await criarCompra({ rifaId, numeros: [15], comprador });
    assert.equal(await prisma.pagamento.count({ where: { compraId } }), 0);

    assert.equal(await confirmarPagamento({ compraId }), true);

    const compra = await prisma.compra.findUniqueOrThrow({ where: { id: compraId } });
    assert.equal(compra.status, StatusCompra.PAGA);
  });

  test("recusa compra inexistente", async () => {
    await assert.rejects(() => confirmarPagamento({ compraId: crypto.randomUUID() }));
  });
});
