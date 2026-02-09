import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

async function testConnection() {
  console.log("Probando conexión con POOLING...");
  console.log("URL:", process.env.DATABASE_URL?.replace(/:[^:]*@/, ':****@'));
  
  const pool = new pg.Pool({ 
    connectionString: process.env.DATABASE_URL 
  });

  try {
    const result = await pool.query('SELECT version()');
    console.log('✅ Conexión exitosa!');
    console.log('Versión PostgreSQL:', result.rows[0].version);
  } catch (error: any) {
    console.log('❌ Error de conexión:', error.message);
  } finally {
    await pool.end();
  }
}

testConnection();
