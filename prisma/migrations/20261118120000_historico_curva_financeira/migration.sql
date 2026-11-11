-- =============================================================================
-- Histórico das alterações manuais da curva financeira do contrato
-- (previsto, projetado e tendência por mês), com opção de restaurar valores.
-- =============================================================================

-- CreateTable
CREATE TABLE "historico_curva_financeira" (
    "id" SERIAL NOT NULL,
    "contrato_id" INTEGER NOT NULL,
    "referencia" VARCHAR(7) NOT NULL,
    "campo" VARCHAR(20) NOT NULL,
    "valor_anterior" DECIMAL(16,4),
    "valor_novo" DECIMAL(16,4),
    "usuario_id" INTEGER,
    "usuario_nome" VARCHAR(255),
    "restaurado_de" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_curva_financeira_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historico_curva_financeira_contrato_id_created_at_idx" ON "historico_curva_financeira"("contrato_id", "created_at");

-- AddForeignKey
ALTER TABLE "historico_curva_financeira" ADD CONSTRAINT "historico_curva_financeira_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
