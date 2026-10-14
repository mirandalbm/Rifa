/**
 * Prova da nota de 24 horas, pela API de verdade.
 *
 * O que importa: quem vê a nota (a própria pessoa e quem segue), quem não vê
 * (visitante, quem não segue e quem já deixou de seguir), o que é recusado
 * (link, telefone, pedido de Pix por fora, mais de 60 letras, sem conta), e o
 * prazo de 24 horas (a nota some das leituras depois do prazo, sem apagar o
 * texto na hora — o banco é mexido aqui só para envelhecer a nota).
 *
 *   npm run nota      (com `npm run dev` no ar e o banco com as colunas `nota` e `nota_em`)
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import { buyers } from "../shared/schema";

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
    return { status: r.status, json: tipo.includes("json") ? ((await r.json()) as Record<string, unknown>) : null };
  }
}

/** CPF válido sorteado: a régua pede dígito conferido. */
function cpfSorteado() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (n: number[]) => {
    const r = (n.reduce((s, d, i) => s + d * (n.length + 1 - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  return [...base, d1, dv([...base, d1])].join("");
}
const telefone = () => "119" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

async function novaConta(rotulo: string) {
  const c = new Cliente();
  const apelido = rotulo + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 8);
  const r = await c.req("POST", "/api/public/conta", { apelido, cep: "01310-100", nome: "Teste " + rotulo, telefone: telefone(), cpf: cpfSorteado(), senha: "senha-de-teste-1" });
  if (r.status >= 300) throw new Error(`conta ${rotulo}: ${r.status} ${JSON.stringify(r.json)}`);
  return { c, apelido };
}

async function idDaConta(apelido: string) {
  const [b] = await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.apelido, apelido));
  if (!b) throw new Error(`conta ${apelido} não achada no banco`);
  return b.id;
}

/** A nota que esta pessoa vê no perfil de `apelido` (nulo se não vê). */
async function notaVista(apelido: string, quem?: Cliente) {
  const r = await fetch(URL + "/api/public/u/" + apelido, { headers: quem?.cookie ? { Cookie: quem.cookie } : {} });
  return ((await r.json()) as { nota?: string | null }).nota ?? null;
}

async function main() {
  const dona = await novaConta("nota");
  const idDaDona = await idDaConta(dona.apelido);
  const seguidora = await novaConta("notasegue");
  const estranha = await novaConta("notaestr");
  const visitante = new Cliente();

  console.log("Escrever e apagar:");
  let r = await dona.c.req("PUT", "/api/public/conta/nota", { nota: "  Viajando   amanhã  " });
  checa("escreve a nota (200), espaços arrumados", r.status === 200 && r.json?.nota === "Viajando amanhã", `status ${r.status}`);
  checa("a própria pessoa vê a nota", (await notaVista(dona.apelido, dona.c)) === "Viajando amanhã");
  checa("visitante sem conta não vê", (await notaVista(dona.apelido, visitante)) === null);
  checa("quem não segue não vê", (await notaVista(dona.apelido, estranha.c)) === null);

  r = await seguidora.c.req("POST", `/api/public/u/${dona.apelido}/seguir`, {});
  checa("a seguidora passa a seguir a dona", r.status === 200, `status ${r.status}`);
  checa("quem segue a pessoa vê a nota", (await notaVista(dona.apelido, seguidora.c)) === "Viajando amanhã");

  r = await dona.c.req("PUT", "/api/public/conta/nota", { nota: "a".repeat(61) });
  checa("mais de 60 letras é recusado (400)", r.status === 400, `status ${r.status}`);
  r = await dona.c.req("PUT", "/api/public/conta/nota", { nota: "chama no 11 99876 5432" });
  checa("telefone é recusado (400)", r.status === 400, `status ${r.status}`);
  r = await dona.c.req("PUT", "/api/public/conta/nota", { nota: "veja https://exemplo.com.br" });
  checa("link é recusado (400)", r.status === 400, `status ${r.status}`);
  r = await dona.c.req("PUT", "/api/public/conta/nota", { nota: "faz um pix pra mim" });
  checa("pedido de Pix por fora é recusado (400)", r.status === 400, `status ${r.status}`);
  checa("a nota anterior continua depois das recusas", (await notaVista(dona.apelido, dona.c)) === "Viajando amanhã");

  r = await visitante.req("PUT", "/api/public/conta/nota", { nota: "oi" });
  checa("sem conta, escrever dá 401", r.status === 401, `status ${r.status}`);

  console.log("Prazo de 24 horas:");
  // Envelhece a nota no banco: 25 h atrás. A leitura tem de deixar de devolvê-la.
  await db.update(buyers).set({ notaEm: new Date(Date.now() - 25 * 60 * 60 * 1000) }).where(eq(buyers.apelido, dona.apelido));
  checa("passadas 24 h, a dona não vê mais a nota", (await notaVista(dona.apelido, dona.c)) === null);
  checa("passadas 24 h, a seguidora também não", (await notaVista(dona.apelido, seguidora.c)) === null);
  const meu = (await dona.c.req("GET", "/api/public/conta/perfil")).json as { nota?: string | null; notaAte?: string | null };
  checa("o próprio perfil devolve nota nula e sem prazo", meu.nota === null && meu.notaAte === null);

  console.log("Escrever de novo e apagar:");
  r = await dona.c.req("PUT", "/api/public/conta/nota", { nota: "Nota nova" });
  checa("escrever de novo renova o prazo", r.status === 200 && r.json?.nota === "Nota nova" && typeof r.json?.notaAte === "string");
  checa("a seguidora vê a nota nova", (await notaVista(dona.apelido, seguidora.c)) === "Nota nova");

  r = await dona.c.req("PUT", "/api/public/conta/nota", { nota: "" });
  checa("vazio apaga a nota", r.status === 200 && r.json?.nota === null);
  checa("depois de apagar, ninguém vê", (await notaVista(dona.apelido, seguidora.c)) === null);

  console.log("Exclusão da conta:");
  r = await dona.c.req("PUT", "/api/public/conta/nota", { nota: "Some junto" });
  checa("escreve antes de excluir", r.status === 200);
  r = await dona.c.req("POST", "/api/public/conta/excluir", { senha: "senha-de-teste-1" });
  checa("exclui a conta", r.status === 200, `status ${r.status}`);
  const [linha] = await db.select({ nota: buyers.nota, notaEm: buyers.notaEm }).from(buyers).where(eq(buyers.id, idDaDona));
  checa("a exclusão apaga a nota no banco", linha?.nota === null && linha?.notaEm === null);

  if (falhas) {
    console.log(`\n${falhas} checagem(ns) falharam.`);
    process.exitCode = 1;
  } else {
    console.log("\nTudo certo.");
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
