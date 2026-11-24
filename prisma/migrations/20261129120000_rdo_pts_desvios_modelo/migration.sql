-- =============================================================================
-- RDO: PTS com emitente e Desvios por motivo (lista fixa com horas) + observação geral.
-- =============================================================================

-- AlterTable
ALTER TABLE "rdos" ADD COLUMN     "desvios_observacao" TEXT;

-- AlterTable
ALTER TABLE "rdo_pts" ADD COLUMN     "emitente" VARCHAR(160);

-- AlterTable
ALTER TABLE "motivos_desvio" ADD COLUMN     "ordem" INTEGER NOT NULL DEFAULT 1000;

-- Um lançamento por motivo no RDO (remove repetidos antigos, mantendo o primeiro).
DELETE FROM "rdo_desvios" a USING "rdo_desvios" b
WHERE a."rdo_id" = b."rdo_id" AND a."motivo_id" = b."motivo_id" AND a."id" > b."id";

-- CreateIndex
CREATE UNIQUE INDEX "rdo_desvios_rdo_id_motivo_id_key" ON "rdo_desvios"("rdo_id", "motivo_id");

-- Motivos padrão do modelo de campo, na ordem em que aparecem no RDO.
INSERT INTO "motivos_desvio" ("descricao", "ativo", "ordem") VALUES
  ('Aguardando Materiais', true, 1),
  ('Aguardando Instrução', true, 2),
  ('Aguardando Recursos', true, 3),
  ('Equipamento Não Liberado', true, 4),
  ('Atividade de Segurança', true, 5),
  ('Condições Climáticas', true, 6),
  ('Aguardando Transporte', true, 7),
  ('Em Trânsito', true, 8),
  ('Aguardando Operação', true, 9),
  ('Aguardando Energia', true, 10),
  ('Aguardando limpeza operacional', true, 11),
  ('Aguardando montagem de andaime', true, 12),
  ('Aguardando Ajuste de Andaime', true, 13),
  ('Aguardando bloqueio', true, 14),
  ('Interferências com outra frente de serviço', true, 15),
  ('Paralisação pela Segurança Vale', true, 16),
  ('Aguardo da OM ( ordem de manutenção)', true, 17),
  ('Equipe à disposição', true, 18)
ON CONFLICT ("descricao") DO UPDATE SET "ordem" = EXCLUDED."ordem";
