-- =============================================================================
-- Alinha o enum de status do orçamento ao fluxo operacional validado.
--
-- Os valores legados são convertidos (sem perda do histórico já importado):
--   RASCUNHO    -> VISITA_TECNICA
--   ENVIADO     -> AGUARDANDO_APROVACAO
--   EM_ANALISE  -> AGUARDANDO_APROVACAO
--   APROVADO    -> APROVADO          (mantido)
--   REPROVADO   -> DESATIVADO
--   CANCELADO   -> DESATIVADO
-- =============================================================================

-- 1. Novo tipo com as opções oficiais do processo.
CREATE TYPE "StatusOrcamento_novo" AS ENUM (
  'VISITA_TECNICA',
  'AGUARDANDO_APROVACAO',
  'APROVADO',
  'DESATIVADO',
  'ENCAMINHADO_OSI',
  'OSI_EMITIDA'
);

-- 2. Converte a coluna existente aplicando o de/para acima.
ALTER TABLE "orcamentos" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "orcamentos"
  ALTER COLUMN "status" TYPE "StatusOrcamento_novo"
  USING (
    CASE "status"::text
      WHEN 'RASCUNHO'   THEN 'VISITA_TECNICA'
      WHEN 'ENVIADO'    THEN 'AGUARDANDO_APROVACAO'
      WHEN 'EM_ANALISE' THEN 'AGUARDANDO_APROVACAO'
      WHEN 'APROVADO'   THEN 'APROVADO'
      WHEN 'REPROVADO'  THEN 'DESATIVADO'
      WHEN 'CANCELADO'  THEN 'DESATIVADO'
      ELSE 'VISITA_TECNICA'
    END
  )::"StatusOrcamento_novo";

-- 3. Substitui o tipo antigo e restaura o default.
DROP TYPE "StatusOrcamento";
ALTER TYPE "StatusOrcamento_novo" RENAME TO "StatusOrcamento";
ALTER TABLE "orcamentos" ALTER COLUMN "status" SET DEFAULT 'VISITA_TECNICA';
