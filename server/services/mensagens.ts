/**
 * Mensagens: conversa de um para um entre apostador (conta com apelido),
 * organização e afiliado. Regras em `shared/mensagens.ts`.
 *
 * - **O par é único pelo índice** (`uq_conversa_par`, em ordem canônica):
 *   `INSERT … ON CONFLICT DO NOTHING`, nunca um `SELECT` antes.
 * - **Escrever trava a conversa** (`FOR UPDATE`): bloqueio, encerramento e
 *   pedido de mensagem são conferidos com a linha travada, e a mensagem, a
 *   prévia e o contador de não lidas andam na mesma transação.
 * - **Recorte**: o apostador só alcança o que é dele; a organização, o que
 *   é da organização da sessão (`orgOf`). Conversa de outro é 404.
 * - **A plataforma só lê o trecho da denúncia**, e a leitura é auditada
 *   antes na rota.
 */
import { randomInt } from "node:crypto";
import sharp from "sharp";
import type { Request } from "express";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  affiliates,
  buyers,
  campaigns,
  conversas,
  mensagemDenuncias,
  mensagemImagens,
  mensagens,
  mensagensPresenca,
  organizacaoFotos,
  organizations,
  seguidores,
  users,
} from "@shared/schema";
import {
  CONVERSAS_NOVAS_POR_DIA,
  IMAGEM_MAX_BYTES,
  IMAGENS_POR_DIA,
  JANELA_DE_MENSAGENS_MIN,
  MENSAGENS_POR_JANELA,
  MOTIVOS_DA_DENUNCIA_DE_MENSAGEM,
  PAGINA_DE_CONVERSAS,
  PAGINA_DE_MENSAGENS,
  PRESENCA_PASSO_S,
  PREVIA_DA_FOTO,
  TRECHO_DA_DENUNCIA,
  decisaoValida,
  estaOnline,
  limparMensagem,
  motivoDaMensagemValido,
  ordenarPar,
  outroLado,
  podeEnviarImagem,
  podeVerOnline,
  previaDoTexto,
  problemaNaMensagem,
  problemaParaEnviar,
  situacaoDepoisDeEnviar,
  situacaoInicial,
  type Lado,
  type Participante,
  type SituacaoDaConversa,
  type TipoDeParticipante,
} from "@shared/mensagens";
import { DENUNCIAS_POR_DIA, DENUNCIA_TEXTO_MAX, pedePagamentoPorFora } from "@shared/seguranca";
import { cortarPagina, fazerCursor, lerCursor, limiteDaPagina } from "@shared/paginacao";
import { isUniqueViolation } from "../pgError";
import { hit } from "./antifraude";
import { avisar, emSegundoPlano } from "./push";
import { getPlataforma } from "./settings";
import { urlDaFoto } from "./perfil";
import { urlDaFotoDoApostador } from "./perfilApostador";
import { naoLidasDeGrupos } from "./grupos";

export class MensagemError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "MensagemError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Desligada pela plataforma, a caixa não existe (404). */
export async function exigirMensagensLigadas() {
  if (!(await getPlataforma()).mensagensLigado) throw new MensagemError("As mensagens ainda não estão abertas.", 404);
}

/* ------------------------------------------------------------------ *
 * Quem sou eu
 * ------------------------------------------------------------------ */

/**
 * A identidade que conversa: organização (sessão do painel de organizador),
 * afiliado ativo (sessão do painel de afiliado) ou apostador com conta e
 * apelido. Com mais de uma sessão aberta, `como` escolhe; sem ele, vale a do
 * painel. O administrador geral e o cambista não conversam.
 */
export async function minhaIdentidade(req: Request, como?: unknown): Promise<Participante> {
  const quer = typeof como === "string" ? como : null;
  const u = req.user;
  const buyerId = req.session.buyer?.id ?? null;

  if (u && quer !== "comprador") {
    if (u.role === "organizer" && u.organizationId && (!quer || quer === "organizacao")) {
      return { tipo: "organizacao", id: u.organizationId };
    }
    if (u.role === "affiliate" && u.affiliateId && (!quer || quer === "afiliado")) {
      const [a] = await db.select({ status: affiliates.status }).from(affiliates).where(eq(affiliates.id, u.affiliateId));
      if (a?.status !== "active") throw new MensagemError("Seu cadastro de afiliado ainda não está ativo.", 403);
      return { tipo: "afiliado", id: u.affiliateId };
    }
  }
  if (buyerId) {
    const [b] = await db.select({ apelido: buyers.apelido, senha: buyers.passwordHash }).from(buyers).where(eq(buyers.id, buyerId));
    if (!b?.senha) throw new MensagemError("Crie sua conta para trocar mensagens.", 401);
    if (!b.apelido) throw new MensagemError("Escolha seu apelido para trocar mensagens.", 409);
    return { tipo: "comprador", id: buyerId };
  }
  throw new MensagemError("Entre na sua conta para trocar mensagens.", 401);
}

/* ------------------------------------------------------------------ *
 * Como cada participante aparece
 * ------------------------------------------------------------------ */

export interface PerfilNaConversa {
  tipo: TipoDeParticipante;
  nome: string;
  foto: string | null;
  /** Para onde leva tocar no nome (perfil público); afiliado não tem. */
  href: string | null;
  verificado: boolean;
  /** Existe e pode receber mensagem (organização arquivada/banida e conta apagada, não). */
  ativo: boolean;
}

