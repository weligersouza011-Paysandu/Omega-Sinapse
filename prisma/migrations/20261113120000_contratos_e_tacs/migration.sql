-- =============================================================================
-- Módulo de Medição e Projeção Financeira — Fase 1
-- Contratos com a Vale (ex.: CT-251), Termos Aditivos (TAC) e vínculo obra -> contrato.
-- =============================================================================

-- AlterTable
ALTER TABLE "obras" ADD COLUMN     "contrato_id" INTEGER;

-- CreateTable
CREATE TABLE "contratos" (
    "id" SERIAL NOT NULL,
    "id_vale" VARCHAR(60) NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor_inicial" DECIMAL(14,2) NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "termos_aditivos" (
    "id" SERIAL NOT NULL,
    "contrato_id" INTEGER NOT NULL,
    "numero_tac" VARCHAR(30) NOT NULL,
    "valor_aditivo" DECIMAL(14,2) NOT NULL,
    "novo_valor_total" DECIMAL(14,2) NOT NULL,
    "data_assinatura" DATE NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuario_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "termos_aditivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contratos_id_vale_key" ON "contratos"("id_vale");

-- CreateIndex
CREATE INDEX "termos_aditivos_contrato_id_idx" ON "termos_aditivos"("contrato_id");

-- CreateIndex
CREATE UNIQUE INDEX "termos_aditivos_contrato_id_numero_tac_key" ON "termos_aditivos"("contrato_id", "numero_tac");

-- CreateIndex
CREATE INDEX "obras_contrato_id_idx" ON "obras"("contrato_id");

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "termos_aditivos" ADD CONSTRAINT "termos_aditivos_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "termos_aditivos" ADD CONSTRAINT "termos_aditivos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

