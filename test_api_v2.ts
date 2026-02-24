
async function test() {
    try {
        console.log("--- STARTING FULL API DUMP ---");
        const BASE_URL = 'http://localhost:5000/api';

        // Login
        const loginRes = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'cmperezb@gmail.com', password: 'admin123' })
        });
        const { token } = await loginRes.json();

        // Fetch
        const prRes = await fetch(`${BASE_URL}/payment-requests`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const prs = await prRes.json();

        console.log("API_RESPONSE_DATA:");
        prs.forEach(p => {
            console.log(`ID: ${p.id}, Doc: ${p.docNumber}, Cub: ${p.cubicacionNo}, Vendor: ${p.vendorName}`);
        });

        console.log("--- DUMP COMPLETED ---");
    } catch (err: any) {
        console.error("DUMP FAILED:", err.message);
    }
}

test();
