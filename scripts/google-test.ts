/**
 * Prova do login com o Google, pela API de verdade.
 *
 * O Google em si não entra na prova (ela não sai para a internet): o
 * servidor sobe com `GOOGLE_PROVA=1` — só vale fora de produção — e a
 * tentativa recebe os claims por `/api/dev/google`. O que se prova é o
 * nosso lado: state, volta segura, conta que nasce incompleta, e-mail que
 * nunca liga sozinho, ligar de dentro da conta, CPF e telefone únicos,
 * o portão da compra e a exclusão.
 *
 *   GOOGLE_PROVA=1 npm run dev   (noutro terminal, com seed)
 *   npm run google
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaigns, campaignStats, organizations } from "../shared/schema";
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
      redirect: "manual",
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    // O corpo só termina depois que a sessão foi gravada (o express-session segura o fim da
    // resposta até salvar); o `fetch` resolve já nos cabeçalhos. Sem ler o corpo, a próxima
    // chamada corria com a gravação da sessão.
    const json = tipo.includes("json") ? await r.json() : (await r.arrayBuffer(), null);
    return { status: r.status, local: r.headers.get("location") ?? "", json };
  }

  /** Faz a viagem inteira: ir → (Google de mentira) → voltar. Devolve para onde o navegador cairia. */
  async google(caminho: string, claims: { sub: string; email: string; nome: string }, stateErrado = false) {
    const ida = await this.req("GET", caminho);
    if (!ida.local.includes("/retorno")) return ida.local; // recusou já na ida
    const u = new globalThis.URL(ida.local, URL);
    const plantou = await this.req("POST", "/api/dev/google", claims);
    if (plantou.status !== 200) {
      throw new Error(`Não deu para plantar os claims (HTTP ${plantou.status} ${JSON.stringify(plantou.json)}, ida: ${caminho} → ${ida.local}). O servidor precisa de GOOGLE_PROVA=1.`);
    }
    const state = stateErrado ? "estado-forjado" : u.searchParams.get("state");
    const volta = await this.req("GET", `/api/public/conta/google/retorno?state=${state}&code=prova`);
    return volta.local;
  }
}

const SUFIXO = "g" + Math.random().toString(16).slice(2, 10);
const EMAIL_A = `ana.${SUFIXO}@exemplo.com`;
const EMAIL_SENHA = `com.senha.${SUFIXO}@exemplo.com`;
const SUB_A = `sub-a-${SUFIXO}`;
const SUB_B = `sub-b-${SUFIXO}`;
const SUB_C = `sub-c-${SUFIXO}`;
const CPF_A = "52998224725";
const CPF_OUTRO = "11144477735";
const TEL_NOVO = "11966680001";
const TEL_DONO = "11966680002";

const criados = new Set<string>();
let rifaId = "";

async function limpar() {
  const rows = await db.execute(
    sql`select id from buyers where google_sub like ${"sub-%-" + SUFIXO} or email like ${"%" + SUFIXO + "@exemplo.com"} or phone in (${TEL_NOVO}, ${TEL_DONO}, '11966680003', '11966680005')`,
  );
  for (const r of rows.rows as { id: string }[]) criados.add(r.id);
  for (const id of criados) {
    await db.execute(sql`delete from quota_alloc where order_id in (select id from orders where buyer_id = ${id})`);
    await db.execute(sql`delete from orders where buyer_id = ${id}`);
    await db.execute(sql`delete from buyers where id = ${id}`);
  }
  await db.execute(sql`delete from rate_events where bucket like 'google:%' or bucket like 'otp%' or bucket like 'order:%' or bucket like 'login:%'`);
  if (rifaId) await db.execute(sql`delete from campaigns where id = ${rifaId}`);
}

