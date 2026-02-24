import mssql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config = {
    user: process.env.ADM_DB_USER,
    password: process.env.ADM_DB_PASSWORD,
    server: process.env.ADM_DB_SERVER,
    database: process.env.ADM_DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
};

async function investigate() {
    try {
        console.log('Connecting to MSSQL...');
        const pool = await mssql.connect(config);
        console.log('Connected to:', process.env.ADM_DB_SERVER);

        const docId = 'ICI-ORC00000036';
        const txResult = await pool.request()
            .input('docId', docId)
            .query("SELECT ID, DocID FROM SA_Transactions WHERE DocID = @docId");

        if (txResult.recordset.length > 0) {
            const transId = txResult.recordset[0].ID;
            console.log(`Found TxID: ${transId} for DocID: ${txResult.recordset[0].DocID}`);

            const itemsResult = await pool.request()
                .input('transId', transId)
                .query("SELECT Name, Quantity, Price, TotalSalesAmount, RowOrder FROM SA_Trans_Items WHERE TransID = @transId ORDER BY RowOrder");

            console.log('--- ITEMS ---');
            itemsResult.recordset.forEach((item, idx) => {
                console.log(`[${idx}] ${item.Name} | Qty: ${item.Quantity} | Price: ${item.Price} | Total: ${item.TotalSalesAmount}`);
            });
            console.log('--- END ITEMS ---');
        } else {
            console.log('Transaction ICI-ORC00000036 not found');
        }
        await pool.close();
    } catch (err) {
        console.log('ERROR:', err);
    }
}
investigate();
