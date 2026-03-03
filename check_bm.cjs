
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const pr = await prisma.paymentRequest.findUnique({
        where: { docNumber: 'BM-000005' },
        select: {
            id: true,
            docNumber: true,
            cubicacionNo: true,
            externalTxID: true,
            vendorName: true
        }
    });

    console.log('Payment Request BM-000005 details:');
    console.log(JSON.stringify(pr, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
