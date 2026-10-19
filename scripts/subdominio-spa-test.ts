/**
 * Prova do SPA no endereço da organização, no navegador de verdade (PR 3 do
 * docs/PLANO-SUBDOMINIO.md). Sobe uma organização com endereço ligado e uma
 * rifa, e abre `<rotulo>.<base>` no Chromium (o `*.<base>` aponta para o servidor
 * de prova por `--host-resolver-rules`). Confere:
 * - a raiz é o perfil da organização, não a vitrine da plataforma;
 * - o console só tem Início, Carrinho e Perfil (Reels, Mensagens e Buscar saem);
 * - a rifa abre pelo caminho curto (`/r/<rifa>`) e o clique não recarrega a página;
 * - o que é da plataforma vira link para o domínio principal;
 * - a página abre direto por `/r/<rifa>`, sem rolar para o lado nas três larguras;
 * - sem o Google no login (a intro some pela regra `noEnderecoDaOrganizacao()`, que a automação já esconde: não dá para provar aqui).
 *
 * O servidor tem de subir com `SUBDOMINIO_BASE=loteriasdobem.test` e a porta do
 * `baseUrl()`; o Chromium sai de `CHROMIUM` ou de /opt/pw-browsers/chromium.
 *
 *   npm run subdominio-spa
 */
import "dotenv/config";
import fs from "node:fs";
import { chromium } from "playwright-core";
import { eq } from "drizzle-orm";
import { baseUrl } from "./base-url";
import { db } from "../server/db";
import { campaigns, campaignStats, organizations } from "../shared/schema";

const ALVO = new globalThis.URL(baseUrl());
const BASE = process.env.SUBDOMINIO_BASE ?? "loteriasdobem.test";
const SLUG = "sub-spa-prova";
const RIFA = "sub-spa-prova-moto";
const HOST = `${SLUG}.${BASE}`;
const CHROMIUM = process.env.CHROMIUM ?? (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

async function limpar() {
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, SLUG));
  if (!org) return;
  const cs = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.organizationId, org.id));
  for (const c of cs) await db.delete(campaignStats).where(eq(campaignStats.campaignId, c.id));
  await db.delete(campaigns).where(eq(campaigns.organizationId, org.id));
  await db.delete(organizations).where(eq(organizations.id, org.id));
}

async function main() {
  console.log(`\n=== o SPA no endereço da organização (${HOST}) ===\n`);
  await limpar();
  const [org] = await db.insert(organizations).values({ slug: SLUG, name: "Sub SPA Prova", cidade: "Natal", uf: "RN", enderecoAtivo: true }).returning();
  const [rifa] = await db
    .insert(campaigns)
    .values({
      organizationId: org!.id,
      slug: RIFA,
      title: "Moto da prova",
      prizeTitle: "Moto da prova",
      totalQuotas: 1000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: "SPA-SUB-SPA-1",
      authorizationFileKey: "certificado-teste",
      metodoApuracao: "federal_direta",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: rifa!.id }).onConflictDoNothing();

  const navegador = await chromium.launch({
    executablePath: CHROMIUM,
    args: [`--host-resolver-rules=MAP *.${BASE} ${ALVO.hostname}:${ALVO.port}`, "--no-sandbox"],
  });
  try {
    const url = (caminho: string) => `http://${HOST}:${ALVO.port}${caminho}`;
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const erros: string[] = [];
    p.on("pageerror", (e) => erros.push(e.message));
    let cargas = 0;
    p.on("load", () => cargas++);

    await p.goto(url("/"), { waitUntil: "networkidle" });
    const corpo = await p.locator("body").innerText();
    checa("a raiz é o perfil da organização (não a vitrine)", corpo.includes("Sub SPA Prova") && !corpo.includes("Rifas no ar"));
    const consoleHrefs = await p.$$eval('nav[aria-label="Navegação principal"] a', (as) => as.map((a) => a.getAttribute("href")));
    checa("o console só tem o que é da organização", !consoleHrefs.some((h) => /reels|buscar/.test(String(h))) && consoleHrefs.includes("/carrinho") && consoleHrefs.includes("/perfil"), JSON.stringify(consoleHrefs));

    // R31: a promotora aparece no alto, sem rolar, e a abertura da plataforma não vem do HTML.
    const faixa = p.locator('section[aria-label="Quem realiza a rifa"]');
    const caixa = await faixa.boundingBox();
    checa("a promotora (nome) está no alto, dentro da primeira tela", (await faixa.count()) === 1 && !!caixa && caixa.y + caixa.height < 844 && (await faixa.innerText()).includes("Sub SPA Prova"));
    checa("a plataforma aparece como operadora só quando há Dados da empresa publicados (nunca inventada)", (await p.locator("text=Plataforma operada por").count()) <= 1);
    checa("o HTML do endereço não traz a abertura da plataforma", (await p.evaluate(() => document.documentElement.classList.contains("abertura"))) === false);

    const link = p.locator(`a[href='/r/${RIFA}']`).first();
    checa("o perfil liga a rifa pelo caminho curto", (await link.count()) > 0);
    const antes = cargas;
    await link.click();
    await p.waitForURL(url(`/r/${RIFA}`));
    await p.waitForSelector("text=Moto da prova");
    checa("clicar na rifa não recarrega a página", cargas === antes, `cargas ${antes}→${cargas}`);

    await p.goto(url("/entrar"), { waitUntil: "networkidle" });
    checa("o login não oferece o Google no endereço", (await p.locator("text=Continuar com o Google").count()) === 0);

    for (const largura of [390, 820, 1440]) {
      await p.setViewportSize({ width: largura, height: largura < 640 ? 844 : 900 });
      for (const caminho of ["/", `/r/${RIFA}`, "/carrinho"]) {
        await p.goto(url(caminho), { waitUntil: "networkidle" });
        const sobra = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        checa(`${caminho} em ${largura}px não rola para o lado`, sobra <= 0, `sobra ${sobra}px`);
      }
    }

    const principal = await p.evaluate(async () => (await (await fetch("/api/public/endereco")).json()).principal as string);
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto(url("/"), { waitUntil: "networkidle" });
    const globais = await p.$$eval("a[href*='/reels'], a[href*='/buscar']", (as) => as.map((a) => a.getAttribute("href")));
    checa("link da plataforma, quando existe, vai ao domínio principal", globais.every((h) => String(h).startsWith(principal)), JSON.stringify(globais));
    checa("sem erro de JavaScript na página", erros.length === 0, erros.slice(0, 2).join(" | "));
  } finally {
    await navegador.close();
    await limpar();
  }

  console.log(falhas ? `\n${falhas} falha(s).` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  process.exit(1);
});
