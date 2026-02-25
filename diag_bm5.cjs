const { Client } = require('pg');

const DATABASE_URL = "postgresql://postgres.ugskhcjmiypwbzbmgajy:Proyecto2026!@aws-0-us-west-2.pooler.supabase.com:5432/postgres";

async function run() {
    const client = new Client({ connectionString: DATABASE_URL });
    try {
        await client.connect();
        console.log('Conectado a DB\n');

        // Ver BM-000005 directamente
        const bm5 = await client.query(`
            SELECT id, "docNumber", "externalTxID", "vendorName", "cubicacionNo", "status", "createdAt"
            FROM "PaymentRequest"
            WHERE "docNumber" = 'BM-000005'
        `);
        console.log('=== BM-000005 ===');
        console.log(JSON.stringify(bm5.rows[0], null, 2));

        if (bm5.rows.length === 0) {
            console.log('No se encontró BM-000005');
            return;
        }

        const bm = bm5.rows[0];
        const txID = bm.externalTxID;
        const vendorRaw = bm.vendorName;

        console.log(`\nexternalTxID: ${txID}`);
        console.log(`vendorName: "${vendorRaw}"`);
        console.log(`cubicacionNo actual: ${bm.cubicacionNo}`);

        // Ver todos los boletines de la misma OC y proveedor
        console.log('\n=== Todos los BM con mismo externalTxID ===');
        const sameOC = await client.query(`
            SELECT id, "docNumber", "vendorName", "cubicacionNo", "status", "createdAt"
            FROM "PaymentRequest"
            WHERE "externalTxID" = $1
            ORDER BY "createdAt" ASC
        `, [txID]);
        sameOC.rows.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.docNumber} | vendor="${r.vendorName}" | cubicacion=${r.cubicacionNo} | status=${r.status}`);
        });

        // Ver mismo OC + vendor (case insensitive)
        console.log(`\n=== Todos los BM con mismo OC + vendor (ILIKE) ===`);
        const sameOCV = await client.query(`
            SELECT id, "docNumber", "vendorName", "cubicacionNo", "status", "createdAt"
            FROM "PaymentRequest"
            WHERE "externalTxID" = $1
              AND LOWER("vendorName") = LOWER($2)
            ORDER BY "createdAt" ASC
        `, [txID, vendorRaw]);
        sameOCV.rows.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.docNumber} | vendor="${r.vendorName}" | cubicacion=${r.cubicacionNo} | status=${r.status}`);
        });

        // Cuántos boletines NO RECHAZADOS hay para este OC+vendor
        const count = await client.query(`
            SELECT COUNT(*) as total, MAX("cubicacionNo") as max_cubicacion
            FROM "PaymentRequest"
            WHERE "externalTxID" = $1
              AND LOWER("vendorName") = LOWER($2)
              AND "status" != 'RECHAZADO'
        `, [txID, vendorRaw]);
        console.log(`\n=== Stats (excluyendo RECHAZADOS) ===`);
        console.log(`Total: ${count.rows[0].total}, MAX cubicacionNo: ${count.rows[0].max_cubicacion}`);

        // Ver todos los BM ordenados por id para ver qué número debería tener
        console.log('\n=== TODOS los Payment Requests (para contexto) ===');
        const all = await client.query(`
            SELECT id, "docNumber", "externalTxID", "vendorName", "cubicacionNo", "status"
            FROM "PaymentRequest"
            ORDER BY id ASC
            LIMIT 20
        `);
        all.rows.forEach(r => {
            console.log(`  ID=${r.id} | ${r.docNumber} | txID=${r.externalTxID?.substring(0, 8)}... | vendor="${r.vendorName}" | cub=${r.cubicacionNo} | status=${r.status}`);
        });

    } catch (err) {
        console.error('ERROR:', err.message);
    } finally {
        await client.end();
    }
}

run();
