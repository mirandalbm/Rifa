/**
 * Assistente de IA (Chatbase): a conversa passa por aqui.
 *
 * O navegador manda o texto para `/api/ia/mensagens`; este serviço confere
 * quem é (sessão), se o assistente está ligado para aquele papel, barra dado
 * pessoal de cliente, conta a tentativa, fala com o Chatbase com a chave do
 * servidor e grava o uso (os créditos que o Chatbase diz ter gasto) — uma
 * linha por resposta, pela chave da mensagem.
 *
 * O texto da conversa não é guardado aqui: mora no Chatbase e é lido pela API
 * quando a coluna abre. Daqui só sai o id da conversa de cada pessoa.
 */
import { ehUuid } from "@shared/uuid";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import type { Request } from "express";
import { db } from "../db";
import { affiliates, iaAcoes, iaConversas, iaUso } from "@shared/schema";
import {
  IA_JANELA_MIN,
  IA_MENSAGENS_POR_JANELA,
  comContexto,
  idDaIA,
  normalizarParaChecar,
  problemaNaMensagemDaIA,
  quemTemIA,
  titularDaIA,
  type ConfigIA,
  type MensagemDaIA,
  type SessaoDaIA,
  type TitularDaIA,
} from "@shared/ia";
import { getPlataforma } from "./settings";
import { hit } from "./antifraude";
import { ChatbaseError, ClienteChatbase, baseDoChatbase, chaveDoChatbase } from "./chatbase";
import { CobrancaIAError, debitarUso, exigirSaldo, pagante, pedirPagamento, resumoDaCobranca } from "./iaCobranca";
import type { PagamentoIAPublico, ResumoCobrancaIA } from "@shared/iaCobranca";
import {
  ACAO_PENDENTE_MIN,
  ENTRADA_DA_ACAO_MAX,
  RODADAS_DE_ACAO_MAX,
  acaoPeloNome,
  resultadoSemDadoPessoal,
  validarEntrada,
  type AcaoPendentePublica,
  type ChamadaDeAcao,
  type EntradaDaAcao,
  type NomeDaAcao,
  type SaidaDaAcao,
} from "@shared/iaAcoes";
import { AcaoRecusada, executarGravacao, executarLeitura, prepararGravacao, quemUsa } from "./iaAcoes";
import type { RespostaDoChatbase } from "./chatbase";
import { lerSugestoes, pedidoDeSugestao, type DadosParaSugerir, type TipoDeSugestao } from "@shared/sugestaoIA";
import { lerAnuncios, pedidoDeAnuncios, type TextosDeAnuncio } from "@shared/marketingIA";

export class IAError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "IAError";
  }
}

/** Para a prova: troca o cliente do Chatbase (e volta ao padrão com `null`). */
let clienteDeTeste: ClienteChatbase | null = null;
export function trocarClienteDoChatbase(c: ClienteChatbase | null) {
  clienteDeTeste = c;
}

function cliente(chave: string): ClienteChatbase {
  return clienteDeTeste ?? new ClienteChatbase({ chave, base: baseDoChatbase() });
}

interface Contexto {
  config: ConfigIA;
  titular: TitularDaIA;
  chave: string;
  userId: string;
}

/**
 * Quem está falando e se pode falar. Tudo sai da sessão; nada do navegador.
 * Desligado, sem chave no servidor ou papel sem direito: `null`.
 */
async function contextoDe(req: Request): Promise<Contexto | null> {
  const u = req.user;
  if (!u) return null;
  const config = (await getPlataforma()).assistenteIA;
  const chave = chaveDoChatbase();
  if (!chave || !quemTemIA(u.role, config)) return null;
  const titular = titularDaIA(u);
  if (!titular) return null;
  // Afiliado só com o cadastro ativo — a mesma porta das Mensagens.
  if (titular.tipo === "afiliado") {
    const [a] = await db.select({ status: affiliates.status }).from(affiliates).where(eq(affiliates.id, titular.id));
    if (a?.status !== "active") return null;
  }
  return { config, titular, chave, userId: u.id };
}

