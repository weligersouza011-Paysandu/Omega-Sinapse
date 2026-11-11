-- =============================================================================
-- Perfil CLIENTE (somente consulta) e lista de páginas liberadas por usuário.
-- =============================================================================

-- AlterEnum
ALTER TYPE "PerfilUsuario" ADD VALUE 'CLIENTE';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "paginas_permitidas" TEXT[] DEFAULT ARRAY[]::TEXT[];
