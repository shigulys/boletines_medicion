import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import * as XLSX from "xlsx";
import prisma from "./db";
import { connectAdmCloud } from "./admcloud_db";
import { sendApprovalEmail, sendNewRequestEmailToAdmin } from "./mail";

dotenv.config();

const app = express();
const PORT = 5000;
const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

const upload = multer({ storage: multer.memoryStorage() });

console.log("-----------------------------------------");
console.log("INICIANDO SERVIDOR SISTEMA DE OBRA v1.5");
console.log("-----------------------------------------");

app.use(cors());
app.use(express.json());

// Auth Middleware
const authenticateToken = (req: any, res: any, next: () => void) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, JWT_SECRET, async (err: any, decoded: any) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    
    // Verificar si el usuario aún existe y está aprobado
    try {
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) return res.status(404).json({ message: "User no longer exists" });
      
      if (!user.isApproved) {
        return res.status(403).json({ message: "Acceso revocado. Contacte a TI." });
      }
      
      req.user = { ...decoded, ...user }; // Pasar los datos completos del usuario
      next();
    } catch {
      res.status(500).json({ message: "Error in authentication" });
    }
  });
};

// Register
app.post("/api/register", async (req, res) => {
  const { email, password, name, isApprovedFromAdmin } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;
    
    // First user is admin and approved, others wait for approval unless admin is creating them
    const role = isFirstUser ? "admin" : "user";
    const isApproved = isFirstUser || isApprovedFromAdmin === true;
    const access = isFirstUser || isApprovedFromAdmin === true;

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { 
        email, 
        password: hashedPassword, 
        name,
        role,
        isApproved,
        accessIngenieria: access,
        accessSubcontratos: access,
        accessContabilidad: access
      },
    });

    // Notificaciones por correo
    if (!isFirstUser && !isApprovedFromAdmin) {
      // Buscar al administrador para notificarle
      const admin = await prisma.user.findFirst({ where: { role: "admin" } });
      if (admin) {
        await sendNewRequestEmailToAdmin(admin.email, user.name || user.email);
      }
    }

    const message = (isFirstUser || isApprovedFromAdmin)
      ? "Usuario creado" 
      : "Solicitud de acceso enviada. El área de tecnología revisará su petición.";

    res.status(201).json({ message, userId: user.id });
  } catch {
    res.status(500).json({ message: "Error creating user" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  console.log(`Intento de login para: ${email}`);

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ message: "User not found" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ message: "Invalid password" });

    console.log(`Usuario encontrado: ${user.email}, isApproved: ${user.isApproved}`);

    if (user.isApproved === false || !user.isApproved) {
      console.log(`Acceso denegado: Usuario ${email} no está aprobado.`);
      return res.status(403).json({ 
        message: "Su cuenta está pendiente de aprobación. Por favor, espere a que el departamento de TI apruebe sus accesos." 
      });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });

    const userResponse = { 
      id: user.id, 
      email: user.email, 
      name: user.name,
      role: user.role,
      isApproved: !!user.isApproved,
      accessIngenieria: !!user.accessIngenieria,
      accessSubcontratos: !!user.accessSubcontratos,
      accessContabilidad: !!user.accessContabilidad
    };

    console.log(`Login exitoso. Enviando datos de usuario:`, userResponse);

    res.json({ 
      token, 
      user: userResponse 
    });
  } catch {
    res.status(500).json({ message: "Login error" });
  }
});

// Get all users
app.get("/api/users", authenticateToken, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isApproved: true,
        accessIngenieria: true,
        accessSubcontratos: true,
        accessContabilidad: true,
      }
    });
    
    console.log(`Debug API Users: Encontrados ${users.length} usuarios. Keys del primero:`, Object.keys(users[0] || {}));
    
    res.json(users);
  } catch {
    res.status(500).json({ message: "Error fetching users" });
  }
});

// Update user permissions
app.put("/api/users/:id/permissions", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { accessIngenieria, accessSubcontratos, accessContabilidad, role, isApproved } = req.body;

  console.log(`Petición de cambio para usuario ${id}:`, { isApproved, role });

  try {
    const userId = parseInt(id);
    if (isNaN(userId)) return res.status(400).json({ message: "Invalid User ID" });

    // Obtener estado anterior
    const previousUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!previousUser) return res.status(404).json({ message: "User not found" });

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { 
        accessIngenieria: typeof accessIngenieria === 'boolean' ? accessIngenieria : previousUser.accessIngenieria, 
        accessSubcontratos: typeof accessSubcontratos === 'boolean' ? accessSubcontratos : previousUser.accessSubcontratos, 
        accessContabilidad: typeof accessContabilidad === 'boolean' ? accessContabilidad : previousUser.accessContabilidad, 
        role: role || previousUser.role, 
        isApproved: typeof isApproved === 'boolean' ? isApproved : previousUser.isApproved 
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isApproved: true,
        accessIngenieria: true,
        accessSubcontratos: true,
        accessContabilidad: true,
      }
    });

    console.log(`Usuario ${id} actualizado con éxito. isApproved: ${updatedUser.isApproved}`);

    // Si se acaba de aprobar (pasó de false a true)
    if (previousUser && !previousUser.isApproved && isApproved) {
      await sendApprovalEmail(updatedUser.email, updatedUser.name || updatedUser.email);
    }

    res.json(updatedUser);
  } catch {
    res.status(500).json({ message: "Error updating permissions" });
  }
});

// Protected Route Example
app.get("/api/me", authenticateToken, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId }
    });
    
    if (!user) return res.status(404).json({ message: "User not found" });

    const responseData = { 
      id: user.id, 
      email: user.email, 
      name: user.name,
      role: user.role,
      isApproved: !!user.isApproved,
      accessIngenieria: !!user.accessIngenieria,
      accessSubcontratos: !!user.accessSubcontratos,
      accessContabilidad: !!user.accessContabilidad
    };

    console.log(`[AUTH v1.5] Datos para ${user.email}: Aprobado=${responseData.isApproved}`);
    res.json(responseData);
  } catch (error) {
    console.error("Error en /api/me:", error);
    res.status(500).json({ message: "Error fetching user" });
  }
});