async function perfisDe(lista: Participante[]): Promise<Map<string, PerfilNaConversa>> {
  const mapa = new Map<string, PerfilNaConversa>();
  const ids = (t: TipoDeParticipante) => [...new Set(lista.filter((p) => p.tipo === t).map((p) => p.id))];

  const cs = ids("comprador");
  if (cs.length) {
    const linhas = await db
      .select({ id: buyers.id, apelido: buyers.apelido, fotoEm: buyers.fotoEm, verificadoEm: buyers.verificadoEm })
      .from(buyers)
      .where(inArray(buyers.id, cs));
    for (const b of linhas) {
      mapa.set(`comprador:${b.id}`, {
        tipo: "comprador",
        nome: b.apelido ?? "Conta removida",
        foto: urlDaFotoDoApostador(b.apelido, b.fotoEm),
        href: b.apelido ? `/u/${b.apelido}` : null,
        verificado: Boolean(b.verificadoEm),
        ativo: Boolean(b.apelido),
      });
    }
  }
  const os = ids("organizacao");
  if (os.length) {
    const linhas = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        fotoEm: organizacaoFotos.updatedAt,
        verificadaEm: organizations.verificadaEm,
        active: organizations.active,
        archivedAt: organizations.archivedAt,
        banidaEm: organizations.banidaEm,
      })
      .from(organizations)
      .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
      .where(inArray(organizations.id, os));
    for (const o of linhas) {
      mapa.set(`organizacao:${o.id}`, {
        tipo: "organizacao",
        nome: o.name,
        foto: urlDaFoto(o.slug, o.fotoEm),
        href: o.archivedAt || o.banidaEm ? null : `/o/${o.slug}`,
        verificado: Boolean(o.verificadaEm),
        ativo: !o.archivedAt && !o.banidaEm,
      });
    }
  }
  const af = ids("afiliado");
  if (af.length) {
    const linhas = await db
      .select({ id: affiliates.id, nome: users.name, status: affiliates.status, verificadoEm: affiliates.verificadoEm })
      .from(affiliates)
      .innerJoin(users, eq(users.id, affiliates.userId))
      .where(inArray(affiliates.id, af));
    for (const a of linhas) {
      mapa.set(`afiliado:${a.id}`, {
        tipo: "afiliado",
        nome: a.nome,
        foto: null,
        href: null,
        verificado: Boolean(a.verificadoEm),
        ativo: a.status === "active",
      });
    }
  }
  return mapa;
}

const SEM_PERFIL: PerfilNaConversa = { tipo: "comprador", nome: "Conta removida", foto: null, href: null, verificado: false, ativo: false };
const perfilOu = (m: Map<string, PerfilNaConversa>, p: Participante) => m.get(`${p.tipo}:${p.id}`) ?? SEM_PERFIL;

/* ------------------------------------------------------------------ *
 * A conversa e o meu lado
 * ------------------------------------------------------------------ */

type Conversa = typeof conversas.$inferSelect;

const lado = (c: Conversa, eu: Participante): Lado | null =>
  c.aTipo === eu.tipo && c.aId === eu.id ? "a" : c.bTipo === eu.tipo && c.bId === eu.id ? "b" : null;
const parceiro = (c: Conversa, l: Lado): Participante =>
  l === "a" ? { tipo: c.bTipo as TipoDeParticipante, id: c.bId } : { tipo: c.aTipo as TipoDeParticipante, id: c.aId };

/** A conversa é minha? Se não, é 404 — conversa de outro não existe para mim. */
async function minhaConversa(eu: Participante, id: string, tx: Pick<typeof db, "select"> = db) {
  if (!UUID.test(id)) throw new MensagemError("Conversa não encontrada.", 404);
  const [c] = await tx.select().from(conversas).where(eq(conversas.id, id));
  const l = c ? lado(c, eu) : null;
  if (!c || !l) throw new MensagemError("Conversa não encontrada.", 404);
  return { c, l };
}

const estadoDe = (c: Conversa) => ({
  situacao: c.situacao as SituacaoDaConversa,
  iniciadaPor: c.iniciadaPor as Lado,
  bloqueadaPor: (c.bloqueadaPor as Lado | null) ?? null,
  encerrada: Boolean(c.encerradaEm),
});

/* ------------------------------------------------------------------ *
 * Presença ("online agora") e foto
 * ------------------------------------------------------------------ */

/**
 * Marca que a pessoa esteve na caixa agora. Regrava só de minuto em minuto
 * (`WHERE ultima_em < agora - passo`): ler a caixa não vira uma escrita por
 * toque. `mostrar` nasce desligado e esta função nunca o liga.
 */
async function tocarPresenca(eu: Participante) {
  await db.execute(sql`
    INSERT INTO mensagens_presenca (tipo, id, mostrar, ultima_em) VALUES (${eu.tipo}, ${eu.id}, false, now())
    ON CONFLICT (tipo, id) DO UPDATE SET ultima_em = now()
    WHERE mensagens_presenca.ultima_em < now() - make_interval(secs => ${PRESENCA_PASSO_S})`);
}

export async function minhaPresenca(req: Request, como?: unknown) {
  const eu = await minhaIdentidade(req, como);
  const [p] = await db.select({ mostrar: mensagensPresenca.mostrar }).from(mensagensPresenca).where(and(eq(mensagensPresenca.tipo, eu.tipo), eq(mensagensPresenca.id, eu.id)));
  return { mostrar: p?.mostrar === true };
}

