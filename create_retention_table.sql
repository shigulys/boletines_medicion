-- Script para crear la tabla Retention en Supabase
-- Ejecutar este script en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS "Retention" (
    "id" SERIAL PRIMARY KEY,
    "code" VARCHAR(255) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Crear índice para el campo code
CREATE INDEX IF NOT EXISTS "Retention_code_idx" ON "Retention"("code");

-- Insertar datos de ejemplo
INSERT INTO "Retention" (code, name, percentage, description) VALUES
('RTE001', 'Retención en la Fuente', 10.0, 'Retención por servicios profesionales'),
('RTE002', 'ISR', 2.5, 'Impuesto sobre la renta'),
('RTE003', 'Fondo de Reparo', 5.0, 'Garantía por cumplimiento de obra')
ON CONFLICT (code) DO NOTHING;

-- Verificar que la tabla se creó correctamente
SELECT * FROM "Retention";
