/**
 * Prova das notificações no celular, de ponta a ponta.
 *
 * Um servidor local faz o papel do serviço de push (FCM, Apple, Mozilla):
 * recebe o POST criptografado e o teste **descriptografa** com a chave do
 * "aparelho" — confere o texto que o celular mostraria, não só que chegou
 * alguma coisa. Aceitar https://127.0.0.1 (com certificado próprio) como
 * serviço de push só vale em desenvolvimento, que é como o CI sobe o
 * servidor. Precisa do `openssl` na máquina.
 *
 *   npm run push      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createECDH, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { baseUrl } from "./base-url";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaignStats, campaigns, chamados, draws, orders, organizations, pushInscricoes } from "../shared/schema";
import {
  avisarReembolso,
  avisarResultado,
  avisarRifaNova,
  avisarSorteiosChegando,
} from "../server/services/push";

const ece = createRequire(import.meta.url)("http_ece") as {
  decrypt: (b: Buffer, p: Record<string, unknown>) => Buffer;
};

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
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
}

/** Um "aparelho": par de chaves e o segredo de autenticação, como o navegador gera. */
function aparelho(caminho: string, porta: number) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh,
    auth,
    sub: {
      endpoint: `https://127.0.0.1:${porta}${caminho}`,
      keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
    },
  };
}

const SLUG = "push-teste";
const PESSOAS = [
  { nome: "Ana Push", telefone: "11978880001", cpf: "39053344705" },
  { nome: "Bruno Push", telefone: "11978880002", cpf: "12345678909" },
  { nome: "Carla Push", telefone: "11978880003", cpf: "52998224725" },
];

