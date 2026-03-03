import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
dotenv.config();

const { Client } = pg;
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

const client = new Client({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function resetPassword() {
    try {
        await client.connect();
        console.log('Connected to database.');

        const hashedPassword = await bcrypt.hash('testtest', 10);
        const res = await client.query(`
      UPDATE "User" 
      SET "password" = $1
      WHERE "email" = 'test@test.com'
    `, [hashedPassword]);

        if (res.rowCount > 0) {
            console.log('Password for test@test.com reset to "testtest".');
        } else {
            console.log('User test@test.com not found.');
        }

    } catch (err) {
        console.error('Reset failed:', err);
    } finally {
        await client.end();
    }
}

resetPassword();