// Budget Routes
app.post("/api/budgets/upload", authenticateToken, upload.single("file"), async (req: any, res: any) => {
  const { projectName, description } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Encontrar la fila de encabezados
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rawData.length, 20); i++) {
      if (rawData[i].includes("Código") || rawData[i].includes("Codigo") || rawData[i].includes("Resumen")) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({ message: "No se encontró una cabecera válida en el archivo Excel (Código, Resumen, etc.)" });
    }

    const headers = rawData[headerRowIndex];
    const dataRows = rawData.slice(headerRowIndex + 1);

    // Intentar extraer nombre del proyecto si no se envió uno
    let finalProjectName = projectName;
    if (!finalProjectName || finalProjectName === "Nuevo Presupuesto") {
      // Usar la primera celda del archivo si parece un título
      if (rawData[0] && rawData[0][0]) {
        finalProjectName = rawData[0][0].toString();
      }
    }

    const getIndex = (names: string[]) => headers.findIndex(h => names.some(n => h && h.toString().toLowerCase().includes(n.toLowerCase())));

    const idxCode = getIndex(["Código", "Codigo", "Item", "Code"]);
    const idxDesc = getIndex(["Resumen", "Descripción", "Descripcion", "Name", "Description"]);
    const idxUnit = getIndex(["Ud", "Unidad", "Und", "Unit"]);
    const idxQty = getIndex(["CanPres", "Cantidad", "Qty", "Quantity"]);
    const idxPrice = getIndex(["Pres", "Precio", "Price", "P.U."]);
    const idxTotal = getIndex(["ImpPres", "Total", "Monto"]);
    const idxNat = getIndex(["Nat", "Naturaleza", "Tipo"]);

    const budgetItems = dataRows.map((row) => {
      const code = idxCode !== -1 ? row[idxCode] : "";
      const description = idxDesc !== -1 ? row[idxDesc] : "";
      const unit = idxUnit !== -1 ? row[idxUnit] : "";
      const quantity = idxQty !== -1 ? parseFloat(row[idxQty]) : 0;
      const unitPrice = idxPrice !== -1 ? parseFloat(row[idxPrice]) : 0;
      const total = idxTotal !== -1 ? parseFloat(row[idxTotal]) : (quantity * unitPrice);
      const nat = idxNat !== -1 ? row[idxNat] : "";

      // Si no hay descripción, saltar
      if (!description) return null;
      
      // Filtrar para obtener solo lo relevante (Capítulos o Partidas con código)
      // En el formato Presto, las partidas suelen tener NAT='Partida' o tienen Unidad
      if (!code && !unit && !nat) return null;

      return {
        code: code ? code.toString() : "",
        description: description.toString(),
        unit: unit ? unit.toString() : "",
        quantity: isNaN(quantity) ? 0 : quantity,
        unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
        total: isNaN(total) ? 0 : total,
        isChapter: nat === "Capítulo" || nat === "Capitulo" || (!unit && code && !quantity)
      };
    }).filter(item => item !== null);

    // Solo sumar items que no sean capítulos para evitar duplicar el monto total
    const totalAmount = budgetItems.reduce((sum, item) => {
      if (item && !item.isChapter) {
        return sum + item.total;
      }
      return sum;
    }, 0);

    // Buscar si ya existe un presupuesto con ese nombre para actualizarlo
    const existingBudget = await prisma.budget.findFirst({
      where: { projectName: finalProjectName }
    });

    let budget;
    if (existingBudget) {
      console.log(`Actualizando presupuesto existente: ${finalProjectName}`);
      // Eliminar partidas anteriores para reemplazarlas
      await prisma.budgetItem.deleteMany({
        where: { budgetId: existingBudget.id }
      });

      budget = await prisma.budget.update({
        where: { id: existingBudget.id },
        data: {
          description: description || existingBudget.description,
          totalAmount,
          items: {
            create: budgetItems?.map(item => ({
              code: item?.code,
              description: item?.description,
              unit: item?.unit,
              quantity: item?.quantity,
              unitPrice: item?.unitPrice,
              total: item?.total,
              isChapter: item?.isChapter || false
            }))
          }
        },
        include: { items: true }
      });
    } else {
      budget = await prisma.budget.create({
        data: {
          projectName: finalProjectName || "Nuevo Presupuesto",
          description: description || "",
          totalAmount,
          items: {
            create: budgetItems?.map(item => ({
              code: item?.code,
              description: item?.description,
              unit: item?.unit,
              quantity: item?.quantity,
              unitPrice: item?.unitPrice,
              total: item?.total,
              isChapter: item?.isChapter || false
            }))
          }
        },
        include: {
          items: true
        }
      });
    }

    res.status(201).json(budget);
  } catch (error) {
    console.error("Error processing budget upload:", error);
    res.status(500).json({ message: "Error processing Excel file" });
  }
});

app.get("/api/budgets", authenticateToken, async (req, res) => {
  try {
    const budgets = await prisma.budget.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { items: true }
        }
      }
    });
    res.json(budgets);
  } catch (error) {
    res.status(500).json({ message: "Error fetching budgets" });
  }
});

app.get("/api/budgets/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  console.log(`[GET] /api/budgets/${id} - Solicitando detalles del presupuesto`);
  try {
    const budget = await prisma.budget.findUnique({
      where: { id: parseInt(id) },
      include: {
        items: {
          include: {
            measurements: true
          }
        }
      }
    });
    if (!budget) {
      console.warn(`Presupuesto ID ${id} no encontrado`);
      return res.status(404).json({ message: "Presupuesto no encontrado" });
    }
    console.log(`Enviando presupuesto "${budget.projectName}" con ${budget.items.length} items.`);
    res.json(budget);
  } catch (error) {
    console.error("Error fetching budget details:", error);
    res.status(500).json({ message: "Error fetching budget details" });
  }
});

app.delete("/api/budgets/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  console.log(`Petición para eliminar presupuesto ID: ${id}`);
  try {
    const budgetId = parseInt(id);
    if (isNaN(budgetId)) return res.status(400).json({ message: "ID de presupuesto inválido" });

    await prisma.budget.delete({
      where: { id: budgetId }
    });
    console.log(`Presupuesto ${id} eliminado correctamente`);
    res.json({ message: "Presupuesto eliminado con éxito" });
  } catch (error) {
    console.error("Error deleting budget:", error);
    res.status(500).json({ message: "Error al eliminar el presupuesto" });
  }
});

