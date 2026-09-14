/**
 * Popula o banco para desenvolvimento: um administrador, um afiliado e três
 * campanhas no ar — incluindo uma de 1.000.000 de cotas, que é o caso que
 * precisa continuar rápido.
 *
 *   npm run db:push && npm run db:seed
 */
import "dotenv/config";
import { db } from "../server/db";
import {
  users,
  affiliates,
  campaigns,
  campaignMedia,
  quotaPackages,
  campaignStats,
  prizedQuotas,
} from "../shared/schema";
import { hashPassword } from "../server/auth";
import { publishCampaign } from "../server/services/campaigns";

/**
 * Placeholder de imagem em SVG, embutido como data URI. O seed não tem
 * arquivo de verdade para subir, e imagem quebrada faz a tela parecer
 * defeituosa — isto rende igual a uma foto real no lugar certo.
 */
function placeholder(params: {
  from: string;
  to: string;
  label: string;
  sub?: string;
  w?: number;
  h?: number;
}): string {
  const { from, to, label, sub = "", w = 1600, h = 900 } = params;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${w * 0.84}" cy="${h * 0.22}" r="${h * 0.3}" fill="#FFC700" fill-opacity="0.14"/>
    <circle cx="${w * 0.2}" cy="${h * 0.85}" r="${h * 0.22}" fill="#ffffff" fill-opacity="0.05"/>
    <text x="${w * 0.5}" y="${h * 0.52}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${h * 0.07}" font-weight="700" fill="#ffffff" fill-opacity="0.28">${label}</text>
    <text x="${w * 0.5}" y="${h * 0.63}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${h * 0.04}" fill="#ffffff" fill-opacity="0.22">${sub}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const PALETTES = [
  { from: "#0B1F14", to: "#00873E" },
  { from: "#123D24", to: "#12B45C" },
  { from: "#6B4B00", to: "#FFC700" },
];

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

  const [admin] = await db
    .insert(users)
    .values({
      role: "admin",
      name: "Administrador geral",
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
    })
    .onConflictDoNothing()
    .returning();

  const [affUser] = await db
    .insert(users)
    .values({
      role: "affiliate",
      name: "João Ribeiro",
      email: "joao@rifa.br",
      phone: "11977776666",
      passwordHash: await hashPassword("joao123"),
    })
    .onConflictDoNothing()
    .returning();

  if (affUser) {
    await db
      .insert(affiliates)
      .values({
        userId: affUser.id,
        code: "JOAO7",
        pixKey: "joao@rifa.br",
        commissionPct: 12,
        status: "active",
        approvedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  const [cambistaUser] = await db
    .insert(users)
    .values({
      role: "cambista",
      name: "Sérgio Camargo",
      email: "sergio@rifa.br",
      phone: "11911112222",
      passwordHash: await hashPassword("cambista123"),
    })
    .onConflictDoNothing()
    .returning();

  if (cambistaUser) {
    await db
      .insert(affiliates)
      .values({
        userId: cambistaUser.id,
        code: "SERGIO",
        kind: "cambista",
        commissionPct: 15,
        status: "active",
        approvedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  const specs = [
    {
      slug: "iphone-17-pro-max",
      title: "iPhone 17 Pro Max",
      prizeTitle: "iPhone 17 Pro Max 256 GB",
      totalQuotas: 1_000,
      priceCents: 490,
      packages: [
        { quantity: 5, discountPct: 0, highlight: false },
        { quantity: 10, discountPct: 5, highlight: true },
        { quantity: 25, discountPct: 8, highlight: false },
        { quantity: 50, discountPct: 12, highlight: false },
      ],
    },
    {
      slug: "fiat-mobi-2026",
      title: "Fiat Mobi 2026",
      prizeTitle: "Fiat Mobi 2026 0 km",
      totalQuotas: 10_000,
      priceCents: 990,
      packages: [
        { quantity: 10, discountPct: 5, highlight: true },
        { quantity: 50, discountPct: 10, highlight: false },
      ],
    },
    {
      // O caso que importa para a arquitetura: 1M de cotas sem uma linha
      // sequer criada na publicação.
      slug: "pix-de-1-milhao",
      title: "PIX de R$ 10.000",
      prizeTitle: "PIX de R$ 10.000 na sua conta",
      totalQuotas: 1_000_000,
      priceCents: 120,
      packages: [
        { quantity: 50, discountPct: 5, highlight: true },
        { quantity: 200, discountPct: 10, highlight: false },
      ],
    },
  ];

  for (const [i, spec] of specs.entries()) {
    const [campaign] = await db
      .insert(campaigns)
      .values({
        slug: spec.slug,
        title: spec.title,
        prizeTitle: spec.prizeTitle,
        description: "Campanha de exemplo criada pelo seed.",
        totalQuotas: spec.totalQuotas,
        priceCents: spec.priceCents,
        minPerOrder: 1,
        maxPerOrder: 1000,
        reservationTtlMin: 15,
        drawAt: new Date(Date.now() + (14 + i * 7) * 86_400_000),
        authorizationCode: `SPA-MF-EXEMPLO-${1000 + i}`,
        commissionPctDefault: 10,
        featured: i === 0,
        sortWeight: 10 - i,
      })
      .onConflictDoNothing()
      .returning();

    if (!campaign) continue;

    await db.insert(campaignMedia).values([
      {
        campaignId: campaign.id,
        role: "banner",
        position: 0,
        storageKey: placeholder({ ...PALETTES[i], label: "banner", sub: "imagem de exemplo" }),
        mime: "image/svg+xml",
        width: 1600,
        height: 900,
        altText: spec.prizeTitle,
        status: "ready",
      },
      // Cinco fotos: é o limite do produto, e o seed exercita o limite.
      ...[0, 1, 2, 3, 4].map((p) => ({
        campaignId: campaign.id,
        role: "photo" as const,
        position: p,
        storageKey: placeholder({
          ...PALETTES[i],
          label: `foto ${p + 1}`,
          sub: "",
          w: 1200,
          h: 900,
        }),
        mime: "image/svg+xml",
        width: 1200,
        height: 900,
        altText: `${spec.prizeTitle} — foto ${p + 1}`,
        status: "ready" as const,
      })),
    ]);

    await db.insert(quotaPackages).values(
      spec.packages.map((p) => ({ campaignId: campaign.id, ...p })),
    );

    await db.insert(campaignStats).values({ campaignId: campaign.id }).onConflictDoNothing();

    // Duas cotas premiadas para exercitar a revelação na compra.
    await db.insert(prizedQuotas).values([
      { campaignId: campaign.id, number: 11, prizeLabel: "R$ 100 no Pix" },
      { campaignId: campaign.id, number: 29, prizeLabel: "R$ 50 no Pix" },
    ]);

    await publishCampaign(campaign.id);
    console.log(`publicada: ${spec.slug} (${spec.totalQuotas.toLocaleString("pt-BR")} cotas)`);
  }

  console.log(`\nadmin: ${adminEmail} / ${adminPassword}`);
  console.log("afiliado: joao@rifa.br / joao123 (código JOAO7)");
  console.log("cambista: sergio@rifa.br / cambista123 (código SERGIO)");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
