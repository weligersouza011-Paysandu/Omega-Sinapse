-- =============================================================================
-- RDO (Relatório Diário de Obra): cadastros, RDO, atividades, fotos, mão de obra, equipamentos,
-- PTS, desvios, histórico de status e avanço aprovado por (obra, EDT).
-- =============================================================================

-- CreateEnum
CREATE TYPE "StatusRdo" AS ENUM ('RASCUNHO', 'FINALIZADO', 'APROVADO', 'DEVOLVIDO');

-- CreateEnum
CREATE TYPE "TipoLancamentoMaoObra" AS ENUM ('FUNCAO', 'NOMINAL');


-- CreateTable
CREATE TABLE "funcoes_mao_obra" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "item_qqp_id" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funcoes_mao_obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaboradores" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(255) NOT NULL,
    "matricula" VARCHAR(30),
    "funcao_id" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "colaboradores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipamentos" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "codigo" VARCHAR(60),
    "item_qqp_id" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivos_desvio" (
    "id" SERIAL NOT NULL,
    "descricao" VARCHAR(160) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motivos_desvio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encarregados_obra" (
    "usuario_id" INTEGER NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encarregados_obra_pkey" PRIMARY KEY ("usuario_id","obra_id")
);

-- CreateTable
CREATE TABLE "rdos" (
    "id" SERIAL NOT NULL,
    "contrato_id" INTEGER,
    "encarregado_id" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "status" "StatusRdo" NOT NULL DEFAULT 'RASCUNHO',
    "clima_manha" VARCHAR(40),
    "clima_tarde" VARCHAR(40),
    "clima_noite" VARCHAR(40),
    "dss_tema" VARCHAR(200),
    "dss_participantes" INTEGER,
    "comentario_geral" TEXT,
    "assinado_em" TIMESTAMPTZ(6),
    "decidido_por_id" INTEGER,
    "decidido_em" TIMESTAMPTZ(6),
    "motivo_devolucao" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rdos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rdo_atividades" (
    "id" SERIAL NOT NULL,
    "rdo_id" INTEGER NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "codigo_atividade" VARCHAR(60),
    "descricao_snapshot" TEXT NOT NULL,
    "fora_de_escopo" BOOLEAN NOT NULL DEFAULT false,
    "percentual_anterior" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "percentual_declarado" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "percentual_validado" DECIMAL(5,2),
    "observacao" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rdo_atividades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rdo_fotos" (
    "id" SERIAL NOT NULL,
    "rdo_atividade_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "public_id" TEXT,
    "legenda" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rdo_fotos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rdo_mao_obra" (
    "id" SERIAL NOT NULL,
    "rdo_atividade_id" INTEGER NOT NULL,
    "tipo" "TipoLancamentoMaoObra" NOT NULL,
    "funcao_id" INTEGER,
    "colaborador_id" INTEGER,
    "quantidade" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "horas" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "rdo_mao_obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rdo_equipamentos" (
    "id" SERIAL NOT NULL,
    "rdo_id" INTEGER NOT NULL,
    "equipamento_id" INTEGER NOT NULL,
    "horas_trabalhadas" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "horas_paradas" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "observacao" TEXT,

    CONSTRAINT "rdo_equipamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rdo_pts" (
    "id" SERIAL NOT NULL,
    "rdo_id" INTEGER NOT NULL,
    "numero" VARCHAR(60),
    "solicitado_em" TIMESTAMPTZ(6) NOT NULL,
    "liberado_em" TIMESTAMPTZ(6),

    CONSTRAINT "rdo_pts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rdo_desvios" (
    "id" SERIAL NOT NULL,
    "rdo_id" INTEGER NOT NULL,
    "motivo_id" INTEGER NOT NULL,
    "horas" DECIMAL(5,2) NOT NULL,
    "observacao" TEXT,

    CONSTRAINT "rdo_desvios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rdo_historico_status" (
    "id" SERIAL NOT NULL,
    "rdo_id" INTEGER NOT NULL,
    "de" "StatusRdo",
    "para" "StatusRdo" NOT NULL,
    "usuario_id" INTEGER,
    "motivo" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rdo_historico_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avanco_atividade_aprovado" (
    "id" SERIAL NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "codigo_atividade" VARCHAR(60) NOT NULL,
    "data" DATE NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "rdo_atividade_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avanco_atividade_aprovado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funcoes_mao_obra_nome_key" ON "funcoes_mao_obra"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "colaboradores_matricula_key" ON "colaboradores"("matricula");

-- CreateIndex
CREATE INDEX "colaboradores_funcao_id_idx" ON "colaboradores"("funcao_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipamentos_codigo_key" ON "equipamentos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "motivos_desvio_descricao_key" ON "motivos_desvio"("descricao");

-- CreateIndex
CREATE INDEX "encarregados_obra_obra_id_idx" ON "encarregados_obra"("obra_id");

-- CreateIndex
CREATE INDEX "rdos_status_data_idx" ON "rdos"("status", "data");

-- CreateIndex
CREATE INDEX "rdos_contrato_id_idx" ON "rdos"("contrato_id");

-- CreateIndex
CREATE UNIQUE INDEX "rdos_encarregado_id_data_key" ON "rdos"("encarregado_id", "data");

-- CreateIndex
CREATE INDEX "rdo_atividades_rdo_id_idx" ON "rdo_atividades"("rdo_id");

-- CreateIndex
CREATE INDEX "rdo_atividades_obra_id_codigo_atividade_idx" ON "rdo_atividades"("obra_id", "codigo_atividade");

-- CreateIndex
CREATE INDEX "rdo_fotos_rdo_atividade_id_idx" ON "rdo_fotos"("rdo_atividade_id");

-- CreateIndex
CREATE INDEX "rdo_mao_obra_rdo_atividade_id_idx" ON "rdo_mao_obra"("rdo_atividade_id");

-- CreateIndex
CREATE INDEX "rdo_equipamentos_rdo_id_idx" ON "rdo_equipamentos"("rdo_id");

-- CreateIndex
CREATE INDEX "rdo_pts_rdo_id_idx" ON "rdo_pts"("rdo_id");

-- CreateIndex
CREATE INDEX "rdo_desvios_rdo_id_idx" ON "rdo_desvios"("rdo_id");

-- CreateIndex
CREATE INDEX "rdo_historico_status_rdo_id_idx" ON "rdo_historico_status"("rdo_id");

-- CreateIndex
CREATE UNIQUE INDEX "avanco_atividade_aprovado_rdo_atividade_id_key" ON "avanco_atividade_aprovado"("rdo_atividade_id");

-- CreateIndex
CREATE INDEX "avanco_atividade_aprovado_obra_id_codigo_atividade_data_idx" ON "avanco_atividade_aprovado"("obra_id", "codigo_atividade", "data");

-- AddForeignKey
ALTER TABLE "funcoes_mao_obra" ADD CONSTRAINT "funcoes_mao_obra_item_qqp_id_fkey" FOREIGN KEY ("item_qqp_id") REFERENCES "itens_qqp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_funcao_id_fkey" FOREIGN KEY ("funcao_id") REFERENCES "funcoes_mao_obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_item_qqp_id_fkey" FOREIGN KEY ("item_qqp_id") REFERENCES "itens_qqp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encarregados_obra" ADD CONSTRAINT "encarregados_obra_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encarregados_obra" ADD CONSTRAINT "encarregados_obra_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdos" ADD CONSTRAINT "rdos_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdos" ADD CONSTRAINT "rdos_encarregado_id_fkey" FOREIGN KEY ("encarregado_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdos" ADD CONSTRAINT "rdos_decidido_por_id_fkey" FOREIGN KEY ("decidido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_atividades" ADD CONSTRAINT "rdo_atividades_rdo_id_fkey" FOREIGN KEY ("rdo_id") REFERENCES "rdos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_atividades" ADD CONSTRAINT "rdo_atividades_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_fotos" ADD CONSTRAINT "rdo_fotos_rdo_atividade_id_fkey" FOREIGN KEY ("rdo_atividade_id") REFERENCES "rdo_atividades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_mao_obra" ADD CONSTRAINT "rdo_mao_obra_rdo_atividade_id_fkey" FOREIGN KEY ("rdo_atividade_id") REFERENCES "rdo_atividades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_mao_obra" ADD CONSTRAINT "rdo_mao_obra_funcao_id_fkey" FOREIGN KEY ("funcao_id") REFERENCES "funcoes_mao_obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_mao_obra" ADD CONSTRAINT "rdo_mao_obra_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_equipamentos" ADD CONSTRAINT "rdo_equipamentos_rdo_id_fkey" FOREIGN KEY ("rdo_id") REFERENCES "rdos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_equipamentos" ADD CONSTRAINT "rdo_equipamentos_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_pts" ADD CONSTRAINT "rdo_pts_rdo_id_fkey" FOREIGN KEY ("rdo_id") REFERENCES "rdos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_desvios" ADD CONSTRAINT "rdo_desvios_rdo_id_fkey" FOREIGN KEY ("rdo_id") REFERENCES "rdos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_desvios" ADD CONSTRAINT "rdo_desvios_motivo_id_fkey" FOREIGN KEY ("motivo_id") REFERENCES "motivos_desvio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_historico_status" ADD CONSTRAINT "rdo_historico_status_rdo_id_fkey" FOREIGN KEY ("rdo_id") REFERENCES "rdos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_historico_status" ADD CONSTRAINT "rdo_historico_status_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avanco_atividade_aprovado" ADD CONSTRAINT "avanco_atividade_aprovado_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avanco_atividade_aprovado" ADD CONSTRAINT "avanco_atividade_aprovado_rdo_atividade_id_fkey" FOREIGN KEY ("rdo_atividade_id") REFERENCES "rdo_atividades"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Regras de integridade que o Prisma não expressa.
ALTER TABLE "rdo_atividades" ADD CONSTRAINT "rdo_atividades_percentuais_chk" CHECK (
  "percentual_anterior" BETWEEN 0 AND 100
  AND "percentual_declarado" BETWEEN 0 AND 100
  AND ("percentual_validado" IS NULL OR "percentual_validado" BETWEEN 0 AND 100)
);
ALTER TABLE "avanco_atividade_aprovado" ADD CONSTRAINT "avanco_atividade_aprovado_percentual_chk" CHECK ("percentual" BETWEEN 0 AND 100);
ALTER TABLE "rdo_mao_obra" ADD CONSTRAINT "rdo_mao_obra_valores_chk" CHECK ("quantidade" > 0 AND "horas" >= 0 AND "horas" <= 24);
ALTER TABLE "rdo_mao_obra" ADD CONSTRAINT "rdo_mao_obra_tipo_chk" CHECK (
  ("tipo" = 'FUNCAO' AND "funcao_id" IS NOT NULL) OR ("tipo" = 'NOMINAL' AND "colaborador_id" IS NOT NULL)
);
ALTER TABLE "rdo_equipamentos" ADD CONSTRAINT "rdo_equipamentos_horas_chk" CHECK ("horas_trabalhadas" BETWEEN 0 AND 24 AND "horas_paradas" BETWEEN 0 AND 24);
ALTER TABLE "rdo_desvios" ADD CONSTRAINT "rdo_desvios_horas_chk" CHECK ("horas" > 0 AND "horas" <= 24);
ALTER TABLE "rdo_pts" ADD CONSTRAINT "rdo_pts_ordem_chk" CHECK ("liberado_em" IS NULL OR "liberado_em" >= "solicitado_em");
