import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const senhaOrganizadora = process.env.SEED_SENHA_ORGANIZADORA;
  if (!senhaOrganizadora || senhaOrganizadora.length < 8) {
    throw new Error(
      "Defina SEED_SENHA_ORGANIZADORA (mínimo 8 caracteres) antes de rodar o seed. " +
        "Nenhuma senha padrão é criada — isso evita subir o sistema com credencial conhecida.",
    );
  }

  const organizacao = await prisma.organizacao.create({
    data: {
      nome: process.env.SEED_ONG_NOME ?? "Organização Beneficente",
      email: process.env.SEED_ONG_EMAIL ?? "contato@exemplo.org",
    },
  });

  const usuario = await prisma.usuario.create({
    data: {
      organizacaoId: organizacao.id,
      nome: "Administração",
      email: process.env.SEED_ONG_EMAIL ?? "contato@exemplo.org",
      senhaHash: await bcrypt.hash(senhaOrganizadora, 12),
      perfil: "ORGANIZADORA",
    },
  });

  const quantidadeNumeros = 1000;

  const rifa = await prisma.rifa.create({
    data: {
      organizacaoId: organizacao.id,
      titulo: "Rifa Solidária — 1ª edição",
      descricao: "Toda a arrecadação é revertida para os projetos da organização.",
      premio: "Prêmio a definir",
      precoPorNumero: 10,
      quantidadeNumeros,
      dataSorteio: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      status: "RASCUNHO",
      numerosGerados: quantidadeNumeros,
      numeros: {
        createMany: { data: Array.from({ length: quantidadeNumeros }, (_, numero) => ({ numero })) },
      },
    },
  });

  console.log("Organização:", organizacao.nome);
  console.log("Login da organizadora:", usuario.email);
  console.log("Rifa criada em RASCUNHO:", rifa.titulo, `(${quantidadeNumeros} números)`);
  console.log("Abra a rifa pelo painel quando estiver pronta para vender.");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
