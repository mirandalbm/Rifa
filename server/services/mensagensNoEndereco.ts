/**
 * Mensagens no endereço da organização (`<rotulo>.<base>`): a pessoa conversa
 * **só com a organização do endereço**, nunca com a caixa inteira dela. O
 * motivo é o do plano (docs/PLANO-SUBDOMINIO.md, cap. 15.2): o endereço é a
 * identidade da promotora e o canal direto dela com o usuário.
 *
 * Nada novo na regra: tudo passa pelas funções de `mensagens.ts` — a mesma
 * identidade (`minhaIdentidade`, sempre como apostador aqui), o mesmo pedido de
 * mensagem para quem não segue, a mesma régua do texto, os mesmos limites. O que
 * este arquivo faz é só **achar a conversa deste par** (apostador × esta
 * organização) pelo `slug` do caminho; o `id` de conversa nunca vem do
 * navegador, então não há conversa alheia para pedir (404 só se a organização
 * não existe).
 */
import type { Request } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { conversas, organizations } from "@shared/schema";
import { ordenarPar } from "@shared/mensagens";
import { db } from "../db";
import { MensagemError, enviar, exigirMensagensLigadas, iniciarConversa, lerConversa, marcarLida, minhaIdentidade } from "./mensagens";
import { urlDaFoto } from "./perfil";
import { organizacaoFotos } from "@shared/schema";

const COMO = "comprador"; // aqui só o apostador conversa; a organização responde pelo painel

async function organizacaoDoEndereco(slug: string) {
  const [o] = await db
    .select({ id: organizations.id, slug: organizations.slug, nome: organizations.name, fotoEm: organizacaoFotos.updatedAt })
    .from(organizations)
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .where(and(eq(organizations.slug, slug.toLowerCase()), isNull(organizations.archivedAt), isNull(organizations.banidaEm)))
    .limit(1);
  if (!o) throw new MensagemError("Organização não encontrada.", 404);
  return o;
}

/** O id da conversa deste apostador com esta organização, ou `null` se ainda não começou. */
async function conversaDoPar(req: Request, organizationId: string): Promise<{ id: string } | null> {
  const eu = await minhaIdentidade(req, COMO);
  const par = ordenarPar(eu, { tipo: "organizacao", id: organizationId });
  const [c] = await db
    .select({ id: conversas.id })
    .from(conversas)
    .where(and(eq(conversas.aTipo, par.a.tipo), eq(conversas.aId, par.a.id), eq(conversas.bTipo, par.b.tipo), eq(conversas.bId, par.b.id)));
  return c ?? null;
}

/** A conversa com a organização do endereço (e marca como lida), ou a tela vazia para começar. */
export async function conversaComAOrganizacao(req: Request, slug: string, antes?: unknown) {
  await exigirMensagensLigadas();
  const org = await organizacaoDoEndereco(slug);
  const quem = { nome: org.nome, foto: urlDaFoto(org.slug, org.fotoEm) };
  const c = await conversaDoPar(req, org.id);
  if (!c) return { organizacao: quem, conversa: null, itens: [], proximo: null };
  const r = await lerConversa(req, c.id, { antes, como: COMO });
  if (r.conversa.naoLidas) await marcarLida(req, c.id, COMO);
  return {
    organizacao: quem,
    conversa: { ...r.conversa, podeEnviarFoto: false },
    // A foto sai pela porta do principal (`/mensagens/conversas/:id/fotos`); no endereço só o texto.
    itens: r.itens.map((m) => ({ ...m, foto: null })),
    proximo: r.proximo,
  };
}

/** Manda um texto à organização do endereço: abre a conversa ou segue a que já existe. */
export async function mandarParaAOrganizacao(req: Request, slug: string, entrada: { texto?: unknown }) {
  await exigirMensagensLigadas();
  const org = await organizacaoDoEndereco(slug);
  // Só o texto: foto e cartão de rifa não entram por aqui (o corpo é descartado, não repassado).
  const corpo = { texto: entrada.texto, como: COMO };
  const c = await conversaDoPar(req, org.id);
  if (c) return enviar(req, c.id, corpo);
  return iniciarConversa(req, { para: { tipo: "organizacao", id: org.id }, ...corpo });
}

/** Quantas mensagens da organização esperam: o número do botão do console no endereço. */
export async function naoLidasComAOrganizacao(req: Request, slug: string): Promise<{ naoLidas: number }> {
  try {
    await exigirMensagensLigadas();
    const org = await organizacaoDoEndereco(slug);
    const eu = await minhaIdentidade(req, COMO);
    const par = ordenarPar(eu, { tipo: "organizacao", id: org.id });
    const [c] = await db
      .select({ a: conversas.naoLidasA, b: conversas.naoLidasB })
      .from(conversas)
      .where(and(eq(conversas.aTipo, par.a.tipo), eq(conversas.aId, par.a.id), eq(conversas.bTipo, par.b.tipo), eq(conversas.bId, par.b.id)));
    return { naoLidas: c ? (par.ladoDeX === "a" ? c.a : c.b) : 0 };
  } catch {
    return { naoLidas: 0 }; // sem sessão ou desligado: zero, nunca erro (como o resumo do console)
  }
}
