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
 * - cada pessoa só vê a própria conversa, inclusive entre duas organizações;
 *   créditos esgotados do Chatbase viram aviso, sem uso gravado;
 * - conversa de outro agente (trocado em Aparência) ou apagada no Chatbase é
 *   esquecida e o assistente segue, em vez de travar;
 * - a cobrança: sem preço não libera organizador nem afiliado; sem assinatura,
 *   402 e nada sai para o Chatbase; o valor do Pix é da tabela, nunca do
 *   corpo; o Pix pago credita uma vez só; cada mensagem debita a franquia e
 *   depois o avulso (que pode ficar devendo uma mensagem); pacote só com a
 *   assinatura; renovar antes estende o ciclo; a franquia vence pelo livro;
 *   cada organização e cada afiliado têm a própria conta; o master não paga.
 *
 * Devolve a configuração de antes e apaga o que criou.
 *
 *   CHATBASE_API_KEY=… CHATBASE_API_URL=http://127.0.0.1:5099/api/v2 npm run dev   (noutro terminal, com seed)
 *   CHATBASE_API_KEY=<a mesma> CHATBASE_API_URL=<o mesmo> npm run ia
 */
import "dotenv/config";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import { affiliates, auditLog, iaContas, iaConversas, iaLancamentos, iaPagamentos, iaUso, organizations, rateEvents, users } from "../shared/schema";
import { estornarPagamentoIA, vencerFranquias } from "../server/services/iaCobranca";
import { MS_DO_CICLO } from "../shared/iaCobranca";
import { hashPassword } from "../server/auth";

