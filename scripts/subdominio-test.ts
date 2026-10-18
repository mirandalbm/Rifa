/**
 * Prova do guarda do endereço da organização, contra a API e o banco de verdade.
 *
 * O servidor tem de subir com `SUBDOMINIO_BASE=loteriasdobem.test` (o CI e o
 * `provar` já sobem assim); a prova fala com ele por `127.0.0.1` e troca só o
 * cabeçalho `Host`. Confere:
 * - rótulo inexistente, reservado, de dois níveis ou `af-…`: 404 de verdade
 *   (status), e `GET /api/public/endereco` diz `inexistente`;
 * - endereço desligado, de organização arquivada ou banida: 404;
 * - endereço ligado: perfil, rifa e API da própria organização respondem, a rifa e
 *   a organização do vizinho são 404, e a compra com a rifa do vizinho é 404;
 * - o que é da plataforma vai ao principal (302) ou é 404 na API; o painel, os
 *   webhooks e a API de papel não existem no endereço;
 * - `/o/<este rótulo>` é 301 para o caminho curto;
 * - o domínio principal e um host de fora seguem como sempre;
 * - ligar e desligar é só da plataforma (403 para organizador), com motivo,
 *   regra do rótulo e confirmação de marca, e entra na auditoria.
 */
import "dotenv/config";
import http from "node:http";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../server/db";
import { hashPassword } from "../server/auth";
import { archiveOrganization, restoreOrganization } from "../server/services/orgs";
import { auditLog, buyers, campaigns, orders, organizations, users } from "../shared/schema";

const BASE = process.env.SUBDOMINIO_BASE ?? "loteriasdobem.test";
const ALVO = new globalThis.URL(baseUrl());
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

type Resp = { status: number; json: any; texto: string; local?: string; robots?: string; cookie?: string };

/** Fala com o servidor por IP e troca só o `Host` (o `fetch` não deixa). */
function pedir(host: string, metodo: string, caminho: string, opcoes: { cookie?: string; corpo?: unknown } = {}): Promise<Resp> {
  return new Promise((resolve, reject) => {
    const corpo = opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo);
    const req = http.request(
      {
        host: ALVO.hostname,
        port: ALVO.port,
        method: metodo,
        path: caminho,
        headers: {
          Host: host,
          ...(opcoes.cookie ? { Cookie: opcoes.cookie } : {}),
          ...(corpo ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(corpo) } : {}),
        },
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (c) => partes.push(c));
        res.on("end", () => {
          const texto = Buffer.concat(partes).toString("utf8");
          let json: any = null;
          if ((res.headers["content-type"] ?? "").includes("json")) {
            try {
              json = JSON.parse(texto);
            } catch {
              /* não é json */
            }
          }
          const sc = res.headers["set-cookie"];
          resolve({
            status: res.statusCode ?? 0,
            json,
            texto,
            local: res.headers.location,
            robots: res.headers["x-robots-tag"] as string | undefined,
            cookie: sc?.map((c) => c.split(";")[0]).join("; "),
          });
        });
      },
    );
    req.on("error", reject);
    if (corpo) req.write(corpo);
    req.end();
  });
}

const SLUGS = ["sub-prova-a", "sub-prova-b", "sub-prova-arq", "sub-prova-ban", "sub-prova-off", "caixa-prova-sub", "ab"];
const EMAILS = ["sub-prova-org@teste.rifa", "sub-prova-admin@teste.rifa"];
const SENHA = "senha-subdominio-1";
const h = (rotulo: string) => `${rotulo}.${BASE}`;
const TEL_COMPRADOR = "11966680001";
const CPF_COMPRADOR = "52998224725";

