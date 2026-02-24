
import prisma from "./server/db";

async function main() {
    console.log('🚀 Iniciando reparación manual de números de cubicación...');
    try {
        const missingPRs = await prisma.paymentRequest.findMany({
            where: {
                OR: [
                    { cubicacionNo: null },
                    { cubicacionNo: 0 }
                ]
            },
            orderBy: { createdAt: 'asc' }
        });

        console.log(`🔍 Se encontraron ${missingPRs.length} boletines por reparar.`);

        for (const pr of missingPRs) {
            const aggregate = await prisma.paymentRequest.aggregate({
                _max: { cubicacionNo: true },
                where: {
                    externalTxID: pr.externalTxID,
                    vendorName: {
                        equals: pr.vendorName,
                        mode: 'insensitive'
                    },
                    id: { lt: pr.id }
                }
            });

            const nextNo = (aggregate._max.cubicacionNo || 0) + 1;
            console.log(`  - Boletín ${pr.docNumber}: Asignando #${nextNo}`);
            await prisma.paymentRequest.update({
                where: { id: pr.id },
                data: { cubicacionNo: nextNo }
            });
        }
        console.log('✅ Reparación completada satisfactoriamente.');
    } catch (error) {
        console.error('❌ Error durante la reparación:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
