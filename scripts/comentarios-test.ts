/**
 * Prova dos comentários na publicação da rifa, pela API de verdade:
 * quem comenta (só com conta), a régua do texto (sem link, sem telefone),
 * a resposta da organização (selo, aviso ao apostador), a moderação (dono,
 * organização, plataforma; o resto é 404), o contador sem COUNT(*), o
 * limite por pessoa e o nome sem telefone.
 *
 *   npm run comentarios      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaignStats, campaigns, comentarios, notificacoes, prizedQuotas, users } from "../shared/schema";
import { COMENTARIOS_POR_JANELA } from "../shared/comentarios";

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
    return { status: r.status, texto: "", json: tipo.includes("json") ? await r.json() : null };
  }
}

const SLUG = "comentarios-teste-rifa";
const RASCUNHO = "comentarios-teste-rascunho";
const PESSOAS = [
  { nome: "Ana Paula Comenta", telefone: "11976660001", cpf: "39053344705" },
  { nome: "Bruno Comenta", telefone: "11976660002", cpf: "52998224725" },
];

async function limpar() {
  await db.execute(sql`delete from rate_events where bucket like 'comentario:%' or bucket like 'cadastro:%' or bucket like 'login:comprador:%'`);
  await db.execute(sql`delete from campaigns where slug in (${SLUG}, ${RASCUNHO})`);
  for (const p of PESSOAS) await db.execute(sql`delete from buyers where phone = ${p.telefone}`);
}

async function main() {
  console.log("\n=== comentários na publicação ===\n");
  await limpar();

  const admin = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
  const marina = new Cliente();
  r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
  if (r.status !== 200) throw new Error(`login da organizadora: HTTP ${r.status}`);
  const [eu] = await db.select({ org: users.organizationId }).from(users).where(eq(users.email, "marina@rifassaojose.br"));

  const base = {
    organizationId: eu.org!,
    title: "Rifa comentada",
    prizeTitle: "Bicicleta",
    totalQuotas: 100,
    priceCents: 500,
    drawAt: new Date(Date.now() + 7 * 86_400_000),
    authorizationCode: "SPA-COMENTA",
  };
  const [rifa] = await db
    .insert(campaigns)
    .values({ ...base, slug: SLUG, status: "published", publishedAt: new Date() })
    .returning();
  await db.insert(campaignStats).values({ campaignId: rifa.id });
  const [rascunho] = await db.insert(campaigns).values({ ...base, slug: RASCUNHO, status: "draft" }).returning();

  const [ana, bruno, anon] = [new Cliente(), new Cliente(), new Cliente()];
  for (const [c, p] of [[ana, PESSOAS[0]], [bruno, PESSOAS[1]]] as const) {
    const cr = await c.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", ...p, cep: "01310-100", senha: "senha-comenta-1", lembrar: true });
    if (cr.status >= 300) throw new Error(`conta: HTTP ${cr.status} ${cr.json?.message}`);
  }
  const [anaB] = await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.phone, PESSOAS[0].telefone));
  const caminho = `/api/public/campaigns/${SLUG}/comentarios`;
  const contador = async () =>
    (await db.select({ n: campaigns.comentariosCount }).from(campaigns).where(eq(campaigns.id, rifa.id)))[0].n;

  try {
    console.log("  quem comenta:");
    r = await anon.req("GET", caminho);
    checa("sem conta: vê a lista, sem poder escrever", r.status === 200 && r.json?.podeComentar === false, `HTTP ${r.status}`);
    r = await anon.req("POST", caminho, { texto: "oi" });
    checa("sem conta: comentar dá 401", r.status === 401, `HTTP ${r.status}`);
    r = await ana.req("POST", `/api/public/campaigns/${RASCUNHO}/comentarios`, { texto: "oi" });
    checa("rascunho não tem comentários (404)", r.status === 404, `HTTP ${r.status}`);

    console.log("\n  a régua do texto:");
    r = await ana.req("POST", caminho, { texto: "compra mais barato em www.golpe.com" });
    checa("link: 400", r.status === 400, r.json?.message);
    r = await ana.req("POST", caminho, { texto: "me chama 11 98765-4321" });
    checa("telefone: 400", r.status === 400, r.json?.message);

    console.log("\n  apelido e perfil:");
    // O apelido nasce no cadastro; conta antiga pode não ter — é ela que a regra barra.
    await db.update(buyers).set({ apelido: null }).where(inArray(buyers.phone, PESSOAS.map((p) => p.telefone)));
    r = await ana.req("POST", caminho, { texto: "Oi!" });
    checa("sem apelido não comenta (409)", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await ana.req("PUT", "/api/public/conta/perfil", { apelido: "11987654321" });
    checa("apelido que é telefone: 400", r.status === 400, r.json?.message);
    r = await ana.req("PUT", "/api/public/conta/perfil", { apelido: "admin" });
    checa("apelido reservado: 400", r.status === 400, r.json?.message);
    r = await ana.req("PUT", "/api/public/conta/perfil", { apelido: "@Ana.Comenta" });
    checa("apelido salvo em minúsculas, sem @", r.status === 200 && r.json?.apelido === "ana.comenta", JSON.stringify(r.json));
    r = await bruno.req("PUT", "/api/public/conta/perfil", { apelido: "ana.comenta" });
    checa("apelido de outra pessoa: 409", r.status === 409, `HTTP ${r.status}`);
    r = await bruno.req("PUT", "/api/public/conta/perfil", { apelido: "bruno_comenta" });
    r = await anon.req("GET", "/api/public/u/ana.comenta");
    checa("o perfil público mostra apelido e primeiro e último nome, sem telefone",
      r.status === 200 && r.json?.nomeReal === "Ana Comenta" && !JSON.stringify(r.json).includes(PESSOAS[0].telefone),
      JSON.stringify(r.json));

    console.log("\n  conversa:");
    r = await ana.req("POST", caminho, { texto: "Quando   é o sorteio?\n\n\n\nQuero participar!" });
    const pergunta = r.json?.id as string;
    checa("apostadora com conta comenta", r.status === 201 && Boolean(pergunta), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await marina.req("POST", caminho, { texto: "Sábado às 19h, com live no perfil!", respostaA: pergunta });
    const resposta = r.json?.id as string;
    checa("a organização dona responde", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await bruno.req("POST", caminho, { texto: "Também quero saber", respostaA: resposta });
    const [daResposta] = await db.select({ parentId: comentarios.parentId }).from(comentarios).where(eq(comentarios.id, r.json?.id));
    checa("responder uma resposta entra no mesmo comentário do topo", daResposta?.parentId === pergunta);

    r = await anon.req("GET", caminho);
    const topo = r.json?.lista?.[0];
    checa("a lista traz a pergunta com as duas respostas, na ordem",
      topo?.id === pergunta && topo?.respostas?.length === 2 && topo.respostas[0].autor === "organizacao");
    checa("texto limpo, com o apelido e o link do perfil",
      topo?.texto === "Quando é o sorteio?\n\nQuero participar!" && topo?.nome === "ana.comenta" && topo?.perfil === "/u/ana.comenta",
      `${topo?.nome}`);
    checa("a organização aparece com o nome dela", topo?.respostas?.[0]?.nome === "Rifas São José", topo?.respostas?.[0]?.nome);
    checa("telefone de quem comenta nunca sai", !JSON.stringify(r.json).includes(PESSOAS[0].telefone));
    checa("o contador anda junto (3), sem COUNT(*)", (await contador()) === 3, String(await contador()));
    r = await anon.req("GET", "/api/public/campaigns");
    checa("a vitrine mostra o número de comentários",
      (r.json ?? []).find((c: any) => c.slug === SLUG)?.comentarios === 3);

    await new Promise((ok) => setTimeout(ok, 300));
    const avisos = await db.select().from(notificacoes).where(eq(notificacoes.buyerId, anaB.id));
    checa("a resposta da organização chega na central da Ana",
      avisos.some((a) => a.tipo === "comentario" && a.url.endsWith("#comentarios")), String(avisos.length));

    console.log("\n  curtidas:");
    const toques = await Promise.all([1, 2, 3].map(() => bruno.req("PUT", `/api/public/comentarios/${pergunta}/curtida`, { curtir: true })));
    const [curt] = await db.select({ n: comentarios.curtidas }).from(comentarios).where(eq(comentarios.id, pergunta));
    checa("três toques simultâneos: uma curtida", toques.every((t) => t.status === 200) && curt.n === 1, String(curt.n));
    r = await bruno.req("GET", caminho);
    checa("quem curtiu vê o coração marcado", r.json?.lista?.[0]?.curti === true && r.json?.lista?.[0]?.curtidas === 1);
    r = await bruno.req("PUT", `/api/public/comentarios/${pergunta}/curtida`, { curtir: false });
    checa("descurtir volta a zero", r.status === 200 && r.json?.curtidas === 0, JSON.stringify(r.json));
    r = await anon.req("PUT", `/api/public/comentarios/${pergunta}/curtida`, { curtir: true });
    checa("sem conta não curte (401)", r.status === 401, `HTTP ${r.status}`);

    console.log("\n  moderação:");
    r = await bruno.req("DELETE", `/api/public/comentarios/${pergunta}`);
    checa("apostador não apaga comentário de outro (404)", r.status === 404, `HTTP ${r.status}`);
    r = await ana.req("GET", caminho);
    checa("a dona do comentário vê o botão de apagar; o Bruno não",
      r.json?.lista?.[0]?.podeApagar === true && (await bruno.req("GET", caminho)).json?.lista?.[0]?.podeApagar === false);
    r = await marina.req("DELETE", `/api/public/comentarios/${pergunta}`, { motivo: "curto" });
    checa("pedir remoção sem motivo de verdade: 400", r.status === 400, `HTTP ${r.status}`);
    r = await marina.req("DELETE", `/api/public/comentarios/${pergunta}`, { motivo: "Comentário ofensivo contra a equipe" });
    const pedido = r.json?.solicitacaoId as string;
    checa("a organização não apaga comentário de apostador: vira pedido (202)",
      r.status === 202 && /^RS-/.test(r.json?.protocolo ?? "") && (await contador()) === 3, `HTTP ${r.status} · contador ${await contador()}`);
    r = await marina.req("DELETE", `/api/public/comentarios/${pergunta}`, { motivo: "Comentário ofensivo contra a equipe" });
    checa("um pedido de remoção por comentário (409)", r.status === 409, `HTTP ${r.status}`);
    r = await marina.req("GET", caminho);
    checa("a organização vê a remoção em análise", r.json?.lista?.[0]?.remocaoEmAnalise === true);
    r = await marina.req("POST", `/api/admin/solicitacoes/${pedido}/decidir`, { aprovar: true });
    checa("só a plataforma decide (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("GET", `/api/admin/solicitacoes/${pedido}`);
    checa("quem analisa lê o comentário e o autor", r.json?.comentario?.autor === "ana.comenta" && r.json?.comentario?.texto?.startsWith("Quando"));
    r = await admin.req("POST", `/api/admin/solicitacoes/${pedido}/decidir`, { aprovar: true, resposta: "Removido." });
    checa("aprovado: o comentário e as respostas saem, e o contador desconta",
      r.status === 200 && (await contador()) === 0, `HTTP ${r.status} ${r.json?.message ?? ""} · contador ${await contador()}`);
    r = await marina.req("POST", caminho, { texto: "Aviso da organização" });
    r = await marina.req("DELETE", `/api/public/comentarios/${r.json?.id}`);
    checa("a organização apaga na hora o que ela mesma escreveu", r.status === 200 && (await contador()) === 0, `HTTP ${r.status}`);
    r = await bruno.req("POST", caminho, { texto: "Comentário do Bruno" });
    const doBruno = r.json?.id as string;
    r = await admin.req("DELETE", `/api/public/comentarios/${doBruno}`);
    checa("a plataforma apaga qualquer um", r.status === 200 && (await contador()) === 0, `HTTP ${r.status}`);
    r = await bruno.req("POST", caminho, { texto: "Outro do Bruno" });
    r = await bruno.req("DELETE", `/api/public/comentarios/${r.json?.id}`);
    checa("quem escreveu apaga o próprio", r.status === 200 && (await contador()) === 0, `HTTP ${r.status}`);

    console.log("\n  cota premiada escolhida e o ganhador no topo:");
    r = await marina.req("POST", `/api/admin/campaigns/${rascunho.id}/prized`, { prizeLabel: "Pix de R$ 50", numeros: "7, 42" });
    checa("a organização não escolhe os números (403): o sistema sorteia", r.status === 403, `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/campaigns/${rascunho.id}/prized`, { prizeLabel: "Pix de R$ 20", quantity: 2 });
    checa("a organização sorteia", r.status === 201 && r.json?.created === 2, `HTTP ${r.status}`);
    r = await marina.req("GET", `/api/admin/campaigns/${rascunho.id}/prized`);
    checa(
      "a organização não vê o número em jogo",
      r.status === 200 && r.json?.length === 2 && r.json.every((p: { number: unknown }) => p.number === null),
      JSON.stringify(r.json),
    );
    r = await admin.req("GET", `/api/admin/campaigns/${rascunho.id}/prized`);
    checa("a plataforma vê os números", r.json?.every((p: { number: unknown }) => typeof p.number === "number"), JSON.stringify(r.json));
    await db.delete(prizedQuotas).where(eq(prizedQuotas.campaignId, rascunho.id));
    r = await admin.req("POST", `/api/admin/campaigns/${rascunho.id}/prized`, { prizeLabel: "Pix de R$ 50", numeros: "7, 7" });
    checa("número repetido é recusado", r.status === 422 || r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/campaigns/${rascunho.id}/prized`, { prizeLabel: "Pix de R$ 50", numeros: "101" });
    checa("número fora da rifa é recusado", r.status === 422 || r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/campaigns/${rascunho.id}/prized`, { prizeLabel: "Pix de R$ 50", numeros: "7, 42" });
    checa("no cadastro (rascunho), a plataforma escolhe os números", r.status === 201 && r.json?.created === 2, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/campaigns/${rifa.id}/prized`, { prizeLabel: "Pix de R$ 50", numeros: "8" });
    checa("depois de publicar, escolher é recusado (409)", r.status === 409, `HTTP ${r.status}`);
    // Na rifa no ar, a cota premiada nasce como se tivesse vindo do cadastro.
    await db.insert(prizedQuotas).values({ campaignId: rifa.id, number: 7, prizeLabel: "Pix de R$ 50" });
    r = await anon.req("GET", caminho);
    checa("antes da compra, ninguém no topo (o número não sai)", r.json?.premiados?.length === 0 && !JSON.stringify(r.json).includes("Pix de R$ 50"));
    await db.execute(sql`delete from rate_events where bucket like 'order:%'`);
    r = await ana.req("POST", "/api/public/orders", {
      campaignId: rifa.id,
      numbers: [7],
      buyer: { name: PESSOAS[0].nome, phone: PESSOAS[0].telefone, cpf: PESSOAS[0].cpf },
    });
    checa("a compra da cota premiada entra", r.status === 201, `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    const codigo = r.json?.code;
    r = await anon.req("GET", caminho);
    checa("pedido não pago não vai para o topo", r.json?.premiados?.length === 0);
    r = await anon.req("POST", `/api/dev/pay/${codigo}`);
    r = await anon.req("GET", caminho);
    const g = r.json?.premiados?.[0];
    checa(
      "pago: o ganhador fica fixo no topo, com a cota e o prêmio, sem telefone",
      g?.cota === "007" && g.premio === "Pix de R$ 50" && g.nome === "ana.comenta" && !JSON.stringify(r.json.premiados).includes(PESSOAS[0].telefone),
      JSON.stringify(g),
    );
    r = await marina.req("GET", `/api/admin/campaigns/${rifa.id}/prized`);
    checa("ganha, a organização vê o número (já é público)", r.json?.[0]?.number === 7, JSON.stringify(r.json));
    checa("sem comentário do ganhador, só o parabéns automático", g && g.comentario === null && !("buyerId" in g));
    await db.execute(sql`delete from rate_events where bucket like 'comentario:%'`);
    await ana.req("POST", caminho, { texto: "Ganhei, obrigada!" });
    r = await anon.req("GET", caminho);
    const g2 = r.json?.premiados?.[0];
    const naLista = r.json?.lista?.some((c: { texto: string }) => c.texto === "Ganhei, obrigada!");
    checa(
      "o comentário do ganhador vai para baixo do parabéns e sai da lista",
      r.json?.premiados?.length === 1 && g2?.comentario?.texto === "Ganhei, obrigada!" && !naLista,
      JSON.stringify(g2?.comentario),
    );

    console.log("\n  limite:");
    await db.execute(sql`delete from rate_events where bucket like 'comentario:%'`);
    const seguidos = [];
    for (let i = 0; i <= COMENTARIOS_POR_JANELA; i++) seguidos.push((await ana.req("POST", caminho, { texto: `Comentário ${i}` })).status);
    checa(`o ${COMENTARIOS_POR_JANELA + 1}º comentário seguido é barrado (429)`,
      seguidos.slice(0, -1).every((s) => s === 201) && seguidos.at(-1) === 429, seguidos.join(","));
  } finally {
    await limpar();
  }

  console.log(falhas === 0 ? "\n  tudo certo\n" : `\n  ${falhas} verificação(ões) falharam\n`);
  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await limpar().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
