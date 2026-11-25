-- =============================================================================
-- Programação S+1: programação semanal de mão de obra (semana → frentes → equipes → pessoas).
-- =============================================================================

-- CreateEnum
CREATE TYPE "StatusProgramacao" AS ENUM ('EM_ELABORACAO', 'EMITIDA');

-- CreateEnum
CREATE TYPE "TipoFrenteProgramacao" AS ENUM ('OBRA', 'APOIO', 'DISPONIVEL', 'AFASTAMENTO');

-- CreateTable
CREATE TABLE "programacoes_semanais" (
    "id" SERIAL NOT NULL,
    "ano" INTEGER NOT NULL,
    "semana" INTEGER NOT NULL,
    "data_inicio" DATE NOT NULL,
    "revisao" INTEGER NOT NULL DEFAULT 0,
    "status" "StatusProgramacao" NOT NULL DEFAULT 'EM_ELABORACAO',
    "emitida_em" TIMESTAMPTZ(6),
    "observacoes" TEXT,
    "criado_por_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programacoes_semanais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programacao_frentes" (
    "id" SERIAL NOT NULL,
    "programacao_id" INTEGER NOT NULL,
    "tipo" "TipoFrenteProgramacao" NOT NULL DEFAULT 'OBRA',
    "titulo" VARCHAR(200) NOT NULL,
    "codigo" VARCHAR(60),
    "responsavel" VARCHAR(120),
    "obra_id" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "programacao_frentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programacao_equipes" (
    "id" SERIAL NOT NULL,
    "frente_id" INTEGER NOT NULL,
    "codigo" VARCHAR(30),
    "disciplina" VARCHAR(120),
    "atividades" TEXT,
    "premissas" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "programacao_equipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programacao_alocacoes" (
    "id" SERIAL NOT NULL,
    "equipe_id" INTEGER NOT NULL,
    "colaborador_id" INTEGER,
    "matricula" VARCHAR(30),
    "nome" VARCHAR(255) NOT NULL,
    "funcao" VARCHAR(120),
    "dias" BOOLEAN[] DEFAULT ARRAY[]::BOOLEAN[],
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "programacao_alocacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "programacoes_semanais_ano_semana_key" ON "programacoes_semanais"("ano", "semana");

-- CreateIndex
CREATE INDEX "programacao_frentes_programacao_id_ordem_idx" ON "programacao_frentes"("programacao_id", "ordem");

-- CreateIndex
CREATE INDEX "programacao_frentes_obra_id_idx" ON "programacao_frentes"("obra_id");

-- CreateIndex
CREATE INDEX "programacao_equipes_frente_id_ordem_idx" ON "programacao_equipes"("frente_id", "ordem");

-- CreateIndex
CREATE INDEX "programacao_alocacoes_equipe_id_ordem_idx" ON "programacao_alocacoes"("equipe_id", "ordem");

-- CreateIndex
CREATE INDEX "programacao_alocacoes_matricula_idx" ON "programacao_alocacoes"("matricula");

-- AddForeignKey
ALTER TABLE "programacoes_semanais" ADD CONSTRAINT "programacoes_semanais_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programacao_frentes" ADD CONSTRAINT "programacao_frentes_programacao_id_fkey" FOREIGN KEY ("programacao_id") REFERENCES "programacoes_semanais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programacao_frentes" ADD CONSTRAINT "programacao_frentes_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programacao_equipes" ADD CONSTRAINT "programacao_equipes_frente_id_fkey" FOREIGN KEY ("frente_id") REFERENCES "programacao_frentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programacao_alocacoes" ADD CONSTRAINT "programacao_alocacoes_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "programacao_equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programacao_alocacoes" ADD CONSTRAINT "programacao_alocacoes_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

