/**
 * Prova do construtor de templates, pela API de verdade: só o administrador
 * geral mexe; rascunho não vai ao ar; publicar vai; voltar publica a versão
 * antiga como nova; cor que some no fundo é recusada; a logo é servida
 * reprocessada. Devolve o estado de antes no fim.
 *
 *   npm run aparencia      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { appSettings, plataformaArquivos, templateVersoes } from "../shared/schema";
import { TEMPLATE_PADRAO } from "../shared/template";

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
    return { status: r.status, tipo, json: tipo.includes("json") ? await r.json() : null };
  }
}

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main() {
  console.log("\n=== construtor de templates ===\n");

  // Guarda o estado de antes, para devolver no fim.
  const versoesAntes = (await db.select({ id: templateVersoes.id }).from(templateVersoes)).map((v) => v.id);
  const [rascunhoAntes] = await db.select().from(appSettings).where(eq(appSettings.key, "template.rascunho"));
  const [logoAntes] = await db.select().from(plataformaArquivos).where(eq(plataformaArquivos.chave, "logo"));

  try {
    const anon = new Cliente();
    const r0 = await anon.req("GET", "/api/public/template");
    checa("o template publicado é público", r0.status === 200 && typeof r0.json?.template?.identidade?.nome === "string");
    const nomeNoAr = r0.json.template.identidade.nome;

    const marina = new Cliente();
    await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
    let r = await marina.req("PUT", "/api/admin/template/rascunho", TEMPLATE_PADRAO);
    checa("organizador não mexe na aparência da plataforma (403)", r.status === 403, `HTTP ${r.status}`);

    const admin = new Cliente();
    r = await admin.req("POST", "/api/auth/login", {
      email: process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br",
      password: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
    });
    if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status} ${r.json?.message ?? ""}`);

    const roxo = {
      ...TEMPLATE_PADRAO,
      identidade: { ...TEMPLATE_PADRAO.identidade, nome: "Rifa Roxa", cor: { claro: "#6d28d9", escuro: "#c4b5fd" }, fonte: "poppins", raio: "redondo" },
      textos: { ...TEMPLATE_PADRAO.textos, rodape: "CNPJ 00.000.000/0001-00" },
    };
    r = await admin.req("PUT", "/api/admin/template/rascunho", {
      ...roxo,
      identidade: { ...roxo.identidade, cor: { claro: "#fff59d", escuro: "#c4b5fd" } },
    });
    checa("cor que some no fundo claro: recusa com o motivo", r.status === 400 && /contraste/.test(r.json?.message ?? ""), r.json?.message);

    r = await admin.req("PUT", "/api/admin/template/rascunho", {
      ...roxo,
      blocos: roxo.blocos.map((b) => (b.tipo === "rifas" ? { ...b, ligado: false } : b)),
    });
    checa("desligar o feed de rifas: recusa", r.status === 400, r.json?.message);

    r = await admin.req("PUT", "/api/admin/template/rascunho", { ...roxo, extra: "<script>" });
    checa("salva o rascunho (sem guardar chave estranha)", r.status === 200 && r.json?.extra === undefined, `HTTP ${r.status}`);

    r = await anon.req("GET", "/api/public/template");
    checa("rascunho não vai ao ar", r.json?.template?.identidade?.nome === nomeNoAr, r.json?.template?.identidade?.nome);
    r = await admin.req("GET", "/api/admin/template/previa");
    checa("a pré-visualização mostra o rascunho", r.json?.template?.identidade?.nome === "Rifa Roxa");
    r = await marina.req("GET", "/api/admin/template/previa");
    checa("e o organizador não vê o rascunho (403)", r.status === 403, `HTTP ${r.status}`);

    r = await admin.req("POST", "/api/admin/template/publicar");
    const versaoRoxa = r.json?.id;
    checa("publica", r.status === 201 && Boolean(versaoRoxa));
    r = await anon.req("GET", "/api/public/template");
    checa("depois de publicar, a plataforma toda vê", r.json?.template?.identidade?.nome === "Rifa Roxa" && r.json?.versao === versaoRoxa);

    await admin.req("PUT", "/api/admin/template/rascunho", { ...roxo, identidade: { ...roxo.identidade, nome: "Rifa Verde" } });
    await admin.req("POST", "/api/admin/template/publicar");
    r = await anon.req("GET", "/api/public/template");
    checa("segunda publicação no ar", r.json?.template?.identidade?.nome === "Rifa Verde");

    r = await admin.req("POST", `/api/admin/template/versoes/${versaoRoxa}/restaurar`);
    checa("voltar para uma versão é um clique", r.status === 201 && r.json?.restauradaDe === versaoRoxa);
    r = await anon.req("GET", "/api/public/template");
    checa("e a antiga volta ao ar como versão nova", r.json?.template?.identidade?.nome === "Rifa Roxa" && r.json?.versao !== versaoRoxa);
    r = await admin.req("GET", "/api/admin/template");
    checa("o histórico guarda as três publicações", (r.json?.versoes?.length ?? 0) >= Math.min(20, versoesAntes.length + 3));
    checa("e o rascunho acompanhou a restauração", r.json?.rascunho?.identidade?.nome === "Rifa Roxa");

    r = await admin.req("PUT", "/api/admin/template/logo", { dataUrl: "data:text/html;base64,PHNjcmlwdD4=" });
    checa("logo que não é imagem: recusa", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/template/logo", { dataUrl: PNG });
    const logo = r.json?.identidade?.logo as string | undefined;
    checa("logo entra no rascunho", r.status === 200 && Boolean(logo?.startsWith("/api/public/marca/logo")), logo);
    const arq = await anon.req("GET", logo ?? "/api/public/marca/logo");
    checa("e é servida reprocessada em WebP", arq.status === 200 && arq.tipo.startsWith("image/webp"), arq.tipo);
  } finally {
    // Devolve o estado de antes.
    await db.delete(templateVersoes).where(
      versoesAntes.length ? notInArray(templateVersoes.id, versoesAntes) : sql`true`,
    );
    if (rascunhoAntes) {
      await db.update(appSettings).set({ value: rascunhoAntes.value }).where(eq(appSettings.key, "template.rascunho"));
    } else {
      await db.delete(appSettings).where(eq(appSettings.key, "template.rascunho"));
    }
    if (logoAntes) {
      await db.update(plataformaArquivos).set({ bytes: logoAntes.bytes, mime: logoAntes.mime }).where(eq(plataformaArquivos.chave, "logo"));
    } else {
      await db.delete(plataformaArquivos).where(inArray(plataformaArquivos.chave, ["logo"]));
    }
  }

  console.log(falhas === 0 ? "\n  tudo certo\n" : `\n  ${falhas} verificação(ões) falharam\n`);
  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