// AdmCloud Transactions Route
app.get("/api/admcloud/transactions", authenticateToken, async (req, res) => {
  try {
    const pool = await connectAdmCloud();
    const user = (req as any).user;
    const departmentFilterParam = req.query.departmentFilter;
    
    // Determinar el filtro según el parámetro enviado y los permisos del usuario
    let departmentFilter = '';
    
    if (departmentFilterParam === 'subcontratos' && user?.accessSubcontratos) {
      // Si el usuario solicita filtrar por Subcontratos y tiene el permiso
      departmentFilter = `AND t.[DepartmentID] = '134A52D2-1FF9-4BB1-564D-08DE34362E70'`;
    }
    
    const query = `
        SELECT TOP 1000
            t.[ID],
            t.[DocID],
            t.[DocType],
            t.[DocDate],
            t.[Reference],
            t.[Status],
            t.[TaxAmount],
            t.[TotalAmount],
            t.[DepartmentID],
            t.[CurrencyID] as Currency,
            t.[ExchangeRate],
            t.[CUSTOM_Fechadesde] as MeasurementStartDate,
            t.[CUSTOM_Fechahasta] as MeasurementEndDate,
            r.[FullName] as VendorName,
            r.[FiscalID] as VendorFiscalID,
            p.[Name] as ProjectName
        FROM [dbo].[SA_Transactions] t
        LEFT JOIN [dbo].[SA_Relationships] r ON t.[RelationshipID] = r.[ID]
        LEFT JOIN [dbo].[PA_Projects] p ON t.[ProjectID] = p.[ID]
        WHERE t.[SubsidiaryID] = 'FBC6AADF-8B12-47F7-AA18-08DDDFE6F02E'
          AND t.[DocType] = 'PO'
          ${departmentFilter}
        ORDER BY p.[Name] ASC, t.[DocDate] DESC, t.[DocID] DESC
    `;
    
    console.log('\n🔍 === FILTRO DE TRANSACCIONES ===');
    console.log(`Usuario: ${user?.email}`);
    console.log(`Query param 'departmentFilter': ${departmentFilterParam || 'NO ENVIADO'}`);
    console.log(`Permiso accessSubcontratos: ${user?.accessSubcontratos}`);
    console.log(`Filtro SQL generado: ${departmentFilter || 'NINGUNO (todas las órdenes)'}`);
    console.log(`Query completa: ${query.substring(0, 300)}...`);
    
    const result = await pool.request().query(query);
    console.log(`✅ Resultados devueltos: ${result.recordset.length} órdenes`);
    
    // Log de monedas para depuración
    const ordenesPorMoneda = result.recordset.reduce((acc: any, r: any) => {
      const curr = r.Currency || 'NULL';
      acc[curr] = (acc[curr] || 0) + 1;
      return acc;
    }, {});
    console.log('💰 Distribución de monedas:', ordenesPorMoneda);
    
    if (departmentFilterParam === 'subcontratos') {
      console.log(`📋 DocIDs devueltos: ${result.recordset.map((r: any) => r.DocID).join(', ')}`);
    }
    console.log('=================================\n');
    res.json(result.recordset);
  } catch (error) {
    console.error("Error fetching AdmCloud transactions:", error);
    res.status(500).json({ message: "Error al consultar AdmCloud" });
  }
});

// Get single Transaction by ID
app.get("/api/admcloud/transactions/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await connectAdmCloud();
    
    const query = `
        SELECT TOP 1
            t.[ID],
            t.[DocID],
            t.[DocType],
            t.[DocDate],
            t.[Reference],
            t.[Status],
            t.[TaxAmount],
            t.[TotalAmount],
            t.[DepartmentID],
            t.[CUSTOM_Fechadesde] as MeasurementStartDate,
            t.[CUSTOM_Fechahasta] as MeasurementEndDate,
            r.[FullName] as VendorName,
            r.[FiscalID] as VendorFiscalID,
            p.[Name] as ProjectName
        FROM [dbo].[SA_Transactions] t
        LEFT JOIN [dbo].[SA_Relationships] r ON t.[RelationshipID] = r.[ID]
        LEFT JOIN [dbo].[PA_Projects] p ON t.[ProjectID] = p.[ID]
        WHERE t.[ID] = '${id}'
    `;
    
    const result = await pool.request().query(query);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Transacción no encontrada" });
    }
    
    res.json(result.recordset[0]);
  } catch (error) {
    console.error("Error fetching AdmCloud transaction:", error);
    res.status(500).json({ message: "Error al consultar AdmCloud" });
  }
});

// Get Receptions for a specific Purchase Order
app.get("/api/admcloud/transactions/:id/receptions", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await connectAdmCloud();
    
    const query = `
      SELECT DISTINCT
          rt.[ID],
          rt.[DocID],
          rt.[DocType],
          rt.[DocDate],
          rt.[Reference],
          rt.[CUSTOM_Fechadesde] as MeasurementStartDate,
          rt.[CUSTOM_Fechahasta] as MeasurementEndDate
      FROM [dbo].[SA_Trans_Items] ri
      JOIN [dbo].[SA_Transactions] rt ON ri.[TransID] = rt.[ID]
      WHERE ri.[SourceTransactionID] = @transId
      AND rt.[DocType] = 'RECEPTION'
      AND rt.[Void] = 0
      ORDER BY rt.[DocDate] DESC
    `;
    
    const result = await pool.request()
      .input('transId', id)
      .query(query);
    
    console.log('📦 Recepciones encontradas para OC:', id, '→', result.recordset.length);
    if (result.recordset.length > 0) {
      console.log('📅 Fechas en recepciones:', result.recordset.map(r => ({
        DocID: r.DocID,
        StartDate: r.MeasurementStartDate,
        EndDate: r.MeasurementEndDate
      })));
    }
    
    res.json(result.recordset);
  } catch (error) {
    console.error("Error fetching receptions:", error);
    res.status(500).json({ message: "Error al consultar recepciones de AdmCloud" });
  }
});

// Get Items for a specific Transaction with Reception details
app.get("/api/admcloud/transactions/:id/items", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await connectAdmCloud();
    
    // Consulta mejorada para traer items de la PO y sumar sus recepciones vinculadas
    const query = `
        SELECT 
            i.[ID],
            i.[TransID],
            i.[ItemID],
            i.[Name],
            i.[Quantity] as OrderedQuantity,
            i.[Price],
            i.[TaxAmount],
            i.[TaxPercent],
            i.[TotalSalesAmount],
            ISNULL((
                SELECT SUM(ri.[Quantity])
                FROM [dbo].[SA_Trans_Items] ri
                JOIN [dbo].[SA_Transactions] rt ON ri.[TransID] = rt.[ID]
                WHERE ri.[SourceTransactionID] = i.[TransID] 
                AND ri.[SourceRowID] = i.[ID]
                AND rt.[Void] = 0
            ), 0) as ReceivedQuantity,
            (
                SELECT DISTINCT CAST(rt.[DocID] AS VARCHAR) + ','
                FROM [dbo].[SA_Trans_Items] ri
                JOIN [dbo].[SA_Transactions] rt ON ri.[TransID] = rt.[ID]
                WHERE ri.[SourceTransactionID] = i.[TransID] 
                AND ri.[SourceRowID] = i.[ID]
                AND rt.[Void] = 0
                FOR XML PATH('')
            ) as ReceptionList
        FROM [dbo].[SA_Trans_Items] i
        WHERE i.[TransID] = @transId
        ORDER BY i.[RowOrder] ASC
    `;
    const result = await pool.request()
      .input('transId', id)
      .query(query);

    const admItems = result.recordset;

    // Obtener lo ya pagado/solicitado en nuestra DB (excluyendo lo rechazado)
    const paidQuantities = await prisma.paymentRequestLine.groupBy({
      by: ['externalItemID'],
      where: {
        paymentRequest: {
          externalTxID: id,
          status: { not: "RECHAZADO" }
        }
      },
      _sum: {
        quantity: true
      }
    });

    // Mapear los resultados
    const finalItems = admItems.map((it: any) => {
      const paidObj = paidQuantities.find(p => p.externalItemID === it.ItemID);
      // Limpiar la lista de recepciones (remover coma final y espacios)
      const receptions = it.ReceptionList ? it.ReceptionList.split(',').filter((r:string) => r.trim() !== '').join(', ') : '';
      
      const item = {
        ...it,
        ReceptionNumbers: receptions,
        PaidQuantity: paidObj?._sum?.quantity || 0
      };
      
      // Log para depuración de impuestos
      if (it.TaxAmount === 0 && it.TaxPercent > 0) {
        console.log(`⚠️ Item ${it.ItemID} tiene TaxPercent=${it.TaxPercent}% pero TaxAmount=0`);
      }
      
      return item;
    });
    
    console.log(`✅ Items devueltos: ${finalItems.length}`);
    res.json(finalItems);
  } catch (error) {
    console.error("Error fetching transaction items:", error);
    res.status(500).json({ message: "Error al consultar ítems de AdmCloud" });
  }
});

