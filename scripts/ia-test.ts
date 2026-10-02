/**
 * Prova do assistente de IA (Chatbase) pela API de verdade: nasce desligado,
 * só a plataforma configura (403 para o organizador), não liga sem o id do
 * agente nem sem o segredo no servidor, a sessão só vai ao master e — se a
 * plataforma liberar — ao organizador, o hash confere com o segredo, nada
 * pessoal sai e o segredo nunca aparece em resposta nenhuma. Devolve o
 * estado de antes no fim.
 *
 *   CHATBASE_IDENTITY_SECRET=<16+ caracteres> npm run dev   (noutro terminal, com seed)
 *   CHATBASE_IDENTITY_SECRET=<o mesmo> npm run ia
 */
import "dotenv/config";
import crypto from "node:crypto";
import { baseUrl } from "./base-url";

const URL = baseUrl();
const SEGREDO = process.env.CHATBASE_IDENTITY_SECRET?.trim() ?? "";
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
    const texto = await r.text();
    let json: any = null;
    try {
      json = JSON.parse(texto);
    } catch {
      /* não é JSON */
    }
    return { status: r.status, texto, json, cache: r.headers.get("cache-control") ?? "" };
  }
}

const AGENTE = "agente-de-teste-123";

async function main() {
  if (SEGREDO.length < 16) throw new Error("Defina CHATBASE_IDENTITY_SECRET (16+ caracteres) no servidor e aqui, com o mesmo valor.");
  const admin = new Cliente();
  const marina = new Cliente();
  const joao = new Cliente();
  const sergio = new Cliente();
  const anon = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
  r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
  if (r.status !== 200) throw new Error(`login da organizadora: HTTP ${r.status}`);
  const nomeDaOrganizacao = (await marina.req("GET", "/api/auth/me")).json?.organizacao?.nome;
  if (!nomeDaOrganizacao) throw new Error("a organizadora não tem organização na sessão");
  r = await joao.req("POST", "/api/auth/login", { email: "joao@rifa.br", password: "joao123" });
  if (r.status !== 200) throw new Error(`login do afiliado: HTTP ${r.status}`);
  r = await sergio.req("POST", "/api/auth/login", { email: "sergio@rifa.br", password: "cambista123" });
  if (r.status !== 200) throw new Error(`login do cambista: HTTP ${r.status}`);

  const antes = (await admin.req("GET", "/api/admin/ia/config")).json?.config;

  try {
    console.log("\nO assistente de IA");

    // Desligado de fábrica (ou como estava): ninguém recebe sessão.
    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: false, agenteId: "", paraOrganizador: false });
    checa("a plataforma desliga", r.status === 200 && r.json?.config?.ligado === false, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/admin/ia/sessao");
    checa("desligado, o master não recebe sessão", r.status === 200 && r.json?.ligado === false);
    r = await marina.req("GET", "/api/admin/ia/sessao");
    checa("desligado, o organizador não recebe sessão", r.status === 200 && r.json?.ligado === false);
    r = await anon.req("GET", "/api/admin/ia/sessao");
    checa("sem login: 401", r.status === 401, `HTTP ${r.status}`);

    // Só a plataforma configura.
    r = await marina.req("GET", "/api/admin/ia/config");
    checa("o organizador não lê a configuração (403)", r.status === 403, `HTTP ${r.status}`);
    r = await marina.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: AGENTE, paraOrganizador: true });
    checa("o organizador não liga o assistente (403)", r.status === 403, `HTTP ${r.status}`);

    // Recusas de preenchimento.
    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: "" });
    checa("não liga sem o id do agente", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: false, agenteId: '"><script>alert(1)</script>' });
    checa("id do agente com tag é recusado", r.status === 400, `HTTP ${r.status}`);

    // Afiliado e cambista nunca recebem sessão — nem com o assistente ligado para todos.
    // (Verificado adiante, com tudo ligado.)

    // Liga só para o master.
    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: AGENTE, paraOrganizador: false });
    checa("a plataforma liga", r.status === 200 && r.json?.config?.ligado === true && r.json?.segredoNoAmbiente === true, `HTTP ${r.status} ${r.texto.slice(0, 120)}`);
    r = await admin.req("GET", "/api/admin/ia/sessao");
    const s = r.json;
    checa("o master recebe a sessão, sem cache", r.status === 200 && s?.ligado === true && s?.agenteId === AGENTE && /no-store/.test(r.cache));
    const esperado = crypto.createHmac("sha256", SEGREDO).update(s?.userId ?? "").digest("hex");
    checa("o hash é o HMAC-SHA256 do id com o segredo", s?.userHash === esperado);
    checa("o identificador é opaco (sem e-mail nem nome)", typeof s?.userId === "string" && s.userId.startsWith("rifa-u-") && !/[@ ]/.test(s.userId));
    checa("o contexto não leva nome, e-mail nem telefone", JSON.stringify(s?.metadata) === JSON.stringify({ papel: "administrador master" }), JSON.stringify(s?.metadata));
    checa("o segredo nunca aparece na resposta", !r.texto.includes(SEGREDO));
    r = await marina.req("GET", "/api/admin/ia/sessao");
    checa("o organizador segue sem sessão enquanto não for liberado", r.status === 200 && r.json?.ligado === false && !r.texto.includes("userHash"));

    // Libera para o organizador.
    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: AGENTE, paraOrganizador: true });
    checa("a plataforma libera para o organizador", r.status === 200 && r.json?.config?.paraOrganizador === true);
    r = await marina.req("GET", "/api/admin/ia/sessao");
    const so = r.json;
    checa("o organizador recebe a sessão dele", r.status === 200 && so?.ligado === true && so?.userId !== s?.userId);
    checa("o hash dele confere", so?.userHash === crypto.createHmac("sha256", SEGREDO).update(so?.userId ?? "").digest("hex"));
    checa("o contexto dele leva só o papel e o nome da organização dele", so?.metadata?.papel === "organizador" && so?.metadata?.organizacao === nomeDaOrganizacao && Object.keys(so?.metadata ?? {}).sort().join() === "organizacao,papel", JSON.stringify(so?.metadata));
    r = await joao.req("GET", "/api/admin/ia/sessao");
    checa("o afiliado não recebe sessão (403)", r.status === 403 && !r.texto.includes("userHash"), `HTTP ${r.status}`);
    r = await sergio.req("GET", "/api/admin/ia/sessao");
    checa("o cambista não recebe sessão (403)", r.status === 403 && !r.texto.includes("userHash"), `HTTP ${r.status}`);
    r = await joao.req("GET", "/api/admin/ia/config");
    checa("o afiliado não lê a configuração (403)", r.status === 403, `HTTP ${r.status}`);
    checa("a configuração não vaza para a vitrine", !(await anon.req("GET", "/api/public/app")).texto.includes(AGENTE));

    // Desligar derruba tudo na hora.
    await admin.req("PUT", "/api/admin/ia/config", { ligado: false, agenteId: AGENTE, paraOrganizador: true });
    r = await marina.req("GET", "/api/admin/ia/sessao");
    checa("desligado de novo, o organizador perde a sessão", r.json?.ligado === false);
  } finally {
    await admin.req("PUT", "/api/admin/ia/config", antes ?? { ligado: false, agenteId: "", paraOrganizador: false });
  }
  console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
