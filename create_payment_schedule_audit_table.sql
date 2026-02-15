-- Crear tabla de auditoría para programaciones de pagos
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
