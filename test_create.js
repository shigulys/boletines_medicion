import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
    try {
        console.log('Attempting to create a PaymentRequest with priority...');
        // We use 'as any' if the types aren't updated yet, but let's see what happens
        const res = await (prisma.paymentRequest as any).create({
            data: {
                docNumber: 'TEST-' + Date.now(),
                externalTxID: 'TEST',
                docID: 'TEST',
                vendorName: 'TEST VENDOR',
                subTotal: 100,
                taxAmount: 18,
                netTotal: 118,
                status: 'PENDIENTE',
                priority: 'Urgente'
            }
        });
        console.log('Success! Created with ID:', res.id);
    } catch (err) {
        console.error('Error during create:', err);
    } finally {
        await prisma.$disconnect();
    }
}

test();
