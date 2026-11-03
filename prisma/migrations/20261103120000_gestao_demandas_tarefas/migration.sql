-- CreateEnum
CREATE TYPE "TipoTarefa" AS ENUM ('FIXA_RECORRENTE', 'AVULSA');

-- CreateEnum
CREATE TYPE "DiaSemana" AS ENUM ('SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PrioridadeTarefa" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateTable
CREATE TABLE "tarefas" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descricao" TEXT,
    "tipo" "TipoTarefa" NOT NULL DEFAULT 'AVULSA',
    "dia_recorrencia" "DiaSemana",
    "data_vencimento" TIMESTAMPTZ(6) NOT NULL,
    "status" "StatusTarefa" NOT NULL DEFAULT 'A_FAZER',
    "prioridade" "PrioridadeTarefa" NOT NULL DEFAULT 'MEDIA',
    "usuario_id" INTEGER NOT NULL,
    "obra_id" INTEGER,
    "justificativa_atraso" TEXT,
    "concluido_em" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tarefas_usuario_id_status_idx" ON "tarefas"("usuario_id", "status");

-- CreateIndex
CREATE INDEX "tarefas_status_idx" ON "tarefas"("status");

-- CreateIndex
CREATE INDEX "tarefas_data_vencimento_idx" ON "tarefas"("data_vencimento");

-- CreateIndex
CREATE INDEX "tarefas_obra_id_idx" ON "tarefas"("obra_id");

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

