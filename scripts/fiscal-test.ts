/**
 * Prova do cadastro fiscal e do recibo, pela API de verdade:
 *
 * - o banco guarda cifrado (o CPF não aparece em claro em lugar nenhum);
 * - o organizador não alcança o cadastro (403) e a plataforma, ao abrir,
 *   deixa rastro em `audit_log`;
 * - CPF repetido entre afiliados é 409 (índice único da impressão);
 * - recusa exige motivo; mexer depois de aprovado volta para análise;
 * - com a exigência ligada, saque sem cadastro aprovado é 409;
 * - saque pago emite recibo (PDF de verdade), a conferência pública diz
 *   "autêntico" sem CPF, e um centavo mexido no banco vira "não confere";
 * - o recibo da vizinha é 404 e a segunda baixa do mesmo saque é 409.
 *
 *   npm run fiscal      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { affiliates, afiliadoVinculos, auditLog, campaignStats, campaigns, commissions, orders, organizations, recibos, users } from "../shared/schema";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

class Cliente {
  cookie = "";
  async bruto(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    return r;
  }
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await this.bruto(metodo, caminho, corpo);
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
  async entrar(email: string, password: string) {
    const r = await this.req("POST", "/api/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`login ${email}: HTTP ${r.status} ${r.json?.message ?? ""}`);
    return this;
  }
}

const SLUGS = ["fiscal-teste-a", "fiscal-teste-b"];
const EMAILS = ["fiscal-org-a@teste.rifa", "fiscal-org-b@teste.rifa", "fiscal-afiliado@teste.rifa", "fiscal-afiliado-2@teste.rifa"];
const SENHA = "senha-fiscal-1";
const CPF = "52998224725";

const DADOS = {
  nomeCompleto: "Fernanda Teste Fiscal",
  cpf: "529.982.247-25",
  rg: "12.345.678-9",
  nascimento: "1990-05-10",
  endereco: { cep: "59020-000", logradouro: "Avenida Teste", numero: "100", complemento: "", bairro: "Centro", cidade: "Natal", uf: "RN" },
  conta: { banco: "260", agencia: "0001", conta: "1234567-8", tipo: "corrente" },
  empresa: { tipo: "mei", cnpj: "11.222.333/0001-81", razaoSocial: "Fernanda Teste Divulgação" },
};
// Menor PNG válido (1×1) e um PDF mínimo: o servidor confere pelo conteúdo.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PDF = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64")}`;

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const lista = sql.raw(`('${ids.join("','")}')`);
    await db.execute(sql`delete from recibos where organization_id in ${lista}`);
    await db.execute(sql`delete from commissions where campaign_id in (select id from campaigns where organization_id in ${lista})`);
    await db.execute(sql`delete from payouts where organization_id in ${lista}`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id in ${lista})`);
    await db.execute(sql`delete from campaigns where organization_id in ${lista}`);
  }
  await db.execute(sql`delete from affiliates where user_id in (select id from users where email in ${sql.raw(`('${EMAILS.join("','")}')`)})`);
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from buyers where phone like '1193333%'`);
  await db.execute(sql`delete from rate_events where bucket like 'login:%'`);
}

async function afiliado(email: string, codigo: string) {
  const [u] = await db.insert(users).values({ role: "affiliate", name: "Afiliado Fiscal", email, passwordHash: await hashPassword(SENHA) }).returning();
  const [a] = await db.insert(affiliates).values({ userId: u.id, code: codigo, status: "active", pixKey: "fernanda@pix.teste" }).returning();
  return a;
}

/** Comissão disponível numa rifa da organização (pedido pago direto no banco). */
async function comissao(orgId: string, affiliateId: string, cents: number, n: number) {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug: `fiscal-teste-rifa-${orgId.slice(0, 6)}-${n}`,
      title: `Rifa fiscal ${n}`,
      prizeTitle: "Prêmio",
      totalQuotas: 1000,
      priceCents: 1000,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: "SPA-FISCAL",
      authorizationFileKey: "certificado-teste",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: c.id });
  const [b] = (await db.execute(sql`insert into buyers (name, phone) values ('Comprador Fiscal', ${`1193333${String(n).padStart(4, "0")}`}) returning id`)).rows as { id: string }[];
  const [o] = await db
    .insert(orders)
    .values({ code: String(90_000_000 + n), campaignId: c.id, buyerId: b.id, quantity: 1, amountCents: 1000, status: "paid", paidAt: new Date(), affiliateId, expiresAt: new Date() })
    .returning();
  await db.insert(commissions).values({ affiliateId, orderId: o.id, campaignId: c.id, amountCents: cents, pct: 10, status: "available", availableAt: new Date() });
}