async function main() {
  console.log("\n=== login com o Google ===\n");
  await limpar();

  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "rifas-sao-jose"));
  if (!org) throw new Error("Nenhuma organização. Rode `npm run db:seed`.");
  await db.delete(campaigns).where(eq(campaigns.slug, "google-teste"));
  const [rifa] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "google-teste",
      title: "Rifa do teste do Google",
      prizeTitle: "Prêmio de teste",
      totalQuotas: 1000,
      priceCents: 500,
      status: "published",
      drawAt: new Date(Date.now() + 7 * 86_400_000),
      authorizationCode: "SPA-TESTE-GOOGLE",
    })
    .returning();
  rifaId = rifa.id;
  await db.insert(campaignStats).values({ campaignId: rifa.id });

  try {
    let r = await new Cliente().req("GET", "/api/public/conta/google/disponivel");
    checa("com o modo de prova, o botão fica disponível", r.json?.ligado === true);

    // ---- a viagem ----
    const a = new Cliente();
    let destino = await a.google("/api/public/conta/google/entrar?volta=//outro-site.com", { sub: SUB_A, email: EMAIL_A, nome: "Ana Google" }, true);
    checa("state forjado: recusa e volta para a entrada", destino.startsWith("/entrar?erro="), destino);
    const m0 = await a.req("GET", "/api/auth/me");
    checa("…e ninguém entrou", !m0.json?.buyer);

    destino = await a.google("/api/public/conta/google/entrar?volta=//outro-site.com", { sub: SUB_A, email: EMAIL_A, nome: "Ana Google" });
    checa("volta para outro site vira o perfil (nunca sai do site)", destino === "/perfil", destino);
    let me = await a.req("GET", "/api/auth/me");
    checa("entrou como conta", me.json?.buyer?.conta === true && me.json.buyer.name === "Ana Google", JSON.stringify(me.json?.buyer));
    checa("o telefone provisório não vai para a tela", me.json?.buyer?.phone === "" && me.json.buyer.telefoneProvisorio === true);
    let conta = await a.req("GET", "/api/public/conta");
    checa("conta nasce incompleta: falta CPF e telefone", JSON.stringify(conta.json?.falta) === JSON.stringify(["CPF", "telefone"]), JSON.stringify(conta.json?.falta));
    checa("só Google: sem senha, sem telefone mostrado", conta.json?.soGoogle === true && conta.json.temSenha === false && conta.json.telefone === null);
    const perfil = await a.req("GET", "/api/public/conta/perfil");
    checa("o perfil também diz o que falta", perfil.json?.falta?.length === 2);
    const [linha] = await db.select().from(buyers).where(eq(buyers.googleSub, SUB_A));
    criados.add(linha.id);
    checa("o telefone gravado é marcador, não número", linha.phone.startsWith("pendente:") && !linha.telefoneConfirmadoEm);

    r = await new Cliente().req("POST", "/api/public/conta/entrar", { identificador: EMAIL_A, senha: "!google" });
    checa("a marca interna não serve de senha", r.status === 401);

    // ---- o portão da compra ----
    r = await a.req("POST", "/api/public/orders", { campaignId: rifa.id, quantity: 1, buyer: { name: "Ana", phone: "11999990000" } });
    checa("conta incompleta não compra (409)", r.status === 409 && /Complete sua conta/.test(r.json?.message ?? ""), `HTTP ${r.status}`);
    const [pedidos] = (await db.execute(sql`select count(*)::int as n from orders where buyer_id = ${linha.id}`)).rows as { n: number }[];
    checa("…e nada foi gravado", pedidos.n === 0);
    const [wa] = (await db.execute(sql`select count(*)::int as n from notifications where "to" like 'pendente%'`)).rows as { n: number }[];
    checa("nenhuma mensagem sai para o marcador", wa.n === 0);

    // ---- a mesma conta Google volta para a mesma conta ----
    const a2 = new Cliente();
    const destino2 = await a2.google("/api/public/conta/google/entrar", { sub: SUB_A, email: EMAIL_A, nome: "Outro Nome" });
    me = await a2.req("GET", "/api/auth/me");

    const n = (await db.execute(sql`select count(*)::int as n from buyers where google_sub = ${SUB_A}`)).rows[0] as { n: number };
    checa("entrar de novo cai na mesma conta (sem duplicar)", me.json?.buyer?.name === "Ana Google" && n.n === 1);

    // ---- e-mail de conta com senha: nunca liga sozinho ----
    const [comSenha] = await db
      .insert(buyers)
      .values({ name: "Beto Senha", phone: "11966680003", email: EMAIL_SENHA, cpf: CPF_OUTRO, passwordHash: await hashPassword("senha-de-teste-1"), contaCriadaEm: new Date() })
      .returning();
    criados.add(comSenha.id);
    const b = new Cliente();
    destino = await b.google("/api/public/conta/google/entrar", { sub: SUB_B, email: EMAIL_SENHA, nome: "Quem Cadastrou" });
    me = await b.req("GET", "/api/auth/me");
    checa("e-mail que já tem conta: recusa, mandando entrar com a senha", destino.startsWith("/entrar?erro=") && decodeURIComponent(destino).includes("Entre com a senha"), decodeURIComponent(destino));
    checa("…e não entra na conta do e-mail", !me.json?.buyer);
    const [semLigar] = await db.select().from(buyers).where(eq(buyers.id, comSenha.id));
    checa("…e a conta não ganha o Google", semLigar.googleSub === null);

    // ---- completar: CPF ----
    r = await a.req("POST", "/api/public/conta/cpf", { cpf: "111.111.111-11" });
    checa("CPF inválido: recusa", r.status === 400);
    r = await a.req("POST", "/api/public/conta/cpf", { cpf: CPF_OUTRO });
    checa("CPF de outra conta: 409 (o índice decide)", r.status === 409, r.json?.message);
    r = await a.req("POST", "/api/public/conta/cpf", { cpf: CPF_A });
    checa("CPF livre: salvo", r.status === 200);
    r = await a.req("POST", "/api/public/conta/cpf", { cpf: CPF_A });
    checa("CPF já informado não se troca (409)", r.status === 409);
    const semSessao = await new Cliente().req("POST", "/api/public/conta/cpf", { cpf: CPF_A });
    checa("sem conta: 401", semSessao.status === 401);

    // ---- completar: telefone ----
    r = await a.req("POST", "/api/public/conta/telefone/codigo", { telefone: "123" });
    checa("telefone curto: recusa", r.status === 400);
    await db.insert(buyers).values({ name: "Dono do número", phone: TEL_DONO }).returning().then(([x]) => criados.add(x.id));
    r = await a.req("POST", "/api/public/conta/telefone/codigo", { telefone: TEL_DONO });
    checa("número que já é de outro cadastro: 409, sem enviar código", r.status === 409 && !r.json?.devCode, r.json?.message);
    r = await a.req("POST", "/api/public/conta/telefone/codigo", { telefone: TEL_NOVO });
    checa("número livre: código enviado", r.status === 200 && r.json?.sent === true);
    const codigo: string | undefined = r.json?.devCode;
    if (!codigo) throw new Error("Sem devCode: rode o servidor sem WhatsApp configurado.");
    r = await a.req("POST", "/api/public/conta/telefone/confirmar", { codigo: codigo === "000000" ? "111111" : "000000" });
    checa("código errado: 401", r.status === 401);
    r = await a.req("POST", "/api/public/conta/telefone/confirmar", { codigo });
    checa("código certo: telefone confirmado", r.status === 200, r.json?.message);
    conta = await a.req("GET", "/api/public/conta");
    checa("a conta fica completa", conta.json?.falta?.length === 0 && conta.json.telefoneConfirmado === true && conta.json.telefone === TEL_NOVO);
    r = await a.req("POST", "/api/public/conta/telefone/codigo", { telefone: "11966680009" });
    checa("telefone confirmado não se troca por aqui (409)", r.status === 409);

    // ---- agora compra ----
    r = await a.req("POST", "/api/public/orders", { campaignId: rifa.id, quantity: 1, buyer: { name: "Ana", phone: "11999990000" } });
    checa("conta completa compra, no nome e telefone da conta", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    if (r.status === 201) {
      const [p] = (await db.execute(sql`select b.phone, b.cpf, o.via_conta from orders o join buyers b on b.id = o.buyer_id where o.code = ${r.json.code}`)).rows as { phone: string; cpf: string; via_conta: boolean }[];
      checa("…o pedido leva o CPF e o telefone da conta", p.phone === TEL_NOVO && p.cpf === CPF_A && p.via_conta === true);
    }

    // ---- ligar de dentro de uma conta com senha ----
    const semSessaoLigar = await new Cliente().google("/api/public/conta/google/ligar", { sub: SUB_C, email: EMAIL_SENHA, nome: "X" });
    checa("ligar sem estar na conta: recusa", semSessaoLigar.startsWith("/entrar?erro="), semSessaoLigar);
    const dono = new Cliente();
    let rr = await dono.req("POST", "/api/public/conta/entrar", { identificador: EMAIL_SENHA, senha: "senha-de-teste-1" });
    checa("entra com a senha", rr.status === 200, `HTTP ${rr.status}`);
    destino = await dono.google("/api/public/conta/google/ligar?volta=/minhas-cotas", { sub: SUB_C, email: "qualquer@outro.com", nome: "X" });
    checa("ligar de dentro da conta: volta para onde estava", destino === "/minhas-cotas", destino);
    const [ligada] = await db.select().from(buyers).where(eq(buyers.id, comSenha.id));
    checa("…e a conta ganhou o Google", ligada.googleSub === SUB_C);
    const c = new Cliente();
    await c.google("/api/public/conta/google/entrar", { sub: SUB_C, email: "qualquer@outro.com", nome: "X" });
    me = await c.req("GET", "/api/auth/me");
    checa("agora o Google entra nessa conta", me.json?.buyer?.name === "Beto Senha");
    // Outro Google na conta de outra pessoa: o mesmo sub não vale em duas contas.
    const d = new Cliente();
    const [outra] = await db.insert(buyers).values({ name: "Outra Senha", phone: "11966680005", email: `outra.${SUFIXO}@exemplo.com`, passwordHash: await hashPassword("senha-de-teste-1"), contaCriadaEm: new Date() }).returning();
    criados.add(outra.id);
    await d.req("POST", "/api/public/conta/entrar", { identificador: `outra.${SUFIXO}@exemplo.com`, senha: "senha-de-teste-1" });
    destino = await d.google("/api/public/conta/google/ligar", { sub: SUB_C, email: "x@y.com", nome: "X" });
    checa("o mesmo Google em duas contas: recusa", destino.startsWith("/entrar?erro="), decodeURIComponent(destino));
    r = await dono.req("DELETE", "/api/public/conta/google");
    checa("conta com senha pode desligar o Google", r.status === 200);
    r = await a.req("DELETE", "/api/public/conta/google");
    checa("conta só do Google não desliga (ficaria sem acesso)", r.status === 409);

    // ---- exclusão sem senha ----
    r = await a.req("POST", "/api/public/conta/excluir", { senha: "senha-qualquer" });
    checa("excluir pede a palavra EXCLUIR", r.status === 401);
    r = await a.req("POST", "/api/public/conta/excluir", { senha: "excluir" });
    // Tem pedido pago/aberto? Sem reembolso em andamento, exclui.
    checa("digitando EXCLUIR, a conta sai", r.status === 200, r.json?.message ?? `HTTP ${r.status}`);
    const [sai] = await db.select().from(buyers).where(eq(buyers.id, linha.id));
    checa("…e o vínculo com o Google some junto", sai.googleSub === null && sai.email === null && sai.passwordHash === null);
    const e = new Cliente();
    await e.google("/api/public/conta/google/entrar", { sub: SUB_A, email: EMAIL_A, nome: "Ana Voltou" });
    const [nova] = await db.select().from(buyers).where(eq(buyers.googleSub, SUB_A));
    checa("o mesmo Google depois de excluir começa conta nova", Boolean(nova) && nova.id !== linha.id);
    if (nova) criados.add(nova.id);
  } finally {
    await limpar();
  }
}

main()
  .catch((e) => {
    console.error(e);
    falhas++;
  })
  .finally(async () => {
    await pool.end();
    console.log(falhas ? `\n✗ ${falhas} falha(s)\n` : "\n✓ tudo certo\n");
    process.exit(falhas ? 1 : 0);
  });
