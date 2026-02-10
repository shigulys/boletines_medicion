-- Agregar columna itbisRetentionPercent a la tabla PaymentRequestLine
ALTER TABLE "PaymentRequestLine" 
ADD COLUMN "itbisRetentionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
