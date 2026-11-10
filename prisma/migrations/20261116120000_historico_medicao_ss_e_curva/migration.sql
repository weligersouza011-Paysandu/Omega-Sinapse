-- =============================================================================
-- Importação do histórico de medição (pasta 13): itens de boletim para SS que ainda
-- não são obras do sistema e curva financeira (previsto/tendência) do contrato.
-- =============================================================================

-- AlterTable
ALTER TABLE "boletim_medicao_itens" ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "ss_codigo" VARCHAR(60),
ALTER COLUMN "obra_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "curva_financeira_contrato" (
    "id" SERIAL NOT NULL,
    "contrato_id" INTEGER NOT NULL,
    "numero_bmm" VARCHAR(30) NOT NULL,
    "ciclo_inicio" DATE NOT NULL,
    "ciclo_fim" DATE NOT NULL,
    "previsto_mensal" DECIMAL(16,4) NOT NULL,
    "previsto_acumulado" DECIMAL(16,4) NOT NULL,
    "previsto_replanejado" DECIMAL(16,4),
    "tendencia_acumulada" DECIMAL(16,4),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curva_financeira_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "curva_financeira_contrato_contrato_id_ciclo_fim_key" ON "curva_financeira_contrato"("contrato_id", "ciclo_fim");

-- AddForeignKey
ALTER TABLE "curva_financeira_contrato" ADD CONSTRAINT "curva_financeira_contrato_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

