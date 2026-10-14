/**
 * Prova das pessoas marcadas numa publicação de apostador, pela API de verdade.
 *
 * O que importa: quem marca só marca quem existe e não se marca (422, sem
 * nada gravado); a marcação nasce pendente e o aviso sai para quem foi marcado;
 * a publicação só aparece no perfil de quem foi marcado depois do aceite (e
 * só enquanto a publicação está no ar); recusar e tirar a marcação somem com
 * ela; quem não foi marcado não aceita (404); e aceitar duas vezes dá um
 * aceite e um 404.
 *
 *   npm run marcados      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, like, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaignStats, campaigns, divulgacaoMarcacoes, divulgacoes, notificacoes, organizations, orders, users } from "../shared/schema";
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
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? ((await r.json()) as any) : null };
  }
}

const SENHA = "senha-marcados-1";
const sufixo = Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(0, 8);
const telefone = () => "119" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

/** CPF com dígito conferido: a régua pede. */
function cpfSorteado() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (n: number[]) => {
    const r = (n.reduce((s, d, i) => s + d * (n.length + 1 - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  return [...base, d1, dv([...base, d1])].join("");
}

async function novaPessoa(rotulo: string) {
  const c = new Cliente();
  const apelido = `${rotulo}${sufixo}`.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 28);
  const tel = telefone();
  const r = await c.req("POST", "/api/public/conta", { apelido, nome: `Pessoa ${rotulo}`, telefone: tel, cpf: cpfSorteado(), cep: "01310-100", senha: SENHA, lembrar: true });
  if (r.status !== 201) throw new Error(`conta ${rotulo}: HTTP ${r.status} ${r.json?.message ?? ""}`);
  const [b] = await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.apelido, apelido));
  return { c, apelido, id: b.id, tel };
}

