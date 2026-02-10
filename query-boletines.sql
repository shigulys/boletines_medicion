-- Script SQL para verificar boletines en Supabase
-- Ejecutar en el SQL Editor de Supabase

-- Ver todos los boletines
SELECT 
  id,
  "docNumber",
  "docID",
  status,
  "vendorName",
  "projectName",
  "netTotal",
  date,
  "createdAt"
FROM "PaymentRequest"
ORDER BY "createdAt" DESC;

-- Contar por estado
SELECT 
  status,
  COUNT(*) as total
FROM "PaymentRequest"
GROUP BY status;

-- Ver líneas de boletines
SELECT 
  pr."docNumber",
  prl.description,
  prl.quantity,
  prl."unitPrice",
  prl."totalLine"
FROM "PaymentRequest" pr
JOIN "PaymentRequestLine" prl ON pr.id = prl."paymentRequestId"
ORDER BY pr."createdAt" DESC;

-- Ver estructura actual de la tabla
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'PaymentRequest'
ORDER BY ordinal_position;
