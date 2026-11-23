-- Exclusão lógica de usuários: preserva o histórico (aditiva, sem apagar dados).
ALTER TABLE "usuarios" ADD COLUMN "excluido_em" TIMESTAMPTZ(6);
ALTER TABLE "usuarios" ADD COLUMN "email_original" VARCHAR(255);