// Create a Measurement (Link OC item to Budget item)
app.post("/api/measurements", authenticateToken, async (req, res) => {
  const { budgetItemId, externalTransID, externalItemID, quantity, price, notes } = req.body;
  try {
    const measurement = await prisma.measurement.create({
      data: {
        budgetItemId: parseInt(budgetItemId),
        externalTransID,
        externalItemID,
        quantity: parseFloat(quantity),
        price: parseFloat(price),
        notes
      }
    });

    // Opcional: Podríamos actualizar el avance en el BudgetItem si tuviéramos un campo
    res.status(201).json(measurement);
  } catch (error) {
    console.error("Error creating measurement:", error);
    res.status(500).json({ message: "Error al registrar la medición" });
  }
});

// Get measurements for a specific budget item
app.get("/api/budget-items/:id/measurements", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const measurements = await prisma.measurement.findMany({
      where: { budgetItemId: parseInt(id) },
      orderBy: { date: 'desc' }
    });
    res.json(measurements);
  } catch (error) {
    res.status(500).json({ message: "Error fetching measurements" });
  }
});

// --- PAYMENT REQUESTS / BOLETINES ---

const normalizeUnitOfMeasure = (unit?: string | null) => (unit || '').trim().toUpperCase();
const normalizeVendorName = (vendorName?: string | null) => (vendorName || '').trim().toUpperCase();

const getLastUnitsByItemForTx = async (externalTxID: string, excludePaymentRequestId?: number) => {
  const previousPaymentRequests = await prisma.paymentRequest.findMany({
    where: {
      externalTxID,
      ...(excludePaymentRequestId ? { id: { not: excludePaymentRequestId } } : {})
    },
    orderBy: { createdAt: 'desc' },
    include: { lines: true }
  });

  const unitsByItem = new Map<string, string>();

  for (const request of previousPaymentRequests) {
    for (const line of request.lines) {
      if (unitsByItem.has(line.externalItemID)) continue;
      const normalized = normalizeUnitOfMeasure((line as any).unitOfMeasure);
      if (normalized) {
        unitsByItem.set(line.externalItemID, normalized);
      }
    }
  }

  return unitsByItem;
};

const getValidUnitCodes = async (lines: any[]) => {
  const requestedCodes = Array.from(
    new Set(lines.map((line: any) => normalizeUnitOfMeasure(line.unitOfMeasure)).filter((code: string) => !!code))
  );

  if (requestedCodes.length === 0) {
    return new Set<string>();
  }

  const units = await prisma.unitOfMeasure.findMany({
    where: {
      code: { in: requestedCodes }
    },
    select: { code: true }
  });

  return new Set(units.map((unit) => unit.code));
};

const resolveScheduledLine = (paymentRequest: any) => {
  if (!paymentRequest?.paymentScheduleLines || paymentRequest.paymentScheduleLines.length === 0) {
    return null;
  }

  return paymentRequest.paymentScheduleLines.find((line: any) =>
    line?.paymentSchedule?.status !== 'CANCELADA'
  ) || paymentRequest.paymentScheduleLines[0];
};

app.post("/api/payment-requests", authenticateToken, async (req, res) => {
  const { 
    externalTxID, docID, vendorName, vendorFiscalID, projectName, 
    lines, retentionPercent, advancePercent, isrPercent,
    receptionNumbers, measurementStartDate, measurementEndDate
  } = req.body;

  try {
    const count = await prisma.paymentRequest.count();
    const docNumber = `BM-${(count + 1).toString().padStart(6, '0')}`;
    const previousUnitsByItem = await getLastUnitsByItemForTx(externalTxID);
    const validUnitCodes = await getValidUnitCodes(lines || []);

    let subTotal = 0;
    let taxAmount = 0;
    let totalRetentionByLine = 0;
    let totalItbisRetention = 0;

    const formattedLines = lines.map((l: any) => {
      const normalizedUnit = normalizeUnitOfMeasure(l.unitOfMeasure);
      if (!normalizedUnit) {
        throw new Error(`La unidad de medida es obligatoria para la partida \"${l.description}\".`);
      }

      if (!validUnitCodes.has(normalizedUnit)) {
        throw new Error(`La unidad de medida \"${normalizedUnit}\" no existe en el catálogo.`);
      }

      const previousUnit = previousUnitsByItem.get(l.externalItemID);
      if (previousUnit && previousUnit !== normalizedUnit) {
        throw new Error(`La partida \"${l.description}\" debe usar la unidad \"${previousUnit}\" según el boletín anterior.`);
      }

      const lineTax = l.quantity * l.unitPrice * (l.taxPercent / 100);
      const lineRetention = (l.quantity * l.unitPrice) * ((l.retentionPercent || 0) / 100);
      const lineItbisRetention = lineTax * ((l.itbisRetentionPercent || 0) / 100);
      const lineTotal = (l.quantity * l.unitPrice) + lineTax - lineRetention - lineItbisRetention;
      
      subTotal += (l.quantity * l.unitPrice);
      taxAmount += lineTax;
      totalRetentionByLine += lineRetention;
      totalItbisRetention += lineItbisRetention;
      
      return {
        externalItemID: l.externalItemID,
        description: l.description,
        unitOfMeasure: normalizedUnit,
        receptionNumbers: l.receptionNumbers,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxType: l.taxType,
        taxPercent: l.taxPercent,
        taxAmount: lineTax,
        retentionPercent: l.retentionPercent || 0,
        retentionAmount: lineRetention,
        itbisRetentionPercent: l.itbisRetentionPercent || 0,
        totalLine: lineTotal
      };
    });

    const retentionAmount = subTotal * (retentionPercent / 100);
    const advanceAmount = subTotal * (advancePercent / 100);
    const isrAmount = subTotal * (isrPercent / 100);
    const netTotal = (subTotal + taxAmount) - totalRetentionByLine - totalItbisRetention - retentionAmount - advanceAmount - isrAmount;

    const pr = await prisma.paymentRequest.create({
      data: {
        docNumber,
        externalTxID,
        docID,
        vendorName: normalizeVendorName(vendorName),
        vendorFiscalID,
        projectName,
        receptionNumbers,
        measurementStartDate: measurementStartDate ? new Date(measurementStartDate) : null,
        measurementEndDate: measurementEndDate ? new Date(measurementEndDate) : null,
        subTotal,
        taxAmount,
        retentionPercent,
        retentionAmount,
        advancePercent,
        advanceAmount,
        isrPercent,
        isrAmount,
        netTotal,
        lines: { create: formattedLines }
      },
      include: { lines: true }
    });
    res.status(201).json(pr);
  } catch (error: any) {
    res.status(500).json({ message: "Error al crear el boletín", detail: error.message });
  }
});

