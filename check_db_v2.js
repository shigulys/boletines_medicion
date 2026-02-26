const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const config = await prisma.signatureConfig.findMany({
            orderBy: { sortOrder: 'asc' }
        });
        console.log('--- Signature Config ---');
        console.log(JSON.stringify(config, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
