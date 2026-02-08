
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
  try {
    const email = 'c.perezb@yahoo.com';
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user) {
      console.log(`Usuario ${email} NO encontrado.`);
      return;
    }

    console.log('--- DATOS DEL USUARIO ---');
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Nombre: ${user.name}`);
    console.log(`Rol: ${user.role}`);
    console.log(`Aprobado: ${user.isApproved} (Tipo: ${typeof user.isApproved})`);
    console.log(`Acceso Ing: ${user.accessIngenieria}`);
    console.log('-------------------------');

    if (user.isApproved) {
        console.log('RESETEANDO ESTADO A PENDIENTE...');
        await prisma.user.update({
            where: { id: user.id },
            data: { isApproved: false }
        });
        console.log('Usuario reseteado con ÉXITO.');
    } else {
        console.log('El usuario YA estaba pendiente.');
    }

  } catch (error) {
    console.error('ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUser();
