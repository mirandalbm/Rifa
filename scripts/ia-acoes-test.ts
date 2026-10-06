/**
 * Prova das ações do assistente de IA pela API de verdade, com um Chatbase de
 * mentira que pede ações ("client actions") quando a mensagem diz
 * `acao <nome> <json>`. Confere:
 *
 * - leitura executa na hora, no recorte da sessão: a organização vê só as
 *   rifas e os pedidos dela; o resultado não leva nome, telefone nem CPF;
 * - ação desconhecida, de outro papel ou com entrada fora do formato volta
 *   como erro para o agente, sem executar;
 * - ação que grava espera a confirmação: nada muda até o Confirmar; a de outra
 *   pessoa é 404; dois cliques são uma execução e um 409; recusar não muda
 *   nada; escrever de novo, "Nova conversa" e o prazo vencem a pendente;
 * - o que dá para saber que vai falhar (rifa do vizinho, sem banner, legenda
 *   com telefone) falha antes de pedir confirmação;
 * - o que foi feito entra em `audit_log` com `viaIA: true`;
 * - cada resposta do Chatbase (inclusive as que seguem uma ação) é uma linha
 *   de uso e debita quem paga; as rodadas de ação têm teto.
 *
 * Devolve a configuração de antes e apaga o que criou.
 *
 *   CHATBASE_API_KEY=… CHATBASE_API_URL=http://127.0.0.1:5099/api/v2 npm run dev   (noutro terminal, com seed)
 *   CHATBASE_API_KEY=<a mesma> CHATBASE_API_URL=<o mesmo> npm run ia-acoes
 */
import "dotenv/config";
import http from "node:http";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import {
  affiliates,
  auditLog,
  buyers,
  campaigns,
  chamados,
  iaAcoes,
  iaContas,
  iaConversas,
  iaLancamentos,
  iaPagamentos,
  iaUso,
  orders,
  organizations,
  rateEvents,
  users,
} from "../shared/schema";
import { hashPassword } from "../server/auth";
import { semContexto } from "../shared/ia";
import { getPlataforma, setPlataforma } from "../server/services/settings";

const URL_DO_SITE = baseUrl();
const CHAVE = process.env.CHATBASE_API_KEY?.trim() ?? "";
const FALSO = process.env.CHATBASE_API_URL?.trim() ?? "";
const AGENTE = "agente-de-acoes-123";
/** Franquia folgada: aqui se prova a ação, não o saldo (isso é o `npm run ia`). */
const COBRANCA = { assinaturaCents: 4990, franquiaCreditos: 500, pacotes: [] };
const VIZINHA = { slug: "ia-acoes-vizinha", email: "ia-acoes-vizinha@rifa.teste", senha: "ia-acoes-vizinha-123" };
const SLUG_MARINA = "ia-acao-rascunho-marina";
const SLUG_VIZINHA = "ia-acao-rascunho-vizinha";
/** A rifa e o comprador do pedido de teste (o seed do CI não tem pedido da Marina). */
const SLUG_PEDIDO = "ia-acao-pedido-marina";
const FONE_PROVA = "11960009901";
const NOME_PROVA = "Comprador Prova Assistente";
const PROTOCOLO = "RB-20261002-990001";
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
    return { status: r.status, texto, json };
  }
}

/* ---------------- o Chatbase de mentira ---------------- */