app.get("/api/payment-requests", authenticateToken, async (req, res) => {
  try {
    const prs = await prisma.paymentRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        lines: true,
        paymentScheduleLines: {
          include: {
            paymentSchedule: {
              select: {
                id: true,
                scheduleNumber: true,
                status: true
              }
            }
          }
        }
      }
    });
    res.json(prs);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener boletines" });
  }
});

app.put("/api/payment-requests/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { 
    lines, retentionPercent, advancePercent, isrPercent,
    receptionNumbers, vendorFiscalID, measurementStartDate, measurementEndDate, vendorName
  } = req.body;

  try {
    const prId = parseInt(id);
    const existingPR = await prisma.paymentRequest.findUnique({
      where: { id: prId },
      include: {
        lines: true,
        paymentScheduleLines: {
          include: {
            paymentSchedule: {
              select: {
                id: true,
                scheduleNumber: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (!existingPR) return res.status(404).json({ message: "Boletín no encontrado" });

    const scheduledLine = resolveScheduledLine(existingPR);
    if (scheduledLine) {
      return res.status(400).json({
        message: `No se puede editar un boletín programado en ${scheduledLine.paymentSchedule?.scheduleNumber || 'otra programación'}`
      });
    }

    if (existingPR.status !== "PENDIENTE") {
      return res.status(400).json({ message: "Solo se pueden modificar boletines en estado PENDIENTE" });
    }

    const previousUnitsByItem = await getLastUnitsByItemForTx(existingPR.externalTxID, prId);
    const validUnitCodes = await getValidUnitCodes(lines || []);

    let subTotal = 0;
    let taxAmount = 0;
    let totalRetentionByLine = 0;
    let totalItbisRetention = 0;

    const formattedLines = lines.map((l: any) => {
      const normalizedUnit = normalizeUnitOfMeasure(l.unitOfMeasure);
      if (!normalizedUnit) {
        throw new Error(`La unidad de medida es obligatoria para la partida \"${l.description}\".`);
      }

      if (!validUnitCodes.has(normalizedUnit)) {
        throw new Error(`La unidad de medida \"${normalizedUnit}\" no existe en el catálogo.`);
      }

      const previousUnit = previousUnitsByItem.get(l.externalItemID);
      if (previousUnit && previousUnit !== normalizedUnit) {
        throw new Error(`La partida \"${l.description}\" debe usar la unidad \"${previousUnit}\" según el boletín anterior.`);
      }

      const lineTax = l.quantity * l.unitPrice * (l.taxPercent / 100);
      const lineRetention = (l.quantity * l.unitPrice) * ((l.retentionPercent || 0) / 100);
      const lineItbisRetention = lineTax * ((l.itbisRetentionPercent || 0) / 100);
      const lineTotal = (l.quantity * l.unitPrice) + lineTax - lineRetention - lineItbisRetention;
      
      subTotal += (l.quantity * l.unitPrice);
      taxAmount += lineTax;
      totalRetentionByLine += lineRetention;
      totalItbisRetention += lineItbisRetention;
      
      return {
        externalItemID: l.externalItemID,
        description: l.description,
        unitOfMeasure: normalizedUnit,
        receptionNumbers: l.receptionNumbers,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxType: l.taxType,
        taxPercent: l.taxPercent,
        taxAmount: lineTax,
        retentionPercent: l.retentionPercent || 0,
        retentionAmount: lineRetention,
        itbisRetentionPercent: l.itbisRetentionPercent || 0,
        totalLine: lineTotal
      };
    });

    const retentionAmount = subTotal * (retentionPercent / 100);
    const advanceAmount = subTotal * (advancePercent / 100);
    const isrAmount = subTotal * (isrPercent / 100);
    const netTotal = (subTotal + taxAmount) - totalRetentionByLine - totalItbisRetention - retentionAmount - advanceAmount - isrAmount;

    // Actualizar usando una transacción para borrar lineas viejas y crear nuevas
    const updatedPR = await prisma.$transaction(async (tx) => {
      // Borrar lineas anteriores
      await tx.paymentRequestLine.deleteMany({
        where: { paymentRequestId: prId }
      });

      // Actualizar cabecera y crear nuevas lineas
      return await tx.paymentRequest.update({
        where: { id: prId },
        data: {
          subTotal,
          taxAmount,
          retentionPercent,
          retentionAmount,
          advancePercent,
          advanceAmount,
          isrPercent,
          isrAmount,
          netTotal,
          receptionNumbers,
          vendorName: vendorName ? normalizeVendorName(vendorName) : existingPR.vendorName,
          vendorFiscalID,
          measurementStartDate: measurementStartDate ? new Date(measurementStartDate) : null,
          measurementEndDate: measurementEndDate ? new Date(measurementEndDate) : null,
          lines: { create: formattedLines }
        },
        include: { lines: true }
      });
    });

    res.json(updatedPR);
  } catch (error: any) {
    res.status(500).json({ message: "Error al actualizar el boletín", detail: error.message });
  }
});

app.patch("/api/payment-requests/:id/status", authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body; // PENDIENTE, APROBADO, RECHAZADO

  try {
    const prId = parseInt(id);
    if (isNaN(prId)) {
      return res.status(400).json({ message: "ID de boletín inválido" });
    }
    
    // Solo admins o gente de contabilidad puede aprobar
    if (req.user.role !== 'admin' && !req.user.accessContabilidad) {
      return res.status(403).json({ message: "No tiene permiso para aprobar/rechazar boletines" });
    }

    // Validar que se proporcione un motivo al rechazar
    if (status === 'RECHAZADO' && !rejectionReason?.trim()) {
      return res.status(400).json({ message: "Debe proporcionar un motivo para el rechazo" });
    }

    const updateData: any = { status };
    if (status === 'RECHAZADO') {
      updateData.rejectionReason = rejectionReason;
    } else {
      // Si se aprueba o cambia a pendiente, limpiar el motivo de rechazo
      updateData.rejectionReason = null;
    }

    const updatedPR = await prisma.paymentRequest.update({
      where: { id: prId },
      data: updateData
    });

    console.log(`[BOLETIN] ID ${id} cambiado a estado: ${status} por ${req.user.email}`);
    if (rejectionReason) {
      console.log(`[BOLETIN] Motivo de rechazo: ${rejectionReason}`);
    }
    res.json(updatedPR);
  } catch (error: any) {
    console.error("Error en PATCH status:", error);
    res.status(500).json({ 
      message: "Error al cambiar el estado del boletín",
      detail: error.message 
    });
  }
});

app.get("/api/payment-schedules/eligible-payment-requests", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && !req.user.accessContabilidad) {
    return res.status(403).json({ message: "No tiene permiso para consultar boletines elegibles" });
  }

  try {
    const eligible = await prisma.paymentRequest.findMany({
      where: {
        status: {
          not: 'RECHAZADO'
        },
        paymentScheduleLines: {
          none: {
            paymentSchedule: {
              status: {
                not: 'CANCELADA'
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      include: { lines: true }
    });

    res.json(eligible);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener boletines elegibles", detail: error.message });
  }
});

app.get("/api/payment-schedules", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && !req.user.accessContabilidad) {
    return res.status(403).json({ message: "No tiene permiso para consultar programaciones de pagos" });
  }

  try {
    const schedules = await prisma.paymentSchedule.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        lines: {
          include: {
            paymentRequest: true
          }
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });

    res.json(schedules);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener programaciones de pagos", detail: error.message });
  }
});

const parseCommitmentDateInput = (value: unknown): Date | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const parsedDate = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
};

const parsePaymentDateInput = (value: unknown): Date | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const parsedDate = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
};

const getStartOfUtcDay = (date: Date): Date => {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
};

const getEndOfUtcDay = (date: Date): Date => {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
};

const getFirstBoletinAfterCommitment = (
  requests: Array<{ docNumber: string; date: Date }>,
  commitmentDate: Date
) => {
  const commitmentEnd = getEndOfUtcDay(commitmentDate).getTime();
  return requests.find((request) => new Date(request.date).getTime() > commitmentEnd);
};

app.post("/api/payment-schedules", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && !req.user.accessContabilidad) {
    return res.status(403).json({ message: "No tiene permiso para crear programaciones de pagos" });
  }

  const paymentRequestIds = Array.isArray(req.body?.paymentRequestIds)
    ? req.body.paymentRequestIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
    : [];
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : null;
  const commitmentDate = parseCommitmentDateInput(req.body?.commitmentDate);
  const paymentDate = parsePaymentDateInput(req.body?.paymentDate);

  if (!commitmentDate) {
    return res.status(400).json({ message: "Debe indicar una fecha de compromiso válida" });
  }

  if (!paymentDate) {
    return res.status(400).json({ message: "Debe indicar una fecha de pago válida" });
  }

  const scheduleDateReference = new Date();
  if (paymentDate.getTime() < getStartOfUtcDay(scheduleDateReference).getTime()) {
    return res.status(400).json({
      message: "La fecha de pago debe ser igual o mayor a la fecha de programación"
    });
  }

  if (paymentRequestIds.length === 0) {
    return res.status(400).json({ message: "Debe seleccionar al menos un boletín" });
  }

  try {
    const existingLines = await prisma.paymentScheduleLine.findMany({
      where: {
        paymentRequestId: { in: paymentRequestIds }
      },
      include: {
        paymentSchedule: {
          select: {
            id: true,
            scheduleNumber: true,
            status: true
          }
        }
      }
    });

    if (existingLines.length > 0) {
      const refs = existingLines
        .map((line) => line.paymentSchedule?.scheduleNumber)
        .filter(Boolean)
        .join(', ');
      return res.status(400).json({
        message: `Hay boletines ya incluidos en otra programación (${refs || 'sin referencia'})`
      });
    }

    const selectedRequests = await prisma.paymentRequest.findMany({
      where: { id: { in: paymentRequestIds } },
      select: { id: true, docNumber: true, date: true }
    });

    if (selectedRequests.length !== paymentRequestIds.length) {
      return res.status(400).json({ message: "Uno o más boletines no existen" });
    }

    const invalidBoletin = getFirstBoletinAfterCommitment(selectedRequests, commitmentDate);
    if (invalidBoletin) {
      return res.status(400).json({
        message: `El boletín ${invalidBoletin.docNumber} tiene fecha mayor a la fecha del compromiso`
      });
    }

    const count = await prisma.paymentSchedule.count();
    const scheduleNumber = `PP-${(count + 1).toString().padStart(6, '0')}`;

    const schedule = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentSchedule.create({
        data: {
          scheduleNumber,
          commitmentDate,
          paymentDate,
          notes,
          lines: {
            create: paymentRequestIds.map((paymentRequestId: number) => ({ paymentRequestId }))
          }
        },
        include: {
          lines: {
            include: { paymentRequest: true }
          }
        }
      });

      await tx.paymentScheduleAudit.create({
        data: {
          paymentScheduleId: created.id,
          action: 'CREATED',
          statusBefore: null,
          statusAfter: created.status,
          detail: `Creada con ${paymentRequestIds.length} boletín(es)`,
          createdBy: req.user.email
        }
      });

      return created;
    });

    res.status(201).json(schedule);
  } catch (error: any) {
    res.status(500).json({ message: "Error al crear programación de pagos", detail: error.message });
  }
});