async function exigirContexto(req: Request): Promise<Contexto> {
  const c = await contextoDe(req);
  // 404 e não 403: para quem não tem, o assistente simplesmente não existe.
  if (!c) throw new IAError("O assistente não está disponível.", 404);
  return c;
}

export async function sessaoDaIA(req: Request): Promise<SessaoDaIA> {
  const c = await contextoDe(req);
  return { ligado: c !== null, cobrado: c !== null && pagante(c.titular) !== null };
}

/** O plano de quem paga (organização ou afiliado): situação, saldo, preços e o Pix em aberto. */
export async function contaDaIA(req: Request): Promise<ResumoCobrancaIA> {
  const c = await exigirContexto(req);
  return resumoDaCobranca(pagante(c.titular), c.config.cobranca);
}

/** Gera o Pix da assinatura ou de um pacote. O master não paga (400). */
export async function pagarIA(req: Request, corpo: Record<string, unknown>): Promise<PagamentoIAPublico> {
  const c = await exigirContexto(req);
  const p = pagante(c.titular);
  if (!p) throw new IAError("O assistente da plataforma não é cobrado.", 400);
  return pedirPagamento(p, c.userId, c.config.cobranca, corpo ?? {});
}

/** Leituras do histórico por pessoa, na janela: cada uma vira chamada ao Chatbase com a chave da plataforma. */
export const IA_LEITURAS_POR_JANELA = 30;
/** Mensagens por quem paga (organização ou afiliado), na mesma janela: limita a dívida de mensagens em paralelo. */
export const IA_MENSAGENS_POR_PAGANTE = 40;

/** A conversa da pessoa **com o agente de agora**. A de outro agente (trocado em Aparência) é esquecida. */
async function conversaDe(c: Contexto): Promise<string | null> {
  const [linha] = await db
    .select({ id: iaConversas.conversationId, agente: iaConversas.agenteId })
    .from(iaConversas)
    .where(eq(iaConversas.userId, c.userId));
  if (!linha) return null;
  if (linha.agente === c.config.agenteId) return linha.id;
  await esquecerConversa(c.userId, linha.id);
  return null;
}

/** Apaga a linha só se ainda for aquela conversa (outra aba pode ter começado outra). */
async function esquecerConversa(userId: string, conversationId: string) {
  await db.delete(iaConversas).where(and(eq(iaConversas.userId, userId), eq(iaConversas.conversationId, conversationId)));
}

const naoExisteMais = (e: unknown) => e instanceof ChatbaseError && e.http === 404;

/**
 * As mensagens da conversa atual (lidas do Chatbase). Sem conversa, lista
 * vazia. Conversa que o Chatbase não conhece mais (apagada lá) é esquecida, em
 * vez de travar a coluna com erro. Ler tem limite, como escrever.
 */
export async function historicoDaIA(req: Request): Promise<{ mensagens: MensagemDaIA[]; acao: AcaoPendentePublica | null }> {
  const c = await exigirContexto(req);
  const limite = await hit(`ia-ler:${c.userId}`, IA_JANELA_MIN, IA_LEITURAS_POR_JANELA);
  if (limite.excedeu) throw new IAError("Muitas leituras em pouco tempo. Espere alguns minutos.", 429);
  const conversationId = await conversaDe(c);
  if (!conversationId) return { mensagens: [], acao: null };
  try {
    const mensagens = await cliente(c.chave).mensagens({ agenteId: c.config.agenteId, conversationId, limite: 50 });
    return { mensagens, acao: await acaoPendenteDe(c, conversationId) };
  } catch (e) {
    if (!naoExisteMais(e)) throw e;
    await esquecerConversa(c.userId, conversationId);
    return { mensagens: [], acao: null };
  }
}

/** Esquece a conversa: a próxima mensagem começa outra no Chatbase. */
export async function novaConversaDaIA(req: Request): Promise<void> {
  const c = await exigirContexto(req);
  // A ação que esperava confirmação morre com a conversa (o Chatbase nem a verá mais).
  await db
    .update(iaAcoes)
    .set({ status: "expirada", decididaEm: new Date() })
    .where(and(eq(iaAcoes.userId, c.userId), eq(iaAcoes.status, "pendente")));
  await db.delete(iaConversas).where(eq(iaConversas.userId, c.userId));
}

