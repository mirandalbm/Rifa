/**
 * Atendimento de reembolso: chamado com protocolo, conversa e anexo.
 *
 * As regras de negócio estão em `shared/chamados.ts`; aqui ficam banco,
 * imagem e dinheiro. Três cuidados que valem para tudo abaixo:
 *
 * 1. **Quem decide é o índice.** Um chamado em andamento por pedido
 *    (`uq_chamados_pedido_em_andamento`) e protocolo que não repete
 *    (`uq_chamados_protocolo`) — nenhuma consulta "já existe?" antes.
 * 2. **Recorte por organização** em toda leitura do painel, e 404 (não 403)
 *    para chamado de outra organização ou de outro comprador.
 * 3. **O dinheiro volta pelo provedor**, para a conta que pagou, sempre que
 *    ele sabe devolver. Chave Pix informada no chamado é só para o caso
 *    sem provedor (venda do cambista).
 */
import { randomInt } from "node:crypto";
import sharp from "sharp";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Request } from "express";
import { db } from "../db";
import {
  buyers,
  campaigns,
  chamadoAnexos,
  chamadoMensagens,
  chamados,
  orders,
  organizations,
  users,
} from "@shared/schema";
import {
  ANEXO_MAX_BYTES,
  CHAMADOS_POR_DIA,
  bloqueioDaDisputa,
  bloqueioDoReembolso,
  destinatariosDoAviso,
  disputaLiberadaEm,
  problemaNaDisputa,
  gerarProtocolo,
  prazoDoEstorno,
  problemaNoPedido,
  type PedidoDeReembolso,
} from "@shared/chamados";
import { cpfValido, formatBRL, hideCpf, hidePhone } from "@shared/format";
import { podePedirReembolso } from "@shared/contaComprador";
import { calcularReembolso } from "@shared/reembolso";
import { clienteNoPainel } from "@shared/titularidade";
import { clienteVisivelSql, nomeNoPainelSql } from "./titularidade";
import { notify } from "../notifications";
import { publicUrl } from "./urls";
import { isUniqueViolation } from "../pgError";
import { getPlataforma } from "./settings";
import { hit } from "./antifraude";
import { adiadoEmSql, refundOrder } from "./orders";
import { orgOf } from "./orgs";
import { paymentProviderByName } from "../payments";
import { avisarDisputa, avisarReembolso, emSegundoPlano } from "./push";

export class ChamadoError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ChamadoError";
  }
}

const sortear = (max: number) => randomInt(0, max);

/* ------------------------------------------------------------------ *
 * ID do cliente
 * ------------------------------------------------------------------ */

// O ID do cliente mora em `codigoCliente.ts`; reexportado aqui porque as
// rotas do comprador já o importam deste serviço.
import { garantirCodigoCliente } from "./codigoCliente";
export { garantirCodigoCliente };

/* ------------------------------------------------------------------ *
 * Anexo
 * ------------------------------------------------------------------ */

/**
 * `data:image/…;base64,…` → JPEG limpo. Decodificar e regravar é a
 * verificação: arquivo que não é imagem falha aqui, e o que é imagem sai sem
 * metadado (a foto de celular carrega a localização de quem tirou).
 */
export async function processarAnexo(dataUrl: string): Promise<Buffer> {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl ?? "");
  if (!m) throw new ChamadoError("Envie uma imagem (foto ou print do bilhete).");
  const bruto = Buffer.from(m[2], "base64");
  if (bruto.length > ANEXO_MAX_BYTES) {
    throw new ChamadoError("A imagem passa de 5 MB. Envie um print menor.");
  }
  try {
    return await sharp(bruto, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new ChamadoError("Não consegui ler essa imagem. Envie um print em JPG ou PNG.");
  }
}

/* ------------------------------------------------------------------ *
 * Lado do comprador
 * ------------------------------------------------------------------ */

export interface CompradorLogado {
  id: string;
  phone: string;
  /** Telefone provado pelo WhatsApp; sem isso, só os pedidos feitos na conta. */
  confirmado: boolean;
}

/** A sessão do comprador precisa ter um cadastro de verdade por trás. */
export function exigirComprador(req: Request): CompradorLogado {
  const b = req.session.buyer;
  if (!b?.id) {
    throw new ChamadoError("Entre na sua conta em Minhas cotas para continuar.", 401);
  }
  return { id: b.id, phone: b.phone, confirmado: b.confirmado === true };
}

