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
import { and, eq } from "drizzle-orm";
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
import { ChatbaseError, ClienteChatbase, baseDoChatbase, chaveDoChatbase } from "./chatbase";

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

/** Leituras do histórico por pessoa, na janela: cada uma vira chamada ao Chatbase com a chave da plataforma. */
export const IA_LEITURAS_POR_JANELA = 30;

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
export async function historicoDaIA(req: Request): Promise<MensagemDaIA[]> {
  const c = await exigirContexto(req);
  const limite = await hit(`ia-ler:${c.userId}`, IA_JANELA_MIN, IA_LEITURAS_POR_JANELA);
  if (limite.excedeu) throw new IAError("Muitas leituras em pouco tempo. Espere alguns minutos.", 429);
  const conversationId = await conversaDe(c);
  if (!conversationId) return [];
  try {
    return await cliente(c.chave).mensagens({ agenteId: c.config.agenteId, conversationId, limite: 50 });
  } catch (e) {
    if (!naoExisteMais(e)) throw e;
    await esquecerConversa(c.userId, conversationId);
    return [];
  }
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
export async function conversarComIA(
  req: Request,
  texto: unknown,
): Promise<{ mensagem: MensagemDaIA; creditos: number | null }> {
  const c = await exigirContexto(req);
  const problema = problemaNaMensagemDaIA(texto);
  if (problema) throw new IAError(problema, 422);
  const limite = await hit(`ia:${c.userId}`, IA_JANELA_MIN, IA_MENSAGENS_POR_JANELA);
  if (limite.excedeu) throw new IAError("Muitas mensagens em pouco tempo. Espere alguns minutos.", 429);

  const mensagem = (texto as string).trim();
  let lida = await conversaDe(c);
  const enviar = (conversationId: string | null) =>
    cliente(c.chave).enviar({ agenteId: c.config.agenteId, mensagem, conversationId, userId: idDaIA(c.userId) });
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
  const resposta = r;

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
  });

  return {
    mensagem: { id: resposta.id, papel: "assistente", texto: resposta.texto, criadoEm: Date.now() },
    creditos: resposta.milicreditos === null ? null : resposta.milicreditos / 1000,
  };
}

/** Para a plataforma ver na configuração: há chave do Chatbase no servidor? (nunca o valor). */
export async function configDaIA(): Promise<{ config: ConfigIA; chaveNoAmbiente: boolean }> {
  return { config: (await getPlataforma()).assistenteIA, chaveNoAmbiente: chaveDoChatbase() !== null };
}
