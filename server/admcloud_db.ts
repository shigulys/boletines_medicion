import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config: sql.config = {
    user: 'appss@fortechadm2',
    password: 'Soplando2026@',
    server: 'database.admcloud.net',
    database: '8daacb23-1cb9-49e4-9d27-ea1c23d72e23',
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

export const connectAdmCloud = async () => {
    try {
        const pool = await sql.connect(config);
        console.log('--- CONECTADO EXITOSAMENTE A ADMCLOUD (SQL SERVER) ---');
        return pool;
    } catch (error) {
        console.error('Error connecting to AdmCloud DB:', error);
        throw error;
    }
};

export default sql;