export async function abrirChamado(
  comprador: CompradorLogado,
  entrada: PedidoDeReembolso & { orderCode: number; anexo: string },
) {
  const problema = problemaNoPedido(entrada);
  if (problema) throw new ChamadoError(problema);

  // O pedido tem de ser deste comprador: a sessão vale mais que o número
  // digitado. Pedido de outro comprador "não existe" (404).
  const [linha] = await db
    .select({
      order: orders,
      campaignStatus: campaigns.status,
      sorteioEm: campaigns.drawAt,
      adiadoEm: adiadoEmSql,
      organizationId: campaigns.organizationId,
      cpf: buyers.cpf,
      telefoneConfirmadoEm: buyers.telefoneConfirmadoEm,
      comprasVinculadasEm: buyers.comprasVinculadasEm,
    })
    .from(orders)
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .where(and(eq(orders.code, entrada.orderCode), eq(orders.buyerId, comprador.id)));
  // Compra feita fora da conta só vira reembolso com a titularidade provada
  // (`podePedirReembolso`): ver não basta, dinheiro sai.
  if (
    !linha ||
    !podePedirReembolso(linha.order, {
      telefoneConfirmado: comprador.confirmado || Boolean(linha.telefoneConfirmadoEm),
      comprasVinculadasEm: linha.comprasVinculadasEm,
    })
  ) {
    throw new ChamadoError("Pedido não encontrado na sua conta.", 404);
  }

  const plataforma = await getPlataforma();
  const agora = new Date();
  const bloqueio = bloqueioDoReembolso({
    estornoLigado: plataforma.estornoManual,
    statusPedido: linha.order.status,
    statusRifa: linha.campaignStatus,
    sorteioEm: linha.sorteioEm,
    agora,
  });
  if (bloqueio) throw new ChamadoError(bloqueio, 409);
  // Cota de bônus não custou nada: não há o que devolver (regulamento).
  if (linha.order.method === "bonus") throw new ChamadoError("Cota de bônus não tem reembolso.", 409);

  // Quanto volta é decidido agora: é a data do pedido que conta os 7 dias do
  // arrependimento (shared/reembolso.ts). Fica gravado no chamado.
  const calculo = calcularReembolso({
    pagoCents: linha.order.amountCents,
    vendaOnline: !linha.order.sellerId && linha.order.method === "pix_online",
    compradoEm: linha.order.paidAt ?? linha.order.createdAt,
    pedidoEm: agora,
    taxaPct: plataforma.taxaReembolsoPct,
    adiadoEm: linha.adiadoEm,
  });

  // Erro de preenchimento (print faltando, arquivo que não é imagem) não
  // gasta a cota do dia: senão quem erra o formulário duas vezes fica 24 h
  // sem poder pedir.
  const imagem = await processarAnexo(entrada.anexo);

  // Daqui em diante conta, mesmo quando recusa: pedido falso vem em série, e
  // o CPF errado precisa contar — senão dá para chutar CPF sem limite.
  const limite = await hit(`chamado:${comprador.id}`, 24 * 60, CHAMADOS_POR_DIA);
  if (limite.excedeu) {
    throw new ChamadoError(
      `Você já abriu ${CHAMADOS_POR_DIA} pedidos de reembolso nas últimas 24 horas. Acompanhe os que estão abertos.`,
      429,
    );
  }

  // O CPF informado tem de bater com o do cadastro, quando o cadastro tem.
  const cpf = entrada.cpf.replace(/\D/g, "");
  if (linha.cpf && linha.cpf.replace(/\D/g, "") !== cpf) {
    throw new ChamadoError("O CPF não confere com o cadastro desta compra.", 403);
  }

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      const chamado = await db.transaction(async (tx) => {
        const [chamado] = await tx
          .insert(chamados)
          .values({
            protocolo: gerarProtocolo(new Date(), sortear),
            organizationId: linha.organizationId,
            orderId: linha.order.id,
            buyerId: comprador.id,
            motivo: entrada.motivo.trim(),
            pixChave: entrada.pixChave?.trim() || null,
            tipoReembolso: calculo.tipo,
            taxaPct: calculo.taxaPct,
            taxaCents: calculo.taxaCents,
            devolverCents: calculo.devolverCents,
          })
          .returning();
        const [anexo] = await tx
          .insert(chamadoAnexos)
          .values({ chamadoId: chamado.id, mime: "image/jpeg", bytes: imagem, tamanho: imagem.length })
          .returning({ id: chamadoAnexos.id });
        await tx.insert(chamadoMensagens).values({
          chamadoId: chamado.id,
          autor: "comprador",
          texto: entrada.motivo.trim(),
          anexoId: anexo.id,
        });
        // Primeira vez que o CPF aparece: fica no cadastro, e o próximo
        // pedido de reembolso precisa bater com ele.
        if (!linha.cpf) {
          await tx.update(buyers).set({ cpf }).where(eq(buyers.id, comprador.id));
        }
        return chamado;
      });
      await avisarChamadoNovo({
        chamadoId: chamado.id,
        protocolo: chamado.protocolo,
        organizationId: linha.organizationId,
        campaignId: linha.order.campaignId,
        valorCents: linha.order.amountCents,
        buyerId: comprador.id,
      });
      return chamado;
    } catch (err) {
      if (isUniqueViolation(err, "uq_chamados_pedido_em_andamento")) {
        throw new ChamadoError("Já existe um pedido de reembolso em andamento para esta compra.", 409);
      }
      if (!isUniqueViolation(err, "uq_chamados_protocolo")) throw err;
    }
  }
  throw new ChamadoError("Não foi possível gerar o protocolo. Tente de novo.", 500);
}

