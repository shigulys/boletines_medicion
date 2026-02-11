const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const client = new Client(connectionString);

async function migrate() {
  try {
    await client.connect();
    console.log('📡 Conectado a la base de datos...');
    
    const result = await client.query(`
      ALTER TABLE "PaymentRequest" 
      ADD COLUMN IF NOT EXISTS "vendorFiscalID" TEXT;
    `);
    
    console.log('✅ Columna vendorFiscalID agregada exitosamente');
    
    // Verificar
    const check = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'PaymentRequest' 
      AND column_name = 'vendorFiscalID';
    `);
    
    if (check.rows.length > 0) {
      console.log('✓ Columna vendorFiscalID confirmada en la tabla');
    } else {
      console.log('⚠ No se pudo confirmar la columna');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
    console.log('🔌 Desconectado de la base de datos');
  }
}

migrate();