async function main() {
  console.log("\n=== cadastro fiscal e recibo ===\n");
  await limpar();
  const admin = await new Cliente().entrar("admin@rifa.br", "admin123");
  const plataformaAntes = (await admin.req("GET", "/api/admin/plataforma")).json;

  const orgs: { id: string }[] = [];
  const organizadores: Cliente[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db.insert(organizations).values({ slug, name: `Fiscal ${i ? "B" : "A"}`, cidade: "Natal", uf: "RN" }).returning();
    await db.insert(users).values({ role: "organizer", organizationId: o.id, name: `Org ${i}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) });
    orgs.push(o);
    organizadores.push(await new Cliente().entrar(EMAILS[i], SENHA));
  }
  const [A, B] = orgs;
  const [orgA, orgB] = organizadores;

  try {
    const aff = await afiliado(EMAILS[2], "FISCALTESTE");
    await db.insert(afiliadoVinculos).values({ affiliateId: aff.id, organizationId: A.id, status: "aprovado" });
    const eu = await new Cliente().entrar(EMAILS[2], SENHA);

    // Dados e documentos.
    let r = await eu.req("PUT", "/api/affiliate/fiscal", { ...DADOS, nascimento: "2015-01-01" });
    checa("menor de idade é recusado", r.status === 400, `HTTP ${r.status}`);
    r = await eu.req("PUT", "/api/affiliate/fiscal", DADOS);
    checa("salva os dados", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await eu.req("GET", "/api/affiliate/fiscal");
    checa("sem documentos: incompleto, e diz o que falta", r.json?.status === "incompleto" && r.json?.falta?.length === 4, JSON.stringify(r.json?.falta));
    checa("o afiliado lê os próprios dados", r.json?.dados?.cpf === CPF);

    r = await eu.req("PUT", "/api/affiliate/fiscal/documentos/identidade_frente", { arquivo: "data:image/png;base64,QUJDREVGRw==" });
    checa("arquivo que não é foto nem PDF é recusado", r.status === 400, `HTTP ${r.status}`);
    r = await eu.req("PUT", "/api/affiliate/fiscal/documentos/cnh", { arquivo: PNG });
    checa("tipo de documento desconhecido é recusado", r.status === 400, `HTTP ${r.status}`);
    for (const [tipo, arq] of [["identidade_frente", PNG], ["identidade_verso", PNG], ["comprovante_residencia", PDF], ["comprovante_cnpj", PDF]]) {
      r = await eu.req("PUT", `/api/affiliate/fiscal/documentos/${tipo}`, { arquivo: arq });
      checa(`envia ${tipo}`, r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    }
    r = await eu.req("GET", "/api/affiliate/fiscal");
    checa("completo: vai para análise", r.json?.status === "em_analise", r.json?.status);

    // Cifrado no banco.
    const cru = (await db.execute(sql`select encode(dados, 'escape') as d, cpf_impressao from afiliado_fiscal where affiliate_id = ${aff.id}`)).rows[0] as { d: string; cpf_impressao: string };
    checa("o banco não guarda o CPF em claro", !cru.d.includes(CPF) && !cru.d.includes("Fernanda") && !cru.cpf_impressao.includes(CPF));
    const doc = (await db.execute(sql`select position('%PDF'::bytea in dados) as p from afiliado_documentos where affiliate_id = ${aff.id} and tipo = 'comprovante_residencia'`)).rows[0] as { p: number };
    checa("o documento também sai cifrado", Number(doc.p) === 0);

    // CPF repetido.
    const aff2 = await afiliado(EMAILS[3], "FISCALTESTE2");
    const outro = await new Cliente().entrar(EMAILS[3], SENHA);
    r = await outro.req("PUT", "/api/affiliate/fiscal", { ...DADOS, nomeCompleto: "Outra Pessoa Qualquer" });
    checa("o mesmo CPF em outro afiliado é 409", r.status === 409, `HTTP ${r.status}`);

    // O organizador não alcança; a plataforma deixa rastro.
    for (const [nome, caminho, metodo] of [
      ["lista", "/api/admin/fiscal", "GET"],
      ["dados", `/api/admin/fiscal/${aff.id}`, "GET"],
      ["documento", `/api/admin/fiscal/${aff.id}/documentos/identidade_frente`, "GET"],
      ["decisão", `/api/admin/fiscal/${aff.id}/decidir`, "POST"],
    ]) {
      r = await orgA.req(metodo, caminho, metodo === "POST" ? { status: "aprovado" } : undefined);
      checa(`organizador: ${nome} é 403`, r.status === 403, `HTTP ${r.status}`);
    }
    r = await admin.req("GET", "/api/admin/fiscal");
    checa("a plataforma vê a fila (sem os dados)", r.json?.some((l: any) => l.affiliateId === aff.id && l.status === "em_analise" && !("dados" in l)));
    const antes = await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.entityId, aff.id), eq(auditLog.action, "fiscal.ver_dados")));
    r = await admin.req("GET", `/api/admin/fiscal/${aff.id}`);
    checa("a plataforma abre o cadastro", r.json?.dados?.cpf === CPF);
    const depois = await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.entityId, aff.id), eq(auditLog.action, "fiscal.ver_dados")));
    checa("abrir o cadastro fica na auditoria", depois.length === antes.length + 1);
    const png = await admin.bruto("GET", `/api/admin/fiscal/${aff.id}/documentos/identidade_frente`);
    const bytes = Buffer.from(await png.arrayBuffer());
    checa("o documento volta decifrado e sem cache", png.headers.get("content-type")?.startsWith("image/png") === true && bytes[1] === 0x50 && png.headers.get("cache-control") === "no-store");
    const [docAudit] = await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.entityId, aff.id), eq(auditLog.action, "fiscal.ver_documento")));
    checa("abrir o documento fica na auditoria", Boolean(docAudit));

    r = await admin.req("POST", `/api/admin/fiscal/${aff.id}/decidir`, { status: "recusado" });
    checa("recusar sem motivo é 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/fiscal/${aff.id}/decidir`, { status: "aprovado" });
    checa("a plataforma aprova", r.status === 200 && r.json?.status === "aprovado", `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/fiscal/${aff.id}/decidir`, { status: "aprovado" });
    checa("decidir de novo é 409", r.status === 409, `HTTP ${r.status}`);

    // Mudar a conta depois de aprovado volta para a análise.
    r = await eu.req("PUT", "/api/affiliate/fiscal", { ...DADOS, conta: { ...DADOS.conta, conta: "7654321-0" } });
    r = await eu.req("GET", "/api/affiliate/fiscal");
    checa("trocar a conta depois de aprovado volta para análise", r.json?.status === "em_analise", r.json?.status);

    // O saque é pago a MEI ou empresa (6.4): cadastro aprovado com CNPJ e a nota fiscal.
    r = await eu.req("PUT", "/api/affiliate/fiscal", { ...DADOS, empresa: undefined });
    checa("cadastro sem CNPJ não fecha (MEI ou empresa)", r.status === 400 && /MEI ou empresa/.test(r.json?.message ?? ""), r.json?.message);
    await comissao(A.id, aff.id, 700, 1);
    await comissao(A.id, aff.id, 300, 2);
    const NOTA = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\nNota fiscal de servico\n%%EOF\n").toString("base64")}`;
    r = await eu.req("POST", "/api/affiliate/payouts", { notaFiscal: NOTA });
    checa("em análise, o saque é 409", r.status === 409 && /MEI ou empresa/.test(r.json?.message ?? ""), `HTTP ${r.status}`);
    await admin.req("POST", `/api/admin/fiscal/${aff.id}/decidir`, { status: "aprovado" });
    r = await eu.req("POST", "/api/affiliate/payouts", {});
    checa("sem a nota fiscal, o saque é 400", r.status === 400 && /nota fiscal/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await eu.req("POST", "/api/affiliate/payouts", { notaFiscal: `data:text/html;base64,${Buffer.from("<html><script>").toString("base64")}` });
    checa("arquivo que não é nota: 400", r.status === 400, `HTTP ${r.status}`);
    r = await eu.req("POST", "/api/affiliate/payouts", { notaFiscal: NOTA });
    checa("aprovado com CNPJ e com a nota, o saque sai", r.status === 201 || r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const payoutId = r.json?.id as string;
    const notaCrua = (await db.execute(sql`select position('Nota fiscal'::bytea in dados) as p from saque_notas where payout_id = ${payoutId}`)).rows[0] as { p: number } | undefined;
    checa("a nota fica gravada, cifrada", notaCrua !== undefined && Number(notaCrua.p) === 0);
    const minhaNota = await eu.bruto("GET", `/api/affiliate/payouts/${payoutId}/nota`);
    checa("o afiliado baixa a própria nota", minhaNota.status === 200 && Buffer.from(await minhaNota.arrayBuffer()).subarray(0, 4).toString("latin1") === "%PDF");
    r = await outro.req("GET", `/api/affiliate/payouts/${payoutId}/nota`);
    checa("outro afiliado não baixa (404)", r.status === 404, `HTTP ${r.status}`);
    const notaDaA = await orgA.bruto("GET", `/api/admin/payouts/${payoutId}/nota`);
    checa("quem paga (a organização do saque) baixa a nota", notaDaA.status === 200);
    r = await orgB.req("GET", `/api/admin/payouts/${payoutId}/nota`);
    checa("a vizinha não baixa a nota (404)", r.status === 404, `HTTP ${r.status}`);

    // Baixa e recibo.
    r = await orgB.req("POST", `/api/admin/payouts/${payoutId}/paid`);
    checa("a vizinha não dá baixa (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("POST", `/api/admin/payouts/${payoutId}/paid`);
    const codigo = r.json?.recibo as string;
    checa("a baixa emite o recibo", r.status === 200 && /^R-[2-9A-HJ-NP-Z]{10}$/.test(codigo ?? ""), `HTTP ${r.status} ${codigo}`);
    r = await orgA.req("POST", `/api/admin/payouts/${payoutId}/paid`);
    checa("a segunda baixa é 409 (um recibo só)", r.status === 409, `HTTP ${r.status}`);
    const [rec] = await db.select().from(recibos).where(eq(recibos.payoutId, payoutId));
    const snap = rec.snapshot as any;
    checa("o recibo é da empresa: razão social e CNPJ, sem CPF",
      snap.beneficiario.nome === DADOS.empresa.razaoSocial && snap.beneficiario.cnpj === "11222333000181" && snap.beneficiario.cpf === null);
    checa("a origem soma o valor (R$ 10,00 em duas rifas)", snap.valorCents === 1000 && snap.origem.length === 2);

    const pdf = await orgA.bruto("GET", `/api/admin/recibos/${codigo}/pdf`);
    const cabeca = Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString("latin1");
    checa("o PDF é PDF", pdf.status === 200 && cabeca === "%PDF", `HTTP ${pdf.status}`);
    r = await orgB.req("GET", `/api/admin/recibos/${codigo}/pdf`);
    checa("o recibo da vizinha é 404", r.status === 404, `HTTP ${r.status}`);
    const meu = await eu.bruto("GET", `/api/affiliate/recibos/${codigo}/pdf`);
    checa("o afiliado baixa o próprio recibo", meu.status === 200);
    r = await outro.req("GET", `/api/affiliate/recibos/${codigo}/pdf`);
    checa("outro afiliado não baixa (404)", r.status === 404, `HTTP ${r.status}`);
    r = await eu.req("GET", "/api/affiliate/payouts");
    checa("o histórico do afiliado mostra o recibo", r.json?.some?.((p: any) => p.recibo === codigo));
    r = await orgA.req("GET", "/api/admin/saques-pagos");
    checa("os saques pagos da A trazem o recibo", r.json?.some?.((p: any) => p.recibo === codigo));
    r = await orgB.req("GET", "/api/admin/saques-pagos");
    checa("os da B não trazem", !r.json?.some?.((p: any) => p.recibo === codigo));

    // Conferência pública.
    const publico = new Cliente();
    r = await publico.req("GET", `/api/public/recibos/${codigo}`);
    checa("a conferência diz autêntico", r.status === 200 && r.json?.autentico === true && r.json?.valorCents === 1000);
    checa("a conferência não mostra CPF nem Pix", !JSON.stringify(r.json).includes(CPF) && !JSON.stringify(r.json).includes("pix.teste") && r.json?.beneficiario === "Fernanda");
    r = await publico.req("GET", `/api/public/recibos/${codigo.toLowerCase()}`);
    checa("o código vale em minúsculas", r.status === 200);
    await db.execute(sql`update recibos set snapshot = jsonb_set(snapshot, '{valorCents}', '1001') where codigo = ${codigo}`);
    r = await publico.req("GET", `/api/public/recibos/${codigo}`);
    checa("um centavo mexido no banco: não confere", r.json?.autentico === false);
    r = await publico.req("GET", "/api/public/recibos/R-2222222222");
    checa("código inexistente é 404", r.status === 404);

    // Retenção de IRRF (contador, 07/10/2026): a empresa do Lucro Presumido
    // ou Real recebe o bruto menos 1,5%; MEI e Simples, o valor cheio.
    r = await eu.req("PUT", "/api/affiliate/fiscal", { ...DADOS, empresa: { ...DADOS.empresa, tipo: "empresa" } });
    checa("empresa sem regime tributário não fecha", r.status === 400 && /regime tributário/.test(r.json?.message ?? ""), r.json?.message);
    r = await eu.req("PUT", "/api/affiliate/fiscal", { ...DADOS, empresa: { ...DADOS.empresa, tipo: "empresa", regime: "presumido_real" } });
    checa("empresa do Lucro Presumido ou Real é aceita", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    await admin.req("POST", `/api/admin/fiscal/${aff.id}/decidir`, { status: "aprovado" });
    await comissao(A.id, aff.id, 100_000, 3);
    r = await eu.req("GET", "/api/affiliate/saldo");
    const linhaA = r.json?.find?.((l: any) => l.organizacaoId === A.id);
    checa("o saldo mostra a retenção antes do saque (R$ 15,00 de R$ 1.000,00)", linhaA?.disponivelCents === 100_000 && linhaA?.irrfCents === 1_500, JSON.stringify(linhaA));
    r = await eu.req("POST", "/api/affiliate/payouts", { notaFiscal: NOTA, irrfCents: 0 });
    const saqueIrrf = r.json?.id as string;
    checa("o saque grava o bruto e o IRRF (o corpo não muda a retenção)", r.status === 201 && r.json?.amountCents === 100_000 && r.json?.irrfCents === 1_500, `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    r = await orgA.req("GET", "/api/admin/finance");
    checa("quem paga vê o IRRF a recolher", r.json?.payoutsRequested?.some?.((p: any) => p.id === saqueIrrf && p.irrfCents === 1_500));
    r = await orgA.req("POST", `/api/admin/payouts/${saqueIrrf}/paid`);
    const codigoIrrf = r.json?.recibo as string;
    checa("a baixa emite o recibo", r.status === 200 && Boolean(codigoIrrf), `HTTP ${r.status}`);
    const [recIrrf] = await db.select().from(recibos).where(eq(recibos.payoutId, saqueIrrf));
    const snapIrrf = recIrrf.snapshot as any;
    checa("o recibo leva o bruto e o IRRF retido", snapIrrf.valorCents === 100_000 && snapIrrf.irrfCents === 1_500);
    checa("o recibo sem retenção não tem o campo", !("irrfCents" in snap));
    r = await publico.req("GET", `/api/public/recibos/${codigoIrrf}`);
    checa("a conferência do recibo com IRRF diz autêntico e mostra a retenção", r.json?.autentico === true && r.json?.irrfCents === 1_500, JSON.stringify(r.json));
    const pdfIrrf = await orgA.bruto("GET", `/api/admin/recibos/${codigoIrrf}/pdf`);
    checa("o PDF do recibo com IRRF sai", pdfIrrf.status === 200 && Buffer.from(await pdfIrrf.arrayBuffer()).subarray(0, 4).toString("latin1") === "%PDF");
    void aff2;
  } finally {
    await admin.req("PUT", "/api/admin/plataforma", plataformaAntes);
    await limpar();
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
