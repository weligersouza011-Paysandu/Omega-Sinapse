-- =============================================================================
-- Vários PEPs (CC) por orçamento, com um ativo por vez.
-- O PEP atual de cada orçamento vira o primeiro PEP ativo da nova tabela.
-- =============================================================================

-- CreateTable
CREATE TABLE "orcamento_peps" (
    "id" SERIAL NOT NULL,
    "orcamento_id" INTEGER NOT NULL,
    "pep" VARCHAR(100) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orcamento_peps_pkey" PRIMARY KEY ("id")
);

-- Migra o PEP já cadastrado em cada orçamento (ativo).
INSERT INTO "orcamento_peps" ("orcamento_id", "pep", "ativo", "created_at")
SELECT "id", "pep", true, "created_at"
FROM "orcamentos"
WHERE BTRIM("pep") <> '';

-- CreateIndex
CREATE INDEX "orcamento_peps_orcamento_id_idx" ON "orcamento_peps"("orcamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "orcamento_peps_orcamento_id_pep_key" ON "orcamento_peps"("orcamento_id", "pep");

-- AddForeignKey
ALTER TABLE "orcamento_peps" ADD CONSTRAINT "orcamento_peps_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
