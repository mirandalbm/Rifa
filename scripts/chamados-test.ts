/**
 * Prova do reembolso por chamado, de ponta a ponta, pela API de verdade.
 *
 * Monta uma organização, uma rifa no ar, uma sorteada e dois compradores;
 * entra como comprador (código do WhatsApp em modo de desenvolvimento) e como
 * organizador, e confere tudo o que precisa ser recusado — sem login, pedido
 * de outro, rifa sorteada, CPF que não bate, chamado em dobro, limite do dia,
 * estorno sem aprovação, chave desligada, dois cliques ao mesmo tempo — e que
 * o estorno aprovado desfaz cota e contador.
 *
 *   npm run chamados      (com `npm run dev` no ar e sem WhatsApp configurado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  organizations,
  notifications,
  campaigns,
  users,
  buyers,
  orders,
  campaignStats,
  quotaAlloc,
  appSettings,
  chamados,
} from "../shared/schema";
import { hashPassword } from "../server/auth";

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
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return {
      status: r.status,
      tipo,
      json: tipo.includes("json") ? await r.json() : null,
    };
  }
}

const CPF = "529.982.247-25";

async function main() {
  const [antes] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "plataforma"));
  await db
    .insert(appSettings)
    .values({
      key: "plataforma",
      value: { provedorPix: null, estornoManual: true },
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: { provedorPix: null, estornoManual: true } },
    });

  const [org] = await db
    .insert(organizations)
    .values({ slug: "e2e-org", name: "Promotora E2E", prazoEstornoDias: 5 })
    .returning();
  await db.insert(users).values({
    role: "organizer",
    organizationId: org.id,
    name: "Org E2E",
    email: "e2e@rifa.teste",
    phone: "11955550001",
    passwordHash: await hashPassword("senha-e2e-123"),
  });
  const [camp] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "e2e-rifa",
      title: "Rifa E2E",
      prizeTitle: "Moto",
      totalQuotas: 1000,
      priceCents: 500,
      status: "published",
    })
    .returning();
  const [camp2] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "e2e-sorteada",
      title: "Rifa Sorteada",
      prizeTitle: "Carro",
      totalQuotas: 1000,
      priceCents: 500,
      status: "drawn",
    })
    .returning();
  await db
    .insert(campaignStats)
    .values({ campaignId: camp.id, soldCount: 3, revenueCents: 1500 });
  const [eu] = await db
    .insert(buyers)
    .values({ name: "Maria E2E", phone: "11977770001", cpf: "52998224725" })
    .returning();
  const [outro] = await db
    .insert(buyers)
    .values({ name: "João E2E", phone: "11977770002" })
    .returning();
  const mk = async (code: number, campaignId: string, buyerId: string) => {
    const [o] = await db
      .insert(orders)
      .values({
        code,
        campaignId,
        buyerId,
        quantity: 3,
        amountCents: 1500,
        status: "paid",
        paidAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    return o;
  };
  const meu = await mk(93000001, camp.id, eu.id);
  await db.insert(quotaAlloc).values(
    [7, 8, 9].map((n) => ({
      campaignId: camp.id,
      number: n,
      status: "paid" as const,
      orderId: meu.id,
    })),
  );
  const doOutro = await mk(93000002, camp.id, outro.id);
  const sorteado = await mk(93000003, camp2.id, eu.id);

  const print =
    "data:image/png;base64," +
    (
      await sharp({
        create: { width: 300, height: 500, channels: 3, background: "#ffffff" },
      })
        .png()
        .toBuffer()
    ).toString("base64");
  const pedido = {
    orderCode: meu.code,
    motivo: "Comprei duas vezes pelo mesmo Pix",
    cpf: CPF,
    anexo: print,
  };

  try {
    const anon = new Cliente();
    checa(
      "sem login não abre chamado",
      (await anon.req("POST", "/api/public/chamados", pedido)).status === 401,
    );

    const c = new Cliente();
    const code = await c.req("POST", "/api/public/my-quotas/request-code", {
      phone: eu.phone,
    });
    const v = await c.req("POST", "/api/public/my-quotas/verify", {
      code: code.json.devCode,
    });
    checa("login pelo código", v.status === 200, `HTTP ${v.status}`);
    checa(
      "ID do cliente gerado",
      /^C-[A-Z2-9]{8}$/.test(v.json.cliente),
      v.json.cliente,
    );
    const again = await c.req("GET", "/api/public/my-quotas");
    checa("o ID é estável", again.json.cliente === v.json.cliente);

    let r = await c.req("POST", "/api/public/chamados", {
      ...pedido,
      orderCode: doOutro.code,
    });
    checa(
      "pedido de outro comprador: 404",
      r.status === 404,
      `HTTP ${r.status}`,
    );
    r = await c.req("POST", "/api/public/chamados", {
      ...pedido,
      orderCode: sorteado.code,
    });
    checa(
      "rifa já sorteada: recusa",
      r.status >= 400 && /sorteio/.test(r.json?.message),
      r.json?.message,
    );
    r = await c.req("POST", "/api/public/chamados", { ...pedido, anexo: "" });
    checa("sem print: recusa", r.status === 400, r.json?.message);
    r = await c.req("POST", "/api/public/chamados", {
      ...pedido,
      anexo: "data:image/png;base64,bm90LWltYWdlbQ==",
    });
    checa(
      "arquivo que não é imagem: recusa",
      r.status === 400,
      r.json?.message,
    );

    r = await c.req("POST", "/api/public/chamados", {
      ...pedido,
      cpf: "111.444.777-35",
    });
    checa(
      "CPF diferente do cadastro: recusa",
      r.status === 403,
      r.json?.message,
    );

    r = await c.req("POST", "/api/public/chamados", pedido);
    checa(
      "abre o chamado",
      r.status === 201,
      r.json?.protocolo ?? r.json?.message,
    );
    const chamadoId = r.json.id;
    checa("protocolo no formato", /^RB-\d{8}-\d{6}$/.test(r.json.protocolo));

    r = await c.req("POST", "/api/public/chamados", pedido);
    checa(
      "segundo chamado do mesmo pedido: recusa",
      r.status === 409,
      r.json?.message,
    );

    const [cpfSalvo] = await db
      .select({ cpf: buyers.cpf })
      .from(buyers)
      .where(eq(buyers.id, eu.id));
    checa(
      "CPF do cadastro não mudou",
      cpfSalvo.cpf === "52998224725",
      String(cpfSalvo.cpf),
    );
    r = await c.req("POST", "/api/public/chamados", pedido);
    checa("passou do limite do dia: 429", r.status === 429, r.json?.message);

    // Outro comprador não enxerga o chamado de Maria
    const j = new Cliente();
    const cj = await j.req("POST", "/api/public/my-quotas/request-code", {
      phone: outro.phone,
    });
    await j.req("POST", "/api/public/my-quotas/verify", {
      code: cj.json.devCode,
    });
    checa(
      "outro comprador não lê o chamado",
      (await j.req("GET", `/api/public/chamados/${chamadoId}`)).status === 404,
    );
    // Sem número próprio, o aviso do chamado de Maria foi para o organizador.
    const avisosMaria = await db
      .select()
      .from(notifications)
      .where(eq(notifications.template, "chamado_novo"));
    checa(
      "aviso de chamado novo foi para o organizador",
      avisosMaria.length === 1 && avisosMaria[0].to === "11955550001",
      avisosMaria.map((a) => a.to).join(", ") || "nenhum",
    );
    checa(
      "o aviso não leva telefone nem nome do cliente",
      !JSON.stringify(avisosMaria[0]?.params ?? {}).match(/77770001|Maria/),
    );
    // Com número próprio, só ele recebe.
    await db
      .update(organizations)
      .set({ avisoTelefone: "11955550009" })
      .where(eq(organizations.id, org.id));
    r = await j.req("POST", "/api/public/chamados", {
      ...pedido,
      orderCode: doOutro.code,
      cpf: "111.444.777-35",
    });
    checa(
      "CPF novo é aceito na primeira vez",
      r.status === 201,
      r.json?.message,
    );
    const [cpfJ] = await db
      .select({ cpf: buyers.cpf })
      .from(buyers)
      .where(eq(buyers.id, outro.id));
    checa(
      "e fica registrado no cadastro",
      cpfJ.cpf === "11144477735",
      String(cpfJ.cpf),
    );
    const cjId = r.json?.id;

    // A organização
    const o = new Cliente();
    const login = await o.req("POST", "/api/auth/login", {
      email: "e2e@rifa.teste",
      password: "senha-e2e-123",
    });
    checa("organizador entra", login.status === 200, `HTTP ${login.status}`);
    const avisos = await db
      .select()
      .from(notifications)
      .where(eq(notifications.template, "chamado_novo"));
    checa(
      "com número da organização, só ele recebe",
      avisos.length === 2 && avisos.some((a) => a.to === "11955550009"),
      avisos.map((a) => a.to).join(", "),
    );
    r = await o.req("PUT", "/api/admin/reembolso", {
      prazoEstornoDias: 5,
      avisoTelefone: "123",
    });
    checa(
      "WhatsApp do aviso inválido: recusa",
      r.status === 400,
      r.json?.message,
    );
    r = await o.req("PUT", "/api/admin/reembolso", {
      prazoEstornoDias: 5,
      avisoTelefone: "(21) 97777-6666",
    });
    checa(
      "organizador troca o WhatsApp do aviso",
      r.status === 200 && r.json.avisoTelefone === "21977776666",
      r.json?.avisoTelefone,
    );
    const pend = await o.req("GET", "/api/admin/chamados/pendentes");
    checa(
      "contador de pendentes",
      pend.json.total === 2,
      String(pend.json.total),
    );
    const det = await o.req("GET", `/api/admin/chamados/${chamadoId}`);
    checa(
      "detalhe traz o ID do cliente",
      det.json.cliente.codigo === v.json.cliente,
    );
    checa(
      "telefone mascarado",
      !String(det.json.cliente.telefone).includes("77770001"),
      det.json.cliente.telefone,
    );
    const anexoId = det.json.mensagens[0].anexoId;
    const img = await fetch(`${URL}/api/admin/chamados/anexos/${anexoId}`, {
      headers: { Cookie: o.cookie },
    });
    const bytes = Buffer.from(await img.arrayBuffer());
    checa(
      "print reprocessado em JPEG",
      img.headers.get("content-type") === "image/jpeg" &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8,
    );
    checa(
      "comprador lê o próprio print",
      (
        await fetch(`${URL}/api/public/chamados/anexos/${anexoId}`, {
          headers: { Cookie: c.cookie },
        })
      ).status === 200,
    );
    checa(
      "outro comprador não lê o print",
      (
        await fetch(`${URL}/api/public/chamados/anexos/${anexoId}`, {
          headers: { Cookie: j.cookie },
        })
      ).status === 404,
    );

    r = await o.req("POST", `/api/admin/chamados/${chamadoId}/estornar`);
    checa(
      "estornar antes de aprovar: recusa",
      r.status === 409,
      r.json?.message,
    );

    r = await o.req("POST", `/api/admin/chamados/${chamadoId}/mensagens`, {
      texto: "Recebemos, estamos conferindo.",
    });
    checa("organização responde", r.status < 300, `HTTP ${r.status}`);
    r = await c.req("POST", `/api/public/chamados/${chamadoId}/mensagens`, {
      texto: "Obrigada!",
    });
    checa("comprador responde", r.status < 300, `HTTP ${r.status}`);

    r = await o.req("POST", `/api/admin/chamados/${chamadoId}/concluir`, {
      decisao: "aprovado",
      resposta: "Pagamento em dobro confirmado.",
    });
    checa("aprova", r.status === 200, r.json?.message ?? "");
    const vis = await c.req("GET", `/api/public/chamados/${chamadoId}`);
    const dias =
      (new Date(vis.json.prazoEstornoAte).getTime() - Date.now()) / 86_400_000;
    checa(
      "prazo = 5 dias da organização",
      dias > 4.9 && dias <= 5,
      dias.toFixed(2),
    );
    checa(
      "comprador vê o protocolo na conversa",
      vis.json.mensagens.some((m: { texto: string }) =>
        m.texto.includes(vis.json.protocolo),
      ),
    );
    checa(
      "comprador não vê nome do atendente",
      vis.json.mensagens.every(
        (m: { nome: string }) => m.nome === "Você" || m.nome === "Atendimento",
      ),
    );
    r = await o.req("POST", `/api/admin/chamados/${chamadoId}/concluir`, {
      decisao: "recusado",
      resposta: "mudei de ideia",
    });
    checa("não conclui duas vezes", r.status === 409, `HTTP ${r.status}`);

    // Chave desligada barra o estorno
    await db
      .update(appSettings)
      .set({ value: { provedorPix: null, estornoManual: false } })
      .where(eq(appSettings.key, "plataforma"));
    r = await o.req("POST", `/api/admin/chamados/${chamadoId}/estornar`);
    checa(
      "chave desligada: recusa o estorno",
      r.status === 403,
      r.json?.message,
    );
    await db
      .update(appSettings)
      .set({ value: { provedorPix: null, estornoManual: true } })
      .where(eq(appSettings.key, "plataforma"));

    const [e1, e2] = await Promise.all([
      o.req("POST", `/api/admin/chamados/${chamadoId}/estornar`),
      o.req("POST", `/api/admin/chamados/${chamadoId}/estornar`),
    ]);
    const oks = [e1, e2].filter((x) => x.status === 200);
    checa(
      "dois cliques simultâneos: um estorno só",
      oks.length === 1,
      `${e1.status}/${e2.status}`,
    );
    checa(
      "venda sem Pix: devolução manual",
      oks[0]?.json.forma === "manual",
      oks[0]?.json.forma,
    );
    const [pd] = await db.select().from(orders).where(eq(orders.id, meu.id));
    checa("pedido estornado", pd.status === "refunded", pd.status);
    const [{ n }] = (
      await db.execute(
        sql`select count(*)::int as n from quota_alloc where order_id = ${meu.id}`,
      )
    ).rows as { n: number }[];
    checa("cotas voltaram ao estoque", n === 0, String(n));
    const [st] = await db
      .select()
      .from(campaignStats)
      .where(eq(campaignStats.campaignId, camp.id));
    checa(
      "contador desceu",
      st.soldCount === 0 && st.revenueCents === 0,
      `${st.soldCount}/${st.revenueCents}`,
    );

    r = await o.req("POST", `/api/admin/chamados/${cjId}/concluir`, {
      decisao: "recusado",
      resposta: "Não encontramos pagamento em dobro.",
    });
    checa("recusa o outro", r.status === 200);
    r = await j.req("POST", `/api/public/chamados/${cjId}/mensagens`, {
      texto: "e agora?",
    });
    checa(
      "chamado encerrado não aceita mensagem",
      r.status === 409,
      `HTTP ${r.status}`,
    );

    const lista = await o.req("GET", "/api/admin/chamados?status=estornado");
    checa(
      "filtro por situação",
      lista.json.length === 1 && lista.json[0].id === chamadoId,
    );
  } finally {
    await db.execute(
      sql`delete from notifications where dedupe_key like ${`chamado:%`}`,
    );
    await db
      .execute(sql`delete from rate_events where bucket like 'chamado:%'`)
      .catch(() => {});
    await db.delete(chamados).where(eq(chamados.organizationId, org.id));
    await db.delete(quotaAlloc).where(eq(quotaAlloc.campaignId, camp.id));
    await db.execute(
      sql`delete from orders where campaign_id in (${camp.id}, ${camp2.id})`,
    );
    await db.execute(
      sql`delete from campaigns where organization_id = ${org.id}`,
    );
    await db.delete(users).where(eq(users.email, "e2e@rifa.teste"));
    await db.execute(
      sql`delete from buyers where phone in ('11977770001','11977770002')`,
    );
    await db.delete(organizations).where(eq(organizations.id, org.id));
    // Devolve a configuração da plataforma como estava.
    if (antes)
      await db
        .update(appSettings)
        .set({ value: antes.value })
        .where(eq(appSettings.key, "plataforma"));
    else await db.delete(appSettings).where(eq(appSettings.key, "plataforma"));
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
