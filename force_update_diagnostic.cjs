
const { Client } = require('pg');

const DATABASE_URL = "postgresql://postgres.ugskhcjmiypwbzbmgajy:Proyecto2026!@aws-0-us-west-2.pooler.supabase.com:5432/postgres";

async function run() {
    const client = new Client({ connectionString: DATABASE_URL });
    try {
        await client.connect();
        console.log("--- START DB VERIFICATION ---");

        // 1. Check table structure
        const columns = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'PaymentRequest'
        `);
        console.log("Columns in PaymentRequest:", columns.rows.map(c => `${c.column_name} (${c.data_type})`));

        // 2. Force update BM-000005 to 999 for testing
        const updateRes = await client.query('UPDATE "PaymentRequest" SET "cubicacionNo" = 999 WHERE "docNumber" = \'BM-000005\' RETURNING id, "docNumber", "cubicacionNo"');
        console.log("Update result for BM-000005:", updateRes.rows);

        // 3. Check all records
        const allRes = await client.query('SELECT "docNumber", "cubicacionNo" FROM "PaymentRequest" ORDER BY id DESC LIMIT 20');
        console.log("Last 20 records (docNumber, cubicacionNo):");
        console.log(JSON.stringify(allRes.rows, null, 2));

        console.log("--- END DB VERIFICATION ---");
    } catch (err) {
        console.error("CRITICAL ERROR:", err);
    } finally {
        await client.end();
    }
}

run();
