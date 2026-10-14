/**
 * Prova do seguir entre apostadores, pela API de verdade.
 *
 * O que importa: o número de seguidores é o que a tabela diz (cinco pedidos
 * ao mesmo tempo contam uma vez só), não se segue a si mesmo, o perfil mostra
 * "seguindo" só para quem segue, e a exclusão da conta desfaz os seguir nos
 * dois sentidos (senão os números das outras contas ficariam inflados).
 *
 *   npm run seguir-pessoas      (com `npm run dev` no ar e o banco com a tabela `seguidores_pessoas`)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";

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

async function perfil(apelido: string, c?: Cliente) {
  const r = await fetch(URL + "/api/public/u/" + apelido, { headers: c?.cookie ? { Cookie: c.cookie } : {} });
  return (await r.json()) as { seguidores: number; seguidoPorMim: boolean; proprio: boolean; telefone?: string; cpf?: string };
}

async function main() {
  const a = await novaConta("sega");
  const b = await novaConta("segb");

  console.log("Seguir:");
  let r = await a.c.req("POST", `/api/public/u/${b.apelido}/seguir`, {});
  checa("A segue B", r.status === 200 && r.json?.seguindo === true, `status ${r.status}`);
  checa("B tem 1 seguidor", (await perfil(b.apelido)).seguidores === 1);
  checa("para A, o perfil de B mostra que ele já segue", (await perfil(b.apelido, a.c)).seguidoPorMim === true);
  checa("para B, o próprio perfil não é 'seguido por mim'", (await perfil(a.apelido, b.c)).seguidoPorMim === false);

  r = await a.c.req("POST", `/api/public/u/${b.apelido}/seguir`, {});
  checa("seguir de novo não conta outra vez", r.status === 200 && (await perfil(b.apelido)).seguidores === 1);

  r = await a.c.req("POST", `/api/public/u/${a.apelido}/seguir`, {});
  checa("não segue a si mesmo (422)", r.status === 422, `status ${r.status}`);

  const sem = new Cliente();
  r = await sem.req("POST", `/api/public/u/${b.apelido}/seguir`, {});
  checa("sem conta, 401", r.status === 401, `status ${r.status}`);

  console.log("Em paralelo e nos dois sentidos:");
  const cinco = await Promise.all(Array.from({ length: 5 }, () => b.c.req("POST", `/api/public/u/${a.apelido}/seguir`, {})));
  checa("B segue A cinco vezes ao mesmo tempo, todas 200", cinco.every((x) => x.status === 200), cinco.map((x) => x.status).join(","));
  checa("A tem 1 seguidor, não 5", (await perfil(a.apelido)).seguidores === 1);

  console.log("Deixar de seguir:");
  r = await a.c.req("DELETE", `/api/public/u/${b.apelido}/seguir`);
  checa("A deixa de seguir B", r.status === 200 && r.json?.seguindo === false);
  checa("B volta a 0 seguidores", (await perfil(b.apelido)).seguidores === 0);
  r = await a.c.req("DELETE", `/api/public/u/${b.apelido}/seguir`);
  checa("deixar de seguir de novo não desconta além de zero", r.status === 200 && (await perfil(b.apelido)).seguidores === 0);

  console.log("Exclusão desfaz o seguir:");
  await a.c.req("POST", `/api/public/u/${b.apelido}/seguir`, {});
  checa("B volta a ter 1 seguidor (A)", (await perfil(b.apelido)).seguidores === 1);
  r = await a.c.req("POST", "/api/public/conta/excluir", { senha: "senha-de-teste-1" });
  checa("A exclui a conta", r.status === 200, `status ${r.status}`);
  checa("B volta a 0 seguidores quando A sai", (await perfil(b.apelido)).seguidores === 0);

  console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
