-- CreateEnum
CREATE TYPE "TipoRestricaoAtividade" AS ENUM ('PROJETOS', 'SUPRIMENTOS', 'LIBERACAO_AREA', 'SMS', 'EQUIPAMENTO');

-- CreateEnum
CREATE TYPE "StatusRestricaoAtividade" AS ENUM ('PENDENTE', 'BAIXADA');

-- CreateTable
CREATE TABLE "restricoes_atividades" (
    "id" UUID NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "atividade_id" UUID NOT NULL,
    "codigo_atividade" VARCHAR(60) NOT NULL,
    "tipo" "TipoRestricaoAtividade" NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" "StatusRestricaoAtividade" NOT NULL DEFAULT 'PENDENTE',
    "responsavel" VARCHAR(255),
    "data_limite" DATE,
    "data_baixa" TIMESTAMPTZ(6),
    "criado_por" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restricoes_atividades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "restricoes_atividades_obra_id_codigo_atividade_idx" ON "restricoes_atividades"("obra_id", "codigo_atividade");

-- CreateIndex
CREATE INDEX "restricoes_atividades_atividade_id_idx" ON "restricoes_atividades"("atividade_id");

-- CreateIndex
CREATE INDEX "restricoes_atividades_obra_id_status_idx" ON "restricoes_atividades"("obra_id", "status");

-- AddForeignKey
ALTER TABLE "restricoes_atividades" ADD CONSTRAINT "restricoes_atividades_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restricoes_atividades" ADD CONSTRAINT "restricoes_atividades_atividade_id_fkey" FOREIGN KEY ("atividade_id") REFERENCES "atividades_cronograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restricoes_atividades" ADD CONSTRAINT "restricoes_atividades_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

