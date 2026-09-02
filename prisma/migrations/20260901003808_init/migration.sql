-- CreateEnum
CREATE TYPE "StatusRifa" AS ENUM ('RASCUNHO', 'ABERTA', 'ENCERRADA', 'SORTEADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusNumero" AS ENUM ('DISPONIVEL', 'RESERVADO', 'PAGO');

-- CreateEnum
CREATE TYPE "StatusCompra" AS ENUM ('AGUARDANDO_PAGAMENTO', 'PAGA', 'EXPIRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO', 'ESTORNADO', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "PerfilUsuario" AS ENUM ('ORGANIZADORA', 'OPERADOR', 'AFILIADO');

-- CreateEnum
CREATE TYPE "StatusComissao" AS ENUM ('PENDENTE', 'APROVADA', 'PAGA', 'CANCELADA');

-- CreateTable
CREATE TABLE "Organizacao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "chavePix" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" "PerfilUsuario" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "ultimoLogin" TIMESTAMP(3),

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Afiliado" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "telefone" TEXT,
    "chavePixRecebimento" TEXT,
    "percentualComissao" DECIMAL(5,2) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Afiliado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rifa" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "premio" TEXT NOT NULL,
    "precoPorNumero" DECIMAL(10,2) NOT NULL,
    "quantidadeNumeros" INTEGER NOT NULL,
    "limiteNumerosPorCompra" INTEGER NOT NULL DEFAULT 20,
    "minutosParaPagar" INTEGER NOT NULL DEFAULT 30,
    "status" "StatusRifa" NOT NULL DEFAULT 'RASCUNHO',
    "dataSorteio" TIMESTAMP(3) NOT NULL,
    "concursoLoteriaFederal" TEXT,
    "regulamentoUrl" TEXT,
    "autorizacaoNumero" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rifa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Numero" (
    "id" TEXT NOT NULL,
    "rifaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "StatusNumero" NOT NULL DEFAULT 'DISPONIVEL',
    "compraId" TEXT,
    "reservadoAte" TIMESTAMP(3),

    CONSTRAINT "Numero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comprador" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "cpf" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comprador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compra" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "rifaId" TEXT NOT NULL,
    "compradorId" TEXT NOT NULL,
    "afiliadoId" TEXT,
    "quantidade" INTEGER NOT NULL,
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "status" "StatusCompra" NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,
    "pagaEm" TIMESTAMP(3),

    CONSTRAINT "Compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "provedor" TEXT NOT NULL DEFAULT 'mercadopago',
    "idExterno" TEXT,
    "chaveIdempotencia" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "status" "StatusPagamento" NOT NULL DEFAULT 'PENDENTE',
    "pixCopiaECola" TEXT,
    "pixQrCodeBase64" TEXT,
    "expiraEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "confirmadoEm" TIMESTAMP(3),
    "dadosProvedor" JSONB,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comissao" (
    "id" TEXT NOT NULL,
    "afiliadoId" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "status" "StatusComissao" NOT NULL DEFAULT 'PENDENTE',
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagaEm" TIMESTAMP(3),
    "observacao" TEXT,

    CONSTRAINT "Comissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resultado" (
    "id" TEXT NOT NULL,
    "rifaId" TEXT NOT NULL,
    "numeroSorteado" INTEGER NOT NULL,
    "concurso" TEXT NOT NULL,
    "premiosFederal" JSONB,
    "dataApuracao" TIMESTAMP(3) NOT NULL,
    "compraVencedora" TEXT,
    "publicadoPorId" TEXT,
    "publicadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,

    CONSTRAINT "Resultado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAuditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "dados" JSONB,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organizacao_cnpj_key" ON "Organizacao"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_organizacaoId_perfil_idx" ON "Usuario"("organizacaoId", "perfil");

-- CreateIndex
CREATE UNIQUE INDEX "Afiliado_usuarioId_key" ON "Afiliado"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Afiliado_codigo_key" ON "Afiliado"("codigo");

-- CreateIndex
CREATE INDEX "Afiliado_organizacaoId_ativo_idx" ON "Afiliado"("organizacaoId", "ativo");

-- CreateIndex
CREATE INDEX "Rifa_organizacaoId_status_idx" ON "Rifa"("organizacaoId", "status");

-- CreateIndex
CREATE INDEX "Numero_rifaId_status_idx" ON "Numero"("rifaId", "status");

-- CreateIndex
CREATE INDEX "Numero_compraId_idx" ON "Numero"("compraId");

-- CreateIndex
CREATE UNIQUE INDEX "Numero_rifaId_numero_key" ON "Numero"("rifaId", "numero");

-- CreateIndex
CREATE INDEX "Comprador_cpf_idx" ON "Comprador"("cpf");

-- CreateIndex
CREATE INDEX "Comprador_telefone_idx" ON "Comprador"("telefone");

-- CreateIndex
CREATE UNIQUE INDEX "Compra_codigo_key" ON "Compra"("codigo");

-- CreateIndex
CREATE INDEX "Compra_rifaId_status_idx" ON "Compra"("rifaId", "status");

-- CreateIndex
CREATE INDEX "Compra_compradorId_idx" ON "Compra"("compradorId");

-- CreateIndex
CREATE INDEX "Compra_afiliadoId_status_idx" ON "Compra"("afiliadoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_compraId_key" ON "Pagamento"("compraId");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_idExterno_key" ON "Pagamento"("idExterno");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_chaveIdempotencia_key" ON "Pagamento"("chaveIdempotencia");

-- CreateIndex
CREATE INDEX "Pagamento_status_idx" ON "Pagamento"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Comissao_compraId_key" ON "Comissao"("compraId");

-- CreateIndex
CREATE INDEX "Comissao_afiliadoId_status_idx" ON "Comissao"("afiliadoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Resultado_rifaId_key" ON "Resultado"("rifaId");

-- CreateIndex
CREATE INDEX "LogAuditoria_usuarioId_criadoEm_idx" ON "LogAuditoria"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "LogAuditoria_entidade_entidadeId_idx" ON "LogAuditoria"("entidade", "entidadeId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Afiliado" ADD CONSTRAINT "Afiliado_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Afiliado" ADD CONSTRAINT "Afiliado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rifa" ADD CONSTRAINT "Rifa_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Numero" ADD CONSTRAINT "Numero_rifaId_fkey" FOREIGN KEY ("rifaId") REFERENCES "Rifa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Numero" ADD CONSTRAINT "Numero_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_rifaId_fkey" FOREIGN KEY ("rifaId") REFERENCES "Rifa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_compradorId_fkey" FOREIGN KEY ("compradorId") REFERENCES "Comprador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_afiliadoId_fkey" FOREIGN KEY ("afiliadoId") REFERENCES "Afiliado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comissao" ADD CONSTRAINT "Comissao_afiliadoId_fkey" FOREIGN KEY ("afiliadoId") REFERENCES "Afiliado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comissao" ADD CONSTRAINT "Comissao_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resultado" ADD CONSTRAINT "Resultado_rifaId_fkey" FOREIGN KEY ("rifaId") REFERENCES "Rifa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAuditoria" ADD CONSTRAINT "LogAuditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
