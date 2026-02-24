
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Starting Cubicación N° repair script...');

    // Get all unique (externalTxID, vendorName) pairs that have at least one NULL cubicacionNo
    const ocsWithMissing = await prisma.paymentRequest.findMany({
        where: {
            OR: [
                { cubicacionNo: null },
                { cubicacionNo: 0 }
            ]
        },
        select: {
            externalTxID: true,
            vendorName: true
        },
        distinct: ['externalTxID', 'vendorName']
    });

    console.log(`Found ${ocsWithMissing.length} groups (OC/Vendor) with missing numbers.`);

    for (const group of ocsWithMissing) {
        const { externalTxID, vendorName } = group;

        // Get all bulletins for this group, ordered by date
        const bulletins = await prisma.paymentRequest.findMany({
            where: {
                externalTxID,
                vendorName
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        console.log(`Processing group: OC ${externalTxID} | Vendor ${vendorName} (${bulletins.length} bulletins)`);

        for (let i = 0; i < bulletins.length; i++) {
            const b = bulletins[i];
            const targetNo = i + 1;

            if (b.cubicacionNo !== targetNo) {
                console.log(`  - Updating ${b.docNumber}: ${b.cubicacionNo} -> ${targetNo}`);
                await prisma.paymentRequest.update({
                    where: { id: b.id },
                    data: { cubicacionNo: targetNo }
                });
            }
        }
    }

    console.log('✅ Repair completed successfully.');
}

main()
    .catch(e => {
        console.error('❌ Error during repair:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