/**
 * Avisa a organização pelo WhatsApp que chegou pedido de reembolso. Falha de
 * envio nunca desfaz o chamado — ele já está gravado e aparece no contador do
 * menu; o aviso é o atalho, não a garantia.
 */
async function avisarChamadoNovo(c: {
  chamadoId: string;
  protocolo: string;
  organizationId: string;
  campaignId: string;
  valorCents: number;
  buyerId: string;
}) {
  try {
    const [org] = await db
      .select({ avisoTelefone: organizations.avisoTelefone })
      .from(organizations)
      .where(eq(organizations.id, c.organizationId));
    const organizadores = await db
      .select({ phone: users.phone })
      .from(users)
      .where(
        and(
          eq(users.organizationId, c.organizationId),
          eq(users.role, "organizer"),
          eq(users.active, true),
        ),
      );
    const para = destinatariosDoAviso(
      org?.avisoTelefone,
      organizadores.map((u) => u.phone),
    );
    if (!para.length) {
      console.warn(`[chamados] ${c.protocolo}: organização sem WhatsApp para o aviso`);
      return;
    }
    const [camp] = await db
      .select({ title: campaigns.title })
      .from(campaigns)
      .where(eq(campaigns.id, c.campaignId));
    const cliente = (await garantirCodigoCliente(c.buyerId)) ?? "sem ID";
    for (const to of para) {
      await notify({
        to,
        template: "chamado_novo",
        params: {
          rifa: camp?.title ?? "",
          protocolo: c.protocolo,
          cliente,
          valor: formatBRL(c.valorCents),
          link: publicUrl("/admin/atendimento"),
        },
        dedupeKey: `chamado:${c.chamadoId}:aviso:${to}`,
      });
    }
  } catch (err) {
    console.error(`[chamados] aviso do ${c.protocolo} não enviado:`, err);
  }
}

export async function chamadosDoComprador(buyerId: string) {
  return db
    .select({
      id: chamados.id,
      protocolo: chamados.protocolo,
      status: chamados.status,
      pedido: orders.code,
      rifa: campaigns.title,
      prazoEstornoAte: chamados.prazoEstornoAte,
      disputa: chamados.disputa,
      createdAt: chamados.createdAt,
    })
    .from(chamados)
    .innerJoin(orders, eq(orders.id, chamados.orderId))
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .where(eq(chamados.buyerId, buyerId))
    .orderBy(desc(chamados.createdAt));
}

/* ------------------------------------------------------------------ *
 * Conversa (os dois lados)
 * ------------------------------------------------------------------ */

async function mensagensDo(chamadoId: string) {
  return db
    .select({
      id: chamadoMensagens.id,
      autor: chamadoMensagens.autor,
      nome: users.name,
      texto: chamadoMensagens.texto,
      anexoId: chamadoMensagens.anexoId,
      createdAt: chamadoMensagens.createdAt,
    })
    .from(chamadoMensagens)
    .leftJoin(users, eq(users.id, chamadoMensagens.userId))
    .where(eq(chamadoMensagens.chamadoId, chamadoId))
    .orderBy(chamadoMensagens.createdAt);
}