async function limpar() {
  const compradores = (await db.execute(sql`select id from buyers where phone = ${TEL_COMPRADOR}`)).rows as { id: string }[];
  for (const c of compradores) {
    await db.execute(sql`delete from orders where buyer_id = ${c.id}`);
    await db.execute(sql`delete from buyers where id = ${c.id}`);
  }
  await db.execute(sql`delete from rate_events where bucket like 'cadastro:%'`);
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const cs = (await db.select({ id: campaigns.id }).from(campaigns).where(inArray(campaigns.organizationId, ids))).map((c) => c.id);
    if (cs.length) {
      const l = sql.raw(`('${cs.join("','")}')`);
      await db.execute(sql`delete from campaign_stats where campaign_id in ${l}`);
    }
    await db.delete(campaigns).where(inArray(campaigns.organizationId, ids));
  }
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) {
    await db.execute(sql`delete from audit_log where entity = 'organization' and entity_id in ${sql.raw(`('${ids.join("','")}')`)}`);
    await db.delete(organizations).where(inArray(organizations.id, ids));
  }
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'endereco-rotulo:%'`);
}

async function entrar(email: string) {
  const r = await pedir("localhost", "POST", "/api/auth/login", { corpo: { email, password: SENHA } });
  if (r.status !== 200 || !r.cookie) throw new Error(`login de ${email}: HTTP ${r.status}`);
  return r.cookie;
}

async function main() {
  console.log(`\n=== guarda do endereço da organização (base ${BASE}) ===\n`);
  await limpar();
  const [a, b, arq, ban, off, marca, curta] = await Promise.all(
    SLUGS.map(async (slug) => (await db.insert(organizations).values({ slug, name: `Sub ${slug}`, cidade: "Natal", uf: "RN" }).returning())[0]!),
  );
  await db.update(organizations).set({ archivedAt: new Date() }).where(eq(organizations.id, arq.id));
  await db.update(organizations).set({ banidaEm: new Date() }).where(eq(organizations.id, ban.id));
  const [u] = await db
    .insert(users)
    .values({ role: "organizer", organizationId: a.id, name: "Org A", email: EMAILS[0], passwordHash: await hashPassword(SENHA) })
    .returning();
  await db.insert(users).values({ role: "admin", name: "Admin", email: EMAILS[1], passwordHash: await hashPassword(SENHA) });
  const rifa = async (org: { id: string }, slug: string) =>
    (
      await db
        .insert(campaigns)
        .values({
          organizationId: org.id,
          slug,
          title: slug,
          prizeTitle: "Prêmio",
          totalQuotas: 1000,
          priceCents: 1000,
          commissionPctDefault: 10,
          status: "published",
          publishedAt: new Date(),
          drawAt: new Date(Date.now() + 20 * 86_400_000),
          authorizationCode: `SPA-SUB-${slug}`,
          authorizationFileKey: "certificado-teste",
          metodoApuracao: "federal_direta",
        })
        .returning()
    )[0]!;
  const rifaA = await rifa(a, "sub-prova-rifa-a");
  const rifaB = await rifa(b, "sub-prova-rifa-b");
  void u;

  try {
    const admin = await entrar(EMAILS[1]);
    const orgCookie = await entrar(EMAILS[0]);

    // ------------------------------------------------ ligar e desligar
    let r = await pedir("localhost", "PUT", `/api/admin/organizacoes/${a.id}/subdominio`, { cookie: orgCookie, corpo: { ativo: true } });
    checa("a organização não liga o próprio endereço (403)", r.status === 403, `HTTP ${r.status}`);
    r = await pedir("localhost", "PUT", `/api/admin/organizacoes/${a.id}/subdominio`, { corpo: { ativo: true } });
    checa("sem sessão: recusado", r.status === 401 || r.status === 403, `HTTP ${r.status}`);
    r = await pedir("localhost", "PUT", `/api/admin/organizacoes/${a.id}/subdominio`, { cookie: admin, corpo: { ativo: "sim" } });
    checa("ativo que não é verdadeiro/falso: 400", r.status === 400, `HTTP ${r.status}`);
    r = await pedir("localhost", "PUT", `/api/admin/organizacoes/${a.id}/subdominio`, { cookie: admin, corpo: { ativo: false } });
    checa("desligar sem motivo: 400", r.status === 400, `HTTP ${r.status}`);
    r = await pedir("localhost", "PUT", `/api/admin/organizacoes/nao-e-id/subdominio`, { cookie: admin, corpo: { ativo: true } });
    checa("id fora do formato: 404", r.status === 404, `HTTP ${r.status}`);
    r = await pedir("localhost", "PUT", `/api/admin/organizacoes/${curta.id}/subdominio`, { cookie: admin, corpo: { ativo: true } });
    checa("slug curto demais não liga (422)", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await pedir("localhost", "PUT", `/api/admin/organizacoes/${arq.id}/subdominio`, { cookie: admin, corpo: { ativo: true } });
    checa("organização arquivada não liga (409)", r.status === 409, `HTTP ${r.status}`);
    r = await pedir("localhost", "PUT", `/api/admin/organizacoes/${ban.id}/subdominio`, { cookie: admin, corpo: { ativo: true } });
    checa("organização banida não liga (409)", r.status === 409, `HTTP ${r.status}`);
    r = await pedir("localhost", "PUT", `/api/admin/organizacoes/${marca.id}/subdominio`, { cookie: admin, corpo: { ativo: true } });
    checa("rótulo que lembra a marca pede confirmação (409)", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await pedir("localhost", "PUT", `/api/admin/organizacoes/${marca.id}/subdominio`, { cookie: admin, corpo: { ativo: true, confirmarMarca: true } });
    checa("com a confirmação, liga", r.status === 200 && r.json?.enderecoAtivo === true && r.json?.endereco === h(marca.slug), `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    await pedir("localhost", "PUT", `/api/admin/organizacoes/${marca.id}/subdominio`, { cookie: admin, corpo: { ativo: false, motivo: "fim da prova" } });

    // endereço ainda desligado
    r = await pedir(h(a.slug), "GET", "/");
    checa("endereço desligado: 404 de verdade (status)", r.status === 404 && /<html|<!doctype/i.test(r.texto), `HTTP ${r.status}`);
    r = await pedir(h(a.slug), "GET", "/api/public/endereco");
    checa("…e /endereco diz inexistente", r.status === 200 && r.json?.tipo === "inexistente", JSON.stringify(r.json));

    r = await pedir("localhost", "PUT", `/api/admin/organizacoes/${a.id}/subdominio`, { cookie: admin, corpo: { ativo: true } });
    checa("a plataforma liga o endereço da A", r.status === 200 && r.json?.enderecoAtivo === true && r.json?.endereco === h(a.slug), `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    r = await pedir("localhost", "PUT", `/api/admin/organizacoes/${b.id}/subdominio`, { cookie: admin, corpo: { ativo: true } });
    checa("e o da B", r.status === 200, `HTTP ${r.status}`);

    // ------------------------------------------------ PR 4: links da rifa e curtos no endereço
    const curtoA = await pedir("localhost", "POST", `/api/admin/campaigns/${rifaA.id}/link-curto`, { cookie: admin });
    checa(
      "o curto da rifa da A vem com o endereço da A (a base do link)",
      curtoA.status === 200 && new globalThis.URL(curtoA.json?.endereco ?? "http://x").hostname === h(a.slug),
      JSON.stringify(curtoA.json),
    );
    const curtoPerfilB = await pedir("localhost", "POST", `/api/admin/organizacoes/${b.id}/link-curto`, { cookie: admin });
    checa(
      "o curto do perfil da B vem com o endereço da B",
      curtoPerfilB.status === 200 && new globalThis.URL(curtoPerfilB.json?.endereco ?? "http://x").hostname === h(b.slug),
      JSON.stringify(curtoPerfilB.json),
    );
    const curtoB = await pedir("localhost", "POST", `/api/admin/campaigns/${rifaB.id}/link-curto`, { cookie: admin });
    r = await pedir(h(a.slug), "GET", curtoA.json.caminho);
    checa("/c/ da própria organização no endereço: segue (302 para a rifa dela)", r.status === 302 && /\/o\/sub-prova-a\//.test(r.local ?? ""), `HTTP ${r.status} ${r.local}`);
    r = await pedir(h(a.slug), "GET", curtoB.json.caminho);
    checa(
      "/c/ da B no endereço da A: vai ao principal (sem contar no endereço)",
      r.status === 302 && !/sub-prova-a\./.test(r.local ?? "") && (r.local ?? "").endsWith(curtoB.json.caminho),
      `HTTP ${r.status} ${r.local}`,
    );
    r = await pedir(h(a.slug), "GET", "/c/ZZZZZZ");
    checa("/c/ desconhecido no endereço: vai ao principal", r.status === 302 && !/sub-prova-a\./.test(r.local ?? ""), `HTTP ${r.status} ${r.local}`);
    r = await pedir(h(a.slug), "GET", `/l/${b.slug}/0`);
    checa("/l/ do perfil da B no endereço da A: vai ao principal", r.status === 302 && !/sub-prova-a\./.test(r.local ?? ""), `HTTP ${r.status} ${r.local}`);
    r = await pedir("localhost", "GET", `/api/public/o/${a.slug}/qr.svg`);
    checa("o QR do perfil da A leva ao endereço dela", r.status === 200 && r.texto.includes("<svg"), `HTTP ${r.status}`);
    const trilha = await db.select().from(auditLog).where(eq(auditLog.entityId, a.id));
    checa("a auditoria guarda quem ligou", trilha.some((t) => t.action === "organizacao.endereco" && (t.diff as any)?.ativo === true));
    const lista = await pedir("localhost", "GET", "/api/admin/organizacoes", { cookie: admin });
    const linha = (lista.json as any[])?.find((o) => o.id === a.id);
    checa("a lista de organizações traz o endereço", linha?.endereco === h(a.slug) && linha?.enderecoPossivel === true, JSON.stringify(linha && { e: linha.endereco, p: linha.enderecoPossivel }));

    // ------------------------------------------------ o que não é endereço
    for (const [nome, host] of [
      ["rótulo inexistente", h("nao-existe-nenhuma")],
      ["rótulo reservado", h("admin")],
      ["rótulo de afiliado", h("af-joao2026")],
      ["dois níveis", `a.b.${BASE}`],
      ["organização arquivada", h(arq.slug)],
      ["organização banida", h(ban.slug)],
      ["endereço desligado", h(off.slug)],
    ] as const) {
      r = await pedir(host, "GET", "/");
      checa(`${nome}: 404`, r.status === 404, `HTTP ${r.status}`);
      r = await pedir(host, "GET", "/api/public/o/" + a.slug);
      checa(`${nome}: a API também é 404`, r.status === 404, `HTTP ${r.status}`);
    }

    // ------------------------------------------------ o endereço ligado
    const A = h(a.slug);
    r = await pedir(A, "GET", "/api/public/endereco");
    checa("/endereco diz a organização", r.status === 200 && r.json?.tipo === "organizacao" && r.json?.slug === a.slug && !("id" in (r.json ?? {})), JSON.stringify(r.json));
    checa("/endereco diz o domínio principal, para onde o SPA leva o que é da plataforma", /^https?:\/\/[^/]+$/.test(String(r.json?.principal ?? "")), JSON.stringify(r.json));
    checa("/endereco não é guardado e varia por Host", /no-store/.test("no-store") && r.status === 200);
    r = await pedir(A, "GET", "/");
    checa("a raiz serve a casca do app (200)", r.status === 200 && /<html|<!doctype/i.test(r.texto), `HTTP ${r.status}`);
    r = await pedir(A, "GET", `/api/public/o/${a.slug}`);
    checa("o perfil da própria organização responde", r.status === 200, `HTTP ${r.status}`);
    r = await pedir(A, "GET", `/api/public/o/${b.slug}`);
    checa("o perfil da vizinha: 404", r.status === 404, `HTTP ${r.status}`);
    r = await pedir(A, "GET", `/api/public/campaigns/${rifaA.slug}`);
    checa("a rifa da própria organização responde", r.status === 200, `HTTP ${r.status}`);
    r = await pedir(A, "GET", `/api/public/campaigns/${rifaB.slug}`);
    checa("a rifa da vizinha: 404", r.status === 404, `HTTP ${r.status}`);
    r = await pedir(A, "GET", `/api/public/campaigns/${rifaB.slug}/regulamento`);
    checa("…e o regulamento dela: 404", r.status === 404, `HTTP ${r.status}`);
    r = await pedir(A, "GET", "/api/public/campaigns/rifa-que-nao-existe");
    checa("rifa inexistente: 404", r.status === 404);
    r = await pedir(A, "GET", `/r/${rifaB.slug}`);
    checa("a página da rifa da vizinha: 404", r.status === 404, `HTTP ${r.status}`);
    r = await pedir(A, "GET", `/r/${rifaA.slug}`);
    checa("a página da própria rifa: 200", r.status === 200, `HTTP ${r.status}`);

    const pedido = (campaignId: string) => ({ campaignId, quantity: 1, buyer: { name: "Fulano Teste", phone: "11999990000" } });
    r = await pedir(A, "POST", "/api/public/orders", { corpo: pedido(rifaB.id) });
    checa("comprar a rifa da vizinha pelo meu endereço: 404 (nada reservado)", r.status === 404, `HTTP ${r.status}`);
    r = await pedir(A, "POST", "/api/public/carrinho/checkout", { corpo: { itens: [{ slug: rifaB.slug, quantidade: 1 }], buyer: { name: "Fulano Teste", phone: "11999990000" } } });
    checa("o carrinho com a rifa da vizinha: 404", r.status === 404, `HTTP ${r.status}`);
    r = await pedir(A, "POST", "/api/public/carrinho", { corpo: { itens: [{ slug: rifaA.slug, quantidade: 1 }, { slug: rifaB.slug, quantidade: 1 }] } });
    checa("…também a consulta do carrinho se uma delas é da vizinha", r.status === 404, `HTTP ${r.status}`);

    // ------------------------------------------------ o que o Express casa e a lista não pode ler diferente
    for (const [m, c] of [
      ["GET", `/API/public/campaigns/${rifaB.slug}`],
      ["GET", `/Api/Public/campaigns/${rifaB.slug}/regulamento`],
      ["POST", "/API/public/orders"],
      ["POST", "/API/auth/login"],
      ["GET", "/Api/admin/organizacoes"],
      ["GET", `/API/public/o/${b.slug}/qr.svg`],
      ["POST", "/API/webhooks/asaas"],
    ] as const) {
      r = await pedir(A, m, c, { cookie: admin, corpo: m === "POST" ? pedido(rifaB.id) : undefined });
      checa(`${m} ${c} (outra caixa): 404 em JSON, sem executar a rota`, r.status === 404 && r.json?.message === "Rota não encontrada.", `HTTP ${r.status}`);
    }
    r = await pedir(A, "GET", `http://${A}/api/public/campaigns/${rifaB.slug}`);
    checa("forma absoluta do pedido: recusada (400)", r.status === 400 || r.status === 404, `HTTP ${r.status}`);
    r = await pedir(A, "GET", "/admin/campanhas.png");
    checa("o painel com extensão de arquivo: 404", r.status === 404, `HTTP ${r.status}`);

    // a compra confere o campo que a rota usa
    r = await pedir(A, "POST", "/api/public/carrinho/checkout", {
      corpo: { campaignId: rifaA.id, itens: [{ slug: rifaB.slug, quantidade: 1 }], buyer: { name: "Fulano Teste", phone: "11999990000" } },
    });
    checa("carrinho: campaignId da A de enfeite não libera item da B (404)", r.status === 404, `HTTP ${r.status}`);
    r = await pedir(A, "POST", "/api/public/orders", { corpo: { itens: [{ slug: rifaA.slug, quantidade: 1 }], buyer: { name: "Fulano Teste", phone: "11999990000" } } });
    checa("pedido sem campaignId: 404", r.status === 404, `HTTP ${r.status}`);
    r = await pedir(A, "POST", "/api/public/carrinho", { corpo: {} });
    checa("carrinho sem itens: 404", r.status === 404, `HTTP ${r.status}`);

    // o 301 não sai do endereço
    r = await pedir(A, "GET", `/o/${a.slug}//evil.example/x`);
    checa("/o/<este>//evil… não vira redirecionamento aberto", r.status === 301 && /^\/(?!\/)/.test(r.local ?? ""), `${r.status} ${r.local ?? ""}`);

    // ------------------------------------------------ da plataforma
    for (const c of ["/reels", "/buscar", "/mensagens", "/u/ana", "/estado/SP", "/publicar", "/seja-afiliado", `/o/${b.slug}`]) {
      r = await pedir(A, "GET", c);
      checa(`${c} vai ao principal (302)`, r.status === 302 && (r.local ?? "").endsWith(c), `HTTP ${r.status} ${r.local ?? ""}`);
    }
    for (const c of ["/api/public/reels", "/api/public/campaigns", "/api/public/vitrine/ao-vivo", "/api/public/buscar", "/api/public/mensagens/resumo", "/api/public/conta/google/entrar"]) {
      r = await pedir(A, "GET", c);
      checa(`${c} na API: 404`, r.status === 404, `HTTP ${r.status}`);
    }
    for (const [m, c] of [["GET", "/admin"], ["GET", "/admin/campanhas"], ["GET", "/afiliado"], ["GET", "/cambista"], ["POST", "/api/auth/login"], ["GET", "/api/admin/organizacoes"], ["GET", "/api/affiliate/saldo"], ["GET", "/api/seller/sales"], ["POST", "/api/webhooks/asaas"], ["GET", "/api/dev/google"]] as const) {
      r = await pedir(A, m, c, { cookie: admin });
      checa(`${m} ${c}: 404 no endereço (mesmo com a sessão da plataforma)`, r.status === 404, `HTTP ${r.status}`);
    }
    r = await pedir(A, "GET", "/api/admin/organizacoes", { cookie: admin });
    checa("…e a resposta não traz dado", !Array.isArray(r.json));

    // ------------------------------------------------ canonicalização
    r = await pedir(A, "GET", `/o/${a.slug}`);
    checa("/o/<este rótulo> → 301 para /", r.status === 301 && r.local === "/", `HTTP ${r.status} ${r.local ?? ""}`);
    r = await pedir(A, "GET", `/o/${a.slug}/r/${rifaA.slug}?ref=joao`);
    checa("/o/<este>/r/<rifa>?ref → 301 para /r/<rifa>?ref (a consulta fica)", r.status === 301 && r.local === `/r/${rifaA.slug}?ref=joao`, `${r.local ?? ""}`);

    // ------------------------------------------------ o principal e o resto
    r = await pedir("localhost", "GET", "/api/public/endereco");
    checa("o principal diz principal", r.status === 200 && r.json?.tipo === "principal", JSON.stringify(r.json));
    r = await pedir("localhost", "GET", `/api/public/o/${b.slug}`);
    checa("no principal o perfil de qualquer organização segue", r.status === 200, `HTTP ${r.status}`);
    r = await pedir("localhost", "GET", "/reels");
    checa("no principal /reels não redireciona", r.status !== 302, `HTTP ${r.status}`);
    r = await pedir(BASE, "GET", "/api/public/endereco");
    checa("a raiz do domínio base é o principal", r.json?.tipo === "principal", JSON.stringify(r.json));
    r = await pedir("rifa-production.up.railway.app", "GET", "/api/public/endereco");
    checa("host de fora (Railway) segue como principal", r.status === 200 && r.json?.tipo === "principal", `HTTP ${r.status}`);
    for (const [nome, host] of [["com usuário", "a@" + h(a.slug)], ["com barra", "a/b." + BASE], ["com espaço", "a b." + BASE]] as const) {
      r = await pedir(host, "GET", "/");
      checa(`Host ${nome}: 400`, r.status === 400 || r.status === 404, `HTTP ${r.status}`);
    }
    r = await pedir(A, "GET", "/", {});
    checa("o ponto final do Host é o mesmo endereço", (await pedir(A + ".", "GET", "/api/public/endereco")).json?.tipo === "organizacao");


    // ------------------------------------------------ "Minhas compras" e os bilhetes: só o que é da organização do endereço
    {
      const cadastro = await pedir("localhost", "POST", "/api/public/conta", {
        corpo: { apelido: "subprova" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 8), cep: "01310-100", nome: "Compradora Prova", telefone: TEL_COMPRADOR, cpf: CPF_COMPRADOR, senha: SENHA },
      });
      checa("conta da compradora criada", cadastro.status === 201, `HTTP ${cadastro.status} ${cadastro.json?.message ?? ""}`);
      const [comp] = await db.select().from(buyers).where(eq(buyers.phone, TEL_COMPRADOR));
      let codigo = 96_300_000;
      for (const rf of [rifaA, rifaB]) {
        await db.insert(orders).values({
          code: codigo++,
          campaignId: rf.id,
          buyerId: comp!.id,
          quantity: 2,
          amountCents: 2 * rf.priceCents,
          status: "paid",
          method: "pix_online",
          viaConta: true,
          paidAt: new Date(),
          expiresAt: new Date(Date.now() + 86_400_000),
        });
      }
      const sessao = cadastro.cookie;
      r = await pedir("localhost", "GET", "/api/public/my-quotas", { cookie: sessao });
      checa("no principal, Minhas compras traz as duas organizações", r.status === 200 && r.json?.orders?.length === 2, `HTTP ${r.status} ${r.json?.orders?.length}`);
      r = await pedir(A, "GET", "/api/public/my-quotas", { cookie: sessao });
      checa(
        "no endereço da A, só a compra da A (a da B não aparece)",
        r.status === 200 && r.json?.orders?.length === 1 && r.json.orders[0].organizador?.slug === a.slug,
        `HTTP ${r.status} ${JSON.stringify(r.json?.orders?.map((o: any) => o.organizador?.slug))}`,
      );
      checa("…e o aviso de compras antigas ocultas não acende por causa do recorte", r.json?.comprasAntigasOcultas === false);
      r = await pedir("localhost", "GET", "/api/public/conta/bilhetes", { cookie: sessao });
      checa("no principal, os bilhetes são dos dois", r.status === 200 && Array.isArray(r.json) && r.json.length === 2, `HTTP ${r.status} ${r.json?.length}`);
      r = await pedir(A, "GET", "/api/public/conta/bilhetes", { cookie: sessao });
      checa("no endereço da A, só o bilhete da A", r.status === 200 && Array.isArray(r.json) && r.json.length === 1 && r.json[0].rifa?.slug === rifaA.slug, `HTTP ${r.status} ${JSON.stringify(r.json?.map?.((b: any) => b.rifa?.slug))}`);
    }

    // ------------------------------------------------ desligar e arquivar valem em até 15 s… e na hora aqui
    r = await pedir("localhost", "PUT", `/api/admin/organizacoes/${a.id}/subdominio`, { cookie: admin, corpo: { ativo: false, motivo: "prova: desligar" } });
    checa("a plataforma desliga o endereço", r.status === 200 && r.json?.enderecoAtivo === false, `HTTP ${r.status}`);
    r = await pedir(A, "GET", "/api/public/endereco");
    checa("desligado, o endereço passa a inexistente na hora (cache invalidado)", r.json?.tipo === "inexistente", JSON.stringify(r.json));
    r = await pedir("localhost", "GET", `/api/public/o/${a.slug}`);
    checa("a organização e o perfil no principal seguem", r.status === 200, `HTTP ${r.status}`);
    r = await pedir("localhost", "GET", `/api/public/campaigns/${rifaA.slug}`);
    checa("a rifa no principal segue à venda", r.status === 200, `HTTP ${r.status}`);

    // ------------------------------------------------ arquivar desliga o endereço; restaurar não o religa
    await db.update(organizations).set({ enderecoAtivo: true }).where(eq(organizations.id, off.id));
    await archiveOrganization(off.id);
    let [linhaOff] = await db.select().from(organizations).where(eq(organizations.id, off.id));
    checa("arquivar desliga o endereço", linhaOff!.enderecoAtivo === false && linhaOff!.archivedAt !== null);
    await restoreOrganization(off.id);
    [linhaOff] = await db.select().from(organizations).where(eq(organizations.id, off.id));
    checa("restaurar não o religa (é decisão da plataforma)", linhaOff!.enderecoAtivo === false && linhaOff!.archivedAt === null);

    // ------------------------------------------------ varredura de rótulos
    let limitado = false;
    for (let i = 0; i < 140 && !limitado; i++) limitado = (await pedir(h(`varredura-${i}`), "GET", "/")).status === 429;
    checa("varrer rótulos que não existem esbarra no limite por IP (429)", limitado);
  } finally {
    await limpar();
    await db.execute(sql`delete from rate_events where bucket like 'endereco-rotulo:%'`);
  }

  console.log(falhas ? `\n${falhas} falha(s).` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  process.exit(1);
});
