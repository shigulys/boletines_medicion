-- Script para reparar BM-000005
-- Problema: cubicacionNo = 999 (valor corrupto)
-- Solución: Reasignar cubicacionNo = 5 (secuencial para esa OC)

-- 1. Primero, verificar estado actual de BM-000005
SELECT 
  id, 
  "docNumber", 
  "cubicacionNo", 
  "externalTxID", 
  "vendorName",
  status
FROM "PaymentRequest"
WHERE id = 5;

-- 2. Ver todos los boletines de la misma OC para verificar secuencia
SELECT 
  id, 
  "docNumber", 
  "cubicacionNo", 
  "vendorName",
  status,
  "createdAt"
FROM "PaymentRequest"
WHERE "externalTxID" = (
  SELECT "externalTxID" FROM "PaymentRequest" WHERE id = 5
)
ORDER BY "createdAt" ASC;

-- 3. Reparar: asignar cubicacionNo = 5 a BM-000005
UPDATE "PaymentRequest"
SET "cubicacionNo" = 5
WHERE id = 5;

-- 4. Verificar que se realizó el cambio
SELECT 
  id, 
  "docNumber", 
  "cubicacionNo", 
  "externalTxID", 
  "vendorName",
  status
FROM "PaymentRequest"
WHERE id = 5;

-- 5. Verificar secuencia final
SELECT 
  id, 
  "docNumber", 
  "cubicacionNo", 
  "vendorName",
  status
FROM "PaymentRequest"
WHERE "externalTxID" = (
  SELECT "externalTxID" FROM "PaymentRequest" WHERE id = 5
)
ORDER BY "cubicacionNo" ASC;
