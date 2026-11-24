-- =============================================================================
-- RDO por obra: o RDO passa a pertencer a UMA obra em andamento, ganha supervisor, efetivo do dia,
-- pergunta de PTS e justificativa das atividades fora de escopo.
-- =============================================================================

-- DropIndex
DROP INDEX "rdos_encarregado_id_data_key";

-- AlterTable: a obra entra nula, é preenchida e só depois vira obrigatória.
ALTER TABLE "rdos" ADD COLUMN     "obra_id" INTEGER,
ADD COLUMN     "pts_necessaria" BOOLEAN,
ADD COLUMN     "supervisor_id" INTEGER;

-- Backfill: a obra do RDO é a da sua primeira atividade (o módulo ainda não tinha uso em produção).
UPDATE "rdos" r
SET "obra_id" = (
  SELECT a."obra_id" FROM "rdo_atividades" a WHERE a."rdo_id" = r."id" ORDER BY a."id" LIMIT 1
);

-- RDOs sem nenhuma atividade não têm como descobrir a obra: eram rascunhos vazios.
DELETE FROM "rdos" WHERE "obra_id" IS NULL;

ALTER TABLE "rdos" ALTER COLUMN "obra_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "rdo_atividades" ADD COLUMN     "justificativa" TEXT;

-- CreateTable
CREATE TABLE "rdo_efetivo" (
    "id" SERIAL NOT NULL,
    "rdo_id" INTEGER NOT NULL,
    "tipo" "TipoLancamentoMaoObra" NOT NULL,
    "funcao_id" INTEGER,
    "colaborador_id" INTEGER,
    "quantidade" DECIMAL(6,2) NOT NULL DEFAULT 1,

    CONSTRAINT "rdo_efetivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rdo_efetivo_rdo_id_idx" ON "rdo_efetivo"("rdo_id");

-- CreateIndex
CREATE INDEX "rdos_obra_id_data_idx" ON "rdos"("obra_id", "data");

-- CreateIndex
CREATE UNIQUE INDEX "rdos_obra_id_encarregado_id_data_key" ON "rdos"("obra_id", "encarregado_id", "data");

-- AddForeignKey
ALTER TABLE "rdos" ADD CONSTRAINT "rdos_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdos" ADD CONSTRAINT "rdos_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_efetivo" ADD CONSTRAINT "rdo_efetivo_rdo_id_fkey" FOREIGN KEY ("rdo_id") REFERENCES "rdos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_efetivo" ADD CONSTRAINT "rdo_efetivo_funcao_id_fkey" FOREIGN KEY ("funcao_id") REFERENCES "funcoes_mao_obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rdo_efetivo" ADD CONSTRAINT "rdo_efetivo_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras de integridade que o Prisma não expressa.
ALTER TABLE "rdo_efetivo" ADD CONSTRAINT "rdo_efetivo_tipo_chk" CHECK (
  "quantidade" > 0 AND (
    ("tipo" = 'FUNCAO' AND "funcao_id" IS NOT NULL) OR ("tipo" = 'NOMINAL' AND "colaborador_id" IS NOT NULL)
  )
);
-- Uma pessoa nominal aparece uma única vez no efetivo do dia.
CREATE UNIQUE INDEX "rdo_efetivo_nominal_uq" ON "rdo_efetivo"("rdo_id", "colaborador_id") WHERE "colaborador_id" IS NOT NULL;
-- A atividade fora de escopo exige justificativa.
ALTER TABLE "rdo_atividades" ADD CONSTRAINT "rdo_atividades_justificativa_chk" CHECK (
  "fora_de_escopo" = FALSE OR ("justificativa" IS NOT NULL AND length(btrim("justificativa")) > 0)
);
