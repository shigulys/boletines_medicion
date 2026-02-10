-- Script para actualizar la base de datos con las columnas faltantes
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar columna rejectionReason a PaymentRequest si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'PaymentRequest' AND column_name = 'rejectionReason'
    ) THEN
        ALTER TABLE "PaymentRequest" ADD COLUMN "rejectionReason" TEXT;
    END IF;
END $$;

-- 2. Agregar columnas de retención a PaymentRequestLine si no existen
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'PaymentRequestLine' AND column_name = 'retentionPercent'
    ) THEN
        ALTER TABLE "PaymentRequestLine" ADD COLUMN "retentionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'PaymentRequestLine' AND column_name = 'retentionAmount'
    ) THEN
        ALTER TABLE "PaymentRequestLine" ADD COLUMN "retentionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 3. Verificar que las columnas se crearon correctamente
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('PaymentRequest', 'PaymentRequestLine')
    AND column_name IN ('rejectionReason', 'retentionPercent', 'retentionAmount')
ORDER BY table_name, column_name;
