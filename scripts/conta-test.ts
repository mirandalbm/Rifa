/**
 * Prova da conta do apostador, de ponta a ponta, pela API de verdade.
 *
 * O cenário que importa é o do golpe: alguém cria conta com o telefone de
 * outra pessoa. O CPF das compras antigas é a prova; sem CPF gravado, só o
 * código do WhatsApp. Sem confirmar o telefone, a conta não pode ver nem pedir
 * reembolso das compras que o dono fez sem entrar.
 *
 *   npm run conta      (com `npm run dev` no ar, seed aplicado e sem WhatsApp configurado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaigns, campaignStats, orders, organizations } from "../shared/schema";

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

const TEL_DONO = "11966660001";
const TEL_NOVO = "11966660002";
const TEL_CPF = "11966660004";
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const tem = (j: { orders?: { order: { code: number } }[] }, code: number) =>
  Boolean(j?.orders?.some((o) => o.order.code === code));
const CPF_DONO = "52998224725";
const CPF_NOVO = "11144477735";
const SENHA = "senha-de-teste-1";
/** CEP de verdade (Av. Paulista): o cadastro recusa CEP que não existe. */
const CEP = "01310-100";

const criados = new Set<string>();
let rifaId = "";

async function limpar() {
  await db.execute(sql`delete from rate_events where bucket like 'cadastro:%' or bucket like 'login:comprador:%'`);
  const rows = await db.execute(
    sql`select id from buyers where phone in (${TEL_DONO}, ${TEL_NOVO}, ${TEL_CPF}, '11966660003', '11900001234')`,
  );
  for (const r of rows.rows as { id: string }[]) criados.add(r.id);
  for (const id of criados) {
    await db.execute(sql`delete from quota_alloc where order_id in (select id from orders where buyer_id = ${id})`);
    await db.execute(sql`delete from orders where buyer_id = ${id}`);
    await db.execute(sql`delete from buyers where id = ${id}`);
  }
  if (rifaId) await db.execute(sql`delete from campaigns where id = ${rifaId}`);
}

