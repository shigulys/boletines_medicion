const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        console.log('--- Checking SignatureConfig Table ---');
        const configs = await prisma.signatureConfig.findMany();
        console.log('Found configs:', configs);

        // Try to check table info via raw query
        const columns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'SignatureConfig'
    `;
        console.log('Columns in SignatureConfig:', columns);

    } catch (error) {
        console.error('ERROR during check:', error);
    } finally {
        await prisma.$disconnect();
    }
}

check();
