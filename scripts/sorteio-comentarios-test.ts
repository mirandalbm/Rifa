/**
 * Prova dos comentários do sorteio oficial, pela API de verdade: todo mundo
 * lê, só conta com apelido escreve (401 sem conta); a régua do texto (sem link
 * nem telefone, emoji só verificado); resposta numa camada; curtida pela
 * chave (cinco toques, uma curtida); apaga só quem escreveu e a plataforma
 * (organizador e outro apostador: 404); dois cliques, um desconto; o contador
 * anda junto; sorteio cancelado não tem comentários; telefone nunca sai.
 *
 *   npm run sorteio-comentarios      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import { buyers, sorteioComentarios, sorteiosOficiais } from "../shared/schema";

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

const TITULO = "Prova dos comentários do sorteio";
const PESSOAS = [
  { nome: "Carla Sorteio Comenta", telefone: "11976661101", cpf: "11144477735" },
  { nome: "Diego Sorteio Comenta", telefone: "11976661102", cpf: "86288366757" },
];

async function limpar() {
  await db.execute(sql`delete from rate_events where bucket like 'comentario:%' or bucket like 'cadastro:%' or bucket like 'login:comprador:%'`);
  await db.execute(sql`delete from sorteios_oficiais where titulo like ${TITULO + "%"}`);
  for (const p of PESSOAS) await db.execute(sql`delete from buyers where phone = ${p.telefone}`);
}

async function main() {
  console.log("\n=== comentários do sorteio oficial ===\n");
  await limpar();
  const admin = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", {
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br",
    password: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
  });
  if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
  const marina = new Cliente();
  r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
  if (r.status !== 200) throw new Error(`login da organizadora: HTTP ${r.status}`);

  const concurso = 80_000 + Math.floor(Math.random() * 9_000);
  const [s] = await db
    .insert(sorteiosOficiais)
    .values({ loteria: "federal", concurso, sorteioEm: new Date(Date.now() + 3 * 86_400_000), titulo: TITULO })
    .returning();
  const [cancelado] = await db
    .insert(sorteiosOficiais)
    .values({ loteria: "federal", concurso: concurso + 1, sorteioEm: new Date(Date.now() + 4 * 86_400_000), titulo: `${TITULO} cancelado`, canceladoEm: new Date() })
    .returning();

  const [carla, diego, anon] = [new Cliente(), new Cliente(), new Cliente()];
  for (const [c, p] of [[carla, PESSOAS[0]], [diego, PESSOAS[1]]] as const) {
    const cr = await c.req("POST", "/api/public/conta", {
      apelido: "tsts" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 10) + "x",
      ...p,
      cep: "01310-100",
      senha: "senha-sorteio-1",
      lembrar: true,
    });
    if (cr.status >= 300) throw new Error(`conta: HTTP ${cr.status} ${cr.json?.message}`);
  }
  const [diegoB] = await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.phone, PESSOAS[1].telefone));
  const caminho = `/api/public/sorteio-oficial/${s.id}/comentarios`;
  const contador = async () => (await db.select({ n: sorteiosOficiais.comentariosCount }).from(sorteiosOficiais).where(eq(sorteiosOficiais.id, s.id)))[0].n;

  try {
    // --- quem lê e quem escreve ---
    r = await anon.req("GET", caminho);
    checa("sem conta: lê, sem poder escrever", r.status === 200 && r.json?.podeComentar === false, `HTTP ${r.status}`);
    r = await anon.req("POST", caminho, { texto: "oi" });
    checa("sem conta: comentar dá 401", r.status === 401, `HTTP ${r.status}`);
    r = await anon.req("GET", `/api/public/sorteio-oficial/${cancelado.id}/comentarios`);
    checa("sorteio cancelado não tem comentários (404)", r.status === 404, `HTTP ${r.status}`);
    r = await anon.req("GET", "/api/public/sorteio-oficial/nada/comentarios");
    checa("id inválido é 404", r.status === 404, `HTTP ${r.status}`);

    // --- a régua do texto ---
    r = await carla.req("POST", caminho, { texto: "resultado antes em www.golpe.com" });
    checa("link: 400", r.status === 400, r.json?.message);
    r = await carla.req("POST", caminho, { texto: "me chama 11 98765-4321" });
    checa("telefone: 400", r.status === 400, r.json?.message);
    r = await carla.req("POST", caminho, { texto: "boa sorte a todos 🍀" });
    checa("emoji sem verificado: 403", r.status === 403, r.json?.message);
    r = await carla.req("POST", caminho, { texto: "Boa sorte a todos no sorteio" });
    checa("conta com apelido comenta (201)", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const topo = r.json?.id as string;
    await db.update(buyers).set({ verificadoEm: new Date() }).where(eq(buyers.id, diegoB.id));
    r = await diego.req("POST", caminho, { texto: "Valeu! 🍀", respostaA: topo });
    checa("verificado responde com emoji (201)", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const resposta = r.json?.id as string;
    r = await carla.req("POST", caminho, { texto: "Obrigada", respostaA: resposta });
    const [daCarla] = await db.select().from(sorteioComentarios).where(eq(sorteioComentarios.id, r.json?.id));
    checa("resposta de resposta entra no comentário do topo", r.status === 201 && daCarla?.parentId === topo);
    checa("o contador anda junto (3)", (await contador()) === 3, String(await contador()));

    r = await anon.req("GET", caminho);
    const texto = JSON.stringify(r.json);
    checa(
      "a lista traz o topo com as respostas, sem telefone nem CPF",
      r.json?.lista?.length === 1 && r.json.lista[0].respostas.length === 2 &&
        !PESSOAS.some((p) => texto.includes(p.telefone) || texto.includes(p.cpf)),
    );

    // --- curtida ---
    r = await anon.req("PUT", `/api/public/sorteio-oficial/comentarios/${topo}/curtida`, { curtir: true });
    checa("sem conta não curte (401)", r.status === 401, `HTTP ${r.status}`);
    await Promise.all(Array.from({ length: 5 }, () => diego.req("PUT", `/api/public/sorteio-oficial/comentarios/${topo}/curtida`, { curtir: true })));
    const [t1] = await db.select().from(sorteioComentarios).where(eq(sorteioComentarios.id, topo));
    checa("cinco toques, uma curtida", t1.curtidas === 1, String(t1.curtidas));
    r = await diego.req("PUT", `/api/public/sorteio-oficial/comentarios/${topo}/curtida`, { curtir: false });
    checa("descurtir volta a zero", r.json?.curtidas === 0, JSON.stringify(r.json));

    // --- apagar ---
    r = await diego.req("DELETE", `/api/public/sorteio-oficial/comentarios/${topo}`);
    checa("outro apostador não apaga (404)", r.status === 404, `HTTP ${r.status}`);
    r = await marina.req("DELETE", `/api/public/sorteio-oficial/comentarios/${topo}`);
    checa("organizador não apaga (404): o sorteio é da plataforma", r.status === 404, `HTTP ${r.status}`);
    r = await diego.req("DELETE", `/api/public/sorteio-oficial/comentarios/${resposta}`);
    checa("quem escreveu apaga a própria resposta", r.status === 200 && (await contador()) === 2, `HTTP ${r.status}`);
    const [a1, a2] = await Promise.all([
      admin.req("DELETE", `/api/public/sorteio-oficial/comentarios/${topo}`),
      admin.req("DELETE", `/api/public/sorteio-oficial/comentarios/${topo}`),
    ]);
    checa("a plataforma apaga: dois cliques, um 200 e um 404", [a1.status, a2.status].sort().join(",") === "200,404", `${a1.status}/${a2.status}`);
    checa("o do topo leva as respostas e o contador volta a zero", (await contador()) === 0, String(await contador()));
    r = await anon.req("GET", caminho);
    checa("apagado some da lista", r.json?.lista?.length === 0);
  } finally {
    await limpar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end();
  process.exit(1);
});
