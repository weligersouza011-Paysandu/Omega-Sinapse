-- =============================================================================
-- Efetivo do contrato (dados do colaborador) e categoria Canteiro Central (obra 998, sem orçamento comercial).
-- =============================================================================

-- CreateEnum
CREATE TYPE "SituacaoEfetivo" AS ENUM ('DISPONIVEL', 'INDISPONIVEL');

-- AlterEnum
ALTER TYPE "CategoriaObra" ADD VALUE 'CANTEIRO_CENTRAL';

-- AlterTable
ALTER TABLE "colaboradores" ADD COLUMN     "cargo" VARCHAR(160),
ADD COLUMN     "contrato_id" INTEGER,
ADD COLUMN     "data_mobilizacao" DATE,
ADD COLUMN     "disciplina" VARCHAR(60),
ADD COLUMN     "encarregado" VARCHAR(120),
ADD COLUMN     "ferias_fim" DATE,
ADD COLUMN     "ferias_inicio" DATE,
ADD COLUMN     "situacao" "SituacaoEfetivo" NOT NULL DEFAULT 'DISPONIVEL',
ADD COLUMN     "supervisor" VARCHAR(120);

-- CreateIndex
CREATE INDEX "colaboradores_contrato_id_idx" ON "colaboradores"("contrato_id");

-- AddForeignKey
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

