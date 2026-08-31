import crypto from "crypto";
import { Prisma, StatusCompra, StatusNumero, StatusPagamento } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { multiplicar, percentualDe } from "@/lib/dinheiro";
import { enviarEmail, montarEmailConfirmacao } from "@/lib/email";

export class ErroDeNegocio extends Error {}

/// Quantidade de dígitos do número da rifa (1000 números -> "000".."999").
export function digitosDaRifa(quantidadeNumeros: number): number {
  return String(quantidadeNumeros - 1).length;
}

export function formatarNumero(numero: number, quantidadeNumeros: number): string {
  return String(numero).padStart(digitosDaRifa(quantidadeNumeros), "0");
}

export function gerarCodigoCompra(): string {
  // Alfabeto sem I, O, 0 e 1: o código é ditado por telefone e lido de recibo.
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo = "";
  for (let i = 0; i < 10; i++) {
    codigo += alfabeto[crypto.randomInt(alfabeto.length)];
  }
  return `RF${codigo}`;
}

/// Deriva o número vencedor do 1º prêmio da Loteria Federal, tomando os últimos
/// dígitos conforme o tamanho da rifa. É o método auditável: qualquer pessoa
/// confere o resultado no site da Caixa.
export function numeroVencedorPelaFederal(primeiroPremio: string, quantidadeNumeros: number): number {
  const digitos = primeiroPremio.replace(/\D/g, "");
  if (digitos.length === 0) throw new ErroDeNegocio("Prêmio da Loteria Federal inválido");

  const casas = digitosDaRifa(quantidadeNumeros);
  const sufixo = digitos.slice(-casas).padStart(casas, "0");
  const numero = Number(sufixo);

  // Rifas cujo tamanho não é potência de 10 (ex.: 500 números) podem gerar um
  // sufixo fora da faixa; o excedente volta ao início pelo resto da divisão.
  return numero % quantidadeNumeros;
}

/// Libera reservas vencidas para que os números voltem a ficar disponíveis.
/// Chamado antes de listar e antes de reservar.
export async function liberarReservasExpiradas(rifaId: string): Promise<void> {
  const agora = new Date();

  await prisma.$transaction(async (tx) => {
    const expiradas = await tx.compra.findMany({
      where: { rifaId, status: StatusCompra.AGUARDANDO_PAGAMENTO, expiraEm: { lt: agora } },
      select: { id: true },
    });
    if (expiradas.length === 0) return;

    const ids = expiradas.map((c) => c.id);

    await tx.numero.updateMany({
      where: { compraId: { in: ids }, status: StatusNumero.RESERVADO },
      data: { status: StatusNumero.DISPONIVEL, compraId: null, reservadoAte: null },
    });
    await tx.compra.updateMany({ where: { id: { in: ids } }, data: { status: StatusCompra.EXPIRADA } });
    await tx.pagamento.updateMany({
      where: { compraId: { in: ids }, status: StatusPagamento.PENDENTE },
      data: { status: StatusPagamento.EXPIRADO },
    });
  });
}

type DadosComprador = {
  nome: string;
  email: string;
  telefone: string;
  cpf?: string | null;
};

/// Reserva os números escolhidos e cria a compra, tudo numa única transação:
/// ou todos os números ficam reservados para esta compra, ou nada acontece.
export async function criarCompra(params: {
  rifaId: string;
  numeros: number[];
  comprador: DadosComprador;
  codigoAfiliado?: string | null;
}): Promise<{ compraId: string; codigo: string; valorTotal: Prisma.Decimal; expiraEm: Date }> {
  const { rifaId, numeros, comprador, codigoAfiliado } = params;

  await liberarReservasExpiradas(rifaId);

  const rifa = await prisma.rifa.findUnique({ where: { id: rifaId } });
  if (!rifa) throw new ErroDeNegocio("Rifa não encontrada");
  if (rifa.status !== "ABERTA") throw new ErroDeNegocio("Esta rifa não está aberta para vendas");
  if (numeros.length === 0) throw new ErroDeNegocio("Selecione ao menos um número");
  if (numeros.length > rifa.limiteNumerosPorCompra) {
    throw new ErroDeNegocio(`Máximo de ${rifa.limiteNumerosPorCompra} números por compra`);
  }
  if (new Set(numeros).size !== numeros.length) {
    throw new ErroDeNegocio("Há números repetidos na seleção");
  }
  if (numeros.some((n) => !Number.isInteger(n) || n < 0 || n >= rifa.quantidadeNumeros)) {
    throw new ErroDeNegocio("Número fora da faixa desta rifa");
  }

  const afiliado = codigoAfiliado
    ? await prisma.afiliado.findFirst({
        where: { codigo: codigoAfiliado, ativo: true, organizacaoId: rifa.organizacaoId },
      })
    : null;

  const valorTotal = multiplicar(rifa.precoPorNumero, numeros.length);
  const expiraEm = new Date(Date.now() + rifa.minutosParaPagar * 60_000);

  return prisma.$transaction(async (tx) => {
    const compradorRegistro = await tx.comprador.create({
      data: {
        nome: comprador.nome,
        email: comprador.email,
        telefone: comprador.telefone,
        cpf: comprador.cpf ?? null,
      },
    });

    const compra = await tx.compra.create({
      data: {
        codigo: gerarCodigoCompra(),
        rifaId,
        compradorId: compradorRegistro.id,
        afiliadoId: afiliado?.id ?? null,
        quantidade: numeros.length,
        valorTotal,
        expiraEm,
      },
    });

    // A compra existe antes da reserva para que status e dono do número sejam
    // gravados na mesma instrução: não há instante em que um número esteja
    // reservado sem compra. Se a contagem não bater, alguém levou um número no
    // meio do caminho e a transação inteira é desfeita.
    const reserva = await tx.numero.updateMany({
      where: { rifaId, numero: { in: numeros }, status: StatusNumero.DISPONIVEL },
      data: { status: StatusNumero.RESERVADO, reservadoAte: expiraEm, compraId: compra.id },
    });

    if (reserva.count !== numeros.length) {
      throw new ErroDeNegocio(
        "Um ou mais números escolhidos acabaram de ser reservados por outra pessoa. Atualize a página e escolha novamente.",
      );
    }

    return { compraId: compra.id, codigo: compra.codigo, valorTotal, expiraEm };
  });
}

