-- CreateTable
CREATE TABLE "programacao_atividades" (
    "id" SERIAL NOT NULL,
    "equipe_id" INTEGER NOT NULL,
    "codigo_atividade" VARCHAR(60),
    "descricao" TEXT NOT NULL,
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "programacao_atividades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "programacao_atividades_equipe_id_ordem_idx" ON "programacao_atividades"("equipe_id", "ordem");

-- AddForeignKey
ALTER TABLE "programacao_atividades" ADD CONSTRAINT "programacao_atividades_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "programacao_equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
