-- Agregar campo vendorFiscalID a la tabla PaymentRequest
ALTER TABLE "PaymentRequest" ADD COLUMN IF NOT EXISTS "vendorFiscalID" TEXT;
