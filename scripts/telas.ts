/**
 * As telas nas três versões — celular, tablet e computador — de uma vez só.
 *
 * Abre cada rota de cada papel nas larguras da leva (docs/VERSOES.md), tira
 * a captura da página inteira e mede o que dá para medir sem olho humano:
 *
 * Reprova (sai com código 1):
 * - a página rola para o lado (estouro horizontal);
 * - erro de JavaScript na página ou resposta 5xx da API;
 * - botão, link ou campo sem nome, e imagem sem `alt`;
 * - campo de digitar com letra menor que 16 px no celular (o iPhone aproxima
 *   a tela ao tocar nele).
 *
 * Avisa (a regra existe, mas quem decide é o olho):
 * - número que o usuário lê fora da `tnum`;
 * - alvo de toque menor que 24 × 24 no celular (WCAG 2.5.8);
 * - campo que só tem placeholder como nome;
 * - página sem `h1`, ou com mais de um;
 * - erro no console do navegador.
 *
 *   npm run telas                          (com `npm run dev` no ar e o seed aplicado)
 *   npm run telas -- --larguras 390        (só o celular)
 *   npm run telas -- --papel organizador,cambista
 *   npm run telas -- --tema escuro
 *   npm run telas -- --saida /tmp/telas
 *
 * As capturas e o `relatorio.json` ficam em `capturas/` (fora do git). Abra
 * `capturas/index.html` para ver cada tela nas três larguras lado a lado.
 * O Chromium sai de `CHROMIUM` ou de /opt/pw-browsers/chromium.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { baseUrl } from "./base-url";
import { pool } from "../server/db";

const URL = baseUrl();
const arg = (nome: string) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const LARGURAS = (arg("larguras") ?? "390,820,1440").split(",").map(Number);
const SO_PAPEIS = arg("papel")?.split(",");
const TEMA = arg("tema") === "escuro" ? "escuro" : "claro";
const SAIDA = path.resolve(arg("saida") ?? "capturas");
const CHROMIUM =
  process.env.CHROMIUM ?? (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

/** Altura da janela de cada versão: a de um aparelho comum daquela largura. */
const altura = (w: number) => (w < 640 ? 844 : w < 1024 ? 1180 : 900);

