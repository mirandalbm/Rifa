/**
 * Prova dos grupos da rifa, pela API de verdade: só apostador com compra paga
 * cria e entra, o teto de 50 (inclusive com duas entradas ao mesmo tempo na
 * última vaga), só texto sem link nem telefone, o recorte (grupo de que não
 * sou membro é 404), o estorno tira o direito de escrever, a denúncia leva só
 * o trecho (leitura auditada) e a decisão da plataforma encerra o grupo.
 * Devolve o estado de antes no fim.
 *
 *   npm run grupos      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { campaignStats, campaigns, orders, organizations, users } from "../shared/schema";
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
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null, headers: r.headers };
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
  { nome: "Ana Grupo Lima", telefone: "11973330001", cpf: cpf("573104401"), apelido: "ana.grp" },
  { nome: "Bia Grupo Rocha", telefone: "11973330002", cpf: cpf("573104402"), apelido: "bia.grp" },
  { nome: "Caio Grupo Souza", telefone: "11973330003", cpf: cpf("573104403"), apelido: "caio.grp" },
  { nome: "Duda Grupo Alves", telefone: "11973330004", cpf: cpf("573104404"), apelido: "duda.grp" },
];
const ORG = "grupos-teste-org";
const EMAIL_ORG = "org-grupos@teste.br";
const RIFA = "grupos-teste-rifa";
const RIFA_B = "grupos-teste-rifa-b";

async function limpar() {
  await db.execute(sql`delete from rate_events where bucket like 'cadastro:%' or bucket like 'login:%' or bucket like 'grupo-%' or bucket like 'denuncia-grupo:%'`);
  const cs = (await db.select({ id: campaigns.id }).from(campaigns).where(inArray(campaigns.slug, [RIFA, RIFA_B]))).map((c) => c.id);
  if (cs.length) {
    const l = sql.raw(`('${cs.join("','")}')`);
    await db.execute(sql`delete from orders where campaign_id in ${l}`);
    await db.execute(sql`delete from campaigns where id in ${l}`);
  }
  await db.execute(sql`delete from buyers where phone like '1197333%'`);
  await db.execute(sql`delete from users where email = ${EMAIL_ORG}`);
  await db.execute(sql`delete from organizations where slug = ${ORG}`);
}

async function main() {
  console.log("\n=== grupos da rifa ===\n");
  await limpar();
  const [anon, ana, bia, caio, duda, admin, marina] = Array.from({ length: 7 }, () => new Cliente());
  await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  const app0 = (await anon.req("GET", "/api/public/app")).json;
  const ajustar = (v: boolean) => admin.req("PUT", "/api/admin/app", { ...app0, mensagensLigado: v });
  await ajustar(true);

  const [org] = await db
    .insert(organizations)
    .values({ slug: ORG, name: "Org dos Grupos", cidade: "Natal", uf: "RN", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date(), sociosDeclaradosEm: new Date() })
    .returning();
  await db.insert(users).values({ role: "organizer", organizationId: org.id, name: "Org Grupos", email: EMAIL_ORG, passwordHash: await hashPassword("grupos-123") });
  const novaRifa = async (slug: string) => {
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        slug,
        title: `Rifa ${slug}`,
        prizeTitle: "Prêmio",
        totalQuotas: 10_000,
        priceCents: 1000,
        commissionPctDefault: 10,
        status: "published",
        publishedAt: new Date(),
        drawAt: new Date(Date.now() + 20 * 86_400_000),
        authorizationCode: `SPA-GR-${slug}`,
        authorizationFileKey: "certificado-teste",
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    return c;
  };
  const rifa = await novaRifa(RIFA);
  const rifaB = await novaRifa(RIFA_B);

  try {
    console.log("  contas e compras:");
    const ids: string[] = [];
    for (const [c, p] of [[ana, PESSOAS[0]], [bia, PESSOAS[1]], [caio, PESSOAS[2]], [duda, PESSOAS[3]]] as const) {
      const r = await c.req("POST", "/api/public/conta", { nome: p.nome, telefone: p.telefone, cpf: p.cpf, cep: "01310-100", senha: "senha-grupo-123", lembrar: true, apelido: p.apelido });
      if (r.status >= 300) throw new Error(`cadastro de ${p.apelido}: HTTP ${r.status} ${r.json?.message}`);
      ids.push(r.json?.id ?? "");
    }
    const compradores = await db.execute(sql`select id, phone from buyers where phone like '1197333%' order by phone`);
    const idDe = (tel: string) => (compradores.rows as { id: string; phone: string }[]).find((b) => b.phone === tel)!.id;
    let codigo = 71_000_000;
    const comprar = async (tel: string, campaignId: string, status: "paid" | "pending" = "paid") => {
      const [o] = await db.insert(orders).values({ code: codigo++, campaignId, buyerId: idDe(tel), quantity: 1, amountCents: 1000, status }).returning({ id: orders.id });
      return o.id;
    };
    const pagoAna = await comprar(PESSOAS[0].telefone, rifa.id);
    await comprar(PESSOAS[1].telefone, rifa.id);
    await comprar(PESSOAS[2].telefone, rifa.id, "pending"); // Caio ainda não pagou
    await comprar(PESSOAS[3].telefone, rifaB.id); // Duda pagou só a outra rifa

    console.log("\n  o interruptor e quem entra:");
    await ajustar(false);
    let r = await ana.req("GET", "/api/public/mensagens/grupos");
    checa("desligado, os grupos não existem (404)", r.status === 404, `HTTP ${r.status}`);
    await ajustar(true);
    r = await anon.req("GET", "/api/public/mensagens/grupos");
    checa("sem conta: 401", r.status === 401, `HTTP ${r.status}`);
    r = await marina.req("POST", "/api/auth/login", { email: EMAIL_ORG, password: "grupos-123" });
    r = await marina.req("POST", "/api/public/mensagens/grupos", { rifa: RIFA, nome: "Grupo da organização" });
    checa("a organização não cria grupo (403 ou 401)", r.status === 403 || r.status === 401, `HTTP ${r.status}`);

    console.log("\n  criar:");
    r = await caio.req("POST", "/api/public/mensagens/grupos", { rifa: RIFA, nome: "Quem não pagou" });
    checa("sem compra paga na rifa, não cria (403)", r.status === 403, `HTTP ${r.status}`);
    r = await duda.req("POST", "/api/public/mensagens/grupos", { rifa: RIFA, nome: "Outra rifa" });
    checa("compra paga em outra rifa não vale (403)", r.status === 403, `HTTP ${r.status}`);
    r = await ana.req("POST", "/api/public/mensagens/grupos", { rifa: RIFA, nome: "ab" });
    checa("nome curto: 400", r.status === 400);
    r = await ana.req("POST", "/api/public/mensagens/grupos", { rifa: RIFA, nome: "Chama no 11 98888-7777" });
    checa("nome com telefone: 400", r.status === 400, JSON.stringify(r.json));
    r = await ana.req("POST", "/api/public/mensagens/grupos", { rifa: "rifa-que-nao-existe", nome: "Nada por aqui" });
    checa("rifa que não existe: 404", r.status === 404);
    r = await ana.req("POST", "/api/public/mensagens/grupos", { rifa: RIFA, nome: "Torcida da rifa" });
    const grupo = r.json?.id as string;
    checa("quem pagou cria o grupo (201)", r.status === 201 && Boolean(grupo), JSON.stringify(r.json));
    r = await ana.req("POST", "/api/public/mensagens/grupos", { rifa: RIFA, nome: "Segundo grupo" });
    checa("um grupo aberto por criador e rifa (409)", r.status === 409, `HTTP ${r.status}`);

    console.log("\n  entrar:");
    r = await bia.req("GET", `/api/public/mensagens/grupos/rifa/${RIFA}`);
    checa("a Bia vê o grupo da rifa e pode participar", r.status === 200 && r.json?.podeParticipar === true && r.json.itens.some((g: { id: string }) => g.id === grupo));
    r = await caio.req("GET", `/api/public/mensagens/grupos/rifa/${RIFA}`);
    checa("o Caio vê os grupos, mas não pode participar", r.status === 200 && r.json?.podeParticipar === false);
    r = await caio.req("POST", `/api/public/mensagens/grupos/${grupo}/entrar`, {});
    checa("sem compra paga, não entra (403)", r.status === 403, `HTTP ${r.status}`);
    r = await bia.req("GET", `/api/public/mensagens/grupos/${grupo}`);
    checa("quem não é membro não lê o grupo (404)", r.status === 404, `HTTP ${r.status}`);
    r = await bia.req("POST", `/api/public/mensagens/grupos/${grupo}/entrar`, {});
    checa("a Bia entra", r.status === 200 && r.json?.jaEstava === false, JSON.stringify(r.json));
    r = await bia.req("POST", `/api/public/mensagens/grupos/${grupo}/entrar`, {});
    checa("entrar de novo não duplica", r.status === 200 && r.json?.jaEstava === true);
    const [{ n }] = (await db.execute(sql`select membros_count as n from grupos where id = ${grupo}`)).rows as { n: number }[];
    checa("o contador anda uma vez só por pessoa", n === 2, `${n}`);

    console.log("\n  conversar:");
    r = await ana.req("POST", `/api/public/mensagens/grupos/${grupo}/mensagens`, { texto: "Boa sorte para nós! 🍀" });
    checa("mensagem com emoji sai (201)", r.status === 201);
    r = await ana.req("POST", `/api/public/mensagens/grupos/${grupo}/mensagens`, { texto: "Me chama em https://golpe.example" });
    checa("link é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    r = await ana.req("POST", `/api/public/mensagens/grupos/${grupo}/mensagens`, { texto: "Zap 11 98888-7777" });
    checa("telefone é recusado (400)", r.status === 400);
    r = await ana.req("POST", `/api/public/mensagens/grupos/${grupo}/mensagens`, { imagem: "data:image/png;base64,AAAA" });
    checa("foto não existe em grupo (400)", r.status === 400);
    r = await bia.req("GET", "/api/public/mensagens/resumo");
    checa("a Bia tem uma não lida no contador do console", r.json?.naoLidas === 1, JSON.stringify(r.json));
    r = await bia.req("GET", `/api/public/mensagens/grupos/${grupo}`);
    const pagina = r.json;
    checa("a Bia lê: só apelidos, sem telefone, CPF ou nome real", r.status === 200 && !/11973330|Ana Grupo|cpf/i.test(JSON.stringify(pagina)) && pagina.pessoas.some((p: { apelido: string }) => p.apelido === "ana.grp"));
    r = await bia.req("POST", `/api/public/mensagens/grupos/${grupo}/lida`, {});
    r = await bia.req("GET", "/api/public/mensagens/resumo");
    checa("marcar como lido zera", r.json?.naoLidas === 0);
    r = await bia.req("GET", "/api/public/mensagens/grupos");
    checa("a lista dos meus grupos traz a prévia", r.status === 200 && r.json?.[0]?.previa === "Boa sorte para nós! 🍀");

    console.log("\n  o teto (50) — a última vaga disputada:");
    await db.execute(sql`update grupos set membros_count = 49 where id = ${grupo}`);
    await comprar(PESSOAS[2].telefone, rifa.id); // o Caio agora tem compra paga
    const [rc, rd] = await Promise.all([
      caio.req("POST", `/api/public/mensagens/grupos/${grupo}/entrar`, {}),
      // A Duda paga a rifa certa na hora: as duas entradas disputam a mesma vaga.
      (async () => {
        await comprar(PESSOAS[3].telefone, rifa.id);
        return duda.req("POST", `/api/public/mensagens/grupos/${grupo}/entrar`, {});
      })(),
    ]);
    const status = [rc.status, rd.status].sort().join();
    checa("duas entradas na última vaga: uma entra (200) e uma recebe 409", status === "200,409", status);
    const [{ n: n2 }] = (await db.execute(sql`select membros_count as n from grupos where id = ${grupo}`)).rows as { n: number }[];
    const [{ m }] = (await db.execute(sql`select count(*)::int as m from grupo_membros where grupo_id = ${grupo}`)).rows as { m: number }[];
    checa("o contador nunca passa de 50 e a perdedora não ficou como membro", n2 === 50 && m === 3, `contador ${n2}, linhas ${m}`);
    const perdedora = rc.status === 409 ? caio : duda;
    r = await perdedora.req("GET", `/api/public/mensagens/grupos/${grupo}`);
    checa("quem recebeu 409 não lê o grupo (404)", r.status === 404);
    await db.execute(sql`update grupos set membros_count = 3 where id = ${grupo}`);

    console.log("\n  estorno e saída:");
    await db.update(orders).set({ status: "refunded" }).where(eq(orders.id, pagoAna));
    r = await ana.req("POST", `/api/public/mensagens/grupos/${grupo}/mensagens`, { texto: "Ainda posso?" });
    checa("compra estornada: não escreve mais (409)", r.status === 409, `HTTP ${r.status}`);
    r = await ana.req("GET", `/api/public/mensagens/grupos/${grupo}`);
    checa("mas segue lendo, com o motivo na tela", r.status === 200 && r.json?.grupo?.podeEscrever === false && /não está mais paga/.test(r.json.grupo.impedimento ?? ""));
    await db.update(orders).set({ status: "paid" }).where(eq(orders.id, pagoAna));
    r = await bia.req("POST", `/api/public/mensagens/grupos/${grupo}/sair`, {});
    checa("a Bia sai do grupo", r.status === 200);
    r = await bia.req("GET", `/api/public/mensagens/grupos/${grupo}`);
    checa("depois de sair, o grupo é 404", r.status === 404);

    console.log("\n  rifa travada fecha o grupo:");
    await db.update(campaigns).set({ travadaEm: new Date() }).where(eq(campaigns.id, rifa.id));
    r = await ana.req("POST", `/api/public/mensagens/grupos/${grupo}/mensagens`, { texto: "Ainda dá?" });
    checa("rifa travada: o grupo não aceita mensagem (409)", r.status === 409 && /não está mais no ar/.test(r.json?.message ?? ""), `HTTP ${r.status}`);
    await db.update(campaigns).set({ travadaEm: null }).where(eq(campaigns.id, rifa.id));

    console.log("\n  denúncia e plataforma:");
    r = await caio.req("POST", `/api/public/mensagens/grupos/${grupo}/mensagens`, { texto: "Pessoal, topam trocar número premiado?" });
    r = await caio.req("POST", `/api/public/mensagens/grupos/${grupo}/denuncia`, { motivo: "golpe", texto: "Estranho." });
    const protocolo = r.json?.protocolo as string;
    checa("o Caio denuncia o grupo", r.status === 201 && /^GR-/.test(protocolo ?? ""), JSON.stringify(r.json));
    r = await caio.req("POST", `/api/public/mensagens/grupos/${grupo}/denuncia`, { motivo: "golpe" });
    checa("uma aberta por grupo e pessoa (409)", r.status === 409);
    r = await bia.req("POST", `/api/public/mensagens/grupos/${grupo}/denuncia`, { motivo: "golpe" });
    checa("quem não é membro não denuncia (404)", r.status === 404);
    r = await marina.req("GET", "/api/admin/mensagens/grupos/denuncias");
    checa("organização não vê a fila (403)", r.status === 403);
    r = await admin.req("GET", "/api/admin/mensagens/grupos/denuncias?status=aberta");
    const item = r.json?.find((d: { protocolo: string }) => d.protocolo === protocolo);
    checa("a fila da plataforma não traz o texto", r.status === 200 && Boolean(item) && !JSON.stringify(r.json).includes("trocar número"));
    r = await admin.req("GET", "/api/admin/caixa-de-entrada");
    const naCaixa = (r.json as { tipo: string; chave: string }[] | undefined)?.find((x) => x.chave === `grupo:${item?.id}`);
    checa("o grupo denunciado entra na Caixa de entrada, sem texto nem telefone", naCaixa?.tipo === "grupo" && !JSON.stringify(naCaixa).includes("trocar") && !/1197333/.test(JSON.stringify(naCaixa)));
    const antes = Number((await db.execute(sql`select count(*)::int as n from audit_log where action = 'mensagens.grupo.denuncia.ler'`)).rows[0].n);
    r = await admin.req("GET", `/api/admin/mensagens/grupos/denuncias/${item?.id}`);
    const depois = Number((await db.execute(sql`select count(*)::int as n from audit_log where action = 'mensagens.grupo.denuncia.ler'`)).rows[0].n);
    checa("o detalhe traz o trecho e a leitura entra na auditoria", r.status === 200 && r.json.trecho.some((m: { texto: string }) => /trocar número/.test(m.texto)) && depois === antes + 1);
    r = await marina.req("GET", `/api/admin/mensagens/grupos/denuncias/${item?.id}`);
    checa("organização não lê o detalhe (403)", r.status === 403);
    r = await admin.req("POST", `/api/admin/mensagens/grupos/denuncias/${item?.id}/decidir`, { decisao: "procedente" });
    checa("procedente pede explicação (400)", r.status === 400);
    r = await admin.req("POST", `/api/admin/mensagens/grupos/denuncias/${item?.id}/decidir`, { decisao: "qualquer coisa", resposta: "x" });
    checa("decisão desconhecida: 400, sem auditoria solta", r.status === 400);
    const duas = await Promise.all([1, 2].map(() => admin.req("POST", `/api/admin/mensagens/grupos/denuncias/${item?.id}/decidir`, { decisao: "procedente", resposta: "Combinação de golpe." })));
    checa("dois cliques, uma decisão (200 e 409)", duas.map((d) => d.status).sort().join() === "200,409", duas.map((d) => d.status).join());
    r = await ana.req("POST", `/api/public/mensagens/grupos/${grupo}/mensagens`, { texto: "Alguém aí?" });
    checa("grupo encerrado: ninguém escreve (409)", r.status === 409 && /encerrado/.test(r.json?.message ?? ""));
    r = await bia.req("POST", `/api/public/mensagens/grupos/${grupo}/entrar`, {});
    checa("grupo encerrado: ninguém entra (409)", r.status === 409);
    r = await ana.req("POST", "/api/public/mensagens/grupos", { rifa: RIFA, nome: "Novo depois do encerramento" });
    checa("quem teve o grupo encerrado pode criar outro", r.status === 201);

    console.log("\n  sair do grupo vazio:");
    r = await duda.req("POST", "/api/public/mensagens/grupos", { rifa: RIFA_B, nome: "Grupo da Duda" });
    const solitario = r.json?.id as string;
    r = await duda.req("POST", `/api/public/mensagens/grupos/${solitario}/sair`, {});
    const [vazio] = (await db.execute(sql`select encerrada_em from grupos where id = ${solitario}`)).rows as { encerrada_em: string | null }[];
    checa("o último a sair fecha o grupo", r.status === 200 && vazio.encerrada_em !== null);
    r = await duda.req("POST", "/api/public/mensagens/grupos", { rifa: RIFA_B, nome: "Outro da Duda" });
    checa("e o criador pode abrir outro", r.status === 201);

    console.log("\n  a lista anda por chave:");
    r = await ana.req("GET", "/api/public/mensagens/grupos?limite=1");
    checa("limite 1 devolve um grupo e o cursor", r.status === 200 && r.json.length === 1 && Boolean(r.headers.get("x-proximo")));
    r = await ana.req("GET", `/api/public/mensagens/grupos?depois=${encodeURIComponent("lixo;drop table")}`);
    checa("cursor fora do formato vira primeira página, nunca erro", r.status === 200);

    console.log("\n  excluir a conta (LGPD):");
    r = await caio.req("POST", "/api/public/conta/excluir", { senha: "senha-grupo-123" });
    const [{ m: restam }] = (await db.execute(sql`select count(*)::int as m from grupo_membros where buyer_id = ${idDe(PESSOAS[2].telefone)}`)).rows as { m: number }[];
    checa("a conta excluída sai dos grupos", r.status === 200 && restam === 0, `HTTP ${r.status}`);
  } finally {
    await admin.req("PUT", "/api/admin/app", app0).catch(() => {});
    await limpar();
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
