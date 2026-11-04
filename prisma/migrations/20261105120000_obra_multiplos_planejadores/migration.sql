-- CreateTable
CREATE TABLE "obra_planejadores" (
    "obra_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obra_planejadores_pkey" PRIMARY KEY ("obra_id","usuario_id")
);

-- CreateIndex
CREATE INDEX "obra_planejadores_usuario_id_idx" ON "obra_planejadores"("usuario_id");

-- AddForeignKey
ALTER TABLE "obra_planejadores" ADD CONSTRAINT "obra_planejadores_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_planejadores" ADD CONSTRAINT "obra_planejadores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: o planejador único atual de cada obra vira o planejador principal.
INSERT INTO "obra_planejadores" ("obra_id", "usuario_id", "ordem")
SELECT "id", "planejador_id", 0 FROM "obras" WHERE "planejador_id" IS NOT NULL
ON CONFLICT DO NOTHING;
