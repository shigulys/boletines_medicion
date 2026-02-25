const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
    try {
        const email = 'cmperezb@gmail.com';

        // Listar TODOS los usuarios primero
        console.log('=== TODOS LOS USUARIOS EN BD ===');
        const allUsers = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isApproved: true,
                accessIngenieria: true,
                accessSubcontratos: true,
                accessContabilidad: true,
                createdAt: true,
            },
            orderBy: { id: 'asc' }
        });

        for (const u of allUsers) {
            console.log(`\nID: ${u.id} | ${u.email}`);
            console.log(`  Nombre: ${u.name}`);
            console.log(`  Rol: ${u.role}`);
            console.log(`  Aprobado: ${u.isApproved}`);
            console.log(`  Ing: ${u.accessIngenieria} | Sub: ${u.accessSubcontratos} | Cont: ${u.accessContabilidad}`);
            console.log(`  Creado: ${u.createdAt}`);
        }

        console.log('\n================================');

        // Buscar usuario específico
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            console.log(`\n❌ Usuario "${email}" NO EXISTE en la base de datos.`);
            console.log('   Debe registrarse primero usando el formulario de registro.');
        } else {
            console.log(`\n✅ Usuario encontrado: ${email}`);
            console.log(`   isApproved: ${user.isApproved}`);
            if (!user.isApproved) {
                console.log('   ⚠️  El problema: isApproved = false. El usuario no puede iniciar sesión.');
            }
        }

    } catch (error) {
        console.error('ERROR:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUser();
