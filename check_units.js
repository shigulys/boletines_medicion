
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function checkUnits() {
  try {
    const units = await pool.query('SELECT * FROM "UnitOfMeasure"');
    console.log("--- Catálogo de Unidades (UnitOfMeasure) ---");
    units.rows.forEach(u => console.log(`ID: ${u.id}, Code: "${u.code}", Name: ${u.description}`));
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkUnits();
