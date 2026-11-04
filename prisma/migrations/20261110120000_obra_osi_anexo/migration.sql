-- AlterTable
ALTER TABLE "obras" ADD COLUMN     "osi_anexada_em" TIMESTAMPTZ(6),
ADD COLUMN     "osi_anexada_por" INTEGER,
ADD COLUMN     "osi_anexo_url" TEXT;

