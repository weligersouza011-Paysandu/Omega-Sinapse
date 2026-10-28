-- CreateEnum
CREATE TYPE "PerfilUsuario" AS ENUM ('ORCAMENTISTA', 'PLANEJADOR', 'SUPERVISOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('RASCUNHO', 'ENVIADO', 'EM_ANALISE', 'APROVADO', 'REPROVADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(255) NOT NULL,
    "matricula" VARCHAR(30),
    "email" VARCHAR(255) NOT NULL,
    "senha_hash" VARCHAR(255) NOT NULL,
    "perfil" "PerfilUsuario" NOT NULL DEFAULT 'ORCAMENTISTA',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" SERIAL NOT NULL,
    "pep" VARCHAR(100) NOT NULL,
    "cliente" VARCHAR(255),
    "ss" VARCHAR(60),
    "descricao" TEXT,
    "endereco" TEXT,
    "fiscal_nome" VARCHAR(255),
    "fiscal_contato" VARCHAR(120),
    "documentos_referencia" TEXT,
    "status" "StatusOrcamento" NOT NULL DEFAULT 'RASCUNHO',
    "valor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "art" VARCHAR(120),
    "orcamentista_id" INTEGER,
    "planejador_id" INTEGER,
    "foto_1" TEXT NOT NULL,
    "foto_2" TEXT,
    "foto_3" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_revisoes" (
    "id" SERIAL NOT NULL,
    "orcamento_id" INTEGER NOT NULL,
    "numero_revisao" INTEGER NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "observacao" TEXT NOT NULL,
    "usuario_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orcamento_revisoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_matricula_key" ON "usuarios"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "orcamentos_status_idx" ON "orcamentos"("status");

-- CreateIndex
CREATE INDEX "orcamentos_pep_idx" ON "orcamentos"("pep");

-- CreateIndex
CREATE UNIQUE INDEX "orcamento_revisoes_orcamento_id_numero_revisao_key" ON "orcamento_revisoes"("orcamento_id", "numero_revisao");

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_orcamentista_id_fkey" FOREIGN KEY ("orcamentista_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_planejador_id_fkey" FOREIGN KEY ("planejador_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_revisoes" ADD CONSTRAINT "orcamento_revisoes_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_revisoes" ADD CONSTRAINT "orcamento_revisoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