const URL_DO_SITE = baseUrl();
const CHAVE = process.env.CHATBASE_API_KEY?.trim() ?? "";
const FALSO = process.env.CHATBASE_API_URL?.trim() ?? "";
const AGENTE = "agente-de-teste-123";
const OUTRO_AGENTE = "agente-novo-456789";
/** 5 créditos por ciclo; cada resposta do Chatbase de mentira custa 2. */
const COBRANCA = { assinaturaCents: 4990, franquiaCreditos: 5, pacotes: [{ creditos: 10, precoCents: 1000 }, { creditos: 50, precoCents: 4000 }] };
const VIZINHA = { slug: "ia-teste-vizinha", email: "ia-vizinha@rifa.teste", senha: "ia-vizinha-123" };
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
        // Conversa que o Chatbase não conhece (apagada lá, ou de outro agente): 404, como a API faz.
        if (corpo?.conversationId && !conversas.has(corpo.conversationId)) return responder(404, { error: { code: "NOT_FOUND" } });
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
      if (req.method === "GET" && msgs) {
        const lista = conversas.get(decodeURIComponent(msgs[2]));
        if (!lista) return responder(404, { error: { code: "NOT_FOUND" } });
        return responder(200, { data: lista, pagination: { hasMore: false } });
      }
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
  // Uma segunda organização, para provar que uma não vê a conversa da outra.
  const [orgVizinha] = await db
    .insert(organizations)
    .values({ slug: VIZINHA.slug, name: "Vizinha da IA", cidade: "Salvador", uf: "BA" })
    .onConflictDoUpdate({ target: organizations.slug, set: { active: true, archivedAt: null } })
    .returning({ id: organizations.id });
  const [uVizinha] = await db
    .insert(users)
    .values({ role: "organizer", organizationId: orgVizinha.id, name: "Org Vizinha da IA", email: VIZINHA.email, passwordHash: await hashPassword(VIZINHA.senha) })
    .onConflictDoUpdate({ target: users.email, set: { organizationId: orgVizinha.id, active: true } })
    .returning({ id: users.id });
  const vizinha = new Cliente();
  await entrar(vizinha, VIZINHA.email, VIZINHA.senha);
  const ids = [uAdmin.id, uMarina.id, uJoao.id, uVizinha.id];
  const titulares = [uMarina.org!, orgVizinha.id, afJoao.id];
  const limpar = async () => {
    await db.delete(iaUso).where(inArray(iaUso.userId, ids));
    await db.delete(iaConversas).where(inArray(iaConversas.userId, ids));
    await db.delete(iaLancamentos).where(inArray(iaLancamentos.titularId, titulares));
    await db.delete(iaPagamentos).where(inArray(iaPagamentos.titularId, titulares));
    await db.delete(iaContas).where(inArray(iaContas.titularId, titulares));
    for (const b of ["ia:%", "ia-ler:%", "ia-pix:%", "ia-pagante:%"]) await db.delete(rateEvents).where(like(rateEvents.bucket, b));
  };
  const contaDe = async (id: string) => (await db.select().from(iaContas).where(eq(iaContas.titularId, id)))[0];
  const livroDe = async (id: string) => db.select().from(iaLancamentos).where(eq(iaLancamentos.titularId, id));
  /** Gera o Pix e o dá por pago pelo atalho de desenvolvimento (o webhook usa a mesma confirmação). */
  const pagar = async (c: Cliente, corpo: Record<string, unknown>) => {
    const p = await c.req("POST", "/api/ia/pagamentos", corpo);
    const ok = p.status === 201 ? await c.req("POST", `/api/dev/ia-pagamento/${p.json.codigo}`) : p;
    return { pix: p, confirmacao: ok };
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
    checa("o uso é gravado por mensagem, como da plataforma, em milésimos exatos", uso.length === 2 && uso.every((u) => u.titularTipo === "plataforma" && u.titularId === null) && uso.reduce((s, u) => s + (u.milicreditos ?? 0), 0) === 4000, JSON.stringify(uso.map((u) => [u.titularTipo, u.milicreditos])));
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

    console.log("\nConversa que não existe mais não trava o assistente");
    let [linha] = await db.select().from(iaConversas).where(eq(iaConversas.userId, uAdmin.id));
    checa("a conversa guardada sabe de que agente é", linha?.agenteId === AGENTE);
    conversas.delete(linha!.conversationId); // apagada no Chatbase
    r = await admin.req("GET", "/api/ia/conversa");
    checa("histórico de conversa apagada no Chatbase: lista vazia, não erro", r.status === 200 && r.json?.mensagens?.length === 0, `HTTP ${r.status}`);
    checa("…e a conversa é esquecida", (await db.select().from(iaConversas).where(eq(iaConversas.userId, uAdmin.id))).length === 0);
    await admin.req("POST", "/api/ia/mensagens", { texto: "de novo" });
    [linha] = await db.select().from(iaConversas).where(eq(iaConversas.userId, uAdmin.id));
    conversas.delete(linha!.conversationId);
    n = recebidos.length;
    r = await admin.req("POST", "/api/ia/mensagens", { texto: "e agora?" });
    checa("mensagem para conversa apagada: recomeça sozinha e responde", r.status === 200 && recebidos.length - n === 2 && recebidos[n + 1]?.corpo?.conversationId === undefined, `HTTP ${r.status}, ${recebidos.length - n} chamada(s)`);
    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: OUTRO_AGENTE, paraOrganizador: false, paraAfiliado: false });
    n = recebidos.length;
    r = await admin.req("GET", "/api/ia/conversa");
    checa("agente trocado em Aparência: a conversa do agente velho é esquecida", r.status === 200 && r.json?.mensagens?.length === 0 && recebidos.length === n, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/ia/mensagens", { texto: "oi, agente novo" });
    checa("…e a próxima mensagem vai ao agente novo, em conversa nova", r.status === 200 && recebidos[n]?.caminho === `/agents/${OUTRO_AGENTE}/chat` && recebidos[n]?.corpo?.conversationId === undefined);
    [linha] = await db.select().from(iaConversas).where(eq(iaConversas.userId, uAdmin.id));
    checa("…e a conversa guardada é do agente novo", linha?.agenteId === OUTRO_AGENTE);
    await admin.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: AGENTE, paraOrganizador: false, paraAfiliado: false });

    n = recebidos.length;
    const usoAntes = (await usoDe(uAdmin.id)).length;
    r = await admin.req("POST", "/api/ia/mensagens", { texto: "sem-credito" });
    checa("créditos esgotados no Chatbase viram aviso (503), em português", r.status === 503 && /sem créditos/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.texto.slice(0, 80)}`);
    checa("…sem uso gravado", (await usoDe(uAdmin.id)).length === usoAntes);

    console.log("\nCobrança: sem preço, não libera");
    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: AGENTE, paraOrganizador: true, paraAfiliado: true });
    checa("liberar organizador e afiliado sem preço da assinatura: 400", r.status === 400 && /preço da assinatura/.test(r.json?.message ?? ""), `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/ia/config", {
      ligado: true, agenteId: AGENTE, paraOrganizador: true, paraAfiliado: true,
      cobranca: { ...COBRANCA, pacotes: [{ creditos: 10, precoCents: 1000 }, { creditos: 20, precoCents: 2500 }] },
    });
    checa("crédito mais caro no pacote maior: 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: AGENTE, paraOrganizador: true, paraAfiliado: true, cobranca: COBRANCA });
    checa("com preço e franquia, a plataforma libera organizador e afiliado", r.status === 200 && r.json?.config?.paraOrganizador === true && r.json?.config?.cobranca?.assinaturaCents === 4990, r.texto.slice(0, 120));
    r = await marina.req("GET", "/api/ia/sessao");
    checa("o organizador tem o assistente, cobrado", r.json?.ligado === true && r.json?.cobrado === true);
    r = await admin.req("GET", "/api/ia/sessao");
    checa("o master tem o assistente sem cobrança", r.json?.ligado === true && r.json?.cobrado === false);

    console.log("\nSem assinatura, nada sai para o Chatbase");
    n = recebidos.length;
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "Quanto vendi hoje?" });
    checa("sem assinatura: 402", r.status === 402 && /Assine/.test(r.json?.message ?? ""), `HTTP ${r.status}`);
    checa("…nada foi ao Chatbase e nada foi gravado", recebidos.length === n && (await usoDe(uMarina.id)).length === 0);
    r = await marina.req("GET", "/api/ia/conta");
    checa("o plano mostra a assinatura inativa e o preço", r.status === 200 && r.json?.ativa === false && r.json?.preco?.assinaturaCents === 4990 && /no-store/.test(r.cache), r.texto.slice(0, 120));
    r = await marina.req("POST", "/api/ia/pagamentos", { tipo: "avulso", pacote: 0 });
    checa("pacote avulso sem assinatura: 409", r.status === 409, `HTTP ${r.status}`);
    r = await marina.req("POST", "/api/ia/pagamentos", { tipo: "presente" });
    checa("tipo desconhecido: 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/ia/pagamentos", { tipo: "assinatura" });
    checa("o master não paga (400)", r.status === 400, `HTTP ${r.status}`);
    r = await sergio.req("POST", "/api/ia/pagamentos", { tipo: "assinatura" });
    checa("o cambista não paga nem vê (403)", r.status === 403, `HTTP ${r.status}`);

    console.log("\nO Pix da assinatura");
    r = await marina.req("POST", "/api/ia/pagamentos", { tipo: "assinatura", valorCents: 1, milicreditos: 99_999_000 });
    const pix = r.json;
    checa("o valor e os créditos saem da tabela, nunca do corpo", r.status === 201 && pix?.valorCents === 4990 && pix?.creditos === 5 && pix?.codigo >= 1_000_000_000 && !!pix?.pixCopyPaste, r.texto.slice(0, 160));
    r = await marina.req("POST", "/api/ia/pagamentos", { tipo: "assinatura" });
    checa("pedir de novo devolve o mesmo Pix em aberto", r.json?.codigo === pix?.codigo);
    r = await marina.req("GET", "/api/ia/conta");
    checa("o plano mostra o Pix em aberto", r.json?.pendente?.codigo === pix?.codigo && r.json?.pendente?.status === "pendente");
    await marina.req("POST", `/api/dev/ia-pagamento/${pix.codigo}`);
    await marina.req("POST", `/api/dev/ia-pagamento/${pix.codigo}`);
    let livro = await livroDe(uMarina.org!);
    checa("o Pix pago credita uma vez só", livro.filter((l) => l.motivo === "assinatura").length === 1, `${livro.length} lançamento(s)`);
    let conta = await contaDe(uMarina.org!);
    const cicloPrimeiro = conta?.cicloAte?.getTime() ?? 0;
    checa("a franquia entra e o ciclo é de 30 dias", conta?.franquiaMilicreditos === 5000 && conta?.avulsoMilicreditos === 0 && Math.abs(cicloPrimeiro - Date.now() - MS_DO_CICLO) < 60_000);
    r = await marina.req("GET", "/api/ia/conta");
    checa("o plano mostra a assinatura ativa, sem Pix em aberto", r.json?.ativa === true && r.json?.franquiaCreditos === 5 && r.json?.pendente === null);

    console.log("\nCada mensagem debita: franquia, depois avulso");
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "Quanto vendi hoje?" });
    checa("o organizador conversa", r.status === 200, `HTTP ${r.status}`);
    uso = await usoDe(uMarina.id);
    checa("o uso dele é da organização dele", uso.length === 1 && uso[0].titularTipo === "organizacao" && uso[0].titularId === uMarina.org);
    await marina.req("POST", "/api/ia/mensagens", { texto: "E ontem?" });
    conta = await contaDe(uMarina.org!);
    checa("duas mensagens: 4 dos 5 créditos da franquia", conta?.franquiaMilicreditos === 1000 && conta?.avulsoMilicreditos === 0);
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "E a semana?" });
    conta = await contaDe(uMarina.org!);
    checa("a terceira passa (havia saldo) e o avulso fica devendo o resto", r.status === 200 && conta?.franquiaMilicreditos === 0 && conta?.avulsoMilicreditos === -1000);
    n = recebidos.length;
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "E o mês?" });
    checa("sem saldo: 402, e nada vai ao Chatbase", r.status === 402 && /acabaram/.test(r.json?.message ?? "") && recebidos.length === n, `HTTP ${r.status}`);
    livro = await livroDe(uMarina.org!);
    const somaUso = (await usoDe(uMarina.id)).reduce((t, u) => t + (u.milicreditos ?? 0), 0);
    const debitos = livro.filter((l) => l.motivo === "uso").reduce((t, l) => t - l.franquiaMilicreditos - l.avulsoMilicreditos, 0);
    checa("o livro debita exatamente o uso gravado", debitos === somaUso && somaUso === 6000, `${debitos} / ${somaUso}`);
    const somaLivro = livro.reduce((t, l) => ({ f: t.f + l.franquiaMilicreditos, a: t.a + l.avulsoMilicreditos }), { f: 0, a: 0 });
    checa("o livro fecha com a conta", somaLivro.f === conta?.franquiaMilicreditos && somaLivro.a === conta?.avulsoMilicreditos);

    console.log("\nPacote avulso e renovação");
    let p = await pagar(marina, { tipo: "avulso", pacote: 0 });
    checa("com a assinatura ativa, o pacote sai pelo preço da tabela", p.pix.status === 201 && p.pix.json?.valorCents === 1000 && p.confirmacao.json?.ok === true, `HTTP ${p.pix.status}`);
    conta = await contaDe(uMarina.org!);
    checa("o pacote paga a dívida e sobra o resto", conta?.avulsoMilicreditos === 9000);
    r = await marina.req("POST", "/api/ia/pagamentos", { tipo: "avulso", pacote: 7 });
    checa("pacote inexistente: 400", r.status === 400, `HTTP ${r.status}`);
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "E agora?" });
    conta = await contaDe(uMarina.org!);
    checa("sem franquia, a mensagem sai do avulso", r.status === 200 && conta?.avulsoMilicreditos === 7000 && conta?.franquiaMilicreditos === 0);
    p = await pagar(marina, { tipo: "assinatura" });
    conta = await contaDe(uMarina.org!);
    checa("renovar antes do fim estende o ciclo por mais 30 dias e soma a franquia", p.confirmacao.json?.ok === true && (conta?.cicloAte?.getTime() ?? 0) - cicloPrimeiro === MS_DO_CICLO && conta?.franquiaMilicreditos === 5000, String(conta?.cicloAte));

    console.log("\nPix estornado no provedor tira os créditos");
    const [pacotePago] = await db.select().from(iaPagamentos).where(eq(iaPagamentos.titularId, uMarina.org!)).then((l) => l.filter((x) => x.tipo === "avulso"));
    const antesDoEstorno = await contaDe(uMarina.org!);
    checa("a cobrança do assistente é reconhecida pelo estorno", (await estornarPagamentoIA(pacotePago.chargeId!)) === true);
    await estornarPagamentoIA(pacotePago.chargeId!);
    conta = await contaDe(uMarina.org!);
    livro = await livroDe(uMarina.org!);
    const [estornado] = await db.select().from(iaPagamentos).where(eq(iaPagamentos.id, pacotePago.id));
    checa(
      "o pagamento fica estornado e os créditos saem uma vez só (franquia primeiro)",
      estornado.status === "estornada" &&
        livro.filter((l) => l.motivo === "estorno").length === 1 &&
        (antesDoEstorno!.franquiaMilicreditos + antesDoEstorno!.avulsoMilicreditos) - (conta!.franquiaMilicreditos + conta!.avulsoMilicreditos) === 10_000,
      `${conta?.franquiaMilicreditos}/${conta?.avulsoMilicreditos}`,
    );
    checa("um Pix que não é do assistente segue para o estorno de pedido", (await estornarPagamentoIA("cobranca-que-nao-existe")) === false);
    // Devolve o pacote para as contas de baixo seguirem.
    await db.update(iaContas).set({ franquiaMilicreditos: antesDoEstorno!.franquiaMilicreditos, avulsoMilicreditos: antesDoEstorno!.avulsoMilicreditos }).where(eq(iaContas.titularId, uMarina.org!));
    await db.delete(iaLancamentos).where(eq(iaLancamentos.chave, `estorno:${pacotePago.id}`));

    console.log("\nA franquia vence pelo livro");
    await db.update(iaContas).set({ cicloAte: new Date(Date.now() - 1000) }).where(eq(iaContas.titularId, uMarina.org!));
    n = recebidos.length;
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "venceu?" });
    checa("ciclo vencido: 402, mesmo com avulso sobrando", r.status === 402 && recebidos.length === n, `HTTP ${r.status}`);
    await vencerFranquias();
    await vencerFranquias();
    conta = await contaDe(uMarina.org!);
    livro = await livroDe(uMarina.org!);
    checa("o relógio zera a franquia vencida uma vez só, e o avulso fica", conta?.franquiaMilicreditos === 0 && conta?.avulsoMilicreditos === 7000 && livro.filter((l) => l.motivo === "vencimento").length === 1);

    console.log("\nCada titular com a própria conta");
    r = await vizinha.req("POST", "/api/ia/mensagens", { texto: "Segredo da vizinha" });
    checa("a organização vizinha não usa a assinatura da outra (402)", r.status === 402, `HTTP ${r.status}`);
    r = await vizinha.req("GET", "/api/ia/conta");
    checa("…e o plano dela não mostra nada da outra", r.json?.ativa === false && r.json?.pendente === null && r.json?.avulsoCreditos === 0);
    const juntos = await Promise.all([1, 2, 3].map(() => vizinha.req("POST", "/api/ia/pagamentos", { tipo: "assinatura" })));
    const pendentes = await db.select().from(iaPagamentos).where(eq(iaPagamentos.titularId, orgVizinha.id));
    checa(
      "três pedidos de Pix ao mesmo tempo geram uma cobrança só",
      pendentes.length === 1 && juntos.every((x) => (x.status === 201 && x.json?.codigo === pendentes[0].codigo) || x.status === 409),
      juntos.map((x) => x.status).join(","),
    );
    await vizinha.req("POST", `/api/dev/ia-pagamento/${pendentes[0].codigo}`);
    r = await vizinha.req("POST", "/api/ia/mensagens", { texto: "Segredo da vizinha" });
    checa("a organização vizinha conversa com a assinatura dela", r.status === 200, `HTTP ${r.status}`);
    uso = await usoDe(uVizinha.id);
    checa("o uso dela é da organização dela", uso.length === 1 && uso[0].titularTipo === "organizacao" && uso[0].titularId === orgVizinha.id);
    checa("…e o débito sai da conta dela", (await contaDe(orgVizinha.id))?.franquiaMilicreditos === 3000 && (await contaDe(uMarina.org!))?.avulsoMilicreditos === 7000);
    r = await marina.req("GET", "/api/ia/conversa");
    const daMarina = (r.json?.mensagens ?? []).map((m: any) => m.texto).join("|");
    checa("cada um vê só a própria conversa", daMarina.includes("Quanto vendi hoje?") && !daMarina.includes("Como lanço") && !daMarina.includes("Segredo da vizinha"), daMarina.slice(0, 120));
    r = await vizinha.req("GET", "/api/ia/conversa");
    const daVizinha = (r.json?.mensagens ?? []).map((m: any) => m.texto).join("|");
    checa("…e a vizinha não vê a de ninguém", daVizinha.includes("Segredo da vizinha") && !daVizinha.includes("Quanto vendi") && !daVizinha.includes("Como lanço"), daVizinha.slice(0, 120));
    r = await joao.req("POST", "/api/ia/mensagens", { texto: "Como divulgo melhor?" });
    checa("o afiliado sem assinatura própria: 402", r.status === 402, `HTTP ${r.status}`);
    p = await pagar(joao, { tipo: "assinatura" });
    checa("o afiliado assina no login dele", p.pix.status === 201 && p.confirmacao.json?.ok === true, `HTTP ${p.pix.status}`);
    r = await joao.req("POST", "/api/ia/mensagens", { texto: "Como divulgo melhor?" });
    checa("o afiliado conversa", r.status === 200, `HTTP ${r.status}`);
    uso = await usoDe(uJoao.id);
    checa("o uso e o débito são do cadastro de afiliado dele", uso.length === 1 && uso[0].titularTipo === "afiliado" && uso[0].titularId === afJoao.id && (await contaDe(afJoao.id))?.franquiaMilicreditos === 3000);
    checa("o master conversou o tempo todo sem conta nenhuma", (await db.select().from(iaContas).where(eq(iaContas.titularTipo, "plataforma"))).length === 0);
    r = await sergio.req("POST", "/api/ia/mensagens", { texto: "oi" });
    checa("o cambista segue sem assistente, mesmo com tudo liberado (403)", r.status === 403, `HTTP ${r.status}`);
    checa("a configuração não vaza para a vitrine", !(await anon.req("GET", "/api/public/app")).texto.includes(AGENTE));

    console.log("\nRelatório e ajuste de crédito pela plataforma");
    const [slugMarina] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, uMarina.org!));
    const [codJoao] = await db.select({ code: affiliates.code }).from(affiliates).where(eq(affiliates.id, afJoao.id));
    for (const [quem, c] of [["organizador", marina], ["afiliado", joao]] as const) {
      r = await c.req("GET", "/api/admin/ia/relatorio");
      checa(`o ${quem} não lê o relatório (403)`, r.status === 403, `HTTP ${r.status}`);
      r = await c.req("POST", "/api/admin/ia/ajustes", { titularTipo: "organizacao", titular: slugMarina.slug, creditos: 1000, motivo: "tentando se dar crédito", idempotencia: randomUUID() });
      checa(`o ${quem} não se dá crédito (403)`, r.status === 403, `HTTP ${r.status}`);
    }
    r = await admin.req("GET", "/api/admin/ia/relatorio?dias=30");
    const linhaDe = (tipo: string, titular: string) => (r.json?.linhas ?? []).find((l: any) => l.titularTipo === tipo && l.titular === titular);
    const lM = linhaDe("organizacao", slugMarina.slug);
    const lV = linhaDe("organizacao", VIZINHA.slug);
    const lJ = linhaDe("afiliado", codJoao.code);
    const pagos = await db.select().from(iaPagamentos).where(eq(iaPagamentos.status, "paga"));
    const recebido = (id: string) => pagos.filter((x) => x.titularId === id).reduce((t, x) => t + x.valorCents, 0);
    checa(
      "o relatório traz cada conta com a receita dos Pix pagos dela",
      r.status === 200 && lM?.receitaCents === recebido(uMarina.org!) && lV?.receitaCents === recebido(orgVizinha.id) && lJ?.receitaCents === recebido(afJoao.id),
      JSON.stringify([lM?.receitaCents, lV?.receitaCents, lJ?.receitaCents]),
    );
    checa("…as mensagens e os créditos que cada uma usou", lV?.mensagens === 1 && lV?.creditosUsados === 2 && lJ?.mensagens === 1 && lM?.mensagens >= 1);
    checa("…e o uso do master à parte, como custo", r.json?.totais?.creditosDaPlataforma > 0 && !(r.json?.linhas ?? []).some((l: any) => l.titularTipo === "plataforma"));
    checa("com poucas contas, a lista não vem cortada", r.json?.cortada === false);
    checa("o relatório não traz e-mail nem telefone de ninguém", !/@|marina@|joao@/.test(r.texto) && r.cache.includes("no-store"));

    const chaveDoAjuste = randomUUID();
    const ajuste = { titularTipo: "organizacao", titular: VIZINHA.slug, creditos: 5, motivo: "Cortesia de boas-vindas", idempotencia: chaveDoAjuste };
    const antesDoAjuste = await contaDe(orgVizinha.id);
    const dois = await Promise.all([admin.req("POST", "/api/admin/ia/ajustes", ajuste), admin.req("POST", "/api/admin/ia/ajustes", ajuste)]);
    let doAjuste = (await livroDe(orgVizinha.id)).filter((l) => l.motivo === "ajuste");
    checa(
      "o mesmo ajuste enviado duas vezes ao mesmo tempo lança uma vez só",
      dois.map((x) => x.status).sort().join(",") === "200,201" && doAjuste.length === 1 && (await contaDe(orgVizinha.id))!.avulsoMilicreditos - antesDoAjuste!.avulsoMilicreditos === 5000,
      dois.map((x) => x.status).join(","),
    );
    r = await admin.req("POST", "/api/admin/ia/ajustes", { ...ajuste, creditos: 50 });
    checa("a mesma identificação com outro valor não é repetição: 409, nada muda", r.status === 409 && (await livroDe(orgVizinha.id)).filter((l) => l.motivo === "ajuste").length === 1, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/ia/ajustes", { ...ajuste, titularTipo: "afiliado", titular: codJoao.code });
    checa("…nem em outra conta: 409", r.status === 409, `HTTP ${r.status}`);
    const aud = await db.select().from(auditLog).where(eq(auditLog.action, "ia.ajuste"));
    checa("o ajuste fica na auditoria uma vez, com motivo e o autor", aud.filter((a) => (a.diff as any)?.chave === chaveDoAjuste).length === 1 && aud.some((a) => (a.diff as any)?.motivo === "Cortesia de boas-vindas"));
    r = await admin.req("POST", "/api/admin/ia/ajustes", { ...ajuste, creditos: -100, idempotencia: randomUUID(), motivo: "Correção grande demais" });
    checa("a correção não tira mais avulso do que a conta tem (409) e nada muda", r.status === 409 && (await contaDe(orgVizinha.id))!.avulsoMilicreditos - antesDoAjuste!.avulsoMilicreditos === 5000, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/ia/ajustes", { ...ajuste, creditos: -5, idempotencia: randomUUID(), motivo: "Corrigindo a cortesia" });
    checa("a correção dentro do saldo entra", r.status === 201 && (await contaDe(orgVizinha.id))!.avulsoMilicreditos === antesDoAjuste!.avulsoMilicreditos, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/ia/ajustes", { ...ajuste, titular: "nao-existe-essa-org", idempotencia: randomUUID() });
    checa("organização que não existe: 404", r.status === 404, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/ia/ajustes", { ...ajuste, creditos: 0, idempotencia: randomUUID() });
    checa("ajuste de zero crédito: 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/ia/ajustes", { titularTipo: "afiliado", titular: codJoao.code.toLowerCase(), creditos: 3, motivo: "Cortesia do afiliado", idempotencia: randomUUID() });
    checa("o afiliado recebe pelo código (sem diferença de maiúscula)", r.status === 201 && (await livroDe(afJoao.id)).some((l) => l.motivo === "ajuste" && l.avulsoMilicreditos === 3000), `HTTP ${r.status}`);
    r = await admin.req("GET", `/api/admin/ia/lancamentos?tipo=organizacao&titular=${VIZINHA.slug}`);
    doAjuste = (r.json?.lancamentos ?? []).filter((l: any) => l.motivo === "ajuste");
    checa("o extrato mostra os ajustes com o motivo, o mais novo primeiro", r.status === 200 && doAjuste.length === 2 && doAjuste[0].avulsoCreditos === -5 && /Corrigindo a cortesia/.test(doAjuste[0].descricao));
    r = await marina.req("GET", `/api/admin/ia/lancamentos?tipo=organizacao&titular=${VIZINHA.slug}`);
    checa("o organizador não lê o extrato de ninguém (403)", r.status === 403, `HTTP ${r.status}`);

    await admin.req("PUT", "/api/admin/ia/config", { ligado: false, agenteId: AGENTE, paraOrganizador: true, paraAfiliado: true, cobranca: COBRANCA });
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
