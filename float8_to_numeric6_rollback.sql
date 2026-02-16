BEGIN;

-- Budget
ALTER TABLE "Budget"
  ALTER COLUMN "totalAmount" TYPE DOUBLE PRECISION USING "totalAmount"::double precision;

-- Retention
ALTER TABLE "Retention"
  ALTER COLUMN "percentage" TYPE DOUBLE PRECISION USING "percentage"::double precision;

-- BudgetItem
ALTER TABLE "BudgetItem"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision,
  ALTER COLUMN "unitPrice" TYPE DOUBLE PRECISION USING "unitPrice"::double precision,
  ALTER COLUMN "total" TYPE DOUBLE PRECISION USING "total"::double precision;

-- Measurement
ALTER TABLE "Measurement"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision,
  ALTER COLUMN "price" TYPE DOUBLE PRECISION USING "price"::double precision;

-- PaymentRequest
ALTER TABLE "PaymentRequest"
  ALTER COLUMN "subTotal" TYPE DOUBLE PRECISION USING "subTotal"::double precision,
  ALTER COLUMN "taxAmount" TYPE DOUBLE PRECISION USING "taxAmount"::double precision,
  ALTER COLUMN "retentionPercent" TYPE DOUBLE PRECISION USING "retentionPercent"::double precision,
  ALTER COLUMN "retentionAmount" TYPE DOUBLE PRECISION USING "retentionAmount"::double precision,
  ALTER COLUMN "advancePercent" TYPE DOUBLE PRECISION USING "advancePercent"::double precision,
  ALTER COLUMN "advanceAmount" TYPE DOUBLE PRECISION USING "advanceAmount"::double precision,
  ALTER COLUMN "isrPercent" TYPE DOUBLE PRECISION USING "isrPercent"::double precision,
  ALTER COLUMN "isrAmount" TYPE DOUBLE PRECISION USING "isrAmount"::double precision,
  ALTER COLUMN "netTotal" TYPE DOUBLE PRECISION USING "netTotal"::double precision;

-- PaymentRequestLine
ALTER TABLE "PaymentRequestLine"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision,
  ALTER COLUMN "unitPrice" TYPE DOUBLE PRECISION USING "unitPrice"::double precision,
  ALTER COLUMN "taxPercent" TYPE DOUBLE PRECISION USING "taxPercent"::double precision,
  ALTER COLUMN "taxAmount" TYPE DOUBLE PRECISION USING "taxAmount"::double precision,
  ALTER COLUMN "retentionPercent" TYPE DOUBLE PRECISION USING "retentionPercent"::double precision,
  ALTER COLUMN "retentionAmount" TYPE DOUBLE PRECISION USING "retentionAmount"::double precision,
  ALTER COLUMN "itbisRetentionPercent" TYPE DOUBLE PRECISION USING "itbisRetentionPercent"::double precision,
  ALTER COLUMN "totalLine" TYPE DOUBLE PRECISION USING "totalLine"::double precision;

COMMIT;