interface Recebido {
  metodo: string;
  caminho: string;
  corpo: any;
}
const recebidos: Recebido[] = [];
/** Os resultados que o nosso servidor mandou, por conversa. */
const resultados = new Map<string, { toolCallId: string; output: any }[]>();
/** Conversas em que o agente pede ação de novo a cada continuação (para provar o teto). */
const emLaco = new Set<string>();
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
      recebidos.push({ metodo: req.method ?? "", caminho, corpo });
      const responder = (status: number, j: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(j));
      };
      if (req.headers.authorization !== `Bearer ${CHAVE}`) return responder(401, { error: { code: "AUTH_INVALID" } });
      const tr = caminho.match(/^\/agents\/([^/]+)\/conversations\/([^/]+)\/tool-result$/);
      if (req.method === "POST" && tr) {
        const conv = decodeURIComponent(tr[2]);
        resultados.set(conv, [...(resultados.get(conv) ?? []), { toolCallId: corpo.toolCallId, output: corpo.output }]);
        return responder(200, { data: { ok: true } });
      }
      const chat = caminho.match(/^\/agents\/([^/]+)\/chat$/);
      if (req.method === "POST" && chat) {
        seq++;
        const conv = corpo?.conversationId ?? `conv_${seq}`;
        const id = `msg_${seq}`;
        // O servidor manda o contexto do papel na frente: o roteiro do Chatbase de mentira lê só o que a pessoa escreveu.
        const mensagem: string = semContexto(corpo?.message ?? "");
        const resposta = (parts: unknown[], finishReason: string) =>
          responder(200, { data: { id, role: "assistant", parts, metadata: { conversationId: conv, finishReason, usage: { credits: 1 } } } });
        const acao = (nome: string, input: unknown) => ({ type: "tool-call", toolCallId: `call_${seq}_${nome}`, toolName: nome, input });
        if (mensagem.startsWith("acao ")) {
          const [, nome, ...resto] = mensagem.split(" ");
          return resposta([{ type: "text", text: `vou usar ${nome}` }, acao(nome, JSON.parse(resto.join(" ") || "{}"))], "tool-calls");
        }
        if (mensagem.startsWith("duas ")) {
          // Duas gravações na mesma resposta: só uma pode esperar confirmação.
          const slug = mensagem.split(" ")[1];
          return resposta([acao("excluir_rifa", { rifa: slug }), { ...acao("atualizar_legenda", { rifa: slug, legenda: "x" }), toolCallId: `call_${seq}_b` }], "tool-calls");
        }
        if (mensagem.startsWith("legenda-com-telefone ")) {
          // A IA inventa o telefone (a pessoa não escreveu nenhum): a régua da legenda barra.
          return resposta([acao("atualizar_legenda", { rifa: mensagem.split(" ")[1], legenda: "chama no zap 11987654321" })], "tool-calls");
        }
        if (mensagem === "laço") {
          emLaco.add(conv);
          return resposta([acao("pendencias", {})], "tool-calls");
        }
        if (!mensagem && emLaco.has(conv)) return resposta([{ type: "text", text: "mais uma" }, acao("pendencias", {})], "tool-calls");
        if (!mensagem) {
          const ultimos = resultados.get(conv) ?? [];
          return resposta([{ type: "text", text: `continuei: ${JSON.stringify(ultimos[ultimos.length - 1]?.output ?? null)}` }], "stop");
        }
        return resposta([{ type: "text", text: `resposta ${seq}` }], "stop");
      }
      if (req.method === "GET" && /\/messages/.test(caminho)) return responder(200, { data: [] });
      responder(404, { error: { code: "NOT_FOUND" } });
    });
  });
  return new Promise((ok) => servidor.listen(Number(alvo.port), alvo.hostname, () => ok(servidor)));
}

/** O último resultado que o servidor mandou ao agente (de qualquer conversa). */
const ultimoResultado = () => [...recebidos].reverse().find((x) => x.caminho.endsWith("/tool-result"))?.corpo?.output;

