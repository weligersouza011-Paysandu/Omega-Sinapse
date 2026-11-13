-- =============================================================================
-- Projeção Financeira por BMM — Fase 1 (linha do QQP)
-- Estrutura do QQP do sistema "Projeção Financeira" adaptada ao Synapse:
--  - contratos: Nº CT SAP / Omega / cliente e versão do QQP (concorrência otimista);
--  - termos aditivos: Nº CT SAP e vigência do TAC;
--  - itens do QQP: escopo por TAC (TAC0 = contrato original), hierarquia
--    categoria da planilha › grupo › subgrupo, quantidade contratada, ordem e
--    preço com mais casas decimais;
--  - ordem de visualização do QQP por contrato;
--  - feriados personalizados (globais ou por contrato).
-- Migração aditiva: os itens existentes ficam no TAC0 e as telas atuais seguem iguais.
-- =============================================================================

-- AlterTable
ALTER TABLE "contratos" ADD COLUMN     "descricao_omega" TEXT,
ADD COLUMN     "numero_cliente" VARCHAR(60),
ADD COLUMN     "numero_omega" VARCHAR(60),
ADD COLUMN     "numero_sap" VARCHAR(60),
ADD COLUMN     "qqp_revisao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "termos_aditivos" ADD COLUMN     "data_fim" DATE,
ADD COLUMN     "data_inicio" DATE,
ADD COLUMN     "numero_sap" VARCHAR(60);

-- AlterTable (itens existentes: escopo_tac = 0 e termo_aditivo_id vazio = TAC0)
ALTER TABLE "itens_qqp" ADD COLUMN     "categoria_planilha" VARCHAR(200),
ADD COLUMN     "escopo_tac" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "grupo" VARCHAR(200),
ADD COLUMN     "posicao" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quantidade" DECIMAL(24,8),
ADD COLUMN     "subgrupo" VARCHAR(200),
ADD COLUMN     "termo_aditivo_id" INTEGER,
ADD COLUMN     "unidade_planilha" VARCHAR(30),
ALTER COLUMN "codigo" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "preco_unitario" SET DATA TYPE DECIMAL(18,8);

-- escopo_tac sempre espelha o TAC (0 = contrato original). O Prisma não gerencia CHECKs,
-- então esta regra fica só no banco; o serviço do QQP grava os dois campos juntos.
ALTER TABLE "itens_qqp" ADD CONSTRAINT "itens_qqp_escopo_tac_check"
    CHECK ("escopo_tac" = COALESCE("termo_aditivo_id", 0));

-- CreateIndex (nova unicidade antes de remover a antiga: o código não se repete no mesmo contrato/TAC)
CREATE UNIQUE INDEX "itens_qqp_contrato_id_escopo_tac_codigo_key" ON "itens_qqp"("contrato_id", "escopo_tac", "codigo");

-- DropIndex
DROP INDEX "itens_qqp_contrato_id_codigo_key";

-- CreateIndex
CREATE INDEX "itens_qqp_termo_aditivo_id_idx" ON "itens_qqp"("termo_aditivo_id");

-- CreateIndex
CREATE INDEX "itens_qqp_contrato_id_escopo_tac_posicao_idx" ON "itens_qqp"("contrato_id", "escopo_tac", "posicao");

-- CreateTable
CREATE TABLE "qqp_ordem_visualizacao" (
    "contrato_id" INTEGER NOT NULL,
    "ordem" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qqp_ordem_visualizacao_pkey" PRIMARY KEY ("contrato_id")
);

-- CreateTable
CREATE TABLE "feriados_personalizados" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "contrato_id" INTEGER,
    "usuario_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feriados_personalizados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feriados_personalizados_data_idx" ON "feriados_personalizados"("data");

-- CreateIndex
CREATE INDEX "feriados_personalizados_contrato_id_idx" ON "feriados_personalizados"("contrato_id");

-- AddForeignKey (NO ACTION: o TAC só é excluído sem itens; a exclusão do contrato remove tudo em cascata)
ALTER TABLE "itens_qqp" ADD CONSTRAINT "itens_qqp_termo_aditivo_id_fkey" FOREIGN KEY ("termo_aditivo_id") REFERENCES "termos_aditivos"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qqp_ordem_visualizacao" ADD CONSTRAINT "qqp_ordem_visualizacao_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feriados_personalizados" ADD CONSTRAINT "feriados_personalizados_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feriados_personalizados" ADD CONSTRAINT "feriados_personalizados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
