-- Crear tablas para programación de pagos de boletines
CREATE TABLE IF NOT EXISTS "PaymentSchedule" (
  "id" SERIAL PRIMARY KEY,
  "scheduleNumber" TEXT NOT NULL UNIQUE,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'PENDIENTE_APROBACION',
  "notes" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "sentToFinanceAt" TIMESTAMP(3),
  "sentToFinanceBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "PaymentScheduleLine" (
  "id" SERIAL PRIMARY KEY,
  "paymentScheduleId" INTEGER NOT NULL,
  "paymentRequestId" INTEGER NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentScheduleLine_paymentScheduleId_fkey"
    FOREIGN KEY ("paymentScheduleId") REFERENCES "PaymentSchedule"("id") ON DELETE CASCADE,
  CONSTRAINT "PaymentScheduleLine_paymentRequestId_fkey"
    FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentScheduleLine_paymentScheduleId_paymentRequestId_key"
  ON "PaymentScheduleLine" ("paymentScheduleId", "paymentRequestId");

CREATE INDEX IF NOT EXISTS "PaymentSchedule_status_idx"
  ON "PaymentSchedule" ("status");

CREATE TABLE IF NOT EXISTS "PaymentScheduleAudit" (
  "id" SERIAL PRIMARY KEY,
  "paymentScheduleId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "statusBefore" TEXT,
  "statusAfter" TEXT,
  "detail" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentScheduleAudit_paymentScheduleId_fkey"
    FOREIGN KEY ("paymentScheduleId") REFERENCES "PaymentSchedule"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PaymentScheduleAudit_paymentScheduleId_createdAt_idx"
  ON "PaymentScheduleAudit" ("paymentScheduleId", "createdAt");
