/**
 * A matriz de cobertura da reformulação (fase 0, `docs/PLANO-REFORMULACAO.md`):
 * tudo o que o sistema tem hoje, tirado do código — nunca digitado —, para que
 * nada se perca no caminho.
 *
 *   npm run matriz            reescreve docs/REFORMULACAO-MATRIZ.md
 *   npm run matriz -- --destinos   também acrescenta a docs/reformulacao-destinos.json
 *                             o que for novo (com "a decidir"), sem mexer no que já foi decidido
 *
 * Três unidades, cada uma com o destino que a fase 2 (onde mora cada coisa)
 * vai preencher: a **tela** (rota do `App.tsx`), a **seção** de acesso
 * (`shared/access.ts`) e o **cartão** (componente que a tela usa). As rotas da
 * API não mudam de lugar: entram na matriz com a prova que as cobre, para a
 * reformulação não deixar rota sem prova. `tests/matrizReformulacao.test.ts`
 * falha se a matriz ficar velha ou se algo novo não tiver linha de destino.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MENUS, SECTIONS, type Role, type Section } from "../shared/access";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
export const ARQUIVO_DA_MATRIZ = path.join(RAIZ, "docs/REFORMULACAO-MATRIZ.md");
export const ARQUIVO_DOS_DESTINOS = path.join(RAIZ, "docs/reformulacao-destinos.json");

export const A_DECIDIR = "a decidir";

const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const existe = (rel: string) => fs.existsSync(path.join(RAIZ, rel));

export interface Tela {
  rota: string;
  componente: string;
  arquivo: string | null;
  papel: string;
  secao: string | null;
  rotulo: string | null;
  /** Grupo no menu do organizador e no da plataforma (o master tem outros grupos). */
  grupoDoMenu: string | null;
  grupoNaPlataforma: string | null;
  cartoes: string[];
}
export interface RotaDaApi {
  arquivo: string;
  metodo: string;
  caminho: string;
  provas: string[];
}
export interface Matriz {
  telas: Tela[];
  redirecionamentos: { de: string; para: string }[];
  secoes: (Section & { temTela: boolean; grupoDoMenu: string | null; grupoNaPlataforma: string | null })[];
  api: RotaDaApi[];
  provas: { npm: string; arquivo: string }[];
  testes: number;
}

/* ------------------------------------------------------------------ *
 * Telas (App.tsx)
 * ------------------------------------------------------------------ */