async function main() {
  if (CHAVE.length < 8 || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(FALSO)) {
    throw new Error("Defina CHATBASE_API_KEY (8+ caracteres) e CHATBASE_API_URL=http://127.0.0.1:<porta>/api/v2, com os mesmos valores no servidor.");
  }
  const falso = await subirFalso();
  const admin = new Cliente();
  const marina = new Cliente();
  const joao = new Cliente();
  const anon = new Cliente();
  const entrar = async (c: Cliente, email: string, password: string) => {
    const r = await c.req("POST", "/api/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`login de ${email}: HTTP ${r.status}`);
  };
  await db.delete(rateEvents).where(like(rateEvents.bucket, "login:%"));
  await entrar(admin, "admin@rifa.br", "admin123");
  await entrar(marina, "marina@rifassaojose.br", "organizador123");
  await entrar(joao, "joao@rifa.br", "joao123");

  const [uAdmin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@rifa.br"));
  const [uMarina] = await db.select({ id: users.id, org: users.organizationId }).from(users).where(eq(users.email, "marina@rifassaojose.br"));
  const [uJoao] = await db.select({ id: users.id }).from(users).where(eq(users.email, "joao@rifa.br"));
  const [afJoao] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.userId, uJoao.id));
  const [orgVizinha] = await db
    .insert(organizations)
    .values({ slug: VIZINHA.slug, name: "Vizinha das Ações", cidade: "Recife", uf: "PE" })
    .onConflictDoUpdate({ target: organizations.slug, set: { active: true, archivedAt: null } })
    .returning({ id: organizations.id });
  const [uVizinha] = await db
    .insert(users)
    .values({ role: "organizer", organizationId: orgVizinha.id, name: "Org Vizinha das Ações", email: VIZINHA.email, passwordHash: await hashPassword(VIZINHA.senha) })
    .onConflictDoUpdate({ target: users.email, set: { organizationId: orgVizinha.id, active: true } })
    .returning({ id: users.id });
  const vizinha = new Cliente();
  await entrar(vizinha, VIZINHA.email, VIZINHA.senha);

  const ids = [uAdmin.id, uMarina.id, uJoao.id, uVizinha.id];
  const titulares = [uMarina.org!, orgVizinha.id, ...(afJoao ? [afJoao.id] : [])];
  const novaRifa = (org: string, slug: string, titulo: string) =>
    db
      .insert(campaigns)
      .values({ organizationId: org, slug, title: titulo, prizeTitle: "Prêmio da prova", totalQuotas: 1000, priceCents: 500 })
      .onConflictDoNothing()
      .returning({ id: campaigns.id });
  const limpar = async () => {
    await db.delete(iaAcoes).where(inArray(iaAcoes.userId, ids));
    await db.delete(iaUso).where(inArray(iaUso.userId, ids));
    await db.delete(iaConversas).where(inArray(iaConversas.userId, ids));
    await db.delete(iaLancamentos).where(inArray(iaLancamentos.titularId, titulares));
    await db.delete(iaPagamentos).where(inArray(iaPagamentos.titularId, titulares));
    await db.delete(iaContas).where(inArray(iaContas.titularId, titulares));
    await db.delete(chamados).where(eq(chamados.protocolo, PROTOCOLO));
    // Os pedidos de teste saem junto com a rifa (cascata); o comprador depois.
    await db.delete(campaigns).where(inArray(campaigns.slug, [SLUG_MARINA, SLUG_VIZINHA, SLUG_PEDIDO]));
    await db.delete(buyers).where(eq(buyers.phone, FONE_PROVA));
    for (const b of ["ia:%", "ia-ler:%", "ia-pix:%", "ia-pagante:%"]) await db.delete(rateEvents).where(like(rateEvents.bucket, b));
  };
  await limpar();
  const antes = (await admin.req("GET", "/api/admin/ia/config")).json?.config;
  /** O limite de mensagens por pessoa (20 em 5 min) é do `npm run ia`; aqui ele só atrapalharia a prova. */
  const zerarLimites = async () => {
    for (const b of ["ia:%", "ia-pagante:%"]) await db.delete(rateEvents).where(like(rateEvents.bucket, b));
  };
  const linhaDa = async (id: string) => (await db.select().from(iaAcoes).where(eq(iaAcoes.id, id)))[0];

  try {
    let r = await admin.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: AGENTE, paraOrganizador: true, paraAfiliado: false, cobranca: COBRANCA });
    if (r.status !== 200) throw new Error(`configurar a IA: HTTP ${r.status} ${r.texto}`);
    for (const c of [marina, vizinha]) {
      const p = await c.req("POST", "/api/ia/pagamentos", { tipo: "assinatura", documento: "11144477735" });
      if (p.status !== 201) throw new Error(`Pix da assinatura: HTTP ${p.status} ${p.texto}`);
      await c.req("POST", `/api/dev/ia-pagamento/${p.json.codigo}`);
    }

    console.log("\nLer é na hora, no recorte da sessão");
    const [rifaM] = await novaRifa(uMarina.org!, SLUG_MARINA, "Rascunho da Marina (prova da IA)");
    const [rifaV] = await novaRifa(orgVizinha.id, SLUG_VIZINHA, "Rascunho da Vizinha (prova da IA)");
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "acao listar_rifas {}" });
    let saida = ultimoResultado();
    const slugs = (saida?.data ?? []).map((x: any) => x.slug);
    checa("a organização lista as rifas dela", r.status === 200 && saida?.status === "success" && slugs.includes(SLUG_MARINA), r.texto.slice(0, 160));
    checa("…e nunca a do vizinho", !slugs.includes(SLUG_VIZINHA));
    checa("…sem o nome da organização (é a dela)", (saida?.data ?? []).every((x: any) => !("organizacao" in x)));
    checa("o agente continuou com o resultado e a resposta voltou ao painel", /^vou usar listar_rifas\n\ncontinuei: /.test(r.json?.mensagem?.texto ?? "") && r.json?.acao === null, (r.json?.mensagem?.texto ?? "").slice(0, 80));
    let linhas = await db.select().from(iaAcoes).where(eq(iaAcoes.userId, uMarina.id));
    checa("a chamada ficou registrada como executada", linhas.length === 1 && linhas[0].status === "executada" && linhas[0].nome === "listar_rifas");
    const usoMarina = await db.select().from(iaUso).where(eq(iaUso.userId, uMarina.id));
    checa("as duas respostas do Chatbase viraram uso (pedido e continuação)", usoMarina.length === 2 && usoMarina.every((u) => u.titularTipo === "organizacao"), String(usoMarina.length));

    r = await admin.req("POST", "/api/ia/mensagens", { texto: "acao listar_rifas {\"situacao\":\"rascunho\"}" });
    saida = ultimoResultado();
    const doAdmin = (saida?.data ?? []).map((x: any) => x.slug);
    checa("a plataforma lista de todas, com a organização", doAdmin.includes(SLUG_MARINA) && doAdmin.includes(SLUG_VIZINHA) && (saida?.data ?? []).every((x: any) => typeof x.organizacao === "string"));

    // Um pedido vencido numa rifa só da prova: não mexe em cota nem no contador de nenhuma rifa de verdade.
    const [rifaPedido] = await novaRifa(uMarina.org!, SLUG_PEDIDO, "Rifa do pedido de teste (prova da IA)");
    const [comprador] = await db.insert(buyers).values({ name: NOME_PROVA, phone: FONE_PROVA }).returning({ id: buyers.id });
    const codigoDoPedido = 99_000_000 + Math.floor(Math.random() * 900_000);
    const [pedidoTeste] = await db
      .insert(orders)
      .values({ code: codigoDoPedido, campaignId: rifaPedido.id, buyerId: comprador.id, quantity: 2, amountCents: 1000, status: "expired" })
      .returning({ id: orders.id, buyerId: orders.buyerId, amount: orders.amountCents, status: orders.status });
    const pedidoM = { code: codigoDoPedido, nome: NOME_PROVA, phone: FONE_PROVA };
    if (pedidoM) {
      r = await marina.req("POST", "/api/ia/mensagens", { texto: `acao consultar_pedido {"codigo":"${pedidoM.code}"}` });
      saida = ultimoResultado();
      const t = JSON.stringify(saida);
      checa("a organização consulta o pedido dela", saida?.status === "success" && saida.data.codigo === String(pedidoM.code), t.slice(0, 160));
      checa("…sem nome nem telefone de quem comprou", !t.includes(pedidoM.phone) && !(pedidoM.nome && pedidoM.nome.length > 3 && t.includes(pedidoM.nome)));
      r = await vizinha.req("POST", "/api/ia/mensagens", { texto: `acao consultar_pedido {"codigo":"${pedidoM.code}"}` });
      saida = ultimoResultado();
      checa("o pedido da Marina não existe para a vizinha", saida?.status === "error" && /Não achei/.test(saida.error), JSON.stringify(saida));
    } else {
      checa("há um pedido da Marina no seed para consultar", false);
    }

    r = await marina.req("POST", "/api/ia/mensagens", { texto: "acao resumo_de_vendas {\"dias\":7}" });
    saida = ultimoResultado();
    checa("resumo de vendas no recorte", saida?.status === "success" && saida.data.dias === 7 && typeof saida.data.receitaPaga === "string");
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "acao pendencias {}" });
    saida = ultimoResultado();
    checa("pendências do painel", saida?.status === "success" && Number.isInteger(saida.data.rascunhos) && saida.data.rascunhos >= 1);
    r = await marina.req("POST", "/api/ia/mensagens", { texto: `acao falta_para_publicar {"rifa":"${SLUG_MARINA}"}` });
    saida = ultimoResultado();
    checa(
      "o que falta para publicar: só consulta, a régua do botão, nada para confirmar",
      r.json?.acao === null && saida?.status === "success" && saida.data.podePublicar === false && Array.isArray(saida.data.falta) && saida.data.falta.length > 0,
      JSON.stringify(saida).slice(0, 160),
    );
    checa("…e a rifa segue em rascunho", (await db.select({ s: campaigns.status }).from(campaigns).where(eq(campaigns.id, rifaM.id)))[0]?.s === "draft");
    r = await marina.req("POST", "/api/ia/mensagens", { texto: `acao falta_para_publicar {"rifa":"${SLUG_VIZINHA}"}` });
    saida = ultimoResultado();
    checa("o que falta na rifa do vizinho: não existe", saida?.status === "error" && /Não achei/.test(saida.error));
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "acao falta_para_sacar {}" });
    saida = ultimoResultado();
    checa("o que falta para sacar é do afiliado, não da organização", saida?.status === "error" && /não está disponível/.test(saida.error));

    console.log("\nO que a IA pede é conferido antes");
    await zerarLimites();
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "acao apagar_tudo {}" });
    saida = ultimoResultado();
    checa("ação desconhecida volta como erro ao agente", saida?.status === "error" && /não está disponível/.test(saida.error));
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "acao minhas_comissoes {}" });
    saida = ultimoResultado();
    checa("ação do afiliado não é da organização", saida?.status === "error" && /não está disponível/.test(saida.error));
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "acao consultar_pedido {\"codigo\":\"12; drop table\"}" });
    saida = ultimoResultado();
    checa("entrada fora do formato volta como erro", saida?.status === "error" && /8 dígitos/.test(saida.error));
    r = await marina.req("POST", "/api/ia/mensagens", { texto: `acao excluir_rifa {"rifa":"${SLUG_VIZINHA}"}` });
    saida = ultimoResultado();
    checa("a rifa do vizinho não existe: nada para confirmar", r.json?.acao === null && saida?.status === "error" && /Não achei/.test(saida.error));
    r = await marina.req("POST", "/api/ia/mensagens", { texto: `acao publicar_rifa {"rifa":"${SLUG_MARINA}"}` });
    saida = ultimoResultado();
    checa("publicar sem banner nem autorização: o que falta volta antes de pedir confirmação", r.json?.acao === null && saida?.status === "error" && /banner/.test(saida.error), saida?.error?.slice(0, 80));
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "chama no zap 11987654321" });
    checa("o telefone escrito pela pessoa nem sai (422)", r.status === 422, `HTTP ${r.status}`);
    r = await marina.req("POST", "/api/ia/mensagens", { texto: `legenda-com-telefone ${SLUG_MARINA}` });
    saida = ultimoResultado();
    checa("legenda com telefone é recusada antes", r.json?.acao === null && saida?.status === "error");
    checa("…e o telefone que a IA mandou não voltou ao Chatbase", !JSON.stringify(saida).includes("11987654321"));

    console.log("\nGravar espera a confirmação");
    await zerarLimites();
    let n = recebidos.length;
    r = await marina.req("POST", "/api/ia/mensagens", { texto: `acao excluir_rifa {"rifa":"${SLUG_MARINA}"}` });
    const pend = r.json?.acao;
    checa("excluir vira uma ação pendente, com o resumo do servidor", r.status === 200 && pend?.nome === "excluir_rifa" && pend.resumo.includes("Rascunho da Marina (prova da IA)"), r.texto.slice(0, 200));
    checa("…e nada sai para o agente ainda", !recebidos.slice(n).some((x) => x.caminho.endsWith("/tool-result")));
    checa("…a rifa continua lá", (await db.select().from(campaigns).where(eq(campaigns.id, rifaM.id))).length === 1);
    r = await marina.req("GET", "/api/ia/conversa");
    checa("a conversa devolve a ação pendente (para reabrir a coluna)", r.json?.acao?.id === pend?.id);
    r = await vizinha.req("POST", `/api/ia/acoes/${pend.id}/confirmar`);
    checa("outra pessoa não confirma (404)", r.status === 404, `HTTP ${r.status}`);
    r = await marina.req("POST", "/api/ia/acoes/nao-e-id/confirmar");
    checa("id fora do formato: 404", r.status === 404, `HTTP ${r.status}`);

    n = recebidos.length;
    const [c1, c2] = await Promise.all([marina.req("POST", `/api/ia/acoes/${pend.id}/confirmar`), marina.req("POST", `/api/ia/acoes/${pend.id}/confirmar`)]);
    const st = [c1.status, c2.status].sort();
    checa("dois cliques: uma execução e um 409", st[0] === 200 && st[1] === 409, st.join(","));
    const ok = c1.status === 200 ? c1 : c2;
    checa("a rifa foi apagada", (await db.select().from(campaigns).where(eq(campaigns.id, rifaM.id))).length === 0);
    checa("o resultado voltou ao painel e ao agente, que continuou", ok.json?.resultado?.status === "executada" && /^continuei: .*"apagada":true/.test(ok.json?.mensagem?.texto ?? ""), (ok.json?.mensagem?.texto ?? "").slice(0, 100));
    checa("um resultado só foi ao agente", recebidos.slice(n).filter((x) => x.caminho.endsWith("/tool-result")).length === 1);
    const aud = await db.select().from(auditLog).where(and(eq(auditLog.action, "campaign.excluir"), eq(auditLog.entityId, rifaM.id)));
    checa("auditoria: uma linha, feita pela IA, por quem confirmou", aud.length === 1 && (aud[0].diff as any)?.viaIA === true && (aud[0].diff as any)?.acaoIA === pend.id && aud[0].actorId === uMarina.id);
    checa("a linha da ação ficou executada", (await linhaDa(pend.id))?.status === "executada");
    r = await marina.req("POST", `/api/ia/acoes/${pend.id}/recusar`);
    checa("decidir de novo: 409", r.status === 409, `HTTP ${r.status}`);

    console.log("\nRecusar, vencer e uma de cada vez");
    await zerarLimites();
    const [rifaM2] = await novaRifa(uMarina.org!, SLUG_MARINA, "Rascunho da Marina (prova da IA)");
    r = await marina.req("POST", "/api/ia/mensagens", { texto: `acao atualizar_legenda {"rifa":"${SLUG_MARINA}","legenda":"Sorteio no sábado!"}` });
    let p2 = r.json?.acao;
    checa("legenda espera confirmação, com o texto novo no resumo", p2?.nome === "atualizar_legenda" && p2.resumo.includes("Sorteio no sábado!"));
    r = await marina.req("POST", `/api/ia/acoes/${p2.id}/recusar`);
    saida = ultimoResultado();
    const [semLegenda] = await db.select({ legenda: campaigns.legenda }).from(campaigns).where(eq(campaigns.id, rifaM2.id));
    checa("recusar não muda nada e avisa o agente", r.status === 200 && r.json?.resultado?.status === "recusada" && semLegenda.legenda === null && saida?.status === "error" && /não confirmou/.test(saida.error));

    r = await marina.req("POST", "/api/ia/mensagens", { texto: `acao atualizar_legenda {"rifa":"${SLUG_MARINA}","legenda":"Sorteio no domingo!"}` });
    p2 = r.json?.acao;
    n = recebidos.length;
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "mudei de ideia, e as vendas?" });
    checa("escrever de novo vence a pendente e avisa o agente", r.status === 200 && (await linhaDa(p2.id))?.status === "expirada" && recebidos.slice(n).some((x) => x.caminho.endsWith("/tool-result") && x.corpo?.toolCallId && x.corpo.output?.status === "error"));
    r = await marina.req("POST", `/api/ia/acoes/${p2.id}/confirmar`);
    checa("…e confirmar depois é 409", r.status === 409, `HTTP ${r.status}`);

    r = await marina.req("POST", "/api/ia/mensagens", { texto: `acao atualizar_legenda {"rifa":"${SLUG_MARINA}","legenda":"Sorteio na segunda!"}` });
    p2 = r.json?.acao;
    await db.update(iaAcoes).set({ criadaEm: sql`now() - interval '11 minutes'` }).where(eq(iaAcoes.id, p2.id));
    r = await marina.req("POST", `/api/ia/acoes/${p2.id}/confirmar`);
    checa("passou do prazo: 409 e nada muda", r.status === 409 && /venceu/.test(r.json?.message ?? "") && (await db.select({ l: campaigns.legenda }).from(campaigns).where(eq(campaigns.id, rifaM2.id)))[0].l === null, `HTTP ${r.status}`);

    await zerarLimites();
    r = await marina.req("POST", "/api/ia/mensagens", { texto: `duas ${SLUG_MARINA}` });
    const duas = await db.select().from(iaAcoes).where(and(eq(iaAcoes.userId, uMarina.id), inArray(iaAcoes.toolCallId, [`call_${seq}_excluir_rifa`, `call_${seq}_b`])));
    checa("duas gravações na mesma resposta: uma espera, a outra é recusada", r.json?.acao?.nome === "excluir_rifa" && duas.filter((x) => x.status === "pendente").length === 1 && duas.filter((x) => x.status === "recusada_pelo_sistema").length === 1, duas.map((x) => x.status).join(","));
    r = await marina.req("DELETE", "/api/ia/conversa");
    checa("nova conversa vence a pendente", r.status === 204 && (await db.select().from(iaAcoes).where(and(eq(iaAcoes.userId, uMarina.id), eq(iaAcoes.status, "pendente")))).length === 0);

    r = await marina.req("POST", "/api/ia/mensagens", { texto: `acao atualizar_legenda {"rifa":"${SLUG_MARINA}","legenda":"Boa sorte a todos!"}` });
    p2 = r.json?.acao;
    r = await marina.req("POST", `/api/ia/acoes/${p2.id}/confirmar`);
    const [comLegenda] = await db.select({ legenda: campaigns.legenda }).from(campaigns).where(eq(campaigns.id, rifaM2.id));
    const audLeg = await db.select().from(auditLog).where(and(eq(auditLog.action, "campaign.legenda"), eq(auditLog.entityId, rifaM2.id)));
    checa("confirmada, a legenda muda e fica na auditoria como feita pela IA", r.status === 200 && comLegenda.legenda === "Boa sorte a todos!" && audLeg.length === 1 && (audLeg[0].diff as any)?.viaIA === true);

    console.log("\nEstorno pelo protocolo do chamado");
    await zerarLimites();
    const estornoAntes = (await getPlataforma()).estornoManual;
    await setPlataforma({ estornoManual: true });
    const pedidoPago = pedidoTeste;
    await db.delete(chamados).where(eq(chamados.protocolo, PROTOCOLO));
    const [ch] = await db
      .insert(chamados)
      .values({ protocolo: PROTOCOLO, organizationId: uMarina.org!, orderId: pedidoPago.id, buyerId: pedidoPago.buyerId, motivo: "prova da IA", status: "aberto", devolverCents: pedidoPago.amount })
      .returning({ id: chamados.id });
    try {
      r = await marina.req("POST", "/api/ia/mensagens", { texto: `acao estornar_chamado {"protocolo":"${PROTOCOLO}"}` });
      saida = ultimoResultado();
      checa("chamado ainda aberto: recusado antes de pedir confirmação", r.json?.acao === null && saida?.status === "error" && /Só chamado aprovado/.test(saida.error));
      await db.update(chamados).set({ status: "aprovado" }).where(eq(chamados.id, ch.id));
      r = await vizinha.req("POST", "/api/ia/mensagens", { texto: `acao estornar_chamado {"protocolo":"${PROTOCOLO}"}` });
      saida = ultimoResultado();
      checa("o chamado da Marina não existe para a vizinha", r.json?.acao === null && saida?.status === "error" && /Não achei/.test(saida.error));
      r = await marina.req("POST", "/api/ia/mensagens", { texto: `acao estornar_chamado {"protocolo":"${PROTOCOLO}"}` });
      const pe = r.json?.acao;
      checa("aprovado: espera a confirmação, com protocolo e valor no resumo", pe?.nome === "estornar_chamado" && pe.resumo.includes(PROTOCOLO) && /R\$/.test(pe.resumo), pe?.resumo);
      const [quem] = await db.select({ nome: buyers.name, phone: buyers.phone }).from(buyers).where(eq(buyers.id, pedidoPago.buyerId));
      checa("…sem nome nem telefone de quem comprou no resumo", !pe?.resumo?.includes(quem.phone) && !(quem.nome && quem.nome.length > 3 && pe?.resumo?.includes(quem.nome)));
      r = await marina.req("POST", `/api/ia/acoes/${pe.id}/recusar`);
      const [depois] = await db.select({ status: chamados.status }).from(chamados).where(eq(chamados.id, ch.id));
      const [pedidoDepois] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, pedidoPago.id));
      checa("cancelado: o chamado segue aprovado e o pedido não muda", r.status === 200 && depois.status === "aprovado" && pedidoDepois.status === pedidoPago.status);
    } finally {
      await db.delete(chamados).where(eq(chamados.id, ch.id));
      await setPlataforma({ estornoManual: estornoAntes });
    }

    console.log("\nTeto de rodadas e o afiliado");
    await zerarLimites();
    n = recebidos.length;
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "laço" });
    const chats = recebidos.slice(n).filter((x) => x.caminho.endsWith("/chat")).length;
    checa("o agente que pede ação sem parar é cortado (1 mensagem + 3 continuações)", r.status === 200 && chats === 4 && /Parei aqui/.test(r.json?.mensagem?.texto ?? ""), `${chats} chamadas`);

    await zerarLimites();
    // Um crédito só: a primeira resposta o gasta, e a próxima rodada não sai (a dívida fica numa resposta só).
    await db.update(iaContas).set({ franquiaMilicreditos: 1000, avulsoMilicreditos: 0 }).where(eq(iaContas.titularId, uMarina.org!));
    n = recebidos.length;
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "laço" });
    const chatsSemSaldo = recebidos.slice(n).filter((x) => x.caminho.endsWith("/chat")).length;
    checa("o saldo acaba no meio das rodadas: para ali, sem chamar o Chatbase de novo", r.status === 200 && chatsSemSaldo === 1 && /créditos do assistente acabaram/.test(r.json?.mensagem?.texto ?? ""), `${chatsSemSaldo} chamadas`);
    r = await marina.req("POST", "/api/ia/mensagens", { texto: "e agora?" });
    checa("…e a próxima mensagem é recusada (402)", r.status === 402, `HTTP ${r.status}`);

    r = await joao.req("POST", "/api/ia/mensagens", { texto: "acao minhas_comissoes {}" });
    checa("sem a liberação, o afiliado nem conversa (404)", r.status === 404, `HTTP ${r.status}`);
    console.log("\nO afiliado: o que falta para sacar");
    r = await admin.req("PUT", "/api/admin/ia/config", { ligado: true, agenteId: AGENTE, paraOrganizador: true, paraAfiliado: true, cobranca: COBRANCA });
    checa("liberar o afiliado", r.status === 200, `HTTP ${r.status} ${r.texto.slice(0, 80)}`);
    {
      const p = await joao.req("POST", "/api/ia/pagamentos", { tipo: "assinatura", documento: "11144477735" });
      if (p.status !== 201) throw new Error(`Pix da assinatura do afiliado: HTTP ${p.status} ${p.texto}`);
      await joao.req("POST", `/api/dev/ia-pagamento/${p.json.codigo}`);
    }
    await zerarLimites();
    r = await joao.req("POST", "/api/ia/mensagens", { texto: "acao falta_para_sacar {}" });
    saida = ultimoResultado();
    checa(
      "o que falta para sacar: só consulta, com o cadastro fiscal e o saldo por quem paga",
      r.status === 200 && r.json?.acao === null && saida?.status === "success" && typeof saida.data.podeSacar === "boolean" && Array.isArray(saida.data.falta) && Array.isArray(saida.data.porQuemPaga) && typeof saida.data.cadastroFiscal === "string",
      JSON.stringify(saida).slice(0, 200),
    );
    checa("…sem chave Pix nem CPF/CNPJ no resultado", !/pix_key|cpf|cnpj\"?:\s*\"\d/i.test(JSON.stringify(saida?.data ?? {})));
    r = await joao.req("POST", "/api/ia/mensagens", { texto: `acao falta_para_publicar {"rifa":"${SLUG_MARINA}"}` });
    saida = ultimoResultado();
    checa("o afiliado não consulta a publicação da rifa", saida?.status === "error" && /não está disponível/.test(saida.error));
    r = await anon.req("POST", `/api/ia/acoes/${p2.id}/confirmar`);
    checa("sem login: 401", r.status === 401, `HTTP ${r.status}`);

    const tudo = JSON.stringify(recebidos.filter((x) => x.caminho.endsWith("/tool-result")).map((x) => x.corpo));
    checa("nenhum resultado levou telefone, CPF ou e-mail", !/\d{2}\s?9\d{4}-?\d{4}|\d{3}\.\d{3}\.\d{3}-\d{2}|@[a-z]+\./.test(tudo));
    checa("a chave nunca foi no corpo", !tudo.includes(CHAVE));
    void rifaV;
  } finally {
    await admin.req("PUT", "/api/admin/ia/config", antes ?? { ligado: false, agenteId: "", paraOrganizador: false, paraAfiliado: false });
    await limpar();
    await db.delete(users).where(eq(users.id, uVizinha.id));
    await db.delete(organizations).where(eq(organizations.id, orgVizinha.id)).catch(() => {});
    falso.close();
  }
}

main()
  .then(async () => {
    await pool.end();
    if (falhas) {
      console.error(`\n${falhas} verificação(ões) falharam.`);
      process.exit(1);
    }
    console.log("\nTudo certo.");
  })
  .catch(async (e) => {
    console.error(e);
    await pool.end().catch(() => {});
    process.exit(1);
  });
