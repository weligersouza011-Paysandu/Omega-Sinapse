-- =============================================================================
-- Perfil ENCARREGADO (campo: preenche o RDO das obras a que está vinculado).
-- Em migration própria: o Postgres não deixa usar um valor de enum criado na mesma transação.
-- =============================================================================

-- AlterEnum
ALTER TYPE "PerfilUsuario" ADD VALUE 'ENCARREGADO';
