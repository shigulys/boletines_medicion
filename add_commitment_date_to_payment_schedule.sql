ALTER TABLE "PaymentSchedule"
ADD COLUMN IF NOT EXISTS "commitmentDate" TIMESTAMP(3);

UPDATE "PaymentSchedule"
SET "commitmentDate" = COALESCE("commitmentDate", "date")
WHERE "commitmentDate" IS NULL;

ALTER TABLE "PaymentSchedule"
ALTER COLUMN "commitmentDate" SET NOT NULL;
