-- CreateEnum
CREATE TYPE "TipoMidia" AS ENUM ('BANNER', 'IMAGEM', 'VIDEO');

-- CreateTable
CREATE TABLE "MidiaRifa" (
    "id" TEXT NOT NULL,
    "rifaId" TEXT NOT NULL,
    "tipo" "TipoMidia" NOT NULL,
    "chave" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MidiaRifa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MidiaRifa_chave_key" ON "MidiaRifa"("chave");

-- CreateIndex
CREATE INDEX "MidiaRifa_rifaId_tipo_idx" ON "MidiaRifa"("rifaId", "tipo");

-- AddForeignKey
ALTER TABLE "MidiaRifa" ADD CONSTRAINT "MidiaRifa_rifaId_fkey" FOREIGN KEY ("rifaId") REFERENCES "Rifa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
