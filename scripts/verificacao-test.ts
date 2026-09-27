/**
 * Prova da verificação do perfil (selo de trevo), pela API de verdade:
 * apostador, afiliado e organização; documentos cifrados; a foto
 * conferida lado a lado (e pelo comparador, injetado); trocar a foto tira
 * o selo na hora; emoji só para verificado; o mesmo CPF não verifica duas
 * contas; a fila é só da plataforma; as cores do selo.
 *
 *   npm run verificacao      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import sharp from "sharp";
import { baseUrl } from "./base-url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { affiliates, auditLog, buyers, campaignStats, campaigns, organizations, users, verificacoes } from "../shared/schema";
import { compararAutomaticamente } from "../server/services/verificacao";
import { CORES_DO_SELO_PADRAO } from "../shared/verificacao";

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
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null, bytes: tipo.includes("json") ? null : Buffer.from(await r.arrayBuffer()) };
  }
  async entrar(email: string, password: string) {
    const r = await this.req("POST", "/api/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`login ${email}: HTTP ${r.status} ${r.json?.message ?? ""}`);
  }
}

// Menor PNG válido (1×1) e um PDF mínimo: o servidor confere pelo conteúdo.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PDF = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64")}`;

/** CPF válido a partir de 9 dígitos — só desta prova, para não esbarrar nas contas dos outros testes. */
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
  { nome: "Carla Verifica Souza", telefone: "11975550001", cpf: cpf("482917301") },
  { nome: "Diego Verifica Lima", telefone: "11975550002", cpf: cpf("482917302") },
  { nome: "Elisa Verifica Rocha", telefone: "11975550003", cpf: cpf("482917303") },
];
const EMAIL_AFILIADO = "afiliado.verifica@rifa.teste";
const EMAIL_AFILIADO_2 = "afiliado2.verifica@rifa.teste";
const SLUG = "verificacao-teste-rifa";

const dadosPessoa = (p: { nome: string; cpf: string }) => ({
  nomeCompleto: p.nome,
  cpf: p.cpf,
  rg: "12.345.678-9",
  nascimento: "1990-05-10",
  conta: { banco: "260", agencia: "0001", conta: "1234567-8", tipo: "corrente" },
  pix: { tipo: "cpf", chave: p.cpf },
  consentimentoFoto: true,
});