export async function definirPresenca(req: Request, mostrar: unknown, como?: unknown) {
  const eu = await minhaIdentidade(req, como);
  if (typeof mostrar !== "boolean") throw new MensagemError("Escolha mostrar ou esconder.", 400);
  if ((await hit(`mensagem-presenca:${eu.tipo}:${eu.id}`, 10, 30)).excedeu) throw new MensagemError("Muitas mudanças seguidas. Tente em alguns minutos.", 429);
  await db
    .insert(mensagensPresenca)
    .values({ tipo: eu.tipo, id: eu.id, mostrar })
    .onConflictDoUpdate({ target: [mensagensPresenca.tipo, mensagensPresenca.id], set: { mostrar } });
  return { mostrar };
}

/**
 * Quem, entre os parceiros, está online para mim agora. Só entra se eu
 * também mostro o meu, a conversa foi aceita e a pessoa esteve na caixa há
 * pouco. O resultado é só "sim": quem esconde e quem está fora são iguais
 * para quem olha, e o horário nunca sai.
 */
async function onlineDosParceiros(eu: Participante, itens: { chave: string; parceiro: Participante; situacao: SituacaoDaConversa; bloqueada: boolean; encerrada: boolean }[]) {
  const online = new Set<string>();
  if (itens.length === 0) return online;
  const todos = [eu, ...itens.map((i) => i.parceiro)];
  const linhas = await db
    .select()
    .from(mensagensPresenca)
    .where(or(...todos.map((p) => and(eq(mensagensPresenca.tipo, p.tipo), eq(mensagensPresenca.id, p.id))))!);
  const por = new Map(linhas.map((l) => [`${l.tipo}:${l.id}`, l]));
  const euMostro = por.get(`${eu.tipo}:${eu.id}`)?.mostrar === true;
  const agora = new Date();
  for (const i of itens) {
    const ele = por.get(`${i.parceiro.tipo}:${i.parceiro.id}`);
    if (podeVerOnline({ euMostro, eleMostra: ele?.mostrar === true, situacao: i.situacao, bloqueada: i.bloqueada, encerrada: i.encerrada }) && estaOnline(ele?.ultimaEm, agora)) {
      online.add(i.chave);
    }
  }
  return online;
}

