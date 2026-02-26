
import http from 'http';

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/admcloud/prepayments/8C3EC053-B1E9-4230-6415-08DE0A5CAD93/1F8A45C8-F8CA-49B8-8C51-08DE1111A415',
    method: 'GET',
    headers: {
        // We don't have a real token here, but the endpoint currently requires it.
        // Let's see if it rejects us or if we can bypass it for local testing.
        // If it requires auth, we'll need to generate a token or remove the middleware temporarily.
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('RESPONSE:', data);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
