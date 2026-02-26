const { Client } = require('pg');

async function main() {
    const client = new Client({
        connectionString: "postgresql://postgres:postgres@localhost:5432/boletines_db"
    });

    try {
        await client.connect();
        const res = await client.query('SELECT * FROM "SignatureConfig" ORDER BY "sortOrder" ASC');
        console.log('--- Signature Config (Direct SQL) ---');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

main();
