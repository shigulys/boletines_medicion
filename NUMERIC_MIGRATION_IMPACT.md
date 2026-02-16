# Migración de FLOAT8 a NUMERIC(18,6)

## ¿Es correcta la consideración?
Sí. Para este proyecto (presupuestos, boletines, impuestos, retenciones, netos y totales), `NUMERIC` es más apropiado que `FLOAT8` porque evita errores de redondeo binario.

## Impacto esperado

### 1) Precisión y consistencia
- Se elimina el error acumulado típico de `FLOAT8` en sumatorias y operaciones financieras.
- Mejora conciliación de reportes y auditoría.

### 2) Rendimiento y almacenamiento
- `NUMERIC` consume más CPU y espacio que `FLOAT8`.
- Para un sistema transaccional como este, el costo suele ser aceptable frente al beneficio de precisión.

### 3) Backend/Prisma (muy importante)
- Si en `schema.prisma` se cambia `Float` por `Decimal`, Prisma devuelve `Decimal` (no `number`), lo que puede requerir ajustes de tipado y serialización.
- Recomendación: migrar en **dos fases**.

## Estrategia recomendada (2 fases)

### Fase 1 (segura, ya incluida en este repo)
- Cambiar tipos en PostgreSQL a `NUMERIC(18,6)` con SQL (sin tocar aún `schema.prisma`).
- Validar que operaciones y reportes no cambian resultados de negocio.

### Fase 2 (controlada)
- Actualizar `schema.prisma` de `Float` a `Decimal @db.Decimal(18,6)`.
- Ajustar backend para tratar `Decimal` de Prisma (parseo/casting para API y cálculos).
- Regenerar cliente Prisma y validar endpoints.

## Columnas incluidas en la migración SQL propuesta
- `Budget.totalAmount`
- `Retention.percentage`
- `BudgetItem.quantity`, `BudgetItem.unitPrice`, `BudgetItem.total`
- `Measurement.quantity`, `Measurement.price`
- `PaymentRequest.subTotal`, `PaymentRequest.taxAmount`, `PaymentRequest.retentionPercent`, `PaymentRequest.retentionAmount`, `PaymentRequest.advancePercent`, `PaymentRequest.advanceAmount`, `PaymentRequest.isrPercent`, `PaymentRequest.isrAmount`, `PaymentRequest.netTotal`
- `PaymentRequestLine.quantity`, `PaymentRequestLine.unitPrice`, `PaymentRequestLine.taxPercent`, `PaymentRequestLine.taxAmount`, `PaymentRequestLine.retentionPercent`, `PaymentRequestLine.retentionAmount`, `PaymentRequestLine.itbisRetentionPercent`, `PaymentRequestLine.totalLine`

## Ejecución recomendada
1. Respaldar DB.
2. Ejecutar `float8_to_numeric6_migration.sql` en ventana de mantenimiento.
3. Ejecutar pruebas funcionales (boletines, programación pagos, reportes).
4. Si algo falla, aplicar `float8_to_numeric6_rollback.sql`.

## Nota práctica
Aunque se use escala 6 internamente, en UI/reportes financieros finales conviene seguir mostrando a 2 decimales.
