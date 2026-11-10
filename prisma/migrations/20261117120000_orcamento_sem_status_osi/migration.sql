-- O orçamento deixa de ter as etapas "Encaminhado para abertura de OSI" e "OSI - Emitida":
-- depois de aprovado ele já segue para Obras (o Planejamento cuida da OSI e dos documentos lá).
-- Os valores continuam no enum (o PostgreSQL não remove valor de enum sem recriar o tipo),
-- mas nenhum orçamento fica neles. A data de emissão da OSI vive em obras.osi_emitida_em e não é tocada.
UPDATE "orcamentos"
SET "status" = 'APROVADO'
WHERE "status" IN ('ENCAMINHADO_OSI', 'OSI_EMITIDA');
