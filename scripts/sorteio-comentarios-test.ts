/**
 * Prova dos comentários do sorteio oficial, pela API de verdade: todo mundo
 * lê, só conta com apelido escreve (401 sem conta); a régua do texto (sem link
 * nem telefone, emoji só verificado); resposta numa camada; curtida pela
 * chave (cinco toques, uma curtida); apaga só quem escreveu e a plataforma
 * (organizador e outro apostador: 404); dois cliques, um desconto; o contador
 * anda junto; sorteio cancelado não tem comentários; telefone nunca sai.
 * Denúncia: só com conta, nunca do próprio comentário, uma aberta por pessoa e
 * comentário; só a plataforma lê (com auditoria) e decide — dois cliques, uma
 * decisão; procedente apaga o comentário e desce o contador; a Caixa de
 * entrada mostra a pendência sem o texto.
 *
 *   npm run sorteio-comentarios      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { and, eq, inArray, sql } from "drizzle-orm";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import { auditLog, buyers, sorteioComentarioDenuncias, sorteioComentarios, sorteiosOficiais } from "../shared/schema";

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
  { nome: "Elisa Sorteio Comenta", telefone: "11976661103", cpf: "52998224725" },
];

async function limpar() {
  await db.execute(
    sql`delete from rate_events where bucket like 'comentario:%' or bucket like 'cadastro:%' or bucket like 'login:comprador:%' or bucket like 'denuncia-sorteio:%'`,
  );
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

  const [carla, diego, elisa, anon] = [new Cliente(), new Cliente(), new Cliente(), new Cliente()];
  for (const [c, p] of [[carla, PESSOAS[0]], [diego, PESSOAS[1]], [elisa, PESSOAS[2]]] as const) {
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

    // --- denúncia ---
    r = await carla.req("POST", caminho, { texto: "Resultado antes de todo mundo, me procura" });
    const alvo = r.json?.id as string;
    r = await carla.req("POST", caminho, { texto: "Outro comentário que fica" });
    const fica = r.json?.id as string;
    r = await diego.req("POST", caminho, { texto: "Concordo", respostaA: alvo });
    const respostaDoAlvo = r.json?.id as string;
    checa("três comentários novos no contador", (await contador()) === 3, String(await contador()));
    const den = (id: string) => `/api/public/sorteio-oficial/comentarios/${id}/denuncia`;

    r = await diego.req("GET", caminho);
    const doAlvo = r.json?.lista?.find((c: any) => c.id === alvo);
    checa("a lista oferece denunciar a quem não escreveu", doAlvo?.podeDenunciar === true && doAlvo.respostas?.[0]?.podeDenunciar === false);
    r = await anon.req("POST", den(alvo), { motivo: "golpe" });
    checa("sem conta não denuncia (401)", r.status === 401, `HTTP ${r.status}`);
    r = await carla.req("POST", den(alvo), { motivo: "golpe" });
    checa("o próprio comentário não se denuncia (409)", r.status === 409, r.json?.message);
    r = await diego.req("POST", den(alvo), { motivo: "inventado" });
    checa("motivo fora da lista: 400", r.status === 400, r.json?.message);
    r = await diego.req("POST", den("nada"), { motivo: "golpe" });
    checa("id inválido: 404", r.status === 404, `HTTP ${r.status}`);
    const [d1, d2] = await Promise.all([
      diego.req("POST", den(alvo), { motivo: "golpe", texto: "promete resultado antes" }),
      diego.req("POST", den(alvo), { motivo: "golpe" }),
    ]);
    checa("duas ao mesmo tempo: uma entra (201) e a outra é 409", [d1.status, d2.status].sort().join(",") === "201,409", `${d1.status}/${d2.status}`);
    const protocoloDS = (d1.status === 201 ? d1 : d2).json?.protocolo as string;
    checa("protocolo DS-", /^DS-\d{8}-\d{6}$/.test(protocoloDS ?? ""), protocoloDS);
    r = await diego.req("POST", den(fica), { motivo: "spam" });
    checa("outro comentário, outra denúncia (201)", r.status === 201, `HTTP ${r.status}`);
    const protocoloFica = r.json?.protocolo as string;

    // A plataforma só: o organizador não vê nem decide.
    r = await marina.req("GET", "/api/admin/sorteios-oficiais/denuncias");
    checa("organizador não vê a fila (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/admin/sorteios-oficiais/denuncias?status=aberta");
    const linhaAlvo = r.json?.find((x: any) => x.protocolo === protocoloDS);
    const linhaFica = r.json?.find((x: any) => x.protocolo === protocoloFica);
    checa(
      "a fila traz protocolo e motivo, sem o texto do comentário",
      Boolean(linhaAlvo && linhaFica) && !JSON.stringify(r.json).includes("Resultado antes de todo mundo"),
    );
    r = await admin.req("GET", "/api/admin/caixa-de-entrada");
    const naCaixa = (r.json ?? []).find((l: any) => l.chave === `comentario_sorteio:${linhaAlvo?.id}`);
    checa(
      "a Caixa de entrada mostra a pendência, sem o texto",
      naCaixa?.tipo === "comentario_sorteio" && !JSON.stringify(r.json).includes("Resultado antes de todo mundo"),
      naCaixa?.oQue,
    );
    r = await marina.req("POST", `/api/admin/sorteios-oficiais/denuncias/${linhaAlvo.id}/decidir`, { decisao: "improcedente" });
    checa("organizador não decide (403)", r.status === 403, `HTTP ${r.status}`);

    r = await admin.req("GET", `/api/admin/sorteios-oficiais/denuncias/${linhaAlvo.id}`);
    const [lido] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(and(eq(auditLog.action, "sorteio.comentario.denuncia.ler"), eq(auditLog.entityId, linhaAlvo.id)));
    checa(
      "o detalhe traz o trecho guardado, e a leitura entra na auditoria",
      r.json?.trecho?.[0]?.texto === "Resultado antes de todo mundo, me procura" && r.json.trecho[0].denunciado === true && lido.n === 1,
    );
    checa("o detalhe não traz telefone nem CPF", !PESSOAS.some((p) => JSON.stringify(r.json).includes(p.telefone) || JSON.stringify(r.json).includes(p.cpf)));
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/denuncias/${linhaAlvo.id}/decidir`, { decisao: "procedente" });
    checa("procedente sem explicação: 400", r.status === 400, r.json?.message);

    const [p1, p2] = await Promise.all([
      admin.req("POST", `/api/admin/sorteios-oficiais/denuncias/${linhaAlvo.id}/decidir`, { decisao: "procedente", resposta: "Promete resultado antes do sorteio." }),
      admin.req("POST", `/api/admin/sorteios-oficiais/denuncias/${linhaAlvo.id}/decidir`, { decisao: "improcedente" }),
    ]);
    checa("dois cliques: uma decisão e um 409", [p1.status, p2.status].sort().join(",") === "200,409", `${p1.status}/${p2.status}`);
    const venceu = p1.status === 200 ? "procedente" : "improcedente";
    if (venceu === "procedente") {
      const [a] = await db.select({ r: sorteioComentarios.removidoEm }).from(sorteioComentarios).where(eq(sorteioComentarios.id, alvo));
      const [b] = await db.select({ r: sorteioComentarios.removidoEm }).from(sorteioComentarios).where(eq(sorteioComentarios.id, respostaDoAlvo));
      checa("procedente apaga o comentário e a resposta dele", Boolean(a.r && b.r));
      checa("o contador desce junto (de 3 para 1)", (await contador()) === 1, String(await contador()));
    } else {
      checa("improcedente venceu a corrida: o comentário fica", (await contador()) === 3, String(await contador()));
    }
    r = await diego.req("POST", den(alvo), { motivo: "golpe" });
    checa(venceu === "procedente" ? "comentário apagado não se denuncia mais (404)" : "decidida, pode denunciar de novo (201)", r.status === (venceu === "procedente" ? 404 : 201), `HTTP ${r.status}`);

    r = await admin.req("POST", `/api/admin/sorteios-oficiais/denuncias/${linhaFica.id}/decidir`, { decisao: "improcedente" });
    const [fc] = await db.select({ r: sorteioComentarios.removidoEm }).from(sorteioComentarios).where(eq(sorteioComentarios.id, fica));
    checa("improcedente deixa o comentário no ar", r.status === 200 && !fc.r, `HTTP ${r.status}`);
    // Duas denúncias do mesmo comentário, decididas ao mesmo tempo: 200 e 409, nunca 500.
    r = await diego.req("POST", caminho, { texto: "Mais um comentário para a prova" });
    const duplo = r.json?.id as string;
    const e1 = await carla.req("POST", den(duplo), { motivo: "spam" });
    const e2 = await elisa.req("POST", den(duplo), { motivo: "spam" });
    checa("duas pessoas denunciam o mesmo comentário (201 e 201)", e1.status === 201 && e2.status === 201, `${e1.status}/${e2.status}`);
    const ids = (
      await db
        .select({ id: sorteioComentarioDenuncias.id })
        .from(sorteioComentarioDenuncias)
        .where(and(eq(sorteioComentarioDenuncias.comentarioId, duplo), eq(sorteioComentarioDenuncias.status, "aberta")))
    ).map((x) => x.id);
    const [q1, q2] = await Promise.all(
      ids.map((i) => admin.req("POST", `/api/admin/sorteios-oficiais/denuncias/${i}/decidir`, { decisao: "procedente", resposta: "Spam." })),
    );
    checa("as duas procedentes ao mesmo tempo: 200 e 409, sem 500", [q1.status, q2.status].sort().join(",") === "200,409", `${q1.status}/${q2.status}`);
    const abertas = await db
      .select({ id: sorteioComentarioDenuncias.id })
      .from(sorteioComentarioDenuncias)
      .where(and(eq(sorteioComentarioDenuncias.comentarioId, duplo), eq(sorteioComentarioDenuncias.status, "aberta")));
    checa("procedente fecha as outras denúncias do mesmo comentário", abertas.length === 0, String(abertas.length));
    const decididas = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(and(eq(auditLog.action, "sorteio.comentario.denuncia.procedente"), inArray(auditLog.entityId, ids)));
    checa("a auditoria registra só a decisão que aconteceu (1, não 2)", decididas[0].n === 1, String(decididas[0].n));

    r = await admin.req("GET", "/api/admin/caixa-de-entrada");
    checa(
      "decididas saem da Caixa",
      !(r.json ?? []).some((l: any) => l.chave === `comentario_sorteio:${linhaAlvo.id}` || l.chave === `comentario_sorteio:${linhaFica.id}`),
    );
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
