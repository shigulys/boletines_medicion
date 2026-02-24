
const { Client } = require('pg');

const DATABASE_URL = "postgresql://postgres.ugskhcjmiypwbzbmgajy:Proyecto2026!@aws-0-us-west-2.pooler.supabase.com:5432/postgres";

async function run() {
    const client = new Client({ connectionString: DATABASE_URL });
    try {
        await client.connect();
        console.log("Connected to DB");

        // 1. Check BM-000005 specifically
        const res = await client.query('SELECT id, "docNumber", "cubicacionNo", "vendorName", "externalTxID" FROM "PaymentRequest" WHERE "docNumber" = $1', ['BM-000005']);
        console.log("\n--- BM-000005 Status ---");
        console.log(res.rows);

        if (res.rows.length === 0) {
            console.log("BM-000005 not found in DB!");
        }

        // 2. Count records with null or 0 cubicacionNo
        const countRes = await client.query('SELECT count(*) FROM "PaymentRequest" WHERE "cubicacionNo" IS NULL OR "cubicacionNo" = 0');
        console.log(`\nRecords with missing cubicacionNo: ${countRes.rows[0].count}`);

        // 3. List some groups that might have issues
        const groupsRes = await client.query('SELECT "externalTxID", "vendorName", count(*) FROM "PaymentRequest" GROUP BY "externalTxID", "vendorName" HAVING count(*) > 1');
        console.log("\n--- Groups with multiple bulletins ---");
        console.log(groupsRes.rows);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

run();
