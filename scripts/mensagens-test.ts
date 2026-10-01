/**
 * Prova das mensagens, pela API de verdade: o interruptor, a conversa de um
 * para um entre apostador, organização e afiliado, o pedido de mensagem, o
 * par único sob concorrência, o recorte (conversa de outro é 404), o
 * bloqueio, a denúncia (a plataforma lê só o trecho, com auditoria) e a
 * varredura do Pix por fora. Devolve o estado de antes no fim.
 *
 *   npm run mensagens      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { auditLog, buyers, campaigns, conversas, organizations, seguidores, users } from "../shared/schema";
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
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null, texto: tipo.includes("json") ? "" : await r.text() };
  }
}

function cpf(base: string) {
  const d = base.split("").map(Number);
  for (const n of [9, 10]) {
    const soma = d.slice(0, n).reduce((s, x, i) => s + x * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

const PESSOAS = [
  { nome: "Ana Mensagem Lima", telefone: "11974440001", cpf: cpf("573104301"), apelido: "ana.msg" },
  { nome: "Bia Mensagem Rocha", telefone: "11974440002", cpf: cpf("573104302"), apelido: "bia.msg" },
  { nome: "Caio Mensagem Souza", telefone: "11974440003", cpf: cpf("573104303"), apelido: "caio.msg" },
];
const VIZINHA = "mensagens-teste-vizinha";
const EMAIL_VIZINHA = "vizinha-mensagens@teste.br";

async function limpar() {
  await db.execute(sql`delete from rate_events where bucket like 'cadastro:%' or bucket like 'login:%' or bucket like 'mensagem:%' or bucket like 'conversa-nova:%' or bucket like 'msg-busca:%' or bucket like 'denuncia-conversa:%'`);
  const ids = await db.select({ id: buyers.id }).from(buyers).where(inArray(buyers.phone, PESSOAS.map((p) => p.telefone)));
  const b = ids.map((x) => x.id);
  if (b.length) {
    await db.delete(conversas).where(
      sql`(a_tipo = 'comprador' and a_id in ${b}) or (b_tipo = 'comprador' and b_id in ${b})`,
    );
    await db.delete(seguidores).where(inArray(seguidores.buyerId, b));
  }
  await db.execute(sql`delete from conversas where (a_tipo = 'organizacao' and a_id in (select id from organizations where slug = ${VIZINHA})) or (b_tipo = 'organizacao' and b_id in (select id from organizations where slug = ${VIZINHA}))`);
  await db.delete(users).where(eq(users.email, EMAIL_VIZINHA));
  await db.execute(sql`delete from organizations where slug = ${VIZINHA}`);
  await db.delete(buyers).where(inArray(buyers.phone, PESSOAS.map((p) => p.telefone)));
}

async function main() {
  console.log("\n=== mensagens ===\n");
  await limpar();
  const [anon, ana, bia, caio, marina, joao, vizinha, admin] = Array.from({ length: 8 }, () => new Cliente());
  const antes = (await anon.req("GET", "/api/public/app")).json?.mensagensLigado === true;
  await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  const ajustar = (v: boolean) =>
    admin.req("PUT", "/api/admin/app", { avisoDoTrevo: { estilo: "ponto", cor: "verde" }, publicarApostador: false, reelsLigado: false, mensagensLigado: v });

  const [orgMarina] = await db.select({ id: users.organizationId }).from(users).where(eq(users.email, "marina@rifassaojose.br"));
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgMarina.id!));
  const [vz] = await db.insert(organizations).values({ slug: VIZINHA, name: "Vizinha das Mensagens", cidade: "Salvador", uf: "BA" }).returning();
  await db.insert(users).values({ role: "organizer", organizationId: vz.id, name: "Vizinha", email: EMAIL_VIZINHA, passwordHash: await hashPassword("vizinha-123") });
  const [publicada] = await db.select({ slug: campaigns.slug }).from(campaigns).where(sql`status = 'published' and not demonstracao and travada_em is null`).limit(1);

  try {
    console.log("  o interruptor:");
    await ajustar(false);
    let r = await ana.req("GET", "/api/public/mensagens/conversas");
    checa("desligado, a caixa não existe (404)", r.status === 404, `HTTP ${r.status}`);
    r = await anon.req("GET", "/api/public/mensagens/resumo");
    checa("o número do console vem zerado", r.status === 200 && r.json?.naoLidas === 0);
    r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
    r = await marina.req("PUT", "/api/admin/app", { mensagensLigado: true });
    checa("organizador não liga as mensagens (403)", r.status === 403, `HTTP ${r.status}`);
    await ajustar(true);

    console.log("\n  contas:");
    const corpo = (p: (typeof PESSOAS)[number]) => ({ nome: p.nome, telefone: p.telefone, cpf: p.cpf, cep: "01310-100", senha: "senha-mensagem-1", lembrar: true, apelido: p.apelido });
    for (const [c, p] of [[ana, PESSOAS[0]], [bia, PESSOAS[1]], [caio, PESSOAS[2]]] as const) {
      r = await c.req("POST", "/api/public/conta", corpo(p));
      if (r.status >= 300) throw new Error(`cadastro de ${p.apelido}: HTTP ${r.status} ${r.json?.message}`);
    }
    await joao.req("POST", "/api/auth/login", { email: "joao@rifa.br", password: "joao123" });
    await vizinha.req("POST", "/api/auth/login", { email: EMAIL_VIZINHA, password: "vizinha-123" });
    r = await anon.req("GET", "/api/public/mensagens/conversas");
    checa("sem conta, a caixa dá 401", r.status === 401, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/public/mensagens/conversas");
    checa("o administrador geral não conversa", r.status === 401 || r.status === 403, `HTTP ${r.status}`);

    console.log("\n  achar com quem falar:");
    r = await ana.req("GET", "/api/public/mensagens/destino?q=@bia.msg");
    const paraBia = r.json?.para;
    checa("o @apelido acha o apostador, sem telefone", r.status === 200 && paraBia?.tipo === "comprador" && !JSON.stringify(r.json).includes("11974440002"), JSON.stringify(r.json));
    r = await ana.req("GET", "/api/public/mensagens/destino?q=@ana.msg");
    checa("não acha a si mesmo (404)", r.status === 404);
    r = await ana.req("GET", "/api/public/mensagens/destino?q=ninguem-assim");
    checa("nome que não existe: 404", r.status === 404);
    r = await ana.req("GET", `/api/public/mensagens/destino?q=${org.slug}`);
    const paraOrg = r.json?.para;
    checa("o endereço acha a organização", r.status === 200 && paraOrg?.tipo === "organizacao");
    r = await ana.req("GET", "/api/public/mensagens/destino?q=JOAO7");
    const paraJoao = r.json?.para;
    checa("o código acha o afiliado", r.status === 200 && paraJoao?.tipo === "afiliado");

    console.log("\n  pedido de mensagem (sem vínculo):");
    r = await ana.req("POST", "/api/public/mensagens/conversas", { para: paraBia, texto: "entra em www.golpe.com" });
    checa("link na mensagem: 400", r.status === 400 && /link/i.test(r.json?.message ?? ""), r.json?.message);
    r = await ana.req("POST", "/api/public/mensagens/conversas", { para: paraBia, texto: "me liga 11 98765-4321" });
    checa("telefone na mensagem: 400", r.status === 400 && /telefone/i.test(r.json?.message ?? ""), r.json?.message);
    r = await ana.req("POST", "/api/public/mensagens/conversas", { para: paraBia, texto: "Oi Bia, tudo bem? 😀" });
    const conv = r.json?.id as string;
    checa("a primeira mensagem abre a conversa (emoji vale)", r.status === 201 && Boolean(conv), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await ana.req("POST", `/api/public/mensagens/conversas/${conv}/mensagens`, { texto: "Oi de novo" });
    checa("quem pediu espera: a segunda mensagem é 409", r.status === 409 && /Aguarde/.test(r.json?.message ?? ""), r.json?.message);
    r = await bia.req("GET", "/api/public/mensagens/conversas");
    checa("o pedido não aparece na lista principal da Bia", r.json?.itens?.length === 0, JSON.stringify(r.json?.itens?.length));
    r = await bia.req("GET", "/api/public/mensagens/conversas?aba=pedidos");
    checa("aparece em Pedidos, com a prévia e uma não lida", r.json?.itens?.length === 1 && r.json.itens[0].naoLidas === 1 && /Oi Bia/.test(r.json.itens[0].previa), JSON.stringify(r.json?.itens?.[0]));
    r = await bia.req("GET", "/api/public/mensagens/resumo");
    checa("o número do console conta a não lida", r.json?.naoLidas === 1);
    r = await bia.req("GET", `/api/public/mensagens/conversas/${conv}`);
    checa("a Bia lê a conversa, vê o apelido e nunca o telefone", r.status === 200 && r.json.conversa.com.nome === "ana.msg" && !JSON.stringify(r.json).includes("11974440001"));
    await bia.req("POST", `/api/public/mensagens/conversas/${conv}/lida`, {});
    r = await bia.req("GET", "/api/public/mensagens/resumo");
    checa("marcar como lida zera", r.json?.naoLidas === 0);
    r = await bia.req("POST", `/api/public/mensagens/conversas/${conv}/mensagens`, { texto: "Oi Ana!" });
    checa("responder aceita o pedido", r.status === 201);
    r = await ana.req("POST", `/api/public/mensagens/conversas/${conv}/mensagens`, { texto: "Agora posso escrever." });
    checa("depois de aceita, a Ana escreve", r.status === 201);
    r = await bia.req("GET", "/api/public/mensagens/conversas");
    checa("a conversa passa para a lista principal", r.json?.itens?.length === 1 && r.json.itens[0].situacao === "aceita");

    console.log("\n  o par é único (cinco toques ao mesmo tempo):");
    const dest = (await caio.req("GET", "/api/public/mensagens/destino?q=@ana.msg")).json?.para;
    const toques = await Promise.all(Array.from({ length: 5 }, (_, i) => caio.req("POST", "/api/public/mensagens/conversas", { para: dest, texto: `Oi ${i}` })));
    const idsDoPar = new Set(toques.filter((t) => t.status === 201).map((t) => t.json.id));
    const [{ n }] = (await db.execute(sql`select count(*)::int as n from conversas where (a_id = ${dest.id} or b_id = ${dest.id}) and (a_tipo = 'comprador' and b_tipo = 'comprador') and id in (select id from conversas where (a_id in (select id from buyers where phone = ${PESSOAS[2].telefone}) or b_id in (select id from buyers where phone = ${PESSOAS[2].telefone})))`)).rows as { n: number }[];
    checa("uma conversa só, com todos os toques dentro dela ou barrados pelo pedido", idsDoPar.size === 1 && n === 1, `${idsDoPar.size} id(s), ${n} linha(s)`);

    console.log("\n  apostador com organização:");
    r = await caio.req("POST", "/api/public/mensagens/conversas", { para: paraOrg, texto: "Boa tarde, quero saber da rifa." });
    const convOrgCaio = r.json?.id as string;
    r = await marina.req("GET", "/api/public/mensagens/conversas?aba=pedidos");
    checa("quem não segue manda pedido, e a organização vê em Pedidos", r.json?.itens?.some((i: { id: string }) => i.id === convOrgCaio));
    await db.insert(seguidores).values({ organizationId: org.id, buyerId: (await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.phone, PESSOAS[0].telefone)))[0].id }).onConflictDoNothing();
    r = await ana.req("POST", "/api/public/mensagens/conversas", { para: paraOrg, texto: "Sigo vocês, tenho uma dúvida." });
    const convOrgAna = r.json?.id as string;
    r = await ana.req("POST", `/api/public/mensagens/conversas/${convOrgAna}/mensagens`, { texto: "Pode responder quando puder." });
    checa("quem segue a organização conversa direto, sem pedido", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await marina.req("POST", `/api/public/mensagens/conversas/${convOrgAna}/mensagens`, { texto: "Oi Ana, claro!" });
    checa("a organização responde pelo painel", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await marina.req("GET", `/api/public/mensagens/conversas/${convOrgAna}`);
    checa("a organização vê a Ana pelo apelido", r.json?.conversa?.com?.nome === "ana.msg");

    console.log("\n  o recorte (conversa de outro é 404):");
    for (const [quem, c, id, nome] of [
      [caio, "o apostador", conv, "conversa de outros dois apostadores"],
      [vizinha, "a organização vizinha", convOrgAna, "conversa da outra organização"],
      [joao, "o afiliado", convOrgAna, "conversa da organização"],
    ] as const) {
      r = await quem.req("GET", `/api/public/mensagens/conversas/${id}`);
      const e = await quem.req("POST", `/api/public/mensagens/conversas/${id}/mensagens`, { texto: "oi" });
      const l = await quem.req("GET", "/api/public/mensagens/conversas");
      checa(`${c} não lê nem escreve na ${nome} (404) e não a vê na lista`, r.status === 404 && e.status === 404 && !JSON.stringify(l.json).includes(id), `${r.status}/${e.status}`);
    }

    console.log("\n  afiliado:");
    r = await ana.req("POST", "/api/public/mensagens/conversas", { para: paraJoao, texto: "Oi João, como funciona seu link?" });
    const convJoao = r.json?.id as string;
    r = await joao.req("GET", "/api/public/mensagens/conversas?aba=pedidos");
    checa("o afiliado recebe o pedido da Ana", r.json?.itens?.some((i: { id: string }) => i.id === convJoao));
    r = await joao.req("POST", `/api/public/mensagens/conversas/${convJoao}/pedido`, { acao: "aceitar" });
    checa("aceitar o pedido", r.status === 200 && r.json?.situacao === "aceita");
    r = await joao.req("POST", `/api/public/mensagens/conversas/${convJoao}/pedido`, { acao: "recusar" });
    checa("pedido já respondido: 409", r.status === 409);

    console.log("\n  a rifa vai como cartão:");
    if (publicada) {
      r = await ana.req("POST", `/api/public/mensagens/conversas/${conv}/mensagens`, { rifa: publicada.slug });
      checa("o cartão da rifa vai sozinho, sem texto", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      r = await bia.req("GET", `/api/public/mensagens/conversas/${conv}`);
      checa("a Bia vê a rifa no cartão, com o caminho", r.json?.itens?.some((m: { rifa?: { slug: string; caminho: string } }) => m.rifa?.slug === publicada.slug && m.rifa.caminho.includes(publicada.slug)));
    }
    r = await ana.req("POST", `/api/public/mensagens/conversas/${conv}/mensagens`, { rifa: "rifa-que-nao-existe" });
    checa("rifa que não existe: 404", r.status === 404);

    console.log("\n  bloquear:");
    r = await bia.req("PUT", `/api/public/mensagens/conversas/${conv}/bloqueio`, { ligar: true });
    checa("a Bia bloqueia", r.status === 200);
    r = await ana.req("POST", `/api/public/mensagens/conversas/${conv}/mensagens`, { texto: "Oi?" });
    checa("bloqueada, a Ana não escreve (409)", r.status === 409);
    r = await ana.req("PUT", `/api/public/mensagens/conversas/${conv}/bloqueio`, { ligar: false });
    checa("quem foi bloqueado não desbloqueia (409)", r.status === 409);
    r = await bia.req("PUT", `/api/public/mensagens/conversas/${conv}/bloqueio`, { ligar: false });
    checa("quem bloqueou desbloqueia", r.status === 200);

    console.log("\n  denúncia e moderação:");
    r = await bia.req("POST", `/api/public/mensagens/conversas/${conv}/denuncia`, { motivo: "spam", texto: "Insiste com propaganda." });
    const protocolo = r.json?.protocolo as string;
    checa("a Bia denuncia a conversa", r.status === 201 && /^DM-/.test(protocolo ?? ""), JSON.stringify(r.json));
    r = await bia.req("POST", `/api/public/mensagens/conversas/${conv}/denuncia`, { motivo: "spam" });
    checa("uma aberta por conversa e lado (409)", r.status === 409);
    r = await ana.req("POST", `/api/public/mensagens/conversas/${conv}/denuncia`, { motivo: "inexistente" });
    checa("motivo desconhecido: 400", r.status === 400);
    r = await marina.req("GET", "/api/admin/mensagens/denuncias");
    checa("organização não vê a fila de conversas denunciadas (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/admin/mensagens/denuncias?status=aberta");
    const item = r.json?.find((d: { protocolo: string }) => d.protocolo === protocolo);
    checa("a fila da plataforma não traz o texto das mensagens", r.status === 200 && Boolean(item) && !JSON.stringify(r.json).includes("Oi Bia, tudo bem"), `HTTP ${r.status}`);
    const lerAntes = Number((await db.execute(sql`select count(*)::int as n from audit_log where action = 'mensagens.denuncia.ler'`)).rows[0].n);
    r = await admin.req("GET", `/api/admin/mensagens/denuncias/${item?.id}`);
    const lerDepois = Number((await db.execute(sql`select count(*)::int as n from audit_log where action = 'mensagens.denuncia.ler'`)).rows[0].n);
    checa("o detalhe traz o trecho, e a leitura entra na auditoria", r.status === 200 && r.json.trecho.some((m: { texto: string }) => /Oi Bia/.test(m.texto)) && lerDepois === lerAntes + 1);
    checa("o detalhe nunca traz telefone", !JSON.stringify(r.json).includes("11974440001") && !JSON.stringify(r.json).includes("11974440002"));
    r = await marina.req("GET", `/api/admin/mensagens/denuncias/${item?.id}`);
    checa("organização não lê o detalhe (403)", r.status === 403);
    r = await admin.req("POST", `/api/admin/mensagens/denuncias/${item?.id}/decidir`, { decisao: "procedente" });
    checa("procedente pede explicação (400)", r.status === 400);
    const duas = await Promise.all([1, 2].map(() => admin.req("POST", `/api/admin/mensagens/denuncias/${item?.id}/decidir`, { decisao: "procedente", resposta: "Propaganda insistente." })));
    checa("dois cliques, uma decisão (200 e 409)", duas.map((d) => d.status).sort().join() === "200,409", duas.map((d) => d.status).join());
    r = await ana.req("POST", `/api/public/mensagens/conversas/${conv}/mensagens`, { texto: "Ainda dá?" });
    checa("conversa encerrada pela plataforma: ninguém escreve (409)", r.status === 409 && /encerrada/.test(r.json?.message ?? ""));
    r = await bia.req("GET", `/api/public/mensagens/conversas/${conv}`);
    checa("a conversa segue legível, marcada como encerrada", r.json?.conversa?.encerrada === true && r.json.conversa.podeEnviar === false);

    console.log("\n  Pix por fora (varredura da organização):");
    r = await marina.req("POST", `/api/public/mensagens/conversas/${convOrgAna}/mensagens`, { texto: "Faz um pix direto pra mim que eu garanto sua cota" });
    checa("a mensagem sai (a plataforma decide, a varredura não barra)", r.status === 201, `HTTP ${r.status}`);
    let achou = false;
    for (let i = 0; i < 10 && !achou; i++) {
      await new Promise((ok) => setTimeout(ok, 300));
      r = await admin.req("GET", "/api/admin/mensagens/denuncias?status=aberta");
      achou = Boolean(r.json?.some((d: { automatica: boolean; motivo: string }) => d.automatica && d.motivo === "pix_fora"));
    }
    checa("vira denúncia automática para a plataforma", achou);
    r = await ana.req("POST", `/api/public/mensagens/conversas/${convOrgAna}/mensagens`, { texto: "faz um pix pra mim" });
    const [{ auto }] = (await db.execute(sql`select count(*)::int as auto from mensagem_denuncias where lado = 'automatica'`)).rows as { auto: number }[];
    checa("a mensagem de apostador não passa pela varredura", auto === 1, `${auto}`);

    console.log("\n  a lista anda por chave:");
    r = await ana.req("GET", "/api/public/mensagens/conversas?limite=1");
    checa("limite 1 devolve uma conversa e o cursor", r.json?.itens?.length === 1 && Boolean(r.json.proximo), JSON.stringify(r.json?.proximo));
    const seguinte = await ana.req("GET", `/api/public/mensagens/conversas?limite=1&depois=${encodeURIComponent(r.json.proximo)}`);
    checa("a página seguinte começa depois da última vista, sem repetir", seguinte.json?.itens?.length === 1 && seguinte.json.itens[0].id !== r.json.itens[0].id);
    r = await ana.req("GET", "/api/public/mensagens/conversas?depois=lixo' or 1=1 --");
    checa("cursor fora do formato vira primeira página, nunca erro", r.status === 200);
  } finally {
    await ajustar(antes);
    await limpar();
    await db.execute(sql`delete from mensagem_denuncias where conversa_id not in (select id from conversas)`);
  }

  console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
