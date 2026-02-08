
import fetch from 'node-fetch';

async function testFetch() {
    try {
        const response = await fetch('http://localhost:5000/api/users', {
            headers: {
                'Authorization': 'Bearer ' + process.argv[2] // Pass a token as arg
            }
        });
        const data = await response.json();
        console.log('API RESPONSE:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('FETCH ERROR:', e);
    }
}

testFetch();
