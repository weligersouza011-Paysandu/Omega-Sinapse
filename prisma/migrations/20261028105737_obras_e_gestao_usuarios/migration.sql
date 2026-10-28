-- CreateEnum
CREATE TYPE "StatusObra" AS ENUM ('PARA_INICIAR', 'EM_ANDAMENTO', 'PARALISADA', 'CONCLUIDA');

-- CreateTable
CREATE TABLE "obras" (
    "id" SERIAL NOT NULL,
    "orcamento_id" INTEGER NOT NULL,
    "status" "StatusObra" NOT NULL DEFAULT 'PARA_INICIAR',
    "planejador_id" INTEGER,
    "osi_numero" VARCHAR(60),
    "osi_emitida_em" TIMESTAMPTZ(6),
    "osi_emitida_por" INTEGER,
    "ata_partida_url" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "obras_orcamento_id_key" ON "obras"("orcamento_id");

-- CreateIndex
CREATE INDEX "obras_status_idx" ON "obras"("status");

-- CreateIndex
CREATE INDEX "obras_planejador_id_idx" ON "obras"("planejador_id");

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_planejador_id_fkey" FOREIGN KEY ("planejador_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_osi_emitida_por_fkey" FOREIGN KEY ("osi_emitida_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
