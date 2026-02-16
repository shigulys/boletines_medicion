ALTER TABLE "PaymentSchedule"
ADD COLUMN IF NOT EXISTS "paymentDate" TIMESTAMP(3);

UPDATE "PaymentSchedule"
SET "paymentDate" = COALESCE("paymentDate", "date")
WHERE "paymentDate" IS NULL;

ALTER TABLE "PaymentSchedule"
ALTER COLUMN "paymentDate" SET NOT NULL;