/** Visão do comprador: só o que é dele, e nunca o nome de quem atendeu. */
export async function chamadoDoComprador(buyerId: string, id: string) {
  const [c] = await db
    .select({ chamado: chamados, pedido: orders.code, rifa: campaigns.title })
    .from(chamados)
    .innerJoin(orders, eq(orders.id, chamados.orderId))
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .where(and(eq(chamados.id, id), eq(chamados.buyerId, buyerId)));
  if (!c) throw new ChamadoError("Chamado não encontrado.", 404);
  const mensagens = (await mensagensDo(id)).map((m) => ({ ...m, nome: NOME_PARA_O_COMPRADOR[m.autor] ?? "Atendimento" }));
  const rifa = await rifaDoChamado(c.chamado.orderId);
  const bloqueio = bloqueioDaDisputa({
    estornoLigado: (await getPlataforma()).estornoManual,
    status: c.chamado.status,
    disputa: c.chamado.disputa,
    abertoEm: c.chamado.createdAt,
    concluidoEm: c.chamado.concluidoEm,
    statusRifa: rifa.status,
    sorteioEm: rifa.drawAt,
  });
  return {
    id: c.chamado.id,
    protocolo: c.chamado.protocolo,
    status: c.chamado.status,
    pedido: c.pedido,
    rifa: c.rifa,
    decisao: c.chamado.decisao,
    prazoEstornoAte: c.chamado.prazoEstornoAte,
    tipoReembolso: c.chamado.tipoReembolso,
    taxaPct: c.chamado.taxaPct,
    taxaCents: c.chamado.taxaCents,
    devolverCents: c.chamado.devolverCents,
    disputa: c.chamado.disputa,
    disputaDecisao: c.chamado.disputaDecisao,
    // A tela mostra o botão com a mesma régua que o servidor aplica.
    podeDisputar: bloqueio === null,
    disputaBloqueio: c.chamado.disputa ? null : bloqueio,
    disputaLiberadaEm: c.chamado.status === "aberto" ? disputaLiberadaEm(c.chamado.createdAt) : null,
    mensagens,
  };
}

/** Quem escreveu, como o comprador lê: nunca o nome de quem atendeu. */
const NOME_PARA_O_COMPRADOR: Record<string, string> = {
  comprador: "Você",
  organizacao: "Atendimento",
  plataforma: "Plataforma",
};

async function rifaDoChamado(orderId: string) {
  const [r] = await db
    .select({ status: campaigns.status, drawAt: campaigns.drawAt })
    .from(orders)
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .where(eq(orders.id, orderId));
  return r ?? { status: "drawn", drawAt: null };
}

/** Chamado encerrado para conversa: recusado ou devolvido, sem disputa aberta. */
function encerrado(c: { status: string; disputa: string | null }) {
  return (c.status === "recusado" || c.status === "estornado") && c.disputa !== "aberta";
}

async function novaMensagem(p: {
  chamadoId: string;
  autor: "comprador" | "organizacao" | "plataforma";
  userId?: string;
  texto: string;
  anexo?: string;
}) {
  const texto = p.texto?.trim() ?? "";
  if (!texto && !p.anexo) throw new ChamadoError("Escreva a mensagem.");
  if (texto.length > 2000) throw new ChamadoError("A mensagem pode ter no máximo 2000 caracteres.");
  const imagem = p.anexo ? await processarAnexo(p.anexo) : null;

  return db.transaction(async (tx) => {
    let anexoId: string | null = null;
    if (imagem) {
      const [a] = await tx
        .insert(chamadoAnexos)
        .values({ chamadoId: p.chamadoId, mime: "image/jpeg", bytes: imagem, tamanho: imagem.length })
        .returning({ id: chamadoAnexos.id });
      anexoId = a.id;
    }
    const [m] = await tx
      .insert(chamadoMensagens)
      .values({
        chamadoId: p.chamadoId,
        autor: p.autor,
        userId: p.userId ?? null,
        texto: texto || "(imagem)",
        anexoId,
      })
      .returning();
    return m;
  });
}

export async function mensagemDoComprador(
  comprador: CompradorLogado,
  id: string,
  entrada: { texto: string; anexo?: string },
) {
  const [c] = await db
    .select({ status: chamados.status, disputa: chamados.disputa })
    .from(chamados)
    .where(and(eq(chamados.id, id), eq(chamados.buyerId, comprador.id)));
  if (!c) throw new ChamadoError("Chamado não encontrado.", 404);
  if (encerrado(c)) {
    throw new ChamadoError("Este chamado já foi encerrado.", 409);
  }
  const limite = await hit(`chamado-msg:${comprador.id}`, 60, 30);
  if (limite.excedeu) throw new ChamadoError("Muitas mensagens em pouco tempo. Aguarde a resposta.", 429);
  return novaMensagem({ chamadoId: id, autor: "comprador", texto: entrada.texto, anexo: entrada.anexo });
}

