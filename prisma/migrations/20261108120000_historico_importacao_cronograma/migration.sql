-- CreateEnum
CREATE TYPE "AcaoHistoricoCronograma" AS ENUM ('IMPORTADO', 'FALHA', 'EXCLUIDO');

-- AlterTable
ALTER TABLE "versoes_cronograma" ADD COLUMN     "arquivo_hash" VARCHAR(64),
ADD COLUMN     "arquivo_tamanho" INTEGER;

-- CreateTable
CREATE TABLE "historico_importacao_cronogramas" (
    "id" UUID NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "versao_id" UUID,
    "acao" "AcaoHistoricoCronograma" NOT NULL,
    "versao" VARCHAR(30),
    "arquivo_nome" VARCHAR(255),
    "arquivo_hash" VARCHAR(64),
    "arquivo_url" TEXT,
    "total_atividades" INTEGER,
    "usuario_id" INTEGER,
    "detalhes" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_importacao_cronogramas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historico_importacao_cronogramas_obra_id_created_at_idx" ON "historico_importacao_cronogramas"("obra_id", "created_at");

-- CreateIndex
CREATE INDEX "versoes_cronograma_obra_id_arquivo_hash_idx" ON "versoes_cronograma"("obra_id", "arquivo_hash");

-- AddForeignKey
ALTER TABLE "historico_importacao_cronogramas" ADD CONSTRAINT "historico_importacao_cronogramas_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_importacao_cronogramas" ADD CONSTRAINT "historico_importacao_cronogramas_versao_id_fkey" FOREIGN KEY ("versao_id") REFERENCES "versoes_cronograma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_importacao_cronogramas" ADD CONSTRAINT "historico_importacao_cronogramas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

