-- =============================================================================
-- "Meu perfil": foto e dados de contato que o próprio usuário edita.
-- =============================================================================

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "foto_url" TEXT,
ADD COLUMN "telefone" VARCHAR(30),
ADD COLUMN "cargo" VARCHAR(120),
ADD COLUMN "setor" VARCHAR(120);