app.put("/api/payment-schedules/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && !req.user.accessContabilidad) {
    return res.status(403).json({ message: "No tiene permiso para editar programaciones de pagos" });
  }

  const scheduleId = Number(req.params.id);
  if (!Number.isFinite(scheduleId)) {
    return res.status(400).json({ message: "ID de programación inválido" });
  }

  const paymentRequestIds = Array.isArray(req.body?.paymentRequestIds)
    ? req.body.paymentRequestIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
    : [];
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : null;
  const commitmentDate = parseCommitmentDateInput(req.body?.commitmentDate);
  const paymentDate = parsePaymentDateInput(req.body?.paymentDate);

  if (!commitmentDate) {
    return res.status(400).json({ message: "Debe indicar una fecha de compromiso válida" });
  }

  if (!paymentDate) {
    return res.status(400).json({ message: "Debe indicar una fecha de pago válida" });
  }

  try {
    const existingSchedule = await prisma.paymentSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        lines: {
          select: {
            paymentRequestId: true
          }
        }
      }
    });

    if (!existingSchedule) {
      return res.status(404).json({ message: "Programación no encontrada" });
    }

    if (existingSchedule.status === 'ENVIADA_FINANZAS') {
      return res.status(400).json({ message: "No se puede editar una programación enviada a finanzas" });
    }

    if (paymentDate.getTime() < getStartOfUtcDay(new Date(existingSchedule.date)).getTime()) {
      return res.status(400).json({
        message: "La fecha de pago debe ser igual o mayor a la fecha de programación"
      });
    }

    if (paymentRequestIds.length > 0) {
      const selectedRequests = await prisma.paymentRequest.findMany({
        where: {
          id: { in: paymentRequestIds },
          status: { not: 'RECHAZADO' }
        },
        select: { id: true, docNumber: true, date: true }
      });

      if (selectedRequests.length !== paymentRequestIds.length) {
        return res.status(400).json({ message: "Uno o más boletines no existen o están rechazados" });
      }

      const invalidBoletin = getFirstBoletinAfterCommitment(selectedRequests, commitmentDate);
      if (invalidBoletin) {
        return res.status(400).json({
          message: `El boletín ${invalidBoletin.docNumber} tiene fecha mayor a la fecha del compromiso`
        });
      }

      const conflictingLines = await prisma.paymentScheduleLine.findMany({
        where: {
          paymentRequestId: { in: paymentRequestIds },
          paymentScheduleId: { not: scheduleId },
          paymentSchedule: {
            status: {
              not: 'CANCELADA'
            }
          }
        },
        include: {
          paymentSchedule: {
            select: {
              scheduleNumber: true
            }
          }
        }
      });

      if (conflictingLines.length > 0) {
        const refs = conflictingLines
          .map((line) => line.paymentSchedule?.scheduleNumber)
          .filter(Boolean)
          .join(', ');
        return res.status(400).json({
          message: `Hay boletines ya incluidos en otra programación (${refs || 'sin referencia'})`
        });
      }
    }

    const shouldResetApproval = existingSchedule.status === 'APROBADA';

    const updatedSchedule = await prisma.$transaction(async (tx) => {
      await tx.paymentScheduleLine.deleteMany({
        where: { paymentScheduleId: scheduleId }
      });

      const updated = await tx.paymentSchedule.update({
        where: { id: scheduleId },
        data: {
          commitmentDate,
          paymentDate,
          notes,
          status: shouldResetApproval ? 'PENDIENTE_APROBACION' : existingSchedule.status,
          approvedAt: shouldResetApproval ? null : existingSchedule.approvedAt,
          approvedBy: shouldResetApproval ? null : existingSchedule.approvedBy,
          lines: {
            create: paymentRequestIds.map((paymentRequestId: number) => ({ paymentRequestId }))
          }
        },
        include: {
          lines: {
            include: { paymentRequest: true }
          }
        }
      });

      await tx.paymentScheduleAudit.create({
        data: {
          paymentScheduleId: updated.id,
          action: 'UPDATED',
          statusBefore: existingSchedule.status,
          statusAfter: updated.status,
          detail: shouldResetApproval
            ? `Editada con ${paymentRequestIds.length} boletín(es). Perdió aprobación por cambios.`
            : `Editada con ${paymentRequestIds.length} boletín(es).`,
          createdBy: req.user.email
        }
      });

      return updated;
    });

    res.json({
      ...updatedSchedule,
      approvalReset: shouldResetApproval,
      message: shouldResetApproval
        ? 'La programación fue actualizada y perdió el estado de aprobación'
        : 'Programación actualizada con éxito'
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al editar programación de pagos", detail: error.message });
  }
});