/** A foto vira JPEG de até 1600 px, sem metadados (nem localização); o resto é recusado. */
export async function processarFoto(dataUrl: unknown): Promise<Buffer> {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(typeof dataUrl === "string" ? dataUrl : "");
  if (!m) throw new MensagemError("Envie uma foto (JPG ou PNG).", 400);
  const bruto = Buffer.from(m[2], "base64");
  if (bruto.length > IMAGEM_MAX_BYTES) throw new MensagemError("A foto passa de 5 MB. Envie uma menor.", 413);
  try {
    return await sharp(bruto, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new MensagemError("Não consegui ler essa foto. Envie em JPG ou PNG.", 400);
  }
}

/* ------------------------------------------------------------------ *
 * Lista
 * ------------------------------------------------------------------ */

const souDono = (eu: Participante) =>
  or(and(eq(conversas.aTipo, eu.tipo), eq(conversas.aId, eu.id)), and(eq(conversas.bTipo, eu.tipo), eq(conversas.bId, eu.id)))!;

export async function resumoDasMensagens(req: Request, como?: unknown) {
  const eu = await minhaIdentidade(req, como);
  const [r] = await db
    .select({
      total: sql<number>`coalesce(sum(case when ${conversas.aTipo} = ${eu.tipo} and ${conversas.aId} = ${eu.id} then ${conversas.naoLidasA} else ${conversas.naoLidasB} end), 0)::int`,
    })
    .from(conversas)
    .where(souDono(eu));
  // As mensagens de grupo contam no mesmo número do console (só apostador está em grupo).
  const doGrupo = eu.tipo === "comprador" ? await naoLidasDeGrupos(eu.id) : 0;
  return { naoLidas: (r?.total ?? 0) + doGrupo };
}

export async function listarConversas(req: Request, q: { aba?: unknown; depois?: unknown; limite?: unknown; como?: unknown }) {
  const eu = await minhaIdentidade(req, q.como);
  await tocarPresenca(eu);
  const pedidos = q.aba === "pedidos";
  const limite = limiteDaPagina(q.limite, PAGINA_DE_CONVERSAS);
  const cursor = lerCursor(q.depois);

  // Pedido que chegou para mim e ainda não respondi vai para a aba "Pedidos".
  const pedidoParaMim = sql`(${conversas.situacao} = 'pedido' and (case when ${conversas.aTipo} = ${eu.tipo} and ${conversas.aId} = ${eu.id} then 'a' else 'b' end) <> ${conversas.iniciadaPor})`;
  const filtros = [souDono(eu), pedidos ? pedidoParaMim : sql`not ${pedidoParaMim}`];
  if (cursor) {
    filtros.push(
      or(
        lt(conversas.ultimaEm, cursor.criadoEm),
        and(eq(conversas.ultimaEm, cursor.criadoEm), lt(conversas.id, cursor.id)),
      )!,
    );
  }
  const linhas = await db
    .select()
    .from(conversas)
    .where(and(...filtros))
    .orderBy(desc(conversas.ultimaEm), desc(conversas.id))
    .limit(limite + 1);
  const { itens, proximo } = cortarPagina(linhas.map((c) => ({ ...c, criadoEm: c.ultimaEm })), limite);

  const perfis = await perfisDe(itens.map((c) => parceiro(c, lado(c, eu)!)));
  const online = await onlineDosParceiros(eu, itens.map((c) => ({ chave: c.id, parceiro: parceiro(c, lado(c, eu)!), situacao: c.situacao as SituacaoDaConversa, bloqueada: Boolean(c.bloqueadaPor), encerrada: Boolean(c.encerradaEm) })));
  return {
    itens: itens.map((c) => {
      const l = lado(c, eu)!;
      return {
        id: c.id,
        com: perfilOu(perfis, parceiro(c, l)),
        online: online.has(c.id),
        previa: c.previa,
        ultimaEm: c.ultimaEm.toISOString(),
        naoLidas: l === "a" ? c.naoLidasA : c.naoLidasB,
        situacao: c.situacao,
        euIniciei: c.iniciadaPor === l,
        bloqueada: Boolean(c.bloqueadaPor),
      };
    }),
    proximo,
  };
}

/* ------------------------------------------------------------------ *
 * Achar com quem falar
 * ------------------------------------------------------------------ */

/**
 * Procura pelo texto exato: `@apelido`, o endereço da organização ou o
 * código do afiliado. Nunca lista — quem procura precisa saber o nome, e a
 * busca tem limite (varrer a base seria o primeiro passo do spam).
 */
export async function acharDestino(req: Request, texto: unknown, como?: unknown) {
  const eu = await minhaIdentidade(req, como);
  const t = typeof texto === "string" ? texto.trim().slice(0, 60) : "";
  if (!t) throw new MensagemError("Digite o apelido, o endereço da organização ou o código.", 400);
  if ((await hit(`msg-busca:${eu.tipo}:${eu.id}`, 10, 30)).excedeu) throw new MensagemError("Muitas buscas seguidas. Espere alguns minutos.", 429);

  let achado: Participante | null = null;
  if (t.startsWith("@")) {
    const [b] = await db.select({ id: buyers.id }).from(buyers).where(sql`lower(${buyers.apelido}) = ${t.slice(1).toLowerCase()}`);
    if (b) achado = { tipo: "comprador", id: b.id };
  } else {
    const [o] = await db.select({ id: organizations.id }).from(organizations).where(sql`lower(${organizations.slug}) = ${t.toLowerCase()}`);
    if (o) achado = { tipo: "organizacao", id: o.id };
    else {
      const [a] = await db.select({ id: affiliates.id }).from(affiliates).where(sql`lower(${affiliates.code}) = ${t.toLowerCase()}`);
      if (a) achado = { tipo: "afiliado", id: a.id };
    }
  }
  if (!achado || (achado.tipo === eu.tipo && achado.id === eu.id)) throw new MensagemError("Ninguém encontrado com esse nome.", 404);
  const perfil = perfilOu(await perfisDe([achado]), achado);
  if (!perfil.ativo) throw new MensagemError("Ninguém encontrado com esse nome.", 404);
  return { para: achado, com: perfil };
}

/* ------------------------------------------------------------------ *
 * Escrever
 * ------------------------------------------------------------------ */

async function rifaDoCartao(slug: unknown) {
  if (!slug) return null;
  const [r] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.slug, String(slug)), eq(campaigns.status, "published"), sql`${campaigns.travadaEm} is null`));
  if (!r) throw new MensagemError("Rifa não encontrada.", 404);
  return r.id;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Grava a mensagem e move a conversa: prévia, hora, não lidas e situação. */
async function gravar(tx: Tx, c: Conversa, eu: Lado, texto: string, campaignId: string | null, foto: Buffer | null = null) {
  const [m] = await tx.insert(mensagens).values({ conversaId: c.id, de: eu, texto, campaignId }).returning();
  if (foto) await tx.insert(mensagemImagens).values({ mensagemId: m.id, conversaId: c.id, bytes: foto });
  const outro = outroLado(eu);
  await tx
    .update(conversas)
    .set({
      previa: foto && !texto ? PREVIA_DA_FOTO : campaignId && !texto ? "Compartilhou uma rifa" : previaDoTexto(texto),
      ultimaEm: m.createdAt,
      situacao: situacaoDepoisDeEnviar(estadoDe(c), eu),
      ...(outro === "a" ? { naoLidasA: sql`${conversas.naoLidasA} + 1` } : { naoLidasB: sql`${conversas.naoLidasB} + 1` }),
      ...(eu === "a" ? { naoLidasA: 0 } : { naoLidasB: 0 }),
    })
    .where(eq(conversas.id, c.id));
  return m;
}

function textoDaMensagem(entrada: { texto?: unknown; rifa?: unknown; imagem?: unknown }) {
  // O cartão da rifa e a foto podem ir sozinhos; o texto, quando vem, passa pela régua.
  const semTexto = typeof entrada.texto !== "string" || !entrada.texto.trim();
  if (semTexto && (entrada.rifa || entrada.imagem)) return "";
  const p = problemaNaMensagem(entrada.texto);
  if (p) throw new MensagemError(p, 400);
  return limparMensagem(String(entrada.texto));
}

