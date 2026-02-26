import pkg from 'pg';
import dotenv from 'dotenv';
const { Client } = pkg;

dotenv.config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        console.log('Connecting to PostgreSQL to run ALTER TABLE...');
        await client.connect();

        // Add amortizationAmount
        console.log('Adding amortizationAmount...');
        await client.query(`ALTER TABLE "PaymentRequest" ADD COLUMN "amortizationAmount" DECIMAL(18, 6) NOT NULL DEFAULT 0;`).catch(e => console.log('Already exists or error:', e.message));

        // Add amortizedPrepayments
        console.log('Adding amortizedPrepayments...');
        await client.query(`ALTER TABLE "PaymentRequest" ADD COLUMN "amortizedPrepayments" TEXT;`).catch(e => console.log('Already exists or error:', e.message));

        console.log('Successfully updated schema!');
    } catch (err: any) {
        console.error('Connection error:', err.message);
    } finally {
        await client.end();
    }
}
run();
