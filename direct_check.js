
const { Client } = require('pg');

async function main() {
    const client = new Client({
        connectionString: "postgresql://postgres.ugskhcjmiypwbzbmgajy:Proyecto2026!@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
    });

    try {
        await client.connect();
        const res = await client.query("SELECT id, \"docNumber\", \"cubicacionNo\", \"vendorName\", status FROM \"PaymentRequest\" WHERE \"docNumber\" = 'BM-000005'");
        console.log('Result for BM-000005:');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error('Error executing query', err.stack);
    } finally {
        await client.end();
    }
}

main();