/** O anexo, para quem pode ver: o dono do chamado ou o painel no recorte. */
export async function anexoPara(
  anexoId: string,
  quem: { buyerId?: string; req?: Request },
): Promise<{ mime: string; bytes: Buffer }> {
  const [a] = await db
    .select({ anexo: chamadoAnexos, buyerId: chamados.buyerId, organizationId: chamados.organizationId })
    .from(chamadoAnexos)
    .innerJoin(chamados, eq(chamados.id, chamadoAnexos.chamadoId))
    .where(eq(chamadoAnexos.id, anexoId));
  const org = quem.req ? orgOf(quem.req) : null;
  const pode =
    a &&
    ((quem.buyerId && a.buyerId === quem.buyerId) ||
      (quem.req && (!org || a.organizationId === org)));
  if (!pode) throw new ChamadoError("Anexo não encontrado.", 404);
  return { mime: a.anexo.mime, bytes: a.anexo.bytes };
}

/* ------------------------------------------------------------------ *
 * Lado da organização (painel)
 * ------------------------------------------------------------------ */

export async function listarChamados(req: Request, status?: string) {
  const org = orgOf(req);
  const filtros = [
    org ? eq(chamados.organizationId, org) : undefined,
    status === "disputa"
      ? eq(chamados.disputa, "aberta")
      : status && ["aberto", "aprovado", "recusado", "estornado"].includes(status)
        ? eq(chamados.status, status as "aberto")
        : undefined,
  ].filter(Boolean);
  return db
    .select({
      id: chamados.id,
      protocolo: chamados.protocolo,
      status: chamados.status,
      pedido: orders.code,
      valorCents: orders.amountCents,
      rifa: campaigns.title,
      cliente: buyers.codigo,
      // Cliente da plataforma aparece só pelo ID (shared/titularidade.ts).
      nome: sql<string>`${nomeNoPainelSql(clienteVisivelSql(org, "orders"), "buyers")}`,
      prazoEstornoAte: chamados.prazoEstornoAte,
      disputa: chamados.disputa,
      createdAt: chamados.createdAt,
      organizacao: organizations.name,
    })
    .from(chamados)
    .innerJoin(orders, eq(orders.id, chamados.orderId))
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .innerJoin(buyers, eq(buyers.id, chamados.buyerId))
    .innerJoin(organizations, eq(organizations.id, chamados.organizationId))
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(desc(chamados.createdAt))
    .limit(300);
}

/** Confere o recorte e devolve o chamado. Fora do recorte, não existe. */
async function chamadoNoRecorte(req: Request, id: string) {
  const [c] = await db.select().from(chamados).where(eq(chamados.id, id));
  const org = orgOf(req);
  if (!c || (org && c.organizationId !== org)) throw new ChamadoError("Chamado não encontrado.", 404);
  return c;
}

export async function detalheDoChamado(req: Request, id: string) {
  const c = await chamadoNoRecorte(req, id);
  const [ctx] = await db
    .select({
      pedido: orders,
      rifa: campaigns.title,
      rifaStatus: campaigns.status,
      drawAt: campaigns.drawAt,
      cliente: buyers,
    })
    .from(orders)
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .where(eq(orders.id, c.orderId));
  // Outros chamados do mesmo cliente: pedido falso costuma vir de quem já
  // pediu antes. Só os desta organização — o histórico do cliente com o
  // vizinho não é da conta dela.
  const org = orgOf(req);
  const historico = await db
    .select({ protocolo: chamados.protocolo, status: chamados.status })
    .from(chamados)
    .where(
      and(
        eq(chamados.buyerId, c.buyerId),
        sql`${chamados.id} <> ${c.id}`,
        org ? eq(chamados.organizationId, org) : undefined,
      ),
    );
  const cliente = clienteNoPainel(
    {
      nome: ctx.cliente.name,
      telefone: hidePhone(ctx.cliente.phone),
      cpf: ctx.cliente.cpf ? hideCpf(ctx.cliente.cpf) : null,
      codigo: ctx.cliente.codigo,
    },
    { daPlataforma: !org, vendaDeCambista: Boolean(ctx.pedido.sellerId), ganhador: false },
  );
  return {
    chamado: c,
    pedido: {
      code: ctx.pedido.code,
      status: ctx.pedido.status,
      valorCents: ctx.pedido.amountCents,
      quantidade: ctx.pedido.quantity,
      pagoEm: ctx.pedido.paidAt,
      provedor: ctx.pedido.pspProvider,
      rifa: ctx.rifa,
      rifaStatus: ctx.rifaStatus,
    },
    cliente: {
      ...cliente,
      cpfConfirmado: Boolean(ctx.cliente.cpf && cpfValido(ctx.cliente.cpf)),
    },
    historico,
    // Para a organização, quem decide a disputa é "Plataforma", não uma pessoa.
    mensagens: (await mensagensDo(c.id)).map((m) => (org && m.autor === "plataforma" ? { ...m, nome: "Plataforma" } : m)),
    sorteioEm: ctx.drawAt,
  };
}

