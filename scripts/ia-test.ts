/**
 * Prova do assistente de IA pela API de verdade, com um Chatbase de mentira
 * escutando em `CHATBASE_API_URL` (só fora de produção o servidor aceita
 * trocar o endereço). Confere:
 *
 * - nasce desligado; só a plataforma configura (403 para o organizador); não
 *   liga sem a chave do Chatbase no servidor;
 * - quem conversa: o master com a IA ligada; organizador e afiliado só com o
 *   interruptor de cada um; cambista e visitante nunca;
 * - a conversa passa pelo servidor: a chave só no cabeçalho, o id do usuário
 *   opaco, a conversa continua e recomeça ("Nova conversa");
 * - o uso é gravado por mensagem, com o titular certo (plataforma,
 *   organização, afiliado) e sem contar duas vezes;
 * - telefone, CPF e e-mail de cliente são barrados antes de sair;
 * - cada pessoa só vê a própria conversa; créditos esgotados do Chatbase
 *   viram aviso, sem uso gravado.
 *
 * Devolve a configuração de antes e apaga o que criou.
 *
 *   CHATBASE_API_KEY=… CHATBASE_API_URL=http://127.0.0.1:5099/api/v2 npm run dev   (noutro terminal, com seed)
 *   CHATBASE_API_KEY=<a mesma> CHATBASE_API_URL=<o mesmo> npm run ia
 */
import "dotenv/config";
import http from "node:http";
import { eq, inArray, like } from "drizzle-orm";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import { affiliates, iaConversas, iaUso, rateEvents, users } from "../shared/schema";

const URL_DO_SITE = baseUrl();
const CHAVE = process.env.CHATBASE_API_KEY?.trim() ?? "";
const FALSO = process.env.CHATBASE_API_URL?.trim() ?? "";
const AGENTE = "agente-de-teste-123";
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

