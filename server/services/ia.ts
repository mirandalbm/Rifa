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
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { db } from "../db";
import { affiliates, iaConversas, iaUso } from "@shared/schema";
import {
  IA_JANELA_MIN,
  IA_MENSAGENS_POR_JANELA,
  idDaIA,
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
import { ClienteChatbase, baseDoChatbase, chaveDoChatbase } from "./chatbase";

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
  return { ligado: (await contextoDe(req)) !== null };
}

async function conversaDe(userId: string): Promise<string | null> {
  const [c] = await db.select({ id: iaConversas.conversationId }).from(iaConversas).where(eq(iaConversas.userId, userId));
  return c?.id ?? null;
}

/** As mensagens da conversa atual (lidas do Chatbase). Sem conversa, lista vazia. */
export async function historicoDaIA(req: Request): Promise<MensagemDaIA[]> {
  const c = await exigirContexto(req);
  const conversationId = await conversaDe(c.userId);
  if (!conversationId) return [];
  return cliente(c.chave).mensagens({ agenteId: c.config.agenteId, conversationId, limite: 50 });
}

/** Esquece a conversa: a próxima mensagem começa outra no Chatbase. */
export async function novaConversaDaIA(req: Request): Promise<void> {
  const c = await exigirContexto(req);
  await db.delete(iaConversas).where(eq(iaConversas.userId, c.userId));
}

/**
 * Uma mensagem e a resposta. A ordem importa: disponível? → texto válido (sem
 * dado pessoal) → conta a tentativa → fala com o Chatbase → grava a conversa e
 * o uso numa transação. O erro de preenchimento sai antes de contar, como no
 * comentário; a recusa por excesso conta, senão quem insiste nunca estoura.
 */
export async function conversarComIA(req: Request, texto: unknown): Promise<{ mensagem: MensagemDaIA; creditos: number }> {
  const c = await exigirContexto(req);
  const problema = problemaNaMensagemDaIA(texto);
  if (problema) throw new IAError(problema, 422);
  const limite = await hit(`ia:${c.userId}`, IA_JANELA_MIN, IA_MENSAGENS_POR_JANELA);
  if (limite.excedeu) throw new IAError("Muitas mensagens em pouco tempo. Espere alguns minutos.", 429);

  const conversationId = await conversaDe(c.userId);
  const r = await cliente(c.chave).enviar({
    agenteId: c.config.agenteId,
    mensagem: (texto as string).trim(),
    conversationId,
    userId: idDaIA(c.userId),
  });

  await db.transaction(async (tx) => {
    await tx
      .insert(iaConversas)
      .values({ userId: c.userId, conversationId: r.conversationId, atualizadaEm: new Date() })
      .onConflictDoUpdate({ target: iaConversas.userId, set: { conversationId: r.conversationId, atualizadaEm: new Date() } });
    await tx
      .insert(iaUso)
      .values({
        mensagemId: r.id,
        titularTipo: c.titular.tipo,
        titularId: c.titular.tipo === "plataforma" ? null : c.titular.id,
        userId: c.userId,
        creditos: r.creditos,
      })
      .onConflictDoNothing({ target: iaUso.mensagemId });
  });

  return { mensagem: { id: r.id, papel: "assistente", texto: r.texto, criadoEm: Date.now() }, creditos: r.creditos };
}

/** Para a plataforma ver na configuração: há chave do Chatbase no servidor? (nunca o valor). */
export async function configDaIA(): Promise<{ config: ConfigIA; chaveNoAmbiente: boolean }> {
  return { config: (await getPlataforma()).assistenteIA, chaveNoAmbiente: chaveDoChatbase() !== null };
}
