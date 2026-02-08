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
            r.[FullName] as VendorName,
            p.[Name] as ProjectName
        FROM [dbo].[SA_Transactions] t
        LEFT JOIN [dbo].[SA_Relationships] r ON t.[RelationshipID] = r.[ID]
        LEFT JOIN [dbo].[PA_Projects] p ON t.[ProjectID] = p.[ID]
        WHERE t.[SubsidiaryID] = 'FBC6AADF-8B12-47F7-AA18-08DDDFE6F02E'
          AND t.[DocType] = 'PO'
        ORDER BY p.[Name] ASC, t.[DocDate] DESC, t.[DocID] DESC
    `;
    const result = await pool.request().query(query);
    res.json(result.recordset);
  } catch (error) {
    console.error("Error fetching AdmCloud transactions:", error);
    res.status(500).json({ message: "Error al consultar AdmCloud" });
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
      
      return {
        ...it,
        ReceptionNumbers: receptions,
        PaidQuantity: paidObj?._sum?.quantity || 0
      };
    });

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

app.post("/api/payment-requests", authenticateToken, async (req, res) => {
  const { 
    externalTxID, docID, vendorName, projectName, 
    lines, retentionPercent, advancePercent, isrPercent,
    receptionNumbers 
  } = req.body;

  try {
    const count = await prisma.paymentRequest.count();
    const docNumber = `BM-${(count + 1).toString().padStart(6, '0')}`;

    let subTotal = 0;
    let taxAmount = 0;

    const formattedLines = lines.map((l: any) => {
      const lineTax = l.quantity * l.unitPrice * (l.taxPercent / 100);
      const lineTotal = (l.quantity * l.unitPrice) + lineTax;
      subTotal += (l.quantity * l.unitPrice);
      taxAmount += lineTax;
      return {
        externalItemID: l.externalItemID,
        description: l.description,
        receptionNumbers: l.receptionNumbers,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxType: l.taxType,
        taxPercent: l.taxPercent,
        taxAmount: lineTax,
        totalLine: lineTotal
      };
    });

    const retentionAmount = subTotal * (retentionPercent / 100);
    const advanceAmount = subTotal * (advancePercent / 100);
    const isrAmount = subTotal * (isrPercent / 100);
    const netTotal = (subTotal + taxAmount) - retentionAmount - advanceAmount - isrAmount;

    const pr = await prisma.paymentRequest.create({
      data: {
        docNumber,
        externalTxID,
        docID,
        vendorName,
        projectName,
        receptionNumbers,
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
      include: { lines: true }
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
    receptionNumbers 
  } = req.body;

  try {
    const prId = parseInt(id);
    const existingPR = await prisma.paymentRequest.findUnique({
      where: { id: prId },
      include: { lines: true }
    });

    if (!existingPR) return res.status(404).json({ message: "Boletín no encontrado" });
    if (existingPR.status !== "PENDIENTE") {
      return res.status(400).json({ message: "Solo se pueden modificar boletines en estado PENDIENTE" });
    }

    let subTotal = 0;
    let taxAmount = 0;

    const formattedLines = lines.map((l: any) => {
      const lineTax = l.quantity * l.unitPrice * (l.taxPercent / 100);
      const lineTotal = (l.quantity * l.unitPrice) + lineTax;
      subTotal += (l.quantity * l.unitPrice);
      taxAmount += lineTax;
      return {
        externalItemID: l.externalItemID,
        description: l.description,
        receptionNumbers: l.receptionNumbers,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxType: l.taxType,
        taxPercent: l.taxPercent,
        taxAmount: lineTax,
        totalLine: lineTotal
      };
    });

    const retentionAmount = subTotal * (retentionPercent / 100);
    const advanceAmount = subTotal * (advancePercent / 100);
    const isrAmount = subTotal * (isrPercent / 100);
    const netTotal = (subTotal + taxAmount) - retentionAmount - advanceAmount - isrAmount;

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
  const { status } = req.body; // PENDIENTE, APROBADO, RECHAZADO

  try {
    const prId = parseInt(id);
    if (isNaN(prId)) {
      return res.status(400).json({ message: "ID de boletín inválido" });
    }
    
    // Solo admins o gente de contabilidad puede aprobar
    if (req.user.role !== 'admin' && !req.user.accessContabilidad) {
      return res.status(403).json({ message: "No tiene permiso para aprobar/rechazar boletines" });
    }

    const updatedPR = await prisma.paymentRequest.update({
      where: { id: prId },
      data: { status }
    });

    console.log(`[BOLETIN] ID ${id} cambiado a estado: ${status} por ${req.user.email}`);
    res.json(updatedPR);
  } catch (error: any) {
    console.error("Error en PATCH status:", error);
    res.status(500).json({ 
      message: "Error al cambiar el estado del boletín",
      detail: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