async function limpar() {
  await db.execute(sql`delete from rate_events where bucket like 'cadastro:%' or bucket like 'login:comprador:%'`);
  const org = sql`(select id from organizations where slug = ${SLUG})`;
  await db.execute(sql`delete from chamados where organization_id in ${org}`);
  await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id in ${org})`);
  await db.execute(sql`delete from campaigns where organization_id in ${org}`);
  await db.execute(sql`delete from organizations where slug = ${SLUG}`);
  for (const p of PESSOAS) await db.execute(sql`delete from buyers where phone = ${p.telefone}`);
}

async function main() {
  console.log("\n=== notificações no celular ===\n");
  await limpar();

  // O "serviço de push": guarda o que chega, por aparelho; /morto responde 410.
  const chegou = new Map<string, Buffer[]>();
  // Certificado próprio, só para este teste (o servidor aceita certificado
  // local apenas em desenvolvimento e apenas para 127.0.0.1).
  const pasta = mkdtempSync(path.join(tmpdir(), "push-teste-"));
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
    "-keyout", path.join(pasta, "chave.pem"), "-out", path.join(pasta, "cert.pem"),
  ], { stdio: "ignore" });
  const tls = { key: readFileSync(path.join(pasta, "chave.pem")), cert: readFileSync(path.join(pasta, "cert.pem")) };
  rmSync(pasta, { recursive: true, force: true });
  const servico = https.createServer(tls, (req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (c) => partes.push(c));
    req.on("end", () => {
      const caminho = req.url ?? "";
      if (caminho.startsWith("/morto")) {
        res.writeHead(410).end();
        return;
      }
      chegou.set(caminho, [...(chegou.get(caminho) ?? []), Buffer.concat(partes)]);
      res.writeHead(201).end();
    });
  });
  await new Promise<void>((ok) => servico.listen(0, "127.0.0.1", ok));
  const porta = (servico.address() as { port: number }).port;

  const [org] = await db.insert(organizations).values({ slug: SLUG, name: "Push Teste Rifas" }).returning();
  const [rifa] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "push-teste-rifa",
      title: "Moto",
      prizeTitle: "Moto 0 km",
      totalQuotas: 1000,
      priceCents: 1000,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 30 * 60_000),
      authorizationCode: "SPA-PUSH",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: rifa.id });

  const [ana, bruno, carla] = [new Cliente(), new Cliente(), new Cliente()];
  const ids: string[] = [];
  for (const [c, p] of [[ana, PESSOAS[0]], [bruno, PESSOAS[1]], [carla, PESSOAS[2]]] as const) {
    const cr = await c.req("POST", "/api/public/conta", { ...p, senha: "senha-push-1", lembrar: true });
    if (cr.status >= 300) throw new Error(`conta: HTTP ${cr.status} ${cr.json?.message}`);
    const [b] = await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.phone, p.telefone));
    ids.push(b.id);
  }
  const [anaId, , carlaId] = ids;

  const dAna = aparelho("/ana", porta);
  const dBruno = aparelho("/bruno", porta);
  const dCarla = aparelho("/carla", porta);
  const dMorto = aparelho("/morto", porta);
  const ler = (d: ReturnType<typeof aparelho>, i: number) =>
    JSON.parse(
      ece
        .decrypt(chegou.get(new globalThis.URL(d.sub.endpoint).pathname)![i], {
          version: "aes128gcm",
          privateKey: d.ecdh,
          authSecret: d.auth,
        })
        .toString("utf8"),
    );
  const quantos = (d: ReturnType<typeof aparelho>) =>
    chegou.get(new globalThis.URL(d.sub.endpoint).pathname)?.length ?? 0;

  try {
    let r = await new Cliente().req("GET", "/api/public/push/chave");
    checa("a chave pública VAPID é pública", r.status === 200 && typeof r.json?.chave === "string" && r.json.chave.length > 80);

    r = await new Cliente().req("POST", "/api/public/push/inscricoes", dAna.sub);
    checa("inscrever sem conta: 401", r.status === 401, `HTTP ${r.status}`);
    r = await ana.req("POST", "/api/public/push/inscricoes", { ...dAna.sub, endpoint: "https://169.254.169.254/latest" });
    checa("endpoint fora dos serviços de push: 400 (SSRF)", r.status === 400, `HTTP ${r.status}`);
    r = await ana.req("POST", "/api/public/push/inscricoes", { ...dAna.sub, keys: { p256dh: "x", auth: "y" } });
    checa("chaves inválidas: 400", r.status === 400, `HTTP ${r.status}`);

    for (const [c, d] of [[ana, dAna], [bruno, dBruno], [carla, dCarla], [ana, dMorto]] as const) {
      r = await c.req("POST", "/api/public/push/inscricoes", d.sub);
      if (r.status !== 201) throw new Error(`inscrição: HTTP ${r.status} ${r.json?.message}`);
    }
    checa("quatro aparelhos inscritos", (await db.select().from(pushInscricoes)).filter((i) => i.endpoint.includes(`:${porta}/`)).length === 4);

    // Bruno de outra conta tenta desligar o aparelho da Ana: nada muda.
    await bruno.req("DELETE", "/api/public/push/inscricoes", { endpoint: dAna.sub.endpoint });
    const [aindaLa] = await db.select().from(pushInscricoes).where(eq(pushInscricoes.endpoint, dAna.sub.endpoint));
    checa("ninguém desinscreve o aparelho de outra conta", Boolean(aindaLa));

    // Ana e Bruno seguem; Bruno desliga o sino. Carla não segue.
    await ana.req("POST", `/api/public/o/${SLUG}/seguir`);
    await bruno.req("POST", `/api/public/o/${SLUG}/seguir`);
    await bruno.req("PUT", `/api/public/o/${SLUG}/sino`, { ligado: false });

    // Rifa nova
    const n1 = await avisarRifaNova(rifa.id);
    const n2 = await avisarRifaNova(rifa.id);
    checa("rifa nova: chega em quem segue com sino (Ana, 2 aparelhos, 1 morto)", n1 === 1, String(n1));
    checa("repetir o aviso não manda de novo", n2 === 0 && quantos(dAna) === 1, `${n2}, ${quantos(dAna)}`);
    const m = ler(dAna, 0);
    checa("o celular mostraria título, prêmio e o link da rifa no perfil",
      m.title === "Push Teste Rifas publicou uma rifa nova" && m.body === "Moto 0 km" && m.url === `/o/${SLUG}/r/push-teste-rifa`,
      JSON.stringify(m));
    checa("sino desligado não recebe; quem não segue não recebe", quantos(dBruno) === 0 && quantos(dCarla) === 0);
    const [morto] = await db.select().from(pushInscricoes).where(eq(pushInscricoes.endpoint, dMorto.sub.endpoint));
    checa("aparelho que responde 410 sai da lista", !morto);

    // Carla compra (pedido pago): passa a receber o que é da rifa.
    await db.insert(orders).values({
      code: 90000000 + Math.floor(Math.random() * 999999),
      campaignId: rifa.id,
      buyerId: carlaId,
      quantity: 1,
      amountCents: 1000,
      status: "paid",
      paidAt: new Date(),
    });

    // Sorteio chegando (a 30 min): só a janela de 1 hora, mesmo rodando duas vezes.
    await avisarSorteiosChegando();
    await avisarSorteiosChegando();
    checa("sorteio chegando: Ana (segue) e Carla (comprou), uma vez cada",
      quantos(dAna) === 2 && quantos(dCarla) === 1 && quantos(dBruno) === 0,
      `ana ${quantos(dAna)}, carla ${quantos(dCarla)}, bruno ${quantos(dBruno)}`);
    checa("rifa a 30 min recebe o aviso de 1 hora, não o de 24",
      ler(dCarla, 0).title === "Sorteio em menos de 1 hora", ler(dCarla, 0).title);

    // Resultado
    await db.insert(draws).values({ campaignId: rifa.id, seed: "s", seedHash: "h", resultNumber: 42, executedAt: new Date() });
    await avisarResultado(rifa.id);
    await avisarResultado(rifa.id);
    checa("resultado: Ana e Carla, uma vez", quantos(dAna) === 3 && quantos(dCarla) === 2);
    checa("com o número sorteado no texto", String(ler(dCarla, 1).body).includes("0042"), ler(dCarla, 1).body);

    // Reembolso respondido: só o dono do chamado.
    const [pedido] = await db.select().from(orders).where(eq(orders.buyerId, carlaId));
    const [ch] = await db
      .insert(chamados)
      .values({ protocolo: "R-PUSH-1", organizationId: org.id, orderId: pedido.id, buyerId: carlaId, status: "aprovado", motivo: "teste" })
      .returning();
    await avisarReembolso(ch.id);
    checa("reembolso respondido chega só ao dono do chamado",
      quantos(dCarla) === 3 && quantos(dAna) === 3 && ler(dCarla, 2).title === "Reembolso aprovado");

    void anaId;
  } finally {
    servico.close();
    await db.execute(sql`delete from push_inscricoes where endpoint like ${`https://127.0.0.1:${porta}/%`}`);
    await limpar();
  }

  console.log(falhas === 0 ? "\n  tudo certo\n" : `\n  ${falhas} verificação(ões) falharam\n`);
  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await limpar().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