/**
 * Uma mensagem e a resposta. A ordem importa: disponível? → texto válido (sem
 * dado pessoal) → conta a tentativa → fala com o Chatbase → grava a conversa e
 * o uso numa transação. O erro de preenchimento sai antes de contar, como no
 * comentário; a recusa por excesso conta, senão quem insiste nunca estoura.
 */
export async function conversarComIA(
  req: Request,
  texto: unknown,
): Promise<RespostaDaIA> {
  const c = await exigirContexto(req);
  const problema = problemaNaMensagemDaIA(texto);
  if (problema) throw new IAError(problema, 422);
  // Quem paga precisa de assinatura ativa e saldo — antes de qualquer coisa sair para o Chatbase.
  const quemPaga = pagante(c.titular);
  if (quemPaga) await exigirSaldo(quemPaga);
  const limite = await hit(`ia:${c.userId}`, IA_JANELA_MIN, IA_MENSAGENS_POR_JANELA);
  if (limite.excedeu) throw new IAError("Muitas mensagens em pouco tempo. Espere alguns minutos.", 429);
  // Também por quem paga: com vários organizadores, o limite por pessoa sozinho deixaria a dívida crescer N vezes.
  if (quemPaga) {
    const doPagante = await hit(`ia-pagante:${quemPaga.tipo}:${quemPaga.id}`, IA_JANELA_MIN, IA_MENSAGENS_POR_PAGANTE);
    if (doPagante.excedeu) throw new IAError("Muitas mensagens da sua conta em pouco tempo. Espere alguns minutos.", 429);
  }

  const mensagem = (texto as string).trim();
  let lida = await conversaDe(c);
  // Ação esperando confirmação e a pessoa seguiu a conversa: a ação vence, e o agente fica sabendo.
  if (lida) await expirarPendentes(c, lida, "A pessoa seguiu a conversa sem confirmar. Se ela ainda quiser, peça de novo.");
  const enviar = (conversationId: string | null) =>
    cliente(c.chave).enviar({ agenteId: c.config.agenteId, mensagem: comContexto(mensagem, c.titular.tipo), conversationId, userId: idDaIA(c.userId) });
  let r;
  try {
    r = await enviar(lida);
  } catch (e) {
    // A conversa guardada não existe mais no Chatbase: esquece e começa outra, uma vez.
    if (!lida || !naoExisteMais(e)) throw e;
    await esquecerConversa(c.userId, lida);
    lida = null;
    r = await enviar(null);
  }
  await gravarResposta(c, lida, r);
  return seguirComAcoes(req, c, r);
}

/**
 * O assistente existe para esta sessão? Lança o mesmo erro da conversa (404
 * sem o assistente para o papel, 401/403 fora do painel). Quem confere a rifa
 * antes de pedir chama isto primeiro: sem o assistente, a resposta é 404, nunca
 * a régua da rifa.
 */
export async function exigirAssistente(req: Request): Promise<void> {
  await exigirContexto(req);
}

/**
 * Um pedido de texto ao assistente, fora da conversa da coluna: a mesma porta,
 * o mesmo saldo, o mesmo limite e o mesmo uso (cada pedido é uma mensagem
 * paga, gravada em `ia_uso` e debitada). O pedido é montado pelo servidor; a
 * volta é texto cru — quem chama passa pela régua do que vai mostrar.
 */
