require('dotenv').config();
const { Client } = require('pg');

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Conectado a la base de datos');

    console.log('🔄 Agregando columnas measurementStartDate y measurementEndDate...');
    
    await client.query(`
      ALTER TABLE "PaymentRequest" 
      ADD COLUMN IF NOT EXISTS "measurementStartDate" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "measurementEndDate" TIMESTAMP;
    `);

    console.log('✅ Columnas agregadas exitosamente');
    
    // Verificar las columnas
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'PaymentRequest' 
      AND column_name IN ('measurementStartDate', 'measurementEndDate');
    `);
    
    console.log('📋 Columnas en PaymentRequest:', result.rows);

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  } finally {
    await client.end();
    console.log('🔌 Conexión cerrada');
  }
}

migrate()
  .then(() => {
    console.log('✅ Migración completada');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Migración falló:', err);
    process.exit(1);
  });
