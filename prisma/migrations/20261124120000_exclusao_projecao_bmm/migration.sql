-- =============================================================================
-- Projeção Financeira por BMM — Fase 7: solicitação de exclusão com aprovação do ADMIN
-- (port de projection_deletions.py do sistema Projeção Financeira).
-- =============================================================================

-- CreateEnum
CREATE TYPE "StatusSolicitacaoExclusao" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA');

-- CreateTable
CREATE TABLE "solicitacoes_exclusao_projecao" (
    "id" SERIAL NOT NULL,
    "contrato_id" INTEGER NOT NULL,
    "projecao_id" INTEGER,
    "projecao_json" JSONB NOT NULL,
    "motivo" TEXT NOT NULL,
    "status" "StatusSolicitacaoExclusao" NOT NULL DEFAULT 'PENDENTE',
    "solicitante_id" INTEGER,
    "solicitante_nome" VARCHAR(255) NOT NULL,
    "decidido_por_id" INTEGER,
    "decidido_por_nome" VARCHAR(255),
    "decidido_em" TIMESTAMPTZ(6),
    "motivo_decisao" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitacoes_exclusao_projecao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitacoes_exclusao_projecao_contrato_id_status_idx" ON "solicitacoes_exclusao_projecao"("contrato_id", "status");

-- CreateIndex
CREATE INDEX "solicitacoes_exclusao_projecao_projecao_id_idx" ON "solicitacoes_exclusao_projecao"("projecao_id");

-- AddForeignKey
ALTER TABLE "solicitacoes_exclusao_projecao" ADD CONSTRAINT "solicitacoes_exclusao_projecao_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_exclusao_projecao" ADD CONSTRAINT "solicitacoes_exclusao_projecao_projecao_id_fkey" FOREIGN KEY ("projecao_id") REFERENCES "projecoes_bmm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_exclusao_projecao" ADD CONSTRAINT "solicitacoes_exclusao_projecao_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_exclusao_projecao" ADD CONSTRAINT "solicitacoes_exclusao_projecao_decidido_por_id_fkey" FOREIGN KEY ("decidido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

