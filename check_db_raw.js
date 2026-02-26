
const { Client } = require('pg');

async function check() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/boletines_db"
    });
    try {
        await client.connect();
        console.log('--- USERS ---');
        const resUsers = await client.query('SELECT name, email, position FROM "User"');
        console.table(resUsers.rows);

        console.log('\n--- SIGNATURE CONFIG ---');
        const resSigs = await client.query('SELECT name, alias, role FROM "SignatureConfig" ORDER BY "sortOrder" ASC');
        console.table(resSigs.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
check();
