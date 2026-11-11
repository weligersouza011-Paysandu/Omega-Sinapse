-- =============================================================================
-- Cliente padrão: todo orçamento/obra sem cliente informado passa a ser da Vale.
-- Só preenche os vazios; clientes já informados não mudam.
-- =============================================================================

UPDATE "orcamentos" SET "cliente" = 'Vale' WHERE "cliente" IS NULL OR btrim("cliente") = '';
