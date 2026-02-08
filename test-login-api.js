
import fetch from 'node-fetch';

async function testLogin() {
    console.log('--- TEST DE LOGIN API ---');
    try {
        const response = await fetch('http://localhost:5000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'cmperezb@gmail.com',
                password: 'admin' // Probando con 'admin' o la clave que tengas
            })
        });
        
        const status = response.status;
        const data = await response.json();
        
        console.log('Status:', status);
        console.log('Response Data:', JSON.stringify(data, null, 2));
        
        if (data.user) {
            console.log('VALOR DE isApproved RECIBIDO:', data.user.isApproved);
            console.log('VALOR DE role RECIBIDO:', data.user.role);
        }
    } catch (e) {
        console.error('Error conectando al servidor:', e.message);
    }
}

testLogin();
