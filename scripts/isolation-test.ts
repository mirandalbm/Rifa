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
import {
  organizations,
  campaigns,
  users,
  buyers,
  orders,
  campaignStats,
  chamados,
  chamadoAnexos,
} from "../shared/schema";
import { hashPassword } from "../server/auth";

const URL = baseUrl();

interface Lado {
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
    .values({ name: `Cliente ${marca}`, phone: `1196000000${indice}` })
    .onConflictDoUpdate({ target: buyers.phone, set: { name: `Cliente ${marca}` } })
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
  const tentativas: [string, string, RequestInit][] = [
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
  ];

  for (const [nome, caminho, init] of tentativas) {
    const res = await pedir(eu.cookie, caminho, init);
    checa(nome, res.status === 404, `HTTP ${res.status}`);
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
    ["POST criar modelos do WhatsApp", "/api/admin/whatsapp/modelos", { method: "POST" }],
    ["POST teste do WhatsApp", "/api/admin/whatsapp/teste", { method: "POST", body: '{"telefone":"11999999999"}' }],
  ];
  for (const [nome, caminho, init] of tentativas) {
    const res = await pedir(eu.cookie, caminho, init);
    checa(nome, res.status === 403, `HTTP ${res.status}`);
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

  const pedidos = await (await pedir(eu.cookie, "/api/admin/orders")).json();
  const codigos = (pedidos as { order: { code: number } }[]).map((r) => r.order.code);
  checa(
    "a lista de pedidos não traz o do vizinho",
    !codigos.includes(vizinho.orderCode),
    `${codigos.length} pedido(s)`,
  );

  const painel = await (await pedir(eu.cookie, "/api/admin/overview")).json();
  const meu = 5000 * (eu.nome === "norte" ? 1 : 2);
  checa(
    "o faturamento do painel é só o meu",
    (painel as { revenueCents: number }).revenueCents === meu,
    `${(painel as { revenueCents: number }).revenueCents} centavos`,
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
    await db.delete(organizations).where(eq(organizations.id, l.orgId));
  }
  await db.execute(sql`DELETE FROM buyers WHERE phone IN ('11960000001','11960000002')`);
}

async function main() {
  console.log("\n=== teste de isolamento entre organizações ===\n");

  const norte = await montarLado("norte", 1);
  const sul = await montarLado("sul", 2);
  console.log(`  duas organizações no ar: ${norte.slug} e ${sul.slug}\n`);

  try {
    console.log("  o organizador do norte alcançando o sul (espera 404):");
    await alcancaOVizinho(norte, sul);

    console.log("\n  rotas da plataforma (espera 403):");
    await rotasDaPlataforma(norte);

    console.log("\n  o que as listas dele realmente trazem:");
    await conteudoDasListas(norte, sul);

    console.log("\n  e o mesmo pelo outro lado:");
    await conteudoDasListas(sul, norte);
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
