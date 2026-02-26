const { Client } = require('pg');

async function main() {
    const client = new Client({
        connectionString: "postgresql://postgres:postgres@localhost:5432/boletines_db"
    });

    try {
        await client.connect();

        console.log('--- User Position Check ---');
        const users = await client.query('SELECT email, name, position FROM "User"');
        console.log(JSON.stringify(users.rows, null, 2));

        console.log('\n--- Signature Config Check ---');
        const config = await client.query('SELECT * FROM "SignatureConfig" ORDER BY "sortOrder" ASC');
        console.log(JSON.stringify(config.rows, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

main();