async function perguntarAoAssistente(req: Request, pedido: string): Promise<{ texto: string; creditos: number | null }> {
  const c = await exigirContexto(req);
  if (problemaNaMensagemDaIA(pedido)) {
    throw new IAError("Os dados da rifa têm um número que parece telefone ou CPF, e isso não vai ao assistente. Ajuste o prêmio e tente de novo.", 422);
  }
  const quemPaga = pagante(c.titular);
  if (quemPaga) await exigirSaldo(quemPaga);
  const limite = await hit(`ia:${c.userId}`, IA_JANELA_MIN, IA_MENSAGENS_POR_JANELA);
  if (limite.excedeu) throw new IAError("Muitos pedidos ao assistente em pouco tempo. Espere alguns minutos.", 429);
  if (quemPaga) {
    const doPagante = await hit(`ia-pagante:${quemPaga.tipo}:${quemPaga.id}`, IA_JANELA_MIN, IA_MENSAGENS_POR_PAGANTE);
    if (doPagante.excedeu) throw new IAError("Muitos pedidos da sua conta ao assistente em pouco tempo. Espere alguns minutos.", 429);
  }
  const r = await cliente(c.chave).enviar({
    agenteId: c.config.agenteId,
    mensagem: comContexto(pedido, c.titular.tipo),
    conversationId: null,
    userId: idDaIA(c.userId),
  });
  await db.transaction(async (tx) => {
    await tx
      .insert(iaUso)
      .values({
        mensagemId: r.id,
        titularTipo: c.titular.tipo,
        titularId: c.titular.tipo === "plataforma" ? null : c.titular.id,
        userId: c.userId,
        milicreditos: r.milicreditos,
      })
      .onConflictDoNothing({ target: iaUso.mensagemId });
    if (quemPaga) await debitarUso(tx, quemPaga, r.id, r.milicreditos);
  });
  return { texto: r.texto, creditos: r.milicreditos === null ? null : r.milicreditos / 1000 };
}

/**
 * Texto sugerido pelo assistente (o editor de imagem e a legenda): um pedido
 * só, numa conversa à parte (não entra na coluna da pessoa nem é guardada
 * aqui), montado pelo servidor com os dados públicos da rifa — o recorte é da
 * rota que chama. A ação que o agente pedir na resposta é ignorada — aqui ele
 * só escreve. O que volta passa pela régua (`lerSugestoes`) e o que não passa
 * some.
 */
export async function sugerirComIA(req: Request, tipo: TipoDeSugestao, dados: DadosParaSugerir): Promise<{ sugestoes: string[]; creditos: number | null }> {
  const r = await perguntarAoAssistente(req, pedidoDeSugestao(tipo, dados));
  return { sugestoes: lerSugestoes(tipo, r.texto), creditos: r.creditos };
}

/** Os textos de anúncio (Marketing AI): um pedido só, os campos de cada rede pela régua. */
export async function anunciosComIA(req: Request, dados: DadosParaSugerir): Promise<{ textos: TextosDeAnuncio; creditos: number | null }> {
  const r = await perguntarAoAssistente(req, pedidoDeAnuncios(dados));
  return { textos: lerAnuncios(r.texto), creditos: r.creditos };
}

export interface RespostaDaIA {
  mensagem: MensagemDaIA | null;
  creditos: number | null;
  /** A ação que espera a confirmação da pessoa, se o agente pediu uma. */
  acao: AcaoPendentePublica | null;
  /** O que aconteceu com a ação confirmada ou recusada (só na confirmação). */
  resultado?: { status: "executada" | "falhou" | "recusada"; texto: string };
  /** A ação aconteceu, mas o assistente não respondeu depois (a resposta não veio). */
  aviso?: string;
}

/**
 * Grava a conversa, o uso e o débito de uma resposta do Chatbase, numa
 * transação. Cada resposta (inclusive as que seguem uma ação) é uma linha de
 * uso e um débito, pela chave da mensagem.
 */
async function gravarResposta(c: Contexto, lida: string | null, resposta: RespostaDoChatbase) {
  const quemPaga = pagante(c.titular);
  await db.transaction(async (tx) => {
    // Gravar o id da conversa é condicional ao que foi lido antes de falar com o
    // Chatbase (até 60 s): outra aba pode ter começado outra conversa, e "Nova
    // conversa" pode ter apagado a linha nesse meio-tempo. Quem decide é a linha.
    if (lida) {
      await tx
        .update(iaConversas)
        .set({ conversationId: resposta.conversationId, atualizadaEm: new Date() })
        .where(and(eq(iaConversas.userId, c.userId), eq(iaConversas.conversationId, lida)));
    } else {
      await tx
        .insert(iaConversas)
        .values({ userId: c.userId, agenteId: c.config.agenteId, conversationId: resposta.conversationId, atualizadaEm: new Date() })
        .onConflictDoNothing({ target: iaConversas.userId });
    }
    await tx
      .insert(iaUso)
      .values({
        mensagemId: resposta.id,
        titularTipo: c.titular.tipo,
        titularId: c.titular.tipo === "plataforma" ? null : c.titular.id,
        userId: c.userId,
        milicreditos: resposta.milicreditos,
      })
      .onConflictDoNothing({ target: iaUso.mensagemId });
    // O débito anda com o uso: a mesma mensagem nunca debita duas vezes (chave `uso:<id>`).
    if (quemPaga) await debitarUso(tx, quemPaga, resposta.id, resposta.milicreditos);
  });
}

