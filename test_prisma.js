import prisma from './server/db.js';

async function test() {
    try {
        console.log('Testing Prisma connection...');
        const users = await prisma.user.count();
        console.log('Connection successful! User count:', users);
        process.exit(0);
    } catch (err) {
        console.error('Prisma connection failed:', err);
        process.exit(1);
    }
}

test();
