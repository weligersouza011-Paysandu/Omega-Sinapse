-- =============================================================================
-- Permite múltiplos fiscais (nome + contato) por orçamento.
--
-- Os campos singulares "fiscal_nome"/"fiscal_contato" de "orcamentos" são
-- substituídos pela tabela "orcamento_fiscais" (1:N). O fiscal já cadastrado
-- é copiado para a nova estrutura antes da remoção das colunas antigas.
-- =============================================================================

-- 1. Nova tabela de fiscais.
CREATE TABLE "orcamento_fiscais" (
    "id" SERIAL NOT NULL,
    "orcamento_id" INTEGER NOT NULL,
    "nome" VARCHAR(255) NOT NULL,
    "contato" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orcamento_fiscais_pkey" PRIMARY KEY ("id")
);

-- 2. Migra o fiscal já existente em cada orçamento para a nova estrutura.
INSERT INTO "orcamento_fiscais" ("orcamento_id", "nome", "contato", "created_at")
SELECT "id", "fiscal_nome", "fiscal_contato", "created_at"
FROM "orcamentos"
WHERE "fiscal_nome" IS NOT NULL AND BTRIM("fiscal_nome") <> '';

-- 3. Remove as colunas singulares (a fonte de verdade passa a ser a nova tabela).
ALTER TABLE "orcamentos" DROP COLUMN "fiscal_contato";
ALTER TABLE "orcamentos" DROP COLUMN "fiscal_nome";

-- 4. Índices e chave estrangeira.
CREATE INDEX "orcamento_fiscais_orcamento_id_idx" ON "orcamento_fiscais"("orcamento_id");
CREATE INDEX "orcamento_fiscais_nome_idx" ON "orcamento_fiscais"("nome");

ALTER TABLE "orcamento_fiscais"
  ADD CONSTRAINT "orcamento_fiscais_orcamento_id_fkey"
  FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
