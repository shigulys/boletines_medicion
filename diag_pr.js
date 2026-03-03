
import { pool } from "./server/db.js";

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
    console.log(`SubTotal: ${pr.subTotal}, NetTotal: ${pr.netTotal}`);

    const linesResult = await pool.query('SELECT * FROM "PaymentRequestLine" WHERE "paymentRequestId" = $1', [id]);
    console.log("\n--- PaymentRequest Lines ---");
    linesResult.rows.forEach((line, index) => {
      console.log(`Line ${index + 1}: ${line.description}`);
      console.log(`  ItemID: ${line.externalItemID}, Unit: "${line.unitOfMeasure}", Qty: ${line.quantity}, Price: ${line.unitPrice}`);
    });

    // Check previous records for same externalTxID
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
    process.exit();
  }
}

const id = process.argv[2] || 5;
checkPR(parseInt(id));