export async function respostaDaOrganizacao(
  req: Request,
  id: string,
  entrada: { texto: string; anexo?: string },
) {
  const c = await chamadoNoRecorte(req, id);
  if (encerrado(c)) {
    throw new ChamadoError("Este chamado já foi encerrado.", 409);
  }
  return novaMensagem({
    chamadoId: c.id,
    // A plataforma escrevendo num chamado em disputa fala como plataforma.
    autor: !orgOf(req) && c.disputa === "aberta" ? "plataforma" : "organizacao",
    userId: req.user!.id,
    texto: entrada.texto,
    anexo: entrada.anexo,
  });
}

/**
 * Conclui o chamado: aprova (e o prazo de devolução é calculado com o prazo
 * da organização) ou recusa. O `UPDATE` condicional impede decidir duas vezes.
 */
export async function concluirChamado(
  req: Request,
  id: string,
  entrada: { decisao: "aprovado" | "recusado"; resposta: string },
) {
  const c = await chamadoNoRecorte(req, id);
  if (entrada.decisao !== "aprovado" && entrada.decisao !== "recusado") {
    throw new ChamadoError("Escolha aprovar ou recusar.");
  }
  const resposta = entrada.resposta?.trim() ?? "";
  if (resposta.length < 5) throw new ChamadoError("Escreva a resposta ao cliente.");

  const [org] = await db
    .select({ dias: organizations.prazoEstornoDias })
    .from(organizations)
    .where(eq(organizations.id, c.organizationId));
  const agora = new Date();

  const [feito] = await db
    .update(chamados)
    .set({
      status: entrada.decisao,
      decisao: resposta,
      concluidoEm: agora,
      concluidoPor: req.user!.id,
      prazoEstornoAte: entrada.decisao === "aprovado" ? prazoDoEstorno(agora, org?.dias ?? 7) : null,
    })
    // Em disputa, quem decide é a plataforma (`decidirDisputa`).
    .where(and(eq(chamados.id, c.id), eq(chamados.status, "aberto"), isNull(chamados.disputa)))
    .returning();
  if (!feito) {
    throw new ChamadoError(
      c.disputa ? "Este chamado está em disputa: a decisão é da plataforma." : "Este chamado já foi decidido.",
      409,
    );
  }

  await novaMensagem({
    chamadoId: c.id,
    autor: "organizacao",
    userId: req.user!.id,
    texto:
      entrada.decisao === "aprovado"
        ? `Reembolso aprovado. Protocolo ${feito.protocolo}. ${resposta}`
        : `Reembolso recusado. ${resposta}`,
  });
  emSegundoPlano(avisarReembolso(feito.id), "reembolso respondido");
  return feito;
}

/**
 * Executa o reembolso aprovado. O chamado é "tomado" antes (aprovado →
 * estornado, condicional), para dois cliques não devolverem duas vezes.
 *
 * Com provedor, o dinheiro volta para a conta que pagou — e o sistema desfaz
 * cotas, comissão e taxa. Venda do cambista não tem provedor: o sistema
 * desfaz o registro e a devolução é feita à mão (caixa ou Pix informado).
 */