/* ---------------- ações do assistente ---------------- */

const venceEm = (criadaEm: Date) => new Date(criadaEm.getTime() + ACAO_PENDENTE_MIN * 60_000);
const prazoDaPendente = () => new Date(Date.now() - ACAO_PENDENTE_MIN * 60_000);

async function acaoPendenteDe(c: Contexto, conversationId: string): Promise<AcaoPendentePublica | null> {
  const [a] = await db
    .select()
    .from(iaAcoes)
    .where(
      and(
        eq(iaAcoes.userId, c.userId),
        eq(iaAcoes.conversationId, conversationId),
        eq(iaAcoes.status, "pendente"),
        gt(iaAcoes.criadaEm, prazoDaPendente()),
      ),
    )
    .orderBy(desc(iaAcoes.criadaEm))
    .limit(1);
  return a ? { id: a.id, nome: a.nome as NomeDaAcao, resumo: a.resumo ?? "", venceEm: venceEm(a.criadaEm).toISOString() } : null;
}

/** Vence as ações pendentes da conversa e avisa o agente (falha ao avisar não trava a conversa). */
async function expirarPendentes(c: Contexto, conversationId: string, motivo: string) {
  const vencidas = await db
    .update(iaAcoes)
    .set({ status: "expirada", decididaEm: new Date(), resultado: { status: "error", error: motivo } })
    .where(and(eq(iaAcoes.userId, c.userId), eq(iaAcoes.conversationId, conversationId), eq(iaAcoes.status, "pendente")))
    .returning({ toolCallId: iaAcoes.toolCallId, agenteId: iaAcoes.agenteId });
  for (const v of vencidas) {
    await cliente(c.chave)
      .enviarResultado({ agenteId: v.agenteId, conversationId, toolCallId: v.toolCallId, saida: { status: "error", error: motivo } })
      .catch((e) => console.warn(`[ia] não deu para avisar o agente da ação vencida: ${(e as Error).message}`));
  }
}

/** O resultado de uma leitura, conferido antes de sair para o Chatbase. */
function saidaSegura(dados: unknown): SaidaDaAcao {
  if (!resultadoSemDadoPessoal(dados)) {
    console.warn("[ia] resultado de ação retido: parecia ter dado pessoal.");
    return { status: "error", error: "O resultado tinha dado pessoal e não foi enviado ao assistente." };
  }
  return { status: "success", data: dados };
}

/**
 * O texto de erro também sai para o Chatbase, e leva título de rifa ou
 * mensagem de serviço: passa pela mesma barreira, e o que acender vira genérico.
 */
function saidaDeErro(texto: string): SaidaDaAcao {
  if (problemaNaMensagemDaIA(normalizarParaChecar(texto)) !== null) {
    return { status: "error", error: "Não deu para fazer isso (o detalhe tinha dado pessoal e foi retido)." };
  }
  return { status: "error", error: texto };
}

/**
 * Trata as ações de uma resposta. Leitura executa e devolve o resultado na
 * hora; gravação vira **uma** pendente (as outras da mesma resposta são
 * recusadas: uma confirmação de cada vez). Toda chamada vira uma linha em
 * `ia_acoes`, e a mesma chamada nunca entra duas vezes (chave da conversa e da
 * chamada). Devolve a pendente e se algum resultado foi enviado.
 */
