import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

const client = new Client({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function approve() {
    try {
        await client.connect();
        console.log('Connected to database.');

        const res = await client.query(`
      UPDATE "User" 
      SET "isApproved" = true, "role" = 'admin', "accessIngenieria" = true, "accessSubcontratos" = true, "accessContabilidad" = true 
      WHERE "email" = 'test@test.com'
    `);

        if (res.rowCount > 0) {
            console.log('User test@test.com approved as admin.');
        } else {
            console.log('User test@test.com not found.');
        }

    } catch (err) {
        console.error('Approval failed:', err);
    } finally {
        await client.end();
    }
}

approve();
