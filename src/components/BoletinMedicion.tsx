import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';

interface Transaction {
  ID: string;
  DocID: string;
  DocType: string;
  DocDate: string;
  Reference: string | null;
  Status: number;
  VendorName?: string;
  ProjectName?: string;
  TotalAmount: number;
}

interface TransactionItem {
  ID: string;
  TransID: string;
  ItemID: string;
  Name: string;
  OrderedQuantity: number;
  ReceivedQuantity: number;
  PaidQuantity: number;
  ReceptionNumbers?: string;
  Price: number;
  TaxAmount: number;
}

interface BoletinLine {
  externalItemID: string;
  description: string;
  receptionNumbers?: string;
  quantity: number;
  unitPrice: number;
  taxType: string;
  taxPercent: number;
  taxAmount: number;
  retentionPercent: number;
  retentionAmount: number;
  totalLine: number;
  selected?: boolean;
}

const formatCurrency = (num: number) => {
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const BoletinMedicion: React.FC = () => {
  const { user } = useAuth() || {};
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterSubcontratos, setFilterSubcontratos] = useState(false);

  // Boletin Logic State
  const [linesToPay, setLinesToPay] = useState<any[]>([]);
  const [retentionPercent, setRetentionPercent] = useState(5); // 5% por defecto
  const [advancePercent, setAdvancePercent] = useState(0);
  const [isrPercent, setIsrPercent] = useState(0); // Nueva: Retención ISR
  const [isSaving, setIsSaving] = useState(false);
  const [viewHistory, setViewHistory] = useState(false);
  const [savedBoletines, setSavedBoletines] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isNewTab, setIsNewTab] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Catálogo de retenciones
  const [availableRetentions, setAvailableRetentions] = useState<Array<{
    id: number;
    code: string;
    name: string;
    percentage: number;
    description: string | null;
    isActive: boolean;
  }>>([]);

  useEffect(() => {
    fetchTransactions();
    fetchBoletinHistory();
    fetchActiveRetentions();
    const params = new URLSearchParams(window.location.search);
    setIsNewTab(params.has('editBoletin') || params.has('generateBoletin') || params.has('boletinSelection'));
  }, [filterSubcontratos]);

  // Nuevo: Efecto para detectar edición o generación desde la URL (abre en nuevo tab)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('editBoletin');
    const genId = params.get('generateBoletin');
    
    if (editId && savedBoletines.length > 0) {
      const b = savedBoletines.find(x => x.id === Number(editId));
      if (b && editingId !== b.id) {
        handleEditBoletin(b);
      }
    } else if (genId && transactions.length > 0) {
      const tx = transactions.find(t => t.ID === genId);
      if (tx && (!selectedTx || selectedTx.ID !== tx.ID)) {
        handleSelectOC(tx);
      }
    }
  }, [savedBoletines, transactions]);

  useEffect(() => {
    if (editingId) {
      const b = savedBoletines.find(x => x.id === editingId);
      if (b) {
        document.title = `Editando ${b.docNumber}`;
      }
    } else if (selectedTx && isNewTab) {
      document.title = `Nuevo Boletín ${selectedTx.DocID}`;
    } else {
      document.title = "Sistema de Obra";
    }
  }, [editingId, savedBoletines, selectedTx, isNewTab]);

  const handleStatusChange = async (id: number, status: string) => {
    const action = status === 'APROBADO' ? 'aprobar' : 'rechazar';
    
    let rejectionReason = '';
    
    // Si es rechazo, capturar el motivo
    if (status === 'RECHAZADO') {
      rejectionReason = prompt('Ingrese el motivo del rechazo:')?.trim() || '';
      
      if (!rejectionReason) {
        alert('Debe proporcionar un motivo para el rechazo');
        return;
      }
    }
    
    if (!confirm(`¿Está seguro que desea ${action} este boletín?`)) return;

    try {
      const body: any = { status };
      if (status === 'RECHAZADO') {
        body.rejectionReason = rejectionReason;
      }
      
      const response = await fetch(`http://localhost:5000/api/payment-requests/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        alert(`Boletín ${status.toLowerCase()} con éxito`);
        fetchBoletinHistory();
      } else {
        const errData = await response.json();
        alert(`Error: ${errData.message || "No se pudo cambiar el estado"}`);
      }
    } catch {
      alert("Error de conexión al intentar cambiar el estado");
    }
  };

  const fetchBoletinHistory = async () => {
    try {
      console.log('📋 Cargando historial de boletines...');
      const response = await fetch('http://localhost:5000/api/payment-requests', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      console.log('📡 Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Boletines recibidos:', data);
        setSavedBoletines(data);
      } else {
        const error = await response.json();
        console.error('❌ Error en respuesta:', error);
      }
    } catch (error) {
      console.error('❌ Error al cargar boletines:', error);
    }
  };

  const fetchActiveRetentions = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/retentions/active', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableRetentions(data);
      }
    } catch (err) {
      console.error('Error cargando retenciones:', err);
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (!confirm("Hay cambios sin guardar. ¿Está seguro que desea cerrar sin guardar?")) {
        return;
      }
    }
    if (isNewTab) {
      window.close();
    } else {
      setSelectedTx(null);
      setEditingId(null);
      setHasUnsavedChanges(false);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      console.log('🔑 Fetching transactions with token:', token ? 'Present' : 'Missing');
      console.log('🔍 filterSubcontratos:', filterSubcontratos);
      
      const url = new URL('http://localhost:5000/api/admcloud/transactions');
      if (filterSubcontratos) {
        url.searchParams.append('departmentFilter', 'subcontratos');
        console.log('✅ Agregando filtro de Subcontratos a la URL');
      }
      
      console.log('📡 URL final:', url.toString());
      
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('📡 Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Transactions loaded:', data.length);
        if (filterSubcontratos) {
          console.log('🔍 Filtro Subcontratos ACTIVO - Documentos recibidos:', data.map((t: any) => t.DocID));
        }
        setTransactions(data);
        if (data.length === 0) {
          setError('No se encontraron órdenes de compra en AdmCloud');
        }
      } else {
        const errorData = await response.text();
        console.error('❌ Error response:', errorData);
        setError(`Error ${response.status}: ${errorData}`);
      }
    } catch (err) {
      console.error('❌ Fetch error:', err);
      setError('Error al conectar con el servidor. Verifica que el backend esté corriendo.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOC = async (tx: Transaction) => {
    setSelectedTx(tx);
    setItemsLoading(true);
    setLinesToPay([]); // Reset boolean/quantities
    setHasUnsavedChanges(false); // Nueva generación, sin cambios aún
    try {
      const response = await fetch(`http://localhost:5000/api/admcloud/transactions/${tx.ID}/items`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setItems(data);
        // Pre-poblar lineas con cantidad pendiente (Recibida - Ya solicitada en otros boletines)
        const initialLines = data.map((it: any) => {
          const available = it.ReceivedQuantity - it.PaidQuantity;
          // Extraer solo el último número de recepción si hay múltiples
          const allReceptions = it.ReceptionNumbers || '';
          const receptionArray = allReceptions.split(',').map((r: string) => r.trim()).filter((r: string) => r);
          const lastReception = receptionArray.length > 0 ? receptionArray[receptionArray.length - 1] : '';
          
          return {
            externalItemID: it.ItemID,
            description: it.Name,
            receptionNumbers: lastReception,
            quantity: available > 0 ? available : 0, 
            unitPrice: it.Price,
            taxType: 'ITBIS 18%',
            taxPercent: 18,
            taxAmount: 0,
            retentionPercent: 0,
            retentionAmount: 0,
            totalLine: 0,
            selected: false
          };
        });
        setLinesToPay(initialLines);
      }
    } catch {
      setError('Error al cargar ítems');
    } finally {
      setItemsLoading(false);
    }
  };

  const handleEditBoletin = async (boletin: any) => {
    setEditingId(boletin.id);
    setRetentionPercent(boletin.retentionPercent);
    setAdvancePercent(boletin.advancePercent);
    setIsrPercent(boletin.isrPercent);
    setHasUnsavedChanges(false); // Cargando datos guardados
    
    // Buscar la transacción original en el listado
    const tx = transactions.find(t => t.ID === boletin.externalTxID);
    if (tx) {
      setSelectedTx(tx);
    } else {
      // Si no está en el top 1000 cargado, creamos un objeto parcial
      setSelectedTx({
        ID: boletin.externalTxID,
        DocID: boletin.docID,
        DocType: 'PO',
        DocDate: '',
        Reference: '',
        Status: 0,
        VendorName: boletin.vendorName,
        ProjectName: boletin.projectName,
        TotalAmount: 0
      });
    }

    setItemsLoading(true);
    setViewHistory(false);
    try {
      const response = await fetch(`http://localhost:5000/api/admcloud/transactions/${boletin.externalTxID}/items`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const ocItems = await response.json();
        setItems(ocItems);
        
        // Mapear items de la OC, marcando seleccionados los que ya estaban en el boletín
        const initialLines = ocItems.map((it: TransactionItem) => {
          const existingLine = boletin.lines.find((l: any) => l.externalItemID === it.ItemID);
          const alreadyPaidByOthers = it.PaidQuantity - (existingLine ? existingLine.quantity : 0);
          const available = it.ReceivedQuantity - alreadyPaidByOthers;

          // Si hay una línea existente, usar su receptionNumbers, si no, extraer el último
          let receptionNum = '';
          if (existingLine) {
            receptionNum = existingLine.receptionNumbers;
          } else {
            const allReceptions = it.ReceptionNumbers || '';
            const receptionArray = allReceptions.split(',').map((r: string) => r.trim()).filter((r: string) => r);
            receptionNum = receptionArray.length > 0 ? receptionArray[receptionArray.length - 1] : '';
          }

          return {
            externalItemID: it.ItemID,
            description: it.Name,
            receptionNumbers: receptionNum,
            quantity: existingLine ? existingLine.quantity : (available > 0 ? available : 0),
            unitPrice: it.Price,
            taxType: existingLine ? existingLine.taxType : 'ITBIS 18%',
            taxPercent: existingLine ? existingLine.taxPercent : 18,
            taxAmount: existingLine ? existingLine.taxAmount : 0,
            retentionPercent: existingLine ? existingLine.retentionPercent : 0,
            retentionAmount: existingLine ? existingLine.retentionAmount : 0,
            totalLine: existingLine ? existingLine.totalLine : 0,
            selected: !!existingLine
          };
        });
        setLinesToPay(initialLines);
      }
    } catch {
      setError('Error al cargar datos para edición');
    } finally {
      setItemsLoading(false);
    }
  };

  const updateLine = (index: number, field: string, value: any) => {
    const newLines = [...linesToPay];
    if (field === 'taxType') {
      const percent = value === 'ITBIS 18%' ? 18 : 0;
      newLines[index] = { ...newLines[index], taxType: value, taxPercent: percent };
    } else {
      newLines[index] = { ...newLines[index], [field]: value };
    }
    setLinesToPay(newLines);
    setHasUnsavedChanges(true);
  };

  const calculateTotals = () => {
    const selected = linesToPay.filter(l => l.selected);
    let subTotal = 0;
    let totalTax = 0;
    let totalRetentionByLine = 0;

    selected.forEach(l => {
      const st = l.quantity * l.unitPrice;
      const tax = st * (l.taxPercent / 100);
      const retentionByLine = (st + tax) * ((l.retentionPercent || 0) / 100);
      
      subTotal += st;
      totalTax += tax;
      totalRetentionByLine += retentionByLine;
    });

    const retAmount = subTotal * (retentionPercent / 100);
    const advAmount = subTotal * (advancePercent / 100);
    const isrAmount = subTotal * (isrPercent / 100);
    const net = (subTotal + totalTax) - totalRetentionByLine - retAmount - advAmount - isrAmount;

    return { subTotal, totalTax, retAmount, advAmount, isrAmount, totalRetentionByLine, net };
  };

  const saveBoletin = async () => {
    const selectedLines = linesToPay.filter(l => l.selected);
    if (!selectedTx || selectedLines.length === 0) {
      alert("Seleccione al menos un ítem para pagar.");
      return;
    }

    // Recopilar números de recepción únicos de las líneas seleccionadas
    const selectedReceptionSet = new Set<string>();
    linesToPay.forEach((line) => {
      if (line.selected && line.receptionNumbers) {
        line.receptionNumbers.split(',').forEach((r: string) => {
          if (r.trim()) selectedReceptionSet.add(r.trim());
        });
      }
    });
    const receptionNumbers = Array.from(selectedReceptionSet).join(', ');

    // Validación de duplicidad/exceso
    for (let i = 0; i < linesToPay.length; i++) {
        const line = linesToPay[i];
        if (!line.selected) continue;

        const item = items[i];
        const existingInThisBoletin = editingId ? (savedBoletines.find(b => b.id === editingId)?.lines.find((l: any) => l.externalItemID === line.externalItemID)?.quantity || 0) : 0;
        const paidByOthers = (item?.PaidQuantity || 0) - existingInThisBoletin;
        const available = (item?.ReceivedQuantity || 0) - paidByOthers;

        if (line.quantity > (available + 0.0001)) {
            alert(`Error: La partida "${line.description}" excede la cantidad disponible para pago (Máximo disponible: ${available}).`);
            return;
        }
    }

    const totals = calculateTotals();
    if (totals.net <= 0) {
      alert("Error: El monto Neto a Pagar debe ser mayor a cero para poder guardar el boletín.");
      return;
    }

    setIsSaving(true);
    try {
      const url = editingId 
        ? `http://localhost:5000/api/payment-requests/${editingId}`
        : 'http://localhost:5000/api/payment-requests';
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          externalTxID: selectedTx.ID,
          docID: selectedTx.DocID,
          vendorName: selectedTx.VendorName,
          projectName: selectedTx.ProjectName,
          retentionPercent,
          advancePercent,
          isrPercent,
          receptionNumbers,
          lines: selectedLines
        })
      });

      if (response.ok) {
        alert(editingId ? "Boletín actualizado con éxito" : "Boletín generado con éxito");
        setHasUnsavedChanges(false);
        if (isNewTab) {
          window.close();
        } else {
          setSelectedTx(null);
          setLinesToPay([]);
          setEditingId(null);
          fetchBoletinHistory();
        }
      } else {
        const errorData = await response.json();
        alert(errorData.message || "Error al guardar boletín");
      }
    } catch {
      alert("Error de conexión");
    } finally {
      setIsSaving(false);
    }
  };

  const generatePDF = (boletin: any) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(40);
    doc.text("Boletín de Medición y Solicitud de Pago", 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`N° Boletín: ${boletin.docNumber}`, 14, 32);
    doc.text(`Fecha: ${new Date(boletin.date).toLocaleDateString('es-ES')}`, 14, 38);
    doc.text(`OC Referencia: ${boletin.docID}`, 14, 44);
    doc.text(`Proveedor: ${boletin.vendorName}`, 14, 50);
    doc.text(`Proyecto: ${boletin.projectName || 'General'}`, 14, 56);
    
    let currentHeaderY = 62;
    
    if (boletin.receptionNumbers) {
      doc.text(`Recepciones: ${boletin.receptionNumbers}`, 14, currentHeaderY);
      currentHeaderY += 6;
    }
    
    // Mostrar estado y motivo de rechazo si aplica
    if (boletin.status === 'RECHAZADO' && boletin.rejectionReason) {
      doc.setFontSize(10);
      doc.setTextColor(211, 47, 47); // Color rojo
      doc.text(`ESTADO: RECHAZADO`, 14, currentHeaderY);
      currentHeaderY += 6;
      
      // Dividir el motivo en múltiples líneas si es muy largo
      const maxWidth = 180;
      const reasonLines = doc.splitTextToSize(`Motivo: ${boletin.rejectionReason}`, maxWidth);
      doc.text(reasonLines, 14, currentHeaderY);
      currentHeaderY += (reasonLines.length * 5);
      
      doc.setTextColor(100); // Restaurar color
    }

    const tableColumn = ["Descripción", "Recepción", "Cantidad", "Precio Unit.", "ITBIS", "Total"];
    const tableRows = (boletin.lines || []).map((l: any, idx: number) => {
      // Intentar vincular la recepción si estamos en modo generación/edición activa
      // O si el objeto boletin ya trae la información de recepciones por línea
      return [
        l.description,
        l.receptionNumbers || "", // Este campo vendrá de la DB si lo agregamos o del mapeo actual
        l.quantity,
        `$${formatCurrency(l.unitPrice)}`,
        `$${formatCurrency(l.taxAmount || 0)}`,
        `$${formatCurrency(l.totalLine || 0)}`
      ];
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: currentHeaderY,
      theme: 'grid',
      headStyles: { 
        fillColor: [255, 255, 255], 
        textColor: [0, 0, 0],
        lineWidth: 0.1,
        lineColor: [0, 0, 0]
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(10);
    doc.setTextColor(0);
    const labelX = 120;
    const valueX = 195;
    
    doc.text(`Subtotal:`, labelX, finalY);
    doc.text(`$${formatCurrency(boletin.subTotal)}`, valueX, finalY, { align: 'right' });
    
    doc.text(`ITBIS:`, labelX, finalY + 6);
    doc.text(`$${formatCurrency(boletin.taxAmount)}`, valueX, finalY + 6, { align: 'right' });
    
    let currentY = finalY + 12;

    if (boletin.retentionAmount > 0) {
      doc.text(`Fondo Reparo (${boletin.retentionPercent}%):`, labelX, currentY);
      doc.text(`-$${formatCurrency(boletin.retentionAmount)}`, valueX, currentY, { align: 'right' });
      currentY += 6;
    }
    
    if (boletin.advanceAmount > 0) {
      doc.text(`Amort. Anticipo (${boletin.advancePercent}%):`, labelX, currentY);
      doc.text(`-$${formatCurrency(boletin.advanceAmount)}`, valueX, currentY, { align: 'right' });
      currentY += 6;
    }

    if (boletin.isrAmount > 0) {
      doc.text(`Retención ISR (${boletin.isrPercent}%):`, labelX, currentY);
      doc.text(`-$${formatCurrency(boletin.isrAmount)}`, valueX, currentY, { align: 'right' });
      currentY += 6;
    }
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`NETO A PAGAR:`, labelX, currentY + 4);
    doc.text(`$${formatCurrency(boletin.netTotal)}`, valueX, currentY + 4, { align: 'right' });

    // Open in new tab instead of download
    const string = doc.output('bloburl');
    window.open(string, '_blank');
  };

  const totals = calculateTotals();

  // Filtrar y Agrupar transacciones por proyecto
  const filteredTxs = transactions.filter(tx => {
    const matchesSearch = tx.DocID.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.VendorName && tx.VendorName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (tx.ProjectName && tx.ProjectName.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Filtro por fecha
    const txDate = new Date(tx.DocDate).setHours(0,0,0,0);
    const startObj = startDate ? new Date(startDate).setHours(0,0,0,0) : null;
    const endObj = endDate ? new Date(endDate).setHours(0,0,0,0) : null;

    const matchesDate = (!startObj || txDate >= startObj) && (!endObj || txDate <= endObj);

    return matchesSearch && matchesDate;
  });

  const groupedTransactions = filteredTxs.reduce((acc, tx) => {
    const projectName = tx.ProjectName || 'General / Sin Proyecto';
    if (!acc[projectName]) acc[projectName] = [];
    acc[projectName].push(tx);
    return acc;
  }, {} as Record<string, Transaction[]>);

  return (
    <div className="boletin-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '10px 0' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: '700', color: '#1976d2' }}>Boletín de Medición y Solicitud de Pago</h2>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '0.95rem' }}>Gestión de cubicaciones y solicitudes de pago</p>
        </div>
        {!isNewTab && (
          <button className="btn-small" onClick={() => setViewHistory(!viewHistory)}>
            {viewHistory ? 'Volver al Formulario' : 'Ver Historial de Boletines'}
          </button>
        )}
      </div>

      {viewHistory && !isNewTab ? (
        <div className="card history-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
            <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#1976d2' }}>Historial de Boletines Generados</h2>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', fontSize: '0.95rem' }}>
              <span style={{ color: '#666', fontWeight: '500' }}>
                Total: <strong style={{ color: '#1976d2', fontSize: '1.1rem' }}>{savedBoletines.length}</strong>
              </span>
              <span style={{ color: '#666', fontWeight: '500' }}>
                Aprobados: <strong style={{ color: '#28a745', fontSize: '1.1rem' }}>{savedBoletines.filter(b => b.status === 'APROBADO').length}</strong>
              </span>
              <span style={{ color: '#666', fontWeight: '500' }}>
                Rechazados: <strong style={{ color: '#dc3545', fontSize: '1.1rem' }}>{savedBoletines.filter(b => b.status === 'RECHAZADO').length}</strong>
              </span>
              <button 
                onClick={() => fetchBoletinHistory()} 
                style={{ 
                  padding: '8px 16px', 
                  backgroundColor: '#2196F3', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                🔄 Recargar
              </button>
            </div>
          </div>
          {savedBoletines.length === 0 ? (
            <div style={{ 
              padding: '40px', 
              textAlign: 'center', 
              color: '#999',
              backgroundColor: '#f9f9f9',
              borderRadius: '8px',
              fontSize: '1.1rem'
            }}>
              <p style={{ fontSize: '3rem', margin: '0 0 15px 0' }}>📋</p>
              <p style={{ margin: 0, fontWeight: '500' }}>No hay boletines registrados</p>
              <p style={{ margin: '10px 0 0 0', fontSize: '0.9rem' }}>Crea tu primer boletín seleccionando una Orden de Compra</p>
            </div>
          ) : (
          <div className="table-responsive">
            <table className="data-table history-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '160px', width: '10%' }}>N° BOLETÍN</th>
                  <th style={{ minWidth: '110px', width: '8%' }}>FECHA</th>
                  <th style={{ minWidth: '200px', width: '18%' }}>PROYECTO</th>
                  <th style={{ minWidth: '140px', width: '10%' }}>REF (OC / REC)</th>
                  <th style={{ minWidth: '180px', width: '15%' }}>PROVEEDOR</th>
                  <th style={{ minWidth: '140px', width: '10%', textAlign: 'right' }}>NETO PAGADO</th>
                  <th style={{ minWidth: '120px', width: '8%', textAlign: 'center' }}>ESTADO</th>
                  <th style={{ minWidth: '280px', width: '21%', textAlign: 'center' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {savedBoletines.map(b => (
                  <tr key={b.id}>
                    <td><strong style={{ fontSize: '1rem', color: '#1976d2' }}>{b.docNumber}</strong></td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.95rem' }}>{new Date(b.date).toLocaleDateString('es-ES')}</td>
                    <td>
                      <div className="project-cell-large" title={b.projectName}>
                        {b.projectName || 'General'}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#333' }}>{b.docID}</div>
                      {b.receptionNumbers && (
                        <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '3px' }}>Rec: {b.receptionNumbers}</div>
                      )}
                    </td>
                    <td>
                      <div className="vendor-cell-large" title={b.vendorName}>
                        {b.vendorName}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1rem', color: '#28a745' }}>${formatCurrency(b.netTotal)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`status-badge-large status-${b.status.toLowerCase()}`}>
                        {b.status}
                      </span>
                      {b.status === 'RECHAZADO' && b.rejectionReason && (
                        <div style={{ 
                          marginTop: '8px', 
                          fontSize: '0.85rem', 
                          color: '#d32f2f', 
                          backgroundColor: '#ffebee', 
                          padding: '6px 10px', 
                          borderRadius: '4px',
                          border: '1px solid #ffcdd2',
                          textAlign: 'left'
                        }}>
                          <strong>Motivo:</strong> {b.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons-container-large">
                        <button className="btn-action-large btn-pdf" onClick={() => generatePDF(b)}>
                          <span>📄</span> PDF
                        </button>
                        {b.status === "PENDIENTE" && (
                          <>
                            <button className="btn-action-large btn-edit" onClick={() => window.open(`/?editBoletin=${b.id}`, '_blank')}>
                              <span>✏️</span> Editar
                            </button>
                            {(user?.role === 'admin' || user?.accessContabilidad) && (
                              <div className="approval-group-large">
                                <button className="btn-action-large btn-approve" onClick={() => handleStatusChange(b.id, 'APROBADO')}>
                                  <span>✓</span> Aprobar
                                </button>
                                <button className="btn-action-large btn-reject" onClick={() => handleStatusChange(b.id, 'RECHAZADO')}>
                                  <span>✕</span> Rechazar
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          
          {/* Botón flotante para cerrar en nueva pestaña */}
          {isNewTab && (
            <button 
              className="floating-close-btn"
              onClick={handleClose}
              title="Cerrar ventana"
            >
              ✕
            </button>
          )}
        </div>
      ) : !selectedTx ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#1976d2' }}>Seleccione una Orden de Compra (AdmCloud)</h3>
            <div className="filter-group" style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.9rem', color: '#666', fontWeight: '500' }}>Desde:</span>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.9rem', color: '#666', fontWeight: '500' }}>Hasta:</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }}
                />
              </div>
              <div className="search-box" style={{ width: '350px' }}>
                <input 
                  type="text" 
                  placeholder="Buscar OC, Proveedor o Proyecto..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ width: '100%', padding: '10px 18px', borderRadius: '25px', border: '1px solid #ddd', outline: 'none', fontSize: '0.95rem' }}
                />
              </div>
              {user?.accessSubcontratos && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: filterSubcontratos ? '#fff3e0' : '#f5f5f5', padding: '8px 15px', borderRadius: '6px', border: filterSubcontratos ? '1px solid #fb8c00' : '1px solid #ddd', fontSize: '0.9rem', fontWeight: '500' }}>
                  <input 
                    type="checkbox" 
                    checked={filterSubcontratos}
                    onChange={(e) => setFilterSubcontratos(e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  <span>🔍 Solo Subcontratos</span>
                </label>
              )}
              <button 
                onClick={() => { setSearchTerm(''); setStartDate(''); setEndDate(''); setFilterSubcontratos(false); }}
                style={{ background: '#eee', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                Limpiar
              </button>
            </div>
          </div>

          {/* Indicador de filtro activo */}
          {filterSubcontratos && user?.accessSubcontratos && (
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px 18px', 
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.9rem',
              background: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
              border: '1px solid #fb8c00',
              color: '#333'
            }}>
              <span style={{ fontSize: '1.2rem' }}>🔍</span>
              <div>
                <strong>Filtro Activo: </strong>
                Mostrando únicamente órdenes del departamento de Subcontratos
              </div>
            </div>
          )}

          {error && (
            <div style={{ 
              background: '#f8d7da', 
              border: '1px solid #f5c6cb', 
              color: '#721c24', 
              padding: '15px', 
              borderRadius: '6px', 
              marginTop: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '1.5rem' }}>⚠️</span>
              <div>
                <strong>Error:</strong> {error}
                <br />
                <small>Abre la consola del navegador (F12) para más detalles</small>
              </div>
            </div>
          )}

          {loading ? <div className="loading-spinner">Cargando órdenes de compra de AdmCloud...</div> : (
            <div className="table-responsive">
              {Object.keys(groupedTransactions).length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px', 
                  background: '#f8f9fa', 
                  borderRadius: '8px',
                  color: '#666'
                }}>
                  <span style={{ fontSize: '3rem' }}>📦</span>
                  <h3>No hay órdenes de compra</h3>
                  <p>No se encontraron órdenes que coincidan con los filtros aplicados</p>
                </div>
              ) : (
              <>
              {Object.entries(groupedTransactions).map(([projectName, txs]) => (
                <div key={projectName} style={{ marginBottom: '40px' }}>
                  <h4 style={{ 
                    background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)', 
                    padding: '16px 24px', 
                    borderRadius: '10px', 
                    borderLeft: '5px solid #1976d2',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                    marginBottom: '15px'
                  }}>
                    <span style={{ fontSize: '1.1rem' }}>Proyecto: <strong>{projectName}</strong></span>
                    <span style={{ fontSize: '0.9rem', background: '#e3f2fd', color: '#1976d2', padding: '6px 16px', borderRadius: '20px', fontWeight: 'bold' }}>
                      {txs.length} {txs.length === 1 ? 'Orden' : 'Órdenes'}
                    </span>
                  </h4>
                  <table className="data-table oc-table">
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>DOC ID</th>
                        <th style={{ width: '35%' }}>PROVEEDOR</th>
                        <th style={{ width: '15%' }}>FECHA OC</th>
                        <th style={{ width: '20%', textAlign: 'right' }}>TOTAL OC</th>
                        <th style={{ width: '15%', textAlign: 'center' }}>ACCIÓN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txs.map(tx => (
                        <tr key={tx.ID}>
                          <td style={{ fontWeight: '600', color: '#1976d2' }}>{tx.DocID}</td>
                          <td>{tx.VendorName}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{new Date(tx.DocDate).toLocaleDateString('es-ES')}</td>
                          <td style={{ textAlign: 'right', fontWeight: '600', color: '#28a745' }}>${formatCurrency(tx.TotalAmount)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="btn-small" onClick={() => window.open(`/?generateBoletin=${tx.ID}`, '_blank')}>Seleccionar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              
              {/* Total General de Órdenes */}
              {filteredTxs.length > 0 && (
                <div style={{ 
                  marginTop: '30px', 
                  padding: '20px 30px', 
                  background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                  borderRadius: '12px',
                  border: '2px solid #1976d2',
                  boxShadow: '0 4px 12px rgba(25,118,210,0.15)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#0d47a1' }}>
                        📊 Resumen Total de Órdenes
                      </h4>
                      <p style={{ margin: 0, color: '#1565c0', fontSize: '0.9rem' }}>
                        {filteredTxs.length} {filteredTxs.length === 1 ? 'orden generada' : 'órdenes generadas'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.85rem', color: '#1565c0', marginBottom: '5px' }}>
                        Monto Total Acumulado
                      </div>
                      <div style={{ 
                        fontSize: '2rem', 
                        fontWeight: '700', 
                        color: '#0d47a1',
                        letterSpacing: '-0.5px'
                      }}>
                        ${formatCurrency(filteredTxs.reduce((sum, tx) => sum + tx.TotalAmount, 0))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </>
              )}
            </div>
          )}
          
          {/* Botón flotante para cerrar en nueva pestaña */}
          {isNewTab && (
            <button 
              className="floating-close-btn"
              onClick={() => window.close()}
              title="Cerrar ventana"
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        <div className="boletin-form">
          <div className="header-info card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{editingId ? `Editando Boletín: ${savedBoletines.find(b=>b.id===editingId)?.docNumber}` : `Generando Boletín para: ${selectedTx.DocID}`}</h3>
              <button className="btn-small" onClick={handleClose}>
                {isNewTab ? 'Cerrar Ventana' : 'Cancelar'}
              </button>
            </div>
            <p><strong>Proveedor:</strong> {selectedTx.VendorName}</p>
            <p><strong>Proyecto:</strong> {selectedTx.ProjectName || 'General'}</p>
            {(() => {
              const selectedReceptionSet = new Set<string>();
              linesToPay.forEach((line) => {
                if (line.selected && line.receptionNumbers) {
                  line.receptionNumbers.split(',').forEach((r: string) => {
                    if (r.trim()) selectedReceptionSet.add(r.trim());
                  });
                }
              });
              const receptionNumbers = Array.from(selectedReceptionSet).join(', ');
              return receptionNumbers ? <p><strong>Recepciones Incluidas:</strong> {receptionNumbers}</p> : null;
            })()}
          </div>

          <div className="card" style={{ marginTop: '20px' }}>
            <h4>Detalle de Partidas a Cubicar/Pagar</h4>
            {itemsLoading ? <p>Cargando ítems...</p> : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sel.</th>
                    <th>Descripción</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Contratado</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Anterior</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Disponible</th>
                    <th style={{ width: '100px', textAlign: 'center' }}>Cant. a Pagar</th>
                    <th style={{ width: '140px' }}>Recepción</th>
                    <th>Precio Unit.</th>
                    <th>Impuesto</th>
                    <th style={{ width: '180px' }}>Retención</th>
                    <th style={{ textAlign: 'right', width: '100px' }}>Retenido</th>
                    <th style={{ textAlign: 'right', width: '110px' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {linesToPay.map((line, idx) => {
                    const item = items[idx];
                    const existingInThisBoletin = editingId ? (savedBoletines.find(b => b.id === editingId)?.lines.find((l: any) => l.externalItemID === line.externalItemID)?.quantity || 0) : 0;
                    const paidByOthers = (item?.PaidQuantity || 0) - existingInThisBoletin;
                    const available = (item?.ReceivedQuantity || 0) - paidByOthers;
                    const isOverpaid = line.quantity > (available + 0.0001); // Margen por flotantes

                    return (
                      <tr key={idx} style={{ backgroundColor: isOverpaid ? '#fff5f5' : 'inherit' }}>
                        <td>
                          <input 
                            type="checkbox" 
                            checked={line.selected} 
                            onChange={(e) => updateLine(idx, 'selected', e.target.checked)}
                          />
                        </td>
                        <td>{line.description}</td>
                        <td style={{ textAlign: 'center' }}>{item?.ReceivedQuantity}</td>
                        <td style={{ textAlign: 'center', color: '#666' }}>{paidByOthers}</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: available > 0 ? '#28a745' : '#d32f2f' }}>
                          {available}
                        </td>
                        <td>
                          <input 
                            type="number" 
                            value={line.quantity}
                            onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))}
                            style={{ 
                              width: '80px', 
                              borderColor: isOverpaid ? '#d32f2f' : '#ddd',
                              backgroundColor: isOverpaid ? '#f5f5f5' : '#f9f9f9',
                              cursor: 'not-allowed'
                            }}
                            disabled={!line.selected}
                            readOnly
                            max={available}
                          />
                          {isOverpaid && <div style={{ color: '#d32f2f', fontSize: '0.7rem', marginTop: '2px' }}>Excede disponible</div>}
                        </td>
                        <td>
                          <input 
                            type="text" 
                            value={line.receptionNumbers || ''}
                            onChange={(e) => updateLine(idx, 'receptionNumbers', e.target.value)}
                            placeholder="Ej: ICI-RIN00001"
                            style={{ 
                              width: '130px',
                              fontSize: '0.85rem',
                              padding: '4px 6px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              backgroundColor: line.selected ? '#fff' : '#f5f5f5'
                            }}
                            disabled={!line.selected}
                          />
                        </td>
                        <td>${formatCurrency(line.unitPrice)}</td>
                      <td>
                        <select 
                          value={line.taxType} 
                          onChange={(e) => updateLine(idx, 'taxType', e.target.value)}
                          disabled={!line.selected}
                        >
                          <option value="ITBIS 18%">ITBIS 18%</option>
                          <option value="Exento 0%">Exento 0%</option>
                        </select>
                      </td>
                      <td>
                        <select 
                          value={line.retentionPercent || 0}
                          onChange={(e) => updateLine(idx, 'retentionPercent', Number(e.target.value))}
                          disabled={!line.selected}
                          style={{ 
                            width: '100%',
                            fontSize: '0.8rem',
                            padding: '5px 8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            backgroundColor: line.selected ? '#fff' : '#f5f5f5',
                            cursor: line.selected ? 'pointer' : 'not-allowed'
                          }}
                        >
                          <option value={0}>Sin retención (0%)</option>
                          {availableRetentions.map(ret => (
                            <option key={ret.id} value={ret.percentage}>
                              {ret.name} - {ret.percentage}%
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ textAlign: 'right', color: '#d32f2f', fontWeight: '500' }}>
                        -${formatCurrency((line.quantity * line.unitPrice * (1 + line.taxPercent / 100)) * ((line.retentionPercent || 0) / 100))}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                        ${formatCurrency((line.quantity * line.unitPrice * (1 + line.taxPercent / 100)) * (1 - (line.retentionPercent || 0) / 100))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            )}
          </div>

          <div className="totals-section card" style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
            <div className="retentions-panel">
              <h4>Retenciones y Deducciones</h4>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Fondo de Reparo (5% habitual)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="number" 
                    value={retentionPercent} 
                    onChange={(e) => {
                      setRetentionPercent(Number(e.target.value));
                      setHasUnsavedChanges(true);
                    }}
                    style={{ width: '80px' }}
                  /> %
                  <span className="amount-preview">-${formatCurrency(totals.retAmount)}</span>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Amortización de Anticipo (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="number" 
                    value={advancePercent} 
                    onChange={(e) => {
                      setAdvancePercent(Number(e.target.value));
                      setHasUnsavedChanges(true);
                    }}
                    style={{ width: '80px' }}
                  /> %
                  <span className="amount-preview">-${formatCurrency(totals.advAmount)}</span>
                </div>
              </div>
              <div className="form-group">
                <label>Retención ISR (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="number" 
                    value={isrPercent} 
                    onChange={(e) => {
                      setIsrPercent(Number(e.target.value));
                      setHasUnsavedChanges(true);
                    }}
                    style={{ width: '80px' }}
                  /> %
                  <span className="amount-preview">-${formatCurrency(totals.isrAmount)}</span>
                </div>
              </div>
            </div>

            <div className="summary-panel" style={{ textAlign: 'right' }}>
              <h4>Resumen Económico</h4>
              <p>Subtotal: <strong>${formatCurrency(totals.subTotal)}</strong></p>
              <p>ITBIS: <strong>${formatCurrency(totals.totalTax)}</strong></p>
              <p>Total Bruto: <strong>${formatCurrency(totals.subTotal + totals.totalTax)}</strong></p>
              <hr />
              {totals.totalRetentionByLine > 0 && (
                <p style={{ color: '#d32f2f' }}>Retenciones por Línea: <strong>-${formatCurrency(totals.totalRetentionByLine)}</strong></p>
              )}
              <p style={{ fontSize: '1.2rem', color: '#1976d2' }}>
                Neto a Pagar: <strong>${formatCurrency(totals.net)}</strong>
              </p>
              <button 
                className="btn-primary" 
                style={{ marginTop: '10px', width: '100%', padding: '15px' }}
                disabled={isSaving || linesToPay.filter(l=>l.selected).length === 0}
                onClick={saveBoletin}
              >
                {isSaving ? 'Guardando...' : (editingId ? 'Actualizar Boletín' : 'Generar Solicitud de Pago')}
              </button>
            </div>
          </div>
          
          {/* Botón flotante para cerrar en nueva pestaña */}
          {isNewTab && (
            <button 
              className="floating-close-btn"
              onClick={handleClose}
              title="Cerrar ventana"
            >
              ✕
            </button>
          )}
        </div>
      )}

      <style>{`
        .boletin-container { padding: 15px; max-width: 100%; margin: 0 auto; width: 100%; }
        .card { background: white; padding: 24px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
        
        /* Botón flotante de cierre */
        .floating-close-btn {
          position: fixed;
          bottom: 30px;
          right: 30px;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
          color: white;
          border: none;
          font-size: 24px;
          font-weight: bold;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(220, 53, 69, 0.4);
          transition: all 0.3s ease;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .floating-close-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(220, 53, 69, 0.6);
          background: linear-gradient(135deg, #c82333 0%, #bd2130 100%);
        }
        
        .floating-close-btn:active {
          transform: scale(0.95);
        }
        .history-card { width: 100%; overflow-x: auto; padding: 30px; }
        .table-responsive { width: 100%; overflow-x: auto; margin-top: 20px; }
        .data-table { width: 100%; border-collapse: collapse; min-width: 1200px; font-size: 0.95rem; }
        
        /* Optimización para pantallas 24" */
        @media (min-width: 1600px) {
          .boletin-container { padding: 20px 30px; }
          .data-table { font-size: 1rem; }
        }
        .data-table th { background: #f8f9fa; color: #333; font-weight: 600; text-transform: uppercase; font-size: 0.85rem; }
        .data-table th, .data-table td { padding: 12px 15px; border-bottom: 1px solid #eee; text-align: left; }
        
        /* Estilos optimizados para tabla de historial en pantallas grandes */
        .history-table thead th { 
          background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%); 
          color: white; 
          font-weight: 700; 
          text-transform: uppercase; 
          font-size: 0.8rem;
          letter-spacing: 0.5px;
          padding: 14px 16px;
          position: sticky;
          top: 0;
          z-index: 10;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .history-table tbody td { 
          padding: 14px 16px; 
          font-size: 0.95rem;
          border-bottom: 1px solid #e8e8e8;
        }
        
        /* Estilos para tabla de órdenes de compra */
        .oc-table thead th {
          background: #f8f9fa;
          color: #333;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 0.8rem;
          padding: 14px 16px;
          border-bottom: 2px solid #1976d2;
        }
        
        .oc-table tbody td {
          padding: 14px 16px;
          font-size: 0.95rem;
        }
        
        .oc-table tbody tr:hover {
          background-color: #f8f9ff;
          box-shadow: 0 2px 4px rgba(25, 118, 210, 0.08);
        }
        
        @media (min-width: 1920px) {
          .history-table thead th {
            font-size: 0.85rem;
            padding: 16px 20px;
          }
          .history-table tbody td {
            padding: 16px 20px;
            font-size: 1rem;
          }
          .oc-table thead th {
            font-size: 0.85rem;
            padding: 16px 20px;
          }
          .oc-table tbody td {
            padding: 16px 20px;
            font-size: 1rem;
          }
        }
        
        .history-table tbody tr { 
          transition: all 0.2s ease;
        }
        
        .history-table tbody tr:hover { 
          background-color: #f8f9ff;
          box-shadow: 0 2px 8px rgba(25, 118, 210, 0.1);
        }
        
        .project-cell, .vendor-cell { 
          max-width: 280px; 
          overflow: hidden; 
          text-overflow: ellipsis; 
          white-space: nowrap; 
          font-size: 0.9rem;
        }
        
        .project-cell-large, .vendor-cell-large { 
          max-width: 400px; 
          overflow: hidden; 
          text-overflow: ellipsis; 
          white-space: nowrap; 
          font-size: 0.95rem;
          font-weight: 500;
          color: #333;
        }
        
        @media (min-width: 1920px) {
          .project-cell-large, .vendor-cell-large {
            max-width: 500px;
            font-size: 1rem;
          }
        }

        .action-buttons-container { display: flex; gap: 8px; align-items: center; justify-content: center; }
        .action-buttons-container-large { 
          display: flex; 
          gap: 10px; 
          align-items: center; 
          justify-content: center;
          flex-wrap: wrap;
        }
        
        .approval-group { display: flex; gap: 5px; border-left: 1px solid #ddd; padding-left: 8px; }
        .approval-group-large { 
          display: flex; 
          gap: 8px; 
          border-left: 2px solid #e0e0e0; 
          padding-left: 10px; 
          margin-left: 4px;
        }
        
        .btn-action { 
          padding: 6px 12px; 
          border: none; 
          border-radius: 4px; 
          cursor: pointer; 
          font-weight: 600; 
          font-size: 0.8rem;
          transition: all 0.2s ease;
        }
        
        .btn-action-large { 
          padding: 8px 16px; 
          border: none; 
          border-radius: 6px; 
          cursor: pointer; 
          font-weight: 600; 
          font-size: 0.85rem;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }
        
        .btn-action-large span {
          font-size: 1rem;
        }
        
        .btn-pdf { background: #6c757d; color: white; }
        .btn-edit { background: #f0ad4e; color: white; }
        .btn-approve { background: #28a745; color: white; }
        .btn-reject { background: #d9534f; color: white; }
        
        .btn-action:hover { opacity: 0.85; transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .btn-action-large:hover { 
          transform: translateY(-2px); 
          box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
        }
        
        .btn-action-large:active { 
          transform: translateY(0); 
        }

        .btn-small { 
          padding: 8px 16px; 
          cursor: pointer; 
          background: #1976d2; 
          color: white; 
          border: none; 
          border-radius: 6px; 
          font-weight: 600; 
          font-size: 0.9rem;
          transition: all 0.2s ease;
        }
        
        .btn-small:hover {
          background: #1565c0;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(25, 118, 210, 0.3);
        }
        
        .btn-primary { background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
        .amount-preview { color: #d32f2f; font-weight: bold; font-size: 0.9rem; }
        
        .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
        .status-badge-large { 
          padding: 8px 16px; 
          border-radius: 25px; 
          font-size: 0.8rem; 
          font-weight: 700; 
          text-transform: uppercase;
          display: inline-block;
          min-width: 100px;
          text-align: center;
        }
        
        .status-pendiente { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
        .status-aprobado { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .status-rechazado { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        input[type="number"], select { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        
        /* Asegurar texto visible en todas las tablas */
        .boletin-container * {
          color: inherit;
        }
        
        .data-table td {
          color: #333 !important;
          font-size: 0.95rem;
        }
        
        .data-table tbody td {
          background-color: white;
        }
        
        .data-table tbody tr:hover td {
          background-color: #f8f9ff;
        }
        
        h2, h3, h4 {
          color: #1a1a1a;
        }
        
        button {
          color: inherit;
        }
        
        .loading-spinner {
          text-align: center;
          padding: 40px;
          font-size: 1.1rem;
          color: #1976d2;
        }
      `}</style>
    </div>
  );
};
