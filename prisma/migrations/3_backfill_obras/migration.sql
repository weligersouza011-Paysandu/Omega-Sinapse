-- =============================================================================
-- Backfill: cria a obra (1:1) de cada orçamento já aprovado ou em OSI.
--
-- O módulo de Obras isola o ciclo operacional de execução. Os orçamentos que já
-- saíram do ciclo comercial (APROVADO, ENCAMINHADO_OSI e OSI_EMITIDA) passam a
-- ter sua obra correspondente, iniciando o ciclo de vida operacional.
--
-- Regras de migração:
--   - status operacional inicial: PARA_INICIAR (todos);
--   - o planejador já atribuído no orçamento é herdado pela obra;
--   - os registros em OSI_EMITIDA já tiveram a OSI emitida (a data de emissão
--     recebe o updated_at do orçamento); o número da OSI permanece em branco e
--     deve ser completado pelo Planejador no acompanhamento da obra.
-- =============================================================================

INSERT INTO "obras" (
    "orcamento_id",
    "status",
    "planejador_id",
    "osi_emitida_em",
    "created_at",
    "updated_at"
)
SELECT
    o."id",
    'PARA_INICIAR',
    o."planejador_id",
    CASE WHEN o."status" = 'OSI_EMITIDA' THEN o."updated_at" ELSE NULL END,
    o."created_at",
    o."updated_at"
FROM "orcamentos" o
WHERE o."status" IN ('APROVADO', 'ENCAMINHADO_OSI', 'OSI_EMITIDA')
  AND NOT EXISTS (
    SELECT 1 FROM "obras" b WHERE b."orcamento_id" = o."id"
  );
