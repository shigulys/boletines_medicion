
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const prs = await prisma.paymentRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
            id: true,
            docNumber: true,
            cubicacionNo: true,
            externalTxID: true,
            vendorName: true
        }
    });

    console.log('Last 5 Payment Requests:');
    console.log(JSON.stringify(prs, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
