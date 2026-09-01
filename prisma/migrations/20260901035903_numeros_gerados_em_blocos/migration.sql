-- AlterTable
ALTER TABLE "Rifa" ADD COLUMN     "numerosGerados" INTEGER NOT NULL DEFAULT 0;

-- Rifas que já existiam têm todos os números materializados; sem este preenchimento
-- elas ficariam travadas em "gerando números" e não poderiam abrir para venda.
UPDATE "Rifa" r
SET "numerosGerados" = (SELECT COUNT(*) FROM "Numero" n WHERE n."rifaId" = r.id);
