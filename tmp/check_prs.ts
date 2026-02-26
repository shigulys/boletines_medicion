import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
    const count = await prisma.paymentRequest.count();
    console.log('PaymentRequests in DB:', count);
    if (count > 0) {
        const latest = await prisma.paymentRequest.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true, docNumber: true } });
        console.log('Latest:', latest);
    }
}
run().finally(() => prisma.$disconnect());
