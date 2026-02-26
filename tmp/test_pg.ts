import pkg from 'pg';
import dotenv from 'dotenv';
const { Client } = pkg;

dotenv.config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function test() {
    try {
        console.log('Connecting to', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'));
        await client.connect();
        console.log('Connected successfully!');
        const res = await client.query('SELECT NOW()');
        console.log('Time in DB:', res.rows[0]);
    } catch (err: any) {
        console.error('Connection error:', err.message);
    } finally {
        await client.end();
    }
}
test();
