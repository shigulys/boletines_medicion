
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function removeRetentions(id) {
  try {
    console.log(`Eliminando retenciones para el boletín ID: ${id}...`);
    
    await pool.query('BEGIN');

    // 1. Actualizar las líneas para quitar retenciones
    await pool.query(`
      UPDATE "PaymentRequestLine"
      SET "retentionPercent" = 0,
          "retentionAmount" = 0,
          "itbisRetentionPercent" = 0
      WHERE "paymentRequestId" = $1
    `, [id]);
    
    // 2. Recalcular total de línea (quantity * unitPrice + taxAmount - 0 - 0)
    // Asumimos que taxAmount ya está calculado correctamente.
    await pool.query(`
      UPDATE "PaymentRequestLine"
      SET "totalLine" = ("quantity" * "unitPrice") + "taxAmount"
      WHERE "paymentRequestId" = $1
    `, [id]);

    // 3. Actualizar la cabecera (Header)
    // El NetTotal debe ser SubTotal + TaxAmount (ya que no hay retenciones ni anticipos)
    // Aseguramos que retentionAmount y retentionPercent sean 0 en el header también.
    await pool.query(`
      UPDATE "PaymentRequest"
      SET "retentionPercent" = 0,
          "retentionAmount" = 0,
          "isrPercent" = 0,
          "isrAmount" = 0,
          "advancePercent" = 0,
          "advanceAmount" = 0,
          "netTotal" = "subTotal" + "taxAmount" - "amortizationAmount"
      WHERE id = $1
    `, [id]);

    await pool.query('COMMIT');
    console.log("✅ Retenciones eliminadas y totales recalculados con éxito.");

  } catch (err) {
    await pool.query('ROLLBACK');
    console.error("❌ Error al actualizar:", err.message);
  } finally {
    await pool.end();
  }
}

removeRetentions(5);
