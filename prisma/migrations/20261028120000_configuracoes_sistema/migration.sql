-- CreateTable
CREATE TABLE "configuracoes_sistema" (
    "chave" VARCHAR(100) NOT NULL,
    "valor" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracoes_sistema_pkey" PRIMARY KEY ("chave")
);
