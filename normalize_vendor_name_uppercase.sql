-- Normaliza el nombre del proveedor en boletines existentes a MAYÚSCULAS
UPDATE "PaymentRequest"
SET "vendorName" = UPPER(TRIM("vendorName"))
WHERE "vendorName" IS NOT NULL
  AND "vendorName" <> UPPER(TRIM("vendorName"));
