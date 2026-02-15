-- Crear catálogo de unidades de medida
CREATE TABLE IF NOT EXISTS "UnitOfMeasure" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Semillas mínimas
INSERT INTO "UnitOfMeasure" ("code", "name", "description")
VALUES
  ('UND', 'Unidad', 'Unidad genérica'),
  ('M', 'Metro', 'Longitud en metros'),
  ('M2', 'Metro cuadrado', 'Área en metros cuadrados'),
  ('M3', 'Metro cúbico', 'Volumen en metros cúbicos'),
  ('GLB', 'Global', 'Partida global')
ON CONFLICT ("code") DO NOTHING;