/// Confirma o pagamento de uma compra: números viram PAGO e, havendo afiliado,
/// a comissão é registrada. Idempotente — reprocessar o mesmo webhook não
/// duplica comissão nem reescreve a data de pagamento.
/// Retorna true apenas quando esta chamada foi a que transicionou a compra para
/// paga — assim o e-mail de confirmação sai uma vez só, mesmo que o webhook e a
/// consulta da tela cheguem juntos.
export async function confirmarPagamento(params: {
  compraId: string;
  idExterno?: string | null;
  dadosProvedor?: Prisma.InputJsonValue;
}): Promise<boolean> {
  const { compraId, idExterno, dadosProvedor } = params;

  return prisma.$transaction(async (tx) => {
    const compra = await tx.compra.findUnique({
      where: { id: compraId },
      include: { afiliado: true },
    });
    if (!compra) throw new ErroDeNegocio("Compra não encontrada");
    if (compra.status === StatusCompra.PAGA) return false;

    await tx.compra.update({
      where: { id: compraId },
      data: { status: StatusCompra.PAGA, pagaEm: new Date() },
    });

    await tx.numero.updateMany({
      where: { compraId },
      data: { status: StatusNumero.PAGO, reservadoAte: null },
    });

    await tx.pagamento.update({
      where: { compraId },
      data: {
        status: StatusPagamento.APROVADO,
        confirmadoEm: new Date(),
        ...(idExterno ? { idExterno } : {}),
        ...(dadosProvedor ? { dadosProvedor } : {}),
      },
    });

    if (compra.afiliado) {
      await tx.comissao.create({
        data: {
          afiliadoId: compra.afiliado.id,
          compraId: compra.id,
          percentual: compra.afiliado.percentualComissao,
          valor: percentualDe(compra.valorTotal, compra.afiliado.percentualComissao),
        },
      });
    }

    return true;
  });
}

/// Avisa o comprador por e-mail. Chamado depois da transação de confirmação e
/// sempre tolerante a falha: e-mail que não sai não invalida pagamento recebido.
export async function notificarCompraPaga(compraId: string): Promise<void> {
  try {
    const compra = await prisma.compra.findUnique({
      where: { id: compraId },
      include: {
        comprador: true,
        numeros: { select: { numero: true }, orderBy: { numero: "asc" } },
        rifa: {
          select: {
            titulo: true,
            premio: true,
            quantidadeNumeros: true,
            dataSorteio: true,
            organizacao: { select: { nome: true } },
          },
        },
      },
    });
    if (!compra) return;

    const { assunto, html } = montarEmailConfirmacao({
      nome: compra.comprador.nome,
      rifa: compra.rifa.titulo,
      premio: compra.rifa.premio,
      codigo: compra.codigo,
      numeros: compra.numeros.map((n) => formatarNumero(n.numero, compra.rifa.quantidadeNumeros)),
      valorTotal: compra.valorTotal.toFixed(2),
      dataSorteio: compra.rifa.dataSorteio,
      organizacao: compra.rifa.organizacao.nome,
    });

    await enviarEmail({ para: compra.comprador.email, assunto, html });
  } catch (erro) {
    console.error("Falha ao notificar compra paga", compraId, erro);
  }
}

export async function registrarAuditoria(params: {
  usuarioId?: string | null;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  dados?: Prisma.InputJsonValue;
  ip?: string | null;
}): Promise<void> {
  await prisma.logAuditoria.create({
    data: {
      usuarioId: params.usuarioId ?? null,
      acao: params.acao,
      entidade: params.entidade,
      entidadeId: params.entidadeId,
      dados: params.dados,
      ip: params.ip ?? null,
    },
  });
}
