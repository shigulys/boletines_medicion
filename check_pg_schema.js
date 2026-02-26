import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

async function check() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += msg + '\n';
    };

    try {
        await client.connect();
        log('Connected to DB');

        const tables = ['User', 'SignatureConfig', 'PaymentRequest', 'PaymentRequestLine', 'Retention', 'UnitOfMeasure'];

        for (const table of tables) {
            log(`\n--- TABLE: ${table} ---`);
            const res = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = '${table}';
      `);

            if (res.rows.length === 0) {
                log(`Table ${table} NOT FOUND!`);
            } else {
                res.rows.forEach(row => {
                    log(`${row.column_name}: ${row.data_type}`);
                });
            }
        }

    } catch (err) {
        log('Error connecting or querying: ' + err.message);
    } finally {
        await client.end();
        fs.writeFileSync('db_full_schema_check.txt', output);
    }
}

check();