async function main() {
  console.log("\n=== conta do apostador ===\n");
  await limpar();

  // Rifa própria do teste: as compras daqui não mexem nos contadores do seed.
  const [org] = await db.select().from(organizations).limit(1);
  if (!org) throw new Error("Nenhuma organização. Rode `npm run db:seed`.");
  await db.delete(campaigns).where(eq(campaigns.slug, "conta-teste"));
  const [rifa] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "conta-teste",
      title: "Rifa do teste de conta",
      prizeTitle: "Prêmio de teste",
      totalQuotas: 1000,
      priceCents: 500,
      status: "published",
      drawAt: new Date(Date.now() + 7 * 86_400_000),
      authorizationCode: "SPA-TESTE-CONTA",
    })
    .returning();
  rifaId = rifa.id;
  await db.insert(campaignStats).values({ campaignId: rifa.id });

  // O dono comprou sem conta, só com o telefone e sem CPF (o Mercado Pago não
  // pede): o caso em que nada no cadastro prova de quem é a compra.
  const [dono] = await db
    .insert(buyers)
    .values({ name: "Dono Verdadeiro", phone: TEL_DONO })
    .returning();
  criados.add(dono.id);
  const [compraDoDono] = await db
    .insert(orders)
    .values({
      code: 94_000_001,
      campaignId: rifa.id,
      buyerId: dono.id,
      quantity: 1,
      amountCents: rifa.priceCents,
      status: "paid",
      paidAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();

  try {
    // ---- cadastro ----
    const a = new Cliente();
    let r = await a.req("POST", "/api/public/conta", { cep: CEP, nome: "Ana Nova", telefone: TEL_NOVO, cpf: "111.111.111-11", senha: SENHA });
    checa("CPF inválido: recusa", r.status === 400, r.json?.message);
    r = await a.req("POST", "/api/public/conta", { cep: CEP, nome: "Ana Nova", telefone: TEL_NOVO, cpf: CPF_NOVO, senha: "12345678" });
    checa("senha conhecida: recusa", r.status === 400, r.json?.message);
    r = await a.req("POST", "/api/public/conta", { cep: "0131", nome: "Ana Nova", telefone: TEL_NOVO, cpf: CPF_NOVO, senha: SENHA });
    checa("sem CEP válido: recusa", r.status === 400 && /CEP/.test(r.json?.message ?? ""), r.json?.message);
    r = await a.req("POST", "/api/public/conta", { cep: CEP,
      nome: "Ana Nova",
      telefone: TEL_NOVO,
      cpf: CPF_NOVO,
      email: "Ana@Exemplo.com",
      senha: SENHA,
    });
    checa("cria conta nova", r.status === 201, r.json?.message ?? "");
    checa("nasce com o telefone não confirmado", r.json?.telefoneConfirmado === false);
    checa("e-mail guardado em minúsculas", r.json?.email === "ana@exemplo.com", r.json?.email);
    // Com o serviço de CEP no ar vem cidade e UF; fora do ar, só o CEP (o
    // relógio completa depois). As duas situações acontecem: CI tem rede, a
    // bancada local pode não ter.
    checa("o CEP fica na conta", r.json?.cep === "01310100", String(r.json?.cep));
    checa("com cidade quando o serviço de CEP responde",
      r.json?.uf === null || (r.json?.uf === "SP" && r.json?.cidade === "São Paulo"),
      `${r.json?.cidade}/${r.json?.uf}`);
    r = await a.req("PUT", "/api/public/conta/cep", { cep: "123" });
    checa("trocar para CEP malformado: recusa", r.status === 400, r.json?.message);

    const b = new Cliente();
    r = await b.req("POST", "/api/public/conta", { cep: CEP, nome: "Outra", telefone: TEL_NOVO, cpf: "123.456.789-09", senha: SENHA });
    checa("mesmo telefone: recusa", r.status === 409, r.json?.message);
    r = await b.req("POST", "/api/public/conta", { cep: CEP, nome: "Outra", telefone: "11966660003", cpf: CPF_NOVO, senha: SENHA });
    checa("mesmo CPF em outra conta: recusa", r.status === 409, r.json?.message);
    r = await b.req("POST", "/api/public/conta", { cep: CEP,
      nome: "Outra",
      telefone: "11966660003",
      cpf: "123.456.789-09",
      email: "ana@exemplo.com",
      senha: SENHA,
    });
    checa("mesmo e-mail em outra conta: recusa", r.status === 409, r.json?.message);

    // ---- entrar ----
    await a.req("POST", "/api/public/conta/sair");
    checa("depois de sair, a conta não abre", (await a.req("GET", "/api/public/conta")).status === 401);
    for (const [como, ident] of [
      ["telefone", "(11) 96666-0002"],
      ["CPF", "111.444.777-35"],
      ["e-mail", "ANA@exemplo.com"],
    ] as const) {
      const c = new Cliente();
      r = await c.req("POST", "/api/public/conta/entrar", { identificador: ident, senha: SENHA });
      checa(`entra pelo ${como}`, r.status === 200, `HTTP ${r.status}`);
    }
    r = await new Cliente().req("POST", "/api/public/conta/entrar", { identificador: TEL_NOVO, senha: "errada-123" });
    const errada = r.json?.message;
    r = await new Cliente().req("POST", "/api/public/conta/entrar", { identificador: "11900009999", senha: "errada-123" });
    checa("senha errada e conta inexistente dão a mesma mensagem", r.status === 401 && r.json?.message === errada, errada);

    // ---- compras antigas com CPF: o CPF prova ----
    const [comCpf] = await db
      .insert(buyers)
      .values({ name: "Cliente Antigo", phone: TEL_CPF, cpf: CPF_DONO })
      .returning();
    criados.add(comCpf.id);
    const antiga = (code: number, method: "pix_online" | "dinheiro") => ({
      code,
      campaignId: rifa.id,
      buyerId: comCpf.id,
      quantity: 1,
      amountCents: rifa.priceCents,
      status: "paid" as const,
      method,
      paidAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await db.insert(orders).values([antiga(94_000_002, "pix_online"), antiga(94_000_003, "dinheiro")]);
    const cc = new Cliente();
    r = await cc.req("POST", "/api/public/conta", { cep: CEP, nome: "Impostor", telefone: TEL_CPF, cpf: "123.456.789-09", senha: SENHA });
    checa("telefone de quem já comprou, com outro CPF: recusa", r.status === 409, r.json?.message);
    r = await cc.req("POST", "/api/public/conta", { cep: CEP, nome: "Cliente Antigo", telefone: TEL_CPF, cpf: CPF_DONO, senha: SENHA });
    checa("com o CPF das compras, a conta é criada", r.status === 201, r.json?.message ?? "");
    let minhas = await cc.req("GET", "/api/public/my-quotas");
    checa(
      "e as compras antigas vêm junto, sem pedir telefone",
      tem(minhas.json, 94_000_002) && tem(minhas.json, 94_000_003) && minhas.json.comprasAntigasOcultas === false,
    );
    r = await cc.req("POST", "/api/public/chamados", {
      orderCode: 94_000_003,
      motivo: "Quero o dinheiro de volta agora",
      cpf: CPF_DONO,
      anexo: PNG,
    });
    checa("mas venda em dinheiro (devolução à mão) não vira reembolso só pelo CPF", r.status === 404, `HTTP ${r.status}`);
    r = await new Cliente().req("POST", "/api/public/orders", {
      campaignId: rifa.id,
      quantity: 1,
      buyer: { name: "Cliente Antigo", phone: TEL_CPF, cpf: CPF_DONO },
    });
    const [comCpfDepois] = await db.select().from(orders).where(eq(orders.code, r.json?.code ?? 0));
    checa("compra sem entrar, com o CPF da conta, é da conta", comCpfDepois?.viaConta === true, `HTTP ${r.status}`);
    r = await new Cliente().req("POST", "/api/public/orders", {
      campaignId: rifa.id,
      quantity: 1,
      buyer: { name: "Alguém", phone: TEL_CPF },
    });
    minhas = await cc.req("GET", "/api/public/my-quotas");
    checa("sem o CPF, fica fora da conta", r.status === 201 && !tem(minhas.json, r.json.code));

    // ---- o golpe: conta com o telefone de outra pessoa, sem CPF gravado ----
    const golpe = new Cliente();
    r = await golpe.req("POST", "/api/public/conta", { cep: CEP, nome: "Golpista", telefone: TEL_DONO, cpf: "123.456.789-09", senha: SENHA });
    checa("sem CPF nas compras, a conta é criada…", r.status === 201, r.json?.message ?? "");
    minhas = await golpe.req("GET", "/api/public/my-quotas");
    checa(
      "…mas não enxerga a compra feita sem conta",
      minhas.status === 200 && !tem(minhas.json, compraDoDono.code),
      `${minhas.json?.orders?.length} pedido(s)`,
    );
    checa("e a tela oferece o código do WhatsApp", minhas.json?.comprasAntigasOcultas === true);
    r = await golpe.req("POST", "/api/public/chamados", {
      orderCode: compraDoDono.code,
      motivo: "Quero o dinheiro de volta agora",
      cpf: "123.456.789-09",
      anexo: PNG,
    });
    checa("nem pede reembolso dela", r.status === 404, `HTTP ${r.status}`);

    // ---- compra dentro da conta ----
    r = await golpe.req("POST", "/api/public/orders", {
      campaignId: rifa.id,
      quantity: 1,
      buyer: { name: "Nome Trocado", phone: "11900001234" },
    });
    checa("compra dentro da conta", r.status === 201, r.json?.message ?? "");
    const [feita] = await db.select().from(orders).where(eq(orders.code, r.json.code));
    checa("vai para a conta, não para o telefone digitado", feita?.buyerId === dono.id && feita.viaConta === true);
    const [depois] = await db.select().from(buyers).where(eq(buyers.id, dono.id));
    checa("o formulário não renomeia a conta", depois.name === "Golpista", depois.name);
    minhas = await golpe.req("GET", "/api/public/my-quotas");
    checa("e aparece em Minhas compras", tem(minhas.json, feita.code));

    // Compra sem entrar, com o telefone da conta, não renomeia ninguém.
    const anonimo = new Cliente();
    r = await anonimo.req("POST", "/api/public/orders", {
      campaignId: rifa.id,
      quantity: 1,
      buyer: { name: "Renomeador", phone: TEL_DONO },
    });
    const [ainda] = await db.select().from(buyers).where(eq(buyers.id, dono.id));
    checa("compra sem entrar não renomeia a conta", ainda.name === "Golpista", `HTTP ${r.status}, nome ${ainda.name}`);

    // ---- o dono confirma o telefone pelo código ----
    const dono2 = new Cliente();
    const cod = await dono2.req("POST", "/api/public/my-quotas/request-code", { phone: TEL_DONO });
    r = await dono2.req("POST", "/api/public/my-quotas/verify", { code: cod.json.devCode });
    checa("código do WhatsApp confirma o telefone", r.status === 200, `HTTP ${r.status}`);
    const [conf] = await db.select().from(buyers).where(eq(buyers.id, dono.id));
    checa("e fica gravado na conta", Boolean(conf.telefoneConfirmadoEm));
    minhas = await dono2.req("GET", "/api/public/my-quotas");
    checa(
      "com o telefone provado, a compra antiga aparece",
      minhas.json.orders.some((o: { order: { code: number } }) => o.order.code === compraDoDono.code),
    );
    checa(
      "a sessão aberta do golpista foi encerrada",
      (await golpe.req("GET", "/api/public/conta")).status === 401,
    );
    r = await dono2.req("PUT", "/api/public/conta/senha", { nova: "nova-senha-do-dono" });
    checa("quem provou o telefone troca a senha sem a atual", r.status === 200, r.json?.message ?? "");
    r = await new Cliente().req("POST", "/api/public/conta/entrar", { identificador: TEL_DONO, senha: SENHA });
    checa("a senha do golpista deixou de valer", r.status === 401);
    r = await new Cliente().req("POST", "/api/public/conta/entrar", { identificador: TEL_DONO, senha: "nova-senha-do-dono" });
    checa("a nova senha entra", r.status === 200);

    // ---- troca de senha pedindo a atual ----
    const ana = new Cliente();
    await ana.req("POST", "/api/public/conta/entrar", { identificador: TEL_NOVO, senha: SENHA });
    r = await ana.req("PUT", "/api/public/conta/senha", { atual: "errada-000", nova: "outra-senha-boa" });
    checa("senha atual errada: recusa", r.status === 401, r.json?.message);

    // ---- exclusão (LGPD) ----
    r = await ana.req("POST", "/api/public/conta/excluir", { senha: "errada-000" });
    checa("excluir sem a senha certa: recusa", r.status === 401);
    const [antes] = await db.select().from(buyers).where(eq(buyers.phone, TEL_NOVO));
    criados.add(antes.id);
    r = await ana.req("POST", "/api/public/conta/excluir", { senha: SENHA });
    checa("exclui a conta", r.status === 200, r.json?.message ?? "");
    const [apagado] = await db.select().from(buyers).where(eq(buyers.id, antes.id));
    checa(
      "dados pessoais apagados",
      apagado.name === "Titular removido" && !apagado.cpf && !apagado.email && !apagado.passwordHash && apagado.phone.startsWith("removido:"),
    );
    checa("a sessão acabou", (await ana.req("GET", "/api/public/conta")).status === 401);
    r = await new Cliente().req("POST", "/api/public/conta/entrar", { identificador: "ana@exemplo.com", senha: SENHA });
    checa("não entra mais", r.status === 401);
    r = await new Cliente().req("POST", "/api/public/conta", { cep: CEP, nome: "Ana de Novo", telefone: TEL_NOVO, cpf: CPF_NOVO, senha: SENHA });
    checa("o mesmo telefone e CPF podem criar conta nova", r.status === 201, r.json?.message ?? "");
  } finally {
    await limpar();
  }

  console.log(falhas ? `\n  ${falhas} falha(s)\n` : "\n  tudo certo\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
