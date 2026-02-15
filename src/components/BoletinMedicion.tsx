import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

interface Transaction {
  ID: string;
  DocID: string;
  DocType: string;
  DocDate: string;
  Date?: string;
  Reference: string | null;
  Status: number;
  VendorName?: string;
  VendorFiscalID?: string;
  ProjectName?: string;
  JobNumber?: string;
  MeasurementStartDate?: string;
  MeasurementEndDate?: string;
  TotalAmount: number;
  TaxAmount?: number;
  Currency?: string;
  ExchangeRate?: number;
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
  TaxPercent?: number;
  TotalSalesAmount?: number;
}

interface BoletinLine {
  externalItemID: string;
  description: string;
  unitOfMeasure?: string;
  previousUnitOfMeasure?: string;
  receptionNumbers?: string;
  quantity: number;
  unitPrice: number;
  taxType: string;
  taxPercent: number;
  taxAmount: number;
  retentionPercent: number;
  retentionAmount: number;
  itbisRetentionPercent: number;
  totalLine: number;
  selected?: boolean;
}

interface UnitOfMeasureData {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

const formatCurrency = (num: number) => {
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const normalizeUnitOfMeasure = (value?: string | null) => (value || '').trim().toUpperCase();

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

  // Filtros de historial
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [searchHistory, setSearchHistory] = useState('');
  const [groupByProject, setGroupByProject] = useState(true);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  // Boletin Logic State
  const [linesToPay, setLinesToPay] = useState<any[]>([]);
  const [retentionPercent, setRetentionPercent] = useState(0);
  const [advancePercent, setAdvancePercent] = useState(0);
  const [isrPercent, setIsrPercent] = useState(0); // Nueva: Retención ISR
  const [measurementStartDate, setMeasurementStartDate] = useState<string | null>(null);
  const [measurementEndDate, setMeasurementEndDate] = useState<string | null>(null);
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
  const [availableUnits, setAvailableUnits] = useState<UnitOfMeasureData[]>([]);

  const getLastUnitsByItem = (externalTxID: string, excludeBoletinId?: number | null) => {
    const unitsByItem = new Map<string, string>();

    savedBoletines
      .filter((b) => b.externalTxID === externalTxID && (!excludeBoletinId || b.id !== excludeBoletinId))
      .forEach((boletin) => {
        (boletin.lines || []).forEach((line: any) => {
          if (unitsByItem.has(line.externalItemID)) return;
          const normalized = normalizeUnitOfMeasure(line.unitOfMeasure);
          if (normalized) {
            unitsByItem.set(line.externalItemID, normalized);
          }
        });
      });

    return unitsByItem;
  };

  useEffect(() => {
    fetchTransactions();
    fetchBoletinHistory();
    fetchActiveRetentions();
    fetchActiveUnits();
    const params = new URLSearchParams(window.location.search);
    setIsNewTab(params.has('editBoletin') || params.has('generateBoletin') || params.has('boletinSelection'));

    // Escuchar mensajes de otras ventanas para recargar boletines
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'boletinUpdated') {
        console.log('📨 Boletín actualizado en otra ventana, recargando...');
        fetchBoletinHistory();
        localStorage.removeItem('boletinUpdated'); // Limpiar el flag
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [filterSubcontratos]);

  // Efecto para recargar boletines cuando se activa la vista de historial
  useEffect(() => {
    if (viewHistory) {
      console.log('📋 Vista de historial activada, recargando datos...');
      fetchBoletinHistory();
    }
  }, [viewHistory]);

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

  const handleGeneratePDF = async (boletin: any) => {
    let boletinWithDates = { ...boletin };
    
    // Si el boletín no tiene fechas de medición, intentar obtenerlas de AdmCloud
    if ((!boletin.measurementStartDate || !boletin.measurementEndDate) && boletin.externalTxID) {
      try {
        console.log('📅 Consultando fechas de medición para boletín:', boletin.docNumber);
        const receptionsResponse = await fetch(`http://localhost:5000/api/admcloud/transactions/${boletin.externalTxID}/receptions`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (receptionsResponse.ok) {
          const receptions = await receptionsResponse.json();
          const receptionWithDates = receptions.find((r: any) => r.MeasurementStartDate && r.MeasurementEndDate);
          if (receptionWithDates) {
            console.log('✅ Fechas encontradas:', receptionWithDates.MeasurementStartDate, receptionWithDates.MeasurementEndDate);
            boletinWithDates.measurementStartDate = receptionWithDates.MeasurementStartDate;
            boletinWithDates.measurementEndDate = receptionWithDates.MeasurementEndDate;
          }
        }
      } catch (error) {
        console.error('Error al obtener fechas de medición:', error);
      }
    }
    
    generatePDF(boletinWithDates);
  };

  const fetchBoletinHistory = async () => {
    try {
      console.log('🔄 Recargando historial de boletines...');
      const response = await fetch('http://localhost:5000/api/payment-requests', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSavedBoletines(data);
        console.log('✅ Boletines recargados:', data.length);
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

  const fetchActiveUnits = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/units-of-measure/active', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableUnits(data);
      }
    } catch (err) {
      console.error('Error cargando unidades de medida:', err);
    }
  };

  const getUnitOptionsForLine = (line: BoletinLine) => {
    const options = [...availableUnits];
    const previousCode = normalizeUnitOfMeasure(line.previousUnitOfMeasure);
    if (previousCode && !options.some((unit) => unit.code === previousCode)) {
      options.unshift({
        id: -1,
        code: previousCode,
        name: `${previousCode} (histórico)`,
        description: 'Unidad usada previamente en boletines',
        isActive: false
      });
    }
    return options;
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
      setMeasurementStartDate(null);
      setMeasurementEndDate(null);
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
      // Consultar recepciones para obtener fechas de medición
      const receptionsResponse = await fetch(`http://localhost:5000/api/admcloud/transactions/${tx.ID}/receptions`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (receptionsResponse.ok) {
        const receptions = await receptionsResponse.json();
        console.log('📦 Recepciones obtenidas:', receptions.length);
        
        // Buscar la primera recepción con fechas de medición
        const receptionWithDates = receptions.find((r: any) => r.MeasurementStartDate && r.MeasurementEndDate);
        if (receptionWithDates) {
          console.log('✅ Fechas encontradas en recepción:', receptionWithDates.DocID, receptionWithDates.MeasurementStartDate, receptionWithDates.MeasurementEndDate);
          setMeasurementStartDate(receptionWithDates.MeasurementStartDate);
          setMeasurementEndDate(receptionWithDates.MeasurementEndDate);
        } else {
          console.log('⚠️ No se encontraron fechas de medición en las recepciones');
          setMeasurementStartDate(null);
          setMeasurementEndDate(null);
        }
      }
      
      // Consultar items de la OC
      const response = await fetch(`http://localhost:5000/api/admcloud/transactions/${tx.ID}/items`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setItems(data);
        const previousUnitsByItem = getLastUnitsByItem(tx.ID);
        
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
            unitOfMeasure: previousUnitsByItem.get(it.ItemID) || '',
            previousUnitOfMeasure: previousUnitsByItem.get(it.ItemID) || '',
            receptionNumbers: lastReception,
            quantity: available > 0 ? available : 0, 
            unitPrice: it.Price,
            taxType: 'ITBIS 18%',
            taxPercent: 18,
            taxAmount: 0,
            retentionPercent: 0,
            retentionAmount: 0,
            itbisRetentionPercent: 0,
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
    const scheduledLine = boletin.paymentScheduleLines?.find(
      (line: { paymentSchedule?: { status?: string; scheduleNumber?: string } }) =>
        line?.paymentSchedule?.status !== 'CANCELADA'
    );
    if (scheduledLine) {
      alert(`Este boletín no se puede editar porque está incluido en la programación ${scheduledLine.paymentSchedule?.scheduleNumber || ''}`);
      return;
    }

    setEditingId(boletin.id);
    setRetentionPercent(boletin.retentionPercent);
    setAdvancePercent(boletin.advancePercent);
    setIsrPercent(boletin.isrPercent);
    setMeasurementStartDate(boletin.measurementStartDate || null);
    setMeasurementEndDate(boletin.measurementEndDate || null);
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
        VendorFiscalID: boletin.vendorFiscalID,
        ProjectName: boletin.projectName,
        TotalAmount: 0
      });
    }

    setItemsLoading(true);
    setViewHistory(false);
    try {
      // Consultar recepciones para obtener fechas de medición si no están en el boletín guardado
      if (!boletin.measurementStartDate || !boletin.measurementEndDate) {
        const receptionsResponse = await fetch(`http://localhost:5000/api/admcloud/transactions/${boletin.externalTxID}/receptions`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (receptionsResponse.ok) {
          const receptions = await receptionsResponse.json();
          const receptionWithDates = receptions.find((r: any) => r.MeasurementStartDate && r.MeasurementEndDate);
          if (receptionWithDates) {
            setMeasurementStartDate(receptionWithDates.MeasurementStartDate);
            setMeasurementEndDate(receptionWithDates.MeasurementEndDate);
          }
        }
      }
      
      // Obtener los datos completos de la transacción desde AdmCloud para tener el FiscalID actualizado
      const txResponse = await fetch(`http://localhost:5000/api/admcloud/transactions/${boletin.externalTxID}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (txResponse.ok) {
        const fullTx = await txResponse.json();
        if (fullTx.VendorFiscalID) {
          // Actualizar selectedTx con el FiscalID de AdmCloud
          setSelectedTx((prev: any) => ({ ...prev, VendorFiscalID: fullTx.VendorFiscalID }));
        }
      }
      
      const response = await fetch(`http://localhost:5000/api/admcloud/transactions/${boletin.externalTxID}/items`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const ocItems = await response.json();
        setItems(ocItems);
        const previousUnitsByItem = getLastUnitsByItem(boletin.externalTxID, boletin.id);
        
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
            unitOfMeasure: existingLine ? normalizeUnitOfMeasure(existingLine.unitOfMeasure) : (previousUnitsByItem.get(it.ItemID) || ''),
            previousUnitOfMeasure: previousUnitsByItem.get(it.ItemID) || '',
            receptionNumbers: receptionNum,
            quantity: existingLine ? existingLine.quantity : (available > 0 ? available : 0),
            unitPrice: it.Price,
            taxType: existingLine ? existingLine.taxType : 'ITBIS 18%',
            taxPercent: existingLine ? existingLine.taxPercent : 18,
            taxAmount: existingLine ? existingLine.taxAmount : 0,
            retentionPercent: existingLine ? existingLine.retentionPercent : 0,
            retentionAmount: existingLine ? existingLine.retentionAmount : 0,
            itbisRetentionPercent: existingLine ? existingLine.itbisRetentionPercent : 0,
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
    
    // Calcular automáticamente el impuesto cuando se selecciona una línea
    if (field === 'selected' && value === true) {
      const line = newLines[index];
      const subtotal = line.quantity * line.unitPrice;
      const taxAmount = subtotal * (line.taxPercent / 100);
      const previousUnit = normalizeUnitOfMeasure(line.previousUnitOfMeasure);
      const currentUnit = normalizeUnitOfMeasure(line.unitOfMeasure);
      newLines[index] = {
        ...newLines[index],
        taxAmount,
        unitOfMeasure: currentUnit || previousUnit || line.unitOfMeasure
      };
    }
    
    setLinesToPay(newLines);
    setHasUnsavedChanges(true);
  };

  const calculateTotals = () => {
    const selected = linesToPay.filter(l => l.selected);
    let subTotal = 0;
    let totalTax = 0;
    let totalRetentionByLine = 0;
    let totalItbisRetention = 0;

    selected.forEach(l => {
      const st = l.quantity * l.unitPrice;
      const tax = st * (l.taxPercent / 100);
      const retentionByLine = st * ((l.retentionPercent || 0) / 100);
      const itbisRetention = tax * ((l.itbisRetentionPercent || 0) / 100);
      
      subTotal += st;
      totalTax += tax;
      totalRetentionByLine += retentionByLine;
      totalItbisRetention += itbisRetention;
    });

    const retAmount = subTotal * (retentionPercent / 100);
    const advAmount = subTotal * (advancePercent / 100);
    const isrAmount = subTotal * (isrPercent / 100);
    const net = (subTotal + totalTax) - totalRetentionByLine - totalItbisRetention - retAmount - advAmount - isrAmount;

    return { subTotal, totalTax, retAmount, advAmount, isrAmount, totalRetentionByLine, totalItbisRetention, net };
  };

  const getRetentionsSummary = () => {
    const selected = linesToPay.filter(l => l.selected && l.retentionPercent > 0);
    const summary: { [key: string]: { name: string; percent: number; total: number } } = {};
    
    selected.forEach(line => {
      const retention = availableRetentions.find(r => r.percentage === line.retentionPercent);
      const retentionName = retention ? retention.name : `Retención ${line.retentionPercent}%`;
      const key = `${line.retentionPercent}`;
      
      const st = line.quantity * line.unitPrice;
      const retentionAmount = st * (line.retentionPercent / 100);
      
      if (!summary[key]) {
        summary[key] = { name: retentionName, percent: line.retentionPercent, total: 0 };
      }
      summary[key].total += retentionAmount;
    });
    
    return Object.values(summary);
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

        const normalizedUnit = normalizeUnitOfMeasure(line.unitOfMeasure);
        if (!normalizedUnit) {
          alert(`Error: Debe indicar la unidad de medida para la partida "${line.description}".`);
          return;
        }

        const previousUnit = normalizeUnitOfMeasure(line.previousUnitOfMeasure);
        if (previousUnit && previousUnit !== normalizedUnit) {
          alert(`Error: La partida "${line.description}" debe usar la unidad "${previousUnit}" del boletín anterior.`);
          return;
        }
    }

    const linesPayload = selectedLines.map((line) => ({
      ...line,
      unitOfMeasure: normalizeUnitOfMeasure(line.unitOfMeasure)
    }));

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
          vendorFiscalID: selectedTx.VendorFiscalID,
          projectName: selectedTx.ProjectName,
          measurementStartDate: selectedTx.MeasurementStartDate,
          measurementEndDate: selectedTx.MeasurementEndDate,
          retentionPercent,
          advancePercent,
          isrPercent,
          receptionNumbers,
          lines: linesPayload
        })
      });

      if (response.ok) {
        alert(editingId ? "Boletín actualizado con éxito" : "Boletín generado con éxito");
        setHasUnsavedChanges(false);
        
        // Notificar a otras ventanas que se actualizó un boletín
        localStorage.setItem('boletinUpdated', Date.now().toString());
        
        if (isNewTab) {
          // Esperar un momento para que el mensaje se propague antes de cerrar
          setTimeout(() => {
            window.close();
          }, 500);
        } else {
          setSelectedTx(null);
          setLinesToPay([]);
          setEditingId(null);
          setMeasurementStartDate(null);
          setMeasurementEndDate(null);
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

  const exportToExcel = async () => {
    // Mostrar estado de carga
    setLoading(true);
    
    try {
      // Preparar datos para la primera hoja (resumen de órdenes)
      const data: any[] = [];
      
      // Por cada proyecto, agregar sus órdenes
      Object.entries(groupedTransactions).forEach(([projectName, txs], index) => {
        // Filas de órdenes del proyecto
        txs.forEach((tx, txIndex) => {
          // Determinar moneda - verificar múltiples formatos posibles
          let moneda = 'DOP'; // Por defecto
          const currencyValue = String(tx.Currency || '').trim().toUpperCase();
          
          // USD puede venir como: '2', 'USD', o GUID específico
          if (currencyValue === '2' || currencyValue === 'USD' || 
              currencyValue === 'B99EF67E-9001-4BAA-ADCE-08DDAA50AC6E') {
            moneda = 'USD';
          }
          // DOP puede venir como: '1', 'DOP', o GUID específico  
          else if (currencyValue === '1' || currencyValue === 'DOP' || 
                   currencyValue === 'F5825D92-D608-4B7B-ADCD-08DDAA50AC6E') {
            moneda = 'DOP';
          }
          
          data.push({
            'Proyecto': txIndex === 0 ? projectName : '', // Solo mostrar nombre del proyecto en la primera fila
            'Doc ID': tx.DocID,
            'Proveedor': tx.VendorName?.toUpperCase() || '',
            'RNC/Cédula': tx.VendorFiscalID || '',
            'Fecha OC': new Date(tx.DocDate).toLocaleDateString('es-ES'),
            'Moneda': moneda,
            'Tasa Cambio': tx.ExchangeRate || '',
            'Total OC': tx.TotalAmount // Número directo, no formateado
          });
        });
        
        // Fila vacía entre proyectos (excepto después del último)
        if (index < Object.keys(groupedTransactions).length - 1) {
          data.push({
            'Proyecto': '',
            'Doc ID': '',
            'Proveedor': '',
            'RNC/Cédula': '',
            'Fecha OC': '',
            'Moneda': '',
            'Total OC': null
          });
        }
      });
      
      // Fila vacía antes del total
      data.push({
        'Proyecto': '',
        'Doc ID': '',
        'Proveedor': '',
        'RNC/Cédula': '',
        'Fecha OC': '',
        'Moneda': '',
        'Tasa Cambio': '',
        'Total OC': null
      });
      
      // Calcular totales por moneda
      const totalesPorMoneda = filteredTxs.reduce((acc: {DOP: number, USD: number, count: number}, tx) => {
        const currencyValue = String(tx.Currency || '').trim().toUpperCase();
        let moneda = 'DOP';
        
        if (currencyValue === '2' || currencyValue === 'USD' || 
            currencyValue === 'B99EF67E-9001-4BAA-ADCE-08DDAA50AC6E') {
          moneda = 'USD';
        }
        
        acc[moneda as 'DOP' | 'USD'] += tx.TotalAmount;
        acc.count++;
        return acc;
      }, {DOP: 0, USD: 0, count: 0});
      
      // Total en DOP
      if (totalesPorMoneda.DOP > 0) {
        data.push({
          'Proyecto': 'TOTAL DOP',
          'Doc ID': '',
          'Proveedor': '',
          'RNC/Cédula': '',
          'Fecha OC': '',
          'Moneda': 'DOP',
          'Tasa Cambio': '',
          'Total OC': totalesPorMoneda.DOP
        });
      }
      
      // Total en USD
      if (totalesPorMoneda.USD > 0) {
        data.push({
          'Proyecto': 'TOTAL USD',
          'Doc ID': '',
          'Proveedor': '',
          'RNC/Cédula': '',
          'Fecha OC': '',
          'Moneda': 'USD',
          'Tasa Cambio': '',
          'Total OC': totalesPorMoneda.USD
        });
      }
      
      // Fila en blanco
      data.push({
        'Proyecto': '',
        'Doc ID': '',
        'Proveedor': '',
        'RNC/Cédula': '',
        'Fecha OC': '',
        'Moneda': '',
        'Tasa Cambio': '',
        'Total OC': null
      });
      
      // Total general (informativo)
      const totalGeneral = filteredTxs.reduce((sum, tx) => sum + tx.TotalAmount, 0);
      data.push({
        'Proyecto': 'TOTAL GENERAL',
        'Doc ID': '',
        'Proveedor': '',
        'RNC/Cédula': '',
        'Fecha OC': `${totalesPorMoneda.count} ${totalesPorMoneda.count === 1 ? 'orden' : 'órdenes'}`,
        'Moneda': '',
        'Tasa Cambio': '',
        'Total OC': totalGeneral // Número directo
      });
      
      // Crear hoja de cálculo para resumen
      const ws = XLSX.utils.json_to_sheet(data);
      
      // Establecer anchos de columnas para resumen
      ws['!cols'] = [
        { wch: 40 }, // Proyecto
        { wch: 15 }, // Doc ID
        { wch: 30 }, // Proveedor
        { wch: 15 }, // RNC/Cédula
        { wch: 12 }, // Fecha OC
        { wch: 8 },  // Moneda
        { wch: 12 }, // Tasa Cambio
        { wch: 18 }  // Total OC
      ];
      
      // Obtener los items de todas las órdenes en paralelo
      console.log('📥 Obteniendo items de las órdenes...');
      const itemsPromises = filteredTxs.map(async (tx) => {
        try {
          const response = await fetch(`http://localhost:5000/api/admcloud/transactions/${tx.ID}/items`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
          });
          if (response.ok) {
            const items = await response.json();
            return items.map((item: TransactionItem) => ({
              transaction: tx,
              item: item
            }));
          }
          return [];
        } catch (error) {
          console.error(`Error al obtener items de ${tx.DocID}:`, error);
          return [];
        }
      });
      
      const allItemsWithTx = await Promise.all(itemsPromises);
      const flattenedItems = allItemsWithTx.flat();
      
      console.log(`✅ Se obtuvieron ${flattenedItems.length} items de ${filteredTxs.length} órdenes`);
      
      // Log para verificar valores de Currency
      const currencyValues = new Set(filteredTxs.map(tx => tx.Currency));
      console.log('💰 Valores únicos de Currency encontrados:', Array.from(currencyValues));
      filteredTxs.forEach(tx => {
        console.log(`📋 ${tx.DocID}: Currency = "${tx.Currency}" (type: ${typeof tx.Currency}), TotalAmount = ${tx.TotalAmount}, TaxAmount = ${tx.TaxAmount}`);
      });
      
      // Agrupar items por transacción para calcular totales
      const itemsByTransaction = new Map<string, Array<{transaction: Transaction, item: TransactionItem}>>();
      flattenedItems.forEach(({ transaction, item }) => {
        const key = transaction.ID;
        if (!itemsByTransaction.has(key)) {
          itemsByTransaction.set(key, []);
        }
        itemsByTransaction.get(key)!.push({ transaction, item });
      });
      
      // Preparar datos para la segunda hoja (detalle de items)
      const itemsData: any[] = [];
      
      // Procesar por transacción para agregar subtotales
      itemsByTransaction.forEach((items) => {
        
        // Agregar items de esta transacción
        items.forEach(({ transaction, item }) => {
          // Determinar la tasa de impuesto
          let tasaImpuesto = 0;
          let metodoCalculo = '';
          let itemExento = false;
          
          // Verificar si el item está explícitamente exento (TaxAmount = 0 Y TaxPercent = 0 o null)
          if ((item.TaxAmount === 0 || item.TaxAmount === null) && 
              (item.TaxPercent === 0 || item.TaxPercent === null || item.TaxPercent === undefined)) {
            itemExento = true;
            metodoCalculo = 'Item exento de impuestos';
          }
          
          // Solo calcular impuesto si el item NO está exento
          if (!itemExento) {
            // Método 1: Usar TaxPercent si existe y es razonable (entre 0% y 30%)
            if (item.TaxPercent !== undefined && item.TaxPercent !== null && item.TaxPercent > 0 && item.TaxPercent <= 30) {
              tasaImpuesto = item.TaxPercent / 100;
              metodoCalculo = `TaxPercent directo: ${item.TaxPercent}%`;
            } 
            // Método 2: Calcular de TaxAmount / subtotal ordenado
            else if (item.TaxAmount > 0 && item.OrderedQuantity > 0) {
              const subtotalOrdenado = item.Price * item.OrderedQuantity;
              if (subtotalOrdenado > 0) {
                const calculado = item.TaxAmount / subtotalOrdenado;
                // Validar que sea razonable (máximo 30%)
                if (calculado <= 0.30) {
                  tasaImpuesto = calculado;
                  metodoCalculo = `TaxAmount/Subtotal: ${item.TaxAmount}/${subtotalOrdenado} = ${(calculado*100).toFixed(2)}%`;
                }
              }
            }
            
            // Método 3: Calcular de la diferencia entre TotalSalesAmount y subtotal
            else if (item.TotalSalesAmount && item.OrderedQuantity > 0) {
              const subtotalOrdenado = item.Price * item.OrderedQuantity;
              if (subtotalOrdenado > 0 && item.TotalSalesAmount > subtotalOrdenado) {
                const calculado = (item.TotalSalesAmount - subtotalOrdenado) / subtotalOrdenado;
                if (calculado <= 0.30) {
                  tasaImpuesto = calculado;
                  metodoCalculo = `TotalSalesAmount: (${item.TotalSalesAmount}-${subtotalOrdenado})/${subtotalOrdenado} = ${(calculado*100).toFixed(2)}%`;
                }
              }
            }
            
            // Método 4: Inferir del total de la orden SOLO si no tenemos información específica del item
            // Y el item no está marcado explícitamente como sin impuesto
            else if (transaction.TotalAmount > 0 && transaction.TaxAmount && transaction.TaxAmount > 0) {
              const subtotalOrden = transaction.TotalAmount - transaction.TaxAmount;
              if (subtotalOrden > 0) {
                const calculado = transaction.TaxAmount / subtotalOrden;
                if (calculado <= 0.30) {
                  tasaImpuesto = calculado;
                  metodoCalculo = `Tasa de orden (inferido): ${transaction.TaxAmount}/${subtotalOrden} = ${(calculado*100).toFixed(2)}%`;
                }
              }
            }
          }
          
          // Log detallado para órdenes específicas o items con inconsistencias
          if (transaction.DocID === 'ICI-ORC00000288' || transaction.DocID === 'ICI-ORC00000255' || 
              tasaImpuesto > 0.20 || itemExento) {
            console.log(`🔍 ${transaction.DocID} - ${item.ItemID} (${item.Name.substring(0, 40)}):`, {
              Price: item.Price,
              OrderedQty: item.OrderedQuantity,
              SubtotalBruto: item.Price * item.OrderedQuantity,
              TaxPercent: item.TaxPercent,
              TaxAmount: item.TaxAmount,
              TotalSalesAmount: item.TotalSalesAmount,
              exento: itemExento,
              tasaCalculada: (tasaImpuesto * 100).toFixed(2) + '%',
              metodo: metodoCalculo
            });
          }
          
          // Calcular descuento si TotalSalesAmount es diferente de Price * Qty + Tax
          const subtotalBrutoOrdenado = item.Price * item.OrderedQuantity;
          const impuestoEsperado = subtotalBrutoOrdenado * tasaImpuesto;
          const totalEsperado = subtotalBrutoOrdenado + impuestoEsperado;
          
          // Inferir descuento desde TotalSalesAmount si está disponible y difiere del total esperado
          let descuentoOrdenado = 0;
          let descuentoPercent = 0;
          
          if (item.TotalSalesAmount && Math.abs(item.TotalSalesAmount - totalEsperado) > 0.01) {
            // Hay una diferencia, puede ser un descuento
            // TotalSalesAmount = (Subtotal - Descuento) + Impuesto
            // Resolviendo: Descuento = Subtotal + Impuesto - TotalSalesAmount
            const diferenciaTotal = totalEsperado - item.TotalSalesAmount;
            
            // Si la diferencia es positiva, es un descuento
            if (diferenciaTotal > 0) {
              // El descuento afecta tanto el subtotal como el impuesto
              // (Subtotal - Desc) * (1 + Tax%) = TotalSalesAmount
              // Subtotal - Desc = TotalSalesAmount / (1 + Tax%)
              const subtotalConDescuento = item.TotalSalesAmount / (1 + tasaImpuesto);
              descuentoOrdenado = subtotalBrutoOrdenado - subtotalConDescuento;
              descuentoPercent = subtotalBrutoOrdenado > 0 ? (descuentoOrdenado / subtotalBrutoOrdenado) * 100 : 0;
            }
          }
          
          const subtotalOrdenado = subtotalBrutoOrdenado - descuentoOrdenado;
          const impuestoOrdenado = subtotalOrdenado * tasaImpuesto;
          const totalOrdenado = subtotalOrdenado + impuestoOrdenado;
          
          // Calcular valores basados en la cantidad recibida
          const subtotalBrutoRecibido = item.Price * item.ReceivedQuantity;
          const descuentoRecibido = item.OrderedQuantity > 0 
            ? (descuentoOrdenado / item.OrderedQuantity) * item.ReceivedQuantity 
            : 0;
          const subtotalRecibido = subtotalBrutoRecibido - descuentoRecibido;
          const impuestoRecibido = subtotalRecibido * tasaImpuesto;
          const totalRecibido = subtotalRecibido + impuestoRecibido;
          
          // Determinar moneda - verificar múltiples formatos posibles
          let moneda = 'DOP'; // Por defecto
          const currencyValue = String(transaction.Currency || '').trim().toUpperCase();
          
          // USD puede venir como: '2', 'USD', o GUID específico
          if (currencyValue === '2' || currencyValue === 'USD' || 
              currencyValue === 'B99EF67E-9001-4BAA-ADCE-08DDAA50AC6E') {
            moneda = 'USD';
          }
          // DOP puede venir como: '1', 'DOP', o GUID específico  
          else if (currencyValue === '1' || currencyValue === 'DOP' || 
                   currencyValue === 'F5825D92-D608-4B7B-ADCD-08DDAA50AC6E') {
            moneda = 'DOP';
          }
          
          // Agregar item al detalle
          itemsData.push({
            'Proyecto': transaction.JobNumber || '',
            'Doc ID': transaction.DocID,
            'Proveedor': transaction.VendorName,
            'RNC/Cédula': transaction.VendorFiscalID || '',
            'Fecha OC': transaction.Date ? new Date(transaction.Date).toLocaleDateString() : '',
            'Moneda': moneda,
            'Item ID': item.ItemID,
            'Descripción': item.Name,
            'Cant. Ordenada': item.OrderedQuantity,
            'Cant. Recibida': item.ReceivedQuantity,
            'Cant. Pagada': item.PaidQuantity,
            'Cant. Pendiente': item.ReceivedQuantity - item.PaidQuantity,
            'Precio Unitario': item.Price,
            '% Descuento': descuentoPercent,
            'Descuento Ordenado': descuentoOrdenado,
            'Descuento Recibido': descuentoRecibido,
            'TaxAmount AdmCloud': item.TaxAmount || 0,
            'TaxPercent AdmCloud': item.TaxPercent || 0,
            '% Impuesto Aplicado': tasaImpuesto * 100,
            'Subtotal Ordenado': subtotalOrdenado,
            'Impuesto Ordenado': impuestoOrdenado,
            'Total Ordenado': totalOrdenado,
            'Subtotal Recibido': subtotalRecibido,
            'Impuesto Recibido': impuestoRecibido,
            'Total Recibido': totalRecibido,
            'TotalSalesAmount AdmCloud': item.TotalSalesAmount || 0,
            'N° Recepciones': item.ReceptionNumbers || ''
          });
        });
      });
      
      // Crear hoja de cálculo para items
      const wsItems = XLSX.utils.json_to_sheet(itemsData);
      
      // Establecer anchos de columnas para items
      wsItems['!cols'] = [
        { wch: 35 }, // Proyecto
        { wch: 15 }, // Doc ID
        { wch: 30 }, // Proveedor
        { wch: 15 }, // RNC/Cédula
        { wch: 12 }, // Fecha OC
        { wch: 8 },  // Moneda
        { wch: 15 }, // Item ID
        { wch: 40 }, // Descripción
        { wch: 12 }, // Cant. Ordenada
        { wch: 12 }, // Cant. Recibida
        { wch: 12 }, // Cant. Pagada
        { wch: 12 }, // Cant. Pendiente
        { wch: 15 }, // Precio Unitario
        { wch: 10 }, // % Descuento
        { wch: 15 }, // Descuento Ordenado
        { wch: 15 }, // Descuento Recibido
        { wch: 16 }, // TaxAmount AdmCloud
        { wch: 16 }, // TaxPercent AdmCloud
        { wch: 12 }, // % Impuesto Aplicado
        { wch: 16 }, // Subtotal Ordenado
        { wch: 16 }, // Impuesto Ordenado
        { wch: 16 }, // Total Ordenado
        { wch: 16 }, // Subtotal Recibido
        { wch: 16 }, // Impuesto Recibido
        { wch: 18 }, // TotalSalesAmount AdmCloud
        { wch: 16 }, // Total Recibido
        { wch: 20 }  // N° Recepciones
      ];
      
      // Crear libro y agregar ambas hojas
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Órdenes por Proyecto');
      XLSX.utils.book_append_sheet(wb, wsItems, 'Detalle de Items');
      
      // Generar nombre de archivo con fecha
      const fecha = new Date().toISOString().split('T')[0];
      const fileName = `OC_por_Proyecto_${fecha}.xlsx`;
      
      // Descargar archivo
      XLSX.writeFile(wb, fileName);
      
      console.log('✅ Archivo Excel generado exitosamente con 2 hojas');
    } catch (error) {
      console.error('❌ Error al exportar a Excel:', error);
      setError('Error al exportar a Excel');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = (boletin: any) => {
    console.log('📄 Generando PDF para boletín:', boletin.docNumber);
    console.log('💰 Valores del boletín:', {
      subTotal: boletin.subTotal,
      taxAmount: boletin.taxAmount,
      retentionAmount: boletin.retentionAmount,
      advanceAmount: boletin.advanceAmount,
      isrAmount: boletin.isrAmount,
      netTotal: boletin.netTotal,
      date: boletin.date,
      measurementStartDate: boletin.measurementStartDate,
      measurementEndDate: boletin.measurementEndDate
    });
    
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(40);
    doc.text("Boletín de Medición y Solicitud de Pago", 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`N° Boletín: ${boletin.docNumber}`, 14, 32);
    
    // Validar fecha antes de formatear
    const fechaBoletin = boletin.date ? new Date(boletin.date) : new Date();
    doc.text(`Fecha: ${fechaBoletin.toLocaleDateString('es-ES')}`, 14, 38);
    doc.text(`OC Referencia: ${boletin.docID}`, 14, 44);
    doc.text(`Proveedor: ${boletin.vendorName}`, 14, 50);
    
    let currentHeaderY;
    if (boletin.vendorFiscalID) {
      doc.text(`RNC/Cédula: ${boletin.vendorFiscalID}`, 14, 56);
      doc.text(`Proyecto: ${boletin.projectName || 'General'}`, 14, 62);
      currentHeaderY = 68;
    } else {
      doc.text(`Proyecto: ${boletin.projectName || 'General'}`, 14, 56);
      currentHeaderY = 62;
    }
    
    if (boletin.measurementStartDate && boletin.measurementEndDate) {
      // Parsear fechas sin problemas de zona horaria
      const startDate = new Date(boletin.measurementStartDate.split('T')[0] + 'T12:00:00').toLocaleDateString('es-ES');
      const endDate = new Date(boletin.measurementEndDate.split('T')[0] + 'T12:00:00').toLocaleDateString('es-ES');
      doc.text(`Periodo: Desde ${startDate} y hasta ${endDate}`, 14, currentHeaderY);
      currentHeaderY += 6;
    }
    
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

    const tableColumn = ["Descripción", "Unidad", "Recepción", "Cantidad", "Precio Unit.", "ITBIS", "Retención", "Total"];
    const tableRows = (boletin.lines || []).map((l: any) => {
      const subtotal = l.quantity * l.unitPrice;
      const tax = subtotal * ((l.taxPercent || 0) / 100);
      const retention = subtotal * ((l.retentionPercent || 0) / 100);
      const itbisRetention = tax * ((l.itbisRetentionPercent || 0) / 100);
      const lineTotal = subtotal + tax - retention - itbisRetention;
      const normalizedUnitCode = normalizeUnitOfMeasure(l.unitOfMeasure);
      const unitFromCatalog = availableUnits.find((u) => u.code === normalizedUnitCode);
      const unitDescription = unitFromCatalog?.name || unitFromCatalog?.description || l.unitOfMeasure || '-';
      
      let retentionText = '';
      if (l.retentionPercent > 0 || l.itbisRetentionPercent > 0) {
        const parts = [];
        if (l.retentionPercent > 0) parts.push(`${l.retentionPercent}%`);
        if (l.itbisRetentionPercent > 0) parts.push(`ITBIS ${l.itbisRetentionPercent}%`);
        retentionText = parts.join(', ');
      } else {
        retentionText = 'N/A';
      }
      
      return [
        l.description,
        unitDescription,
        l.receptionNumbers || "",
        l.quantity,
        `$${formatCurrency(l.unitPrice)}`,
        `$${formatCurrency(tax)}`,
        retentionText,
        `$${formatCurrency(lineTotal)}`
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
    
    doc.text(`+ ITBIS:`, labelX, finalY + 6);
    doc.text(`$${formatCurrency(boletin.taxAmount)}`, valueX, finalY + 6, { align: 'right' });
    
    // Total Bruto (antes de deducciones)
    const totalBruto = boletin.subTotal + boletin.taxAmount;
    doc.setLineWidth(0.5);
    doc.line(labelX, finalY + 10, valueX, finalY + 10);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Bruto:`, labelX, finalY + 15);
    doc.text(`$${formatCurrency(totalBruto)}`, valueX, finalY + 15, { align: 'right' });
    doc.setFont("helvetica", "normal");
    
    // Sección de Deducciones
    let currentY = finalY + 23;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Deducciones Aplicadas:`, labelX, currentY);
    doc.setFont("helvetica", "normal");
    currentY += 6;

    // Calcular y agrupar retenciones por línea por tipo y porcentaje
    const retentionsByType: { [key: string]: { percent: number; amount: number } } = {};
    const itbisRetentionsByPercent: { [key: string]: number } = {};
    
    (boletin.lines || []).forEach((line: any) => {
      const st = line.quantity * line.unitPrice;
      
      // Agrupar retenciones normales por porcentaje
      if (line.retentionPercent && line.retentionPercent > 0) {
        const retention = st * (line.retentionPercent / 100);
        const key = `${line.retentionPercent}`;
        if (!retentionsByType[key]) {
          retentionsByType[key] = { percent: line.retentionPercent, amount: 0 };
        }
        retentionsByType[key].amount += retention;
      }
      
      // Agrupar retenciones de ITBIS por porcentaje
      if (line.itbisRetentionPercent && line.itbisRetentionPercent > 0) {
        const tax = st * ((line.taxPercent || 0) / 100);
        const itbisRet = tax * (line.itbisRetentionPercent / 100);
        const key = `${line.itbisRetentionPercent}`;
        if (!itbisRetentionsByPercent[key]) {
          itbisRetentionsByPercent[key] = 0;
        }
        itbisRetentionsByPercent[key] += itbisRet;
      }
    });

    // Mostrar retenciones normales desglosadas
    const retentionKeys = Object.keys(retentionsByType);
    if (retentionKeys.length > 0) {
      retentionKeys.forEach(key => {
        const ret = retentionsByType[key];
        const retentionName = availableRetentions.find(r => r.percentage === ret.percent)?.name || `Retención ${ret.percent}%`;
        doc.text(`${retentionName}:`, labelX, currentY);
        doc.text(`-$${formatCurrency(ret.amount)}`, valueX, currentY, { align: 'right' });
        currentY += 6;
      });
    }

    // Mostrar retenciones de ITBIS desglosadas
    const itbisKeys = Object.keys(itbisRetentionsByPercent);
    if (itbisKeys.length > 0) {
      itbisKeys.forEach(key => {
        const amount = itbisRetentionsByPercent[key];
        doc.text(`Retención ITBIS ${key}%:`, labelX, currentY);
        doc.text(`-$${formatCurrency(amount)}`, valueX, currentY, { align: 'right' });
        currentY += 6;
      });
    }

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
    
    // Total Deducciones
    const totalDeducciones = (boletin.retentionAmount || 0) + 
                             (boletin.advanceAmount || 0) + 
                             (boletin.isrAmount || 0) + 
                             Object.values(retentionsByType).reduce((sum, ret) => sum + ret.amount, 0) +
                             Object.values(itbisRetentionsByPercent).reduce((sum, amt) => sum + amt, 0);
    
    if (totalDeducciones > 0) {
      doc.setLineWidth(0.3);
      doc.line(labelX, currentY + 1, valueX, currentY + 1);
      doc.setFont("helvetica", "bold");
      currentY += 5;
      doc.text(`Total Deducciones:`, labelX, currentY);
      doc.text(`-$${formatCurrency(totalDeducciones)}`, valueX, currentY, { align: 'right' });
      currentY += 2;
      doc.setFont("helvetica", "normal");
    }
    
    // Neto a Pagar
    doc.setLineWidth(0.8);
    doc.line(labelX, currentY + 2, valueX, currentY + 2);
    doc.line(labelX, currentY + 3, valueX, currentY + 3);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`NETO A PAGAR:`, labelX, currentY + 9);
    doc.text(`$${formatCurrency(boletin.netTotal)}`, valueX, currentY + 9, { align: 'right' });

    // Open in new tab instead of download
    const string = doc.output('bloburl');
    window.open(string, '_blank');
  };

  const totals = calculateTotals();

  const getScheduledInfo = (boletin: { paymentScheduleLines?: Array<{ paymentSchedule?: { status?: string; scheduleNumber?: string } }> }) => {
    const scheduledLine = boletin.paymentScheduleLines?.find(
      (line) => line?.paymentSchedule?.status !== 'CANCELADA'
    );
    return scheduledLine?.paymentSchedule || null;
  };

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
          <div style={{ marginBottom: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#1976d2' }}>Historial de Boletines Generados</h2>
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

            {/* Filtros y Búsqueda */}
            <div style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '15px', alignItems: 'end' }}>
                {/* Buscador */}
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#555', fontSize: '0.9rem' }}>🔍 Buscar</label>
                  <input
                    type="text"
                    placeholder="Proyecto, Proveedor, N° Boletín..."
                    value={searchHistory}
                    onChange={(e) => setSearchHistory(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }}
                  />
                </div>

                {/* Filtro por Estado */}
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#555', fontSize: '0.9rem' }}>📊 Estado</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem', cursor: 'pointer' }}
                  >
                    <option value="TODOS">Todos</option>
                    <option value="PENDIENTE">Pendientes ({savedBoletines.filter(b => b.status === 'PENDIENTE').length})</option>
                    <option value="APROBADO">Aprobados ({savedBoletines.filter(b => b.status === 'APROBADO').length})</option>
                    <option value="RECHAZADO">Rechazados ({savedBoletines.filter(b => b.status === 'RECHAZADO').length})</option>
                  </select>
                </div>

                {/* Agrupar por Proyecto */}
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#555', fontSize: '0.9rem' }}>📁 Vista</label>
                  <button
                    onClick={() => setGroupByProject(!groupByProject)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #ddd',
                      backgroundColor: groupByProject ? '#1976d2' : 'white',
                      color: groupByProject ? 'white' : '#333',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      fontWeight: '500'
                    }}
                  >
                    {groupByProject ? '📂 Por Proyecto' : '📄 Lista Completa'}
                  </button>
                </div>

                {/* Estadísticas */}
                <div style={{ display: 'flex', gap: '15px', padding: '8px 15px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #ddd' }}>
                  <span style={{ fontSize: '0.85rem', color: '#666' }}>
                    Total: <strong style={{ color: '#1976d2' }}>{savedBoletines.filter(b => statusFilter === 'TODOS' || b.status === statusFilter).length}</strong>
                  </span>
                </div>
              </div>
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
          (() => {
            // Filtrar boletines
            let filteredBoletines = savedBoletines;
            
            // Filtro por estado
            if (statusFilter !== 'TODOS') {
              filteredBoletines = filteredBoletines.filter(b => b.status === statusFilter);
            }
            
            // Filtro por búsqueda
            if (searchHistory.trim()) {
              const search = searchHistory.toLowerCase();
              filteredBoletines = filteredBoletines.filter(b => 
                b.docNumber.toLowerCase().includes(search) ||
                (b.projectName || '').toLowerCase().includes(search) ||
                b.vendorName.toLowerCase().includes(search) ||
                b.docID.toLowerCase().includes(search)
              );
            }

            if (groupByProject) {
              // Agrupar por proyecto
              const groupedByProject: { [key: string]: any[] } = {};
              filteredBoletines.forEach(b => {
                const projectName = b.projectName || 'Sin Proyecto';
                if (!groupedByProject[projectName]) {
                  groupedByProject[projectName] = [];
                }
                groupedByProject[projectName].push(b);
              });

              const toggleProject = (projectName: string) => {
                const newCollapsed = new Set(collapsedProjects);
                if (newCollapsed.has(projectName)) {
                  newCollapsed.delete(projectName);
                } else {
                  newCollapsed.add(projectName);
                }
                setCollapsedProjects(newCollapsed);
              };

              return (
                <div>
                  {Object.keys(groupedByProject).sort().map(projectName => {
                    const projectBoletines = groupedByProject[projectName];
                    // Solo sumar boletines que NO estén RECHAZADOS
                    const projectTotal = projectBoletines
                      .filter(b => b.status !== 'RECHAZADO')
                      .reduce((sum, b) => sum + b.netTotal, 0);
                    // Total de rechazados
                    const totalRechazado = projectBoletines
                      .filter(b => b.status === 'RECHAZADO')
                      .reduce((sum, b) => sum + b.netTotal, 0);
                    const isCollapsed = collapsedProjects.has(projectName);
                    
                    // Contadores por estado
                    const aprobados = projectBoletines.filter(b => b.status === 'APROBADO').length;
                    const pendientes = projectBoletines.filter(b => b.status === 'PENDIENTE').length;
                    const rechazados = projectBoletines.filter(b => b.status === 'RECHAZADO').length;

                    return (
                      <div key={projectName} style={{ marginBottom: '25px' }}>
                        {/* Encabezado del Proyecto */}
                        <div 
                          onClick={() => toggleProject(projectName)}
                          style={{
                            backgroundColor: '#e3f2fd',
                            padding: '15px 20px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            border: '2px solid #1976d2',
                            marginBottom: isCollapsed ? '0' : '10px',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <span style={{ fontSize: '1.2rem' }}>{isCollapsed ? '▶' : '▼'}</span>
                            <div>
                              <h3 style={{ margin: 0, color: '#1976d2', fontSize: '1.1rem' }}>{projectName}</h3>
                              <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '5px', display: 'flex', gap: '12px' }}>
                                <span>{projectBoletines.length} {projectBoletines.length === 1 ? 'boletín' : 'boletines'}</span>
                                {aprobados > 0 && <span style={{ color: '#28a745' }}>✓ {aprobados} aprobado{aprobados > 1 ? 's' : ''}</span>}
                                {pendientes > 0 && <span style={{ color: '#ff9800' }}>⏱ {pendientes} pendiente{pendientes > 1 ? 's' : ''}</span>}
                                {rechazados > 0 && <span style={{ color: '#d32f2f' }}>✕ {rechazados} rechazado{rechazados > 1 ? 's' : ''}</span>}
                              </div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#28a745' }}>
                              ${formatCurrency(projectTotal)}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: rechazados > 0 ? '#666' : '#666' }}>
                              {rechazados > 0 ? 'Total (sin rechazados)' : 'Total Proyecto'}
                            </div>
                            {rechazados > 0 && totalRechazado > 0 && (
                              <div style={{ 
                                fontSize: '0.9rem', 
                                color: '#d32f2f', 
                                marginTop: '5px',
                                fontWeight: '600'
                              }}>
                                -${formatCurrency(totalRechazado)} rechazados
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Tabla de Boletines del Proyecto */}
                        {!isCollapsed && (
                          <div className="table-responsive" style={{ marginLeft: '20px' }}>
                            <table className="data-table history-table">
                              <thead>
                                <tr>
                                  <th style={{ minWidth: '160px', width: '15%' }}>N° BOLETÍN</th>
                                  <th style={{ minWidth: '110px', width: '10%' }}>FECHA</th>
                                  <th style={{ minWidth: '140px', width: '12%' }}>REF (OC / REC)</th>
                                  <th style={{ minWidth: '180px', width: '18%' }}>PROVEEDOR</th>
                                  <th style={{ minWidth: '140px', width: '12%', textAlign: 'right' }}>NETO PAGADO</th>
                                  <th style={{ minWidth: '120px', width: '10%', textAlign: 'center' }}>ESTADO</th>
                                  <th style={{ minWidth: '280px', width: '23%', textAlign: 'center' }}>ACCIONES</th>
                                </tr>
                              </thead>
                              <tbody>
                                {projectBoletines.map(b => {
                  const scheduledInfo = getScheduledInfo(b);
                  return (
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
                      {b.vendorFiscalID && (
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '3px' }}>
                          RNC: {b.vendorFiscalID}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1rem', color: '#28a745' }}>${formatCurrency(b.netTotal)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`status-badge-large status-${b.status.toLowerCase()}`}>
                        {b.status}
                      </span>
                      {scheduledInfo && (
                        <div style={{ marginTop: '6px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#0d47a1', background: '#e3f2fd', border: '1px solid #bbdefb', borderRadius: '999px', padding: '3px 8px', fontWeight: 600 }}>
                            Programado: {scheduledInfo.scheduleNumber}
                          </span>
                        </div>
                      )}
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
                        <button className="btn-action-large btn-pdf" onClick={() => handleGeneratePDF(b)}>
                          <span>📄</span> PDF
                        </button>
                        {b.status === "PENDIENTE" && (
                          <>
                            {!scheduledInfo && (
                              <button className="btn-action-large btn-edit" onClick={() => window.open(`/?editBoletin=${b.id}`, '_blank')}>
                                <span>✏️</span> Editar
                              </button>
                            )}
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
                );})}
              </tbody>
            </table>
          </div>
          )}
        </div>
      );
    })}
    
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
);
            } else {
              // Vista sin agrupar: tabla completa
              return (
                <div className="table-responsive">
                  <table className="data-table history-table">
                    <thead>
                      <tr>
                        <th style={{ minWidth: '160px', width: '15%' }}>N° BOLETÍN</th>
                        <th style={{ minWidth: '110px', width: '10%' }}>FECHA</th>
                        <th style={{ minWidth: '140px', width: '12%' }}>REF (OC / REC)</th>
                        <th style={{ minWidth: '200px', width: '16%' }}>PROYECTO</th>
                        <th style={{ minWidth: '180px', width: '18%' }}>PROVEEDOR</th>
                        <th style={{ minWidth: '140px', width: '12%', textAlign: 'right' }}>NETO PAGADO</th>
                        <th style={{ minWidth: '120px', width: '10%', textAlign: 'center' }}>ESTADO</th>
                        <th style={{ minWidth: '280px', width: '17%', textAlign: 'center' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBoletines.map(b => {
                        const scheduledInfo = getScheduledInfo(b);
                        return (
                        <tr key={b.id}>
                          <td style={{ fontWeight: '600', color: '#1976d2' }}>{b.docNumber}</td>
                          <td>{new Date(b.date).toLocaleDateString('es-DO')}</td>
                          <td><div style={{ fontSize: '0.85rem', color: '#666' }}>{b.docID}</div></td>
                          <td className="project-cell-large">{b.projectName || 'Sin Proyecto'}</td>
                          <td className="vendor-cell-large">{b.vendorName}</td>
                          <td style={{ textAlign: 'right', fontWeight: '700', color: '#28a745', fontSize: '1rem' }}>
                            ${formatCurrency(b.netTotal)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`status-badge status-${b.status.toLowerCase()}`}>{b.status}</span>
                            {scheduledInfo && (
                              <div style={{ marginTop: '6px' }}>
                                <span style={{ fontSize: '0.72rem', color: '#0d47a1', background: '#e3f2fd', border: '1px solid #bbdefb', borderRadius: '999px', padding: '2px 8px', fontWeight: 600 }}>
                                  {scheduledInfo.scheduleNumber}
                                </span>
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="action-buttons-container-large">
                              <button className="btn-action-large btn-pdf" onClick={() => handleGeneratePDF(b)}>
                                <span>📄</span> PDF
                              </button>
                              {b.status === "PENDIENTE" && (
                                <>
                                  {!scheduledInfo && (
                                    <button className="btn-action-large btn-edit" onClick={() => window.open(`/?editBoletin=${b.id}`, '_blank')}>
                                      <span>✏️</span> Editar
                                    </button>
                                  )}
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
                      );})}
                    </tbody>
                  </table>
                </div>
              );
            }
          })()
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
              {Object.entries(groupedTransactions).map(([projectName, txs]) => {
                const projectTotal = txs.reduce((sum, tx) => sum + tx.TotalAmount, 0);
                
                return (
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
                    <div>
                      <span style={{ fontSize: '1.1rem' }}>Proyecto: <strong>{projectName}</strong></span>
                      <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '5px' }}>
                        {txs.length} {txs.length === 1 ? 'Orden' : 'Órdenes'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#28a745' }}>
                        ${formatCurrency(projectTotal)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>Total Proyecto</div>
                    </div>
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
                          <td>
                            <div>{tx.VendorName}</div>
                            {tx.VendorFiscalID && (
                              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '2px' }}>
                                RNC: {tx.VendorFiscalID}
                              </div>
                            )}
                          </td>
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
              );
              })}
              
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
                        {filteredTxs.length} {filteredTxs.length === 1 ? 'orden generada' : 'órdenes generadas'} • {Object.keys(groupedTransactions).length} {Object.keys(groupedTransactions).length === 1 ? 'proyecto' : 'proyectos'}
                      </p>
                      <button
                        onClick={exportToExcel}
                        style={{
                          marginTop: '12px',
                          padding: '10px 20px',
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <span>📊</span> Exportar a Excel
                      </button>
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
            {selectedTx.VendorFiscalID && (
              <p><strong>RNC/Cédula:</strong> {selectedTx.VendorFiscalID}</p>
            )}
            <p><strong>Proyecto:</strong> {selectedTx.ProjectName || 'General'}</p>
            {measurementStartDate && measurementEndDate && (() => {
              // Parsear fechas sin problemas de zona horaria
              const startDate = new Date(measurementStartDate.split('T')[0] + 'T12:00:00').toLocaleDateString('es-ES');
              const endDate = new Date(measurementEndDate.split('T')[0] + 'T12:00:00').toLocaleDateString('es-ES');
              return <p><strong>Periodo:</strong> Desde {startDate} y hasta {endDate}</p>;
            })()}
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
                    <th style={{ width: '220px' }}>Unidad</th>
                    <th>Precio Unit.</th>
                    <th>Impuesto</th>
                    <th style={{ textAlign: 'right', width: '100px' }}>Total Impuesto</th>
                    <th style={{ width: '160px' }}>Ret. ITBIS %</th>
                    <th style={{ width: '160px' }}>Retención</th>
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
                    const hasRegisteredMeasurement = (item?.ReceivedQuantity || 0) > 0;
                    const canSelectLine = line.selected || (hasRegisteredMeasurement && available > 0);
                    const normalizedUnit = normalizeUnitOfMeasure(line.unitOfMeasure);
                    const previousUnit = normalizeUnitOfMeasure(line.previousUnitOfMeasure);
                    const isUnitMissing = line.selected && !normalizedUnit;
                    const isUnitMismatch = line.selected && !!previousUnit && normalizedUnit !== previousUnit;

                    return (
                      <tr key={idx} style={{ backgroundColor: isOverpaid ? '#fff5f5' : 'inherit' }}>
                        <td>
                          <input 
                            type="checkbox" 
                            checked={line.selected} 
                            onChange={(e) => updateLine(idx, 'selected', e.target.checked)}
                            disabled={!canSelectLine}
                            title={!canSelectLine ? 'Partida sin medición registrada o sin cantidad disponible' : ''}
                          />
                        </td>
                        <td>{line.description}</td>
                        <td style={{ textAlign: 'center' }}>{item?.ReceivedQuantity}</td>
                        <td style={{ textAlign: 'center', color: '#666' }}>{paidByOthers}</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: available > 0 ? '#28a745' : '#d32f2f' }}>
                          {available}
                          {!hasRegisteredMeasurement && (
                            <div style={{ color: '#d32f2f', fontSize: '0.7rem', marginTop: '2px' }}>Sin medición</div>
                          )}
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
                        <td>
                          <select
                            value={line.unitOfMeasure || ''}
                            onChange={(e) => updateLine(idx, 'unitOfMeasure', e.target.value)}
                            style={{
                              width: '220px',
                              fontSize: '0.85rem',
                              padding: '4px 6px',
                              border: (isUnitMissing || isUnitMismatch) ? '1px solid #d32f2f' : '1px solid #ddd',
                              borderRadius: '4px',
                              backgroundColor: line.selected ? '#fff' : '#f5f5f5',
                              color: (isUnitMissing || isUnitMismatch) ? '#d32f2f' : '#000'
                            }}
                            disabled={!line.selected}
                          >
                            <option value="">Seleccione</option>
                            {getUnitOptionsForLine(line).map((unit) => (
                              <option key={`${unit.id}-${unit.code}`} value={unit.code}>
                                {unit.code} - {unit.name}
                              </option>
                            ))}
                          </select>
                          {isUnitMissing && (
                            <div style={{ color: '#d32f2f', fontSize: '0.7rem', marginTop: '2px' }}>Seleccione unidad</div>
                          )}
                          {isUnitMismatch && (
                            <div style={{ color: '#d32f2f', fontSize: '0.7rem', marginTop: '2px' }}>
                              Debe ser: {previousUnit}
                            </div>
                          )}
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
                      <td style={{ textAlign: 'right', color: line.selected ? '#ff9800' : '#999', fontWeight: '500' }}>
                        {line.selected ? `+$${formatCurrency((line.quantity * line.unitPrice) * (line.taxPercent / 100))}` : '$0.00'}
                      </td>
                      <td>
                        <select 
                          value={line.itbisRetentionPercent || 0}
                          onChange={(e) => updateLine(idx, 'itbisRetentionPercent', Number(e.target.value))}
                          disabled={!line.selected || line.taxPercent === 0}
                          style={{ 
                            width: '160px',
                            fontSize: '0.85rem',
                            padding: '6px 10px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            backgroundColor: (line.selected && line.taxPercent > 0) ? '#fff' : '#f5f5f5',
                            cursor: (line.selected && line.taxPercent > 0) ? 'pointer' : 'not-allowed'
                          }}
                        >
                          <option value={0}>No retener (0%)</option>
                          <option value={10}>Retener 10%</option>
                          <option value={100}>Retener 100%</option>
                        </select>
                      </td>
                      <td>
                        <select 
                          value={line.retentionPercent || 0}
                          onChange={(e) => updateLine(idx, 'retentionPercent', Number(e.target.value))}
                          disabled={!line.selected}
                          style={{ 
                            width: '160px',
                            fontSize: '0.85rem',
                            padding: '6px 10px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            backgroundColor: line.selected ? '#fff' : '#f5f5f5',
                            cursor: line.selected ? 'pointer' : 'not-allowed'
                          }}
                        >
                          <option value={0}>Sin retención (0%)</option>
                          {availableRetentions.map(ret => (
                            <option key={ret.id} value={ret.percentage}>
                              {ret.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ textAlign: 'right', color: line.selected ? '#d32f2f' : '#999', fontWeight: '500' }}>
                        {line.selected ? `-$${formatCurrency((line.quantity * line.unitPrice) * ((line.retentionPercent || 0) / 100))}` : '$0.00'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: line.selected ? 'bold' : 'normal', color: line.selected ? '#000' : '#999' }}>
                        {line.selected ? `$${formatCurrency(
                          (line.quantity * line.unitPrice) * (1 + (line.taxPercent / 100)) 
                          - (line.quantity * line.unitPrice) * ((line.retentionPercent || 0) / 100)
                          - ((line.quantity * line.unitPrice) * (line.taxPercent / 100)) * ((line.itbisRetentionPercent || 0) / 100)
                        )}` : '$0.00'}
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
              <h4 style={{ marginBottom: '20px', borderBottom: '2px solid #1976d2', paddingBottom: '10px' }}>Retenciones y Deducciones</h4>
              
              {/* Retenciones aplicadas por línea */}
              {getRetentionsSummary().length > 0 && (
                <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                  <h5 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '0.9rem', fontWeight: 600 }}>📋 Retenciones por Línea</h5>
                  {getRetentionsSummary().map((ret, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '8px', backgroundColor: '#fff', borderRadius: '4px' }}>
                      <span style={{ fontSize: '0.85rem', color: '#555' }}>
                        <strong>{ret.name}</strong> ({ret.percent}%)
                      </span>
                      <span style={{ color: '#d32f2f', fontWeight: '600', fontSize: '0.9rem' }}>${formatCurrency(ret.total)}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: '0.9rem' }}>Total Retenciones:</strong>
                    <strong style={{ color: '#d32f2f', fontSize: '0.95rem' }}>${formatCurrency(totals.totalRetentionByLine)}</strong>
                  </div>
                </div>
              )}
            </div>

            <div className="summary-panel" style={{ padding: '20px', backgroundColor: '#fafafa', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
              <h4 style={{ marginBottom: '20px', borderBottom: '2px solid #1976d2', paddingBottom: '10px' }}>💰 Resumen Económico</h4>
              
              <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.95rem' }}>
                  <span>Subtotal:</span>
                  <strong>${formatCurrency(totals.subTotal)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.95rem', color: '#ff9800' }}>
                  <span>+ ITBIS:</span>
                  <strong>${formatCurrency(totals.totalTax)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #e0e0e0', fontSize: '1rem' }}>
                  <strong>Total Bruto:</strong>
                  <strong>${formatCurrency(totals.subTotal + totals.totalTax)}</strong>
                </div>
              </div>
              
              {(totals.totalRetentionByLine > 0 || totals.totalItbisRetention > 0 || totals.retAmount > 0 || totals.advAmount > 0 || totals.isrAmount > 0) && (
                <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff3e0', borderRadius: '6px', border: '1px solid #ffb74d' }}>
                  <h5 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#e65100' }}>Deducciones Aplicadas:</h5>
                  {getRetentionsSummary().map((ret, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem', paddingLeft: '10px' }}>
                      <span>{ret.name}</span>
                      <span style={{ color: '#d32f2f', fontWeight: '600' }}>-${formatCurrency(ret.total)}</span>
                    </div>
                  ))}
                  {totals.totalItbisRetention > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem', paddingLeft: '10px' }}>
                      <span>Retención de ITBIS</span>
                      <span style={{ color: '#d32f2f', fontWeight: '600' }}>-${formatCurrency(totals.totalItbisRetention)}</span>
                    </div>
                  )}
                  {totals.retAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem', paddingLeft: '10px' }}>
                      <span>Fondo de Reparo ({retentionPercent}%)</span>
                      <span style={{ color: '#d32f2f', fontWeight: '600' }}>-${formatCurrency(totals.retAmount)}</span>
                    </div>
                  )}
                  {totals.advAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem', paddingLeft: '10px' }}>
                      <span>Amort. Anticipo ({advancePercent}%)</span>
                      <span style={{ color: '#d32f2f', fontWeight: '600' }}>-${formatCurrency(totals.advAmount)}</span>
                    </div>
                  )}
                  {totals.isrAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem', paddingLeft: '10px' }}>
                      <span>ISR ({isrPercent}%)</span>
                      <span style={{ color: '#d32f2f', fontWeight: '600' }}>-${formatCurrency(totals.isrAmount)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #ffb74d' }}>
                    <strong style={{ fontSize: '0.9rem' }}>Total Deducciones:</strong>
                    <strong style={{ color: '#d32f2f', fontSize: '0.9rem' }}>-${formatCurrency(totals.totalRetentionByLine + totals.totalItbisRetention + totals.retAmount + totals.advAmount + totals.isrAmount)}</strong>
                  </div>
                </div>
              )}
              
              <div style={{ padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '6px', border: '2px solid #1976d2', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1976d2' }}>Neto a Pagar:</span>
                  <strong style={{ fontSize: '1.4rem', color: '#1976d2' }}>${formatCurrency(totals.net)}</strong>
                </div>
              </div>
              
              <button 
                className="btn-secondary" 
                style={{ marginTop: '10px', width: '100%', padding: '12px', fontSize: '0.95rem', fontWeight: '600', background: '#6c757d' }}
                disabled={linesToPay.filter(l=>l.selected).length === 0}
                onClick={() => {
                  console.log('🔍 DEBUG Vista Previa - measurementStartDate:', measurementStartDate);
                  console.log('🔍 DEBUG Vista Previa - measurementEndDate:', measurementEndDate);
                  console.log('🔍 DEBUG Vista Previa - selectedTx:', selectedTx);
                  console.log('🔍 DEBUG Vista Previa - linesToPay seleccionadas:', linesToPay.filter(l=>l.selected).length);
                  
                  // Calcular totales
                  const totalsCalc = calculateTotals();
                  console.log('💰 Totales calculados:', totalsCalc);
                  
                  const tempBoletin = {
                    docNumber: editingId ? savedBoletines.find(b=>b.id===editingId)?.docNumber : 'PREVIEW',
                    date: new Date(),
                    docID: selectedTx?.DocID || 'N/A',
                    vendorName: selectedTx?.VendorName || 'N/A',
                    vendorFiscalID: selectedTx?.VendorFiscalID || '',
                    projectName: selectedTx?.ProjectName || 'General',
                    measurementStartDate,
                    measurementEndDate,
                    receptionNumbers: [...new Set(linesToPay.filter(l=>l.selected).flatMap(l => l.receptionNumbers.split(',').map((r:string) => r.trim()).filter((r:string)=>r)))].join(', '),
                    lines: linesToPay.filter(l=>l.selected),
                    retentionPercent,
                    advancePercent,
                    isrPercent,
                    status: editingId ? savedBoletines.find(b=>b.id===editingId)?.status : 'PENDIENTE',
                    rejectionReason: editingId ? savedBoletines.find(b=>b.id===editingId)?.rejectionReason : null,
                    // Agregar totales calculados
                    subTotal: totalsCalc.subTotal,
                    taxAmount: totalsCalc.totalTax,
                    retentionAmount: totalsCalc.retAmount,
                    advanceAmount: totalsCalc.advAmount,
                    isrAmount: totalsCalc.isrAmount,
                    netTotal: totalsCalc.net
                  };
                  
                  console.log('📄 Generando PDF con objeto completo:', tempBoletin);
                  generatePDF(tempBoletin);
                }}
              >
                📄 Vista Previa PDF
              </button>
              
              <button 
                className="btn-primary" 
                style={{ marginTop: '10px', width: '100%', padding: '15px', fontSize: '1rem', fontWeight: '600' }}
                disabled={isSaving || linesToPay.filter(l=>l.selected).length === 0}
                onClick={saveBoletin}
              >
                {isSaving ? '⏳ Guardando...' : (editingId ? '📝 Actualizar Boletín' : '✅ Generar Solicitud de Pago')}
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
