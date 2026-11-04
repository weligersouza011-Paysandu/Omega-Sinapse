-- CreateEnum
CREATE TYPE "TipoAlteracaoRevisao" AS ENUM ('REVISAO_SUBSTITUTIVA', 'ADITIVO_FINANCEIRO');

-- CreateEnum
CREATE TYPE "StatusAprovacaoRevisao" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO');

-- AlterTable
-- As revisões existentes ficam como substitutivas e aprovadas: o valor vigente
-- de cada orçamento (última revisão) permanece exatamente o mesmo.
ALTER TABLE "orcamento_revisoes"
    ADD COLUMN "tipo_alteracao" "TipoAlteracaoRevisao" NOT NULL DEFAULT 'REVISAO_SUBSTITUTIVA',
    ADD COLUMN "status_aprovacao" "StatusAprovacaoRevisao" NOT NULL DEFAULT 'APROVADO',
    ADD COLUMN "anexo_url" TEXT;
