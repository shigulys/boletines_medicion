import http from 'http';
import fs from 'fs';

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/payment-requests',
    method: 'GET',
    headers: {
        // We can't easily guess a valid JWT token. Wait, does it require auth? 
        // Yes, 'authenticateToken' is on the route.
        // Let me bypass auth just to test if we get a 200 or 401 instead of a silent hang/crash.
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', data.substring(0, 200)));
});
req.on('error', (e) => console.error(e));
req.end();
