-- =============================================================================
-- Módulo de Medição e Projeção Financeira — Fase 2
-- Boletins de Medição (BMM) do contrato e o valor medido por obra/SS.
-- =============================================================================

-- CreateEnum
CREATE TYPE "StatusBoletim" AS ENUM ('EM_ANALISE', 'APROVADO', 'REJEITADO');

-- CreateTable
CREATE TABLE "boletins_medicao" (
    "id" SERIAL NOT NULL,
    "contrato_id" INTEGER NOT NULL,
    "numero_bmm" VARCHAR(30) NOT NULL,
    "valor_medido" DECIMAL(14,2) NOT NULL,
    "ciclo_inicio" DATE NOT NULL,
    "ciclo_fim" DATE NOT NULL,
    "status" "StatusBoletim" NOT NULL DEFAULT 'EM_ANALISE',
    "observacao" TEXT,
    "usuario_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boletins_medicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boletim_medicao_itens" (
    "id" SERIAL NOT NULL,
    "boletim_id" INTEGER NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boletim_medicao_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boletins_medicao_contrato_id_ciclo_fim_idx" ON "boletins_medicao"("contrato_id", "ciclo_fim");

-- CreateIndex
CREATE UNIQUE INDEX "boletins_medicao_contrato_id_numero_bmm_key" ON "boletins_medicao"("contrato_id", "numero_bmm");

-- CreateIndex
CREATE INDEX "boletim_medicao_itens_obra_id_idx" ON "boletim_medicao_itens"("obra_id");

-- CreateIndex
CREATE UNIQUE INDEX "boletim_medicao_itens_boletim_id_obra_id_key" ON "boletim_medicao_itens"("boletim_id", "obra_id");

-- AddForeignKey
ALTER TABLE "boletins_medicao" ADD CONSTRAINT "boletins_medicao_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boletins_medicao" ADD CONSTRAINT "boletins_medicao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boletim_medicao_itens" ADD CONSTRAINT "boletim_medicao_itens_boletim_id_fkey" FOREIGN KEY ("boletim_id") REFERENCES "boletins_medicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boletim_medicao_itens" ADD CONSTRAINT "boletim_medicao_itens_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