export async function executarEstorno(req: Request, id: string) {
  // O recorte vem antes da chave: o chamado do vizinho é 404, sempre.
  const c = await chamadoNoRecorte(req, id);
  if (!(await getPlataforma()).estornoManual) {
    throw new ChamadoError("O estorno está desligado nas configurações da plataforma.", 403);
  }
  const [pedido] = await db.select().from(orders).where(eq(orders.id, c.orderId));

  const [tomado] = await db
    .update(chamados)
    .set({ status: "estornado", estornadoEm: new Date() })
    .where(and(eq(chamados.id, c.id), eq(chamados.status, "aprovado")))
    .returning();
  if (!tomado) {
    throw new ChamadoError(
      c.status === "estornado" ? "Este reembolso já foi feito." : "Só chamado aprovado pode ser estornado.",
      409,
    );
  }

  // O valor gravado quando o comprador pediu (shared/reembolso.ts). Chamado
  // anterior à regra não tem valor: devolução integral.
  const pago = pedido?.amountCents ?? 0;
  const devolver = c.devolverCents ?? pago;
  const taxa = c.taxaCents ?? 0;

  let forma = "manual";
  try {
    if (pedido?.pspProvider && pedido.pspChargeId) {
      const provider = paymentProviderByName(pedido.pspProvider);
      if (provider.refund) {
        // Sem valor, o provedor devolve a cobrança inteira. No carrinho num
        // Pix só a cobrança é de várias rifas: o valor vai sempre explícito.
        await provider.refund(pedido.pspChargeId, devolver < pago || pedido.carrinhoId ? devolver : undefined);
        forma = pedido.pspProvider;
      }
    }
  } catch (err) {
    // Provedor recusou: nada foi devolvido, então o chamado volta a aprovado.
    await db.update(chamados).set({ status: "aprovado", estornadoEm: null }).where(eq(chamados.id, c.id));
    throw new ChamadoError(`O provedor recusou a devolução: ${(err as Error).message}`, 502);
  }

  // Desfaz no sistema. Idempotente: se o webhook do provedor chegar antes,
  // este passo não faz nada.
  const r = await refundOrder(c.orderId);
  await db.update(chamados).set({ formaDevolucao: forma }).where(eq(chamados.id, c.id));
  await novaMensagem({
    chamadoId: c.id,
    autor: "organizacao",
    userId: req.user!.id,
    texto:
      (forma === "manual"
        ? `Reembolso registrado (protocolo ${tomado.protocolo}): ${formatBRL(devolver)} devolvidos pela organização${c.pixChave ? " na chave Pix informada" : ""}.`
        : `Reembolso feito (protocolo ${tomado.protocolo}): ${formatBRL(devolver)} voltam para a mesma conta que pagou o Pix.`) +
      (taxa > 0 ? ` Taxa administrativa retida: ${formatBRL(taxa)} (${c.taxaPct}%).` : ""),
  });
  return { chamado: { ...tomado, formaDevolucao: forma }, refund: r, devolverCents: devolver, taxaCents: taxa };
}

/** Quantos chamados abertos, para o número no menu. */
export async function chamadosAbertos(req: Request): Promise<number> {
  const org = orgOf(req);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chamados)
    .where(
      org
        ? and(eq(chamados.organizationId, org), inArray(chamados.status, ["aberto", "aprovado"]))
        : inArray(chamados.status, ["aberto", "aprovado"]),
    );
  return r?.n ?? 0;
}

/* ------------------------------------------------------------------ *
 * Disputa com a plataforma
 * ------------------------------------------------------------------ */

/**
 * O comprador leva o chamado à plataforma: recusado (até 7 dias depois) ou
 * sem resposta da organização (depois de 3 dias). O `UPDATE` condicional
 * (`disputa IS NULL`) faz dela uma por chamado, e o índice único parcial
 * impede que corra junto com outro chamado do mesmo pedido.
 */
export async function abrirDisputa(comprador: CompradorLogado, id: string, motivo: string) {
  const [c] = await db
    .select()
    .from(chamados)
    .where(and(eq(chamados.id, id), eq(chamados.buyerId, comprador.id)));
  if (!c) throw new ChamadoError("Chamado não encontrado.", 404);
  const problema = problemaNaDisputa(motivo);
  if (problema) throw new ChamadoError(problema);
  const rifa = await rifaDoChamado(c.orderId);
  const bloqueio = bloqueioDaDisputa({
    estornoLigado: (await getPlataforma()).estornoManual,
    status: c.status,
    disputa: c.disputa,
    abertoEm: c.createdAt,
    concluidoEm: c.concluidoEm,
    statusRifa: rifa.status,
    sorteioEm: rifa.drawAt,
  });
  if (bloqueio) throw new ChamadoError(bloqueio, 409);

  const texto = motivo.trim();
  let feito;
  try {
    [feito] = await db
      .update(chamados)
      .set({ disputa: "aberta", disputaMotivo: texto, disputaAbertaEm: new Date() })
      .where(
        and(
          eq(chamados.id, c.id),
          isNull(chamados.disputa),
          // A organização pode ter decidido no meio do caminho: só vale o
          // estado que a régua conferiu.
          eq(chamados.status, c.status),
        ),
      )
      .returning();
  } catch (err) {
    if (isUniqueViolation(err, "uq_chamados_pedido_em_andamento")) {
      throw new ChamadoError("Já existe outro pedido de reembolso em andamento para esta compra.", 409);
    }
    throw err;
  }
  if (!feito) throw new ChamadoError("Este chamado mudou enquanto você escrevia. Abra de novo.", 409);
  await novaMensagem({ chamadoId: c.id, autor: "comprador", texto: `Levei o caso à plataforma: ${texto}` });
  return feito;
}

