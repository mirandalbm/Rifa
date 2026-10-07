/**
 * Prova do contrato da plataforma com a promotora, contra a API e o banco:
 * - sem contrato publicado, nada muda: a rifa publica como sempre;
 * - só a plataforma publica versão (403 para organizador); só a organização
 *   aceita (403 para a plataforma); visitante 401;
 * - com versão em vigor, a organização sem aceite não publica rifa (422) —
 *   nem pelo botão, nem pela `publishCampaign()` que o relógio usa;
 * - aceitar exige a versão em vigor (409 com outra); cinco aceites ao mesmo
 *   tempo são um aceite só, com a cópia do texto, quem aceitou e o IP em hash;
 * - o aceite de uma organização não libera a outra;
 * - versão nova pede aceite de novo, e não mexe nas rifas que já estão no ar;
 * - o mesmo texto não vira versão nova (409);
 * - a versão e o aceite guardam a impressão (SHA-256) do texto, a mesma que o
 *   Postgres calcula;
 * - a rifa publicada fica ligada à versão em vigor na publicação, e segue
 *   nela quando sai versão nova;
 * - os campos da empresa (`{{RAZAO_SOCIAL}}`, os colchetes do advogado) são
 *   preenchidos na publicação com os Dados da empresa publicados; campo sem
 *   dado ou desconhecido não publica (422); a prévia é só da plataforma; e a
 *   tela avisa quando os dados mudam depois da versão.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { baseUrl } from "./base-url";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { publishCampaign } from "../server/services/campaigns";
import {
  appSettings,
  templateVersoes,
  auditLog,
  campaignMedia,
  campaigns,
  contratoPromotoraAceites,
  contratosPromotora,
  organizations,
  users,
} from "../shared/schema";

const URL = baseUrl();
const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
async function contratoDaRifa(id: string) {
  const [c] = await db.select({ c: campaigns.contratoPromotoraId }).from(campaigns).where(eq(campaigns.id, id));
  return c?.c ?? null;
}
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

const SLUGS = ["contrato-teste-a", "contrato-teste-b"];
const EMAILS = ["contrato-org-a@teste.rifa", "contrato-org-b@teste.rifa"];
const SENHA = "senha-contrato-1";
const DIA = 86_400_000;
const TEXTO_1 = `CONTRATO DE TESTE — versão da prova\n\n${"Cláusula de teste. ".repeat(20).trim()}`;
const TEXTO_2 = `${TEXTO_1}\n\nCláusula nova: ação de regresso.`;

async function limpar(contratosDaProva: string[]) {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const cs = (await db.select({ id: campaigns.id }).from(campaigns).where(inArray(campaigns.organizationId, ids))).map((c) => c.id);
    if (cs.length) {
      const l = sql.raw(`('${cs.join("','")}')`);
      await db.execute(sql`delete from draws where campaign_id in ${l}`);
      await db.execute(sql`delete from campaign_stats where campaign_id in ${l}`);
    }
    await db.delete(campaigns).where(inArray(campaigns.organizationId, ids));
    await db.delete(contratoPromotoraAceites).where(inArray(contratoPromotoraAceites.organizationId, ids));
  }
  if (contratosDaProva.length) {
    await db.delete(contratoPromotoraAceites).where(inArray(contratoPromotoraAceites.contratoId, contratosDaProva));
    await db.delete(contratosPromotora).where(inArray(contratosPromotora.id, contratosDaProva));
  }
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from rate_events where bucket like 'login:%'`);
}

async function rascunho(orgId: string, sufixo: string) {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug: `contrato-teste-${sufixo}`,
      title: `Rifa ${sufixo}`,
      prizeTitle: `Prêmio ${sufixo}`,
      totalQuotas: 1000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status: "draft",
      drawAt: new Date(Date.now() + 20 * DIA),
      authorizationCode: `SPA-CT-${sufixo}`,
      authorizationFileKey: "certificado-teste",
      metodoApuracao: "federal_direta",
    })
    .returning();
  await db.insert(campaignMedia).values([
    { campaignId: c.id, role: "banner", storageKey: `ct-b-${sufixo}`, mime: "image/webp", status: "ready" },
    { campaignId: c.id, role: "photo", storageKey: `ct-f-${sufixo}`, mime: "image/webp", status: "ready", position: 1 },
  ]);
  return c;
}

const status = async (id: string) => (await db.select({ s: campaigns.status }).from(campaigns).where(eq(campaigns.id, id)))[0]?.s;

async function main() {
  console.log("\n=== contrato da plataforma com a promotora ===\n");
  // A prova só apaga as versões que ela mesma criou; as que existiam ficam.
  const antes = (await db.select({ id: contratosPromotora.id }).from(contratosPromotora)).map((c) => c.id);
  const daProva = async () =>
    (await db.select({ id: contratosPromotora.id }).from(contratosPromotora).where(antes.length ? notInArray(contratosPromotora.id, antes) : sql`true`)).map((c) => c.id);
  await limpar([]);

  const orgs: { id: string }[] = [];
  const clientes: Cliente[] = [];
  const userIds: string[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db
      .insert(organizations)
      .values({ slug, name: `Contrato ${i ? "B" : "A"}`, cidade: "Natal", uf: "RN", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date(), sociosDeclaradosEm: new Date() })
      .returning();
    const [u] = await db
      .insert(users)
      .values({ role: "organizer", organizationId: o.id, name: `Org ${i ? "B" : "A"}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) })
      .returning({ id: users.id });
    orgs.push(o);
    userIds.push(u.id);
    const c = new Cliente();
    const l = await c.req("POST", "/api/auth/login", { email: EMAILS[i], password: SENHA });
    if (l.status !== 200) throw new Error(`login da organização ${i}: HTTP ${l.status}`);
    clientes.push(c);
  }
  const [orgA, orgB] = clientes;
  const plataforma = new Cliente();
  const lp = await plataforma.req("POST", "/api/auth/login", {
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br",
    password: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
  });
  if (lp.status !== 200) throw new Error(`login da plataforma: HTTP ${lp.status}`);

  try {
    const semContrato = antes.length === 0;
    // ------------------------------------------------ sem contrato
    if (semContrato) {
      const a1 = await rascunho(orgs[0].id, "a1");
      const r = await orgA.req("POST", `/api/admin/campaigns/${a1.id}/publish`);
      checa("sem contrato publicado, a rifa publica como sempre", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      checa("…e fica sem contrato ligado", (await contratoDaRifa(a1.id)) === null);
      const g = await orgA.req("GET", "/api/admin/contrato-promotora");
      checa("a organização vê que não há contrato, sem pendência", g.status === 200 && g.json?.contrato === null && g.json?.pendente === false);
    } else {
      console.log("  (já há contrato no banco: a parte 'sem contrato' fica de fora)");
    }

    // ------------------------------------------------ quem pode o quê
    let r = await orgA.req("POST", "/api/admin/contrato-promotora", { texto: TEXTO_1 });
    checa("organizador não publica versão (403)", r.status === 403, `HTTP ${r.status}`);
    r = await new Cliente().req("POST", "/api/admin/contrato-promotora", { texto: TEXTO_1 });
    checa("visitante não publica versão (401)", r.status === 401, `HTTP ${r.status}`);
    r = await new Cliente().req("GET", "/api/admin/contrato-promotora");
    checa("visitante não lê (401)", r.status === 401, `HTTP ${r.status}`);
    r = await plataforma.req("POST", "/api/admin/contrato-promotora", { texto: "curto demais" });
    checa("texto curto: 400", r.status === 400, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    // ------------------------------------------------ versão em vigor
    r = await plataforma.req("POST", "/api/admin/contrato-promotora", { texto: TEXTO_1 });
    const v1 = r.json?.versao as number;
    checa("a plataforma publica a versão", r.status === 201 && Number.isInteger(v1), `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    r = await plataforma.req("POST", "/api/admin/contrato-promotora", { texto: `  ${TEXTO_1}  ` });
    checa("o mesmo texto não vira versão nova (409)", r.status === 409, `HTTP ${r.status}`);
    r = await plataforma.req("POST", "/api/admin/contrato-promotora/aceite", { versao: v1 });
    checa("a plataforma não aceita (403)", r.status === 403, `HTTP ${r.status}`);

    const a2 = await rascunho(orgs[0].id, "a2");
    r = await orgA.req("POST", `/api/admin/campaigns/${a2.id}/publish`);
    checa(
      "sem o aceite, a organização não publica (422, com o motivo)",
      r.status === 422 && /Aceite o contrato/.test(r.json?.message ?? ""),
      `HTTP ${r.status} ${r.json?.message ?? ""}`,
    );
    checa("a rifa continua rascunho", (await status(a2.id)) === "draft");
    let erroDoRelogio = "";
    try {
      await publishCampaign(a2.id);
    } catch (e) {
      erroDoRelogio = (e as Error).message;
    }
    checa("o caminho do relógio (publishCampaign) também barra", /Aceite o contrato/.test(erroDoRelogio), erroDoRelogio);

    const g = await orgA.req("GET", "/api/admin/contrato-promotora");
    checa("a organização lê o texto em vigor e vê a pendência", g.json?.contrato?.versao === v1 && g.json?.contrato?.texto === TEXTO_1 && g.json?.pendente === true);
    checa("…com a impressão (SHA-256) da versão", g.json?.contrato?.hash === sha256(TEXTO_1), g.json?.contrato?.hash);
    const [cv1] = await db.select().from(contratosPromotora).where(eq(contratosPromotora.versao, v1));
    const pg = await db.execute(sql`select encode(sha256(convert_to(texto, 'UTF8')), 'hex') as h from contratos_promotora where id = ${cv1.id}`);
    checa(
      "a versão guarda a impressão, igual à que o Postgres calcula",
      cv1.textoSha256 === sha256(TEXTO_1) && (pg.rows[0] as { h: string }).h === cv1.textoSha256,
      cv1.textoSha256 ?? "nula",
    );

    // ------------------------------------------------ aceitar
    r = await orgA.req("POST", "/api/admin/contrato-promotora/aceite", { versao: v1 + 7 });
    checa("aceitar outra versão: 409", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await orgA.req("POST", "/api/admin/contrato-promotora/aceite", {});
    checa("aceitar sem dizer a versão: 400", r.status === 400, `HTTP ${r.status}`);
    const cinco = await Promise.all(Array.from({ length: 5 }, () => orgA.req("POST", "/api/admin/contrato-promotora/aceite", { versao: v1 })));
    checa("cinco aceites ao mesmo tempo respondem 200", cinco.every((x) => x.status === 200), cinco.map((x) => x.status).join(","));
    const aceites = await db
      .select()
      .from(contratoPromotoraAceites)
      .where(eq(contratoPromotoraAceites.organizationId, orgs[0].id));
    checa("…e viram um aceite só", aceites.length === 1, `${aceites.length}`);
    checa(
      "o aceite guarda a cópia do texto, a versão, quem aceitou e o IP em hash",
      aceites[0]?.texto === TEXTO_1 && aceites[0]?.versao === v1 && aceites[0]?.userId === userIds[0] && /^[0-9a-f]{32}$/.test(aceites[0]?.ipHash ?? ""),
    );
    checa("o aceite guarda a impressão (SHA-256) do texto aceito", aceites[0]?.textoSha256 === sha256(TEXTO_1), aceites[0]?.textoSha256 ?? "nula");
    const gAceito = await orgA.req("GET", "/api/admin/contrato-promotora");
    checa("a organização vê a impressão do que aceitou", gAceito.json?.ultimoAceite?.hash === sha256(TEXTO_1));
    const trilha = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.action, "contrato_promotora.aceite"), eq(auditLog.entityId, orgs[0].id)));
    checa("a auditoria registra o aceite uma vez", trilha.length === 1, `${trilha.length}`);

    r = await orgA.req("POST", `/api/admin/campaigns/${a2.id}/publish`);
    checa("com o aceite, a organização publica", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("a rifa publicada fica ligada à versão em vigor", (await contratoDaRifa(a2.id)) === cv1.id);
    const [publicou] = await db
      .select({ diff: auditLog.diff })
      .from(auditLog)
      .where(and(eq(auditLog.action, "campaign.publish"), eq(auditLog.entityId, a2.id)));
    checa("a auditoria da publicação diz a versão", (publicou?.diff as { contratoPromotoraId?: string } | undefined)?.contratoPromotoraId === cv1.id);

    const b1 = await rascunho(orgs[1].id, "b1");
    r = await orgB.req("POST", `/api/admin/campaigns/${b1.id}/publish`);
    checa("o aceite da A não libera a B (422)", r.status === 422, `HTTP ${r.status}`);
    const gB = await orgB.req("GET", "/api/admin/contrato-promotora");
    checa("a B vê só o aceite dela (nenhum)", gB.json?.ultimoAceite === null && gB.json?.pendente === true);

    // ------------------------------------------------ versão nova
    r = await plataforma.req("POST", "/api/admin/contrato-promotora", { texto: TEXTO_2 });
    const v2 = r.json?.versao as number;
    checa("a plataforma publica a versão seguinte", r.status === 201 && v2 === v1 + 1, `HTTP ${r.status} v${v2}`);
    const a3 = await rascunho(orgs[0].id, "a3");
    r = await orgA.req("POST", `/api/admin/campaigns/${a3.id}/publish`);
    checa("versão nova pede aceite de novo (422)", r.status === 422 && new RegExp(`versão ${v2}`).test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("a rifa que já estava no ar segue no ar", (await status(a2.id)) === "published");
    r = await orgA.req("POST", "/api/admin/contrato-promotora/aceite", { versao: v1 });
    checa("aceitar a versão antiga: 409", r.status === 409, `HTTP ${r.status}`);
    r = await orgA.req("POST", "/api/admin/contrato-promotora/aceite", { versao: v2 });
    checa("aceitar a nova: 200", r.status === 200, `HTTP ${r.status}`);
    r = await orgA.req("POST", `/api/admin/campaigns/${a3.id}/publish`);
    checa("e publicar de novo", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const [cv2] = await db.select({ id: contratosPromotora.id }).from(contratosPromotora).where(eq(contratosPromotora.versao, v2));
    checa(
      "a rifa nova fica na versão nova; a de antes segue na dela",
      (await contratoDaRifa(a3.id)) === cv2.id && (await contratoDaRifa(a2.id)) === cv1.id,
    );

    const p = await plataforma.req("GET", "/api/admin/contrato-promotora");
    const linha = (p.json?.versoes ?? []).find((x: { versao: number }) => x.versao === v2);
    checa("a plataforma vê as versões e quantas aceitaram", p.status === 200 && linha?.aceites === 1 && typeof p.json?.organizacoesAtivas === "number", JSON.stringify(linha));
    const publicacoes = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.action, "contrato_promotora.publicar"));
    checa("a auditoria registra as publicações de versão", publicacoes.length >= 2, `${publicacoes.length}`);

    // ------------------------------------------------ campos da empresa
    // O template publicado ganha dados de empresa de teste; o de antes volta no fim.
    const versoesDoTemplate = (await db.select({ id: templateVersoes.id }).from(templateVersoes)).map((v) => v.id);
    const [rascunhoDoTemplate] = await db.select().from(appSettings).where(eq(appSettings.key, "template.rascunho"));
    const publicarEmpresa = async (legal: Record<string, string>) => {
      const t = await plataforma.req("GET", "/api/admin/template");
      await plataforma.req("PUT", "/api/admin/template/rascunho", { ...t.json.rascunho, legal });
      return plataforma.req("POST", "/api/admin/template/publicar");
    };
    const MODELO =
      `TERMO DE TESTE. Entre a Plataforma [RAZÃO SOCIAL DA PLATAFORMA], inscrita no CNPJ sob o nº [00.000.000/0001-00] ` +
      `("Plataforma"), com sede em {{ENDERECO}}, e a Promotora.\n\n${"Cláusula de teste dos campos. ".repeat(10).trim()}`;
    const EMPRESA = { razaoSocial: "Prova Contrato Tecnologia Ltda", cnpj: "11222333000181", endereco: "Rua da Prova, 10 - Recife/PE", contato: "", encarregadoNome: "", encarregadoContato: "" };
    try {
      r = await orgA.req("POST", "/api/admin/contrato-promotora/previa", { texto: MODELO });
      checa("a prévia é só da plataforma (403)", r.status === 403, `HTTP ${r.status}`);
      r = await plataforma.req("POST", "/api/admin/contrato-promotora", { texto: `${MODELO}\nSócio: [NOME DO SÓCIO].` });
      checa("campo que a plataforma não conhece não publica (422)", r.status === 422 && /NOME DO SÓCIO/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);

      r = await publicarEmpresa({ ...EMPRESA, cnpj: "" });
      checa("(template com a empresa sem CNPJ publicado)", r.status === 201, `HTTP ${r.status}`);
      r = await plataforma.req("POST", "/api/admin/contrato-promotora", { texto: MODELO });
      checa("campo sem dado na empresa não publica (422, diz qual)", r.status === 422 && /CNPJ/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);

      r = await publicarEmpresa(EMPRESA);
      const preenchido =
        `TERMO DE TESTE. Entre a Plataforma Prova Contrato Tecnologia Ltda, inscrita no CNPJ sob o nº 11.222.333/0001-81 ` +
        `("Plataforma"), com sede em Rua da Prova, 10 - Recife/PE, e a Promotora.\n\n${"Cláusula de teste dos campos. ".repeat(10).trim()}`;
      r = await plataforma.req("POST", "/api/admin/contrato-promotora/previa", { texto: MODELO });
      checa(
        "a prévia mostra o texto preenchido, sem problema, com a impressão que terá",
        r.status === 200 && r.json?.texto === preenchido && r.json?.problema === null && r.json?.hash === sha256(preenchido),
        JSON.stringify(r.json?.problema ?? r.json?.texto?.slice(0, 80)),
      );
      r = await plataforma.req("POST", "/api/admin/contrato-promotora", { texto: MODELO });
      const v3 = r.json?.versao as number;
      checa("com os dados da empresa, publica", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      const [cv3] = await db.select().from(contratosPromotora).where(eq(contratosPromotora.versao, v3));
      checa(
        "a versão guarda o texto preenchido (o que se aceita), o modelo e a impressão do preenchido",
        cv3?.texto === preenchido && cv3?.modelo === MODELO && cv3?.textoSha256 === sha256(preenchido),
      );
      const gOrg = await orgA.req("GET", "/api/admin/contrato-promotora");
      checa("a organização lê o texto já preenchido", gOrg.json?.contrato?.texto === preenchido && !/\[|\{\{/.test(gOrg.json?.contrato?.texto ?? "["));
      let gPlat = await plataforma.req("GET", "/api/admin/contrato-promotora");
      checa("com os mesmos dados, a versão não está desatualizada", gPlat.json?.contrato?.desatualizado === false);
      r = await publicarEmpresa({ ...EMPRESA, endereco: "Avenida Nova, 99 - Recife/PE" });
      // O template publicado fica 30 s na memória do servidor: a leitura espera a troca.
      for (let i = 0; i < 40; i++) {
        gPlat = await plataforma.req("GET", "/api/admin/contrato-promotora");
        if (gPlat.json?.contrato?.desatualizado) break;
        await new Promise((ok) => setTimeout(ok, 1000));
      }
      checa("a empresa mudou depois da versão: a tela avisa (desatualizado)", gPlat.json?.contrato?.desatualizado === true);
      const [cv3depois] = await db.select({ t: contratosPromotora.texto }).from(contratosPromotora).where(eq(contratosPromotora.versao, v3));
      checa("…e o texto aceito da versão não muda", cv3depois?.t === preenchido);
    } finally {
      await db.delete(templateVersoes).where(versoesDoTemplate.length ? notInArray(templateVersoes.id, versoesDoTemplate) : sql`true`);
      if (rascunhoDoTemplate) await db.update(appSettings).set({ value: rascunhoDoTemplate.value }).where(eq(appSettings.key, "template.rascunho"));
      else await db.delete(appSettings).where(eq(appSettings.key, "template.rascunho"));
    }
  } finally {
    await limpar(await daProva());
  }

  console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
