const { Client } = require('pg');
const DATABASE_URL = "postgresql://postgres.ugskhcjmiypwbzbmgajy:Proyecto2026!@aws-0-us-west-2.pooler.supabase.com:5432/postgres";

async function run() {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    // 1. Todos los registros con su cubicacionNo actual
    const all = await client.query(`
        SELECT id, "docNumber", "externalTxID", "vendorName", "cubicacionNo", "status"
        FROM "PaymentRequest"
        ORDER BY id ASC
    `);

    process.stdout.write("ID|docNumber|txID|vendor|cubicacion|status\n");
    for (const r of all.rows) {
        process.stdout.write(`${r.id}|${r.docNumber}|${(r.externalTxID || '').substring(0, 12)}|${(r.vendorName || '').substring(0, 30)}|${r.cubicacionNo}|${r.status}\n`);
    }

    // 2. Específicamente BM-000005
    const bm5 = await client.query(`SELECT id, "docNumber", "externalTxID", "vendorName", "cubicacionNo", "status" FROM "PaymentRequest" WHERE "docNumber"='BM-000005'`);
    if (bm5.rows.length > 0) {
        const b = bm5.rows[0];
        process.stdout.write(`\nBM5_TXID=${b.externalTxID}\nBM5_VENDOR=${b.vendorName}\nBM5_CUB=${b.cubicacionNo}\n`);

        // Cuántos BM tienen el mismo vendor + OC
        const siblings = await client.query(`
            SELECT COUNT(*) as total, 
                   COUNT(CASE WHEN status != 'RECHAZADO' THEN 1 END) as no_rechazados
            FROM "PaymentRequest"
            WHERE "externalTxID" = $1 AND LOWER("vendorName") = LOWER($2)
        `, [b.externalTxID, b.vendorName]);
        process.stdout.write(`SIBLINGS_TOTAL=${siblings.rows[0].total}|NO_RECHAZADOS=${siblings.rows[0].no_rechazados}\n`);
    }

    await client.end();
}
run().catch(e => process.stdout.write("ERROR: " + e.message + "\n"));
