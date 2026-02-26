
import http from 'http';
import fs from 'fs';

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/admcloud/prepayments/8C3EC053-B1E9-4230-6415-08DE0A5CAD93/1F8A45C8-F8CA-49B8-8C51-08DE1111A415',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        fs.writeFileSync('tmp/api_response.json', JSON.stringify({ status: res.statusCode, body: JSON.parse(data) }, null, 2));
        console.log('Response saved to tmp/api_response.json');
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
