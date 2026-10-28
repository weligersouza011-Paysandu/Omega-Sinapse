-- CreateEnum
CREATE TYPE "TipoLocalizacaoObra" AS ENUM ('PONTO', 'TRECHO');

-- CreateEnum
CREATE TYPE "StatusRelatorioObra" AS ENUM ('RASCUNHO', 'ENVIADO', 'APROVADO');

-- CreateEnum
CREATE TYPE "StatusAtividadeObra" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "GravidadeOcorrencia" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "TipoMidiaObra" AS ENUM ('FOTO', 'VIDEO');

-- CreateTable
CREATE TABLE "obra_localizacoes" (
    "id" SERIAL NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "descricao" VARCHAR(255) NOT NULL,
    "tipo" "TipoLocalizacaoObra" NOT NULL DEFAULT 'PONTO',
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "km_inicial" DECIMAL(10,3),
    "km_final" DECIMAL(10,3),
    "referencia" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obra_localizacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obra_avanco_fisico" (
    "id" SERIAL NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "semana" INTEGER NOT NULL,
    "fisico_prev" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "fisico_lb_prev" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "fisico_real" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "fisico_tend_acum" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "fisico_prev_acum" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "fisico_real_acum" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obra_avanco_fisico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obra_relatorios" (
    "id" SERIAL NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "resumo" TEXT,
    "status" "StatusRelatorioObra" NOT NULL DEFAULT 'RASCUNHO',
    "autor_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obra_relatorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obra_atividades" (
    "id" SERIAL NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "relatorio_id" INTEGER,
    "titulo" VARCHAR(200) NOT NULL,
    "descricao" TEXT,
    "status" "StatusAtividadeObra" NOT NULL DEFAULT 'PENDENTE',
    "responsavel" VARCHAR(120),
    "prazo" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obra_atividades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obra_ocorrencias" (
    "id" SERIAL NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "relatorio_id" INTEGER,
    "descricao" TEXT NOT NULL,
    "gravidade" "GravidadeOcorrencia" NOT NULL DEFAULT 'MEDIA',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obra_ocorrencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obra_comentarios" (
    "id" SERIAL NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "relatorio_id" INTEGER,
    "autor_id" INTEGER,
    "texto" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obra_comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obra_midias" (
    "id" SERIAL NOT NULL,
    "obra_id" INTEGER NOT NULL,
    "relatorio_id" INTEGER,
    "tipo" "TipoMidiaObra" NOT NULL DEFAULT 'FOTO',
    "url" TEXT NOT NULL,
    "legenda" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obra_midias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "obra_localizacoes_obra_id_idx" ON "obra_localizacoes"("obra_id");

-- CreateIndex
CREATE INDEX "obra_avanco_fisico_obra_id_idx" ON "obra_avanco_fisico"("obra_id");

-- CreateIndex
CREATE UNIQUE INDEX "obra_avanco_fisico_obra_id_semana_key" ON "obra_avanco_fisico"("obra_id", "semana");

-- CreateIndex
CREATE INDEX "obra_relatorios_obra_id_idx" ON "obra_relatorios"("obra_id");

-- CreateIndex
CREATE INDEX "obra_relatorios_data_idx" ON "obra_relatorios"("data");

-- CreateIndex
CREATE INDEX "obra_atividades_obra_id_idx" ON "obra_atividades"("obra_id");

-- CreateIndex
CREATE INDEX "obra_atividades_relatorio_id_idx" ON "obra_atividades"("relatorio_id");

-- CreateIndex
CREATE INDEX "obra_atividades_status_idx" ON "obra_atividades"("status");

-- CreateIndex
CREATE INDEX "obra_ocorrencias_obra_id_idx" ON "obra_ocorrencias"("obra_id");

-- CreateIndex
CREATE INDEX "obra_ocorrencias_relatorio_id_idx" ON "obra_ocorrencias"("relatorio_id");

-- CreateIndex
CREATE INDEX "obra_comentarios_obra_id_idx" ON "obra_comentarios"("obra_id");

-- CreateIndex
CREATE INDEX "obra_comentarios_relatorio_id_idx" ON "obra_comentarios"("relatorio_id");

-- CreateIndex
CREATE INDEX "obra_midias_obra_id_idx" ON "obra_midias"("obra_id");

-- CreateIndex
CREATE INDEX "obra_midias_relatorio_id_idx" ON "obra_midias"("relatorio_id");

-- CreateIndex
CREATE INDEX "obra_midias_tipo_idx" ON "obra_midias"("tipo");

-- AddForeignKey
ALTER TABLE "obra_localizacoes" ADD CONSTRAINT "obra_localizacoes_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_avanco_fisico" ADD CONSTRAINT "obra_avanco_fisico_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_relatorios" ADD CONSTRAINT "obra_relatorios_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_relatorios" ADD CONSTRAINT "obra_relatorios_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_atividades" ADD CONSTRAINT "obra_atividades_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_atividades" ADD CONSTRAINT "obra_atividades_relatorio_id_fkey" FOREIGN KEY ("relatorio_id") REFERENCES "obra_relatorios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_ocorrencias" ADD CONSTRAINT "obra_ocorrencias_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_ocorrencias" ADD CONSTRAINT "obra_ocorrencias_relatorio_id_fkey" FOREIGN KEY ("relatorio_id") REFERENCES "obra_relatorios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_comentarios" ADD CONSTRAINT "obra_comentarios_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_comentarios" ADD CONSTRAINT "obra_comentarios_relatorio_id_fkey" FOREIGN KEY ("relatorio_id") REFERENCES "obra_relatorios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_comentarios" ADD CONSTRAINT "obra_comentarios_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_midias" ADD CONSTRAINT "obra_midias_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_midias" ADD CONSTRAINT "obra_midias_relatorio_id_fkey" FOREIGN KEY ("relatorio_id") REFERENCES "obra_relatorios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