async function limiteDeMensagens(eu: Participante) {
  if ((await hit(`mensagem:${eu.tipo}:${eu.id}`, JANELA_DE_MENSAGENS_MIN, MENSAGENS_POR_JANELA)).excedeu) {
    throw new MensagemError("Muitas mensagens seguidas. Espere alguns minutos.", 429);
  }
}

/** Depois da transação: avisa o apostador e varre o Pix por fora. Nunca derruba o envio. */
function aposEnviar(c: Conversa, de: Lado, eu: Participante, texto: string, msgId: string) {
  const destino = parceiro(c, de);
  if (destino.tipo === "comprador") {
    // Um aviso por conversa a cada 30 min: a chave leva a janela. Sem o texto.
    const chave = `${c.id}:${Math.floor(Date.now() / (30 * 60_000))}`;
    emSegundoPlano(
      (async () => {
        const nome = perfilOu(await perfisDe([eu]), eu).nome;
        return avisar([destino.id], "mensagem", chave, {
          title: "Nova mensagem",
          body: `${nome} enviou uma mensagem.`,
          url: "/mensagens",
          tag: `mensagem-${c.id}`,
        });
      })(),
      "mensagem nova",
    );
  }
  if (eu.tipo !== "comprador" && texto) {
    const trecho = pedePagamentoPorFora(texto);
    if (trecho) {
      emSegundoPlano(denunciaAutomatica(c.id, trecho, msgId), "varredura de mensagem");
    }
  }
}

