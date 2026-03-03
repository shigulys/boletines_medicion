
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function checkPR(id) {
  try {
    const prResult = await pool.query('SELECT * FROM "PaymentRequest" WHERE id = $1', [id]);
    if (prResult.rows.length === 0) {
      console.log("No se encontró el boletín con ID:", id);
      return;
    }
    const pr = prResult.rows[0];
    console.log("--- PaymentRequest Header ---");
    console.log(`ID: ${pr.id}, DocNumber: ${pr.docNumber}, Status: ${pr.status}, CubicacionNo: ${pr.cubicacionNo}`);
    console.log(`SubTotal: ${pr.subTotal}, Tax: ${pr.taxAmount}`);
    console.log(`Retention%: ${pr.retentionPercent}, RetentionAmount: ${pr.retentionAmount}`); 
    console.log(`ItbisRetention%: ${pr.itbisRetentionPercent}, ItbisRetAmount: ${pr.itbisRetentionAmount} (Note: check schema if these exist on header)`);
    console.log(`Advance%: ${pr.advancePercent}, AdvanceAmount: ${pr.advanceAmount}`);
    console.log(`ISR%: ${pr.isrPercent}, ISRAmount: ${pr.isrAmount}`);
    console.log(`NetTotal: ${pr.netTotal}`);

    const linesResult = await pool.query('SELECT * FROM "PaymentRequestLine" WHERE "paymentRequestId" = $1', [id]);
    console.log("\n--- PaymentRequest Lines ---");
    linesResult.rows.forEach((line, index) => {
      console.log(`Line ${index + 1}: ${line.description}`);
      console.log(`  ItemID: ${line.externalItemID}, Unit: "${line.unitOfMeasure}", Qty: ${line.quantity}, Price: ${line.unitPrice}`);
      console.log(`  Start retention details: Ret%: ${line.retentionPercent}, RetAmt: ${line.retentionAmount}, ItbisRet%: ${line.itbisRetentionPercent}`);
    });

    const prevResult = await pool.query(
      'SELECT id, "docNumber", "cubicacionNo" FROM "PaymentRequest" WHERE "externalTxID" = $1 AND id != $2 ORDER BY id DESC',
      [pr.externalTxID, id]
    );
    console.log("\n--- Other PRs for same TX ---");
    prevResult.rows.forEach(r => {
      console.log(`ID: ${r.id}, DocNumber: ${r.docNumber}, Cubicacion: ${r.cubicacionNo}`);
    });

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
    process.exit();
  }
}

const id = process.argv[2] || 5;
checkPR(parseInt(id));