app.patch("/api/payment-schedules/:id/approve", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && !req.user.accessContabilidad) {
    return res.status(403).json({ message: "No tiene permiso para aprobar programaciones de pagos" });
  }

  const scheduleId = Number(req.params.id);
  if (!Number.isFinite(scheduleId)) {
    return res.status(400).json({ message: "ID de programación inválido" });
  }

  try {
    const schedule = await prisma.paymentSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        lines: {
          include: {
            paymentRequest: {
              select: {
                id: true,
                docNumber: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (!schedule) {
      return res.status(404).json({ message: "Programación no encontrada" });
    }

    if (schedule.status === 'ENVIADA_FINANZAS') {
      return res.status(400).json({ message: "La programación ya fue enviada a finanzas" });
    }

    const notApprovedRequests = schedule.lines
      .map((line) => line.paymentRequest)
      .filter((paymentRequest) => paymentRequest.status !== 'APROBADO');

    if (notApprovedRequests.length > 0) {
      return res.status(400).json({
        message: "No se puede aprobar la programación: contiene boletines pendientes de aprobación",
        boletinesPendientes: notApprovedRequests.map((paymentRequest) => ({
          id: paymentRequest.id,
          docNumber: paymentRequest.docNumber,
          status: paymentRequest.status
        }))
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const approved = await tx.paymentSchedule.update({
        where: { id: scheduleId },
        data: {
          status: 'APROBADA',
          approvedAt: new Date(),
          approvedBy: req.user.email
        }
      });

      await tx.paymentScheduleAudit.create({
        data: {
          paymentScheduleId: approved.id,
          action: 'APPROVED',
          statusBefore: schedule.status,
          statusAfter: approved.status,
          detail: 'Aprobación de programación completada',
          createdBy: req.user.email
        }
      });

      return approved;
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: "Error al aprobar programación", detail: error.message });
  }
});

app.post("/api/payment-schedules/:id/send-to-finance", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && !req.user.accessContabilidad) {
    return res.status(403).json({ message: "No tiene permiso para enviar a finanzas" });
  }

  const scheduleId = Number(req.params.id);
  if (!Number.isFinite(scheduleId)) {
    return res.status(400).json({ message: "ID de programación inválido" });
  }

  try {
    const schedule = await prisma.paymentSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        lines: {
          include: {
            paymentRequest: {
              select: {
                id: true,
                docNumber: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (!schedule) {
      return res.status(404).json({ message: "Programación no encontrada" });
    }

    if (schedule.status !== 'APROBADA') {
      return res.status(400).json({ message: "La programación debe estar aprobada antes de enviar a finanzas" });
    }

    if (schedule.status === 'ENVIADA_FINANZAS') {
      return res.status(400).json({ message: "La programación ya fue enviada a finanzas" });
    }

    const notApprovedRequests = schedule.lines
      .map((line) => line.paymentRequest)
      .filter((paymentRequest) => paymentRequest.status !== 'APROBADO');

    if (notApprovedRequests.length > 0) {
      return res.status(400).json({
        message: "Todos los boletines deben estar aprobados antes de enviar a pago",
        boletinesPendientes: notApprovedRequests.map((paymentRequest) => ({
          id: paymentRequest.id,
          docNumber: paymentRequest.docNumber,
          status: paymentRequest.status
        }))
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const sent = await tx.paymentSchedule.update({
        where: { id: scheduleId },
        data: {
          status: 'ENVIADA_FINANZAS',
          sentToFinanceAt: new Date(),
          sentToFinanceBy: req.user.email
        },
        include: {
          lines: {
            include: { paymentRequest: true }
          }
        }
      });

      await tx.paymentScheduleAudit.create({
        data: {
          paymentScheduleId: sent.id,
          action: 'SENT_TO_FINANCE',
          statusBefore: schedule.status,
          statusAfter: sent.status,
          detail: 'Envío a finanzas realizado',
          createdBy: req.user.email
        }
      });

      return sent;
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: "Error al enviar programación a finanzas", detail: error.message });
  }
});

app.patch("/api/payment-schedules/:id/restart-flow", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && !req.user.accessContabilidad) {
    return res.status(403).json({ message: "No tiene permiso para reiniciar el flujo de programación" });
  }

  const scheduleId = Number(req.params.id);
  if (!Number.isFinite(scheduleId)) {
    return res.status(400).json({ message: "ID de programación inválido" });
  }

  try {
    const schedule = await prisma.paymentSchedule.findUnique({
      where: { id: scheduleId }
    });

    if (!schedule) {
      return res.status(404).json({ message: "Programación no encontrada" });
    }

    if (schedule.status === 'PENDIENTE_APROBACION') {
      return res.status(400).json({ message: "La programación ya está en el primer nivel (pendiente de aprobación)" });
    }

    const restarted = await prisma.$transaction(async (tx) => {
      const reset = await tx.paymentSchedule.update({
        where: { id: scheduleId },
        data: {
          status: 'PENDIENTE_APROBACION',
          approvedAt: null,
          approvedBy: null,
          sentToFinanceAt: null,
          sentToFinanceBy: null
        },
        include: {
          lines: {
            include: {
              paymentRequest: true
            }
          }
        }
      });

      await tx.paymentScheduleAudit.create({
        data: {
          paymentScheduleId: reset.id,
          action: 'FLOW_RESTARTED',
          statusBefore: schedule.status,
          statusAfter: reset.status,
          detail: 'Flujo reiniciado al primer nivel',
          createdBy: req.user.email
        }
      });

      return reset;
    });

    res.json({
      ...restarted,
      message: 'Flujo reiniciado: la programación debe aprobarse y enviarse nuevamente paso a paso'
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al reiniciar el flujo de programación", detail: error.message });
  }
});

app.patch("/api/payment-schedules/:id/cancel", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && !req.user.accessContabilidad) {
    return res.status(403).json({ message: "No tiene permiso para cancelar programaciones" });
  }

  const scheduleId = Number(req.params.id);
  if (!Number.isFinite(scheduleId)) {
    return res.status(400).json({ message: "ID de programación inválido" });
  }

  try {
    const schedule = await prisma.paymentSchedule.findUnique({
      where: { id: scheduleId }
    });

    if (!schedule) {
      return res.status(404).json({ message: "Programación no encontrada" });
    }

    if (schedule.status === 'ENVIADA_FINANZAS') {
      return res.status(400).json({ message: "No se puede cancelar una programación ya enviada a finanzas" });
    }

    if (schedule.status === 'CANCELADA') {
      return res.status(400).json({ message: "La programación ya está cancelada" });
    }

    const cancelled = await prisma.$transaction(async (tx) => {
      const canceled = await tx.paymentSchedule.update({
        where: { id: scheduleId },
        data: {
          status: 'CANCELADA'
        },
        include: {
          lines: {
            include: { paymentRequest: true }
          }
        }
      });

      await tx.paymentScheduleAudit.create({
        data: {
          paymentScheduleId: canceled.id,
          action: 'CANCELED',
          statusBefore: schedule.status,
          statusAfter: canceled.status,
          detail: 'Programación cancelada y liberada',
          createdBy: req.user.email
        }
      });

      return canceled;
    });

    res.json(cancelled);
  } catch (error: any) {
    res.status(500).json({ message: "Error al cancelar programación", detail: error.message });
  }
});

// ========= RETENCIONES CRUD =========

// ========= UNIDADES DE MEDIDA CRUD =========

app.get("/api/units-of-measure", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "No tiene permiso para consultar unidades de medida" });
  }

  try {
    const units = await prisma.unitOfMeasure.findMany({
      orderBy: { code: 'asc' }
    });
    res.json(units);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener unidades de medida", detail: error.message });
  }
});