const protocolo = () => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).replace(/-/g, "");
  return `DM-${d}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
};

async function trechoDa(conversaId: string) {
  const linhas = await db
    .select({ de: mensagens.de, texto: mensagens.texto, em: mensagens.createdAt, imagem: mensagemImagens.id })
    .from(mensagens)
    .leftJoin(mensagemImagens, eq(mensagemImagens.mensagemId, mensagens.id))
    .where(eq(mensagens.conversaId, conversaId))
    .orderBy(desc(mensagens.createdAt), desc(mensagens.id))
    .limit(TRECHO_DA_DENUNCIA);
  // A foto entra no trecho só pelo id: a plataforma a abre pela rota auditada.
  return linhas.reverse().map((m) => ({ de: m.de, texto: m.texto, em: m.em.toISOString(), ...(m.imagem ? { imagem: m.imagem } : {}) }));
}

async function denunciaAutomatica(conversaId: string, trecho: string, _msgId: string) {
  try {
    await db
      .insert(mensagemDenuncias)
      .values({
        protocolo: protocolo(),
        conversaId,
        lado: "automatica",
        motivo: "pix_fora",
        texto: `Varredura automática: "${trecho}"`,
        trecho: await trechoDa(conversaId),
      })
      .onConflictDoNothing();
  } catch (err) {
    if (!isUniqueViolation(err, "uq_mensagem_denuncia_protocolo")) throw err;
  }
}

/** Abre a conversa (ou segue a que já existe) e envia a primeira mensagem. */
export async function iniciarConversa(
  req: Request,
  entrada: { para?: { tipo?: unknown; id?: unknown }; texto?: unknown; rifa?: unknown; como?: unknown },
) {
  const eu = await minhaIdentidade(req, entrada.como);
  const tipo = entrada.para?.tipo;
  const id = String(entrada.para?.id ?? "");
  if ((tipo !== "comprador" && tipo !== "organizacao" && tipo !== "afiliado") || !UUID.test(id)) {
    throw new MensagemError("Escolha com quem falar.", 400);
  }
  const para: Participante = { tipo, id };
  if (para.tipo === eu.tipo && para.id === eu.id) throw new MensagemError("Você não pode mandar mensagem para si mesmo.", 400);

  // Erro de preenchimento sai antes de contar a tentativa.
  const texto = textoDaMensagem(entrada);
  const campaignId = await rifaDoCartao(entrada.rifa);
  if (!perfilOu(await perfisDe([para]), para).ativo) throw new MensagemError("Ninguém encontrado.", 404);
  if ((await hit(`conversa-nova:${eu.tipo}:${eu.id}`, 24 * 60, CONVERSAS_NOVAS_POR_DIA)).excedeu) {
    throw new MensagemError("Você abriu muitas conversas hoje. Tente amanhã.", 429);
  }
  await limiteDeMensagens(eu);

  // Quem segue a organização conversa direto; o resto é pedido de mensagem.
  const comprador = eu.tipo === "comprador" ? eu : para.tipo === "comprador" ? para : null;
  const org = eu.tipo === "organizacao" ? eu : para.tipo === "organizacao" ? para : null;
  let segue = false;
  if (comprador && org) {
    const [s] = await db
      .select({ b: seguidores.buyerId })
      .from(seguidores)
      .where(and(eq(seguidores.buyerId, comprador.id), eq(seguidores.organizationId, org.id)));
    segue = Boolean(s);
  }

  const par = ordenarPar(eu, para);
  const resultado = await db.transaction(async (tx) => {
    const [nova] = await tx
      .insert(conversas)
      .values({
        aTipo: par.a.tipo,
        aId: par.a.id,
        bTipo: par.b.tipo,
        bId: par.b.id,
        situacao: situacaoInicial({ apostadorSegueAOrganizacao: segue }),
        iniciadaPor: par.ladoDeX,
      })
      .onConflictDoNothing()
      .returning();
    // A conversa já existia: trava a linha e segue as regras dela.
    const [c] = nova
      ? [nova]
      : await tx
          .select()
          .from(conversas)
          .where(and(eq(conversas.aTipo, par.a.tipo), eq(conversas.aId, par.a.id), eq(conversas.bTipo, par.b.tipo), eq(conversas.bId, par.b.id)))
          .for("update");
    const problema = nova ? null : problemaParaEnviar(estadoDe(c), par.ladoDeX);
    if (problema) throw new MensagemError(problema, 409);
    const m = await gravar(tx, c, par.ladoDeX, texto, campaignId);
    return { c, m };
  });
  aposEnviar(resultado.c, par.ladoDeX, eu, texto, resultado.m.id);
  return { id: resultado.c.id };
}

export async function enviar(req: Request, conversaId: string, entrada: { texto?: unknown; rifa?: unknown; imagem?: unknown; como?: unknown }) {
  const eu = await minhaIdentidade(req, entrada.como);
  await minhaConversa(eu, conversaId); // 404 antes de qualquer outra coisa
  const texto = textoDaMensagem(entrada);
  const campaignId = await rifaDoCartao(entrada.rifa);
  await limiteDeMensagens(eu);
  let foto: Buffer | null = null;
  if (entrada.imagem !== undefined && entrada.imagem !== null && entrada.imagem !== "") {
    if (!podeEnviarImagem(eu.tipo)) throw new MensagemError("Só apostadores enviam foto. Escreva a mensagem em texto.", 403);
    // Conta a tentativa antes de abrir a imagem: foto custa banco e processador.
    if ((await hit(`mensagem-foto:${eu.tipo}:${eu.id}`, 24 * 60, IMAGENS_POR_DIA)).excedeu) {
      throw new MensagemError("Muitas fotos hoje. Tente amanhã.", 429);
    }
    foto = await processarFoto(entrada.imagem);
  }
  if (!texto && !campaignId && !foto) throw new MensagemError("Escreva uma mensagem.", 400);

  const r = await db.transaction(async (tx) => {
    const [c] = await tx.select().from(conversas).where(eq(conversas.id, conversaId)).for("update");
    const l = c ? lado(c, eu) : null;
    if (!c || !l) throw new MensagemError("Conversa não encontrada.", 404);
    const problema = problemaParaEnviar(estadoDe(c), l);
    if (problema) throw new MensagemError(problema, 409);
    const m = await gravar(tx, c, l, texto, campaignId, foto);
    return { c, l, m };
  });
  await tocarPresenca(eu);
  aposEnviar(r.c, r.l, eu, texto, r.m.id);
  return { id: r.m.id };
}

/** A foto de uma mensagem, só para quem está na conversa (404 para o resto). */
export async function fotoDaConversa(req: Request, conversaId: string, fotoId: string, como?: unknown) {
  const eu = await minhaIdentidade(req, como);
  const { c } = await minhaConversa(eu, conversaId);
  if (!UUID.test(fotoId)) throw new MensagemError("Foto não encontrada.", 404);
  const [f] = await db
    .select({ bytes: mensagemImagens.bytes })
    .from(mensagemImagens)
    .where(and(eq(mensagemImagens.id, fotoId), eq(mensagemImagens.conversaId, c.id)));
  if (!f) throw new MensagemError("Foto não encontrada.", 404);
  return f.bytes;
}

/* ------------------------------------------------------------------ *
 * Ler
 * ------------------------------------------------------------------ */

export async function lerConversa(req: Request, conversaId: string, q: { antes?: unknown; como?: unknown }) {
  const eu = await minhaIdentidade(req, q.como);
  const { c, l } = await minhaConversa(eu, conversaId);
  await tocarPresenca(eu);
  const cursor = lerCursor(q.antes);
  const filtros = [eq(mensagens.conversaId, c.id)];
  if (cursor) {
    filtros.push(
      or(
        lt(mensagens.createdAt, cursor.criadoEm),
        and(eq(mensagens.createdAt, cursor.criadoEm), lt(mensagens.id, cursor.id)),
      )!,
    );
  }
  const linhas = await db
    .select({
      id: mensagens.id,
      de: mensagens.de,
      texto: mensagens.texto,
      criadoEm: mensagens.createdAt,
      rifaSlug: campaigns.slug,
      rifaTitulo: campaigns.prizeTitle,
      rifaOrg: sql<string | null>`(select slug from organizations where id = ${campaigns.organizationId})`,
      fotoId: mensagemImagens.id,
    })
    .from(mensagens)
    .leftJoin(campaigns, eq(campaigns.id, mensagens.campaignId))
    .leftJoin(mensagemImagens, eq(mensagemImagens.mensagemId, mensagens.id))
    .where(and(...filtros))
    .orderBy(desc(mensagens.createdAt), desc(mensagens.id))
    .limit(PAGINA_DE_MENSAGENS + 1);
  const { itens, proximo } = cortarPagina(linhas, PAGINA_DE_MENSAGENS);
  const com = perfilOu(await perfisDe([parceiro(c, l)]), parceiro(c, l));
  const impedimento = problemaParaEnviar(estadoDe(c), l);
  const online = await onlineDosParceiros(eu, [{ chave: c.id, parceiro: parceiro(c, l), situacao: c.situacao as SituacaoDaConversa, bloqueada: Boolean(c.bloqueadaPor), encerrada: Boolean(c.encerradaEm) }]);
  return {
    conversa: {
      id: c.id,
      com,
      online: online.has(c.id),
      // Foto: só o apostador manda; a tela só mostra o botão a quem pode.
      podeEnviarFoto: podeEnviarImagem(eu.tipo),
      situacao: c.situacao,
      euIniciei: c.iniciadaPor === l,
      bloqueadaPorMim: c.bloqueadaPor === l,
      bloqueada: Boolean(c.bloqueadaPor),
      encerrada: Boolean(c.encerradaEm),
      podeEnviar: !impedimento && com.ativo,
      impedimento: impedimento ?? (com.ativo ? null : "Esta conta não está mais disponível."),
      naoLidas: l === "a" ? c.naoLidasA : c.naoLidasB,
    },
    // As mais novas primeiro; a tela inverte para mostrar de baixo para cima.
    itens: itens.map((m) => ({
      id: m.id,
      minha: m.de === l,
      texto: m.texto,
      em: m.criadoEm.toISOString(),
      foto: m.fotoId ? `/api/public/mensagens/conversas/${c.id}/fotos/${m.fotoId}` : null,
      rifa: m.rifaSlug ? { slug: m.rifaSlug, titulo: m.rifaTitulo!, caminho: m.rifaOrg ? `/o/${m.rifaOrg}/r/${m.rifaSlug}` : `/r/${m.rifaSlug}` } : null,
    })),
    proximo,
  };
}

export async function marcarLida(req: Request, conversaId: string, como?: unknown) {
  const eu = await minhaIdentidade(req, como);
  const { c, l } = await minhaConversa(eu, conversaId);
  await db
    .update(conversas)
    .set(l === "a" ? { naoLidasA: 0 } : { naoLidasB: 0 })
    .where(eq(conversas.id, c.id));
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Responder pedido, bloquear, denunciar
 * ------------------------------------------------------------------ */

export async function responderPedido(req: Request, conversaId: string, acao: unknown, como?: unknown) {
  const eu = await minhaIdentidade(req, como);
  const { c, l } = await minhaConversa(eu, conversaId);
  if (acao !== "aceitar" && acao !== "recusar") throw new MensagemError("Escolha aceitar ou recusar.", 400);
  // `UPDATE` condicional: só quem recebeu responde, e só enquanto é pedido.
  const r = await db
    .update(conversas)
    .set({ situacao: acao === "aceitar" ? "aceita" : "recusada" })
    .where(and(eq(conversas.id, c.id), eq(conversas.situacao, "pedido"), sql`${conversas.iniciadaPor} <> ${l}`, sql`${conversas.encerradaEm} is null`))
    .returning({ id: conversas.id });
  if (r.length === 0) throw new MensagemError("Este pedido já foi respondido.", 409);
  return { situacao: acao === "aceitar" ? "aceita" : "recusada" };
}

export async function bloquear(req: Request, conversaId: string, ligar: boolean, como?: unknown) {
  const eu = await minhaIdentidade(req, como);
  const { c, l } = await minhaConversa(eu, conversaId);
  const cond = ligar ? sql`${conversas.bloqueadaPor} is null` : eq(conversas.bloqueadaPor, l);
  const r = await db
    .update(conversas)
    .set({ bloqueadaPor: ligar ? l : null })
    .where(and(eq(conversas.id, c.id), cond))
    .returning({ id: conversas.id });
  if (r.length === 0) throw new MensagemError(ligar ? "A conversa já está bloqueada." : "Só quem bloqueou desbloqueia.", 409);
  return { bloqueada: ligar };
}

export async function denunciarConversa(req: Request, conversaId: string, entrada: { motivo?: unknown; texto?: unknown; como?: unknown }) {
  const eu = await minhaIdentidade(req, entrada.como);
  const { c, l } = await minhaConversa(eu, conversaId);
  if (!motivoDaMensagemValido(entrada.motivo)) throw new MensagemError("Escolha o motivo da denúncia.", 400);
  const texto = typeof entrada.texto === "string" ? entrada.texto.trim().slice(0, DENUNCIA_TEXTO_MAX) : "";
  if ((await hit(`denuncia-conversa:${eu.tipo}:${eu.id}`, 24 * 60, DENUNCIAS_POR_DIA)).excedeu) {
    throw new MensagemError("Muitas denúncias hoje. Tente amanhã.", 429);
  }
  try {
    const [d] = await db
      .insert(mensagemDenuncias)
      .values({ protocolo: protocolo(), conversaId: c.id, lado: l, motivo: entrada.motivo, texto: texto || null, trecho: await trechoDa(c.id) })
      .returning({ protocolo: mensagemDenuncias.protocolo });
    return { protocolo: d.protocolo };
  } catch (err) {
    if (isUniqueViolation(err, "uq_denuncia_conversa_aberta")) throw new MensagemError("Você já denunciou esta conversa. A plataforma vai analisar.", 409);
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * A plataforma
 * ------------------------------------------------------------------ */

export async function conversasDenunciadasAbertas() {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mensagemDenuncias)
    .where(eq(mensagemDenuncias.status, "aberta"));
  return r?.n ?? 0;
}

/** A fila: sem texto de mensagem — só o que identifica o caso. */
export async function listarDenunciasDeConversa(status?: string) {
  const linhas = await db
    .select({
      id: mensagemDenuncias.id,
      protocolo: mensagemDenuncias.protocolo,
      motivo: mensagemDenuncias.motivo,
      lado: mensagemDenuncias.lado,
      status: mensagemDenuncias.status,
      createdAt: mensagemDenuncias.createdAt,
      c: conversas,
    })
    .from(mensagemDenuncias)
    .innerJoin(conversas, eq(conversas.id, mensagemDenuncias.conversaId))
    .where(status ? eq(mensagemDenuncias.status, status) : undefined)
    .orderBy(desc(mensagemDenuncias.createdAt))
    .limit(100);
  const perfis = await perfisDe(linhas.flatMap((d) => [parceiro(d.c, "a"), parceiro(d.c, "b")]));
  return linhas.map((d) => ({
    id: d.id,
    protocolo: d.protocolo,
    motivo: d.motivo,
    motivoTexto: MOTIVOS_DA_DENUNCIA_DE_MENSAGEM[d.motivo as keyof typeof MOTIVOS_DA_DENUNCIA_DE_MENSAGEM] ?? d.motivo,
    automatica: d.lado === "automatica",
    status: d.status,
    criadaEm: d.createdAt.toISOString(),
    partes: [perfilOu(perfis, { tipo: d.c.aTipo as TipoDeParticipante, id: d.c.aId }), perfilOu(perfis, { tipo: d.c.bTipo as TipoDeParticipante, id: d.c.bId })].map((p) => ({ tipo: p.tipo, nome: p.nome })),
  }));
}

/**
 * A foto de uma mensagem denunciada, para a plataforma: só se o id está no
 * trecho gravado na denúncia (a plataforma nunca navega pela conversa). A
 * rota grava a auditoria antes de chamar.
 */
export async function fotoDaDenuncia(denunciaId: string, fotoId: string) {
  if (!UUID.test(denunciaId) || !UUID.test(fotoId)) throw new MensagemError("Foto não encontrada.", 404);
  const [d] = await db.select({ trecho: mensagemDenuncias.trecho, conversaId: mensagemDenuncias.conversaId }).from(mensagemDenuncias).where(eq(mensagemDenuncias.id, denunciaId));
  if (!d || !d.trecho.some((t) => t.imagem === fotoId)) throw new MensagemError("Foto não encontrada.", 404);
  const [f] = await db
    .select({ bytes: mensagemImagens.bytes })
    .from(mensagemImagens)
    .where(and(eq(mensagemImagens.id, fotoId), eq(mensagemImagens.conversaId, d.conversaId)));
  if (!f) throw new MensagemError("Foto não encontrada.", 404);
  return f.bytes;
}

/** O detalhe com o trecho. A rota grava a auditoria antes de chamar. */
export async function detalheDaDenunciaDeConversa(id: string) {
  if (!UUID.test(id)) throw new MensagemError("Denúncia não encontrada.", 404);
  const [d] = await db.select().from(mensagemDenuncias).where(eq(mensagemDenuncias.id, id));
  if (!d) throw new MensagemError("Denúncia não encontrada.", 404);
  const [c] = await db.select().from(conversas).where(eq(conversas.id, d.conversaId));
  const a: Participante = { tipo: c.aTipo as TipoDeParticipante, id: c.aId };
  const b: Participante = { tipo: c.bTipo as TipoDeParticipante, id: c.bId };
  const perfis = await perfisDe([a, b]);
  return {
    id: d.id,
    protocolo: d.protocolo,
    motivo: d.motivo,
    motivoTexto: MOTIVOS_DA_DENUNCIA_DE_MENSAGEM[d.motivo as keyof typeof MOTIVOS_DA_DENUNCIA_DE_MENSAGEM] ?? d.motivo,
    automatica: d.lado === "automatica",
    denunciou: d.lado === "a" || d.lado === "b" ? perfilOu(perfis, d.lado === "a" ? a : b).nome : null,
    texto: d.texto,
    status: d.status,
    decisao: d.decisao,
    criadaEm: d.createdAt.toISOString(),
    encerrada: Boolean(c.encerradaEm),
    partes: { a: perfilOu(perfis, a), b: perfilOu(perfis, b) },
    trecho: d.trecho,
  };
}

/**
 * Decidir é `UPDATE` condicional (`status = 'aberta'`). Procedente encerra a
 * conversa na mesma transação: ninguém mais escreve nela.
 */
export async function decidirDenunciaDeConversa(req: Request, id: string, entrada: { decisao?: unknown; resposta?: unknown }) {
  if (!UUID.test(id)) throw new MensagemError("Denúncia não encontrada.", 404);
  if (!decisaoValida(entrada.decisao)) throw new MensagemError("Escolha: procedente ou improcedente.", 400);
  const resposta = typeof entrada.resposta === "string" ? entrada.resposta.trim().slice(0, 1000) : "";
  if (entrada.decisao === "procedente" && !resposta) throw new MensagemError("Explique a decisão.", 400);
  return db.transaction(async (tx) => {
    const [d] = await tx
      .update(mensagemDenuncias)
      .set({ status: entrada.decisao as string, decisao: resposta || null, decididaPor: req.user!.id, decididaEm: new Date() })
      .where(and(eq(mensagemDenuncias.id, id), eq(mensagemDenuncias.status, "aberta")))
      .returning({ conversaId: mensagemDenuncias.conversaId });
    if (!d) throw new MensagemError("Esta denúncia já foi decidida ou não existe.", 409);
    if (entrada.decisao === "procedente") {
      await tx.update(conversas).set({ encerradaEm: new Date() }).where(eq(conversas.id, d.conversaId));
    }
    return { status: entrada.decisao };
  });
}