async function tratarChamadas(
  req: Request,
  c: Contexto,
  conversationId: string,
  chamadas: ChamadaDeAcao[],
  /** Recusa todas com este motivo (passou do limite de rodadas). */
  recusarTodas?: string,
): Promise<{ pendente: AcaoPendentePublica | null; enviados: number }> {
  let pendente: AcaoPendentePublica | null = null;
  let enviados = 0;
  const quem = quemUsa(c.titular);
  for (const ch of chamadas) {
    // A entrada é corpo de terceiro: grande demais não é guardada nem conferida.
    const grandeDemais = JSON.stringify(ch.entrada ?? null).length > ENTRADA_DA_ACAO_MAX;
    const [linha] = await db
      .insert(iaAcoes)
      .values({
        userId: c.userId,
        titularTipo: c.titular.tipo,
        titularId: c.titular.tipo === "plataforma" ? null : c.titular.id,
        agenteId: c.config.agenteId,
        conversationId,
        toolCallId: ch.toolCallId,
        nome: ch.nome.slice(0, 80),
        entrada: (grandeDemais ? null : ch.entrada) as never,
        status: "recebida",
      })
      .onConflictDoNothing({ target: [iaAcoes.conversationId, iaAcoes.toolCallId] })
      .returning({ id: iaAcoes.id, criadaEm: iaAcoes.criadaEm });
    if (!linha) continue; // a mesma chamada já foi tratada

    let saida: SaidaDaAcao;
    let status: string;
    let resumo: string | null = null;
    let entradaGuardada: unknown = grandeDemais ? null : ch.entrada;
    const acao = acaoPeloNome(ch.nome);
    const valida = acao && acao.quem.includes(quem) ? validarEntrada(acao.nome, ch.entrada) : null;
    try {
      if (recusarTodas) {
        throw new AcaoRecusada(recusarTodas);
      } else if (grandeDemais) {
        throw new AcaoRecusada("A entrada da ação é grande demais.");
      } else if (!acao || !acao.quem.includes(quem)) {
        throw new AcaoRecusada("Esta ação não está disponível para esta conta.");
      } else if (!valida || !valida.ok) {
        throw new AcaoRecusada(valida && !valida.ok ? valida.erro : "Entrada inválida.");
      } else if (acao.grava) {
        if (pendente) throw new AcaoRecusada("Uma ação de cada vez: a pessoa ainda precisa confirmar a anterior.");
        const pronta = await prepararGravacao(req, c.titular, valida.valor);
        entradaGuardada = { ...valida.valor, alvoId: pronta.alvoId };
        resumo = pronta.resumo;
        await db.update(iaAcoes).set({ status: "pendente", resumo, entrada: entradaGuardada as never }).where(eq(iaAcoes.id, linha.id));
        pendente = { id: linha.id, nome: acao.nome, resumo, venceEm: venceEm(linha.criadaEm).toISOString() };
        continue; // o resultado só sai quando a pessoa decidir
      } else {
        saida = saidaSegura(await executarLeitura(req, c.titular, valida.valor));
        status = saida.status === "success" ? "executada" : "falhou";
        entradaGuardada = valida.valor;
      }
    } catch (e) {
      if (!(e instanceof AcaoRecusada)) {
        console.error(`[ia] ação ${ch.nome} falhou:`, e);
      }
      saida = saidaDeErro(e instanceof AcaoRecusada ? e.message : "Não deu para fazer isso agora.");
      status = "recusada_pelo_sistema";
    }
    await db
      .update(iaAcoes)
      .set({ status, resultado: saida as never, entrada: entradaGuardada as never, decididaEm: new Date() })
      .where(eq(iaAcoes.id, linha.id));
    await cliente(c.chave).enviarResultado({ agenteId: c.config.agenteId, conversationId, toolCallId: ch.toolCallId, saida });
    enviados++;
  }
  return { pendente, enviados };
}

/**
 * Depois de uma resposta: enquanto o agente pedir ações (até
 * `RODADAS_DE_ACAO_MAX` rodadas — cada uma é outra chamada paga ao Chatbase),
 * executa as leituras, devolve os resultados e deixa o agente continuar. Para
 * na primeira gravação, que espera a pessoa.
 */
