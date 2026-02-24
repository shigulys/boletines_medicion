
const { Client } = require('pg');

async function checkPort(port) {
    const url = `postgresql://postgres.ugskhcjmiypwbzbmgajy:Proyecto2026!@aws-0-us-west-2.pooler.supabase.com:${port}/postgres`;
    const client = new Client({ connectionString: url });
    try {
        await client.connect();
        const res = await client.query('SELECT id, "docNumber", "cubicacionNo" FROM "PaymentRequest" WHERE id = 5');
        console.log(`Port ${port}:`, res.rows[0]);
    } catch (err) {
        console.error(`Port ${port} Error:`, err.message);
    } finally {
        await client.end();
    }
}

async function run() {
    await checkPort(5432);
    await checkPort(6543);
}

run();
