const { Client } = require('pg');
const DATABASE_URL = "postgresql://postgres.ugskhcjmiypwbzbmgajy:Proyecto2026!@aws-0-us-west-2.pooler.supabase.com:5432/postgres";

async function run() {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    console.log('Conectado. Reparando cubicacionNo (agrupado por OC solamente)...\n');

    try {
        // 1. Todos los boletines en orden de creación
        const all = await client.query(`
            SELECT id, "docNumber", "externalTxID", "vendorName", "cubicacionNo", "status", "createdAt"
            FROM "PaymentRequest"
            ORDER BY "externalTxID", "createdAt" ASC
        `);

        // 2. Agrupar SOLO por OC (externalTxID)
        // Una OC = un solo contratista (aunque el nombre aparezca con ligeras variaciones)
        const groups = {};
        for (const row of all.rows) {
            const key = row.externalTxID;
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        }

        let fixedCount = 0;

        // 3. Asignar 1, 2, 3... en orden cronológico (incluyendo RECHAZADOS)
        for (const [txID, records] of Object.entries(groups)) {
            records.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            console.log(`\nOC: ${txID.substring(0, 8)}... (${records.length} boletines)`);
            for (let i = 0; i < records.length; i++) {
                const expectedCub = i + 1;
                const rec = records[i];

                if (rec.cubicacionNo !== expectedCub) {
                    console.log(`  CORRIGIENDO: ${rec.docNumber} | "${rec.vendorName.substring(0, 30)}" | cub=${rec.cubicacionNo} -> ${expectedCub} | ${rec.status}`);
                    await client.query(
                        `UPDATE "PaymentRequest" SET "cubicacionNo" = $1 WHERE id = $2`,
                        [expectedCub, rec.id]
                    );
                    fixedCount++;
                } else {
                    console.log(`  OK: ${rec.docNumber} | cub=${rec.cubicacionNo} | ${rec.status}`);
                }
            }
        }

        console.log(`\n=== COMPLETADO: ${fixedCount} registros corregidos ===`);

        // 4. Verificar resultado final
        console.log('\nEstado final:');
        const verify = await client.query(`
            SELECT id, "docNumber", "cubicacionNo", "status"
            FROM "PaymentRequest"
            ORDER BY id ASC
        `);
        for (const r of verify.rows) {
            console.log(`  ID=${r.id} | ${r.docNumber} | cubicacion=${r.cubicacionNo} | ${r.status}`);
        }

    } finally {
        await client.end();
    }
}

run().catch(e => console.error('ERROR:', e.message));
