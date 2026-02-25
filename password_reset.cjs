
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = "postgresql://postgres.ugskhcjmiypwbzbmgajy:Proyecto2026!@aws-0-us-west-2.pooler.supabase.com:5432/postgres";

async function run() {
    const client = new Client({ connectionString: DATABASE_URL });
    try {
        await client.connect();
        const hashedPassword = await bcrypt.hash('123456', 10);
        await client.query('UPDATE "User" SET password = $1 WHERE email = $2', [hashedPassword, 'cmperezb@gmail.com']);
        console.log("Password reset successfully for cmperezb@gmail.com");
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
