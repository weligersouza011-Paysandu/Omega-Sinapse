-- A identidade da medição passa a ser a data: as semanas ISO se repetem em
-- obras plurianuais (ex.: S17/2025 e S17/2026), enquanto a data é única.
DROP INDEX IF EXISTS "obra_avanco_fisico_obra_id_semana_key";

CREATE UNIQUE INDEX "obra_avanco_fisico_obra_id_data_key"
  ON "obra_avanco_fisico"("obra_id", "data");
