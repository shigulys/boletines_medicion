const { Client } = require('pg');
const DATABASE_URL = "postgresql://postgres.ugskhcjmiypwbzbmgajy:Proyecto2026!@aws-0-us-west-2.pooler.supabase.com:5432/postgres";
const client = new Client({ connectionString: DATABASE_URL });
client.connect()
    .then(() => client.query(`ALTER TABLE "SignatureConfig" ADD COLUMN IF NOT EXISTS alias TEXT`))
    .then(() => { console.log('OK: alias column added'); client.end(); })
    .catch(e => { console.error('ERR:', e.message); client.end(); });
