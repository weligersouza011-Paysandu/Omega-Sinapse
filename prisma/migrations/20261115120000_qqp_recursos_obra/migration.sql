-- =============================================================================
-- Módulo de Medição e Projeção Financeira — Fase 4
-- QQP (Quadro de Quantidades e Preços) do contrato e recursos planejados por obra.
-- =============================================================================

-- CreateEnum
CREATE TYPE "CategoriaQqp" AS ENUM ('HH', 'EQUIPAMENTO', 'INSUMO', 'OUTROS');

-- CreateEnum
CREATE TYPE "UnidadeQqp" AS ENUM ('HORA', 'DIA', 'MES', 'UNIDADE');

-- CreateTable
CREATE TABLE "itens_qqp" (
    "id" SERIAL NOT NULL,
    "contrato_id" INTEGER NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" "CategoriaQqp" NOT NULL,
    "unidade" "UnidadeQqp" NOT NULL,
    "preco_unitario" DECIMAL(14,4) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itens_qqp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recursos_obra_qqp" (
    "id" SERIAL NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "horas_dia" DECIMAL(4,2),
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE,
    "inclui_sabados" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recursos_obra_qqp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "itens_qqp_contrato_id_idx" ON "itens_qqp"("contrato_id");

-- CreateIndex
CREATE UNIQUE INDEX "itens_qqp_contrato_id_codigo_key" ON "itens_qqp"("contrato_id", "codigo");

-- CreateIndex
CREATE INDEX "recursos_obra_qqp_obra_id_idx" ON "recursos_obra_qqp"("obra_id");

-- CreateIndex
CREATE INDEX "recursos_obra_qqp_item_id_idx" ON "recursos_obra_qqp"("item_id");

-- AddForeignKey
ALTER TABLE "itens_qqp" ADD CONSTRAINT "itens_qqp_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recursos_obra_qqp" ADD CONSTRAINT "recursos_obra_qqp_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recursos_obra_qqp" ADD CONSTRAINT "recursos_obra_qqp_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "itens_qqp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

