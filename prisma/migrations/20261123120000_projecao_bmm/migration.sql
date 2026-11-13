-- =============================================================================
-- Projeção Financeira por BMM — Fase 3 (motor da projeção)
-- Projeção de receita por obra e ciclo 16→15: grade semanal de dias × pessoas
-- sobre os preços do QQP de um contrato/TAC (preço e unidade congelados).
-- NO ACTION em TAC e item do QQP: não saem enquanto houver projeção usando-os,
-- mas a exclusão do contrato inteiro continua removendo tudo em cascata.
-- =============================================================================

-- CreateTable
CREATE TABLE "projecoes_bmm" (
    "id" SERIAL NOT NULL,
    "contrato_id" INTEGER NOT NULL,
    "termo_aditivo_id" INTEGER,
    "obra_id" INTEGER NOT NULL,
    "numero_bmm" VARCHAR(30) NOT NULL,
    "referencia" VARCHAR(7) NOT NULL,
    "ciclo_inicio" DATE NOT NULL,
    "ciclo_fim" DATE NOT NULL,
    "dias_uteis" INTEGER NOT NULL,
    "total" DECIMAL(16,2) NOT NULL,
    "observacao" TEXT,
    "usuario_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projecoes_bmm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projecoes_bmm_itens" (
    "id" SERIAL NOT NULL,
    "projecao_id" INTEGER NOT NULL,
    "item_qqp_id" INTEGER NOT NULL,
    "preco_unitario" DECIMAL(18,8) NOT NULL,
    "unidade" "UnidadeQqp" NOT NULL,
    "horas_dia" DECIMAL(4,2),
    "total" DECIMAL(16,2) NOT NULL,
    "posicao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "projecoes_bmm_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projecoes_bmm_semanas" (
    "id" SERIAL NOT NULL,
    "projecao_item_id" INTEGER NOT NULL,
    "semana_inicio" DATE NOT NULL,
    "dias" INTEGER NOT NULL,
    "pessoas" DECIMAL(12,4) NOT NULL,
    "valor" DECIMAL(16,2) NOT NULL,

    CONSTRAINT "projecoes_bmm_semanas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projecoes_bmm_contrato_id_referencia_idx" ON "projecoes_bmm"("contrato_id", "referencia");

-- CreateIndex
CREATE INDEX "projecoes_bmm_obra_id_idx" ON "projecoes_bmm"("obra_id");

-- CreateIndex
CREATE UNIQUE INDEX "projecoes_bmm_obra_id_numero_bmm_referencia_key" ON "projecoes_bmm"("obra_id", "numero_bmm", "referencia");

-- CreateIndex
CREATE INDEX "projecoes_bmm_itens_item_qqp_id_idx" ON "projecoes_bmm_itens"("item_qqp_id");

-- CreateIndex
CREATE UNIQUE INDEX "projecoes_bmm_itens_projecao_id_item_qqp_id_key" ON "projecoes_bmm_itens"("projecao_id", "item_qqp_id");

-- CreateIndex
CREATE UNIQUE INDEX "projecoes_bmm_semanas_projecao_item_id_semana_inicio_key" ON "projecoes_bmm_semanas"("projecao_item_id", "semana_inicio");

-- AddForeignKey
ALTER TABLE "projecoes_bmm" ADD CONSTRAINT "projecoes_bmm_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projecoes_bmm" ADD CONSTRAINT "projecoes_bmm_termo_aditivo_id_fkey" FOREIGN KEY ("termo_aditivo_id") REFERENCES "termos_aditivos"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projecoes_bmm" ADD CONSTRAINT "projecoes_bmm_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projecoes_bmm" ADD CONSTRAINT "projecoes_bmm_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projecoes_bmm_itens" ADD CONSTRAINT "projecoes_bmm_itens_projecao_id_fkey" FOREIGN KEY ("projecao_id") REFERENCES "projecoes_bmm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projecoes_bmm_itens" ADD CONSTRAINT "projecoes_bmm_itens_item_qqp_id_fkey" FOREIGN KEY ("item_qqp_id") REFERENCES "itens_qqp"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projecoes_bmm_semanas" ADD CONSTRAINT "projecoes_bmm_semanas_projecao_item_id_fkey" FOREIGN KEY ("projecao_item_id") REFERENCES "projecoes_bmm_itens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

