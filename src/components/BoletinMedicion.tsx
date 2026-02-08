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
  totalLine: number;
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

  useEffect(() => {
    fetchTransactions();
    fetchBoletinHistory();
    const params = new URLSearchParams(window.location.search);
    setIsNewTab(params.has('editBoletin') || params.has('generateBoletin'));
  }, []);

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
    if (!confirm(`¿Está seguro que desea ${action} este boletín?`)) return;

    try {
      const response = await fetch(`http://localhost:5000/api/payment-requests/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status })
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
      const response = await fetch('http://localhost:5000/api/payment-requests', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) setSavedBoletines(await response.json());
    } catch { }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/admcloud/transactions', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        setTransactions(await response.json());
      }
    } catch {
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOC = async (tx: Transaction) => {
    setSelectedTx(tx);
    setItemsLoading(true);
    setLinesToPay([]); // Reset boolean/quantities
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
          return {
            externalItemID: it.ItemID,
            description: it.Name,
            receptionNumbers: it.ReceptionNumbers || '',
            quantity: available > 0 ? available : 0, 
            unitPrice: it.Price,
            taxType: 'ITBIS 18%',
            taxPercent: 18,
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

          return {
            externalItemID: it.ItemID,
            description: it.Name,
            receptionNumbers: existingLine ? existingLine.receptionNumbers : (it.ReceptionNumbers || ''),
            quantity: existingLine ? existingLine.quantity : (available > 0 ? available : 0),
            unitPrice: it.Price,
            taxType: existingLine ? existingLine.taxType : 'ITBIS 18%',
            taxPercent: existingLine ? existingLine.taxPercent : 18,
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
  };

  const calculateTotals = () => {
    const selected = linesToPay.filter(l => l.selected);
    let subTotal = 0;
    let totalTax = 0;

    selected.forEach(l => {
      const st = l.quantity * l.unitPrice;
      const tax = st * (l.taxPercent / 100);
      subTotal += st;
      totalTax += tax;
    });

    const retAmount = subTotal * (retentionPercent / 100);
    const advAmount = subTotal * (advancePercent / 100);
    const isrAmount = subTotal * (isrPercent / 100);
    const net = (subTotal + totalTax) - retAmount - advAmount - isrAmount;

    return { subTotal, totalTax, retAmount, advAmount, isrAmount, net };
  };

  const saveBoletin = async () => {
    const selectedLines = linesToPay.filter(l => l.selected);
    if (!selectedTx || selectedLines.length === 0) {
      alert("Seleccione al menos un ítem para pagar.");
      return;
    }

    // Recopilar números de recepción únicos de las líneas seleccionadas
    const selectedReceptionSet = new Set<string>();
    linesToPay.forEach((line, idx) => {
      if (line.selected && items[idx]?.ReceptionNumbers) {
        items[idx].ReceptionNumbers.split(',').forEach((r: string) => {
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
    if (boletin.receptionNumbers) {
      doc.text(`Recepciones: ${boletin.receptionNumbers}`, 14, 62);
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
      startY: boletin.receptionNumbers ? 68 : 62,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Boletín de Medición y Solicitud de Pago</h2>
        {!isNewTab && (
          <button className="btn-small" onClick={() => setViewHistory(!viewHistory)}>
            {viewHistory ? 'Volver al Formulario' : 'Ver Historial de Boletines'}
          </button>
        )}
      </div>

      {viewHistory && !isNewTab ? (
        <div className="card history-card">
          <h3>Historial de Boletines Generados</h3>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>N° Boletín</th>
                  <th>Fecha</th>
                  <th style={{ minWidth: '200px' }}>Proyecto</th>
                  <th>Ref (OC / Rec.)</th>
                  <th>Proveedor</th>
                  <th style={{ textAlign: 'right' }}>Neto Pagado</th>
                  <th>Estado</th>
                  <th style={{ minWidth: '220px', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {savedBoletines.map(b => (
                  <tr key={b.id}>
                    <td><strong>{b.docNumber}</strong></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(b.date).toLocaleDateString('es-ES')}</td>
                    <td>
                      <div className="project-cell" title={b.projectName}>
                        {b.projectName || 'General'}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '0.85rem' }}>{b.docID}</div>
                      {b.receptionNumbers && (
                        <div style={{ fontSize: '0.7rem', color: '#666' }}>Rec: {b.receptionNumbers}</div>
                      )}
                    </td>
                    <td>
                      <div className="vendor-cell" title={b.vendorName}>
                        {b.vendorName}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${formatCurrency(b.netTotal)}</td>
                    <td>
                      <span className={`status-badge status-${b.status.toLowerCase()}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons-container">
                        <button className="btn-action btn-pdf" onClick={() => generatePDF(b)}>PDF</button>
                        {b.status === "PENDIENTE" && (
                          <>
                            <button className="btn-action btn-edit" onClick={() => window.open(`/?editBoletin=${b.id}`, '_blank')}>
                              Editar
                            </button>
                            {(user?.role === 'admin' || user?.accessContabilidad) && (
                              <div className="approval-group">
                                <button className="btn-action btn-approve" onClick={() => handleStatusChange(b.id, 'APROBADO')}>
                                  Aprobar
                                </button>
                                <button className="btn-action btn-reject" onClick={() => handleStatusChange(b.id, 'RECHAZADO')}>
                                  Rechazar
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
        </div>
      ) : !selectedTx ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
            <h3 style={{ margin: 0 }}>Seleccione una Orden de Compra (AdmCloud)</h3>
            <div className="filter-group" style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: '#666' }}>Desde:</span>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: '#666' }}>Hasta:</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ddd' }}
                />
              </div>
              <div className="search-box" style={{ width: '300px' }}>
                <input 
                  type="text" 
                  placeholder="Buscar OC, Proveedor o Proyecto..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ width: '100%', padding: '8px 15px', borderRadius: '25px', border: '1px solid #ddd', outline: 'none', fontSize: '0.85rem' }}
                />
              </div>
              <button 
                onClick={() => { setSearchTerm(''); setStartDate(''); setEndDate(''); }}
                style={{ background: '#eee', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                Limpiar
              </button>
            </div>
          </div>

          {loading ? <div className="loading-spinner">Cargando órdenes de compra de AdmCloud...</div> : (
            <div className="table-responsive">
              {Object.entries(groupedTransactions).map(([projectName, txs]) => (
                <div key={projectName} style={{ marginBottom: '35px' }}>
                  <h4 style={{ 
                    background: '#f8f9fa', 
                    padding: '12px 20px', 
                    borderRadius: '8px', 
                    borderLeft: '5px solid #1976d2',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}>
                    <span>Proyecto: <strong>{projectName}</strong></span>
                    <span style={{ fontSize: '0.8rem', background: '#e3f2fd', color: '#1976d2', padding: '4px 12px', borderRadius: '15px', fontWeight: 'bold' }}>
                      {txs.length} {txs.length === 1 ? 'Orden' : 'Ordenes'}
                    </span>
                  </h4>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Doc ID</th>
                        <th>Proveedor</th>
                        <th>Fecha OC</th>
                        <th>Total OC</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txs.map(tx => (
                        <tr key={tx.ID}>
                          <td>{tx.DocID}</td>
                          <td>{tx.VendorName}</td>
                          <td>{new Date(tx.DocDate).toLocaleDateString('es-ES')}</td>
                          <td>${formatCurrency(tx.TotalAmount)}</td>
                          <td>
                            <button className="btn-small" onClick={() => window.open(`/?generateBoletin=${tx.ID}`, '_blank')}>Seleccionar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="boletin-form">
          <div className="header-info card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{editingId ? `Editando Boletín: ${savedBoletines.find(b=>b.id===editingId)?.docNumber}` : `Generando Boletín para: ${selectedTx.DocID}`}</h3>
              <button className="btn-small" onClick={() => { 
                if (isNewTab) {
                  window.close();
                } else {
                  setSelectedTx(null); 
                  setEditingId(null); 
                }
              }}>
                {isNewTab ? 'Cerrar Ventana' : 'Cancelar'}
              </button>
            </div>
            <p><strong>Proveedor:</strong> {selectedTx.VendorName}</p>
            <p><strong>Proyecto:</strong> {selectedTx.ProjectName || 'General'}</p>
            {(() => {
              const selectedReceptionSet = new Set<string>();
              linesToPay.forEach((line, idx) => {
                if (line.selected && items[idx]?.ReceptionNumbers) {
                  items[idx].ReceptionNumbers.split(',').forEach((r: string) => {
                    if (r.trim()) selectedReceptionSet.add(r.trim());
                  });
                }
              });
              const receptionNumbers = Array.from(selectedReceptionSet).join(', ');
              return receptionNumbers ? <p><strong>Recepciones Detectadas:</strong> {receptionNumbers}</p> : null;
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
                    <th style={{ width: '120px' }}>Recepción</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Recibido</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Anterior</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Disponible</th>
                    <th style={{ width: '100px', textAlign: 'center' }}>Cant. a Pagar</th>
                    <th>Precio Unit.</th>
                    <th>Impuesto</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
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
                        <td style={{ fontSize: '0.8rem', color: '#666' }}>{line.receptionNumbers || 'N/A'}</td>
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
                      <td style={{ textAlign: 'right' }}>
                        ${formatCurrency(line.quantity * line.unitPrice)}
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
                    onChange={(e) => setRetentionPercent(Number(e.target.value))}
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
                    onChange={(e) => setAdvancePercent(Number(e.target.value))}
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
                    onChange={(e) => setIsrPercent(Number(e.target.value))}
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
        </div>
      )}

      <style>{`
        .boletin-container { padding: 20px; max-width: 1400px; margin: 0 auto; }
        .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }
        .history-card { width: 100%; overflow-x: auto; }
        .table-responsive { width: 100%; overflow-x: auto; margin-top: 20px; }
        .data-table { width: 100%; border-collapse: collapse; min-width: 1000px; }
        .data-table th { background: #f8f9fa; color: #333; font-weight: 600; text-transform: uppercase; font-size: 0.85rem; }
        .data-table th, .data-table td { padding: 12px 15px; border-bottom: 1px solid #eee; text-align: left; }
        
        .project-cell, .vendor-cell { 
          max-width: 250px; 
          overflow: hidden; 
          text-overflow: ellipsis; 
          white-space: nowrap; 
          font-size: 0.9rem;
        }

        .action-buttons-container { display: flex; gap: 8px; align-items: center; justify-content: center; }
        .approval-group { display: flex; gap: 5px; border-left: 1px solid #ddd; padding-left: 8px; }
        
        .btn-action { 
          padding: 6px 12px; 
          border: none; 
          border-radius: 4px; 
          cursor: pointer; 
          font-weight: 600; 
          font-size: 0.8rem;
          transition: all 0.2s ease;
        }
        
        .btn-pdf { background: #6c757d; color: white; }
        .btn-edit { background: #f0ad4e; color: white; }
        .btn-approve { background: #28a745; color: white; }
        .btn-reject { background: #d9534f; color: white; }
        
        .btn-action:hover { opacity: 0.85; transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0,0,0,0.1); }

        .btn-small { padding: 5px 10px; cursor: pointer; }
        .btn-primary { background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
        .amount-preview { color: #d32f2f; font-weight: bold; font-size: 0.9rem; }
        .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
        .status-pendiente { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
        .status-aprobado { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .status-rechazado { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        input[type="number"], select { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
      `}</style>
    </div>
  );
};
