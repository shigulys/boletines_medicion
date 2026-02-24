
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const allPRs = await prisma.paymentRequest.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            docNumber: true,
            cubicacionNo: true,
            externalTxID: true,
            vendorName: true,
            createdAt: true
        }
    });

    const missing = allPRs.filter(pr => pr.cubicacionNo === null || pr.cubicacionNo === 0);

    console.log(`Total Payment Requests: ${allPRs.length}`);
    console.log(`Payment Requests missing cubicacionNo: ${missing.length}`);

    if (missing.length > 0) {
        console.log('\nMissing records (first 10):');
        console.log(JSON.stringify(missing.slice(0, 10), null, 2));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
