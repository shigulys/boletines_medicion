import { connectAdmCloud } from './server/admcloud_db';

async function testDepartmentFilter() {
    try {
        const pool = await connectAdmCloud();
        
        console.log('=== PROBANDO FILTRO DE DEPARTAMENTO ===\n');
        
        // 1. Ver todos los DepartmentID únicos
        console.log('1. DepartmentIDs únicos en la tabla de transacciones PO:');
        const departments = await pool.request().query(`
            SELECT DISTINCT 
                t.[DepartmentID],
                COUNT(*) as CantidadOrdenes
            FROM [dbo].[SA_Transactions] t
            WHERE t.[SubsidiaryID] = 'FBC6AADF-8B12-47F7-AA18-08DDDFE6F02E'
              AND t.[DocType] = 'PO'
            GROUP BY t.[DepartmentID]
            ORDER BY CantidadOrdenes DESC
        `);
        console.table(departments.recordset);
        
        // 2. Probar el filtro específico
        console.log('\n2. Probando filtro con DepartmentID específico:');
        const filtered = await pool.request().query(`
            SELECT 
                t.[ID],
                t.[DocID],
                t.[DepartmentID],
                t.[DocDate],
                r.[FullName] as VendorName,
                p.[Name] as ProjectName
            FROM [dbo].[SA_Transactions] t
            LEFT JOIN [dbo].[SA_Relationships] r ON t.[RelationshipID] = r.[ID]
            LEFT JOIN [dbo].[PA_Projects] p ON t.[ProjectID] = p.[ID]
            WHERE t.[SubsidiaryID] = 'FBC6AADF-8B12-47F7-AA18-08DDDFE6F02E'
              AND t.[DocType] = 'PO'
              AND t.[DepartmentID] = '134A52D2-1FF9-4BB1-564D-08DE34362E70'
        `);
        
        console.log(`Total de registros con ese DepartmentID: ${filtered.recordset.length}\n`);
        if (filtered.recordset.length > 0) {
            console.table(filtered.recordset);
        } else {
            console.log('❌ No se encontraron resultados con ese DepartmentID');
        }
        
        // 3. Buscar por coincidencia parcial
        console.log('\n3. Buscando DepartmentIDs que contengan "134A52D2":');
        const partial = await pool.request().query(`
            SELECT DISTINCT 
                t.[DepartmentID],
                COUNT(*) as Cantidad
            FROM [dbo].[SA_Transactions] t
            WHERE t.[SubsidiaryID] = 'FBC6AADF-8B12-47F7-AA18-08DDDFE6F02E'
              AND t.[DocType] = 'PO'
              AND t.[DepartmentID] LIKE '%134A52D2%'
            GROUP BY t.[DepartmentID]
        `);
        console.table(partial.recordset);
        
        await pool.close();
    } catch (error) {
        console.error('Error en el test:', error);
    }
}

testDepartmentFilter();
