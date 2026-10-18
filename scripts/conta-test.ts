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
/** Confirmar o telefone da própria conta: a conta, a que tenta trocar e o número de fora. */
const TEL_CONFIRMA = "11966660005";
const TEL_TROCA = "11966660007";
const TEL_OUTRO = "11966660006";
/** Auditoria do acesso apostador: a conta que entra pela senha e a que entra pelo código. */
const TEL_AUDITORIA = "11966660008";
/** CPF válido sorteado: os fixos já aparecem em outras provas do mesmo banco. */
function cpfSorteado() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (n: number[]) => {
    const r = (n.reduce((s, d, i) => s + d * (n.length + 1 - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  return [...base, d1, dv([...base, d1])].join("");
}
const CPF_CONFIRMA = cpfSorteado();
const CPF_TROCA = cpfSorteado();
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
  // Os pedidos de código desta prova não podem esgotar o limite da próxima rodada.
  await db.execute(sql`delete from rate_events where bucket like 'lookup:miss:%'`);
  for (const tel of [TEL_CONFIRMA, TEL_TROCA, TEL_OUTRO, TEL_AUDITORIA]) {
    await db.execute(sql`delete from rate_events where bucket in (${`otp:${tel}`}, ${`otp:verify:${tel}`})`);
  }
  const rows = await db.execute(
    sql`select id from buyers where phone in (${TEL_DONO}, ${TEL_NOVO}, ${TEL_CPF}, ${TEL_CONFIRMA}, ${TEL_TROCA}, ${TEL_OUTRO}, ${TEL_AUDITORIA}, '11966660003', '11900001234')`,
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
  // A do seed, pelo slug: `limit(1)` sem ordem podia cair numa organização
  // arquivada ou banida por outra prova.
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "rifas-sao-jose"));
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
    let r = await a.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", cep: CEP, nome: "Ana Nova", telefone: TEL_NOVO, cpf: "111.111.111-11", senha: SENHA });
    checa("CPF inválido: recusa", r.status === 400, r.json?.message);
    r = await a.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", cep: CEP, nome: "Ana Nova", telefone: TEL_NOVO, cpf: CPF_NOVO, senha: "12345678" });
    checa("senha conhecida: recusa", r.status === 400, r.json?.message);
    r = await a.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", cep: "0131", nome: "Ana Nova", telefone: TEL_NOVO, cpf: CPF_NOVO, senha: SENHA });
    checa("sem CEP válido: recusa", r.status === 400 && /CEP/.test(r.json?.message ?? ""), r.json?.message);
    r = await a.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", cep: CEP,
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
    r = await b.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", cep: CEP, nome: "Outra", telefone: TEL_NOVO, cpf: "123.456.789-09", senha: SENHA });
    checa("mesmo telefone: recusa", r.status === 409, r.json?.message);
    r = await b.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", cep: CEP, nome: "Outra", telefone: "11966660003", cpf: CPF_NOVO, senha: SENHA });
    checa("mesmo CPF em outra conta: recusa", r.status === 409, r.json?.message);
    r = await b.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", cep: CEP,
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
    r = await cc.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", cep: CEP, nome: "Impostor", telefone: TEL_CPF, cpf: "123.456.789-09", senha: SENHA });
    checa("telefone de quem já comprou, com outro CPF: recusa", r.status === 409, r.json?.message);
    r = await cc.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", cep: CEP, nome: "Cliente Antigo", telefone: TEL_CPF, cpf: CPF_DONO, senha: SENHA });
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
    r = await golpe.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", cep: CEP, nome: "Golpista", telefone: TEL_DONO, cpf: "123.456.789-09", senha: SENHA });
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
    r = await new Cliente().req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", cep: CEP, nome: "Ana de Novo", telefone: TEL_NOVO, cpf: CPF_NOVO, senha: SENHA });
    checa("o mesmo telefone e CPF podem criar conta nova", r.status === 201, r.json?.message ?? "");

    // ---- confirmar o telefone da própria conta, sem trocar a sessão ----
    // `/conta/telefone/codigo` manda o código ao número gravado na conta (o
    // corpo é ignorado) e `/confirmar` grava sem `regenerate`: o cookie é o
    // mesmo, o "lembrar" fica e as outras sessões da conta saem.
    console.log("\n  · confirmar o telefone da conta");
    const sid = (cookie: string) => decodeURIComponent(cookie.split("=")[1] ?? "").replace(/^s:/, "").split(".")[0];
    const lembrarDaSessao = async (cookie: string) => {
      const rows = await db.execute(sql`select sess -> 'cookie' ->> 'originalMaxAge' as idade from sessions where sid = ${sid(cookie)}`);
      return Number((rows.rows[0] as { idade?: string } | undefined)?.idade ?? 0);
    };
    const tc = new Cliente();
    r = await tc.req("POST", "/api/public/conta", {
      apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x",
      cep: CEP,
      nome: "Conta Que Confirma",
      telefone: TEL_CONFIRMA,
      cpf: CPF_CONFIRMA,
      senha: SENHA,
      lembrar: true,
    });
    checa("conta criada com senha, telefone não confirmado", r.status === 201 && r.json?.telefoneConfirmado === false, r.json?.message ?? "");
    const cookieAntes = tc.cookie;
    const lembrarAntes = await lembrarDaSessao(cookieAntes);
    const outraSessao = new Cliente();
    r = await outraSessao.req("POST", "/api/public/conta/entrar", { identificador: TEL_CONFIRMA, senha: SENHA });
    checa("outra sessão da mesma conta aberta antes", r.status === 200, `HTTP ${r.status}`);

    r = await tc.req("POST", "/api/public/conta/telefone/codigo", { telefone: TEL_OUTRO });
    checa("pedir o código da conta", r.status === 200 && typeof r.json?.devCode === "string", r.json?.message ?? `HTTP ${r.status}`);
    const codigoDaConta = String(r.json?.devCode ?? "");
    const enviados = await db.execute(
      sql`select "to" from notifications where template = 'codigo_acesso' and created_at > now() - interval '2 minutes' and params ->> 'codigo' = ${codigoDaConta}`,
    );
    const destinos = (enviados.rows as { to: string }[]).map((x) => x.to);
    checa("o código vai ao telefone da conta, não ao do corpo", destinos.length === 1 && destinos[0] === TEL_CONFIRMA, destinos.join(","));

    r = await tc.req("POST", "/api/public/conta/telefone/confirmar", { codigo: codigoDaConta === "000000" ? "111111" : "000000" });
    checa("código errado: 401", r.status === 401, r.json?.message);
    r = await tc.req("POST", "/api/public/conta/telefone/confirmar", { codigo: codigoDaConta });
    checa("código certo confirma", r.status === 200, r.json?.message ?? `HTTP ${r.status}`);
    const [confirmada] = await db.select().from(buyers).where(eq(buyers.phone, TEL_CONFIRMA));
    if (confirmada) criados.add(confirmada.id);
    checa("telefone_confirmado_em gravado, o número é o mesmo", Boolean(confirmada?.telefoneConfirmadoEm) && confirmada?.phone === TEL_CONFIRMA);
    checa("a sessão é a mesma (mesmo rifa.sid)", sid(tc.cookie) === sid(cookieAntes) && sid(cookieAntes).length > 0);
    r = await tc.req("GET", "/api/public/conta");
    checa("e segue valendo, agora confirmada", r.status === 200 && r.json?.sessaoConfirmada === true, `HTTP ${r.status}`);
    const lembrarDepois = await lembrarDaSessao(tc.cookie);
    // A sessão rola a cada resposta: a idade pode andar alguns milissegundos.
    checa("o \"lembrar\" ficou", lembrarAntes > 0 && Math.abs(lembrarDepois - lembrarAntes) < 60_000, `${lembrarAntes} → ${lembrarDepois}`);
    checa("a outra sessão da conta caiu", (await outraSessao.req("GET", "/api/public/conta")).status === 401);
    r = await tc.req("POST", "/api/public/conta/telefone/codigo", {});
    checa("pedir de novo com o telefone já confirmado: 409", r.status === 409, r.json?.message);

    // Provar outro número pelo Minhas compras não troca o telefone da conta.
    const tp = new Cliente();
    r = await tp.req("POST", "/api/public/conta", {
      apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x",
      cep: CEP,
      nome: "Conta Que Tenta Trocar",
      telefone: TEL_TROCA,
      cpf: CPF_TROCA,
      senha: SENHA,
    });
    checa("segunda conta criada", r.status === 201, r.json?.message ?? "");
    const cod2 = await tp.req("POST", "/api/public/my-quotas/request-code", { phone: TEL_OUTRO });
    r = await tp.req("POST", "/api/public/conta/telefone/confirmar", { codigo: cod2.json?.devCode });
    checa("número provado pelo Minhas compras não confirma a conta: 409", r.status === 409, r.json?.message);
    const [semTroca] = await db.select().from(buyers).where(eq(buyers.phone, TEL_TROCA));
    if (semTroca) criados.add(semTroca.id);
    checa("o telefone da conta não mudou e segue sem confirmar", Boolean(semTroca) && !semTroca.telefoneConfirmadoEm);
    checa("e a sessão segue de pé", (await tp.req("GET", "/api/public/conta")).status === 200);

    // Dois cliques com o mesmo código: uma gravação, e nenhum dos dois é 500.
    const cod3 = await tp.req("POST", "/api/public/conta/telefone/codigo", {});
    const [c1, c2] = await Promise.all([
      tp.req("POST", "/api/public/conta/telefone/confirmar", { codigo: cod3.json?.devCode }),
      tp.req("POST", "/api/public/conta/telefone/confirmar", { codigo: cod3.json?.devCode }),
    ]);
    const [duplo] = await db.select().from(buyers).where(eq(buyers.phone, TEL_TROCA));
    checa(
      "dois cliques: um 200, o outro 200 (o mesmo sucesso) ou 400 (código já usado)",
      [c1.status, c2.status].includes(200) && [c1.status, c2.status].every((s) => s === 200 || s === 400),
      `${c1.status}/${c2.status}`,
    );
    checa("e a conta ficou confirmada, com o mesmo número", Boolean(duplo?.telefoneConfirmadoEm) && duplo?.phone === TEL_TROCA);
    r = await tp.req("GET", "/api/public/conta");
    checa("a sessão de quem clicou duas vezes ficou confirmada", r.status === 200 && r.json?.sessaoConfirmada === true, `HTTP ${r.status}`);

    // ---- auditoria do acesso apostador ----
    // 1) Id ou código fora do formato é "não existe" (404), nunca 500 do Postgres.
    // 2) Entrar com a senha não dispensa a senha para trocá-la nem para excluir a
    //    conta: só o código do WhatsApp pedido há pouco (sessão roubada não tranca o dono).
    console.log("\n  · auditoria do acesso apostador");
    // As contas anteriores já gastaram o limite de cadastro por endereço (10 por hora).
    await db.execute(sql`delete from rate_events where bucket like 'cadastro:%'`);
    const aud = new Cliente();
    const SENHA_AUD = "senha-auditoria-1";
    r = await aud.req("POST", "/api/public/conta", {
      apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x",
      cep: CEP,
      nome: "Conta Da Auditoria",
      telefone: TEL_AUDITORIA,
      cpf: cpfSorteado(),
      senha: SENHA_AUD,
    });
    checa("conta da auditoria criada", r.status === 201, r.json?.message ?? "");
    await db.execute(sql`update buyers set telefone_confirmado_em = now() where phone = ${TEL_AUDITORIA}`);

    const ruins = ["abc", "99999999999999", "1.5", "%00"];
    const semErro500: string[] = [];
    const naoEncontrados: string[] = [];
    for (const v of ruins) {
      const x = encodeURIComponent(v);
      for (const caminho of [`/api/public/orders/${x}`, `/api/public/carrinho/pedidos/${x}`, `/api/public/tickets/${x}`]) {
        const g = await aud.req("GET", caminho);
        if (g.status >= 500) semErro500.push(`${caminho} → ${g.status}`);
        if (g.status !== 404 && g.status !== 429) naoEncontrados.push(`${caminho} → ${g.status}`);
      }
      for (const caminho of [
        `/api/public/stories/${x}/imagem`,
        `/api/public/stories/${x}/poster`,
        `/api/public/chamados/${x}`,
        `/api/public/chamados/anexos/${x}`,
      ]) {
        const g = await aud.req("GET", caminho);
        if (g.status >= 500) semErro500.push(`${caminho} → ${g.status}`);
        if (g.status !== 404) naoEncontrados.push(`${caminho} → ${g.status}`);
      }
      for (const caminho of [`/api/public/chamados/${x}/mensagens`, `/api/public/chamados/${x}/disputa`]) {
        const g = await aud.req("POST", caminho, { texto: "oi", motivo: "x".repeat(30) });
        if (g.status >= 500) semErro500.push(`POST ${caminho} → ${g.status}`);
        if (g.status !== 404) naoEncontrados.push(`POST ${caminho} → ${g.status}`);
      }
    }
    checa("id/código fora do formato: nenhuma rota responde 500", semErro500.length === 0, semErro500.join("; "));
    checa("e todas dizem 404 (ou 429 na consulta de pedido varrida)", naoEncontrados.length === 0, naoEncontrados.join("; "));
    for (const orderCode of ["abc", 1.5, 3_000_000_000, -4, 1e20, null]) {
      const g = await aud.req("POST", "/api/public/chamados", { orderCode, motivo: "quero meu dinheiro de volta", cpf: "52998224725" });
      checa(`chamado com código de pedido ${JSON.stringify(orderCode)}: 404, não 500`, g.status === 404, `HTTP ${g.status}`);
    }
    for (const corpo of [{}, { campaignId: "abc", quantidade: 1 }, { campaignId: "", quantidade: "x" }]) {
      const g = await aud.req("POST", "/api/public/bonus/resgatar", corpo);
      checa(`resgate de bônus com rifa ${JSON.stringify(corpo.campaignId ?? null)}: 404, não 500`, g.status === 404, `HTTP ${g.status}`);
    }
    r = await aud.req("PUT", "/api/public/conta/perfil", {});
    checa("perfil público com corpo vazio: 200 e nada muda (era 500)", r.status === 200, `HTTP ${r.status}`);
    r = await aud.req("PUT", "/api/public/conta/perfil", { campoQueNaoExiste: 1 });
    checa("perfil público com campo desconhecido: 200 e nada muda", r.status === 200, `HTTP ${r.status}`);
    // Trocar a foto abre uma imagem de até 5 MB: limite por conta (20 por hora).
    await db.execute(sql`delete from rate_events where bucket like 'perfil-foto:%'`);
    const trocas: number[] = [];
    for (let i = 0; i < 21; i++) trocas.push((await aud.req("PUT", "/api/public/conta/perfil", { foto: PNG })).status);
    checa("a 21ª troca de foto em uma hora é barrada (429)", trocas.slice(0, 20).every((c) => c === 200) && trocas[20] === 429, trocas.join(","));
    await db.execute(sql`delete from rate_events where bucket like 'perfil-foto:%'`);
    r = await aud.req("PUT", "/api/public/conta/perfil", { foto: null });
    checa("tirar a foto não conta no limite", r.status === 200, `HTTP ${r.status}`);

    // O CEP é rota aberta que chama o ViaCEP: tem limite por endereço (120 em 10 minutos).
    await db.execute(sql`delete from rate_events where bucket like 'cep:%'`);
    let barrou = 0;
    for (let i = 0; i < 125; i++) {
      const g = await new Cliente().req("GET", "/api/public/cep/abc");
      if (g.status === 429) barrou++;
    }
    checa("o CEP é barrado depois de 120 consultas do mesmo endereço (429)", barrou === 5, `${barrou} barradas de 125`);
    await db.execute(sql`delete from rate_events where bucket like 'cep:%'`);

    // Entrou pela senha (telefone da conta já confirmado): é "sessão confirmada" para
    // ver as compras, mas NÃO prova que é o dono para trocar a senha ou excluir.
    const porSenha = new Cliente();
    r = await porSenha.req("POST", "/api/public/conta/entrar", { identificador: TEL_AUDITORIA, senha: SENHA_AUD });
    checa("entrar pela senha", r.status === 200, `HTTP ${r.status}`);
    // Outro aparelho com a mesma conta (a sessão roubada): precisa cair na troca da senha.
    await db.execute(sql`delete from rate_events where bucket like 'login:comprador:%'`);
    const ladrao = new Cliente();
    r = await ladrao.req("POST", "/api/public/conta/entrar", { identificador: TEL_AUDITORIA, senha: SENHA_AUD });
    checa("o outro aparelho entra pela senha", r.status === 200, `HTTP ${r.status}`);
    const [linhaDoLadrao] = (await db.execute(sql`select sid, sess, expire from sessions where sid = ${sid(ladrao.cookie)}`)).rows as { sid: string; sess: unknown; expire: Date }[];
    r = await porSenha.req("GET", "/api/public/conta");
    checa("a tela pede a senha atual (sessaoConfirmada falso)", r.status === 200 && r.json?.sessaoConfirmada === false && r.json?.telefoneConfirmado === true, JSON.stringify(r.json?.sessaoConfirmada));
    r = await porSenha.req("PUT", "/api/public/conta/senha", { atual: "", nova: "outra-senha-9" });
    checa("trocar a senha SEM a atual, entrando pela senha: 401", r.status === 401, `HTTP ${r.status}`);
    r = await porSenha.req("POST", "/api/public/conta/excluir", { senha: "" });
    checa("excluir a conta SEM a senha, entrando pela senha: 401", r.status === 401, `HTTP ${r.status}`);
    r = await porSenha.req("GET", "/api/public/conta");
    checa("a conta segue de pé", r.status === 200, `HTTP ${r.status}`);
    r = await porSenha.req("PUT", "/api/public/conta/senha", { atual: SENHA_AUD, nova: "outra-senha-9" });
    checa("trocar a senha com a atual certa: 200", r.status === 200, r.json?.message ?? `HTTP ${r.status}`);
    checa("a sessão do outro aparelho caiu", (await ladrao.req("GET", "/api/public/conta")).status === 401);
    // Uma requisição dela que já estava em andamento a regrava depois do DELETE
    // (o connect-pg-simple faz INSERT … ON CONFLICT DO UPDATE): a marca na conta a derruba mesmo assim.
    await db.execute(
      sql`insert into sessions (sid, sess, expire) values (${linhaDoLadrao.sid}, ${JSON.stringify(linhaDoLadrao.sess)}::json, ${linhaDoLadrao.expire}) on conflict (sid) do update set sess = excluded.sess, expire = excluded.expire`,
    );
    checa("a sessão regravada depois da troca segue caída (401)", (await ladrao.req("GET", "/api/public/conta")).status === 401);
    r = await porSenha.req("GET", "/api/public/conta");
    checa("e a sessão de quem trocou a senha segue valendo", r.status === 200, `HTTP ${r.status}`);

    // Pelo código do WhatsApp ("esqueci a senha"): vale sem a atual, e só por um tempo.
    const porCodigo = new Cliente();
    const pedido = await porCodigo.req("POST", "/api/public/my-quotas/request-code", { phone: TEL_AUDITORIA });
    r = await porCodigo.req("POST", "/api/public/my-quotas/verify", { code: pedido.json?.devCode });
    checa("entrar pelo código do WhatsApp", r.status === 200, r.json?.message ?? `HTTP ${r.status}`);
    r = await porCodigo.req("GET", "/api/public/conta");
    checa("a tela dispensa a senha atual (sessaoConfirmada verdadeiro)", r.status === 200 && r.json?.sessaoConfirmada === true, JSON.stringify(r.json?.sessaoConfirmada));
    r = await porCodigo.req("PUT", "/api/public/conta/senha", { atual: "", nova: "senha-via-codigo-1" });
    checa("trocar a senha sem a atual, com o código recém-provado: 200", r.status === 200, r.json?.message ?? `HTTP ${r.status}`);
    // O código vence: com a prova de 31 minutos atrás, volta a pedir a senha.
    await db.execute(
      sql`update sessions set sess = jsonb_set(sess, '{buyer,porCodigoEm}', to_jsonb((extract(epoch from now()) * 1000)::bigint - 31 * 60 * 1000)) where sid = ${sid(porCodigo.cookie)}`,
    );
    r = await porCodigo.req("POST", "/api/public/conta/excluir", { senha: "" });
    checa("o código provado há 31 minutos já não dispensa a senha: 401", r.status === 401, `HTTP ${r.status}`);
    r = await porCodigo.req("PUT", "/api/public/conta/senha", { atual: "", nova: "senha-via-codigo-2" });
    checa("nem para trocar a senha: 401", r.status === 401, `HTTP ${r.status}`);
    r = await porCodigo.req("GET", "/api/public/conta");
    checa("e a tela volta a pedir a senha atual", r.status === 200 && r.json?.sessaoConfirmada === false);
    r = await porCodigo.req("POST", "/api/public/conta/excluir", { senha: "senha-via-codigo-1" });
    checa("excluir com a senha certa: 200", r.status === 200, r.json?.message ?? `HTTP ${r.status}`);
    r = await porCodigo.req("GET", "/api/public/conta");
    checa("conta excluída: a sessão cai (401)", r.status === 401, `HTTP ${r.status}`);
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
