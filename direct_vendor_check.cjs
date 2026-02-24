
const { Client } = require('pg');

const DATABASE_URL = "postgresql://postgres.ugskhcjmiypwbzbmgajy:Proyecto2026!@aws-0-us-west-2.pooler.supabase.com:5432/postgres";

async function run() {
    const client = new Client({ connectionString: DATABASE_URL });
    try {
        await client.connect();
        const res = await client.query('SELECT "docNumber", "vendorName", "cubicacionNo" FROM "PaymentRequest" WHERE "docNumber" = \'BM-000005\'');
        if (res.rows.length > 0) {
            const v = res.rows[0].vendorName;
            console.log(`EXACT_VENDOR_NAME_BM5: [${v}] (Length: ${v.length})`);
            console.log(`CUBICACION_NO_BM5: ${res.rows[0].cubicacionNo}`);
        } else {
            console.log("BM-000005 NOT FOUND");
        }

        // Let's see some other records too
        const others = await client.query('SELECT "docNumber", "vendorName", "cubicacionNo" FROM "PaymentRequest" LIMIT 5');
        others.rows.forEach(r => {
            console.log(`BM_${r.docNumber}: [${r.vendorName}] | No: ${r.cubicacionNo}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
