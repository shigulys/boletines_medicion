import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Conectado a la base de datos');

    const sql = `
      ALTER TABLE "PaymentRequestLine" 
      ADD COLUMN IF NOT EXISTS "itbisRetentionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
    `;

    await client.query(sql);
    console.log('✓ Columna itbisRetentionPercent agregada exitosamente');
  } catch (error) {
    console.error('Error al ejecutar migración:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('Conexión cerrada');
  }
}

runMigration();