app.get("/api/units-of-measure/active", authenticateToken, async (req: any, res) => {
  try {
    const units = await prisma.unitOfMeasure.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' }
    });
    res.json(units);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener unidades activas", detail: error.message });
  }
});

app.post("/api/units-of-measure", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "No tiene permiso para crear unidades de medida" });
  }

  const { code, name, description } = req.body;
  const normalizedCode = normalizeUnitOfMeasure(code);

  if (!normalizedCode || !name?.trim()) {
    return res.status(400).json({ message: "Código y nombre son obligatorios" });
  }

  try {
    const unit = await prisma.unitOfMeasure.create({
      data: {
        code: normalizedCode,
        name: name.trim(),
        description: description?.trim() || null
      }
    });
    res.status(201).json(unit);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ message: "Ya existe una unidad con ese código" });
    }
    res.status(500).json({ message: "Error al crear unidad de medida", detail: error.message });
  }
});

app.put("/api/units-of-measure/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "No tiene permiso para actualizar unidades de medida" });
  }

  const { id } = req.params;
  const { code, name, description, isActive } = req.body;
  const normalizedCode = normalizeUnitOfMeasure(code);

  if (!normalizedCode || !name?.trim()) {
    return res.status(400).json({ message: "Código y nombre son obligatorios" });
  }

  try {
    const unit = await prisma.unitOfMeasure.update({
      where: { id: parseInt(id) },
      data: {
        code: normalizedCode,
        name: name.trim(),
        description: description?.trim() || null,
        isActive: typeof isActive === 'boolean' ? isActive : true
      }
    });
    res.json(unit);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ message: "Ya existe una unidad con ese código" });
    }
    res.status(500).json({ message: "Error al actualizar unidad de medida", detail: error.message });
  }
});

app.delete("/api/units-of-measure/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "No tiene permiso para eliminar unidades de medida" });
  }

  const { id } = req.params;

  try {
    await prisma.unitOfMeasure.delete({
      where: { id: parseInt(id) }
    });
    res.json({ message: "Unidad eliminada con éxito" });
  } catch (error: any) {
    res.status(500).json({ message: "Error al eliminar unidad de medida", detail: error.message });
  }
});

// Obtener todas las retenciones
app.get("/api/retentions", authenticateToken, async (req: any, res) => {
  try {
    const retentions = await prisma.retention.findMany({
      orderBy: { code: 'asc' }
    });
    res.json(retentions);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener retenciones", detail: error.message });
  }
});

// Obtener retenciones activas (para usar en formularios)
app.get("/api/retentions/active", authenticateToken, async (req: any, res) => {
  try {
    const retentions = await prisma.retention.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' }
    });
    res.json(retentions);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener retenciones activas", detail: error.message });
  }
});

// Crear una retención
app.post("/api/retentions", authenticateToken, async (req: any, res) => {
  const { code, name, percentage, description } = req.body;

  // Solo admins pueden crear retenciones
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "No tiene permiso para crear retenciones" });
  }

  try {
    const retention = await prisma.retention.create({
      data: { code, name, percentage, description }
    });
    res.status(201).json(retention);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ message: "Ya existe una retención con ese código" });
    } else {
      res.status(500).json({ message: "Error al crear retención", detail: error.message });
    }
  }
});

// Actualizar una retención
app.put("/api/retentions/:id", authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  const { code, name, percentage, description, isActive } = req.body;

  // Solo admins pueden actualizar retenciones
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "No tiene permiso para actualizar retenciones" });
  }

  try {
    const retention = await prisma.retention.update({
      where: { id: parseInt(id) },
      data: { code, name, percentage, description, isActive }
    });
    res.json(retention);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ message: "Ya existe una retención con ese código" });
    } else {
      res.status(500).json({ message: "Error al actualizar retención", detail: error.message });
    }
  }
});

// Eliminar una retención
app.delete("/api/retentions/:id", authenticateToken, async (req: any, res) => {
  const { id } = req.params;

  // Solo admins pueden eliminar retenciones
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "No tiene permiso para eliminar retenciones" });
  }

  try {
    await prisma.retention.delete({
      where: { id: parseInt(id) }
    });
    res.json({ message: "Retención eliminada con éxito" });
  } catch (error: any) {
    res.status(500).json({ message: "Error al eliminar retención", detail: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
