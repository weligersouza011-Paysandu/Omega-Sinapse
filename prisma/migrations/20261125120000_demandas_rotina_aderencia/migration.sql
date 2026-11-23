-- =============================================================================
-- Gestão de Demandas: horário de vencimento das rotinas semanais, aderência por
-- pontualidade (-0,5 ponto a cada 30 min de atraso) e justificativa com categoria
-- e vínculo opcional com a atividade que impactou a entrega.
-- =============================================================================

-- CreateEnum
CREATE TYPE "CategoriaJustificativa" AS ENUM (
    'SOLICITACAO_EXTRA',
    'DEMANDA_FORA_ROTINA',
    'DEPENDENCIA_EXTERNA',
    'MUDANCA_ESCOPO',
    'PROBLEMA_TECNICO',
    'OUTROS'
);

-- AlterTable
ALTER TABLE "tarefas"
    ADD COLUMN "hora_recorrencia" VARCHAR(5),
    ADD COLUMN "justificativa_categoria" "CategoriaJustificativa",
    ADD COLUMN "justificativa_tarefa_id" INTEGER,
    ADD COLUMN "aderencia" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "tarefas_justificativa_tarefa_id_idx" ON "tarefas"("justificativa_tarefa_id");

-- AddForeignKey
ALTER TABLE "tarefas"
    ADD CONSTRAINT "tarefas_justificativa_tarefa_id_fkey"
    FOREIGN KEY ("justificativa_tarefa_id") REFERENCES "tarefas"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: tarefas já concluídas recebem a aderência pela mesma regra (30 min = 0,5).
UPDATE "tarefas"
SET "aderencia" = GREATEST(
    0,
    100 - 0.5 * FLOOR(EXTRACT(EPOCH FROM ("concluido_em" - "data_vencimento")) / 1800)
)
WHERE "status" = 'CONCLUIDO'
  AND "concluido_em" IS NOT NULL
  AND "concluido_em" > "data_vencimento";

UPDATE "tarefas"
SET "aderencia" = 100
WHERE "status" = 'CONCLUIDO'
  AND "concluido_em" IS NOT NULL
  AND "concluido_em" <= "data_vencimento";