async function seguirComAcoes(req: Request, c: Contexto, primeira: RespostaDoChatbase): Promise<RespostaDaIA> {
  let atual = primeira;
  const textos = [primeira.texto];
  let milicreditos = primeira.milicreditos;
  let pendente: AcaoPendentePublica | null = null;
  for (let rodada = 0; atual.chamadas.length > 0; rodada++) {
    if (rodada >= RODADAS_DE_ACAO_MAX) {
      // Passou do limite: as chamadas que sobraram são recusadas, e o agente não continua sozinho.
      await tratarChamadas(req, c, atual.conversationId, atual.chamadas, "Ações demais numa mensagem só: peça à pessoa para continuar.");
      textos.push("Parei aqui: foram ações demais numa mensagem só. Peça de novo o que faltou.");
      break;
    }
    const r = await tratarChamadas(req, c, atual.conversationId, atual.chamadas);
    if (r.pendente) {
      pendente = r.pendente;
      break;
    }
    if (r.enviados === 0) break;
    // Cada continuação é outra resposta paga: sem saldo, para aqui (a dívida fica em uma resposta, nunca em várias).
    const quemPaga = pagante(c.titular);
    if (quemPaga) {
      try {
        await exigirSaldo(quemPaga);
      } catch (e) {
        if (!(e instanceof CobrancaIAError)) throw e;
        textos.push("Os créditos do assistente acabaram no meio do caminho. Compre um pacote ou renove a assinatura para continuar.");
        break;
      }
    }
    atual = await cliente(c.chave).enviar({ agenteId: c.config.agenteId, conversationId: atual.conversationId, userId: idDaIA(c.userId) });
    await gravarResposta(c, atual.conversationId, atual);
    textos.push(atual.texto);
    if (atual.milicreditos !== null) milicreditos = (milicreditos ?? 0) + atual.milicreditos;
  }
  const texto = textos.filter(Boolean).join("\n\n");
  return {
    mensagem: texto || pendente ? { id: atual.id, papel: "assistente", texto, criadoEm: Date.now() } : null,
    creditos: milicreditos === null ? null : milicreditos / 1000,
    acao: pendente,
  };
}

/**
 * Ação que ficou em `executando` (o processo caiu no meio): passado o prazo,
 * vira `falhou` — nada se repete por isso, e a pessoa vê o estado. Roda no
 * relógio da franquia do assistente.
 */
export async function destravarAcoesPresas(): Promise<number> {
  const r = await db
    .update(iaAcoes)
    .set({ status: "falhou", resultado: { status: "error", error: "A execução foi interrompida." } })
    .where(and(eq(iaAcoes.status, "executando"), lt(iaAcoes.decididaEm, prazoDaPendente())))
    .returning({ id: iaAcoes.id });
  return r.length;
}

/**
 * A pessoa confirmou (ou recusou) a ação que o assistente pediu. Só quem
 * conversava decide (a de outra pessoa é 404); o `UPDATE` condicional
 * (`pendente` → `executando`/`recusada`, dentro do prazo) faz de dois cliques
 * uma decisão e um 409. A execução usa a sessão de quem confirmou — o recorte
 * é o dela —, e o resultado volta ao agente, que continua a conversa.
 */