class Cliente {
  cookie = "";
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL_DO_SITE + caminho, {
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

/* ---------------- o Chatbase de mentira ---------------- */

interface Recebido {
  metodo: string;
  caminho: string;
  auth: string;
  corpo: any;
}
const recebidos: Recebido[] = [];
const conversas = new Map<string, { id: string; role: string; parts: unknown[]; createdAt: number }[]>();
let seq = 0;

function subirFalso(): Promise<http.Server> {
  const alvo = new URL(FALSO);
  const prefixo = alvo.pathname.replace(/\/+$/, "");
  const servidor = http.createServer((req, res) => {
    let bruto = "";
    req.on("data", (c) => (bruto += c));
    req.on("end", () => {
      const caminho = (req.url ?? "").replace(prefixo, "");
      const corpo = bruto ? JSON.parse(bruto) : null;
      recebidos.push({ metodo: req.method ?? "", caminho, auth: String(req.headers.authorization ?? ""), corpo });
      const responder = (status: number, j: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(j));
      };
      if (req.headers.authorization !== `Bearer ${CHAVE}`) return responder(401, { error: { code: "AUTH_INVALID" } });
      const chat = caminho.match(/^\/agents\/([^/]+)\/chat$/);
      if (req.method === "POST" && chat) {
        if (String(corpo?.message ?? "").includes("sem-credito")) return responder(402, { error: { code: "CHAT_CREDITS_EXHAUSTED" } });
        seq++;
        const conv = corpo?.conversationId ?? `conv_${seq}`;
        const lista = conversas.get(conv) ?? [];
        const agora = Math.floor(Date.now() / 1000);
        lista.push({ id: `u_${seq}`, role: "user", parts: [{ type: "text", text: corpo.message }], createdAt: agora });
        const id = `msg_${seq}`;
        const resposta = { id, role: "assistant", parts: [{ type: "text", text: `resposta ${seq}: ${corpo.message}` }], createdAt: agora };
        lista.push(resposta);
        conversas.set(conv, lista);
        return responder(200, {
          data: { ...resposta, metadata: { userMessageId: `u_${seq}`, conversationId: conv, userId: corpo.userId, finishReason: "stop", usage: { credits: 2 } } },
        });
      }
      const msgs = caminho.match(/^\/agents\/([^/]+)\/conversations\/([^/?]+)\/messages/);
      if (req.method === "GET" && msgs) return responder(200, { data: conversas.get(decodeURIComponent(msgs[2])) ?? [], pagination: { hasMore: false } });
      responder(404, { error: { code: "NOT_FOUND" } });
    });
  });
  return new Promise((ok) => servidor.listen(Number(alvo.port), alvo.hostname, () => ok(servidor)));
}

async function main() {
  if (CHAVE.length < 8 || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(FALSO)) {
    throw new Error("Defina CHATBASE_API_KEY (8+ caracteres) e CHATBASE_API_URL=http://127.0.0.1:<porta>/api/v2, com os mesmos valores no servidor.");
  }
  const falso = await subirFalso();

  const admin = new Cliente();
  const marina = new Cliente();
  const joao = new Cliente();
  const sergio = new Cliente();
  const anon = new Cliente();
  const entrar = async (c: Cliente, email: string, password: string) => {
    const r = await c.req("POST", "/api/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`login de ${email}: HTTP ${r.status}`);
  };
  await entrar(admin, "admin@rifa.br", "admin123");
  await entrar(marina, "marina@rifassaojose.br", "organizador123");
  await entrar(joao, "joao@rifa.br", "joao123");
  await entrar(sergio, "sergio@rifa.br", "cambista123");

  const [uAdmin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@rifa.br"));
  const [uMarina] = await db.select({ id: users.id, org: users.organizationId }).from(users).where(eq(users.email, "marina@rifassaojose.br"));
  const [uJoao] = await db.select({ id: users.id }).from(users).where(eq(users.email, "joao@rifa.br"));
  const [afJoao] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.userId, uJoao.id));
  const ids = [uAdmin.id, uMarina.id, uJoao.id];
  const limpar = async () => {
    await db.delete(iaUso).where(inArray(iaUso.userId, ids));
    await db.delete(iaConversas).where(inArray(iaConversas.userId, ids));
    await db.delete(rateEvents).where(like(rateEvents.bucket, "ia:%"));
  };
  await limpar();

  const antes = (await admin.req("GET", "/api/admin/ia/config")).json?.config;
  const usoDe = async (userId: string) => db.select().from(iaUso).where(eq(iaUso.userId, userId));

  try {
    console.log("\nO assistente de IA");
    let r = await admin.req("PUT", "/api/admin/ia/config", { ligado: false, agenteId: "", paraOrganizador: false, paraAfiliado: false });
    checa("a plataforma desliga", r.status === 200 && r.json?.config?.ligado === false, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/ia/sessao");
    checa("desligado, o master não tem assistente", r.status === 200 && r.json?.ligado === false && /no-store/.test(r.cache));
    const antesDeTudo = recebidos.length;
    r = await admin.req("POST", "/api/ia/mensagens", { texto: "oi" });
    checa("desligado, mandar mensagem é 404 e nada sai para o Chatbase", r.status === 404 && recebidos.length === antesDeTudo, `HTTP ${r.status}`);
    r = await anon.req("GET", "/api/ia/sessao");
    checa("sem login: 401", r.status === 401, `HTTP ${r.status}`);
    r = await sergio.req("GET", "/api/ia/sessao");
    checa("o cambista não tem assistente (403)", r.status === 403, `HTTP ${r.status}`);

    r = await marina.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: AGENTE, paraOrganizador: true });
    checa("o organizador não liga o assistente (403)", r.status === 403, `HTTP ${r.status}`);
    r = await joao.req("GET", "/api/admin/ia/config");
    checa("o afiliado não lê a configuração (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: "" });
    checa("não liga sem o id do agente", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: false, agenteId: "../../outra-rota" });
    checa("id do agente fora do formato é recusado", r.status === 400, `HTTP ${r.status}`);

    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: AGENTE, paraOrganizador: false, paraAfiliado: false });
    checa("a plataforma liga só para o master", r.status === 200 && r.json?.config?.ligado === true && r.json?.chaveNoAmbiente === true, r.texto.slice(0, 120));
    checa("a chave nunca aparece na resposta", !r.texto.includes(CHAVE));
    r = await admin.req("GET", "/api/ia/sessao");
    checa("o master tem assistente", r.json?.ligado === true);
    r = await marina.req("GET", "/api/ia/sessao");
    checa("o organizador ainda não", r.json?.ligado === false);
    r = await joao.req("GET", "/api/ia/sessao");
    checa("o afiliado ainda não", r.json?.ligado === false);
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "oi" });
    checa("o organizador não conversa sem a liberação (404)", r.status === 404, `HTTP ${r.status}`);

    console.log("\nA conversa passa pelo servidor");
    let n = recebidos.length;
    r = await admin.req("POST", "/api/ia/mensagens", { texto: "Como lanço uma rifa?" });
    const primeira = recebidos[n];
    checa("a resposta volta ao painel", r.status === 200 && /resposta \d+: Como lanço uma rifa\?/.test(r.json?.mensagem?.texto ?? "") && r.json?.creditos === 2, r.texto.slice(0, 120));
    checa("o servidor falou com o agente certo, chave só no cabeçalho", primeira?.caminho === `/agents/${AGENTE}/chat` && primeira?.auth === `Bearer ${CHAVE}`);
    checa("o id que vai ao Chatbase é opaco", primeira?.corpo?.userId === `rifa-u-${uAdmin.id}` && !JSON.stringify(primeira?.corpo).includes("admin@rifa.br"));
    checa("a primeira mensagem começa uma conversa", primeira?.corpo?.conversationId === undefined);
    n = recebidos.length;
    r = await admin.req("POST", "/api/ia/mensagens", { texto: "E para publicar?" });
    const segunda = recebidos[n];
    checa("a segunda continua a mesma conversa", r.status === 200 && typeof segunda?.corpo?.conversationId === "string");
    let uso = await usoDe(uAdmin.id);
    checa("o uso é gravado por mensagem, como da plataforma", uso.length === 2 && uso.every((u) => u.titularTipo === "plataforma" && u.titularId === null) && uso.reduce((s, u) => s + u.creditos, 0) === 4, JSON.stringify(uso.map((u) => [u.titularTipo, u.creditos])));
    r = await admin.req("GET", "/api/ia/conversa");
    const hist = r.json?.mensagens ?? [];
    checa("o histórico vem do Chatbase, na ordem", r.status === 200 && hist.length === 4 && hist[0].papel === "voce" && hist[1].papel === "assistente" && hist[2].texto === "E para publicar?", JSON.stringify(hist.map((m: any) => m.papel)));

    n = recebidos.length;
    for (const t of ["o cliente 11 98765-4321 pagou?", "CPF 123.456.789-09", "mande para ana@exemplo.com"]) {
      r = await admin.req("POST", "/api/ia/mensagens", { texto: t });
      checa(`dado pessoal barrado antes de sair: "${t.slice(0, 24)}…"`, r.status === 422 && /telefone, CPF ou e-mail/.test(r.json?.message ?? ""), `HTTP ${r.status}`);
    }
    r = await admin.req("POST", "/api/ia/mensagens", { texto: "o pedido 48291734 foi pago?" });
    checa("o código do pedido passa", r.status === 200, `HTTP ${r.status}`);
    checa("nenhum dado pessoal chegou ao Chatbase", recebidos.slice(n).every((x) => !/98765|123\.456|ana@/.test(JSON.stringify(x.corpo))));
    r = await admin.req("POST", "/api/ia/mensagens", { texto: "a".repeat(2001) });
    checa("mensagem longa demais é recusada", r.status === 422, `HTTP ${r.status}`);

    r = await admin.req("DELETE", "/api/ia/conversa");
    checa("nova conversa", r.status === 204, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/ia/conversa");
    checa("…começa vazia", r.json?.mensagens?.length === 0);
    n = recebidos.length;
    await admin.req("POST", "/api/ia/mensagens", { texto: "recomeçando" });
    checa("…e a próxima mensagem abre outra conversa no Chatbase", recebidos[n]?.corpo?.conversationId === undefined);

    n = recebidos.length;
    const usoAntes = (await usoDe(uAdmin.id)).length;
    r = await admin.req("POST", "/api/ia/mensagens", { texto: "sem-credito" });
    checa("créditos esgotados no Chatbase viram aviso (503), em português", r.status === 503 && /sem créditos/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.texto.slice(0, 80)}`);
    checa("…sem uso gravado", (await usoDe(uAdmin.id)).length === usoAntes);

    console.log("\nOrganizador e afiliado, cada um no seu");
    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: AGENTE, paraOrganizador: true, paraAfiliado: true });
    checa("a plataforma libera organizador e afiliado", r.status === 200 && r.json?.config?.paraOrganizador === true && r.json?.config?.paraAfiliado === true);
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "Quanto vendi hoje?" });
    checa("o organizador conversa", r.status === 200, `HTTP ${r.status}`);
    uso = await usoDe(uMarina.id);
    checa("o uso dele é da organização dele", uso.length === 1 && uso[0].titularTipo === "organizacao" && uso[0].titularId === uMarina.org);
    r = await joao.req("POST", "/api/ia/mensagens", { texto: "Como divulgo melhor?" });
    checa("o afiliado conversa", r.status === 200, `HTTP ${r.status}`);
    uso = await usoDe(uJoao.id);
    checa("o uso dele é do cadastro de afiliado dele", uso.length === 1 && uso[0].titularTipo === "afiliado" && uso[0].titularId === afJoao.id);
    r = await marina.req("GET", "/api/ia/conversa");
    const daMarina = (r.json?.mensagens ?? []).map((m: any) => m.texto).join("|");
    checa("cada um vê só a própria conversa", daMarina.includes("Quanto vendi hoje?") && !daMarina.includes("Como lanço") && !daMarina.includes("Como divulgo"), daMarina.slice(0, 120));
    r = await sergio.req("POST", "/api/ia/mensagens", { texto: "oi" });
    checa("o cambista segue sem assistente, mesmo com tudo liberado (403)", r.status === 403, `HTTP ${r.status}`);
    checa("a configuração não vaza para a vitrine", !(await anon.req("GET", "/api/public/app")).texto.includes(AGENTE));

    await admin.req("PUT", "/api/admin/ia/config", { ligado: false, agenteId: AGENTE, paraOrganizador: true, paraAfiliado: true });
    r = await marina.req("GET", "/api/ia/sessao");
    checa("desligado de novo, o organizador perde o assistente", r.json?.ligado === false);
  } finally {
    await admin.req("PUT", "/api/admin/ia/config", antes ?? { ligado: false, agenteId: "", paraOrganizador: false, paraAfiliado: false });
    await limpar();
    falso.close();
    await pool.end();
  }
  console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
