
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    try {
        console.log('--- USERS ---');
        const users = await prisma.user.findMany({
            select: { email: true, name: true, position: true }
        });
        console.table(users);

        console.log('\n--- SIGNATURE CONFIG ---');
        const configs = await prisma.signatureConfig.findMany({
            orderBy: { sortOrder: 'asc' }
        });
        console.table(configs);

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

check();
