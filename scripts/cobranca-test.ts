/**
 * Prova da cobrança por rifa, contra a API e o banco de verdade
 * (`shared/cobranca.ts`):
 * - a tabela (percentual, valor por cota, faixas da taxa Pix) é da
 *   plataforma: a organização lê e não muda (403); faixa que sobe a taxa,
 *   ou valor acima do teto, é recusada;
 * - a organização escolhe percentual ou por cota no rascunho; modo
 *   desconhecido é recusado; por cota maior ou igual ao preço da cota não
 *   publica;
 * - publicar fotografa a tabela do dia na rifa e trava a escolha; mudar a
 *   tabela depois não mexe na rifa publicada;
 * - o pedido fotografa a taxa, com a faixa do Pix pelo volume do mês da
 *   organização, e o pagamento lança a venda e o Pix numa linha;
 * - o estorno cancela a taxa da venda e mantém ou devolve a do Pix pelo
 *   motivo (cláusula X.10);
 * - a tabela agendada: reduzir vale na hora, aumentar exige 30 dias de aviso
 *   com promotora que aceitou o contrato, a publicação grava a vigente e só a
 *   plataforma agenda e cancela (cláusula X.3, parágrafo único);
 * - a falta de pagamento: só a plataforma notifica e cancela; passados 10
 *   dias com a taxa notificada em aberto, rifa nova não publica e a no ar
 *   segue vendendo; o acerto regulariza e a publicação volta (X.13 (a)).
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { buyers, campaignMedia, campaigns, chamados, contratoPromotoraAceites, contratosPromotora, orders, organizations, pixVolumeMensal, platformCharges, users } from "../shared/schema";
import { mesEmSaoPaulo, primeiroDiaComAviso } from "../shared/cobranca";
import { refundOrder } from "../server/services/orders";
import { getPlataforma, setPlataforma } from "../server/services/settings";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

class Cliente {
  cookie = "";
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
}

const SLUG_ORG = "cobranca-teste-org";
const EMAIL = "cobranca-teste@teste.rifa";
const SENHA = "senha-cobranca-teste-1";
const PREFIXO = "cobranca-teste-";
const TELEFONE = (i: number) => `1193${String((Date.now() + i) % 10_000_000).padStart(7, "0")}`;

async function limpar() {
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, SLUG_ORG));
  const cs = (await db.select({ id: campaigns.id }).from(campaigns).where(like(campaigns.slug, `${PREFIXO}%`))).map((c) => c.id);
  if (cs.length) {
    const l = sql.raw(`('${cs.join("','")}')`);
    const ps = (await db.select({ id: orders.id }).from(orders).where(inArray(orders.campaignId, cs))).map((o) => o.id);
    if (ps.length) {
      await db.delete(platformCharges).where(inArray(platformCharges.orderId, ps));
      await db.delete(chamados).where(inArray(chamados.orderId, ps));
    }
    await db.execute(sql`delete from quota_alloc where campaign_id in ${l}`);
    await db.execute(sql`delete from orders where campaign_id in ${l}`);
    await db.execute(sql`delete from draws where campaign_id in ${l}`);
    await db.execute(sql`delete from campaign_stats where campaign_id in ${l}`);
    await db.delete(campaigns).where(inArray(campaigns.id, cs));
  }
  await db.delete(users).where(eq(users.email, EMAIL));
  if (org) await db.delete(organizations).where(eq(organizations.id, org.id));
  await db.delete(buyers).where(like(buyers.name, "Cobrança Teste%"));
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'order:%'`);
}

async function rascunho(orgId: string, sufixo: string, precoCents: number) {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug: `${PREFIXO}${sufixo}`,
      title: `Rifa da cobrança ${sufixo}`,
      prizeTitle: `Prêmio ${sufixo}`,
      totalQuotas: 1000,
      priceCents: precoCents,
      status: "draft",
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: `SPA-COB-${sufixo}`,
      authorizationFileKey: "certificado-teste",
      metodoApuracao: "federal_direta",
    })
    .returning();
  await db.insert(campaignMedia).values([
    { campaignId: c.id, role: "banner", storageKey: `cob-b-${sufixo}`, mime: "image/webp", status: "ready" },
    { campaignId: c.id, role: "photo", storageKey: `cob-f-${sufixo}`, mime: "image/webp", status: "ready", position: 1 },
  ]);
  return c;
}

const ler = async (id: string) => (await db.select().from(campaigns).where(eq(campaigns.id, id)))[0];

async function main() {
  console.log("\n=== cobrança por rifa ===\n");
  await limpar();
  const admin = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
  // A tabela de antes volta direto no banco no fim: devolver pela rota seria
  // recusado se fosse um aumento com promotora que aceitou o contrato.
  const antes = await getPlataforma();
  let contratoDaProva: string | null = null;

  const [org] = await db
    .insert(organizations)
    .values({ slug: SLUG_ORG, name: "Cobrança Teste", cidade: "Natal", uf: "RN", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date(), sociosDeclaradosEm: new Date() })
    .returning();
  await db.insert(users).values({ role: "organizer", organizationId: org.id, name: "Org da cobrança", email: EMAIL, passwordHash: await hashPassword(SENHA) });
  const organizador = new Cliente();
  r = await organizador.req("POST", "/api/auth/login", { email: EMAIL, password: SENHA });
  if (r.status !== 200) throw new Error(`login do organizador: HTTP ${r.status}`);

  try {
    console.log("  a tabela da plataforma:");
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", { percentualPct: 5, porCotaCents: 30, faixasPix: [{ ate: 2, pct: 1 }, { ate: null, pct: 2 }] });
    checa("faixa que sobe a taxa é recusada (400)", r.status === 400, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", { percentualPct: 5, porCotaCents: 20_000, faixasPix: [{ ate: null, pct: 1 }] });
    checa("valor por cota acima do teto é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    // Parte de uma tabela mais alta em tudo: a da prova é uma redução, que
    // vale na hora com ou sem promotora com contrato.
    await setPlataforma({ cobranca: { percentualPct: 9, porCotaCents: 500, faixasPix: [{ ate: null, pct: 5 }] }, cobrancaProxima: null });
    const tabela = { percentualPct: 4.9, porCotaCents: 30, faixasPix: [{ ate: 2, pct: 2 }, { ate: null, pct: 1 }] };
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", { ...tabela, extra: "<script>" });
    checa(
      "a plataforma salva a tabela, só com as chaves conhecidas",
      r.status === 200 && JSON.stringify(r.json?.vigente) === JSON.stringify(tabela) && r.json?.proxima === null,
      `HTTP ${r.status} ${JSON.stringify(r.json)}`,
    );
    r = await organizador.req("GET", "/api/admin/cobranca/tabela");
    checa(
      "a organização lê a tabela em vigor e o prazo do aviso",
      r.status === 200 && r.json?.vigente?.porCotaCents === 30 && r.json?.proxima === null && r.json?.avisoDias === 30 && /^\d{4}-\d{2}-\d{2}$/.test(r.json?.primeiroDiaComAviso ?? ""),
      `HTTP ${r.status} ${JSON.stringify(r.json)}`,
    );
    r = await organizador.req("PUT", "/api/admin/cobranca/tabela", { percentualPct: 0 });
    checa("a organização não muda a tabela (403)", r.status === 403, `HTTP ${r.status}`);
    r = await new Cliente().req("GET", "/api/admin/cobranca/tabela");
    checa("sem sessão não lê", r.status === 401 || r.status === 403, `HTTP ${r.status}`);

    console.log("\n  a escolha no rascunho:");
    const a = await rascunho(org.id, "a", 1000);
    checa("o rascunho nasce no percentual", a.cobrancaModo === "percentual" && a.cobranca === null);
    r = await organizador.req("PATCH", `/api/admin/campaigns/${a.id}`, { cobrancaModo: "mensalidade" });
    checa("modo desconhecido é recusado", r.status === 400, `HTTP ${r.status}`);
    r = await organizador.req("PATCH", `/api/admin/campaigns/${a.id}`, { cobrancaModo: "por_cota", cobranca: { modo: "por_cota", porCotaCents: 0 } });
    checa("a organização escolhe por cota", r.status === 200 && r.json?.cobrancaModo === "por_cota", `HTTP ${r.status}`);
    checa("a tabela não vem do formulário", (await ler(a.id)).cobranca === null);

    const barata = await rascunho(org.id, "barata", 30);
    await organizador.req("PATCH", `/api/admin/campaigns/${barata.id}`, { cobrancaModo: "por_cota" });
    r = await organizador.req("POST", `/api/admin/campaigns/${barata.id}/publish`);
    checa("por cota igual ao preço da cota não publica (422)", r.status === 422 && /preço da cota/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);

    r = await organizador.req("PUT", `/api/admin/campaigns/${a.id}/packages`, { packages: [{ quantity: 10, discountPct: 98 }] });
    checa("pacote que deixa a cota abaixo da taxa por cota é recusado (422)", r.status === 422 && /pacote de 10/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);

    console.log("\n  a publicação fotografa e trava:");
    r = await organizador.req("POST", `/api/admin/campaigns/${a.id}/publish`);
    checa("publica", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    let rifa = await ler(a.id);
    // O jsonb guarda as chaves na ordem dele: compara campo a campo.
    checa(
      "a rifa guarda o modo e a tabela do dia",
      rifa.cobranca?.modo === "por_cota" &&
        rifa.cobranca.percentualPct === tabela.percentualPct &&
        rifa.cobranca.porCotaCents === tabela.porCotaCents &&
        JSON.stringify(rifa.cobranca.faixasPix) === JSON.stringify(tabela.faixasPix),
      JSON.stringify(rifa.cobranca),
    );
    r = await admin.req("PATCH", `/api/admin/campaigns/${a.id}`, { cobrancaModo: "percentual" });
    checa("nem a plataforma troca o modo depois de publicar (422)", r.status === 422, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", { ...tabela, porCotaCents: 20 });
    rifa = await ler(a.id);
    checa("mudar a tabela não mexe na rifa publicada", r.status === 200 && rifa.cobranca?.porCotaCents === 30, `HTTP ${r.status} ${rifa.cobranca?.porCotaCents}`);

    // A demonstração nasce no ar sem passar pela publicação: desmarcada, ela
    // passa a vender e ganha a tabela do dia — nunca vende sem taxa.
    const [demo] = await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        slug: `${PREFIXO}demo`,
        title: "Rifa de teste",
        prizeTitle: "Prêmio de teste",
        totalQuotas: 1000,
        priceCents: 1000,
        status: "published",
        publishedAt: new Date(),
        demonstracao: true,
        authorizationCode: "SPA-COB-DEMO",
        drawAt: new Date(Date.now() + 20 * 86_400_000),
      })
      .returning();
    r = await admin.req("POST", `/api/admin/campaigns/${demo.id}/demonstracao`, { ligado: false });
    const desmarcada = await ler(demo.id);
    checa(
      "desmarcar a demonstração fotografa a tabela do dia",
      r.status === 200 && !desmarcada.demonstracao && desmarcada.cobranca?.modo === "percentual" && desmarcada.cobranca?.porCotaCents === 20,
      `HTTP ${r.status} ${JSON.stringify(desmarcada.cobranca)}`,
    );

    console.log("\n  o pedido e o pagamento:");
    const mes = mesEmSaoPaulo(new Date());
    const volume = async () => (await db.select().from(pixVolumeMensal).where(and(eq(pixVolumeMensal.organizationId, org.id), eq(pixVolumeMensal.mes, mes))))[0]?.transacoes ?? 0;
    const comprar = async (i: number, quantidade: number) => {
      const p = await new Cliente().req("POST", "/api/public/orders", { campaignId: a.id, quantity: quantidade, buyer: { name: `Cobrança Teste ${i}`, phone: TELEFONE(i) } });
      if (p.status !== 201) throw new Error(`pedido ${i}: HTTP ${p.status} ${p.json?.message ?? ""}`);
      return p.json.code as number;
    };
    const pedido = async (code: number) => (await db.select().from(orders).where(eq(orders.code, code)))[0];

    const c1 = await comprar(1, 3);
    let o = await pedido(c1);
    checa("o pedido fotografa o modo, o valor por cota e a primeira faixa do Pix", o.taxaModo === "por_cota" && o.taxaPorCotaCents === 30 && o.taxaPixBp === 200 && o.taxaVendaBp === 0, JSON.stringify({ m: o.taxaModo, c: o.taxaPorCotaCents, p: o.taxaPixBp }));
    await new Cliente().req("POST", `/api/dev/pay/${c1}`);
    let [taxa] = await db.select().from(platformCharges).where(eq(platformCharges.orderId, o.id));
    checa("pago: R$ 0,90 de venda (3 × R$ 0,30) e 2% de R$ 30,00 de Pix numa linha", taxa?.vendaCents === 90 && taxa?.pixCents === 60 && taxa?.amountCents === 150 && taxa?.modo === "por_cota", JSON.stringify(taxa));
    checa("o volume do mês conta a transação", (await volume()) === 1, `${await volume()}`);
    await new Cliente().req("POST", `/api/dev/pay/${c1}`);
    checa("o aviso repetido não conta de novo nem lança outra taxa", (await volume()) === 1 && (await db.select().from(platformCharges).where(eq(platformCharges.orderId, o.id))).length === 1);

    const c2 = await comprar(2, 1);
    await new Cliente().req("POST", `/api/dev/pay/${c2}`);
    const c3 = await comprar(3, 2);
    o = await pedido(c3);
    checa("passou de 2 transações no mês: a faixa seguinte, menor", o.taxaPixBp === 100 && (await volume()) === 2, `${o.taxaPixBp} com ${await volume()}`);
    await new Cliente().req("POST", `/api/dev/pay/${c3}`);
    [taxa] = await db.select().from(platformCharges).where(eq(platformCharges.orderId, o.id));
    checa("e o lançamento usa a faixa fotografada", taxa?.vendaCents === 60 && taxa?.pixCents === 20, JSON.stringify(taxa));

    console.log("\n  o estorno (cláusula X.10):");
    // O motivo sai do chamado estornado do pedido; sem chamado, é o provedor.
    const comChamado = async (code: number, tipo: string | null, falha: boolean) => {
      const o = await pedido(code);
      await db.insert(chamados).values({
        protocolo: `CB-${code}`,
        organizationId: org.id,
        orderId: o.id,
        buyerId: o.buyerId,
        status: "estornado",
        motivo: "prova da cobrança",
        tipoReembolso: tipo,
        falhaPlataforma: falha,
        estornadoEm: new Date(),
      });
      return o;
    };
    const taxaDe = async (orderId: string) => (await db.select().from(platformCharges).where(eq(platformCharges.orderId, orderId)))[0];
    let o1 = await comChamado(c1, "arrependimento", false);
    let est = await refundOrder(o1.id);
    let t = await taxaDe(o1.id);
    checa("arrependimento: as duas taxas são canceladas", est?.motivo === "arrependimento" && t?.status === "cancelada", `${est?.motivo} ${t?.status}`);
    o1 = await pedido(c2);
    est = await refundOrder(o1.id);
    t = await taxaDe(o1.id);
    checa("provedor (sem chamado): fica só a taxa Pix", est?.motivo === "provedor" && t?.status === "aberta" && t.vendaCents === 0 && t.amountCents === t.pixCents && t.pixCents > 0, JSON.stringify(t));
    o1 = await comChamado(c3, "com_taxa", true);
    est = await refundOrder(o1.id);
    t = await taxaDe(o1.id);
    checa("falha da plataforma: as duas taxas são canceladas", est?.motivo === "falha_plataforma" && t?.status === "cancelada", `${est?.motivo} ${t?.status}`);
    checa("o estorno não desconta o volume do mês", (await volume()) === 3, `${await volume()}`);

    r = await organizador.req("GET", "/api/admin/cobranca/extrato");
    checa(
      "o extrato mostra o pedido estornado com só a taxa Pix",
      r.status === 200 && r.json?.linhas?.length === 3 && r.json.linhas.some((l: any) => l.pedidoStatus === "refunded" && l.charge.status === "aberta" && l.charge.vendaCents === 0),
      `HTTP ${r.status} ${r.json?.linhas?.length}`,
    );

    console.log("\n  a tabela agendada (cláusula X.3):");
    const vigente = { ...tabela, porCotaCents: 20 };
    const maior = { ...vigente, percentualPct: 6 };
    const minimo = primeiroDiaComAviso(new Date());
    const diaAntes = new Date(new Date(`${minimo}T12:00:00-03:00`).getTime() - 86_400_000).toISOString().slice(0, 10);
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", { ...maior, vigenteEm: minimo });
    checa("a plataforma agenda o aumento com 30 dias", r.status === 200 && r.json?.proxima?.vigenteEm === minimo && r.json?.vigente?.percentualPct === 4.9, `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    r = await organizador.req("GET", "/api/admin/cobranca/tabela");
    checa("a organização vê a tabela agendada", r.status === 200 && r.json?.proxima?.tabela?.percentualPct === 6, `HTTP ${r.status}`);
    r = await organizador.req("GET", "/api/admin/cobranca/extrato");
    checa("o extrato traz a agendada para o aviso", r.status === 200 && r.json?.proxima?.vigenteEm === minimo && r.json?.tabela?.percentualPct === 4.9, `HTTP ${r.status}`);
    const b = await rascunho(org.id, "b", 1000);
    r = await organizador.req("POST", `/api/admin/campaigns/${b.id}/publish`);
    checa("publicada antes da data, a rifa grava a tabela em vigor", r.status === 200 && (await ler(b.id)).cobranca?.percentualPct === 4.9, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await organizador.req("PUT", "/api/admin/cobranca/tabela", { ...maior, vigenteEm: minimo });
    checa("a organização não agenda (403)", r.status === 403, `HTTP ${r.status}`);
    r = await organizador.req("DELETE", "/api/admin/cobranca/tabela/proxima");
    checa("a organização não cancela o agendamento (403)", r.status === 403, `HTTP ${r.status}`);
    for (const [nome, dia] of [["no passado", "2020-01-01"], ["fora do formato", "10/11/2026"], ["que não existe", "2026-02-30"]] as const) {
      r = await admin.req("PUT", "/api/admin/cobranca/tabela", { ...maior, vigenteEm: dia });
      checa(`data ${nome} é recusada (422)`, r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    }

    // Com promotora que aceitou o contrato, o aumento precisa do aviso.
    const [algumAceite] = await db.select({ id: contratoPromotoraAceites.id }).from(contratoPromotoraAceites).limit(1);
    if (!algumAceite) {
      r = await admin.req("PUT", "/api/admin/cobranca/tabela", { ...maior, vigenteEm: diaAntes });
      checa("sem promotora com contrato, o aumento pode valer antes dos 30 dias (montagem)", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      const [ultima] = await db.select({ v: sql<number>`coalesce(max(${contratosPromotora.versao}), 0)` }).from(contratosPromotora);
      const [versao] = await db.insert(contratosPromotora).values({ versao: Number(ultima.v) + 1, texto: "Contrato da prova da cobrança." }).returning();
      contratoDaProva = versao.id;
      await db.insert(contratoPromotoraAceites).values({ contratoId: versao.id, organizationId: org.id, versao: versao.versao, texto: versao.texto });
    }
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", maior);
    checa("aumento para valer agora é recusado (422)", r.status === 422 && /30 dias de aviso/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", { ...maior, vigenteEm: diaAntes });
    checa("aumento com menos de 30 dias é recusado (422)", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", { ...maior, vigenteEm: minimo });
    checa("aumento com 30 dias é aceito", r.status === 200 && r.json?.proxima?.vigenteEm === minimo, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", { ...vigente, porCotaCents: 15 });
    checa("redução vale na hora e descarta a agendada", r.status === 200 && r.json?.vigente?.porCotaCents === 15 && r.json?.proxima === null, `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    r = await admin.req("DELETE", "/api/admin/cobranca/tabela/proxima");
    checa("sem agendada, cancelar é 404", r.status === 404, `HTTP ${r.status}`);
    await admin.req("PUT", "/api/admin/cobranca/tabela", { ...maior, vigenteEm: minimo });
    r = await admin.req("DELETE", "/api/admin/cobranca/tabela/proxima");
    const depois = (await admin.req("GET", "/api/admin/cobranca/tabela")).json;
    checa("a plataforma cancela o agendamento", r.status === 204 && depois?.proxima === null && depois?.vigente?.porCotaCents === 15, `HTTP ${r.status}`);

    console.log("\n  a falta de pagamento (cláusula X.13 (a)):");
    const emAberto = async () =>
      Number(
        (
          await db
            .select({ c: sql<number>`coalesce(sum(${platformCharges.amountCents}), 0)::int` })
            .from(platformCharges)
            .where(and(eq(platformCharges.organizationId, org.id), eq(platformCharges.status, "aberta")))
        )[0].c,
      );
    const devido = await emAberto();
    checa("há taxa em aberto (a do Pix que ficou no estorno pelo provedor)", devido > 0, `${devido}`);
    r = await organizador.req("POST", `/api/admin/cobranca/${org.id}/notificar`);
    checa("a organização não notifica (403)", r.status === 403, `HTTP ${r.status}`);
    r = await organizador.req("GET", "/api/admin/cobranca/notificacao");
    checa("sem notificação, nada a avisar", r.status === 200 && r.json?.notificacao === null, `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    r = await admin.req("POST", "/api/admin/cobranca/nao-e-um-id/notificar");
    checa("organização inexistente é 404", r.status === 404, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/cobranca/${org.id}/notificar`);
    const notificada = r.json;
    const dezDias = Date.now() + 10 * 86_400_000;
    checa(
      "a plataforma notifica com o valor em aberto e o bloqueio depois de 10 dias",
      r.status === 201 && notificada?.valorCents === devido && new Date(notificada?.bloqueiaEm).getTime() > dezDias && new Date(notificada?.bloqueiaEm).getTime() <= dezDias + 86_400_000,
      `HTTP ${r.status} ${JSON.stringify(notificada)}`,
    );
    r = await admin.req("POST", `/api/admin/cobranca/${org.id}/notificar`);
    checa("notificar de novo é 409 (uma aberta por organização)", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await organizador.req("GET", "/api/admin/cobranca/notificacao");
    checa(
      "a organização vê a notificação dela, com o que segue em aberto",
      r.status === 200 && r.json?.notificacao?.id === notificada?.id && r.json?.notificacao?.abertoCents === devido,
      `HTTP ${r.status} ${JSON.stringify(r.json)}`,
    );
    r = await admin.req("GET", "/api/admin/cobranca");
    const naCarteira = r.json?.carteira?.find((l: any) => l.organizationId === org.id);
    checa("a carteira da plataforma mostra a notificação", naCarteira?.notificacao?.id === notificada?.id, JSON.stringify(naCarteira?.notificacao));

    const c = await rascunho(org.id, "c", 1000);
    r = await organizador.req("GET", `/api/admin/campaigns/${c.id}/blockers`);
    checa("no prazo, nada bloqueia", r.status === 200 && !r.json?.blockers?.some((b: string) => /falta de pagamento/.test(b)), JSON.stringify(r.json));
    r = await organizador.req("POST", `/api/admin/campaigns/${c.id}/publish`);
    checa("no prazo, publica", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    // O prazo passa (no banco: a prova não espera 10 dias).
    await db.execute(sql`update cobranca_notificacoes set bloqueia_em = now() at time zone 'UTC' - interval '1 minute' where id = ${notificada.id}::uuid`);
    const d = await rascunho(org.id, "d", 1000);
    r = await organizador.req("GET", `/api/admin/campaigns/${d.id}/blockers`);
    checa("vencido o prazo, o painel diz o que falta", r.json?.blockers?.some((b: string) => /bloqueada por falta de pagamento/.test(b)), JSON.stringify(r.json));
    r = await organizador.req("POST", `/api/admin/campaigns/${d.id}/publish`);
    checa("vencido o prazo, rifa nova não publica (422)", r.status === 422 && /falta de pagamento/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("e segue em rascunho", (await ler(d.id)).status === "draft");
    const c4 = await comprar(4, 1);
    const pagou = await new Cliente().req("POST", `/api/dev/pay/${c4}`);
    checa("a rifa no ar segue vendendo", pagou.status < 300 && (await pedido(c4)).status === "paid", `HTTP ${pagou.status}`);
    r = await organizador.req("GET", "/api/admin/cobranca/notificacao");
    checa("a venda de depois não entra na notificação", r.json?.notificacao?.abertoCents === devido, JSON.stringify(r.json?.notificacao));

    r = await organizador.req("POST", `/api/admin/cobranca/${org.id}/baixa`);
    checa("a organização não dá baixa (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/cobranca/${org.id}/baixa`);
    checa("o acerto regulariza a notificação na mesma transação", r.status === 200 && r.json?.regularizada === true, `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    const [encerrada] = await db.execute(sql`select status from cobranca_notificacoes where id = ${notificada.id}::uuid`).then((x) => x.rows as { status: string }[]);
    checa("a notificação fica como regularizada", encerrada?.status === "regularizada", JSON.stringify(encerrada));
    r = await organizador.req("POST", `/api/admin/campaigns/${d.id}/publish`);
    checa("pago, a publicação volta", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await organizador.req("GET", "/api/admin/cobranca/notificacao");
    checa("e o aviso some", r.json?.notificacao === null, JSON.stringify(r.json));
    r = await admin.req("POST", `/api/admin/cobranca/${org.id}/notificar`);
    checa("sem nada em aberto, não há o que notificar (409)", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    // Cancelar: só a plataforma, com motivo, uma vez.
    const c5 = await comprar(5, 1);
    await new Cliente().req("POST", `/api/dev/pay/${c5}`);
    const juntas = await Promise.all([admin.req("POST", `/api/admin/cobranca/${org.id}/notificar`), admin.req("POST", `/api/admin/cobranca/${org.id}/notificar`)]);
    const status = juntas.map((x) => x.status).sort();
    checa("duas notificações ao mesmo tempo: uma 201 e uma 409", status[0] === 201 && status[1] === 409, status.join(","));
    const nova = juntas.find((x) => x.status === 201)?.json;
    r = await organizador.req("POST", `/api/admin/cobranca/notificacoes/${nova?.id}/cancelar`, { motivo: "acordo de pagamento" });
    checa("a organização não cancela (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/cobranca/notificacoes/${nova?.id}/cancelar`, { motivo: "" });
    checa("cancelar sem motivo é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/cobranca/notificacoes/${nova?.id}/cancelar`, { motivo: "acordo de pagamento em duas vezes" });
    checa("a plataforma cancela com motivo", r.status === 200 && r.json?.status === "cancelada", `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/cobranca/notificacoes/${nova?.id}/cancelar`, { motivo: "de novo, por engano" });
    checa("cancelar de novo é 409", r.status === 409, `HTTP ${r.status}`);
    const [auditoria] = await db.execute(
      sql`select count(*)::int as n from audit_log where entity = 'organization' and entity_id = ${org.id} and action in ('cobranca.notificar', 'cobranca.notificar.cancelar')`,
    ).then((x) => x.rows as { n: number }[]);
    checa("notificar e cancelar entram na auditoria", Number(auditoria?.n) === 3, JSON.stringify(auditoria));
  } finally {
    await setPlataforma({ cobranca: antes.cobranca, cobrancaProxima: antes.cobrancaProxima }).catch(() => {});
    await limpar();
    if (contratoDaProva) {
      await db.delete(contratoPromotoraAceites).where(eq(contratoPromotoraAceites.contratoId, contratoDaProva));
      await db.delete(contratosPromotora).where(eq(contratosPromotora.id, contratoDaProva));
    }
  }

  console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