async function main() {
  console.log("\n=== pessoas marcadas numa publicação ===\n");

  // Plataforma: liga o apostador publicar (o interruptor nasce desligado).
  const admin = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  if (r.status !== 200) throw new Error(`login do admin: HTTP ${r.status}`);
  const app0 = (await new Cliente().req("GET", "/api/public/app")).json;
  r = await admin.req("PUT", "/api/admin/app", { ...app0, publicarApostador: true });
  if (r.status !== 200) throw new Error(`ligar publicar: HTTP ${r.status}`);

  // Organização com uma rifa publicada.
  const [org] = await db
    .insert(organizations)
    .values({ slug: `marcados-${sufixo}`, name: `Marcados ${sufixo}`, cidade: "Natal", uf: "RN", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date(), sociosDeclaradosEm: new Date() })
    .returning();
  const emailOrg = `marcados-org-${sufixo}@teste.rifa`;
  await db.insert(users).values({ role: "organizer", organizationId: org.id, name: "Org marcados", email: emailOrg, passwordHash: await hashPassword(SENHA) });
  const orgLogin = new Cliente();
  r = await orgLogin.req("POST", "/api/auth/login", { email: emailOrg, password: SENHA });
  if (r.status !== 200) throw new Error(`login da organização: HTTP ${r.status}`);
  const [rifa] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: `marcados-rifa-${sufixo}`,
      title: `Rifa marcados ${sufixo}`,
      prizeTitle: "Prêmio marcados",
      totalQuotas: 10_000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: `SPA-MC-${sufixo}`,
      authorizationFileKey: "certificado-teste",
      metodoApuracao: "federal_direta",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: rifa.id });

  const autora = await novaPessoa("autora");
  const marcada = await novaPessoa("marcada");
  const outra = await novaPessoa("outra");
  const anonimo = new Cliente();

  // A autora joga na rifa: só quem comprou publica sobre ela.
  const compra = await autora.c.req("POST", "/api/public/orders", { campaignId: rifa.id, quantity: 1, buyer: { name: "Pessoa autora", phone: autora.tel } });
  if (compra.status !== 201) throw new Error(`compra: HTTP ${compra.status} ${compra.json?.message ?? ""}`);
  await fetch(`${URL}/api/dev/pay/${compra.json.code}`, { method: "POST" });

  const contarMarcacoes = async (buyerId: string) =>
    Number((await db.execute(sql`select count(*)::int as n from divulgacao_marcacoes where buyer_id = ${buyerId}`)).rows[0]?.n ?? 0);
  const pedidosDaAutora = async () =>
    Number((await db.execute(sql`select count(*)::int as n from divulgacoes where buyer_id = ${autora.id}`)).rows[0]?.n ?? 0);

  console.log("Marcar só quem existe:");
  let antes = await pedidosDaAutora();
  r = await autora.c.req("POST", "/api/public/divulgacoes", { slug: rifa.slug, legenda: "Quem vem comigo?", marcados: ["ninguemexiste.xyz"] });
  checa("apelido que não existe: 422", r.status === 422 && /Não achei/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
  checa("e nada é gravado", (await pedidosDaAutora()) === antes);

  r = await autora.c.req("POST", "/api/public/divulgacoes", { slug: rifa.slug, legenda: "Quem vem comigo?", marcados: [`@${autora.apelido}`] });
  checa("marcar a si mesma: 422", r.status === 422 && /não pode se marcar/i.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);

  r = await autora.c.req("POST", "/api/public/divulgacoes", { slug: rifa.slug, legenda: "Quem vem comigo?", marcados: ["a1", "b2", "c3", "d4", "e5", "f6"] });
  checa("mais de 5 pessoas: 422", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);

  console.log("Marcação nasce pendente:");
  r = await autora.c.req("POST", "/api/public/divulgacoes", { slug: rifa.slug, legenda: "Quem vem comigo?", marcados: [`@${marcada.apelido}`, marcada.apelido] });
  checa("publica marcando a pessoa (sem repetir): 201", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
  const idPeca = r.json?.id as string;
  checa("a marcação existe e está pendente", (await contarMarcacoes(marcada.id)) === 1);
  const [linha] = await db.select().from(divulgacaoMarcacoes).where(and(eq(divulgacaoMarcacoes.divulgacaoId, idPeca), eq(divulgacaoMarcacoes.buyerId, marcada.id)));
  checa("situação pendente, sem decisão", linha?.situacao === "pendente" && linha?.decididaEm === null);

  // O aviso sai em segundo plano: espera um pouco pela central de quem foi marcado.
  await new Promise((res) => setTimeout(res, 800));
  const avisos = await db.select().from(notificacoes).where(and(eq(notificacoes.buyerId, marcada.id), like(notificacoes.chave, `divulgacao:marcacao:${idPeca}%`)));
  checa("quem foi marcado recebe um aviso (uma vez)", avisos.length === 1, String(avisos.length));

  r = await marcada.c.req("GET", "/api/public/conta/marcacoes");
  checa("o pedido aparece para quem foi marcado", r.json?.some((p: any) => p.id === idPeca && p.quem === `@${autora.apelido}`));
  r = await outra.c.req("GET", "/api/public/conta/marcacoes");
  checa("quem não foi marcado não vê o pedido", !r.json?.some((p: any) => p.id === idPeca));

  console.log("Aceite explícito:");
  r = await anonimo.req("POST", `/api/public/marcacoes/${idPeca}/aceitar`, {});
  checa("sem conta, aceitar é 401", r.status === 401, `HTTP ${r.status}`);
  r = await outra.c.req("POST", `/api/public/marcacoes/${idPeca}/aceitar`, {});
  checa("quem não foi marcado não aceita (404)", r.status === 404, `HTTP ${r.status}`);

  r = await (await fetch(`${URL}/api/public/u/${marcada.apelido}/marcados`)).json();
  checa("sem aceite, o perfil não mostra a publicação", !r.some((p: any) => p.id === idPeca));

  // A organização aprova: a publicação entra no ar, mas o perfil segue esperando o aceite.
  const [d] = await db.select({ versao: divulgacoes.versao }).from(divulgacoes).where(eq(divulgacoes.id, idPeca));
  r = await orgLogin.req("POST", `/api/admin/divulgacoes/${idPeca}`, { versao: d?.versao ?? 0, acao: "aprovar" });
  checa("a organização aprova a publicação", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
  r = await (await fetch(`${URL}/api/public/u/${marcada.apelido}/marcados`)).json();
  checa("no ar, mas sem aceite, ainda não aparece no perfil", !r.some((p: any) => p.id === idPeca));

  r = await marcada.c.req("POST", `/api/public/marcacoes/${idPeca}/aceitar`, {});
  checa("quem foi marcado aceita (200)", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
  r = await marcada.c.req("POST", `/api/public/marcacoes/${idPeca}/aceitar`, {});
  checa("aceitar de novo é 404 (um aceite)", r.status === 404, `HTTP ${r.status}`);
  r = await marcada.c.req("GET", "/api/public/conta/marcacoes");
  checa("aceita sai da lista de pedidos", !r.json?.some((p: any) => p.id === idPeca));

  r = await (await fetch(`${URL}/api/public/u/${marcada.apelido}/marcados`)).json();
  checa("aceita e no ar: aparece no perfil dela", r.some((p: any) => p.id === idPeca));
  r = await (await fetch(`${URL}/api/public/u/${outra.apelido}/marcados`)).json();
  checa("o perfil de quem não foi marcado segue sem nada", Array.isArray(r) && r.length === 0);

  console.log("Recusar e tirar a marcação:");
  r = await autora.c.req("POST", "/api/public/divulgacoes", { slug: rifa.slug, legenda: "Segunda peça", marcados: [outra.apelido] });
  checa("segunda publicação marca a outra pessoa: 201", r.status === 201, `HTTP ${r.status}`);
  const idSegunda = r.json?.id as string;
  r = await outra.c.req("DELETE", `/api/public/marcacoes/${idSegunda}`);
  checa("recusar o pedido: 200", r.status === 200, `HTTP ${r.status}`);
  r = await outra.c.req("DELETE", `/api/public/marcacoes/${idSegunda}`);
  checa("recusar de novo: 404", r.status === 404, `HTTP ${r.status}`);
  r = await outra.c.req("GET", "/api/public/conta/marcacoes");
  checa("recusado não volta à lista", !r.json?.some((p: any) => p.id === idSegunda));

  r = await marcada.c.req("DELETE", `/api/public/marcacoes/${idPeca}`);
  checa("tirar a marcação aceita: 200", r.status === 200, `HTTP ${r.status}`);
  r = await (await fetch(`${URL}/api/public/u/${marcada.apelido}/marcados`)).json();
  checa("tirada a marcação, a publicação sai do perfil", !r.some((p: any) => p.id === idPeca));

  console.log("Retirar a publicação:");
  // A segunda peça ainda espera a organização: a autora tira essa antes, senão o índice de "uma em análise" barra a terceira.
  r = await autora.c.req("DELETE", `/api/public/divulgacoes/${idSegunda}`);
  checa("a autora tira a segunda, que esperava a organização", r.status === 200, `HTTP ${r.status}`);
  r = await autora.c.req("POST", "/api/public/divulgacoes", { slug: rifa.slug, legenda: "Terceira peça", marcados: [marcada.apelido] });
  checa("terceira publicação marca a pessoa: 201", r.status === 201, `HTTP ${r.status}`);
  const idTerceira = r.json?.id as string;
  r = await marcada.c.req("GET", "/api/public/conta/marcacoes");
  checa("o pedido da terceira aparece", r.json?.some((p: any) => p.id === idTerceira));
  r = await autora.c.req("DELETE", `/api/public/divulgacoes/${idTerceira}`);
  checa("a autora retira a publicação: 200", r.status === 200, `HTTP ${r.status}`);
  r = await marcada.c.req("GET", "/api/public/conta/marcacoes");
  checa("retirada a publicação, o pedido some da lista", !r.json?.some((p: any) => p.id === idTerceira));

  if (falhas) {
    console.log(`\n${falhas} checagem(ns) falharam.`);
    process.exitCode = 1;
  } else {
    console.log("\nTudo certo.");
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
