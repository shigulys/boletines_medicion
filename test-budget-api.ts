import axios from 'axios';

async function testApi() {
    try {
        // Obtenemos los budgets
        const budgetsRes = await axios.get('http://localhost:5000/api/budgets');
        const budgets = budgetsRes.data;
        console.log('Presupuestos encontrados:', budgets.length);
        
        if (budgets.length > 0) {
            const firstBudget = budgets[0];
            console.log(`Consultando detalle para presupuesto: ${firstBudget.projectName} (ID: ${firstBudget.id})`);
            
            const detailRes = await axios.get(`http://localhost:5000/api/budgets/${firstBudget.id}`);
            const items = detailRes.data.items;
            console.log('Total de items en detalle:', items?.length);
            
            const filtered = items?.filter((i: any) => !i.isChapter);
            console.log('Total de partidas (no capítulos):', filtered?.length);
        }
    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

testApi();
