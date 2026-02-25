const { Client } = require('pg');
const DATABASE_URL = "postgresql://postgres.ugskhcjmiypwbzbmgajy:Proyecto2026!@aws-0-us-west-2.pooler.supabase.com:5432/postgres";
const client = new Client({ connectionString: DATABASE_URL });
client.connect()
    .then(() => client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS position TEXT`))
    .then(() => { console.log('OK: position column added to User'); client.end(); })
    .catch(e => { console.error('ERR:', e.message); client.end(); });
