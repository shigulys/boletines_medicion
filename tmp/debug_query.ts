
import { connectAdmCloud } from '../server/admcloud_db';
import * as fs from 'fs';

async function debug() {
    try {
        const pool = await connectAdmCloud();

        // Search for the prepayment
        const resultSLA = await pool.request()
            .input('docId', 'ICI-SLA-00000129')
            .query('SELECT DocID, DocType, RelationshipID, LocationID, TotalAmount, AppliedPayments FROM SA_Transactions WHERE DocID = @docId');

        // Search for the OC
        const resultOC = await pool.request()
            .input('docId', 'ICI-ORC00000036')
            .query('SELECT ID, DocID, RelationshipID, LocationID FROM SA_Transactions WHERE DocID = @docId');

        const output = {
            prepayment: resultSLA.recordset,
            oc: resultOC.recordset
        };

        fs.writeFileSync('tmp/debug_results.json', JSON.stringify(output, null, 2));
        console.log('Results written to tmp/debug_results.json');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

debug();