function importsDoApp(app: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const re = /import\s+([^"]*?)\s+from\s+"@\/(pages|components)\/([^"]+)"/g;
  for (const m of app.matchAll(re)) {
    const arquivo = `client/src/${m[2]}/${m[3]}`;
    const lista = m[1].replace(/[{}]/g, " ").split(",");
    for (const bruto of lista) {
      const nome = bruto.trim().split(/\s+as\s+/).pop()?.trim();
      if (nome && /^\w+$/.test(nome)) mapa.set(nome, arquivo);
    }
  }
  return mapa;
}

function arquivoReal(base: string): string | null {
  for (const ext of [".tsx", ".ts", "/index.tsx"]) if (existe(base + ext)) return base + ext;
  return null;
}

/** Os componentes que a tela importa de `@/components`. */
function cartoesDaPagina(arquivo: string | null): string[] {
  if (!arquivo) return [];
  const src = ler(arquivo);
  const nomes = new Set<string>();
  for (const m of src.matchAll(/import\s+([^"]*?)\s+from\s+"@\/components\/([^"]+)"/g)) {
    if (m[2].startsWith("ui/")) continue;
    for (const bruto of m[1].replace(/[{}]/g, " ").replace(/\btype\s+\w+/g, " ").split(",")) {
      const nome = bruto.trim().split(/\s+as\s+/).pop()?.trim();
      if (nome && /^[A-Z]\w*$/.test(nome)) nomes.add(nome);
    }
  }
  return [...nomes].sort();
}

function grupoDe(chave: string, papel: Role): string | null {
  for (const g of MENUS[papel] ?? []) {
    for (const i of g.itens) {
      const chaves = "secao" in i ? [i.secao] : i.filhos;
      if (chaves.includes(chave as never)) return g.titulo ?? "(sem título)";
    }
  }
  return null;
}

export function lerTelas(): { telas: Tela[]; redirecionamentos: { de: string; para: string }[] } {
  const app = ler("client/src/App.tsx");
  const imports = importsDoApp(app);
  const telas: Tela[] = [];
  const redirecionamentos: { de: string; para: string }[] = [];

  // <Route path="X" component={Y} />  e  <Route path="X"> … <Guarded requires="R"> <Y /> …
  const re = /<Route\s+path="([^"]+)"\s*(?:component=\{(\w+)\}\s*\/>|>([\s\S]*?)<\/Route>)/g;
  for (const m of app.matchAll(re)) {
    const rota = m[1];
    let componente = m[2] ?? "";
    let papel = "público";
    if (!componente && m[3]) {
      const r = m[3].match(/requires="(\w+)"/);
      if (r) papel = r[1];
      else if (/<GuardedConta\b/.test(m[3])) papel = "conta";
      const redir = m[3].match(/<Redirect\s+to="([^"]+)"/);
      if (redir) {
        redirecionamentos.push({ de: rota, para: redir[1] });
        continue;
      }
      const c = m[3].match(/<([A-Z]\w*)\s*(?:\/>|>)/g)?.map((x) => x.replace(/[<>/\s]/g, "")).filter((x) => !/^Guarded/.test(x) && x !== "PanelShell");
      componente = c?.[0] ?? "";
    }
    const base = imports.get(componente) ?? null;
    const arquivo = base ? arquivoReal(base) : null;
    const secao = SECTIONS.find((s) => s.path === rota) ?? null;
    telas.push({
      rota,
      componente: componente || "(?)",
      arquivo,
      papel: secao ? secao.requires : papel,
      secao: secao?.key ?? null,
      rotulo: secao?.label ?? null,
      grupoDoMenu: secao ? grupoDe(secao.key, "organizer") : null,
      grupoNaPlataforma: secao ? grupoDe(secao.key, "admin") : null,
      cartoes: cartoesDaPagina(arquivo),
    });
  }
  telas.sort((a, b) => a.rota.localeCompare(b.rota));
  return { telas, redirecionamentos };
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

const MONTAGEM: Record<string, string> = {
  "admin.ts": "/api/admin",
  "affiliate.ts": "/api/affiliate",
  "artesRotas.ts": "(montada em admin.ts e affiliate.ts)",
  "auth.ts": "/api/auth",
  "dev.ts": "/api/dev",
  "ia.ts": "/api/ia",
  "public.ts": "/api/public",
  "seller.ts": "/api/seller",
  "verificacaoRotas.ts": "(montada em public.ts, affiliate.ts e admin.ts)",
  "webhooks.ts": "/api/webhooks",
};

function textoDasProvas(): { texto: string; arquivos: { nome: string; texto: string }[] } {
  const arquivos: { nome: string; texto: string }[] = [];
  for (const pasta of ["scripts", "tests"]) {
    for (const f of fs.readdirSync(path.join(RAIZ, pasta))) {
      if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
      const bruto = ler(`${pasta}/${f}`);
      // Interpolação vira um coringa: `/api/admin/campaigns/${c.id}/legal` casa com /campaigns/:id/legal.
      arquivos.push({ nome: `${pasta}/${f}`, texto: bruto.replace(/\$\{[^}]*\}/g, "\u0001") });
    }
  }
  return { texto: arquivos.map((a) => a.texto).join("\n"), arquivos };
}

function escapar(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function lerApi(): RotaDaApi[] {
  const { arquivos } = textoDasProvas();
  const rotas: RotaDaApi[] = [];
  for (const f of fs.readdirSync(path.join(RAIZ, "server/routes")).sort()) {
    if (!f.endsWith(".ts") || f === "index.ts") continue;
    const src = ler(`server/routes/${f}`);
    const montagem = MONTAGEM[f];
    for (const m of src.matchAll(/\b\w*[rR]outer\.(get|post|put|patch|delete)\(\s*(["'`])([^"'`]+)\2/g)) {
      const caminho = m[3];
      let provas: string[] = [];
      // Rota montada em vários lugares (`${caminho}/consentimento`): o prefixo é
      // variável, então a busca é pelo final — `${V}/consentimento` nas provas.
      const prefixoVariavel = !montagem?.startsWith("/api") && caminho.startsWith("${");
      if (montagem?.startsWith("/api") || prefixoVariavel) {
        const alvo = prefixoVariavel ? "\u0001" + caminho.replace(/^\$\{[^}]*\}/, "") : montagem + caminho;
        // :param e a interpolação do script casam entre si.
        const padrao = escapar(alvo)
          .replace(/:\w+\\\([^)]*\\\)/g, ":p") // `:qual(imagem|poster)` é um parâmetro
          .replace(/:\w+/g, "(?:[^/\\s\"'`?]+|\u0001)")
          .replace(/\\\?/g, "\\?");
        const re = new RegExp(padrao + "(?![\\w/-])");
        provas = arquivos.filter((a) => re.test(a.texto)).map((a) => a.nome);
      }
      rotas.push({ arquivo: `server/routes/${f}`, metodo: m[1].toUpperCase(), caminho: montagem ? caminho : caminho, provas });
    }
  }
  return rotas;
}

/* ------------------------------------------------------------------ *
 * Provas e seções
 * ------------------------------------------------------------------ */

function lerProvas(): { npm: string; arquivo: string }[] {
  const pkg = JSON.parse(ler("package.json")) as { scripts: Record<string, string> };
  const out: { npm: string; arquivo: string }[] = [];
  for (const [nome, cmd] of Object.entries(pkg.scripts)) {
    const m = cmd.match(/scripts\/([\w.-]+\.ts)/);
    if (m) out.push({ npm: nome, arquivo: `scripts/${m[1]}` });
  }
  return out.sort((a, b) => a.npm.localeCompare(b.npm));
}

export function lerMatriz(): Matriz {
  const { telas, redirecionamentos } = lerTelas();
  const rotasDasTelas = new Set(telas.map((t) => t.rota));
  const secoes = SECTIONS.map((s) => ({
    ...s,
    temTela: rotasDasTelas.has(s.path),
    grupoDoMenu: grupoDe(s.key, s.requires === "admin" ? "admin" : (s.requires as Role)),
    grupoNaPlataforma: grupoDe(s.key, "admin"),
  }));
  return {
    telas,
    redirecionamentos,
    secoes,
    api: lerApi(),
    provas: lerProvas(),
    testes: fs.readdirSync(path.join(RAIZ, "tests")).filter((f) => /\.test\.tsx?$/.test(f)).length,
  };
}

/* ------------------------------------------------------------------ *
 * Destinos: o que a fase 2 preenche
 * ------------------------------------------------------------------ */

export type Destinos = Record<string, string>;

/** As unidades que precisam de destino, com a chave estável de cada uma. */
export function chavesDeDestino(m: Matriz): string[] {
  const chaves: string[] = [];
  for (const t of m.telas) {
    chaves.push(`tela:${t.rota}`);
    for (const c of t.cartoes) chaves.push(`cartao:${t.rota}#${c}`);
  }
  for (const s of m.secoes) chaves.push(`secao:${s.key}`);
  return [...new Set(chaves)].sort();
}

export function lerDestinos(): Destinos {
  return existe("docs/reformulacao-destinos.json") ? (JSON.parse(ler("docs/reformulacao-destinos.json")) as Destinos) : {};
}

export function semDestino(m: Matriz, d: Destinos): string[] {
  return chavesDeDestino(m).filter((c) => !(c in d));
}

/* ------------------------------------------------------------------ *
 * Documento
 * ------------------------------------------------------------------ */

const cel = (s: string | number | null | undefined) => String(s ?? "—").replace(/\|/g, "\\|");

export function montarDocumento(m: Matriz, d: Destinos): string {
  const L: string[] = [];
  const destino = (chave: string) => d[chave] ?? "**sem linha**";
  L.push("# Matriz de cobertura da reformulação (fase 0)");
  L.push("");
  L.push(
    "Gerada do código por `npm run matriz` — **não edite à mão** (o teste `tests/matrizReformulacao.test.ts` falha se ficar velha). " +
      "O destino de cada tela, seção e cartão mora em `docs/reformulacao-destinos.json`, que a fase 2 (onde mora cada coisa) preenche; " +
      `enquanto estiver como \`${A_DECIDIR}\`, a unidade ainda não tem lugar novo.`,
  );
  L.push("");
  const cartoes = m.telas.reduce((n, t) => n + t.cartoes.length, 0);
  const decididos = chavesDeDestino(m).filter((c) => d[c] && d[c] !== A_DECIDIR).length;
  L.push("| O que | Quantos |");
  L.push("|---|---|");
  L.push(`| Telas (rotas do \`App.tsx\`) | ${m.telas.length} (+ ${m.redirecionamentos.length} redirecionamentos) |`);
  L.push(`| Seções de acesso (\`shared/access.ts\`) | ${m.secoes.length} |`);
  L.push(`| Cartões (componentes usados pelas telas) | ${cartoes} |`);
  L.push(`| Rotas da API | ${m.api.length}, das quais ${m.api.filter((r) => r.provas.length > 0).length} citadas por alguma prova |`);
  L.push(`| Provas contra a API (\`npm run …\`) | ${m.provas.length} |`);
  L.push(`| Testes de regra (\`tests/\`) | ${m.testes} arquivos |`);
  L.push(`| Destinos decididos | ${decididos} de ${chavesDeDestino(m).length} |`);
  L.push("");

  L.push("## 1. Telas");
  L.push("");
  L.push("| Rota | Papel | Seção | Rótulo no menu | Grupo (organizador) | Grupo (plataforma) | Arquivo | Componente | Destino |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const t of m.telas) {
    L.push(
      `| \`${cel(t.rota)}\` | ${cel(t.papel)} | ${cel(t.secao)} | ${cel(t.rotulo)} | ${cel(t.grupoDoMenu)} | ${cel(t.grupoNaPlataforma)} | ${t.arquivo ? `\`${t.arquivo.replace("client/src/", "")}\`` : "—"} | ${cel(t.componente)} | ${cel(destino(`tela:${t.rota}`))} |`,
    );
  }
  L.push("");
  if (m.redirecionamentos.length) {
    L.push("Redirecionamentos (o endereço de antes segue valendo):");
    L.push("");
    for (const r of m.redirecionamentos) L.push(`- \`${r.de}\` → \`${r.para}\``);
    L.push("");
  }

  L.push("## 2. Seções de acesso");
  L.push("");
  L.push("| Seção | Rota | Rótulo | Papel mínimo | No menu | Grupo (do papel) | Grupo (plataforma) | Tem tela | Destino |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const s of m.secoes) {
    L.push(
      `| \`${s.key}\` | \`${s.path}\` | ${cel(s.label)} | ${s.requires} | ${s.nav ? "sim" : "não"} | ${cel(s.grupoDoMenu)} | ${cel(s.grupoNaPlataforma)} | ${s.temTela ? "sim" : "**não**"} | ${cel(destino(`secao:${s.key}`))} |`,
    );
  }
  L.push("");

  L.push("## 3. Cartões por tela");
  L.push("");
  L.push("Cada componente que a tela importa de `components/` precisa de lugar novo (ou da decisão de sair).");
  L.push("");
  for (const t of m.telas.filter((x) => x.cartoes.length)) {
    L.push(`### \`${t.rota}\` — ${cel(t.rotulo ?? t.componente)}`);
    L.push("");
    L.push("| Cartão | Destino |");
    L.push("|---|---|");
    for (const c of t.cartoes) L.push(`| \`${c}\` | ${cel(destino(`cartao:${t.rota}#${c}`))} |`);
    L.push("");
  }

  L.push("## 4. Rotas da API e a prova que cada uma tem");
  L.push("");
  L.push(
    "A API não muda de lugar na reformulação. Aqui está para que a tela nova não deixe rota sem prova: " +
      "\"—\" quer dizer que nenhum arquivo de `scripts/` ou `tests/` cita o caminho.",
  );
  L.push("");
  const porArquivo = new Map<string, RotaDaApi[]>();
  for (const r of m.api) porArquivo.set(r.arquivo, [...(porArquivo.get(r.arquivo) ?? []), r]);
  for (const [arquivo, rotas] of porArquivo) {
    const base = arquivo.split("/").pop() as string;
    L.push(`### \`${arquivo}\` — ${MONTAGEM[base] ?? "?"} (${rotas.length} rotas, ${rotas.filter((r) => r.provas.length).length} com prova)`);
    L.push("");
    L.push("| Método | Caminho | Provas |");
    L.push("|---|---|---|");
    for (const r of rotas) {
      const provas = r.provas.slice(0, 3).map((p) => `\`${p.replace(/^(scripts|tests)\//, "")}\``).join(", ") + (r.provas.length > 3 ? ` +${r.provas.length - 3}` : "");
      L.push(`| ${r.metodo} | \`${cel(r.caminho)}\` | ${r.provas.length ? provas : "—"} |`);
    }
    L.push("");
  }

  L.push("## 5. Rotas que nenhuma prova cita");
  L.push("");
  L.push(
    "Busca literal do caminho em `scripts/` e `tests/` (a interpolação vale como parâmetro): é a lista do que a reformulação " +
      "mexe sem rede de proteção. Pode haver prova que chega à rota por outro caminho; o contrário (prova que cita e não confere) a busca não vê.",
  );
  L.push("");
  for (const [arquivo, rotas] of porArquivo) {
    const sem = rotas.filter((r) => r.provas.length === 0);
    if (!sem.length) continue;
    L.push(`- \`${arquivo}\` (${sem.length} de ${rotas.length}): ${sem.map((r) => `${r.metodo} \`${r.caminho}\``).join(", ")}`);
  }
  L.push("");

  L.push("## 6. Provas contra a API");
  L.push("");
  L.push("| `npm run` | Arquivo |");
  L.push("|---|---|");
  for (const p of m.provas) L.push(`| \`${p.npm}\` | \`${p.arquivo}\` |`);
  L.push("");
  return L.join("\n");
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function principal() {
  const m = lerMatriz();
  let destinos = lerDestinos();
  if (process.argv.includes("--destinos")) {
    const novas = semDestino(m, destinos);
    destinos = { ...destinos };
    for (const c of novas) destinos[c] = A_DECIDIR;
    const ordenado = Object.fromEntries(Object.entries(destinos).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(ARQUIVO_DOS_DESTINOS, JSON.stringify(ordenado, null, 2) + "\n");
    destinos = ordenado;
    console.log(`destinos: ${novas.length} novo(s) como "${A_DECIDIR}" (${Object.keys(destinos).length} no total)`);
  }
  fs.writeFileSync(ARQUIVO_DA_MATRIZ, montarDocumento(m, destinos));
  const faltam = semDestino(m, destinos);
  console.log(
    `matriz: ${m.telas.length} telas, ${m.secoes.length} seções, ${m.api.length} rotas da API; ${faltam.length} unidade(s) sem linha de destino` +
      (faltam.length ? " (rode com --destinos)" : ""),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) principal();