/** CPF válido a partir de 9 dígitos — só da conta de exemplo desta ferramenta. */
function cpf(base: string) {
  const d = base.split("").map(Number);
  for (const n of [9, 10]) {
    const soma = d.slice(0, n).reduce((s, x, i) => s + x * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

/** A conta de apostador das capturas. Criada na primeira vez; depois só entra. */
const APOSTADOR = {
  nome: "Tela Apostador Exemplo",
  apelido: "telas.apostador",
  telefone: "11970009001",
  cpf: cpf("570009001"),
  cep: "01310100",
  senha: "telas-apostador-1",
};

type Login = { url: string; corpo: Record<string, string>; criar?: { url: string; corpo: Record<string, string> } };
type Papel = { login?: Login; rotas: string[] };

/**
 * Os exemplos que as rotas pedem (rifa, pedido, carrinho, recibo, apelido)
 * saem do banco do desenvolvimento. Rota cujo exemplo não existe fica de
 * fora, e o relatório diz qual.
 */
async function papeis(): Promise<{ papeis: Record<string, Papel>; carrinho: string[]; faltou: string[] }> {
  const faltou: string[] = [];
  const vitrine = (await (await fetch(`${URL}/api/public/campaigns`)).json()) as {
    slug: string;
    vende: boolean;
    organizacao?: { slug: string };
  }[];
  const rifa = vitrine.find((c) => c.vende) ?? vitrine[0];
  const um = async (consulta: string, nome: string) => {
    const linha = (await pool.query(consulta)).rows[0];
    if (!linha) faltou.push(nome);
    return linha ? String(Object.values(linha)[0]) : null;
  };
  const pedido = await um(`select code from orders where status = 'paid' order by created_at limit 1`, "pedido pago");
  const carrinho = await um(`select codigo from carrinho_pedidos order by created_at limit 1`, "carrinho");
  const recibo = await um(`select codigo from recibos order by created_at limit 1`, "recibo");
  const apelido = await um(
    `select apelido from buyers where apelido is not null and apelido <> '${APOSTADOR.apelido}' order by created_at limit 1`,
    "apostador com apelido",
  );
  const uf = await um(
    `select uf from organizations where slug = '${(rifa?.organizacao?.slug ?? "").replace(/'/g, "")}'`,
    "UF da promotora",
  );
  if (!rifa) faltou.push("rifa publicada");

  const so = (cond: unknown, ...rotas: string[]) => (cond ? rotas : []);
  const r = rifa?.slug;
  const o = rifa?.organizacao?.slug;
  return {
    faltou,
    carrinho: vitrine.filter((c) => c.vende).slice(0, 2).map((c) => c.slug),
    papeis: {
      anonimo: {
        rotas: [
          "/",
          ...so(r, `/r/${r}`),
          ...so(o, `/o/${o}`),
          ...so(r && o, `/o/${o}/r/${r}/regulamento`),
          "/ajuda",
          "/termos",
          "/privacidade",
          ...so(uf, `/estado/${uf}`),
          ...so(pedido, `/pedido/${pedido}`, `/bilhete/${pedido}`),
          "/minhas-cotas",
          "/carrinho",
          ...so(carrinho, `/carrinho/pix/${carrinho}`),
          "/notificacoes",
          "/publicar",
          "/perfil",
          "/perfil/configuracoes",
          "/reels",
          "/mensagens",
          "/buscar",
          ...so(apelido, `/u/${apelido}`),
          "/entrar",
          "/criar-conta",
          "/seja-afiliado",
          ...so(recibo, `/recibo/${recibo}`),
          "/pagina-que-nao-existe",
        ],
      },
      apostador: {
        login: {
          url: "/api/public/conta/entrar",
          corpo: { identificador: APOSTADOR.telefone, senha: APOSTADOR.senha },
          criar: { url: "/api/public/conta", corpo: APOSTADOR },
        },
        rotas: ["/", "/perfil", "/perfil/configuracoes", "/perfil/bilhetes", "/minhas-cotas", "/minhas-cotas?aba=conta", "/notificacoes", "/mensagens", "/publicar", `/u/${APOSTADOR.apelido}`, ...so(r, `/r/${r}`)],
      },
      organizador: {
        login: { url: "/api/auth/login", corpo: { email: "marina@rifassaojose.br", password: "organizador123" } },
        rotas: [
          "/admin",
          "/admin/campanhas",
          "/admin/pedidos",
          "/admin/resultados",
          "/admin/stories",
          "/admin/banner-pago",
          "/admin/atendimento",
          "/admin/afiliados",
          "/admin/cambistas",
          "/admin/financeiro",
          "/admin/sorteios",
          "/admin/sorteios-oficiais",
          "/admin/cobranca",
          "/admin/usuarios",
          "/admin/patrocinio",
          "/admin/marketing",
          "/admin/exportacoes",
          "/admin/configuracoes",
          "/conta/senha",
          ...so(o, `/o/${o}`),
        ],
      },
      plataforma: {
        login: {
          url: "/api/auth/login",
          corpo: {
            email: process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br",
            password: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
          },
        },
        rotas: [
          "/admin",
          "/admin/caixa",
          "/admin/pedidos",
          "/admin/sorteios-oficiais",
          "/admin/organizacoes",
          "/admin/bonus",
          "/admin/banner-pago",
          "/admin/fiscal",
          "/admin/aparencia",
          "/admin/antifraude",
          "/admin/atendimento",
          "/admin/patrocinio",
          "/admin/marketing",
          "/admin/configuracoes",
        ],
      },
      afiliado: {
        login: { url: "/api/auth/login", corpo: { email: "joao@rifa.br", password: "joao123" } },
        rotas: [
          "/afiliado",
          "/afiliado/links",
          "/afiliado/divulgar",
          "/afiliado/organizacoes",
          "/afiliado/comissoes",
          "/afiliado/saques",
          "/afiliado/dados",
          "/perfil",
        ],
      },
      cambista: {
        login: { url: "/api/auth/login", corpo: { email: "sergio@rifa.br", password: "cambista123" } },
        rotas: ["/cambista", "/cambista/vendas", "/cambista/acerto"],
      },
    },
  };
}

/** Roda dentro da página. Nada de fora dela entra aqui. */
function medir() {
  const W = window.innerWidth;
  const celular = W < 640;
  const desc = (el: Element) => {
    const cls = (typeof el.className === "string" ? el.className : "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
    const txt = ((el as HTMLElement).innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30);
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${txt ? ` «${txt}»` : ""}`;
  };
  /** Dentro de uma faixa que rola sozinha (abas, carrossel), sair da tela é de propósito. */
  const dentroDeRolagem = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) {
        const r = p.getBoundingClientRect();
        if (r.right <= W + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };

  const estouro = document.documentElement.scrollWidth > W + 1 ? document.documentElement.scrollWidth : 0;
  const foraDaTela: string[] = [];
  if (estouro) {
    for (const el of document.body.querySelectorAll("*")) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || (b.right <= W + 1 && b.left >= -1)) continue;
      const pai = el.parentElement?.getBoundingClientRect();
      if (pai && (pai.right > W + 1 || pai.left < -1)) continue; // o culpado é o pai
      if (dentroDeRolagem(el)) continue;
      foraDaTela.push(`${desc(el)} [${Math.round(b.left)}→${Math.round(b.right)}]`);
    }
  }

  const semNome: string[] = [];
  const soPlaceholder: string[] = [];
  /** Fora da árvore de acessibilidade de propósito (a foto que repete o link do título). */
  const escondido = (el: Element) => {
    if (el.closest("[aria-hidden=true]")) return true;
    // Conteúdo de `<details>` fechado (o menu "⋮"): não aparece nem é
    // anunciado até abrir, e o Chromium devolve `innerText` vazio dele. O
    // `summary` é o que está à mostra.
    const d = el.closest("details:not([open])");
    return Boolean(d && !el.closest("summary"));
  };
  for (const el of document.querySelectorAll(
    "button, a[href], [role=button], input:not([type=hidden]), select, textarea",
  )) {
    if (!el.getBoundingClientRect().width || escondido(el)) continue;
    let nome = (el.getAttribute("aria-label") || el.getAttribute("title") || (el as HTMLElement).innerText || "").trim();
    if (!nome) nome = [...el.querySelectorAll("img[alt]")].map((i) => (i as HTMLImageElement).alt).join("").trim();
    const rotulo = el.getAttribute("aria-labelledby");
    if (!nome && rotulo) nome = rotulo.split(/\s+/).map((id) => document.getElementById(id)?.innerText ?? "").join(" ").trim();
    if (!nome && el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) nome = "label";
    if (!nome && el.closest("label")) nome = "label";
    if (nome) continue;
    if (el.getAttribute("placeholder")) soPlaceholder.push(desc(el) + ` «${el.getAttribute("placeholder")}»`);
    else semNome.push(desc(el));
  }
  const imgSemAlt = [...document.querySelectorAll("img:not([alt])")].map((i) => (i as HTMLImageElement).src.slice(-50));

  const semTnum: string[] = [];
  const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (andar.nextNode()) {
    // Só o valor solto ("R$ 4,90", "10/10/2026", "5%", "1.000"): a frase que
    // cita um número e o título que o organizador escreveu não são valores.
    const t = (andar.currentNode.nodeValue ?? "").trim();
    if (!/\d/.test(t) || !/^(R\$)?[\s\d.,:%/+\-–×()]*(%|h|min)?$/.test(t)) continue;
    const el = andar.currentNode.parentElement;
    if (!el || !el.getBoundingClientRect().width || el.closest("input, textarea, script, style")) continue;
    const cs = getComputedStyle(el);
    if (/DM Mono/i.test(cs.fontFamily) || cs.fontVariantNumeric.includes("tabular")) continue;
    semTnum.push(`«${t.trim().slice(0, 36)}» em ${desc(el)}`);
  }

  const campoMiudo: string[] = [];
  const alvoPequeno: string[] = [];
  if (celular) {
    for (const el of document.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea",
    )) {
      if ((el as HTMLElement).getBoundingClientRect().width <= 1 || escondido(el)) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 16) campoMiudo.push(`${desc(el)} ${px}px`);
    }
    for (const el of document.querySelectorAll("button, [role=button], a[href], input[type=checkbox], input[type=radio]")) {
      const b = el.getBoundingClientRect();
      if (b.width <= 1 || escondido(el)) continue; // sr-only: quem recebe o toque é o rótulo desenhado
      if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue; // link no meio do texto
      // Caixa de marcar dentro do rótulo: o alvo é o rótulo inteiro.
      if (el.tagName === "INPUT" && (el.closest("label") || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)))) continue;
      if (b.height < 24 || b.width < 24) alvoPequeno.push(`${desc(el)} ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
  }

  return {
    estouro,
    foraDaTela: foraDaTela.slice(0, 8),
    semNome,
    soPlaceholder,
    imgSemAlt,
    campoMiudo,
    h1: document.querySelectorAll("h1").length,
    semTnum,
    alvoPequeno,
    titulo: document.title,
    alturaDaPagina: document.documentElement.scrollHeight,
  };
}

type Medida = ReturnType<typeof medir>;
type Linha = {
  papel: string;
  rota: string;
  largura: number;
  arquivo: string;
  reprova: string[];
  avisos: string[];
  medida?: Medida;
};

function julgar(m: Medida, erros: string[], consoleErros: string[]) {
  const reprova: string[] = [];
  const avisos: string[] = [];
  if (m.estouro) reprova.push(`rola para o lado (${m.estouro}px): ${m.foraDaTela.slice(0, 3).join("; ")}`);
  if (erros.length) reprova.push(...erros);
  if (m.semNome.length) reprova.push(`sem nome: ${m.semNome.slice(0, 4).join("; ")}`);
  if (m.imgSemAlt.length) reprova.push(`imagem sem alt: ${m.imgSemAlt.slice(0, 3).join("; ")}`);
  if (m.campoMiudo.length) reprova.push(`campo com menos de 16px no celular: ${m.campoMiudo.slice(0, 3).join("; ")}`);
  if (m.semTnum.length) avisos.push(`${m.semTnum.length} número(s) sem tnum: ${m.semTnum.slice(0, 2).join("; ")}`);
  if (m.alvoPequeno.length) avisos.push(`${m.alvoPequeno.length} alvo(s) < 24px: ${m.alvoPequeno.slice(0, 2).join("; ")}`);
  if (m.soPlaceholder.length) avisos.push(`só placeholder: ${m.soPlaceholder.slice(0, 2).join("; ")}`);
  if (m.h1 !== 1) avisos.push(`${m.h1} h1`);
  if (consoleErros.length) avisos.push(`console: ${consoleErros.slice(0, 2).join("; ")}`);
  return { reprova, avisos };
}

async function entrar(ctx: import("playwright-core").BrowserContext, login: Login) {
  const tentar = () => ctx.request.post(URL + login.url, { data: login.corpo });
  let r = await tentar();
  if (r.status() !== 200 && login.criar) {
    const c = await ctx.request.post(URL + login.criar.url, { data: login.criar.corpo });
    if (c.status() === 201) return true;
    r = await tentar();
  }
  return r.status() === 200;
}

function indice(linhas: Linha[]) {
  const grupos = new Map<string, Linha[]>();
  for (const l of linhas) {
    const k = `${l.papel} ${l.rota}`;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const blocos = [...grupos.entries()].map(([k, ls]) => {
    const figs = ls
      .map(
        (l) => `<figure><figcaption class="${l.reprova.length ? "ruim" : l.avisos.length ? "aviso" : "bom"}">${l.largura}px — ${
          l.reprova.length ? "reprova" : l.avisos.length ? `${l.avisos.length} aviso(s)` : "ok"
        }</figcaption><a href="${l.arquivo}"><img src="${l.arquivo}" alt="${esc(k)} em ${l.largura}px" loading="lazy"></a>${[...l.reprova, ...l.avisos]
          .map((p) => `<p>${esc(p)}</p>`)
          .join("")}</figure>`,
      )
      .join("");
    return `<section><h2>${esc(k)}</h2><div class="linha">${figs}</div></section>`;
  });
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Telas nas três versões</title>
<style>
body{margin:0;padding:16px;font:14px system-ui,sans-serif;background:#f3f4f6;color:#111}
h1{font-size:20px} h2{font-size:15px;margin:24px 0 8px}
.linha{display:grid;grid-template-columns:200px 400px 1fr;gap:12px;align-items:start}
figure{margin:0;background:#fff;border:1px solid #d1d5db;border-radius:8px;overflow:hidden}
figcaption{padding:4px 8px;font-weight:600} .bom{background:#dcfce7} .aviso{background:#fef9c3} .ruim{background:#fee2e2}
img{display:block;width:100%;max-height:900px;object-fit:cover;object-position:top}
p{margin:4px 8px;font-size:12px;color:#374151}
</style><h1>Telas nas três versões — ${new Date().toLocaleString("pt-BR")}</h1>${blocos.join("")}</html>`;
}

async function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const { papeis: todos, carrinho, faltou } = await papeis();
  const navegador = await chromium.launch({ executablePath: CHROMIUM });
  const linhas: Linha[] = [];

  for (const [papel, cfg] of Object.entries(todos)) {
    if (SO_PAPEIS && !SO_PAPEIS.includes(papel)) continue;
    console.log(`\n${papel}`);
    for (const largura of LARGURAS) {
      const ctx = await navegador.newContext({ viewport: { width: largura, height: altura(largura) } });
      // O tsx embrulha função com `__name` (keepNames do esbuild); na página ela não existe.
      await ctx.addInitScript("window.__name = (f) => f;");
      // Tema da rodada, sem o convite de instalar por cima, e duas rifas à
      // venda no carrinho (o aparelho guarda só rifa e quantidade).
      await ctx.addInitScript(
        ({ tema, slugs }: { tema: string; slugs: string[] }) => {
          localStorage.setItem("rifa.tema", tema);
          localStorage.setItem("rifa.instalar.fechado", "1");
          localStorage.setItem("rifa.carrinho", JSON.stringify(slugs.map((slug) => ({ slug, quantidade: 10 }))));
        },
        { tema: TEMA, slugs: carrinho },
      );
      if (cfg.login && !(await entrar(ctx, cfg.login))) {
        console.log(`  ✗ não entrou como ${papel} — pulando`);
        await ctx.close();
        break;
      }
      const pagina = await ctx.newPage();
      let erros: string[] = [];
      let consoleErros: string[] = [];
      pagina.on("pageerror", (e) => erros.push(`erro na página: ${e.message.slice(0, 160)}`));
      pagina.on("console", (m) => {
        const t = m.text();
        // Recurso de fora (fonte do Google sem rede) não é defeito da tela.
        if (m.type() === "error" && !/Failed to load resource|ERR_CERT|net::ERR/.test(t)) consoleErros.push(t.slice(0, 160));
      });
      pagina.on("response", (resp) => {
        if (resp.url().startsWith(URL + "/api/") && resp.status() >= 500) {
          erros.push(`HTTP ${resp.status()} ${resp.url().slice(URL.length)}`);
        }
      });
      for (const rota of cfg.rotas) {
        erros = [];
        consoleErros = [];
        try {
          await pagina.goto(URL + rota, { waitUntil: "networkidle", timeout: 20000 });
        } catch {
          /* segue com o que carregou: a medida diz o resto */
        }
        await pagina.waitForTimeout(600);
        const arquivo = `${papel}${rota.replace(/[/?=&]/g, "_")}-${largura}.png`;
        let medida: Medida | undefined;
        try {
          medida = await pagina.evaluate(medir);
        } catch (e) {
          erros.push(`não mediu: ${String(e).slice(0, 160)}`);
        }
        await pagina
          .screenshot({ path: path.join(SAIDA, arquivo), fullPage: true, timeout: 15000 })
          .catch(() => pagina.screenshot({ path: path.join(SAIDA, arquivo) }).catch(() => {}));
        const { reprova, avisos } = medida
          ? julgar(medida, [...new Set(erros)], [...new Set(consoleErros)])
          : { reprova: [...new Set(erros)], avisos: [] };
        linhas.push({ papel, rota, largura, arquivo, reprova, avisos, medida });
        const sinal = reprova.length ? "✗" : avisos.length ? "!" : "✓";
        console.log(`  ${sinal} ${largura} ${rota}`);
        for (const p of reprova) console.log(`      reprova: ${p}`);
        for (const p of avisos) console.log(`      aviso: ${p}`);
      }
      await ctx.close();
    }
  }
  await navegador.close();
  await pool.end();

  fs.writeFileSync(path.join(SAIDA, "relatorio.json"), JSON.stringify(linhas, null, 1));
  fs.writeFileSync(path.join(SAIDA, "index.html"), indice(linhas));
  const reprovadas = linhas.filter((l) => l.reprova.length);
  const comAviso = linhas.filter((l) => !l.reprova.length && l.avisos.length);
  console.log(
    `\n${linhas.length} capturas em ${path.relative(process.cwd(), SAIDA) || "."}/ — ${reprovadas.length} reprovada(s), ${comAviso.length} com aviso.`,
  );
  if (faltou.length) console.log(`Sem exemplo no banco (rota fora): ${faltou.join(", ")}.`);
  console.log(`Veja lado a lado: ${path.join(SAIDA, "index.html")}`);
  process.exit(reprovadas.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
