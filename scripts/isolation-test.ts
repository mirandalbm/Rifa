/**
 * Teste de isolamento entre organizações.
 *
 * O multi-organizador tem um modo de falhar que não dá erro: a rota que
 * esquece o recorte responde 200 e entrega pedido, telefone e caixa do
 * vizinho. Ninguém reclama, porque parece que funcionou.
 *
 * Este script cria duas organizações com uma rifa e uma venda cada, entra
 * como o organizador de uma e tenta alcançar tudo da outra — por id, e também
 * olhando o CONTEÚDO das listas, que é onde o vazamento é silencioso.
 *
 *   npm run isolation
 *
 * Rode depois de mexer em qualquer rota de /api/admin. Rota nova que não
 * apareça aqui é rota que ninguém provou.
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { sql, eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { payouts, saqueNotas,
  organizations,
  campaigns,
  users,
  buyers,
  affiliates,
  orders,
  campaignStats,
  prizedQuotas,
  chamados,
  chamadoAnexos,
  stories,
  campanhaSolicitacoes,
  comentarios,
  divulgacoes,
  divulgacaoFotos,
  divulgacaoVideos,
  sorteiosOficiais,
  sorteioComentarios,
  campaignMedia,
} from "../shared/schema";
import { hashPassword } from "../server/auth";
import { mediaKey, storage } from "../server/services/storage";

const URL = baseUrl();

interface Lado {
  cambistaId: string;
  slug: string;
  nome: string;
  email: string;
  senha: string;
  orgId: string;
  userId: string;
  campaignId: string;
  orderCode: number;
  chamadoId: string;
  protocolo: string;
  anexoId: string;
  cookie: string;
}

let falhas = 0;

function checa(nome: string, ok: boolean, detalhe = "") {
  console.log(`    ${ok ? "✓" : "✗"} ${nome}${detalhe ? ` (${detalhe})` : ""}`);
  if (!ok) falhas++;
}

async function entrar(email: string, senha: string): Promise<string> {
  const res = await fetch(`${URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  if (!res.ok) throw new Error(`Entrada recusada para ${email}: ${res.status}`);
  const cookie = res.headers.getSetCookie?.().join("; ") ?? "";
  if (!cookie) throw new Error("O servidor não devolveu sessão.");
  return cookie;
}

async function pedir(cookie: string, caminho: string, init: RequestInit = {}) {
  return fetch(`${URL}${caminho}`, {
    ...init,
    headers: { Cookie: cookie, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

/** Monta uma organização completa: acesso, rifa e uma venda paga. */
async function montarLado(marca: string, indice: number): Promise<Lado> {
  const slug = `iso-${marca}`;
  const email = `iso-${marca}@rifa.teste`;
  const senha = `isolamento${indice}!`;

  const [org] = await db
    .insert(organizations)
    .values({ slug, name: `Organização ${marca}`, cidade: "Teste/TE" })
    .onConflictDoUpdate({ target: organizations.slug, set: { active: true, archivedAt: null } })
    .returning();

  const [usuario] = await db
    .insert(users)
    .values({
      role: "organizer",
      organizationId: org.id,
      name: `Organizador ${marca}`,
      email,
      passwordHash: await hashPassword(senha),
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { organizationId: org.id, passwordHash: await hashPassword(senha), active: true },
    })
    .returning({ id: users.id });

  const [campanha] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: `${slug}-rifa`,
      title: `Rifa ${marca}`,
      prizeTitle: `Prêmio ${marca}`,
      totalQuotas: 1000,
      priceCents: 500,
    })
    .onConflictDoUpdate({ target: campaigns.slug, set: { organizationId: org.id } })
    .returning();

  await db
    .insert(campaignStats)
    .values({ campaignId: campanha.id, soldCount: 10 * indice, revenueCents: 5000 * indice })
    .onConflictDoUpdate({
      target: campaignStats.campaignId,
      set: { soldCount: 10 * indice, revenueCents: 5000 * indice },
    });

  const [comprador] = await db
    .insert(buyers)
    // O ID do cliente (`C-…`) é o que a busca do painel procura.
    .values({ name: `Cliente ${marca}`, phone: `1196000000${indice}`, codigo: `C-ABCDEFG${indice + 1}` })
    .onConflictDoUpdate({ target: buyers.phone, set: { name: `Cliente ${marca}`, codigo: `C-ABCDEFG${indice + 1}` } })
    .returning();

  const orderCode = 92_000_000 + indice;
  await db
    .insert(orders)
    .values({
      code: orderCode,
      campaignId: campanha.id,
      buyerId: comprador.id,
      quantity: 10,
      amountCents: 5000 * indice,
      status: "paid",
      paidAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .onConflictDoNothing();
  const [pedido] = await db.select({ id: orders.id }).from(orders).where(eq(orders.code, orderCode));

  // Uma venda de cambista: o freguês dele é cliente da organização e aparece
  // completo no painel; o comprador online acima é da plataforma.
  const [cambistaUser] = await db
    .insert(users)
    .values({
      role: "cambista",
      organizationId: org.id,
      name: `Cambista ${marca}`,
      email: `iso-cambista-${marca}@rifa.teste`,
      passwordHash: await hashPassword(senha),
    })
    .onConflictDoUpdate({ target: users.email, set: { organizationId: org.id } })
    .returning({ id: users.id });
  const [cambista] = await db
    .insert(affiliates)
    .values({ userId: cambistaUser.id, code: `ISOCB${indice}`, kind: "cambista", status: "active" })
    .onConflictDoUpdate({ target: affiliates.code, set: { userId: cambistaUser.id } })
    .returning({ id: affiliates.id });
  const [fregues] = await db
    .insert(buyers)
    .values({ name: `Freguês ${marca}`, phone: `1196100000${indice}` })
    .onConflictDoUpdate({ target: buyers.phone, set: { name: `Freguês ${marca}` } })
    .returning();
  await db
    .insert(orders)
    .values({
      code: 92_100_000 + indice,
      campaignId: campanha.id,
      buyerId: fregues.id,
      sellerId: cambista.id,
      method: "dinheiro",
      quantity: 2,
      amountCents: 1000,
      status: "paid",
      paidAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .onConflictDoNothing();

  // Um comentário do comprador na rifa deste lado: o sino do painel do
  // vizinho não pode listá-lo.
  await db
    .insert(comentarios)
    .values({ campaignId: campanha.id, organizationId: org.id, autor: "comprador", buyerId: comprador.id, texto: `comentário na rifa ${marca}` })
    .onConflictDoNothing();

  // Um pedido de reembolso por lado, com o print: é o dado mais sensível da
  // organização (CPF, chave Pix, foto do bilhete).
  const protocolo = `RB-20260926-90000${indice}`;
  await db.delete(chamados).where(eq(chamados.protocolo, protocolo));
  const [chamado] = await db
    .insert(chamados)
    .values({
      protocolo,
      organizationId: org.id,
      orderId: pedido.id,
      buyerId: comprador.id,
      motivo: `Reembolso de teste ${marca}`,
      pixChave: `pix-${marca}@teste`,
    })
    .returning({ id: chamados.id });
  const [anexo] = await db
    .insert(chamadoAnexos)
    .values({ chamadoId: chamado.id, mime: "image/jpeg", bytes: Buffer.from([0xff, 0xd8, 0xff]), tamanho: 3 })
    .returning({ id: chamadoAnexos.id });

  return {
    cambistaId: cambista.id,
    slug,
    nome: marca,
    email,
    senha,
    orgId: org.id,
    userId: usuario.id,
    campaignId: campanha.id,
    orderCode,
    chamadoId: chamado.id,
    protocolo,
    anexoId: anexo.id,
    cookie: await entrar(email, senha),
  };
}

/** Cada uma destas devolve 404: para quem não é dono, aquilo não existe. */
async function alcancaOVizinho(eu: Lado, vizinho: Lado) {
  const c = vizinho.campaignId;
  // Um story do vizinho no ar: apagar pelo id dele tem de dar 404.
  // Um saque pedido à organização do vizinho, com a nota fiscal: a nota é 404 para mim.
  const [saqueDoVizinho] = await db
    .insert(payouts)
    .values({ affiliateId: vizinho.cambistaId, organizationId: vizinho.orgId, amountCents: 1, pixKey: "iso@pix" })
    .returning({ id: payouts.id });
  await db.insert(saqueNotas).values({ payoutId: saqueDoVizinho.id, mime: "application/pdf", tamanho: 1, dados: Buffer.from([0]), iv: Buffer.alloc(12), tag: Buffer.alloc(16), chaveVersao: "v1" });
  const [storyDoVizinho] = await db
    .insert(stories)
    .values({ organizationId: vizinho.orgId, mime: "image/webp", bytes: Buffer.from([0]), expiraEm: new Date(Date.now() + 3_600_000) })
    .returning({ id: stories.id });
  // Um pedido de mudança do vizinho em análise: ler, responder e cancelar
  // pelo id dele tem de dar 404.
  const [pedidoDoVizinho] = await db
    .insert(campanhaSolicitacoes)
    .values({
      protocolo: `RS-ISOL-${Date.now()}`,
      campaignId: c,
      organizationId: vizinho.orgId,
      tipo: "edicao",
      alteracoes: { title: { de: "a", para: "b" } },
    })
    .returning({ id: campanhaSolicitacoes.id });
  // Um comentário na rifa do vizinho: moderar pelo id dele tem de dar 404.
  const [comentarioDoVizinho] = await db
    .insert(comentarios)
    .values({ campaignId: c, organizationId: vizinho.orgId, autor: "organizacao", texto: "comentário do vizinho" })
    .returning({ id: comentarios.id });
  // Um comentário no sorteio oficial da plataforma: o sorteio não é de
  // organização nenhuma — moderar é da plataforma, o organizador recebe 404.
  const [sorteioDaPlataforma] = await db
    .insert(sorteiosOficiais)
    .values({ loteria: "federal", concurso: 70_000 + Math.floor(Math.random() * 9_000), sorteioEm: new Date(Date.now() + 86_400_000), titulo: "Isolamento comentários" })
    .returning({ id: sorteiosOficiais.id });
  const [comentarioDoSorteio] = await db
    .insert(sorteioComentarios)
    .values({ sorteioOficialId: sorteioDaPlataforma.id, texto: "comentário no sorteio oficial" })
    .returning({ id: sorteioComentarios.id });
  // Uma divulgação de terceiro esperando o vizinho: decidir pelo id dele tem de dar 404.
  const [divulgacaoDoVizinho] = await db
    .insert(divulgacoes)
    .values({ campaignId: c, organizationId: vizinho.orgId, autor: "apostador", legenda: "divulgação do vizinho", status: "em_analise" })
    .returning({ id: divulgacoes.id });
  const tentativas: [string, string, RequestInit][] = [
    ["POST aprovar divulgação do vizinho", `/api/admin/divulgacoes/${divulgacaoDoVizinho.id}`, { method: "POST", body: '{"acao":"aprovar","versao":0}' }],
    ["POST recusar divulgação do vizinho", `/api/admin/divulgacoes/${divulgacaoDoVizinho.id}`, { method: "POST", body: '{"acao":"recusar","motivo":"invadido","versao":0}' }],
    ["DELETE comentário na rifa do vizinho", `/api/public/comentarios/${comentarioDoVizinho.id}`, { method: "DELETE" }],
    ["DELETE comentário do sorteio oficial", `/api/public/sorteio-oficial/comentarios/${comentarioDoSorteio.id}`, { method: "DELETE" }],
    ["GET telefone do vizinho", `/api/admin/organizacoes/${vizinho.orgId}/telefone`, {}],
    ["POST código no telefone do vizinho", `/api/admin/organizacoes/${vizinho.orgId}/telefone`, { method: "POST", body: '{"telefone":"11999998888"}' }],
    ["POST confirmar telefone do vizinho", `/api/admin/organizacoes/${vizinho.orgId}/telefone/confirmar`, { method: "POST", body: '{"codigo":"123456"}' }],
    ["PATCH campanha", `/api/admin/campaigns/${c}`, { method: "PATCH", body: '{"title":"invadida"}' }],
    ["GET impedimentos", `/api/admin/campaigns/${c}/blockers`, {}],
    ["POST publicar", `/api/admin/campaigns/${c}/publish`, { method: "POST" }],
    ["PUT pacotes", `/api/admin/campaigns/${c}/packages`, { method: "PUT", body: '{"packages":[]}' }],
    ["GET mídia", `/api/admin/campaigns/${c}/media`, {}],
    ["GET cotas premiadas", `/api/admin/campaigns/${c}/prized`, {}],
    ["GET sorteio", `/api/admin/campaigns/${c}/draw`, {}],
    ["GET exportar cotas", `/api/admin/exportacoes/cotas?campanha=${c}`, {}],
    ["GET exportar sorteio", `/api/admin/exportacoes/sorteio?campanha=${c}`, {}],
    ["PATCH organização", `/api/admin/organizacoes/${vizinho.orgId}`, { method: "PATCH", body: '{"name":"tomada"}' }],
    ["GET extrato de cobrança do vizinho", `/api/admin/cobranca/extrato?organizacao=${vizinho.orgId}`, {}],
    ["POST redefinir senha do vizinho", `/api/admin/usuarios/${vizinho.userId}/senha`, { method: "POST", body: '{"password":"tomada-da-conta"}' }],
    ["PATCH comissão do vizinho", `/api/admin/organizacoes/${vizinho.orgId}`, { method: "PATCH", body: '{"liberacaoComissao":"imediata"}' }],
    ["PUT dados legais do vizinho", `/api/admin/campaigns/${c}/legal`, { method: "PUT", body: '{"authorizationCode":"invadido-123"}' }],
    ["GET certificado do vizinho", `/api/admin/campaigns/${c}/certificado`, {}],
    ["GET chamado do vizinho", `/api/admin/chamados/${vizinho.chamadoId}`, {}],
    ["GET print do chamado do vizinho", `/api/admin/chamados/anexos/${vizinho.anexoId}`, {}],
    ["POST responder no chamado do vizinho", `/api/admin/chamados/${vizinho.chamadoId}/mensagens`, { method: "POST", body: '{"texto":"invadido"}' }],
    ["POST concluir chamado do vizinho", `/api/admin/chamados/${vizinho.chamadoId}/concluir`, { method: "POST", body: '{"decisao":"aprovado","resposta":"aprovado por invasor"}' }],
    ["POST estornar pelo chamado do vizinho", `/api/admin/chamados/${vizinho.chamadoId}/estornar`, { method: "POST" }],
    ["PATCH prazo de reembolso do vizinho", `/api/admin/organizacoes/${vizinho.orgId}`, { method: "PATCH", body: '{"prazoEstornoDias":30}' }],
    ["PATCH desligar o vizinho", `/api/admin/usuarios/${vizinho.userId}`, { method: "PATCH", body: '{"active":false}' }],
    // Corpo válido de propósito: um 400 de validação esconderia a falta do recorte.
    ["PUT endereço do vizinho", `/api/admin/organizacoes/${vizinho.orgId}/endereco`, { method: "PUT", body: ENDERECO_VALIDO }],
    ["PUT transmissão do vizinho", `/api/admin/campaigns/${c}/transmissao`, { method: "PUT", body: '{"url":"https://youtube.com/live/invadido"}' }],
    ["PUT sorteio oficial da rifa do vizinho", `/api/admin/campaigns/${c}/sorteio-oficial`, { method: "PUT", body: '{"sorteioOficialId":null}' }],
    ["PUT legenda do vizinho", `/api/admin/campaigns/${c}/legenda`, { method: "PUT", body: '{"legenda":"legenda invadida"}' }],
    ["PUT banner de divulgação da rifa do vizinho", `/api/admin/campaigns/${c}/banner-divulgacao`, { method: "PUT", body: JSON.stringify({ nome: "Entidade invadida", texto: "Texto de quem não é dono desta rifa.", imagem: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" }) }],
    ["DELETE banner de divulgação da rifa do vizinho", `/api/admin/campaigns/${c}/banner-divulgacao`, { method: "DELETE" }],
    ["GET banner de divulgação da rifa do vizinho pelo painel", `/api/admin/campaigns/${c}/banner-divulgacao`, {}],
    ["GET imagem do banner de divulgação do vizinho pelo painel", `/api/admin/campaigns/${c}/banner-divulgacao/imagem`, {}],
    ["PUT agendar publicação da rifa do vizinho", `/api/admin/campaigns/${c}/agendar-publicacao`, { method: "PUT", body: JSON.stringify({ publicarEm: new Date(Date.now() + 3_600_000).toISOString() }) }],
    ["PUT perfil público do vizinho", `/api/admin/organizacoes/${vizinho.orgId}/perfil`, { method: "PUT", body: '{"bio":"perfil invadido"}' }],
    ["DELETE story do vizinho", `/api/admin/stories/${storyDoVizinho.id}`, { method: "DELETE" }],
    // A porta do painel serve o story agendado; a do vizinho não existe para mim.
    ["GET imagem do story do vizinho pelo painel", `/api/admin/stories/${storyDoVizinho.id}/imagem`, {}],
    ["GET pôster do story do vizinho pelo painel", `/api/admin/stories/${storyDoVizinho.id}/poster`, {}],
    ["PUT foto do ganhador do vizinho", `/api/admin/campaigns/${c}/foto-ganhador`, { method: "PUT", body: '{"foto":null}' }],
    ["POST endereço curto do perfil do vizinho", `/api/admin/organizacoes/${vizinho.orgId}/link-curto`, { method: "POST" }],
    ["GET cliques nos links do vizinho", `/api/admin/organizacoes/${vizinho.orgId}/links/cliques`, {}],
    ["GET verificação do vizinho", `/api/admin/organizacoes/${vizinho.orgId}/verificacao`, {}],
    ["PUT dados da verificação do vizinho", `/api/admin/organizacoes/${vizinho.orgId}/verificacao`, { method: "PUT", body: "{}" }],
    ["PUT documento da verificação do vizinho", `/api/admin/organizacoes/${vizinho.orgId}/verificacao/documentos/cartao_cnpj`, { method: "PUT", body: "{}" }],
    ["GET documento da verificação do vizinho", `/api/admin/organizacoes/${vizinho.orgId}/verificacao/documentos/cartao_cnpj`, {}],
    ["GET nota fiscal do saque pedido ao vizinho", `/api/admin/payouts/${saqueDoVizinho.id}/nota`, {}],
    ["GET pedido de renovação do consentimento do vizinho", `/api/admin/organizacoes/${vizinho.orgId}/verificacao/consentimento`, {}],
    ["POST endereço curto da rifa do vizinho", `/api/admin/campaigns/${c}/link-curto`, { method: "POST" }],
    ["POST editar rifa do vizinho", `/api/admin/campaigns/${c}/editar`, { method: "POST", body: '{"title":"invadida"}' }],
    ["POST adiar sorteio do vizinho", `/api/admin/campaigns/${c}/adiar`, { method: "POST", body: '{"novaData":"2099-01-01T00:00:00Z","motivo":"adiamento invadido"}' }],
    ["GET pedido de mudança do vizinho", `/api/admin/solicitacoes/${pedidoDoVizinho.id}`, {}],
    ["POST mensagem no pedido do vizinho", `/api/admin/solicitacoes/${pedidoDoVizinho.id}/mensagens`, { method: "POST", body: '{"texto":"invadido"}' }],
    ["POST cancelar pedido do vizinho", `/api/admin/solicitacoes/${pedidoDoVizinho.id}/cancelar`, { method: "POST" }],
    // Por último: se o recorte falhasse, apagaria a rifa do vizinho.
    ["DELETE rifa do vizinho", `/api/admin/campaigns/${c}`, { method: "DELETE" }],
  ];

  for (const [nome, caminho, init] of tentativas) {
    const res = await pedir(eu.cookie, caminho, init);
    checa(nome, res.status === 404, `HTTP ${res.status}`);
  }
  const [pedidoAinda] = await db
    .select({ status: campanhaSolicitacoes.status })
    .from(campanhaSolicitacoes)
    .where(eq(campanhaSolicitacoes.id, pedidoDoVizinho.id));
  checa("o pedido do vizinho continua em análise", pedidoAinda?.status === "em_analise", pedidoAinda?.status);
  const meusPedidos = (await (await pedir(eu.cookie, "/api/admin/solicitacoes")).json()) as { id: string }[];
  checa("a lista de pedidos não traz o do vizinho", !meusPedidos.some((x) => x.id === pedidoDoVizinho.id));
  await db.delete(campanhaSolicitacoes).where(eq(campanhaSolicitacoes.id, pedidoDoVizinho.id));
  await db.delete(payouts).where(eq(payouts.id, saqueDoVizinho.id));
  const [comentarioAinda] = await db
    .select({ removidoEm: comentarios.removidoEm })
    .from(comentarios)
    .where(eq(comentarios.id, comentarioDoVizinho.id));
  checa("o comentário do vizinho continua no ar", Boolean(comentarioAinda) && !comentarioAinda.removidoEm);
  await db.delete(comentarios).where(eq(comentarios.id, comentarioDoVizinho.id));
  const [doSorteioAinda] = await db
    .select({ removidoEm: sorteioComentarios.removidoEm })
    .from(sorteioComentarios)
    .where(eq(sorteioComentarios.id, comentarioDoSorteio.id));
  checa("o comentário do sorteio oficial continua no ar", Boolean(doSorteioAinda) && !doSorteioAinda.removidoEm);
  await db.delete(sorteiosOficiais).where(eq(sorteiosOficiais.id, sorteioDaPlataforma.id));
  const [divulgacaoAinda] = await db.select({ status: divulgacoes.status }).from(divulgacoes).where(eq(divulgacoes.id, divulgacaoDoVizinho.id));
  checa("a divulgação do vizinho continua esperando", divulgacaoAinda?.status === "em_analise", divulgacaoAinda?.status);
  const minhasDivulgacoes = (await (await pedir(eu.cookie, "/api/admin/divulgacoes")).json()) as { id: string }[];
  checa("a fila de divulgações não traz a do vizinho", !minhasDivulgacoes.some((x) => x.id === divulgacaoDoVizinho.id));
  // O modo de divulgação do vizinho: o corpo e a query não trocam a organização do organizador.
  const [modoAntes] = await db.select({ m: organizations.divulgacaoAfiliado }).from(organizations).where(eq(organizations.id, vizinho.orgId));
  const alvo = modoAntes?.m === "direta" ? "autorizacao" : "direta";
  const troca = await pedir(eu.cookie, `/api/admin/divulgacoes/config?organizacao=${vizinho.orgId}`, {
    method: "PUT",
    body: JSON.stringify({ modo: alvo, organizacaoId: vizinho.orgId }),
  });
  const [modoDepois] = await db.select({ m: organizations.divulgacaoAfiliado }).from(organizations).where(eq(organizations.id, vizinho.orgId));
  const [meuModo] = await db.select({ m: organizations.divulgacaoAfiliado }).from(organizations).where(eq(organizations.id, eu.orgId));
  checa("o modo de divulgação do vizinho não muda", modoDepois?.m === modoAntes?.m, `${modoAntes?.m} → ${modoDepois?.m}`);
  checa("o pedido vale só para a própria organização", troca.status === 200 && meuModo?.m === alvo, `HTTP ${troca.status}`);
  await db.update(organizations).set({ divulgacaoAfiliado: "autorizacao" }).where(eq(organizations.id, eu.orgId));
  await db.delete(divulgacoes).where(eq(divulgacoes.id, divulgacaoDoVizinho.id));
  const [aindaLa] = await db.select({ id: stories.id }).from(stories).where(eq(stories.id, storyDoVizinho.id));
  checa("o story do vizinho continua no ar", Boolean(aindaLa));
  const meus = (await (await pedir(eu.cookie, "/api/admin/stories")).json()) as { id: string }[];
  checa("a lista de stories não traz o do vizinho", !meus.some((x) => x.id === storyDoVizinho.id));
}

/**
 * A confirmação do envio de mídia recebe a chave do arquivo pelo corpo. A
 * chave do vizinho aparece no endereço público da imagem dele: com ela, e
 * uma mídia que reprova (foto sem texto alternativo), a limpeza da recusa
 * apagava o arquivo do vizinho. Agora a chave de outra rifa é recusada antes
 * de tudo, e o arquivo dele fica onde estava.
 */
async function midiaDoVizinho(eu: Lado, vizinho: Lado) {
  const chave = mediaKey(vizinho.campaignId, "photo", "image/webp");
  await storage().write(chave, Buffer.from("RIFF0000WEBPVP8 isolamento"), "image/webp");
  try {
    for (const [nome, corpo] of [
      ["foto que reprova com a chave do vizinho", { role: "photo", storageKey: chave, mime: "image/webp" }],
      ["banner com a chave do vizinho", { role: "banner", storageKey: chave, mime: "image/webp" }],
    ] as const) {
      const res = await pedir(eu.cookie, `/api/admin/campaigns/${eu.campaignId}/media`, {
        method: "POST",
        body: JSON.stringify(corpo),
      });
      checa(`${nome} é recusada`, res.status === 400, `HTTP ${res.status}`);
    }
    const aindaLa = await storage()
      .size(chave)
      .then(() => true)
      .catch(() => false);
    checa("o arquivo do vizinho continua no armazenamento", aindaLa);

    // O reels (o vídeo só do Reels) do vizinho: trocar a legenda e apagar são 404.
    const [reels] = await db
      .insert(campaignMedia)
      .values({ campaignId: vizinho.campaignId, role: "reels", position: 0, storageKey: `teste/iso-reels-${vizinho.nome}`, mime: "video/mp4", width: 720, height: 1280, durationS: 20, legenda: "do vizinho", status: "ready" })
      .returning();
    try {
      let res = await pedir(eu.cookie, `/api/admin/media/${reels.id}/legenda`, { method: "PUT", body: '{"legenda":"invadida"}' });
      checa("PUT legenda do reels do vizinho é 404", res.status === 404, `HTTP ${res.status}`);
      res = await pedir(eu.cookie, `/api/admin/media/${reels.id}`, { method: "DELETE" });
      checa("DELETE reels do vizinho é 404", res.status === 404, `HTTP ${res.status}`);
      const [depois] = await db.select().from(campaignMedia).where(eq(campaignMedia.id, reels.id));
      checa("o reels do vizinho continua, com a legenda dele", depois?.legenda === "do vizinho");
    } finally {
      await db.delete(campaignMedia).where(eq(campaignMedia.id, reels.id));
    }
  } finally {
    await storage().remove(chave).catch(() => {});
  }
}

/**
 * Afiliado antigo ainda tem a organização no usuário, mas trabalha para
 * várias: a conta dele é da plataforma. Redefinir a senha pela lista de
 * usuários daria a esta organização a conta — e os saques — dele nas outras.
 */
async function contaDoAfiliadoAntigo(eu: Lado) {
  const email = `iso-afiliado-antigo-${eu.nome}@rifa.teste`;
  const hashAntes = await hashPassword("senha-do-afiliado-1");
  const [u] = await db
    .insert(users)
    .values({ role: "affiliate", organizationId: eu.orgId, name: `Afiliado antigo ${eu.nome}`, email, passwordHash: hashAntes })
    .onConflictDoUpdate({ target: users.email, set: { organizationId: eu.orgId, passwordHash: hashAntes, active: true } })
    .returning({ id: users.id });
  try {
    const senha = await pedir(eu.cookie, `/api/admin/usuarios/${u.id}/senha`, {
      method: "POST",
      body: JSON.stringify({ password: "tomada-da-conta-1" }),
    });
    checa("redefinir a senha do afiliado é recusado", senha.status === 403, `HTTP ${senha.status}`);
    const desligar = await pedir(eu.cookie, `/api/admin/usuarios/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    checa("desligar a conta do afiliado é recusado", desligar.status === 403, `HTTP ${desligar.status}`);
    const [depois] = await db.select({ hash: users.passwordHash, active: users.active }).from(users).where(eq(users.id, u.id));
    checa("a senha e o acesso do afiliado ficaram como estavam", depois?.hash === hashAntes && depois?.active === true);
  } finally {
    await db.delete(users).where(eq(users.id, u.id));
  }
}

const ENDERECO_VALIDO = JSON.stringify({
  cep: "69005-010",
  logradouro: "Rua Invadida",
  numero: "1",
  bairro: "Centro",
  cidade: "Manaus",
  uf: "AM",
});

/**
 * O endereço ordena a vitrine: o organizador grava o dele, e o do vizinho
 * não muda — nem com a rota certa e o id errado.
 */
async function enderecoProprio(eu: Lado, vizinho: Lado) {
  const antes = await db
    .select({ cidade: organizations.cidade })
    .from(organizations)
    .where(eq(organizations.id, vizinho.orgId));
  const res = await pedir(eu.cookie, `/api/admin/organizacoes/${eu.orgId}/endereco`, {
    method: "PUT",
    body: JSON.stringify({ ...JSON.parse(ENDERECO_VALIDO), cidade: "Belém", uf: "PA", cep: "66010-000" }),
  });
  checa("grava o próprio endereço", res.status === 200, `HTTP ${res.status}`);
  const depois = await db
    .select({ cidade: organizations.cidade })
    .from(organizations)
    .where(eq(organizations.id, vizinho.orgId));
  checa(
    "o endereço do vizinho ficou como estava",
    antes[0]?.cidade === depois[0]?.cidade && depois[0]?.cidade !== "Manaus",
    String(depois[0]?.cidade),
  );
}

/** Os bilhetes privados são da conta do apostador: sessão de painel não vale. */
async function bilhetesSoDaConta(eu: Lado) {
  const res = await pedir(eu.cookie, "/api/public/conta/bilhetes");
  const corpo = await res.text();
  checa("sessão de organizador não lê os bilhetes de apostador (401)", res.status === 401, `HTTP ${res.status}`);
  checa("a recusa vem sem cache", (res.headers.get("cache-control") ?? "").includes("no-store"));
  checa("e sem dado nenhum", !/"itens"/.test(corpo), corpo.slice(0, 80));
}

/**
 * O assistente de IA (`/api/ia/*`): a conversa é da sessão — nenhuma rota
 * recebe id de ninguém. Visitante 401, cambista 403; o organizador, com o
 * assistente desligado (o padrão), não alcança nada (404) e nada sai para o
 * Chatbase. A conversa de uma organização contra a outra é provada em
 * `npm run ia`, que sobe o Chatbase de mentira; as ações (o recorte de cada
 * uma e a confirmação de outra pessoa, 404) em `npm run ia-acoes`.
 */
async function assistenteDeIA(eu: Lado) {
  const rotas: [string, string, RequestInit][] = [
    ["GET sessão do assistente", "/api/ia/sessao", {}],
    ["GET conversa do assistente", "/api/ia/conversa", {}],
    ["DELETE conversa do assistente", "/api/ia/conversa", { method: "DELETE" }],
    ["POST mensagem ao assistente", "/api/ia/mensagens", { method: "POST", body: '{"texto":"oi"}' }],
    ["GET plano do assistente", "/api/ia/conta", {}],
    ["POST Pix do assistente", "/api/ia/pagamentos", { method: "POST", body: '{"tipo":"assinatura"}' }],
    ["POST confirmar ação do assistente", "/api/ia/acoes/00000000-0000-4000-8000-000000000000/confirmar", { method: "POST" }],
    ["POST recusar ação do assistente", "/api/ia/acoes/00000000-0000-4000-8000-000000000000/recusar", { method: "POST" }],
  ];
  for (const [nome, caminho, init] of rotas) {
    const anon = await fetch(`${URL}${caminho}`, { ...init, headers: { "Content-Type": "application/json" } });
    checa(`${nome}: visitante 401`, anon.status === 401, `HTTP ${anon.status}`);
  }
  const cambista = await entrar(`iso-cambista-${eu.slug.replace(/^iso-/, "")}@rifa.teste`, eu.senha);
  for (const [nome, caminho, init] of rotas) {
    const res = await pedir(cambista, caminho, init);
    checa(`${nome}: cambista 403`, res.status === 403, `HTTP ${res.status}`);
  }
  const sessao = await pedir(eu.cookie, "/api/ia/sessao");
  const corpo = await sessao.json().catch(() => null);
  checa("sessão do assistente do organizador: desligado", sessao.status === 200 && corpo?.ligado === false, JSON.stringify(corpo));
  for (const [nome, caminho, init] of rotas.slice(1)) {
    const res = await pedir(eu.cookie, caminho, init);
    checa(`${nome}: organizador sem o assistente, 404`, res.status === 404, `HTTP ${res.status}`);
  }
}

/** Estas existem, mas não são do organizador: 403. */
async function rotasDaPlataforma(eu: Lado) {
  const tentativas: [string, string, RequestInit][] = [
    ["GET organizações", "/api/admin/organizacoes", {}],
    ["GET antifraude", "/api/admin/antifraude", {}],
    ["PUT meios de pagamento", "/api/admin/payment-methods", { method: "PUT", body: "{}" }],
    ["GET auditoria", "/api/admin/audit", {}],
    ["GET carteira de cobrança", "/api/admin/cobranca", {}],
    ["PUT contrato de cobrança", `/api/admin/cobranca/${eu.orgId}/plano`, { method: "PUT", body: '{"mode":"gratis"}' }],
    ["POST dar baixa", `/api/admin/cobranca/${eu.orgId}/baixa`, { method: "POST" }],
    ["POST lançar mensalidades", "/api/admin/cobranca/mensalidades", { method: "POST" }],
    ["POST arquivar organização", `/api/admin/organizacoes/${eu.orgId}/arquivar`, { method: "POST", body: "{}" }],
    ["POST restaurar organização", `/api/admin/organizacoes/${eu.orgId}/restaurar`, { method: "POST" }],
    ["GET pagamentos da plataforma", "/api/admin/plataforma", {}],
    ["PUT pagamentos da plataforma", "/api/admin/plataforma", { method: "PUT", body: '{"estornoManual":true}' }],
    ["PATCH a própria carteira Asaas", `/api/admin/organizacoes/${eu.orgId}`, { method: "PATCH", body: '{"asaasWalletId":"7bafd95a-e783-4a62-9be1-23999af742c6"}' }],
    ["GET WhatsApp", "/api/admin/whatsapp", {}],
    // Versão do contrato com as organizações é da plataforma; a organização só aceita.
    ["POST versão do contrato da promotora", "/api/admin/contrato-promotora", { method: "POST", body: JSON.stringify({ texto: "x".repeat(300) }) }],
    ["POST prévia do contrato da promotora", "/api/admin/contrato-promotora/previa", { method: "POST", body: JSON.stringify({ texto: "x".repeat(300) }) }],
    ["POST anexo do contrato", "/api/admin/contrato-promotora/anexos", { method: "POST", body: JSON.stringify({ modalidade: "federal", titulo: "Anexo", texto: "x".repeat(80) }) }],
    ["POST prévia do anexo do contrato", "/api/admin/contrato-promotora/anexos/previa", { method: "POST", body: JSON.stringify({ modalidade: "federal", titulo: "Anexo", texto: "x".repeat(80) }) }],
    ["GET aparência", "/api/admin/template", {}],
    ["GET pré-visualização do template", "/api/admin/template/previa", {}],
    ["PUT rascunho do template", "/api/admin/template/rascunho", { method: "PUT", body: "{}" }],
    ["PUT logo da plataforma", "/api/admin/template/logo", { method: "PUT", body: "{}" }],
    ["PUT logo de apoio do rodapé", "/api/admin/template/apoio", { method: "PUT", body: "{}" }],
    ["POST rodapé de exemplo no rascunho", "/api/admin/template/exemplo-rodape", { method: "POST" }],
    ["POST publicar template", "/api/admin/template/publicar", { method: "POST" }],
    ["POST restaurar versão do template", "/api/admin/template/versoes/00000000-0000-0000-0000-000000000000/restaurar", { method: "POST" }],
    ["GET banners da vitrine", "/api/admin/banners", {}],
    ["POST banner da vitrine", "/api/admin/banners", { method: "POST", body: "{}" }],
    ["PUT ordem dos banners", "/api/admin/banners/ordem", { method: "PUT", body: '{"ids":[]}' }],
    ["PATCH banner da vitrine", "/api/admin/banners/00000000-0000-0000-0000-000000000000", { method: "PATCH", body: "{}" }],
    ["DELETE banner da vitrine", "/api/admin/banners/00000000-0000-0000-0000-000000000000", { method: "DELETE" }],
    ["POST criar modelos do WhatsApp", "/api/admin/whatsapp/modelos", { method: "POST" }],
    ["POST teste do WhatsApp", "/api/admin/whatsapp/teste", { method: "POST", body: '{"telefone":"11999999999"}' }],
    ["POST decidir disputa de reembolso", "/api/admin/chamados/00000000-0000-0000-0000-000000000000/disputa/decidir", { method: "POST", body: '{"resultado":"procedente","decisao":"xxxxxxxxxxxx"}' }],
    ["PUT configuração do banner pago", "/api/admin/banner-pago/config", { method: "PUT", body: '{"ligado":true}' }],
    ["GET configuração do assistente de IA", "/api/admin/ia/config", {}],
    ["PUT configuração do assistente de IA", "/api/admin/ia/config", { method: "PUT", body: '{"ligado":false}' }],
    ["GET relatório do assistente de IA", "/api/admin/ia/relatorio", {}],
    ["GET extrato do assistente de IA", `/api/admin/ia/lancamentos?tipo=organizacao&titular=${eu.slug}`, {}],
    ["POST ajuste de crédito do assistente", "/api/admin/ia/ajustes", { method: "POST", body: JSON.stringify({ titularTipo: "organizacao", titular: eu.slug, creditos: 1000, motivo: "dando crédito a mim mesmo", idempotencia: "4f6d2c1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f" }) }],
    ["POST decisão de banner pago", "/api/admin/banner-pago/pedidos/00000000-0000-4000-8000-000000000000/decisao", { method: "POST", body: '{"aprovar":true}' }],
    ["PUT configuração do patrocínio", "/api/admin/patrocinio/config", { method: "PUT", body: '{"ligado":true}' }],
    ["POST ajuste de saldo de patrocínio", "/api/admin/patrocinio/ajustes", { method: "POST", body: "{}" }],
    ["POST decisão de reembolso de patrocínio", "/api/admin/patrocinio/reembolsos/00000000-0000-4000-8000-000000000000/decisao", { method: "POST", body: "{}" }],
    ["POST baixa de reembolso de patrocínio", "/api/admin/patrocinio/reembolsos/00000000-0000-4000-8000-000000000000/pago", { method: "POST" }],
    ["GET programa de bônus", "/api/admin/bonus", {}],
    ["PUT configuração do bônus", "/api/admin/bonus/config", { method: "PUT", body: '{"bonusLigado":true}' }],
    ["POST meta de bônus", "/api/admin/bonus/metas", { method: "POST", body: "{}" }],
    ["PUT meta de bônus", "/api/admin/bonus/metas/00000000-0000-0000-0000-000000000000", { method: "PUT", body: "{}" }],
    ["GET caixa de entrada", "/api/admin/caixa-de-entrada", {}],
    ["GET Pix a devolver", "/api/admin/pix-tardios", {}],
    ["POST devolver Pix tardio", "/api/admin/pix-tardios/00000000-0000-0000-0000-000000000000/devolver", { method: "POST" }],
    ["POST resolver Pix tardio", "/api/admin/pix-tardios/00000000-0000-0000-0000-000000000000/resolver", { method: "POST", body: '{"observacao":"resolvido por fora"}' }],
    ["GET saldo retido", "/api/admin/retencoes", {}],
    ["POST reter o saldo", `/api/admin/organizacoes/${eu.orgId}/retencao`, { method: "POST", body: '{"motivo":"retendo a minha própria"}' }],
    ["POST liberar retenção", "/api/admin/retencoes/00000000-0000-0000-0000-000000000000/liberar", { method: "POST", body: '{"motivo":"liberando sozinho"}' }],
    ["POST abater retenção", "/api/admin/retencoes/00000000-0000-0000-0000-000000000000/abater", { method: "POST", body: '{"patrocinioCents":1,"motivo":"abatendo sozinho"}' }],
    ["GET denúncias", "/api/admin/denuncias", {}],
    ["GET denúncia", "/api/admin/denuncias/00000000-0000-0000-0000-000000000000", {}],
    ["POST decidir denúncia", "/api/admin/denuncias/00000000-0000-0000-0000-000000000000/decidir", { method: "POST", body: '{"acao":"banir","resposta":"xxxxxxxxxxxx"}' }],
    ["POST aprovar telefone do organizador", `/api/admin/organizacoes/${eu.orgId}/telefone/aprovar`, { method: "POST" }],
    ["POST destravar rifa", "/api/admin/campaigns/00000000-0000-0000-0000-000000000000/destravar", { method: "POST" }],
    ["POST decidir pedido de mudança em rifa", "/api/admin/solicitacoes/00000000-0000-0000-0000-000000000000/decidir", { method: "POST", body: '{"aprovar":true}' }],
    ["POST marcar rifa como teste", "/api/admin/campaigns/00000000-0000-0000-0000-000000000000/demonstracao", { method: "POST", body: '{"ligado":true}' }],
    ["POST tirar rifa do ar", "/api/admin/campaigns/00000000-0000-0000-0000-000000000000/tirar-do-ar", { method: "POST" }],
    ["POST preencher organização com exemplo", `/api/admin/organizacoes/${eu.orgId}/exemplo`, { method: "POST" }],
    ["GET perfil de demonstração", "/api/admin/demonstracao", {}],
    ["POST criar perfil de demonstração", "/api/admin/demonstracao", { method: "POST" }],
    ["DELETE perfil de demonstração", "/api/admin/demonstracao", { method: "DELETE" }],
    ["GET fila de verificações", "/api/admin/verificacoes", {}],
    ["GET verificação", "/api/admin/verificacoes/00000000-0000-0000-0000-000000000000", {}],
    ["GET documento da verificação", "/api/admin/verificacoes/00000000-0000-0000-0000-000000000000/documentos/identidade_frente", {}],
    ["GET foto da verificação", "/api/admin/verificacoes/00000000-0000-0000-0000-000000000000/foto", {}],
    ["POST decidir verificação", "/api/admin/verificacoes/00000000-0000-0000-0000-000000000000/decidir", { method: "POST", body: '{"acao":"aprovar"}' }],
    ["PUT cores do selo", "/api/admin/selos", { method: "PUT", body: '{"cores":{"apostador":"laranja"}}' }],
    ["GET conversas denunciadas (Mensagens)", "/api/admin/mensagens/denuncias", {}],
    ["GET trecho de conversa denunciada", "/api/admin/mensagens/denuncias/00000000-0000-0000-0000-000000000000", {}],
    ["GET foto de conversa denunciada", "/api/admin/mensagens/denuncias/00000000-0000-0000-0000-000000000000/fotos/00000000-0000-0000-0000-000000000000", {}],
    ["POST decidir conversa denunciada", "/api/admin/mensagens/denuncias/00000000-0000-0000-0000-000000000000/decidir", { method: "POST", body: '{"decisao":"improcedente"}' }],
    ["GET grupos denunciados", "/api/admin/mensagens/grupos/denuncias", {}],
    ["GET trecho de grupo denunciado", "/api/admin/mensagens/grupos/denuncias/00000000-0000-0000-0000-000000000000", {}],
    ["POST decidir grupo denunciado", "/api/admin/mensagens/grupos/denuncias/00000000-0000-0000-0000-000000000000/decidir", { method: "POST", body: '{"decisao":"improcedente"}' }],
    ["GET comentários do sorteio denunciados", "/api/admin/sorteios-oficiais/denuncias", {}],
    ["GET trecho de comentário do sorteio denunciado", "/api/admin/sorteios-oficiais/denuncias/00000000-0000-0000-0000-000000000000", {}],
    ["POST decidir comentário do sorteio denunciado", "/api/admin/sorteios-oficiais/denuncias/00000000-0000-0000-0000-000000000000/decidir", { method: "POST", body: '{"decisao":"improcedente"}' }],
    ["PUT topo do app (aviso do trevo)", "/api/admin/app", { method: "PUT", body: '{"avisoDoTrevo":{"estilo":"cheio","cor":"rosa"},"publicarApostador":true}' }],
    ["GET canais das loterias", "/api/admin/sorteios-oficiais/canais", {}],
    ["PUT canais das loterias", "/api/admin/sorteios-oficiais/canais", { method: "PUT", body: '{"canais":{}}' }],
    // Liberar método de apuração é só da plataforma (a organização só lê, para escolher).
    ["PUT métodos de apuração", "/api/admin/apuracao/metodos", { method: "PUT", body: '{"liberados":[]}' }],
    ["POST sorteio oficial (calendário da plataforma)", "/api/admin/sorteios-oficiais", { method: "POST", body: '{"loteria":"federal","concurso":1,"sorteioEm":"2099-01-01T22:00:00Z"}' }],
    ["PATCH sorteio oficial", "/api/admin/sorteios-oficiais/00000000-0000-0000-0000-000000000000", { method: "PATCH", body: '{"titulo":"x"}' }],
    ["POST cancelar sorteio oficial", "/api/admin/sorteios-oficiais/00000000-0000-0000-0000-000000000000/cancelar", { method: "POST" }],
    ["POST resultado do sorteio oficial", "/api/admin/sorteios-oficiais/00000000-0000-0000-0000-000000000000/resultado", { method: "POST", body: '{"numeros":[]}' }],
    // A ata notarial da sessão do globo: só a plataforma anexa.
    ["PUT ata da sessão do globo", "/api/admin/sorteios-oficiais/00000000-0000-0000-0000-000000000000/ata", { method: "PUT", body: '{"arquivo":""}' }],
    [
      "POST nova extração do globo (9.5)",
      "/api/admin/sorteios-oficiais/00000000-0000-0000-0000-000000000000/rifas/00000000-0000-0000-0000-000000000000/extracoes",
      { method: "POST", body: '{"bolas":[],"horas":[]}' },
    ],
    ["GET cadastros fiscais", "/api/admin/fiscal", {}],
    ["GET cadastro fiscal", "/api/admin/fiscal/00000000-0000-0000-0000-000000000000", {}],
    ["GET documento fiscal", "/api/admin/fiscal/00000000-0000-0000-0000-000000000000/documentos/identidade_frente", {}],
    ["POST decidir cadastro fiscal", "/api/admin/fiscal/00000000-0000-0000-0000-000000000000/decidir", { method: "POST", body: '{"status":"aprovado"}' }],
  ];
  for (const [nome, caminho, init] of tentativas) {
    const res = await pedir(eu.cookie, caminho, init);
    checa(nome, res.status === 403, `HTTP ${res.status}`);
  }
}

/**
 * As duas rifas no mesmo sorteio oficial: o calendário de cada organização
 * traz só a dela, e nunca a contagem do concurso.
 */
async function calendarioDosSorteios(eu: Lado, vizinho: Lado) {
  const [s] = (
    await db.execute(sql`
      INSERT INTO sorteios_oficiais (loteria, concurso, sorteio_em, titulo)
      VALUES ('federal', 99999, now() + interval '30 days', 'isolamento-prova')
      ON CONFLICT (loteria, concurso) DO UPDATE SET titulo = 'isolamento-prova'
      RETURNING id
    `)
  ).rows as { id: string }[];
  try {
    await db.execute(sql`UPDATE campaigns SET sorteio_oficial_id = ${s.id}::uuid WHERE id IN (${eu.campaignId}::uuid, ${vizinho.campaignId}::uuid)`);
    for (const [lado, outro] of [[eu, vizinho], [vizinho, eu]] as const) {
      const lista = (await (await pedir(lado.cookie, "/api/admin/sorteios-oficiais")).json()) as {
        id: string;
        rifas: { id: string }[];
        publicadas?: number;
      }[];
      const doConcurso = lista.find((x) => x.id === s.id);
      const ids = (doConcurso?.rifas ?? []).map((r) => r.id);
      checa(
        `calendário de ${lado.slug}: traz a própria rifa e não a de ${outro.slug}`,
        ids.includes(lado.campaignId) && !ids.includes(outro.campaignId) && doConcurso?.publicadas === undefined,
        ids.join(", ") || "vazio",
      );
    }
  } finally {
    await db.execute(sql`UPDATE campaigns SET sorteio_oficial_id = NULL WHERE sorteio_oficial_id = ${s.id}::uuid`);
    await db.execute(sql`DELETE FROM sorteios_oficiais WHERE id = ${s.id}::uuid`);
  }
}

/** O vazamento silencioso: 200 com o dado do vizinho dentro. */
async function conteudoDasListas(eu: Lado, vizinho: Lado) {
  const campanhas = await (await pedir(eu.cookie, "/api/admin/campaigns")).json();
  const slugs = (campanhas as { campaign: { slug: string } }[]).map((r) => r.campaign.slug);
  checa(
    "a lista de campanhas não traz a do vizinho",
    !slugs.includes(`${vizinho.slug}-rifa`),
    slugs.join(", ") || "vazia",
  );

  const pedidos = await (await pedir(eu.cookie, "/api/admin/orders?limite=100")).json();
  const codigos = (pedidos as { order: { code: number } }[]).map((r) => r.order.code);
  checa(
    "a lista de pedidos não traz o do vizinho",
    !codigos.includes(vizinho.orderCode),
    `${codigos.length} pedido(s)`,
  );

  // A busca do painel: o pedido e o cliente do vizinho não existem para mim
  // (lista vazia, não 403); os meus aparecem sem nome de comprador; e
  // organização só a plataforma acha.
  const buscar = async (q: string) => (await (await pedir(eu.cookie, `/api/admin/busca?q=${encodeURIComponent(q)}`)).json()) as { tipo: string; rotulo: string }[];
  const idDoVizinho = `C-ABCDEFG${vizinho.nome === "norte" ? 2 : 3}`;
  const meuId = `C-ABCDEFG${eu.nome === "norte" ? 2 : 3}`;
  checa("a busca não acha o pedido do vizinho", (await buscar(String(vizinho.orderCode))).length === 0);
  checa("a busca não acha o cliente do vizinho", (await buscar(idDoVizinho)).length === 0);
  checa("a busca não acha organização para o organizador", (await buscar("Organização")).filter((a) => a.tipo === "organizacao").length === 0);
  // Gente da casa: o cambista e o organizador da própria organização
  // aparecem; os do vizinho não, nem por nome, nem por e-mail, nem por código.
  const pessoaDo = async (q: string) => (await buscar(q)).filter((a) => a.tipo === "pessoa");
  const meusNomes = await pessoaDo(`Cambista ${eu.nome}`);
  checa("a busca acha o cambista da minha organização, pelo nome", meusNomes.length === 1 && meusNomes[0].rotulo === `Cambista ${eu.nome}`, JSON.stringify(meusNomes));
  checa("…e pelo e-mail", (await pessoaDo(`iso-cambista-${eu.nome}@`)).length === 1);
  checa("…mas não o do vizinho, por nome", (await pessoaDo(`Cambista ${vizinho.nome}`)).length === 0);
  checa("…nem por e-mail", (await pessoaDo(`iso-cambista-${vizinho.nome}@`)).length === 0);
  checa("…nem o organizador do vizinho", (await pessoaDo(`Organizador ${vizinho.nome}`)).length === 0);
  checa("a busca de gente não traz telefone nem hash", !JSON.stringify(meusNomes).match(/1196|password|hash|phone/i));
  const meuPedido = await buscar(`#${eu.orderCode}`);
  checa(
    "a busca acha o meu pedido, sem nome do comprador",
    meuPedido.length === 1 && meuPedido[0].tipo === "pedido" && !JSON.stringify(meuPedido).includes(`Cliente ${eu.nome}`),
    JSON.stringify(meuPedido),
  );
  const meuCliente = await buscar(meuId.toLowerCase());
  checa(
    "a busca acha o meu cliente pelo ID, sem nome",
    meuCliente.length === 1 && meuCliente[0].rotulo === `Cliente ${meuId}` && !JSON.stringify(meuCliente).includes(`Cliente ${eu.nome}`),
    JSON.stringify(meuCliente),
  );
  // Paginação por chave: a página de 1 traz o cursor, a seguinte começa
  // depois dela, e nenhuma das duas alcança o pedido do vizinho.
  const p1 = await pedir(eu.cookie, "/api/admin/orders?limite=1");
  const cursor = p1.headers.get("x-proximo");
  const linha1 = (await p1.json()) as { order: { code: number } }[];
  const p2 = cursor ? await pedir(eu.cookie, `/api/admin/orders?limite=1&antes=${encodeURIComponent(cursor)}`) : null;
  const linha2 = p2 ? ((await p2.json()) as { order: { code: number } }[]) : [];
  checa(
    "a lista de pedidos pagina por chave: duas páginas, sem repetir e sem o vizinho",
    linha1.length === 1 && Boolean(cursor) && linha2.length === 1 && linha1[0].order.code !== linha2[0].order.code &&
      ![linha1[0], linha2[0]].some((l) => l.order.code === vizinho.orderCode),
    `${linha1.length} + ${linha2.length}, cursor ${cursor ? "sim" : "não"}`,
  );
  const lixo = (await (await pedir(eu.cookie, "/api/admin/orders?limite=1&antes=%27%3B%20drop%20table%20orders")).json()) as unknown[];
  checa("cursor fora do formato vira primeira página, não erro", Array.isArray(lixo) && lixo.length === 1);
  const filtrado = (await (await pedir(eu.cookie, `/api/admin/orders?codigo=${vizinho.orderCode}`)).json()) as unknown[];
  checa("a lista de pedidos filtrada pelo código do vizinho vem vazia", filtrado.length === 0);
  const porCliente = (await (await pedir(eu.cookie, `/api/admin/orders?cliente=${idDoVizinho}`)).json()) as unknown[];
  checa("a lista de pedidos filtrada pelo cliente do vizinho vem vazia", porCliente.length === 0);

  // O sino do painel: só os comentários das minhas rifas, e pelo apelido ou
  // primeiro nome — nunca telefone.
  const avisos = (await (await pedir(eu.cookie, "/api/admin/avisos")).json()) as { trecho: string; quem: string; rifa: { slug: string } }[];
  checa(
    "o sino lista o comentário da minha rifa e não o do vizinho",
    avisos.some((a) => a.trecho === `comentário na rifa ${eu.nome}`) && !avisos.some((a) => a.trecho === `comentário na rifa ${vizinho.nome}`),
    `${avisos.length} aviso(s)`,
  );
  checa("o sino não traz telefone", !JSON.stringify(avisos).includes("11960000"));
  // O sino do afiliado (divulgações decididas) é só do afiliado: o organizador
  // não lê nem marca o "visto" de ninguém por essa porta.
  for (const [metodo, caminho] of [
    ["GET", "/api/affiliate/divulgacoes/novidades"],
    ["POST", "/api/affiliate/avisos/vistos"],
    // Editar é de quem publicou: o organizador não corrige a peça de afiliado por esta porta.
    ["PATCH", "/api/affiliate/divulgacoes/00000000-0000-0000-0000-000000000000"],
    // A foto da peça do afiliado, pela porta dele, é só dele.
    ["GET", "/api/affiliate/divulgacoes/00000000-0000-0000-0000-000000000000/fotos/00000000-0000-0000-0000-000000000000"],
  ] as const) {
    const r = await pedir(eu.cookie, caminho, { method: metodo });
    checa(`${metodo} ${caminho}: organizador recusado (403)`, r.status === 403, `HTTP ${r.status}`);
    const v = await pedir("", caminho, { method: metodo });
    checa(`${metodo} ${caminho}: visitante recusado (401)`, v.status === 401, `HTTP ${v.status}`);
  }
  // O número da fila de divulgações no sino é o da minha organização.
  // Uma peça esperando a autorização do vizinho não entra no meu número.
  const antesDoSino = (await (await pedir(eu.cookie, "/api/admin/chamados/pendentes")).json()) as { divulgacoes?: number };
  const [pecaDoVizinho] = await db
    .insert(divulgacoes)
    .values({ campaignId: vizinho.campaignId, organizationId: vizinho.orgId, autor: "apostador", legenda: "peça do vizinho", status: "em_analise" })
    .returning({ id: divulgacoes.id });
  try {
    // A peça do vizinho, decidida com a versão certa, continua não sendo minha.
    const decidirDoVizinho = await pedir(eu.cookie, `/api/admin/divulgacoes/${pecaDoVizinho.id}`, {
      method: "POST",
      body: JSON.stringify({ acao: "aprovar", versao: 0 }),
    });
    checa("aprovar a peça do vizinho, com a versão certa: 404", decidirDoVizinho.status === 404, `HTTP ${decidirDoVizinho.status}`);
    // A foto da peça do vizinho, pela porta do painel: 404 (nem existe para mim).
    const [fotoDoVizinho] = await db
      .insert(divulgacaoFotos)
      .values({ divulgacaoId: pecaDoVizinho.id, posicao: 0, bytes: Buffer.from([0xff, 0xd8, 0xff]) })
      .returning({ id: divulgacaoFotos.id });
    const abrirFoto = await pedir(eu.cookie, `/api/admin/divulgacoes/${pecaDoVizinho.id}/fotos/${fotoDoVizinho.id}`);
    checa("a foto da peça do vizinho: 404", abrirFoto.status === 404, `HTTP ${abrirFoto.status}`);
    const abrirPublica = await pedir("", `/api/public/divulgacoes/${pecaDoVizinho.id}/fotos/${fotoDoVizinho.id}`);
    checa("a foto da peça em análise não é pública: 404", abrirPublica.status === 404, `HTTP ${abrirPublica.status}`);
    // O vídeo da peça do vizinho, pela porta do painel e pela pública (em análise): 404.
    await db
      .insert(divulgacaoVideos)
      .values({ divulgacaoId: pecaDoVizinho.id, mime: "video/mp4", bytes: Buffer.from([0, 0, 0, 8]), segundos: 1, largura: 1080, altura: 1920 });
    const abrirVideo = await pedir(eu.cookie, `/api/admin/divulgacoes/${pecaDoVizinho.id}/video`);
    checa("o vídeo da peça do vizinho: 404", abrirVideo.status === 404, `HTTP ${abrirVideo.status}`);
    const abrirPosterDoVizinho = await pedir(eu.cookie, `/api/admin/divulgacoes/${pecaDoVizinho.id}/video?poster=1`);
    checa("o pôster do vídeo do vizinho: 404", abrirPosterDoVizinho.status === 404, `HTTP ${abrirPosterDoVizinho.status}`);
    const videoPublico = await pedir("", `/api/public/divulgacoes/${pecaDoVizinho.id}/video`);
    checa("o vídeo da peça em análise não é público: 404", videoPublico.status === 404, `HTTP ${videoPublico.status}`);
    const depoisDoSino = (await (await pedir(eu.cookie, "/api/admin/chamados/pendentes")).json()) as { divulgacoes?: number };
    checa(
      "a peça esperando o vizinho não entra no número do meu sino",
      typeof antesDoSino.divulgacoes === "number" && depoisDoSino.divulgacoes === antesDoSino.divulgacoes,
      `${antesDoSino.divulgacoes} → ${depoisDoSino.divulgacoes}`,
    );
  } finally {
    await db.delete(divulgacoes).where(eq(divulgacoes.id, pecaDoVizinho.id));
  }

  const painel = await (await pedir(eu.cookie, "/api/admin/overview")).json();
  const meu = 5000 * (eu.nome === "norte" ? 1 : 2);
  checa(
    "o faturamento do painel é só o meu",
    (painel as { revenueCents: number }).revenueCents === meu,
    `${(painel as { revenueCents: number }).revenueCents} centavos`,
  );

  const ultimas = ((painel as { ultimasVendas?: { code: number }[] }).ultimasVendas ?? []).map((v) => v.code);
  checa(
    "as últimas vendas do painel não trazem o pedido do vizinho",
    !ultimas.includes(vizinho.orderCode) && !JSON.stringify(ultimas).includes(vizinho.nome),
    `${ultimas.length} venda(s)`,
  );

  const csv = await (await pedir(eu.cookie, "/api/admin/exportacoes/compradores")).text();
  checa(
    "a exportação de compradores não traz o cliente do vizinho",
    !csv.includes(`Cliente ${vizinho.nome}`),
    `${csv.split("\n").length - 2} linha(s)`,
  );

  const extrato = await (await pedir(eu.cookie, "/api/admin/cobranca/extrato")).json();
  checa(
    "o extrato de cobrança é o da própria organização",
    (extrato as { plano?: { mode: string } }).plano !== undefined,
    (extrato as { plano?: { mode: string } }).plano?.mode ?? "sem plano",
  );

  const pessoas = (await (await pedir(eu.cookie, "/api/admin/usuarios")).json()) as {
    email: string;
  }[];
  checa(
    "a lista de usuários não traz o organizador do vizinho",
    !pessoas.some((p) => p.email === vizinho.email) && pessoas.some((p) => p.email === eu.email),
    `${pessoas.length} pessoa(s)`,
  );
  const pedindoOVizinho = (await (
    await pedir(eu.cookie, `/api/admin/usuarios?organizacao=${vizinho.orgId}`)
  ).json()) as { email: string }[];
  checa(
    "pedir a organização do vizinho no filtro não abre o recorte",
    !pedindoOVizinho.some((p) => p.email === vizinho.email),
    `${pedindoOVizinho.length} pessoa(s)`,
  );

  const atendimento = (await (await pedir(eu.cookie, "/api/admin/chamados?status=")).json()) as {
    protocolo: string;
  }[];
  checa(
    "o atendimento não traz o chamado do vizinho",
    !atendimento.some((c) => c.protocolo === vizinho.protocolo) &&
      atendimento.some((c) => c.protocolo === eu.protocolo),
    `${atendimento.length} chamado(s)`,
  );
  const pendentes = (await (await pedir(eu.cookie, "/api/admin/chamados/pendentes")).json()) as {
    total: number;
  };
  checa("o contador do atendimento é só o meu", pendentes.total === 1, `${pendentes.total}`);

  // Os dados legais da própria campanha passam (e travam o que é dela).
  const pdf = "data:application/pdf;base64," + Buffer.from("%PDF-1.4\n% certificado de teste\n").toString("base64");
  const legal = await pedir(eu.cookie, `/api/admin/campaigns/${eu.campaignId}/legal`, {
    method: "PUT",
    body: JSON.stringify({
      authorizationCode: `SPA-${eu.nome}-2026`,
      drawAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      certificado: { dataUrl: pdf, nome: "certificado.pdf" },
    }),
  });
  checa("os dados legais da própria campanha são aceitos", legal.status === 200, `HTTP ${legal.status}`);
  const cert = await pedir(eu.cookie, `/api/admin/campaigns/${eu.campaignId}/certificado`);
  checa(
    "e o certificado volta como PDF",
    cert.status === 200 && (cert.headers.get("content-type") ?? "").includes("pdf"),
    `HTTP ${cert.status}`,
  );

  // De quem é o cliente: o da plataforma aparece só pelo ID; o do cambista,
  // completo — na lista de pedidos e nas exportações.
  const meusPedidos = (await (await pedir(eu.cookie, "/api/admin/orders?limite=100")).json()) as {
    order: { code: number };
    buyer: { name: string; phone: string | null };
  }[];
  const online = meusPedidos.find((r) => r.order.code === eu.orderCode);
  const doCambista = meusPedidos.find((r) => r.order.code === 92_100_000 + (eu.nome === "norte" ? 1 : 2));
  checa(
    "pedido online: cliente da plataforma só pelo ID",
    Boolean(online && online.buyer.name !== `Cliente ${eu.nome}` && online.buyer.phone === null),
    online?.buyer.name ?? "sem linha",
  );
  checa(
    "venda do cambista: cliente completo",
    doCambista?.buyer.name === `Freguês ${eu.nome}` && Boolean(doCambista?.buyer.phone),
    doCambista?.buyer.name ?? "sem linha",
  );
  const csvPedidos = await (await pedir(eu.cookie, "/api/admin/exportacoes/pedidos")).text();
  checa(
    "exportação de pedidos não traz o nome do cliente da plataforma",
    !csvPedidos.includes(`Cliente ${eu.nome}`) && csvPedidos.includes(`Freguês ${eu.nome}`),
  );
  const csvClientes = await (await pedir(eu.cookie, "/api/admin/exportacoes/compradores")).text();
  checa(
    "carteira de clientes do organizador = só os do cambista",
    !csvClientes.includes(`Cliente ${eu.nome}`) && csvClientes.includes(`Freguês ${eu.nome}`),
    `${csvClientes.split("\n").length - 2} linha(s)`,
  );

  // Ganhador: o promotor entrega o prêmio, então o cliente da plataforma que
  // ganhou aparece completo para ele.
  const [pedidoOnline] = await db.select().from(orders).where(eq(orders.code, eu.orderCode));
  const [premio] = await db
    .insert(prizedQuotas)
    .values({
      campaignId: eu.campaignId,
      number: 999,
      prizeLabel: "teste de ganhador",
      claimedByOrderId: pedidoOnline.id,
      claimedAt: new Date(),
    })
    .returning();
  const comGanhador = (await (await pedir(eu.cookie, "/api/admin/orders?limite=100")).json()) as {
    order: { code: number };
    buyer: { name: string; phone: string | null };
  }[];
  const ganhou = comGanhador.find((r) => r.order.code === eu.orderCode);
  checa(
    "ganhador da plataforma aparece completo para o promotor",
    ganhou?.buyer.name === `Cliente ${eu.nome}` && Boolean(ganhou?.buyer.phone),
    ganhou?.buyer.name ?? "sem linha",
  );
  await db.delete(prizedQuotas).where(eq(prizedQuotas.id, premio.id));

  const administradora = await (await pedir(eu.cookie, "/api/admin/organizer")).json();
  checa(
    "a administradora é a organização da sessão",
    (administradora as { nome: string }).nome === `Organização ${eu.nome}`,
    (administradora as { nome: string }).nome,
  );
}

async function limpar(lados: Lado[]) {
  for (const l of lados) {
    await db.delete(chamados).where(eq(chamados.organizationId, l.orgId));
    await db.delete(orders).where(eq(orders.campaignId, l.campaignId));
    await db.delete(campaignStats).where(eq(campaignStats.campaignId, l.campaignId));
    await db.delete(campaigns).where(eq(campaigns.id, l.campaignId));
    await db.delete(users).where(eq(users.email, l.email));
    // Só o cambista deste lado: o do vizinho ainda tem venda no banco.
    const emailCambista = `iso-cambista-${l.nome}@rifa.teste`;
    await db.execute(
      sql`DELETE FROM affiliates WHERE user_id IN (SELECT id FROM users WHERE email = ${emailCambista})`,
    );
    await db.delete(users).where(eq(users.email, emailCambista));
    await db.delete(organizations).where(eq(organizations.id, l.orgId));
  }
  await db.execute(
    sql`DELETE FROM buyers WHERE phone IN ('11960000001','11960000002','11961000001','11961000002')`,
  );
}

async function main() {
  console.log("\n=== teste de isolamento entre organizações ===\n");

  const norte = await montarLado("norte", 1);
  const sul = await montarLado("sul", 2);
  console.log(`  duas organizações no ar: ${norte.slug} e ${sul.slug}\n`);

  try {
    console.log("  o organizador do norte alcançando o sul (espera 404):");
    await alcancaOVizinho(norte, sul);

    console.log("\n  endereço da organização:");
    await enderecoProprio(norte, sul);

    console.log("\n  mídia com a chave do arquivo do vizinho:");
    await midiaDoVizinho(norte, sul);

    console.log("\n  conta do afiliado antigo da própria organização (espera 403):");
    await contaDoAfiliadoAntigo(norte);

    console.log("\n  bilhetes privados do apostador (espera 401):");
    await bilhetesSoDaConta(norte);

    console.log("\n  assistente de IA (a conversa é da sessão):");
    await assistenteDeIA(norte);

    console.log("\n  rotas da plataforma (espera 403):");
    await rotasDaPlataforma(norte);

    console.log("\n  o que as listas dele realmente trazem:");
    await conteudoDasListas(norte, sul);

    console.log("\n  e o mesmo pelo outro lado:");
    await conteudoDasListas(sul, norte);

    console.log("\n  calendário dos sorteios oficiais (só as rifas da própria organização):");
    await calendarioDosSorteios(norte, sul);
  } finally {
    await limpar([norte, sul]);
  }

  console.log(
    falhas === 0
      ? "\n  todos os cruzamentos passaram\n"
      : `\n  ${falhas} cruzamento(s) falharam\n`,
  );

  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