async function limpar(orgId: string) {
  await db.execute(sql`delete from rate_events where bucket like 'comentario:%' or bucket like 'cadastro:%' or bucket like 'login:%'`);
  await db.execute(sql`delete from campaigns where slug = ${SLUG}`);
  const bs = await db.select({ id: buyers.id }).from(buyers).where(inArray(buyers.phone, PESSOAS.map((p) => p.telefone)));
  if (bs.length) await db.delete(verificacoes).where(inArray(verificacoes.sujeitoId, bs.map((b) => b.id)));
  for (const p of PESSOAS) await db.execute(sql`delete from buyers where phone = ${p.telefone}`);
  for (const u of await db.select({ id: users.id }).from(users).where(inArray(users.email, [EMAIL_AFILIADO, EMAIL_AFILIADO_2]))) {
    const [a] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.userId, u.id));
    if (a) await db.delete(verificacoes).where(eq(verificacoes.sujeitoId, a.id));
    await db.delete(affiliates).where(eq(affiliates.userId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  await db.delete(verificacoes).where(and(eq(verificacoes.sujeito, "organizacao"), eq(verificacoes.sujeitoId, orgId)));
  await db.update(organizations).set({ verificadaEm: null }).where(eq(organizations.id, orgId));
}

let PNG2 = "";

async function main() {
  console.log("\n=== verificação do perfil (selo de trevo) ===\n");
  // Uma segunda foto, diferente da primeira (a troca de foto é o que se prova).
  PNG2 = `data:image/png;base64,${(await sharp({ create: { width: 2, height: 2, channels: 3, background: "#c00" } }).png().toBuffer()).toString("base64")}`;
  const admin = new Cliente();
  await admin.entrar("admin@rifa.br", "admin123");
  const marina = new Cliente();
  await marina.entrar("marina@rifassaojose.br", "organizador123");
  const [eu] = await db.select({ org: users.organizationId }).from(users).where(eq(users.email, "marina@rifassaojose.br"));
  const orgId = eu.org!;
  const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, orgId));
  await limpar(orgId);

  const [rifa] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug: SLUG,
      title: "Rifa verificada",
      prizeTitle: "Moto",
      totalQuotas: 100,
      priceCents: 500,
      drawAt: new Date(Date.now() + 7 * 86_400_000),
      authorizationCode: "SPA-VERIFICA",
      status: "published",
      publishedAt: new Date(),
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: rifa.id });

  const [carla, diego, elisa, anon] = [new Cliente(), new Cliente(), new Cliente(), new Cliente()];
  for (const [c, p] of [[carla, PESSOAS[0]], [diego, PESSOAS[1]], [elisa, PESSOAS[2]]] as const) {
    const r = await c.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", ...p, cep: "01310-100", senha: "senha-verifica-1", lembrar: true });
    if (r.status >= 300) throw new Error(`conta: HTTP ${r.status} ${r.json?.message}`);
  }
  await carla.req("PUT", "/api/public/conta/perfil", { apelido: "carla.verifica" });
  await diego.req("PUT", "/api/public/conta/perfil", { apelido: "diego.verifica" });
  const [carlaB] = await db.select().from(buyers).where(eq(buyers.phone, PESSOAS[0].telefone));
  const V = "/api/public/conta/verificacao";

  try {
    console.log("  o apostador pede o selo:");
    let r = await anon.req("GET", V);
    checa("sem conta: 401", r.status === 401, `HTTP ${r.status}`);
    r = await carla.req("GET", V);
    checa("começa incompleta, pedindo a foto do perfil", r.status === 200 && r.json?.status === "incompleto" && r.json.falta.some((f: string) => /foto/.test(f)), JSON.stringify(r.json?.falta));
    r = await carla.req("PUT", V, { ...dadosPessoa(PESSOAS[0]), consentimentoFoto: false });
    checa("sem o consentimento da comparação da foto: 400", r.status === 400, r.json?.message);
    r = await carla.req("PUT", V, dadosPessoa({ ...PESSOAS[0], cpf: PESSOAS[1].cpf }));
    checa("CPF diferente do da conta: 409", r.status === 409, r.json?.message);
    r = await carla.req("PUT", V, dadosPessoa(PESSOAS[0]));
    checa("dados salvos, ainda incompleta (faltam documentos e foto)", r.status === 200 && r.json?.status === "incompleto", r.json?.status);
    const [linha] = await db.select().from(verificacoes).where(eq(verificacoes.sujeitoId, carlaB.id));
    checa("dados cifrados: o CPF não aparece no banco", Boolean(linha?.dados) && !linha.dados!.toString("latin1").includes(PESSOAS[0].cpf));
    r = await carla.req("PUT", `${V}/documentos/identidade_frente`, { arquivo: PDF });
    checa("frente do documento em PDF: 400 (é nela que se compara o rosto)", r.status === 400, r.json?.message);
    r = await carla.req("PUT", `${V}/documentos/identidade_frente`, { arquivo: PNG });
    r = await carla.req("PUT", `${V}/documentos/identidade_verso`, { arquivo: PDF });
    checa("documentos enviados; sem foto, segue incompleta", r.status === 200 && r.json?.status === "incompleto", r.json?.status);
    r = await carla.req("PUT", `${V}/documentos/cartao_cnpj`, { arquivo: PDF });
    checa("documento que não é de pessoa: 400", r.status === 400, r.json?.message);
    await carla.req("PUT", "/api/public/conta/perfil", { foto: PNG });
    r = await carla.req("GET", V);
    checa("com a foto no perfil, vai para a análise", r.json?.status === "em_analise", r.json?.status);
    r = await carla.req("GET", `${V}/documentos/identidade_frente`);
    checa("o dono baixa o próprio documento", r.status === 200 && r.bytes?.[1] === 0x50);

    console.log("\n  a plataforma confere:");
    r = await marina.req("GET", "/api/admin/verificacoes");
    checa("a fila é só da plataforma (403 para organizador)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/admin/verificacoes");
    const naFila = r.json?.find((v: { sujeitoId?: string; id: string }) => v.id === linha.id);
    checa("a fila traz o pedido, sem dado pessoal", Boolean(naFila) && !JSON.stringify(r.json).includes(PESSOAS[0].cpf), `HTTP ${r.status}`);
    const antes = (await db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.action, "verificacao.ver_dados")))[0].n;
    r = await admin.req("GET", `/api/admin/verificacoes/${linha.id}`);
    const depois = (await db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.action, "verificacao.ver_dados")))[0].n;
    checa("o detalhe decifra os dados e entra na auditoria", r.json?.dados?.cpf === PESSOAS[0].cpf && depois === antes + 1);
    const fotoVersao = r.json?.fotoVersao;
    r = await admin.req("GET", `/api/admin/verificacoes/${linha.id}/foto`);
    checa("a foto do perfil, para comparar lado a lado", r.status === 200 && (r.bytes?.length ?? 0) > 0, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/verificacoes/${linha.id}/decidir`, { acao: "aprovar" });
    checa("aprovar a foto sem dizer qual foto viu: 409", r.status === 409, r.json?.message);
    r = await admin.req("POST", `/api/admin/verificacoes/${linha.id}/decidir`, { acao: "recusar" });
    checa("recusar sem motivo: 400", r.status === 400, r.json?.message);
    r = await admin.req("POST", `/api/admin/verificacoes/${linha.id}/decidir`, { acao: "aprovar", fotoVersao });
    checa("aprovado: verificado", r.status === 200 && r.json?.status === "verificado", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", `/api/admin/verificacoes/${linha.id}/decidir`, { acao: "aprovar", fotoVersao });
    checa("decidir de novo: 409", r.status === 409, `HTTP ${r.status}`);
    const [carlaDepois] = await db.select({ v: buyers.verificadoEm }).from(buyers).where(eq(buyers.id, carlaB.id));
    checa("o selo público acende na mesma transação", Boolean(carlaDepois.v));
    r = await anon.req("GET", "/api/public/u/carla.verifica");
    checa("o perfil público mostra verificado", r.json?.verificado === true, JSON.stringify(r.json));

    console.log("\n  emoji é de perfil verificado:");
    const caminho = `/api/public/campaigns/${SLUG}/comentarios`;
    r = await diego.req("POST", caminho, { texto: "Que moto 🔥" });
    checa("não verificado comenta com emoji: 403", r.status === 403, r.json?.message);
    r = await diego.req("POST", caminho, { texto: "Que moto!" });
    checa("não verificado comenta com texto (sem foto no perfil)", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await carla.req("POST", caminho, { texto: "Boa sorte a todos 🍀" });
    checa("verificada comenta com emoji", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await carla.req("GET", caminho);
    const daCarla = r.json?.lista?.find((c: { nome: string }) => c.nome === "carla.verifica");
    checa("a lista traz o selo e libera emoji para quem é verificado", daCarla?.verificado === true && r.json?.podeUsarEmoji === true);
    r = await diego.req("GET", caminho);
    checa("para quem não é, a tela sabe que não pode", r.json?.podeUsarEmoji === false);
    r = await marina.req("POST", caminho, { texto: "Obrigada 🙏" });
    checa("organização não verificada também não usa emoji: 403", r.status === 403, `HTTP ${r.status}`);

    console.log("\n  trocar a foto tira o selo:");
    await carla.req("PUT", "/api/public/conta/perfil", { foto: PNG2 });
    const [semSelo] = await db.select({ v: buyers.verificadoEm }).from(buyers).where(eq(buyers.id, carlaB.id));
    r = await carla.req("GET", V);
    checa("selo apagado na troca, foto volta para análise (documentos seguem aprovados)",
      !semSelo.v && r.json?.status === "foto_em_analise" && r.json?.documentosAprovados === true, r.json?.status);
    r = await carla.req("POST", caminho, { texto: "De novo 🍀" });
    checa("sem o selo, emoji volta a ser barrado", r.status === 403, `HTTP ${r.status}`);

    console.log("\n  comparador automático (injetado, sem rede):");
    let chamadas = 0;
    const duvida = await compararAutomaticamente(linha.id, { nome: "teste", comparar: async () => (chamadas++, 60) });
    checa("semelhança baixa não recusa: fica para uma pessoa", duvida === "manual" && chamadas === 1);
    r = await carla.req("GET", V);
    checa("…e segue em análise da foto", r.json?.status === "foto_em_analise", r.json?.status);
    // A foto muda no meio da comparação: o resultado não serve para a nova.
    const corrida = await compararAutomaticamente(linha.id, {
      nome: "teste",
      comparar: async () => {
        await carla.req("PUT", "/api/public/conta/perfil", { foto: PNG });
        return 99;
      },
    });
    r = await carla.req("GET", V);
    checa("foto trocada durante a comparação não herda o resultado", corrida === "manual" && r.json?.status === "foto_em_analise", `${corrida} ${r.json?.status}`);
    const certo = await compararAutomaticamente(linha.id, { nome: "teste", comparar: async () => 97 });
    const [comSelo] = await db.select({ v: buyers.verificadoEm }).from(buyers).where(eq(buyers.id, carlaB.id));
    const [lida] = await db.select().from(verificacoes).where(eq(verificacoes.id, linha.id));
    checa("semelhança alta: verifica sozinho, e registra que foi automático",
      certo === "verificado" && Boolean(comSelo.v) && lida.fotoConferidaPor === "automatico" && lida.fotoSimilaridade === 97);

    console.log("\n  foto de outra pessoa, e o mesmo CPF:");
    r = await diego.req("PUT", V, dadosPessoa(PESSOAS[0]));
    checa("CPF que não é o da conta: 409", r.status === 409, r.json?.message);
    r = await diego.req("PUT", V, dadosPessoa(PESSOAS[1]));
    await diego.req("PUT", `${V}/documentos/identidade_frente`, { arquivo: PNG });
    await diego.req("PUT", `${V}/documentos/identidade_verso`, { arquivo: PNG });
    await diego.req("PUT", "/api/public/conta/perfil", { foto: PNG });
    const [diegoB] = await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.phone, PESSOAS[1].telefone));
    const [vDiego] = await db.select().from(verificacoes).where(eq(verificacoes.sujeitoId, diegoB.id));
    checa("Diego em análise", vDiego?.status === "em_analise", vDiego?.status);
    r = await admin.req("GET", `/api/admin/verificacoes/${vDiego.id}`);
    r = await admin.req("POST", `/api/admin/verificacoes/${vDiego.id}/decidir`, { acao: "foto_divergente", motivo: "A foto é de outra pessoa.", fotoVersao: r.json?.fotoVersao });
    r = await diego.req("GET", V);
    checa("foto não confere: documentos aprovados, motivo para a pessoa", r.json?.status === "foto_divergente" && r.json?.documentosAprovados && r.json?.motivo === "A foto é de outra pessoa.", r.json?.status);
    await diego.req("PUT", "/api/public/conta/perfil", { foto: PNG2 });
    r = await diego.req("GET", V);
    checa("foto nova: volta para a análise da foto", r.json?.status === "foto_em_analise", r.json?.status);
    await diego.req("PUT", `${V}/documentos/identidade_verso`, { arquivo: PDF });
    r = await diego.req("GET", V);
    checa("mexer em documento derruba a aprovação e volta para a análise", r.json?.status === "em_analise" && r.json?.documentosAprovados === false, r.json?.status);

    console.log("\n  organização:");
    const OV = `/api/admin/organizacoes/${orgId}/verificacao`;
    r = await admin.req("GET", OV);
    checa("a plataforma não preenche pela organização (403)", r.status === 403, `HTTP ${r.status}`);
    r = await marina.req("PUT", OV, {
      razaoSocial: "Rifas São José Ltda",
      cnpj: "11.222.333/0001-81",
      responsavel: { nomeCompleto: "Marina Alves Teste", cpf: PESSOAS[2].cpf, rg: "98.765.432-1", nascimento: "1985-03-02" },
      conta: { banco: "001", agencia: "1234", conta: "99887-6", tipo: "corrente" },
      pix: { tipo: "cnpj", chave: "11222333000181" },
    });
    checa("dados da organização (CNPJ, dono, conta e Pix) salvos, sem pedir foto", r.status === 200 && !r.json?.falta.some((f: string) => /foto (sua|do perfil)/.test(f)), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    for (const t of ["identidade_frente", "identidade_verso"]) await marina.req("PUT", `${OV}/documentos/${t}`, { arquivo: PNG });
    await marina.req("PUT", `${OV}/documentos/cartao_cnpj`, { arquivo: PDF });
    r = await marina.req("PUT", `${OV}/documentos/comprovante_endereco`, { arquivo: PDF });
    checa("com RG, cartão CNPJ e comprovante de endereço, vai para a análise", r.json?.status === "em_analise", r.json?.status);
    const [vOrg] = await db.select().from(verificacoes).where(and(eq(verificacoes.sujeito, "organizacao"), eq(verificacoes.sujeitoId, orgId)));
    r = await admin.req("POST", `/api/admin/verificacoes/${vOrg.id}/decidir`, { acao: "foto_divergente", motivo: "xxxxxxxx" });
    checa("organização não compara foto: 400", r.status === 400, r.json?.message);
    r = await admin.req("POST", `/api/admin/verificacoes/${vOrg.id}/decidir`, { acao: "aprovar" });
    checa("aprovada: verificada", r.json?.status === "verificado", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await anon.req("GET", `/api/public/o/${org.slug}`);
    checa("o perfil público mostra a organização verificada", r.json?.verificada === true);
    r = await anon.req("GET", "/api/public/campaigns");
    checa("a vitrine também", r.json?.find((c: { slug: string }) => c.slug === SLUG)?.organizacao?.verificada === true);
    r = await marina.req("POST", caminho, { texto: "Obrigada 🙏" });
    checa("verificada, a organização comenta com emoji", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    console.log("\n  afiliado:");
    const [u] = await db.insert(users).values({ role: "affiliate", name: "Afiliado Verifica", email: EMAIL_AFILIADO, passwordHash: await hashPassword("senha-afiliado-1") }).returning();
    const [aff] = await db.insert(affiliates).values({ userId: u.id, code: "VERIFICA9", status: "active" }).returning();
    const afi = new Cliente();
    await afi.entrar(EMAIL_AFILIADO, "senha-afiliado-1");
    r = await afi.req("POST", "/api/affiliate/verificacao/copiar-do-fiscal");
    checa("sem cadastro fiscal, não há o que copiar (404)", r.status === 404, `HTTP ${r.status}`);
    await afi.req("PUT", "/api/affiliate/fiscal/documentos/identidade_frente", { arquivo: PNG });
    await afi.req("PUT", "/api/affiliate/fiscal/documentos/identidade_verso", { arquivo: PNG });
    r = await afi.req("POST", "/api/affiliate/verificacao/copiar-do-fiscal");
    checa("copia o RG do cadastro fiscal", r.status === 200 && r.json?.documentos?.length === 2, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await afi.req("PUT", "/api/affiliate/verificacao", dadosPessoa({ nome: "Afiliado Verifica Silva", cpf: PESSOAS[2].cpf }));
    checa("afiliado sem foto: incompleto", r.json?.status === "incompleto", r.json?.status);
    r = await afi.req("PUT", "/api/affiliate/foto", { foto: PNG });
    r = await afi.req("GET", "/api/affiliate/verificacao");
    checa("com a foto do afiliado, vai para a análise (o mesmo CPF da organização não conflita)", r.json?.status === "em_analise", r.json?.status);
    const [vAff] = await db.select().from(verificacoes).where(eq(verificacoes.sujeitoId, aff.id));
    r = await admin.req("GET", `/api/admin/verificacoes/${vAff.id}`);
    r = await admin.req("POST", `/api/admin/verificacoes/${vAff.id}/decidir`, { acao: "aprovar", fotoVersao: r.json?.fotoVersao });
    const [affDepois] = await db.select({ v: affiliates.verificadoEm }).from(affiliates).where(eq(affiliates.id, aff.id));
    checa("afiliado verificado", r.json?.status === "verificado" && Boolean(affDepois.v), r.json?.message);
    r = await afi.req("GET", "/api/affiliate/overview");
    checa("o painel do afiliado sabe do selo", r.json?.affiliate?.verificado === true);
    // O índice decide: o mesmo CPF não verifica dois afiliados.
    const [u2] = await db.insert(users).values({ role: "affiliate", name: "Afiliado Copia", email: EMAIL_AFILIADO_2, passwordHash: await hashPassword("senha-afiliado-1") }).returning();
    await db.insert(affiliates).values({ userId: u2.id, code: "VERIFICA8", status: "active" });
    const afi2 = new Cliente();
    await afi2.entrar(EMAIL_AFILIADO_2, "senha-afiliado-1");
    r = await afi2.req("PUT", "/api/affiliate/verificacao", dadosPessoa({ nome: "Outro Afiliado Silva", cpf: PESSOAS[2].cpf }));
    checa("o CPF que já verificou outro afiliado: 409", r.status === 409 && /outro perfil/.test(r.json?.message ?? ""), r.json?.message);

    console.log("\n  cores do selo:");
    r = await marina.req("PUT", "/api/admin/selos", { cores: { apostador: "laranja" } });
    checa("só a plataforma escolhe (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/selos", { cores: { apostador: "azul", afiliado: "roxo", organizacao: "azul" } });
    checa("duas cores iguais: 400", r.status === 400, r.json?.message);
    r = await admin.req("PUT", "/api/admin/selos", { cores: { apostador: "turquesa", afiliado: "violeta", organizacao: "ceu" } });
    const pub = await anon.req("GET", "/api/public/selos");
    checa("salva e a vitrine lê", r.status === 200 && pub.json?.cores?.apostador === "turquesa", JSON.stringify(pub.json));
  } finally {
    await admin.req("PUT", "/api/admin/selos", { cores: CORES_DO_SELO_PADRAO });
    await limpar(orgId);
  }

  console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
