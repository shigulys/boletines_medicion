import { connectAdmCloud } from './server/admcloud_db';

async function testConnection() {
    try {
        const pool = await connectAdmCloud();
        
        console.log('Document Types en esta subsidiaria:');
        const types = await pool.request().query("SELECT DISTINCT DocType FROM [dbo].[SA_Transactions] WHERE [SubsidiaryID] = 'FBC6AADF-8B12-47F7-AA18-08DDDFE6F02E'");
        console.table(types.recordset);

        console.log('\nContando total de órdenes de compra (PO):');
        const countResult = await pool.request().query("SELECT COUNT(*) as Total FROM [dbo].[SA_Transactions] WHERE [SubsidiaryID] = 'FBC6AADF-8B12-47F7-AA18-08DDDFE6F02E' AND [DocType] = 'PO'");
        console.log(`Total de registros PO: ${countResult.recordset[0].Total}`);
        
        await pool.close();
    } catch (error) {
        console.error('Error en el test:', error);
    }
}

testConnection();
