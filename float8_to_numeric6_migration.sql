BEGIN;

-- Budget
ALTER TABLE "Budget"
  ALTER COLUMN "totalAmount" TYPE NUMERIC(18,6) USING ROUND("totalAmount"::numeric, 6);

-- Retention
ALTER TABLE "Retention"
  ALTER COLUMN "percentage" TYPE NUMERIC(18,6) USING ROUND("percentage"::numeric, 6);

-- BudgetItem
ALTER TABLE "BudgetItem"
  ALTER COLUMN "quantity" TYPE NUMERIC(18,6) USING ROUND("quantity"::numeric, 6),
  ALTER COLUMN "unitPrice" TYPE NUMERIC(18,6) USING ROUND("unitPrice"::numeric, 6),
  ALTER COLUMN "total" TYPE NUMERIC(18,6) USING ROUND("total"::numeric, 6);

-- Measurement
ALTER TABLE "Measurement"
  ALTER COLUMN "quantity" TYPE NUMERIC(18,6) USING ROUND("quantity"::numeric, 6),
  ALTER COLUMN "price" TYPE NUMERIC(18,6) USING ROUND("price"::numeric, 6);

-- PaymentRequest
ALTER TABLE "PaymentRequest"
  ALTER COLUMN "subTotal" TYPE NUMERIC(18,6) USING ROUND("subTotal"::numeric, 6),
  ALTER COLUMN "taxAmount" TYPE NUMERIC(18,6) USING ROUND("taxAmount"::numeric, 6),
  ALTER COLUMN "retentionPercent" TYPE NUMERIC(18,6) USING ROUND("retentionPercent"::numeric, 6),
  ALTER COLUMN "retentionAmount" TYPE NUMERIC(18,6) USING ROUND("retentionAmount"::numeric, 6),
  ALTER COLUMN "advancePercent" TYPE NUMERIC(18,6) USING ROUND("advancePercent"::numeric, 6),
  ALTER COLUMN "advanceAmount" TYPE NUMERIC(18,6) USING ROUND("advanceAmount"::numeric, 6),
  ALTER COLUMN "isrPercent" TYPE NUMERIC(18,6) USING ROUND("isrPercent"::numeric, 6),
  ALTER COLUMN "isrAmount" TYPE NUMERIC(18,6) USING ROUND("isrAmount"::numeric, 6),
  ALTER COLUMN "netTotal" TYPE NUMERIC(18,6) USING ROUND("netTotal"::numeric, 6);

-- PaymentRequestLine
ALTER TABLE "PaymentRequestLine"
  ALTER COLUMN "quantity" TYPE NUMERIC(18,6) USING ROUND("quantity"::numeric, 6),
  ALTER COLUMN "unitPrice" TYPE NUMERIC(18,6) USING ROUND("unitPrice"::numeric, 6),
  ALTER COLUMN "taxPercent" TYPE NUMERIC(18,6) USING ROUND("taxPercent"::numeric, 6),
  ALTER COLUMN "taxAmount" TYPE NUMERIC(18,6) USING ROUND("taxAmount"::numeric, 6),
  ALTER COLUMN "retentionPercent" TYPE NUMERIC(18,6) USING ROUND("retentionPercent"::numeric, 6),
  ALTER COLUMN "retentionAmount" TYPE NUMERIC(18,6) USING ROUND("retentionAmount"::numeric, 6),
  ALTER COLUMN "itbisRetentionPercent" TYPE NUMERIC(18,6) USING ROUND("itbisRetentionPercent"::numeric, 6),
  ALTER COLUMN "totalLine" TYPE NUMERIC(18,6) USING ROUND("totalLine"::numeric, 6);

COMMIT;
