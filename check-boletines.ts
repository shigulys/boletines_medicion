// Script para verificar boletines en la base de datos
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkBoletines() {
  try {
    console.log('🔍 Verificando boletines en la base de datos...\n');
    
    const boletines = await prisma.paymentRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: { lines: true }
    });

    console.log(`📊 Total de boletines encontrados: ${boletines.length}\n`);

    if (boletines.length === 0) {
      console.log('⚠️ No hay boletines en la base de datos');
    } else {
      boletines.forEach((b, idx) => {
        console.log(`${idx + 1}. ${b.docNumber} - ${b.status}`);
        console.log(`   Proyecto: ${b.projectName || 'N/A'}`);
        console.log(`   Proveedor: ${b.vendorName}`);
        console.log(`   Monto: $${b.netTotal.toFixed(2)}`);
        console.log(`   Fecha: ${b.date.toISOString().split('T')[0]}`);
        console.log(`   Líneas: ${b.lines.length}`);
        if (b.status === 'RECHAZADO' && b.rejectionReason) {
          console.log(`   ❌ Motivo rechazo: ${b.rejectionReason}`);
        }
        console.log('');
      });

      // Contar por estado
      const pendientes = boletines.filter(b => b.status === 'PENDIENTE').length;
      const aprobados = boletines.filter(b => b.status === 'APROBADO').length;
      const rechazados = boletines.filter(b => b.status === 'RECHAZADO').length;

      console.log('📈 Resumen por estado:');
      console.log(`   ⏳ Pendientes: ${pendientes}`);
      console.log(`   ✅ Aprobados: ${aprobados}`);
      console.log(`   ❌ Rechazados: ${rechazados}`);
    }
  } catch (error: any) {
    console.error('❌ Error al consultar la base de datos:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkBoletines();