export async function decidirAcaoDaIA(req: Request, id: string, confirmar: boolean): Promise<RespostaDaIA> {
  const c = await exigirContexto(req);
  if (!ehUuid(id)) throw new IAError("Ação não encontrada.", 404);
  const [a] = await db.select().from(iaAcoes).where(and(eq(iaAcoes.id, id), eq(iaAcoes.userId, c.userId)));
  if (!a) throw new IAError("Ação não encontrada.", 404);
  // Continuar a conversa custa uma resposta: quem paga precisa de saldo, e conta no limite como uma mensagem.
  const quemPaga = pagante(c.titular);
  if (quemPaga) await exigirSaldo(quemPaga);
  const limite = await hit(`ia:${c.userId}`, IA_JANELA_MIN, IA_MENSAGENS_POR_JANELA);
  if (limite.excedeu) throw new IAError("Muitas mensagens em pouco tempo. Espere alguns minutos.", 429);
  if (quemPaga) {
    const doPagante = await hit(`ia-pagante:${quemPaga.tipo}:${quemPaga.id}`, IA_JANELA_MIN, IA_MENSAGENS_POR_PAGANTE);
    if (doPagante.excedeu) throw new IAError("Muitas mensagens da sua conta em pouco tempo. Espere alguns minutos.", 429);
  }
  // A ação precisa ser de quem fala agora (o papel pode ter mudado desde o pedido).
  const acao = acaoPeloNome(a.nome);
  if (!acao || !acao.quem.includes(quemUsa(c.titular))) throw new IAError("Ação não encontrada.", 404);

  const conversa = await conversaDe(c);
  if (a.status === "pendente" && (conversa !== a.conversationId || a.agenteId !== c.config.agenteId)) {
    await db.update(iaAcoes).set({ status: "expirada", decididaEm: new Date() }).where(and(eq(iaAcoes.id, a.id), eq(iaAcoes.status, "pendente")));
    throw new IAError("Esta ação era de outra conversa. Peça de novo ao assistente.", 409);
  }
  const [tomada] = await db
    .update(iaAcoes)
    .set({ status: confirmar ? "executando" : "recusada", decididaEm: new Date() })
    .where(and(eq(iaAcoes.id, a.id), eq(iaAcoes.status, "pendente"), gt(iaAcoes.criadaEm, prazoDaPendente())))
    .returning();
  if (!tomada) {
    // "Venceu" só se o prazo passou; o segundo de dois cliques leu "pendente", mas a ação já foi decidida.
    if (a.status === "pendente" && a.criadaEm.getTime() <= prazoDaPendente().getTime()) {
      await expirarPendentes(c, a.conversationId, "A confirmação venceu. Se a pessoa ainda quiser, peça de novo.");
      throw new IAError("A confirmação venceu. Peça de novo ao assistente.", 409);
    }
    throw new IAError("Esta ação já foi decidida.", 409);
  }

  let saida: SaidaDaAcao;
  let resultado: NonNullable<RespostaDaIA["resultado"]>;
  if (!confirmar) {
    saida = { status: "error", error: "A pessoa não confirmou. Nada foi feito." };
    resultado = { status: "recusada", texto: "Você cancelou. Nada foi feito." };
  } else {
    const e = a.entrada as EntradaDaAcao & { alvoId: string };
    try {
      const dados = await executarGravacao(req, c.titular, a.id, e, e.alvoId);
      saida = saidaSegura(dados);
      resultado = { status: "executada", texto: "Feito." };
    } catch (err) {
      if (!(err instanceof AcaoRecusada)) console.error(`[ia] ação ${a.nome} confirmada falhou:`, err);
      const msg = err instanceof AcaoRecusada ? err.message : "Não deu para fazer isso agora. Tente de novo.";
      saida = saidaDeErro(msg);
      resultado = { status: "falhou", texto: msg };
    }
  }
  await db
    .update(iaAcoes)
    .set({ status: resultado.status, resultado: saida as never, decididaEm: new Date() })
    .where(eq(iaAcoes.id, a.id));

  // A ação já aconteceu (ou não): se o Chatbase falhar daqui em diante, a pessoa sabe o resultado mesmo assim.
  try {
    await cliente(c.chave).enviarResultado({ agenteId: a.agenteId, conversationId: a.conversationId, toolCallId: a.toolCallId, saida });
    const r = await cliente(c.chave).enviar({ agenteId: c.config.agenteId, conversationId: a.conversationId, userId: idDaIA(c.userId) });
    await gravarResposta(c, a.conversationId, r);
    return { ...(await seguirComAcoes(req, c, r)), resultado };
  } catch (err) {
    // A ação já foi decidida: a pessoa sabe o resultado mesmo que a resposta do assistente não venha.
    if (!(err instanceof ChatbaseError)) console.error("[ia] depois da ação, a conversa falhou:", err);
    const aviso = err instanceof ChatbaseError ? err.message : "O assistente não respondeu depois da ação.";
    return { mensagem: null, creditos: null, acao: null, resultado, aviso };
  }
}

/** Para a plataforma ver na configuração: há chave do Chatbase no servidor? (nunca o valor). */
export async function configDaIA(): Promise<{ config: ConfigIA; chaveNoAmbiente: boolean }> {
  return { config: (await getPlataforma()).assistenteIA, chaveNoAmbiente: chaveDoChatbase() !== null };
}
