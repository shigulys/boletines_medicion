
async function test() {
    try {
        console.log("--- STARTING PUT TEST ---");
        const BASE_URL = 'http://localhost:5000/api';

        // 1. Login
        console.log("Logging in...");
        const loginRes = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'cmperezb@gmail.com',
                password: 'admin123'
            })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;

        // 2. PUT Update (Simulate saving BM-000005)
        console.log("Updating bulletin ID 5 (BM-000005)...");
        const putRes = await fetch(`${BASE_URL}/payment-requests/5`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                vendorName: 'SERVICIOS JOHAN MANUEL SRL',
                lines: [], // Empty for test if not validated strictly
                retentionPercent: 0,
                advancePercent: 0,
                isrPercent: 0
            })
        });

        if (!putRes.ok) {
            const errBody = await putRes.json();
            throw new Error(`PUT failed: ${JSON.stringify(errBody)}`);
        }

        const updated = await putRes.json();
        console.log("Update successful. Returned object:", {
            id: updated.id,
            docNumber: updated.docNumber,
            cubicacionNo: updated.cubicacionNo
        });

        if (updated.cubicacionNo === 1) {
            console.log("✅ SUCCESS: cubicacionNo is 1");
        } else {
            console.log("❌ FAILURE: cubicacionNo is unexpected:", updated.cubicacionNo);
        }

        console.log("--- PUT TEST COMPLETED ---");
    } catch (err: any) {
        console.error("PUT TEST FAILED:", err.message);
    }
}

test();
