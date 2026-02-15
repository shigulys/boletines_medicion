-- Agregar unidad de medida por línea en boletines
ALTER TABLE "PaymentRequestLine"
ADD COLUMN IF NOT EXISTS "unitOfMeasure" TEXT;