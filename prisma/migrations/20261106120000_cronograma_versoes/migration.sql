-- CreateTable
CREATE TABLE "versoes_cronograma" (
    "id" UUID NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "versao" VARCHAR(30) NOT NULL,
    "numero_revisao" INTEGER NOT NULL,
    "data_snapshot" TIMESTAMPTZ(6) NOT NULL,
    "periodo_inicio" DATE,
    "periodo_fim" DATE,
    "autor_id" INTEGER,
    "arquivo_url" TEXT,
    "arquivo_nome" VARCHAR(255),
    "observacao" TEXT,
    "resumo" JSONB,
    "curva_s" JSONB,
    "histograma_mao_de_obra" JSONB,
    "histograma_equipamentos" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versoes_cronograma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atividades_cronograma" (
    "id" UUID NOT NULL,
    "versao_cronograma_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "codigo_atividade" VARCHAR(60) NOT NULL,
    "codigo_pai" VARCHAR(60),
    "descricao" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "resumo" BOOLEAN NOT NULL DEFAULT false,
    "data_inicio" TIMESTAMPTZ(6),
    "data_fim" TIMESTAMPTZ(6),
    "data_inicio_lb" TIMESTAMPTZ(6),
    "data_fim_lb" TIMESTAMPTZ(6),
    "avanco_fisico_previsto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avanco_fisico_real" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recursos_mao_de_obra" JSONB,
    "recursos_equipamentos" JSONB,
    "predecessoras" TEXT,
    "id_origem" INTEGER,
    "folga_total_dias" DOUBLE PRECISION,
    "caminho_critico" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "atividades_cronograma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "versoes_cronograma_obra_id_idx" ON "versoes_cronograma"("obra_id");

-- CreateIndex
CREATE UNIQUE INDEX "versoes_cronograma_obra_id_numero_revisao_key" ON "versoes_cronograma"("obra_id", "numero_revisao");

-- CreateIndex
CREATE INDEX "atividades_cronograma_versao_cronograma_id_ordem_idx" ON "atividades_cronograma"("versao_cronograma_id", "ordem");

-- CreateIndex
CREATE INDEX "atividades_cronograma_versao_cronograma_id_codigo_atividade_idx" ON "atividades_cronograma"("versao_cronograma_id", "codigo_atividade");

-- AddForeignKey
ALTER TABLE "versoes_cronograma" ADD CONSTRAINT "versoes_cronograma_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versoes_cronograma" ADD CONSTRAINT "versoes_cronograma_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades_cronograma" ADD CONSTRAINT "atividades_cronograma_versao_cronograma_id_fkey" FOREIGN KEY ("versao_cronograma_id") REFERENCES "versoes_cronograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

