import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

console.log('Connecting to:', connectionString ? connectionString.split('@')[1] : 'undefined');

const client = new Client({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function migrate() {
    try {
        await client.connect();
        console.log('Connected to database.');

        // Check if column exists
        const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'PaymentRequest' AND column_name = 'priority'
    `);

        if (checkRes.rowCount === 0) {
            console.log('Adding priority column to PaymentRequest...');
            await client.query(`ALTER TABLE "PaymentRequest" ADD COLUMN "priority" TEXT DEFAULT 'Normal' NOT NULL`);
            console.log('Column added successfully.');
        } else {
            console.log('Column "priority" already exists.');
        }

        // Check if SignatureConfig alias exists
        const checkAlias = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'SignatureConfig' AND column_name = 'alias'
    `);

        if (checkAlias.rowCount === 0) {
            console.log('Adding alias column to SignatureConfig...');
            await client.query(`ALTER TABLE "SignatureConfig" ADD COLUMN "alias" TEXT`);
            console.log('Column alias added successfully.');
        } else {
            console.log('Column "alias" already exists.');
        }

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

migrate();