/** O pedido foi premiado (sorteio ou cota premiada)? Então não há devolução. */
async function pedidoPremiado(orderId: string) {
  const r = await db.execute(sql`
    select exists (select 1 from draws where winner_order_id = ${orderId}::uuid)
        or exists (select 1 from prized_quotas where claimed_by_order_id = ${orderId}::uuid) as premiado`);
  return Boolean((r.rows[0] as { premiado: boolean }).premiado);
}

/**
 * A palavra final, do administrador geral. Procedente: o chamado vira
 * aprovado, com o prazo de devolução da organização contado de agora, e o
 * estorno segue o caminho de sempre (`executarEstorno`). Improcedente: fica
 * recusado. Condicional em `disputa = 'aberta'`: dois cliques, uma decisão.
 */
export async function decidirDisputa(
  req: Request,
  id: string,
  entrada: { resultado: "procedente" | "improcedente"; decisao: string },
) {
  if (orgOf(req)) throw new ChamadoError("A disputa é decidida pela plataforma.", 403);
  const c = await chamadoNoRecorte(req, id);
  if (entrada.resultado !== "procedente" && entrada.resultado !== "improcedente") {
    throw new ChamadoError("Escolha procedente ou improcedente.");
  }
  const decisao = entrada.decisao?.trim() ?? "";
  if (decisao.length < 10) throw new ChamadoError("Explique a decisão: ela vai para o comprador e para a organização.");
  if (decisao.length > 2000) throw new ChamadoError("A decisão pode ter no máximo 2000 caracteres.");
  if (c.disputa !== "aberta") throw new ChamadoError("Este chamado não está em disputa.", 409);
  // Quem ganhou o prêmio não recebe também o dinheiro de volta.
  if (entrada.resultado === "procedente" && (await pedidoPremiado(c.orderId))) {
    throw new ChamadoError("Este pedido foi premiado: a disputa não pode ser procedente.", 409);
  }

  const [org] = await db
    .select({ dias: organizations.prazoEstornoDias })
    .from(organizations)
    .where(eq(organizations.id, c.organizationId));
  const agora = new Date();
  const procedente = entrada.resultado === "procedente";

  let feito;
  try {
    [feito] = await db
      .update(chamados)
      .set({
        disputa: entrada.resultado,
        disputaDecisao: decisao,
        disputaDecididaEm: agora,
        disputaDecididaPor: req.user!.id,
        status: procedente ? "aprovado" : "recusado",
        decisao: procedente ? decisao : sql`coalesce(${chamados.decisao}, ${decisao})`,
        concluidoEm: procedente ? agora : sql`coalesce(${chamados.concluidoEm}, ${agora})`,
        concluidoPor: procedente ? req.user!.id : sql`coalesce(${chamados.concluidoPor}, ${req.user!.id}::uuid)`,
        prazoEstornoAte: procedente ? prazoDoEstorno(agora, org?.dias ?? 7) : null,
      })
      .where(and(eq(chamados.id, c.id), eq(chamados.disputa, "aberta")))
      .returning();
  } catch (err) {
    if (isUniqueViolation(err, "uq_chamados_pedido_em_andamento")) {
      throw new ChamadoError("Há outro pedido de reembolso em andamento para esta compra.", 409);
    }
    throw err;
  }
  if (!feito) throw new ChamadoError("Esta disputa já foi decidida.", 409);

  await novaMensagem({
    chamadoId: c.id,
    autor: "plataforma",
    userId: req.user!.id,
    texto: procedente
      ? `A plataforma deu razão ao comprador: reembolso aprovado (protocolo ${feito.protocolo}). ${decisao}`
      : `A plataforma manteve a recusa. ${decisao}`,
  });
  emSegundoPlano(avisarDisputa(feito.id), "disputa decidida");
  return feito;
}

/** Disputas esperando a plataforma, para o número no menu. */
export async function disputasAbertas(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chamados)
    .where(eq(chamados.disputa, "aberta"));
  return r?.n ?? 0;
}
