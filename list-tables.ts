import { connectAdmCloud } from './server/admcloud_db';

async function listTables() {
    try {
        const pool = await connectAdmCloud();
        const items = await pool.request().query(`
            SELECT t.DocID, i.ItemID, i.Name, i.Quantity, i.SourceTransactionID, i.SourceRowID
            FROM SA_Trans_Items i
            JOIN SA_Transactions t ON i.TransID = t.ID
            WHERE t.DocID IN ('ICI-RIN00000018', 'ICI-ORC00000036')
        `);
        console.log('Ítems de los documentos:');
        console.table(items.recordset);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

listTables();
