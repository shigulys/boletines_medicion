const { Client } = require('pg');
const DATABASE_URL = "postgresql://postgres.ugskhcjmiypwbzbmgajy:Proyecto2026!@aws-0-us-west-2.pooler.supabase.com:5432/postgres";
const client = new Client({ connectionString: DATABASE_URL });
client.connect()
    .then(() => client.query(`
    CREATE TABLE IF NOT EXISTS "SignatureConfig" (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      "sortOrder" INTEGER DEFAULT 0
    )
  `))
    .then(() => { console.log('OK: SignatureConfig table created'); client.end(); })
    .catch(e => { console.error('ERR:', e.message); client.end(); });
