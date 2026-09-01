-- AlterTable
ALTER TABLE "Compra" ADD COLUMN     "contaId" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "usuario" TEXT;

-- CreateTable
CREATE TABLE "ContaApostador" (
    "id" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "cpf" TEXT,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoLogin" TIMESTAMP(3),

    CONSTRAINT "ContaApostador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaApostador_usuario_key" ON "ContaApostador"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "ContaApostador_email_key" ON "ContaApostador"("email");

-- CreateIndex
CREATE INDEX "Compra_contaId_criadaEm_idx" ON "Compra"("contaId", "criadaEm");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "Usuario"("usuario");

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaApostador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

