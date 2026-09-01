import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ehProducao = process.env.NODE_ENV === "production";

/// Credenciais fáceis para desenvolver na própria máquina. Em produção o seed
/// exige senha explícita — "admin/123456" é a primeira dupla que qualquer
/// varredura automática tenta, e o painel dá acesso aos dados pessoais dos
/// compradores, ao repasse de comissões e à publicação do resultado.
const DEMO = {
  admin: { usuario: "admin", email: "admin@example.com", senha: "123456" },
  apostador: { usuario: "apostador", email: "apostador@example.com", senha: "123456" },
};

function senhaDaOrganizadora(): string {
  const informada = process.env.SEED_SENHA_ORGANIZADORA;

  if (ehProducao) {
    if (!informada || informada.length < 8) {
      throw new Error(
        "Em produção, defina SEED_SENHA_ORGANIZADORA com ao menos 8 caracteres. " +
          "Nenhuma senha padrão é criada — isso evita subir o sistema com credencial conhecida.",
      );
    }
    return informada;
  }

  return informada ?? DEMO.admin.senha;
}

async function main() {
  const senhaOrganizadora = senhaDaOrganizadora();
  const email = process.env.SEED_ONG_EMAIL ?? DEMO.admin.email;

  // Rodar o seed de novo é um engano comum na instalação. Sem esta checagem, o
  // segundo `npm run db:seed` estoura com um erro de chave única do Prisma —
  // assustador e sem indicar o que fazer.
  const jaExiste = await prisma.usuario.findFirst({
    where: { OR: [{ email }, { usuario: DEMO.admin.usuario }] },
  });

  if (jaExiste) {
    console.log(`O sistema já foi inicializado: o usuário ${jaExiste.usuario ?? jaExiste.email} existe.`);
    console.log("O seed só roda uma vez. Entre com a senha definida na primeira execução.");
    console.log("Para recomeçar do zero, apague o banco (docker compose down -v) e repita a instalação.");
    return;
  }

  const organizacao = await prisma.organizacao.create({
    data: { nome: process.env.SEED_ONG_NOME ?? "Organização Beneficente", email },
  });

  const usuario = await prisma.usuario.create({
    data: {
      organizacaoId: organizacao.id,
      nome: "Administração",
      usuario: DEMO.admin.usuario,
      email,
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
  console.log(`Acesso ao painel: ${usuario.usuario} (ou ${usuario.email})`);
  console.log("Rifa criada em RASCUNHO:", rifa.titulo, `(${quantidadeNumeros} números)`);
  console.log("Abra a rifa pelo painel quando estiver pronta para vender.");

  // A conta de apostador de exemplo só existe fora de produção: no ar, cada
  // comprador cria a própria conta na página /apostador.
  if (!ehProducao) {
    const conta = await prisma.contaApostador.create({
      data: {
        usuario: DEMO.apostador.usuario,
        nome: "Apostador de Teste",
        email: DEMO.apostador.email,
        telefone: "11999990000",
        senhaHash: await bcrypt.hash(DEMO.apostador.senha, 12),
      },
    });

    console.log("");
    console.log("── Contas de desenvolvimento ──────────────────────");
    console.log(`  Painel:    ${usuario.usuario} / ${senhaOrganizadora}`);
    console.log(`  Comprador: ${conta.usuario} / ${DEMO.apostador.senha}`);
    console.log("  Estas senhas simples NÃO são criadas com NODE_ENV=production.");
    console.log("───────────────────────────────────────────────────");
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
