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

/// Cada prêmio da Loteria Federal tem 5 dígitos, então um prêmio sozinho só
/// alcança rifas de até 100 mil números. Acima disso é preciso combinar mais
/// prêmios — senão a maior parte dos números jamais poderia ser sorteada.
const DIGITOS_POR_PREMIO = 5;

export function premiosNecessarios(quantidadeNumeros: number): number {
  return Math.ceil(digitosDaRifa(quantidadeNumeros) / DIGITOS_POR_PREMIO);
}

/// Deriva o número vencedor dos prêmios da Loteria Federal, tomando os últimos
/// dígitos conforme o tamanho da rifa. É o método auditável: qualquer pessoa
/// confere o resultado no site da Caixa.
///
/// Os prêmios entram do menos significativo para o mais significativo: o 1º
/// prêmio ocupa as 5 casas finais, o 2º as 5 seguintes, e assim por diante.
/// Uma rifa de 10 milhões precisa de 7 casas, logo de 2 prêmios.
export function numeroVencedorPelaFederal(
  premios: string | string[],
  quantidadeNumeros: number,
): number {
  const lista = (Array.isArray(premios) ? premios : [premios])
    .map((premio) => premio.replace(/\D/g, ""))
    .filter((premio) => premio.length > 0);

  if (lista.length === 0) throw new ErroDeNegocio("Prêmio da Loteria Federal inválido");

  const casas = digitosDaRifa(quantidadeNumeros);
  const necessarios = premiosNecessarios(quantidadeNumeros);

  // Recusar é melhor que sortear errado: com prêmios de menos, os números altos
  // ficariam impossíveis de sair e a rifa seria injusta sem ninguém perceber.
  if (lista.length < necessarios) {
    throw new ErroDeNegocio(
      `Uma rifa de ${quantidadeNumeros.toLocaleString("pt-BR")} números precisa de ${necessarios} prêmios da Loteria Federal para que todo número possa ser sorteado; foram informados ${lista.length}.`,
    );
  }

  const combinado = lista
    .slice(0, necessarios)
    .map((premio) => premio.slice(-DIGITOS_POR_PREMIO).padStart(DIGITOS_POR_PREMIO, "0"))
    .reverse()
    .join("");

  const sufixo = combinado.slice(-casas).padStart(casas, "0");

  // BigInt porque 25 dígitos (5 prêmios) passam do inteiro seguro do JavaScript.
  // Rifas cujo tamanho não é potência de 10 (ex.: 500 números) podem gerar um
  // sufixo fora da faixa; o excedente volta ao início pelo resto da divisão.
  return Number(BigInt(sufixo) % BigInt(quantidadeNumeros));
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

/// Acima deste tamanho a grade de números não é mais enviada ao navegador nem
/// desenhada: 10 milhões de botões travam qualquer aparelho. A compra passa a
/// ser por quantidade, com o servidor sorteando os disponíveis.
export const LIMITE_GRADE_VISUAL = 2000;

/// Bloco de geração. Meio milhão por vez leva ~12s no Postgres e mantém cada
/// transação curta o bastante para não segurar conexão por minutos.
const BLOCO_GERACAO = 500_000;

/// Materializa os números que faltam, em blocos, retomando de onde parou.
/// Seguro para chamar de novo: `ON CONFLICT DO NOTHING` no par (rifaId, numero)
/// torna a repetição inofensiva se o servidor cair no meio.
export async function gerarNumerosPendentes(rifaId: string): Promise<number> {
  const rifa = await prisma.rifa.findUnique({
    where: { id: rifaId },
    select: { quantidadeNumeros: true, numerosGerados: true },
  });
  if (!rifa) throw new ErroDeNegocio("Rifa não encontrada");

  let gerados = rifa.numerosGerados;

  while (gerados < rifa.quantidadeNumeros) {
    const fim = Math.min(gerados + BLOCO_GERACAO, rifa.quantidadeNumeros);

    await prisma.$executeRaw`
      INSERT INTO "Numero" (id, "rifaId", numero, status)
      SELECT gen_random_uuid()::text, ${rifaId}, serie, 'DISPONIVEL'::"StatusNumero"
      FROM generate_series(${gerados}, ${fim - 1}) AS serie
      ON CONFLICT ("rifaId", numero) DO NOTHING
    `;

    gerados = fim;
    await prisma.rifa.update({ where: { id: rifaId }, data: { numerosGerados: gerados } });
  }

  return gerados;
}

/// Sorteia números livres sem varrer a tabela inteira. Em rifa grande e pouco
/// vendida, tentar candidatos aleatórios acerta quase sempre de primeira; só
/// quando sobra pouco número livre é que vale varrer pelo índice.
async function escolherNumerosDisponiveis(
  tx: Prisma.TransactionClient,
  rifaId: string,
  quantidadeNumeros: number,
  quantidade: number,
): Promise<number[]> {
  const escolhidos = new Set<number>();

  for (let tentativa = 0; tentativa < 3 && escolhidos.size < quantidade; tentativa++) {
    const faltam = quantidade - escolhidos.size;

    const candidatos = new Set<number>();
    const teto = Math.min(faltam * 5, quantidadeNumeros);
    while (candidatos.size < teto) candidatos.add(crypto.randomInt(quantidadeNumeros));

    const livres = await tx.numero.findMany({
      where: {
        rifaId,
        numero: { in: [...candidatos].filter((n) => !escolhidos.has(n)) },
        status: StatusNumero.DISPONIVEL,
      },
      select: { numero: true },
      take: faltam,
    });

    livres.forEach((livre) => escolhidos.add(livre.numero));
  }

  // Rifa quase esgotada: a amostragem aleatória erra demais, então varre a
  // partir de um ponto qualquer — dando a volta ao chegar no fim.
  if (escolhidos.size < quantidade) {
    const inicio = crypto.randomInt(quantidadeNumeros);

    for (const faixa of [{ gte: inicio }, { lt: inicio }]) {
      if (escolhidos.size >= quantidade) break;

      const livres = await tx.numero.findMany({
        where: {
          rifaId,
          status: StatusNumero.DISPONIVEL,
          // notIn é essencial: sem ele a varredura devolveria números que a
          // amostragem já achou, o `take` se esgotaria com repetidos e a compra
          // seria recusada por "faltam números" com estoque de sobra.
          numero: { ...faixa, notIn: [...escolhidos] },
        },
        select: { numero: true },
        orderBy: { numero: "asc" },
        take: quantidade - escolhidos.size,
      });

      livres.forEach((livre) => escolhidos.add(livre.numero));
    }
  }

  if (escolhidos.size < quantidade) {
    throw new ErroDeNegocio(
      escolhidos.size === 0
        ? "Não há mais números disponíveis nesta rifa"
        : `Restam apenas ${escolhidos.size} números disponíveis nesta rifa`,
    );
  }

  return [...escolhidos].slice(0, quantidade).sort((a, b) => a - b);
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
  /// Números escolhidos a dedo. Alternativa a `quantidade`.
  numeros?: number[];
  /// Quantidade a sortear entre os disponíveis. Alternativa a `numeros`.
  quantidade?: number;
  comprador: DadosComprador;
  codigoAfiliado?: string | null;
}): Promise<{
  compraId: string;
  codigo: string;
  valorTotal: Prisma.Decimal;
  expiraEm: Date;
  numeros: number[];
}> {
  const { rifaId, numeros, quantidade, comprador, codigoAfiliado } = params;

  if (Boolean(numeros) === Boolean(quantidade)) {
    throw new ErroDeNegocio("Informe os números escolhidos ou a quantidade a sortear");
  }

  await liberarReservasExpiradas(rifaId);

  const rifa = await prisma.rifa.findUnique({ where: { id: rifaId } });
  if (!rifa) throw new ErroDeNegocio("Rifa não encontrada");
  if (rifa.status !== "ABERTA") throw new ErroDeNegocio("Esta rifa não está aberta para vendas");

  const quantosNumeros = numeros?.length ?? quantidade ?? 0;
  if (quantosNumeros === 0) throw new ErroDeNegocio("Selecione ao menos um número");
  if (quantosNumeros > rifa.limiteNumerosPorCompra) {
    throw new ErroDeNegocio(`Máximo de ${rifa.limiteNumerosPorCompra} números por compra`);
  }

  if (numeros) {
    if (new Set(numeros).size !== numeros.length) {
      throw new ErroDeNegocio("Há números repetidos na seleção");
    }
    if (numeros.some((n) => !Number.isInteger(n) || n < 0 || n >= rifa.quantidadeNumeros)) {
      throw new ErroDeNegocio("Número fora da faixa desta rifa");
    }
  }

  const afiliado = codigoAfiliado
    ? await prisma.afiliado.findFirst({
        where: { codigo: codigoAfiliado, ativo: true, organizacaoId: rifa.organizacaoId },
      })
    : null;

  const valorTotal = multiplicar(rifa.precoPorNumero, quantosNumeros);
  const expiraEm = new Date(Date.now() + rifa.minutosParaPagar * 60_000);

  return prisma.$transaction(async (tx) => {
    // O sorteio acontece dentro da transação: entre escolher e reservar não há
    // brecha para outra compra levar o mesmo número.
    const numerosDaCompra =
      numeros ??
      (await escolherNumerosDisponiveis(tx, rifaId, rifa.quantidadeNumeros, quantosNumeros));

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
        quantidade: numerosDaCompra.length,
        valorTotal,
        expiraEm,
      },
    });

    // A compra existe antes da reserva para que status e dono do número sejam
    // gravados na mesma instrução: não há instante em que um número esteja
    // reservado sem compra. Se a contagem não bater, alguém levou um número no
    // meio do caminho e a transação inteira é desfeita.
    const reserva = await tx.numero.updateMany({
      where: { rifaId, numero: { in: numerosDaCompra }, status: StatusNumero.DISPONIVEL },
      data: { status: StatusNumero.RESERVADO, reservadoAte: expiraEm, compraId: compra.id },
    });

    if (reserva.count !== numerosDaCompra.length) {
      throw new ErroDeNegocio(
        "Um ou mais números escolhidos acabaram de ser reservados por outra pessoa. Atualize a página e escolha novamente.",
      );
    }

    return {
      compraId: compra.id,
      codigo: compra.codigo,
      valorTotal,
      expiraEm,
      numeros: numerosDaCompra,
    };
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

    // updateMany, não update: a compra pode não ter registro de pagamento —
    // o PIX falhou ao ser gerado, ou a organizadora recebeu o valor por fora e
    // está confirmando à mão. Dinheiro que entrou precisa ser reconhecido de
    // qualquer forma; `update` lançaria e desfaria a confirmação inteira.
    await tx.pagamento.updateMany({
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
