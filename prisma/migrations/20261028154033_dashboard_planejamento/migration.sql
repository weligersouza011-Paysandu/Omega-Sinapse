-- CreateEnum
CREATE TYPE "CategoriaObra" AS ENUM ('CADEIA_DE_AJUDA', 'CARTEIRA_DA_COORDENACAO');

-- CreateEnum
CREATE TYPE "StatusRestricao" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'RESOLVIDA', 'CANCELADA');

-- AlterTable
ALTER TABLE "obras" ADD COLUMN     "categoria" "CategoriaObra";

-- CreateTable
CREATE TABLE "obra_restricoes" (
    "id" SERIAL NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "etapa" VARCHAR(120),
    "atividade" VARCHAR(200) NOT NULL,
    "descricao" TEXT NOT NULL,
    "plano_acao" TEXT,
    "responsavel" VARCHAR(120),
    "empresa_responsavel" VARCHAR(120),
    "status" "StatusRestricao" NOT NULL DEFAULT 'PENDENTE',
    "prazo" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obra_restricoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "obra_restricoes_obra_id_idx" ON "obra_restricoes"("obra_id");

-- CreateIndex
CREATE INDEX "obra_restricoes_status_idx" ON "obra_restricoes"("status");

-- CreateIndex
CREATE INDEX "obra_restricoes_prazo_idx" ON "obra_restricoes"("prazo");

-- AddForeignKey
ALTER TABLE "obra_restricoes" ADD CONSTRAINT "obra_restricoes_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
