/**
 * Prova das rifas patrocinadas por clique (etapa 15), pela API de verdade:
 *
 * - desligado (padrão), o bloco vem vazio e nada se compra; só a plataforma
 *   liga e edita a tabela (organizador: 403), sem mexer no resto da config;
 * - recarga por Pix: mínimo conferido, crédito uma vez só (webhook repetido);
 * - anúncio = pacote de cliques: preço da tabela por alcance, desconto da
 *   faixa, mínimo de cliques, sem saldo nada entra, rifa do vizinho é 404;
 * - fila por ordem de chegada: com uma vaga, o primeiro fica no ar até gastar
 *   o pacote e o segundo entra sozinho no clique seguinte, com a previsão;
 * - clique: uma vez por aparelho em 24 h; robô, aparelho sem identificação e
 *   anúncio esgotado vão para "barrados" e não gastam;
 * - não existe cancelar anúncio; rifa fora do ar credita no saldo o que não
 *   foi gasto;
 * - reembolso do saldo só com o interruptor ligado (desligado: 404 e nada no
 *   painel), valor reservado na abertura, conversa, decisão e baixa só da
 *   plataforma, uma vez cada;
 * - retorno: exibições, cliques, gasto e a venda atribuída pelo aparelho,
 *   cada organização vendo só o dela.
 *
 *   npm run patrocinio      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { appSettings, campaignStats, campaigns, orders, organizations, patrocinioAnuncios, patrocinioRecargas, users } from "../shared/schema";
import { encerrarAnunciosForaDoAr } from "../server/services/patrocinio";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

const NAVEGADOR = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36";

class Cliente {
  cookie = "";
  constructor(readonly aparelho?: string, readonly agente = NAVEGADOR) {}
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": this.agente,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.aparelho ? { "x-device-id": this.aparelho } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
  async entrar(email: string, password: string) {
    const r = await this.req("POST", "/api/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`login ${email}: HTTP ${r.status}`);
    return this;
  }
}

const SLUGS = ["patrocinio-a", "patrocinio-b"];
const EMAILS = ["patrocinio-a@teste.rifa", "patrocinio-b@teste.rifa"];
const SENHA = "senha-patrocinio-1";

async function limpar() {
  const os = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = os.map((o) => o.id);
  if (ids.length) {
    const l = sql.raw(`('${ids.join("','")}')`);
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id in ${l})`);
    await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id in ${l}))`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id in ${l})`);
    await db.execute(sql`delete from patrocinio_anuncios where organization_id in ${l}`);
    await db.execute(sql`delete from patrocinio_lancamentos where organization_id in ${l}`);
    await db.execute(sql`delete from patrocinio_reembolsos where organization_id in ${l}`);
    await db.execute(sql`delete from patrocinio_recargas where organization_id in ${l}`);
    await db.execute(sql`delete from campaigns where organization_id in ${l}`);
  }
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from buyers where phone like '1194443%'`);
  await db.execute(sql`delete from rate_events where bucket like 'patrocinio-%' or bucket like 'login:%' or bucket like 'order:%'`);
}

async function saldo(id: string) {
  const [o] = await db.select({ s: organizations.patrocinioSaldoCents }).from(organizations).where(eq(organizations.id, id));
  return o.s;
}

async function anuncio(id: string) {
  const [a] = await db.select().from(patrocinioAnuncios).where(eq(patrocinioAnuncios.id, id));
  return a;
}

async function main() {
  console.log("\n=== rifas patrocinadas ===\n");
  await limpar();
  const [antes] = await db.select().from(appSettings).where(eq(appSettings.key, "plataforma"));

  const orgs: { id: string }[] = [];
  const rifas: { id: string; slug: string }[] = [];
  const clientes: Cliente[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db
      .insert(organizations)
      .values({ slug, name: `Patrocínio ${i ? "B" : "A"}`, cnpj: "11222333000181", uf: "SP", cidade: "Campinas" })
      .returning();
    await db.insert(users).values({ role: "organizer", organizationId: o.id, name: `Org ${i}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) });
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: o.id,
        slug: `${slug}-rifa`,
        title: `Rifa ${slug}`,
        prizeTitle: "Moto",
        totalQuotas: 1000,
        priceCents: 500,
        status: "published",
        publishedAt: new Date(),
        drawAt: new Date(Date.now() + 10 * 86_400_000),
        authorizationCode: "SPA-PATROCINIO",
        authorizationFileKey: "certificado-teste",
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    orgs.push(o);
    rifas.push(c);
    clientes.push(await new Cliente().entrar(EMAILS[i], SENHA));
  }
  const [A, B] = orgs;
  const [rA, rB] = rifas;
  const [orgA, orgB] = clientes;
  const admin = await new Cliente().entrar("admin@rifa.br", "admin123");
  const clique = (id: string, c: Cliente, uf = "SP") => c.req("POST", `/api/public/patrocinadas/${id}/clique`, { uf });
  const vitrine = async (q = "") => ((await new Cliente().req("GET", `/api/public/patrocinadas${q}`)).json ?? []) as { id: string; campaignId: string }[];
  const comprar = (c: Cliente, corpo: Record<string, unknown>) => c.req("POST", "/api/admin/patrocinio/anuncios", corpo);
  const TABELA = {
    precos: { cidade: 10, estado: 20, nacional: 30 },
    faixas: [{ aPartirDe: 100, descontoPct: 10 }],
    minimoCliques: 3,
    vagas: { cidade: 1, estado: 1, nacional: 1 },
    recargaMinimaCents: 1000,
  };

  try {
    await admin.req("PUT", "/api/admin/patrocinio/config", { ligado: false });
    checa("desligado: bloco vazio", (await vitrine()).length === 0);
    let r = await comprar(orgA, { campaignId: rA.id, alcance: "nacional", cliques: 3 });
    checa("desligado: não compra (409)", r.status === 409, `HTTP ${r.status}`);

    r = await orgA.req("PUT", "/api/admin/patrocinio/config", { ligado: true, patrocinio: TABELA });
    checa("organizador não liga nem mexe na tabela (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/patrocinio/config", { ligado: true, patrocinio: { ...TABELA, faixas: [{ aPartirDe: 100, descontoPct: 10 }, { aPartirDe: 200, descontoPct: 5 }] } });
    checa("faixa com desconto que diminui: 400", r.status === 400, `HTTP ${r.status}`);
    const cfgAntes = (await admin.req("GET", "/api/admin/plataforma")).json;
    r = await admin.req("PUT", "/api/admin/patrocinio/config", { ligado: true, patrocinio: TABELA });
    checa("a plataforma liga com a tabela", r.status === 200 && r.json?.ligado === true && r.json?.precos?.estado === 20 && r.json?.vagas?.nacional === 1, `HTTP ${r.status}`);
    const cfgDepois = (await admin.req("GET", "/api/admin/plataforma")).json;
    checa("ligar não mexe no resto", cfgDepois.estornoManual === cfgAntes.estornoManual && cfgDepois.bonusLigado === cfgAntes.bonusLigado);

    // Recarga.
    r = await orgA.req("POST", "/api/admin/patrocinio/recargas", { valorCents: 500 });
    checa("recarga abaixo do mínimo: 400", r.status === 400, `HTTP ${r.status}`);
    r = await orgA.req("POST", "/api/admin/patrocinio/recargas", { valorCents: 2000 });
    checa("recarga gera Pix", r.status === 201 && r.json?.codigo >= 900_000_000 && Boolean(r.json?.pix?.copyPaste), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const codigo = r.json?.codigo;
    checa("antes do Pix, saldo zero", (await saldo(A.id)) === 0);
    await fetch(`${URL}/api/dev/recarga/${codigo}`, { method: "POST" });
    await fetch(`${URL}/api/dev/recarga/${codigo}`, { method: "POST" });
    checa("pago: credita uma vez só", (await saldo(A.id)) === 2000, String(await saldo(A.id)));
    const [rec] = await db.select().from(patrocinioRecargas).where(eq(patrocinioRecargas.codigo, codigo));
    checa("a recarga fica paga", rec.status === "paga");
    r = await admin.req("POST", "/api/admin/patrocinio/recargas", { valorCents: 2000 });
    checa("a plataforma não recarrega (usa ajuste)", r.status === 400, `HTTP ${r.status}`);

    // Ajuste da plataforma para a B.
    r = await orgA.req("POST", "/api/admin/patrocinio/ajustes", { organizationId: B.id, valorCents: 100, descricao: "crédito de teste" });
    checa("organizador não ajusta saldo (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/patrocinio/ajustes", { organizationId: B.id, valorCents: 1000, descricao: "Crédito de boas-vindas" });
    checa("a plataforma credita", r.status === 200 && r.json?.saldoCents === 1000, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/patrocinio/ajustes", { organizationId: B.id, valorCents: -5000, descricao: "Débito maior que o saldo" });
    checa("ajuste não deixa o saldo negativo (409)", r.status === 409 && (await saldo(B.id)) === 1000, `HTTP ${r.status}`);

    // Compra do pacote.
    r = await comprar(orgA, { campaignId: rA.id, alcance: "nacional", cliques: 2 });
    checa("abaixo do mínimo de cliques: 400", r.status === 400, `HTTP ${r.status}`);
    r = await comprar(orgA, { campaignId: rB.id, alcance: "nacional", cliques: 3 });
    checa("rifa do vizinho: 404", r.status === 404, `HTTP ${r.status}`);
    r = await comprar(orgA, { campaignId: rA.id, alcance: "estado", cliques: 3 });
    checa("estado sem UF: 400", r.status === 400, `HTTP ${r.status}`);
    r = await comprar(orgA, { campaignId: rA.id, alcance: "nacional", cliques: 3 });
    const nA = r.json?.id as string;
    checa("compra nacional: 3 × 30 = R$ 0,90", r.status === 201 && r.json?.valorPagoCents === 90 && (await saldo(A.id)) === 1910, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await comprar(orgA, { campaignId: rA.id, alcance: "estado", uf: "SP", cliques: 100 });
    const eA = r.json?.id as string;
    checa("pacote de 100 no estado: 10% de desconto (R$ 18,00)", r.status === 201 && r.json?.valorPagoCents === 1800 && r.json?.descontoPct === 10 && (await saldo(A.id)) === 110, `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    const quantosAntes = (await db.select().from(patrocinioAnuncios).where(eq(patrocinioAnuncios.organizationId, A.id))).length;
    r = await comprar(orgA, { campaignId: rA.id, alcance: "nacional", cliques: 10 });
    const quantosDepois = (await db.select().from(patrocinioAnuncios).where(eq(patrocinioAnuncios.organizationId, A.id))).length;
    checa("sem saldo: 409 e nada entra na fila", r.status === 409 && quantosDepois === quantosAntes && (await saldo(A.id)) === 110, `HTTP ${r.status}`);

    r = await comprar(orgB, { campaignId: rB.id, alcance: "nacional", cliques: 3 });
    const nB = r.json?.id as string;
    checa("B compra nacional e vai para a fila", r.status === 201 && (await saldo(B.id)) === 910);
    r = await comprar(orgB, { campaignId: rB.id, alcance: "cidade", uf: "RJ", cidade: "Niterói", cliques: 5 });
    const cB = r.json?.id as string;
    checa("B compra cidade (5 × 10)", r.status === 201 && r.json?.valorPagoCents === 50 && r.json?.segmento === "cidade:RJ:niteroi" && (await saldo(B.id)) === 860, JSON.stringify(r.json));

    // Fila.
    let v = await vitrine();
    checa("uma vaga no Brasil: só o primeiro a chegar", v.length === 1 && v[0].id === nA, JSON.stringify(v));
    v = await vitrine("?uf=SP");
    checa("quem olha de SP vê o estado primeiro, uma vez por rifa", v.length === 1 && v[0].id === eA, JSON.stringify(v));
    v = await vitrine("?uf=RJ&cidade=niteroi");
    checa("quem olha de Niterói vê a cidade, depois o Brasil", v.map((x) => x.id).join() === [cB, nA].join(), JSON.stringify(v));
    r = await admin.req("GET", "/api/admin/patrocinio");
    const segN = r.json?.fila?.find((s: any) => s.segmento === "nacional");
    const naFilaB = segN?.anuncios?.find((a: any) => a.id === nB);
    checa(
      "a plataforma vê a fila: A no ar, B em 1º com previsão de 3 cliques",
      segN?.anuncios?.find((a: any) => a.id === nA)?.noAr === true && naFilaB?.noAr === false && naFilaB?.posicaoNaFila === 1 && naFilaB?.entraEmCliques === 3,
      JSON.stringify(segN),
    );
    r = await orgB.req("GET", "/api/admin/patrocinio");
    const meuB = r.json?.anuncios?.find((a: any) => a.id === nB);
    checa("B vê a própria posição", meuB?.situacao === "na_fila" && meuB?.posicaoNaFila === 1 && meuB?.entraEmCliques === 3, JSON.stringify(meuB));
    checa("B não vê os anúncios de A", !r.json?.anuncios?.some((a: any) => a.id === nA || a.id === eA));
    checa("organizador não recebe a fila da plataforma", r.json?.plataforma === false && r.json?.fila === undefined && r.json?.organizacoes === undefined);

    // Sem cancelamento: o crédito do anúncio de rifa no ar fica com ele.
    r = await orgB.req("POST", `/api/admin/patrocinio/anuncios/${cB}/cancelar`);
    checa("não existe cancelar anúncio (404)", r.status === 404 && (await saldo(B.id)) === 860, `HTTP ${r.status}`);

    // Reembolso do saldo: interruptor desligado = não existe para o organizador.
    const pedirReembolso = (c: Cliente, corpo: Record<string, unknown>) => c.req("POST", "/api/admin/patrocinio/reembolsos", corpo);
    const corpoOk = { valorCents: 300, chavePix: "financeiro@patrocinio-b.teste", motivo: "Vamos pausar a divulgação neste mês." };
    r = await orgB.req("GET", "/api/admin/patrocinio");
    checa("desligado: o painel não traz reembolso", r.json?.config?.reembolso === false && r.json?.reembolsos?.length === 0);
    r = await pedirReembolso(orgB, corpoOk);
    checa("desligado: pedir reembolso é 404", r.status === 404 && (await saldo(B.id)) === 860, `HTTP ${r.status}`);
    r = await orgB.req("PUT", "/api/admin/patrocinio/config", { reembolso: true });
    checa("organizador não liga o reembolso (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/patrocinio/config", { reembolso: true });
    checa("a plataforma liga o reembolso sem mexer no resto", r.status === 200 && r.json?.reembolso === true && r.json?.ligado === true && r.json?.precos?.estado === 20, JSON.stringify(r.json));

    r = await pedirReembolso(orgB, { ...corpoOk, motivo: "curto" });
    checa("pedido sem motivo: 400", r.status === 400, `HTTP ${r.status}`);
    r = await pedirReembolso(orgB, { ...corpoOk, valorCents: 5000 });
    checa("mais que o saldo livre: 409, e nada fica", r.status === 409 && (await saldo(B.id)) === 860, `HTTP ${r.status}`);
    const [e1, e2] = await Promise.all([pedirReembolso(orgB, corpoOk), pedirReembolso(orgB, corpoOk)]);
    const pedidoR = (e1.status === 201 ? e1 : e2).json;
    checa("dois pedidos ao mesmo tempo: um abre, o outro 409", [e1.status, e2.status].sort().join() === "201,409", `${e1.status} ${e2.status}`);
    checa("o valor fica reservado (sai do saldo)", /^PR-[A-Z2-9]{6}$/.test(pedidoR?.protocolo ?? "") && (await saldo(B.id)) === 560, String(await saldo(B.id)));
    r = await orgA.req("POST", `/api/admin/patrocinio/reembolsos/${pedidoR.id}/mensagens`, { texto: "oi" });
    checa("o vizinho não entra na conversa (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgB.req("POST", `/api/admin/patrocinio/reembolsos/${pedidoR.id}/mensagens`, { texto: "Podem ver, por favor?" });
    checa("a organização escreve", r.status === 201 && r.json?.autor === "organizacao", `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/patrocinio/reembolsos/${pedidoR.id}/mensagens`, { texto: "Estamos conferindo a divulgação externa." });
    checa("o suporte responde", r.status === 201 && r.json?.autor === "plataforma", `HTTP ${r.status}`);
    r = await orgB.req("POST", `/api/admin/patrocinio/reembolsos/${pedidoR.id}/decisao`, { aprovar: true, retidoCents: 0, explicacao: "Eu mesmo aprovo isto." });
    checa("organizador não decide (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/patrocinio/reembolsos/${pedidoR.id}/decisao`, { aprovar: true, retidoCents: 400, explicacao: "Retido maior que o pedido." });
    checa("retido maior que o pedido: 400", r.status === 400, `HTTP ${r.status}`);
    const [d1, d2] = await Promise.all([
      admin.req("POST", `/api/admin/patrocinio/reembolsos/${pedidoR.id}/decisao`, { aprovar: true, retidoCents: 50, explicacao: "Aprovado, retido o impulsionamento externo." }),
      admin.req("POST", `/api/admin/patrocinio/reembolsos/${pedidoR.id}/decisao`, { aprovar: false, explicacao: "Recusado no mesmo clique." }),
    ]);
    const decidido = (d1.status === 200 ? d1 : d2).json;
    checa("dois cliques, uma decisão", [d1.status, d2.status].sort().join() === "200,409", `${d1.status} ${d2.status}`);
    const saldoEsperado = decidido?.status === "aprovado" ? 560 : 860;
    checa("a decisão mexe no saldo uma vez só", (await saldo(B.id)) === saldoEsperado, `${decidido?.status} ${await saldo(B.id)}`);
    r = await orgB.req("POST", `/api/admin/patrocinio/reembolsos/${pedidoR.id}/mensagens`, { texto: "Obrigado" });
    checa("decidido: a conversa fecha (409)", r.status === 409, `HTTP ${r.status}`);

    // Um aprovado de ponta a ponta: devolve o pedido menos o retido, e a baixa sai uma vez.
    let aprovado = decidido;
    if (decidido?.status !== "aprovado") {
      const p3 = (await pedirReembolso(orgB, corpoOk)).json;
      aprovado = (await admin.req("POST", `/api/admin/patrocinio/reembolsos/${p3.id}/decisao`, { aprovar: true, retidoCents: 50, explicacao: "Aprovado, retido o impulsionamento externo." })).json;
    }
    checa("aprovado: devolve o pedido menos o retido, sem voltar ao saldo", aprovado?.devolverCents === 250 && aprovado?.retidoCents === 50 && (await saldo(B.id)) === 560, JSON.stringify(aprovado));
    r = await orgB.req("POST", `/api/admin/patrocinio/reembolsos/${aprovado.id}/pago`);
    checa("organizador não dá baixa (403)", r.status === 403, `HTTP ${r.status}`);
    const [b1, b2] = await Promise.all([
      admin.req("POST", `/api/admin/patrocinio/reembolsos/${aprovado.id}/pago`),
      admin.req("POST", `/api/admin/patrocinio/reembolsos/${aprovado.id}/pago`),
    ]);
    checa("baixa do Pix uma vez só", [b1.status, b2.status].sort().join() === "200,409", `${b1.status} ${b2.status}`);
    r = await orgB.req("GET", "/api/admin/patrocinio");
    const visto = r.json?.reembolsos?.find((x: any) => x.id === aprovado.id);
    checa(
      "a organização vê o pedido pago e a conversa, com o suporte sem nome",
      visto?.status === "pago" && visto.mensagens.every((m: any) => Object.keys(m).sort().join() === "autor,createdAt,texto"),
      JSON.stringify(visto),
    );
    r = await orgA.req("GET", "/api/admin/patrocinio");
    checa("a outra organização não vê os pedidos", !r.json?.reembolsos?.some((x: any) => x.id === pedidoR.id || x.id === aprovado.id));
    r = await admin.req("GET", "/api/admin/patrocinio");
    checa("a plataforma vê o pedido com a organização", r.json?.reembolsos?.some((x: any) => x.id === aprovado.id && x.organizacao === "Patrocínio B"));
    await admin.req("PUT", "/api/admin/patrocinio/config", { reembolso: false });
    r = await pedirReembolso(orgB, corpoOk);
    checa("desligado de novo: 404, e o histórico continua visível", r.status === 404 && (await orgB.req("GET", "/api/admin/patrocinio")).json?.reembolsos?.length >= 1, `HTTP ${r.status}`);
    // Para o resto da prova, o saldo de B volta ao que seria sem os pedidos.
    await admin.req("POST", "/api/admin/patrocinio/ajustes", { organizationId: B.id, valorCents: 860 - (await saldo(B.id)), descricao: "Acerto do teste de reembolso" });
    checa("acerto do teste", (await saldo(B.id)) === 860);

    // Exibições.
    await new Cliente("aparelho-x").req("POST", "/api/public/patrocinadas/exibicoes", { ids: [nA, eA], uf: "SP" });
    await new Cliente("aparelho-y", "Googlebot/2.1 (+http://www.google.com/bot.html)").req("POST", "/api/public/patrocinadas/exibicoes", { ids: [nA], uf: "SP" });

    // Cliques no anúncio nacional de A (3 comprados).
    await clique(nA, new Cliente("aparelho-1"));
    checa("clique gasta um do pacote", (await anuncio(nA)).cliquesUsados === 1);
    await Promise.all([clique(nA, new Cliente("aparelho-1")), clique(nA, new Cliente("aparelho-1"))]);
    checa("o mesmo aparelho em 24 h não gasta de novo", (await anuncio(nA)).cliquesUsados === 1);
    await clique(nA, new Cliente("aparelho-2", "Googlebot/2.1 (+http://www.google.com/bot.html)"));
    await clique(nA, new Cliente(undefined));
    checa("robô e aparelho sem identificação não gastam", (await anuncio(nA)).cliquesUsados === 1);
    await Promise.all([clique(nA, new Cliente("aparelho-3")), clique(nA, new Cliente("aparelho-4"))]);
    const acabou = await anuncio(nA);
    checa("o último clique encerra o anúncio", acabou.cliquesUsados === 3 && acabou.status === "encerrado", `${acabou.cliquesUsados} ${acabou.status}`);
    await clique(nA, new Cliente("aparelho-5"));
    checa("anúncio esgotado não passa do pacote", (await anuncio(nA)).cliquesUsados === 3);
    v = await vitrine();
    checa("o próximo da fila entra sozinho", v.length === 1 && v[0].id === nB, JSON.stringify(v));
    checa("o saldo não mexe no clique (já foi pago no pacote)", (await saldo(A.id)) === 110);

    // Venda atribuída pelo aparelho.
    await clique(nB, new Cliente("aparelho-9", NAVEGADOR), "RJ");
    const compra = await new Cliente("aparelho-9").req("POST", "/api/public/orders", {
      campaignId: rB.id,
      quantity: 2,
      buyer: { name: "Comprador Patrocínio", phone: "11944430001" },
    });
    await fetch(`${URL}/api/dev/pay/${compra.json?.code}`, { method: "POST" });
    const [pedido] = await db.select().from(orders).where(eq(orders.code, compra.json?.code));
    checa("a venda do aparelho que clicou fica com o anúncio", pedido?.anuncioId === nB, String(pedido?.anuncioId));
    const outra = await new Cliente("aparelho-sem-clique").req("POST", "/api/public/orders", {
      campaignId: rB.id,
      quantity: 1,
      buyer: { name: "Outro Comprador", phone: "11944430002" },
    });
    const [p2] = await db.select().from(orders).where(eq(orders.code, outra.json?.code));
    checa("sem clique, a venda não é atribuída", p2 && p2.anuncioId === null);

    // Números do patrocinador.
    r = await orgA.req("GET", "/api/admin/patrocinio?dias=7");
    let t = r.json?.totais;
    checa("A: 3 cliques, R$ 0,90, exibições e barrados", r.json?.dias === 7 && t?.cliques === 3 && t?.gastoCents === 90 && t?.exibicoes === 2 && t?.barrados >= 4, JSON.stringify(t));
    const linhaA = r.json?.anuncios?.find((a: any) => a.id === nA);
    checa("A: o anúncio encerrado com gasto cheio", linhaA?.situacao === "encerrado" && linhaA?.gastoCents === 90 && linhaA?.cliques === 3, JSON.stringify(linhaA));
    checa("A: o estado dos cliques entra na tabela", r.json?.porEstado?.some((e: any) => e.uf === "SP" && e.cliques === 3));
    r = await orgB.req("GET", "/api/admin/patrocinio");
    t = r.json?.totais;
    checa("B: 1 clique, 1 venda atribuída, R$ 10,00", t?.cliques === 1 && t?.vendas === 1 && t?.receitaCents === 1000 && t?.custoPorVendaCents === 30, JSON.stringify(t));
    checa("B: retorno calculado", t?.retorno === Math.round((100 * 1000) / 30) / 100, String(t?.retorno));
    checa("B: a série diária soma a receita", r.json?.serie?.reduce((s: number, d: any) => s + d.receitaCents, 0) === 1000);
    r = await admin.req("GET", "/api/admin/patrocinio");
    checa(
      "a plataforma vê o total e o saldo de todas",
      r.json?.totais?.cliques >= 4 && r.json?.vendidoCents >= 90 + 1800 + 90 && r.json.organizacoes.some((o: any) => o.id === A.id && o.saldoCents === 110),
    );

    // Rifa fora do ar: o anúncio para e o que sobrou volta ao saldo como crédito.
    await db.update(campaigns).set({ status: "closed" }).where(eq(campaigns.id, rB.id));
    checa("rifa fora do ar sai do bloco", !(await vitrine()).some((x) => x.id === nB));
    await encerrarAnunciosForaDoAr();
    await encerrarAnunciosForaDoAr();
    const fim = await anuncio(nB);
    // Os dois anúncios de B são da rifa que saiu: o nacional (2 de 3 cliques, R$ 0,60) e o da cidade (inteiro, R$ 0,50).
    checa(
      "encerra e credita o não gasto de cada anúncio, uma vez só",
      fim.status === "encerrado" && fim.reembolsoCents === 60 && (await anuncio(cB)).reembolsoCents === 50 && (await saldo(B.id)) === 970,
      `${fim.status} ${fim.reembolsoCents} ${await saldo(B.id)}`,
    );
    r = await orgB.req("GET", "/api/admin/patrocinio");
    checa("o extrato mostra o crédito que voltou", r.json?.extrato?.some((x: any) => x.valorCents === 60 && /voltaram ao saldo/.test(x.descricao ?? "")));

    // Desligar.
    await admin.req("PUT", "/api/admin/patrocinio/config", { ligado: false });
    checa("desligado: bloco vazio de novo", (await vitrine("?uf=SP")).length === 0);
    const usados = (await anuncio(eA)).cliquesUsados;
    await clique(eA, new Cliente("aparelho-8"));
    checa("desligado: clique não gasta, anúncio fica guardado", (await anuncio(eA)).cliquesUsados === usados && (await anuncio(eA)).status === "ativo");
  } finally {
    if (antes) await db.update(appSettings).set({ value: antes.value }).where(eq(appSettings.key, "plataforma"));
    else await db.delete(appSettings).where(eq(appSettings.key, "plataforma"));
    await limpar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
