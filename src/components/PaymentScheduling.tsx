import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';

type PaymentRequestStatus = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

type PaymentRequest = {
  id: number;
  docNumber: string;
  docID: string;
  date: string;
  vendorName: string;
  projectName?: string | null;
  netTotal: number;
  status: PaymentRequestStatus;
};

type PaymentSchedule = {
  id: number;
  scheduleNumber: string;
  date: string;
  commitmentDate: string;
  paymentDate: string;
  status: 'PENDIENTE_APROBACION' | 'APROBADA' | 'ENVIADA_FINANZAS' | 'CANCELADA';
  notes?: string | null;
  auditLogs?: Array<{
    id: number;
    action: string;
    statusBefore?: string | null;
    statusAfter?: string | null;
    detail?: string | null;
    createdBy?: string | null;
    createdAt: string;
  }>;
  lines: Array<{
    id: number;
    paymentRequest: PaymentRequest;
  }>;
};

const formatCurrency = (num: number) =>
  num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getTodayInputDate = () => new Date().toISOString().split('T')[0];

const toInputDate = (value?: string | null) => {
  if (!value) return getTodayInputDate();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return getTodayInputDate();
  return parsed.toISOString().split('T')[0];
};

const toUtcStartTime = (value: string) => new Date(`${value}T00:00:00.000Z`).getTime();

const statusLabel = (status: string) => {
  if (status === 'PENDIENTE_APROBACION') return 'Pendiente de aprobación';
  if (status === 'APROBADA') return 'Aprobada';
  if (status === 'ENVIADA_FINANZAS') return 'Enviada a finanzas';
  if (status === 'CANCELADA') return 'Cancelada';
  return status;
};

const actionLabel = (action: string) => {
  const labels: Record<string, string> = {
    CREATED: 'Creada',
    UPDATED: 'Editada',
    APPROVED: 'Aprobada',
    SENT_TO_FINANCE: 'Enviada a finanzas',
    FLOW_RESTARTED: 'Flujo reiniciado',
    CANCELED: 'Cancelada'
  };

  return labels[action] || action;
};

const getVisibleScheduleLines = (schedule: PaymentSchedule) =>
  schedule.lines.filter((line) => line.paymentRequest.status !== 'RECHAZADO');

export const PaymentScheduling: React.FC = () => {
  const { user } = useAuth();
  const scheduleEditParam = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('paymentScheduleEdit');
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }, []);
  const isScheduleEditTab = scheduleEditParam !== null;
  const canApprovePaymentRequests = user?.role === 'admin' || user?.accessContabilidad === true;

  const [eligibleRequests, setEligibleRequests] = useState<PaymentRequest[]>([]);
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState<'TODOS' | PaymentSchedule['status']>('TODOS');
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [editingWasApproved, setEditingWasApproved] = useState(false);
  const [editingOriginalRequestIds, setEditingOriginalRequestIds] = useState<number[]>([]);
  const [editingOriginalNotes, setEditingOriginalNotes] = useState('');
  const [editingOriginalCommitmentDate, setEditingOriginalCommitmentDate] = useState(getTodayInputDate());
  const [editingOriginalPaymentDate, setEditingOriginalPaymentDate] = useState(getTodayInputDate());
  const [selectedRequestIds, setSelectedRequestIds] = useState<number[]>([]);
  const [commitmentDate, setCommitmentDate] = useState(getTodayInputDate());
  const [paymentDate, setPaymentDate] = useState(getTodayInputDate());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approvingRequestId, setApprovingRequestId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [initializedFromUrl, setInitializedFromUrl] = useState(false);

  const getErrorMessage = (value: unknown, fallback: string) =>
    value instanceof Error ? value.message : fallback;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [eligibleRes, schedulesRes] = await Promise.all([
        fetch('http://localhost:5000/api/payment-schedules/eligible-payment-requests', { headers }),
        fetch('http://localhost:5000/api/payment-schedules', { headers })
      ]);

      if (!eligibleRes.ok || !schedulesRes.ok) {
        throw new Error('No se pudo cargar la información de programación de pagos');
      }

      const eligibleData = await eligibleRes.json();
      const schedulesData = await schedulesRes.json();

      const eligibleWithoutRejected = Array.isArray(eligibleData)
        ? eligibleData.filter((request: PaymentRequest) => request.status !== 'RECHAZADO')
        : [];

      setEligibleRequests(eligibleWithoutRejected);
      setSchedules(schedulesData);
    } catch (fetchError: unknown) {
      setError(getErrorMessage(fetchError, 'Error al cargar datos'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedTotal = useMemo(
    () => {
      const editingSchedule = schedules.find((schedule) => schedule.id === editingScheduleId);
      const editingLines = editingSchedule ? getVisibleScheduleLines(editingSchedule) : [];
      const requestsMap = new Map<number, PaymentRequest>();

      eligibleRequests.forEach((request) => {
        requestsMap.set(request.id, request);
      });

      editingLines.forEach((line) => {
        requestsMap.set(line.paymentRequest.id, line.paymentRequest);
      });

      return Array.from(requestsMap.values())
      .filter((request) => selectedRequestIds.includes(request.id))
      .reduce((sum, request) => sum + (Number(request.netTotal) || 0), 0);
    },
    [eligibleRequests, schedules, editingScheduleId, selectedRequestIds]
  );

  const selectableRequests = useMemo(() => {
    const editingSchedule = schedules.find((schedule) => schedule.id === editingScheduleId);
    if (!editingSchedule) {
      return eligibleRequests;
    }

    const requestsMap = new Map<number, PaymentRequest>();
    eligibleRequests.forEach((request) => {
      requestsMap.set(request.id, request);
    });

    getVisibleScheduleLines(editingSchedule).forEach((line) => {
      requestsMap.set(line.paymentRequest.id, line.paymentRequest);
    });

    return Array.from(requestsMap.values());
  }, [eligibleRequests, schedules, editingScheduleId]);

  const filteredSchedules = useMemo(() => {
    if (scheduleStatusFilter === 'TODOS') {
      return schedules;
    }
    return schedules.filter((schedule) => schedule.status === scheduleStatusFilter);
  }, [schedules, scheduleStatusFilter]);

  const hasEditChanges = useMemo(() => {
    if (!editingScheduleId) {
      return true;
    }

    const normalizedCurrentNotes = notes.trim();
    const normalizedOriginalNotes = editingOriginalNotes.trim();
    const notesChanged = normalizedCurrentNotes !== normalizedOriginalNotes;
    const commitmentDateChanged = commitmentDate !== editingOriginalCommitmentDate;
    const paymentDateChanged = paymentDate !== editingOriginalPaymentDate;

    const currentIds = [...selectedRequestIds].sort((a, b) => a - b);
    const originalIds = [...editingOriginalRequestIds].sort((a, b) => a - b);

    if (currentIds.length !== originalIds.length) {
      return true;
    }

    const idsChanged = currentIds.some((id, index) => id !== originalIds[index]);
    return notesChanged || idsChanged || commitmentDateChanged || paymentDateChanged;
  }, [editingScheduleId, notes, editingOriginalNotes, selectedRequestIds, editingOriginalRequestIds, commitmentDate, editingOriginalCommitmentDate, paymentDate, editingOriginalPaymentDate]);

  const toggleRequest = (requestId: number) => {
    setSelectedRequestIds((prev) => {
      const isRemoving = prev.includes(requestId);
      if (editingScheduleId !== null && isRemoving && prev.length === 1) {
        const confirmed = window.confirm('Este es el único boletín de la programación. Si lo quita, la programación quedará en cero. ¿Desea continuar?');
        if (!confirmed) {
          return prev;
        }
      }

      return isRemoving ? prev.filter((id) => id !== requestId) : [...prev, requestId];
    });
  };

  const createSchedule = async () => {
    if (!commitmentDate) {
      alert('Seleccione la fecha del compromiso.');
      return;
    }

    if (!paymentDate) {
      alert('Seleccione la fecha de pago.');
      return;
    }

    if (selectedRequestIds.length === 0 && editingScheduleId === null) {
      alert('Seleccione al menos un boletín para programar.');
      return;
    }

    const editingSchedule = schedules.find((schedule) => schedule.id === editingScheduleId);
    const scheduleDateBase = editingSchedule ? toInputDate(editingSchedule.date) : getTodayInputDate();
    if (toUtcStartTime(paymentDate) < toUtcStartTime(scheduleDateBase)) {
      alert('La fecha de pago debe ser igual o mayor a la fecha de programación.');
      return;
    }

    const commitmentLimit = new Date(`${commitmentDate}T23:59:59.999Z`).getTime();
    const selectedRequests = selectableRequests.filter((request) => selectedRequestIds.includes(request.id));
    const invalidRequest = selectedRequests.find((request) => {
      const requestDate = new Date(request.date).getTime();
      return Number.isFinite(requestDate) && requestDate > commitmentLimit;
    });

    if (invalidRequest) {
      alert(`El boletín ${invalidRequest.docNumber} tiene fecha mayor a la fecha del compromiso.`);
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (editingScheduleId && !hasEditChanges) {
        alert('No hay cambios para guardar en la programación.');
        setSaving(false);
        return;
      }

      if (editingScheduleId && editingWasApproved) {
        const confirmed = window.confirm('Esta programación está aprobada. Al guardar cambios perderá la aprobación y volverá a pendiente. ¿Desea continuar?');
        if (!confirmed) {
          setSaving(false);
          return;
        }
      }

      const isEditing = editingScheduleId !== null;
      if (isEditing && selectedRequestIds.length === 0) {
        const confirmZeroSave = window.confirm('La programación quedará con cero boletines. ¿Desea guardar este cambio?');
        if (!confirmZeroSave) {
          setSaving(false);
          return;
        }
      }

      const response = await fetch(
        isEditing
          ? `http://localhost:5000/api/payment-schedules/${editingScheduleId}`
          : 'http://localhost:5000/api/payment-schedules',
        {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          paymentRequestIds: selectedRequestIds,
          commitmentDate,
          paymentDate,
          notes
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Error al crear programación');
      }

      const updatedScheduleForPdf: PaymentSchedule | null = isEditing
        ? {
            id: Number(data.id),
            scheduleNumber: data.scheduleNumber,
            date: data.date,
            commitmentDate: data.commitmentDate,
            paymentDate: data.paymentDate,
            status: data.status,
            notes: data.notes,
            lines: Array.isArray(data.lines)
              ? data.lines.map((line: { id: number; paymentRequest: PaymentRequest }) => ({
                  id: line.id,
                  paymentRequest: line.paymentRequest
                }))
              : []
          }
        : null;

      setSelectedRequestIds([]);
      setNotes('');
      setEditingScheduleId(null);
      setEditingWasApproved(false);
      setEditingOriginalRequestIds([]);
      setEditingOriginalNotes('');
      setEditingOriginalCommitmentDate(getTodayInputDate());
      setEditingOriginalPaymentDate(getTodayInputDate());
      setCommitmentDate(getTodayInputDate());
      setPaymentDate(getTodayInputDate());
      setError('');
      await fetchData();
      if (isEditing) {
        if (updatedScheduleForPdf) {
          exportScheduleToPDF(updatedScheduleForPdf);
        }
        if (data?.approvalReset) {
          alert('Programación actualizada. Advertencia: perdió el estado de aprobación y quedó pendiente.');
        } else {
          alert('Programación actualizada con éxito.');
        }

        if (isScheduleEditTab) {
          window.close();
        }
      } else {
        alert(`Programación ${data.scheduleNumber} creada con éxito.`);
      }
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, 'Error al crear programación'));
    } finally {
      setSaving(false);
    }
  };

  const cancelEditMode = () => {
    setError('');
    setEditingScheduleId(null);
    setEditingWasApproved(false);
    setEditingOriginalRequestIds([]);
    setEditingOriginalNotes('');
    setEditingOriginalCommitmentDate(getTodayInputDate());
    setEditingOriginalPaymentDate(getTodayInputDate());
    setSelectedRequestIds([]);
    setCommitmentDate(getTodayInputDate());
    setPaymentDate(getTodayInputDate());
    setNotes('');
  };

  useEffect(() => {
    if (!isScheduleEditTab || initializedFromUrl || loading) {
      return;
    }

    if (schedules.length === 0) {
      return;
    }

    const targetSchedule = schedules.find((schedule) => schedule.id === scheduleEditParam);
    if (!targetSchedule) {
      setError('No se encontró la programación solicitada para editar.');
      setInitializedFromUrl(true);
      return;
    }

    if (targetSchedule.status === 'ENVIADA_FINANZAS') {
      setError('No se puede editar una programación enviada a finanzas.');
      setInitializedFromUrl(true);
      return;
    }

    const editableLines = getVisibleScheduleLines(targetSchedule);
    const editableIds = editableLines.map((line) => line.paymentRequest.id);
    setError('');
    setEditingScheduleId(targetSchedule.id);
    setEditingWasApproved(targetSchedule.status === 'APROBADA');
    setSelectedRequestIds(editableIds);
    setEditingOriginalRequestIds(editableIds);
    const scheduleCommitmentDate = toInputDate(targetSchedule.commitmentDate);
    setCommitmentDate(scheduleCommitmentDate);
    setEditingOriginalCommitmentDate(scheduleCommitmentDate);
    const schedulePaymentDate = toInputDate(targetSchedule.paymentDate);
    setPaymentDate(schedulePaymentDate);
    setEditingOriginalPaymentDate(schedulePaymentDate);
    setNotes(targetSchedule.notes || '');
    setEditingOriginalNotes(targetSchedule.notes || '');
    setInitializedFromUrl(true);
  }, [isScheduleEditTab, initializedFromUrl, loading, schedules, scheduleEditParam]);

  const approveSchedule = async (scheduleId: number) => {
    try {
      const response = await fetch(`http://localhost:5000/api/payment-schedules/${scheduleId}/approve`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Error al aprobar programación');
      }

      await fetchData();
      alert('Programación aprobada.');
    } catch (approvalError: unknown) {
      setError(getErrorMessage(approvalError, 'Error al aprobar programación'));
    }
  };

  const approvePaymentRequest = async (paymentRequestId: number) => {
    setApprovingRequestId(paymentRequestId);
    try {
      const response = await fetch(`http://localhost:5000/api/payment-requests/${paymentRequestId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: 'APROBADO' })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Error al aprobar boletín');
      }

      await fetchData();
      alert('Boletín aprobado con éxito.');
    } catch (approvalError: unknown) {
      setError(getErrorMessage(approvalError, 'Error al aprobar boletín'));
    } finally {
      setApprovingRequestId(null);
    }
  };

  const sendToFinance = async (scheduleId: number) => {
    try {
      const response = await fetch(`http://localhost:5000/api/payment-schedules/${scheduleId}/send-to-finance`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();
      if (!response.ok) {
        if (Array.isArray(data?.boletinesPendientes) && data.boletinesPendientes.length > 0) {
          const pendingDocs = data.boletinesPendientes.map((b: { docNumber: string }) => b.docNumber).join(', ');
          throw new Error(`${data.message}. Boletines pendientes: ${pendingDocs}`);
        }
        throw new Error(data?.message || 'Error al enviar programación a finanzas');
      }

      await fetchData();
      alert('Programación enviada a finanzas.');
    } catch (sendError: unknown) {
      setError(getErrorMessage(sendError, 'Error al enviar a finanzas'));
    }
  };

  const exportScheduleToExcel = (schedule: PaymentSchedule) => {
    const visibleLines = getVisibleScheduleLines(schedule);
    const rows: Array<{
      Boletin: string;
      OC: string;
      Proyecto: string;
      Proveedor: string;
      Estado: string;
      Neto: number;
    }> = visibleLines.map((line) => ({
      Boletin: line.paymentRequest.docNumber,
      OC: line.paymentRequest.docID,
      Proyecto: line.paymentRequest.projectName || 'Sin proyecto',
      Proveedor: line.paymentRequest.vendorName,
      Estado: line.paymentRequest.status,
      Neto: Number(line.paymentRequest.netTotal) || 0
    }));

    const total = visibleLines.reduce((sum, line) => sum + (Number(line.paymentRequest.netTotal) || 0), 0);
    rows.push({
      Boletin: '',
      OC: '',
      Proyecto: '',
      Proveedor: 'TOTAL PROGRAMACIÓN',
      Estado: '',
      Neto: total
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 18 },
      { wch: 15 },
      { wch: 28 },
      { wch: 30 },
      { wch: 14 },
      { wch: 18 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Programacion');
    XLSX.writeFile(wb, `${schedule.scheduleNumber}.xlsx`);
  };

  const exportScheduleToPDF = (schedule: PaymentSchedule) => {
    const visibleLines = getVisibleScheduleLines(schedule);
    const total = visibleLines.reduce((sum, line) => sum + (Number(line.paymentRequest.netTotal) || 0), 0);

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Programación de Pagos ${schedule.scheduleNumber}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date(schedule.date).toLocaleDateString('es-DO')}`, 14, 25);
    doc.text(`Estado: ${statusLabel(schedule.status)}`, 14, 31);

    autoTable(doc, {
      startY: 36,
      head: [['Boletín', 'OC', 'Proyecto', 'Proveedor', 'Estado', 'Neto']],
      body: visibleLines.map((line) => [
        line.paymentRequest.docNumber,
        line.paymentRequest.docID,
        line.paymentRequest.projectName || 'Sin proyecto',
        line.paymentRequest.vendorName,
        line.paymentRequest.status,
        `$${formatCurrency(Number(line.paymentRequest.netTotal) || 0)}`
      ])
    });

    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 36;
    doc.setFontSize(11);
    doc.text(`Total programación: $${formatCurrency(total)}`, 14, finalY + 10);
    doc.save(`${schedule.scheduleNumber}.pdf`);
  };

  const exportFilteredSchedulesToExcel = () => {
    if (filteredSchedules.length === 0) {
      alert('No hay programaciones en el filtro actual para exportar.');
      return;
    }

    const rows: Array<{
      Programacion: string;
      Fecha: string;
      EstadoProgramacion: string;
      Boletin: string;
      OC: string;
      Proyecto: string;
      Proveedor: string;
      EstadoBoletin: string;
      Neto: number;
    }> = [];

    let globalTotal = 0;

    filteredSchedules.forEach((schedule) => {
      const visibleLines = getVisibleScheduleLines(schedule);
      const scheduleTotal = visibleLines.reduce((sum, line) => sum + (Number(line.paymentRequest.netTotal) || 0), 0);
      globalTotal += scheduleTotal;

      visibleLines.forEach((line) => {
        rows.push({
          Programacion: schedule.scheduleNumber,
          Fecha: new Date(schedule.date).toLocaleDateString('es-DO'),
          EstadoProgramacion: statusLabel(schedule.status),
          Boletin: line.paymentRequest.docNumber,
          OC: line.paymentRequest.docID,
          Proyecto: line.paymentRequest.projectName || 'Sin proyecto',
          Proveedor: line.paymentRequest.vendorName,
          EstadoBoletin: line.paymentRequest.status,
          Neto: Number(line.paymentRequest.netTotal) || 0
        });
      });

      rows.push({
        Programacion: schedule.scheduleNumber,
        Fecha: '',
        EstadoProgramacion: '',
        Boletin: '',
        OC: '',
        Proyecto: '',
        Proveedor: 'TOTAL PROGRAMACIÓN',
        EstadoBoletin: '',
        Neto: scheduleTotal
      });
    });

    rows.push({
      Programacion: '',
      Fecha: '',
      EstadoProgramacion: '',
      Boletin: '',
      OC: '',
      Proyecto: '',
      Proveedor: 'TOTAL GLOBAL FILTRO',
      EstadoBoletin: '',
      Neto: globalTotal
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 16 },
      { wch: 12 },
      { wch: 20 },
      { wch: 16 },
      { wch: 14 },
      { wch: 24 },
      { wch: 28 },
      { wch: 14 },
      { wch: 16 }
    ];

    rows.forEach((row, idx) => {
      if (row.Proveedor !== 'TOTAL PROGRAMACIÓN' && row.Proveedor !== 'TOTAL GLOBAL FILTRO') {
        return;
      }

      const excelRow = idx + 2;
      const labelCell = ws[`G${excelRow}`];
      const amountCell = ws[`I${excelRow}`];

      if (labelCell) {
        labelCell.v = row.Proveedor === 'TOTAL GLOBAL FILTRO' ? '🔷 TOTAL GLOBAL FILTRO' : '▪ TOTAL PROGRAMACIÓN';
        labelCell.s = {
          font: { bold: true },
          fill: { fgColor: { rgb: row.Proveedor === 'TOTAL GLOBAL FILTRO' ? 'D9EAF7' : 'F2F2F2' } }
        };
      }

      if (amountCell) {
        amountCell.s = {
          font: { bold: true },
          fill: { fgColor: { rgb: row.Proveedor === 'TOTAL GLOBAL FILTRO' ? 'D9EAF7' : 'F2F2F2' } }
        };
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Programaciones');
    XLSX.writeFile(wb, `programaciones_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportFilteredSchedulesToPDF = () => {
    if (filteredSchedules.length === 0) {
      alert('No hay programaciones en el filtro actual para exportar.');
      return;
    }

    const doc = new jsPDF();
    doc.setFontSize(15);
    doc.text('Programaciones de Pagos (Filtro Actual)', 14, 18);
    doc.setFontSize(10);
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-DO')}`, 14, 24);

    const bodyRows: string[][] = [];
    let globalTotal = 0;
    filteredSchedules.forEach((schedule) => {
      const visibleLines = getVisibleScheduleLines(schedule);
      const scheduleTotal = visibleLines.reduce((sum, line) => sum + (Number(line.paymentRequest.netTotal) || 0), 0);
      globalTotal += scheduleTotal;
      visibleLines.forEach((line) => {
        bodyRows.push([
          schedule.scheduleNumber,
          line.paymentRequest.docNumber,
          line.paymentRequest.vendorName,
          line.paymentRequest.projectName || 'Sin proyecto',
          line.paymentRequest.status,
          `$${formatCurrency(Number(line.paymentRequest.netTotal) || 0)}`
        ]);
      });

      bodyRows.push([
        `${schedule.scheduleNumber} TOTAL`,
        '',
        '',
        '',
        '',
        `$${formatCurrency(scheduleTotal)}`
      ]);
    });

    autoTable(doc, {
      startY: 30,
      head: [['Programación', 'Boletín', 'Proveedor', 'Proyecto', 'Estado', 'Neto']],
      body: bodyRows
    });

    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 30;
    doc.setFontSize(11);
    doc.text(`Total global del filtro: $${formatCurrency(globalTotal)}`, 14, finalY + 10);

    doc.save(`programaciones_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const cancelSchedule = async (scheduleId: number) => {
    if (!window.confirm('¿Desea cancelar esta programación? Los boletines quedarán liberados para nueva programación.')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/payment-schedules/${scheduleId}/cancel`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Error al cancelar programación');
      }

      await fetchData();
      alert('Programación cancelada. Los boletines fueron liberados.');
    } catch (cancelError: unknown) {
      setError(getErrorMessage(cancelError, 'Error al cancelar programación'));
    }
  };

  const restartScheduleFlow = async (schedule: PaymentSchedule) => {
    const confirmText = schedule.status === 'ENVIADA_FINANZAS'
      ? 'Esta programación ya fue enviada a finanzas. ¿Desea reiniciar el flujo para empezar nuevamente desde pendiente de aprobación?'
      : '¿Desea reiniciar el flujo de esta programación? Volverá a pendiente de aprobación.';

    if (!window.confirm(confirmText)) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/payment-schedules/${schedule.id}/restart-flow`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Error al reiniciar el flujo');
      }

      await fetchData();
      alert('Flujo reiniciado. Debe aprobar y enviar nuevamente paso a paso.');
    } catch (restartError: unknown) {
      setError(getErrorMessage(restartError, 'Error al reiniciar flujo'));
    }
  };

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <section style={{ background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <h3 style={{ marginTop: 0, color: '#1976d2' }}>
            {editingScheduleId ? 'Editar Programación de Pagos' : 'Nueva Programación de Pagos'}
          </h3>
          {isScheduleEditTab && (
            <button
              onClick={() => window.close()}
              style={{ border: 'none', borderRadius: '6px', padding: '8px 12px', background: '#616161', color: 'white', cursor: 'pointer' }}
            >
              Cerrar Ventana
            </button>
          )}
        </div>
        <p style={{ marginTop: 0, color: '#666' }}>
          {editingScheduleId
            ? 'Puede editar boletines y notas. Si la programación estaba aprobada, al guardar volverá a pendiente.'
            : 'Solo aparecen boletines no incluidos en otras programaciones.'}
        </p>

        {editingScheduleId && editingWasApproved && (
          <div style={{ marginBottom: '12px', background: '#fff8e1', color: '#e65100', border: '1px solid #ffcc80', borderRadius: '6px', padding: '10px 12px' }}>
            Advertencia: esta programación está aprobada. Si guarda cambios perderá la aprobación.
          </div>
        )}

        {editingScheduleId !== null && selectedRequestIds.length === 0 && (
          <div style={{ marginBottom: '12px', background: '#ffebee', color: '#b71c1c', border: '1px solid #ffcdd2', borderRadius: '6px', padding: '10px 12px' }}>
            Esta programación quedará en cero boletines si guarda los cambios.
          </div>
        )}

        {error && (
          <div style={{ marginBottom: '12px', background: '#ffebee', color: '#b71c1c', border: '1px solid #ffcdd2', borderRadius: '6px', padding: '10px 12px' }}>
            {error}
          </div>
        )}

        {loading ? (
          <p>Cargando boletines elegibles...</p>
        ) : selectableRequests.length === 0 ? (
          <p style={{ color: '#666' }}>No hay boletines elegibles en este momento.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1120px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>Sel.</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'left' }}>Boletín</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'left' }}>Fecha boletín</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'left' }}>OC</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'left' }}>Proyecto</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'left' }}>Proveedor</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>Neto</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>Estado</th>
                    {canApprovePaymentRequests && (
                      <th style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>Acción</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {selectableRequests.map((request) => {
                    const notApproved = request.status !== 'APROBADO';
                    return (
                      <tr key={request.id} style={{ backgroundColor: notApproved ? '#fff8e1' : 'transparent' }}>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedRequestIds.includes(request.id)}
                            onChange={() => toggleRequest(request.id)}
                          />
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, color: '#1976d2' }}>{request.docNumber}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0' }}>{new Date(request.date).toLocaleDateString('es-DO')}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0' }}>{request.docID}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0' }}>{request.projectName || 'Sin proyecto'}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0' }}>{request.vendorName}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontWeight: 600 }}>${formatCurrency(request.netTotal)}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            borderRadius: '999px',
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: request.status === 'APROBADO' ? '#1b5e20' : '#e65100',
                            backgroundColor: request.status === 'APROBADO' ? '#e8f5e9' : '#fff3e0',
                            border: request.status === 'APROBADO' ? '1px solid #c8e6c9' : '1px solid #ffcc80'
                          }}>
                            {request.status}
                          </span>
                        </td>
                        {canApprovePaymentRequests && (
                          <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                            {request.status === 'PENDIENTE' ? (
                              <button
                                onClick={() => approvePaymentRequest(request.id)}
                                disabled={approvingRequestId === request.id}
                                style={{
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '6px 10px',
                                  background: approvingRequestId === request.id ? '#90a4ae' : '#2e7d32',
                                  color: 'white',
                                  cursor: approvingRequestId === request.id ? 'not-allowed' : 'pointer'
                                }}
                              >
                                {approvingRequestId === request.id ? 'Aprobando...' : 'Aprobar'}
                              </button>
                            ) : (
                              <span style={{ color: '#607d8b', fontSize: '0.85rem' }}>—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: '6px', maxWidth: '320px' }}>
                  <label htmlFor="paymentDate" style={{ fontSize: '0.9rem', color: '#455a64', fontWeight: 600 }}>
                    Fecha de pago / fondos disponibles
                  </label>
                  <input
                    id="paymentDate"
                    type="date"
                    value={paymentDate}
                    onChange={(event) => setPaymentDate(event.target.value)}
                    style={{ borderRadius: '6px', border: '1px solid #ddd', padding: '8px 10px' }}
                  />
                </div>
                <div style={{ display: 'grid', gap: '6px', maxWidth: '320px' }}>
                  <label htmlFor="commitmentDate" style={{ fontSize: '0.9rem', color: '#455a64', fontWeight: 600 }}>
                    Fecha del compromiso
                  </label>
                  <input
                    id="commitmentDate"
                    type="date"
                    value={commitmentDate}
                    onChange={(event) => setCommitmentDate(event.target.value)}
                    style={{ borderRadius: '6px', border: '1px solid #ddd', padding: '8px 10px' }}
                  />
                </div>
              </div>
              <textarea
                rows={3}
                placeholder="Notas de la programación (opcional)"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                style={{ resize: 'vertical', borderRadius: '6px', border: '1px solid #ddd', padding: '10px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#555', fontSize: '0.95rem' }}>
                  Seleccionados: <strong>{selectedRequestIds.length}</strong> | Total: <strong>${formatCurrency(selectedTotal)}</strong>
                  {editingScheduleId !== null && !hasEditChanges && (
                    <div style={{ marginTop: '6px', color: '#757575', fontSize: '0.82rem' }}>
                      No hay cambios pendientes.
                    </div>
                  )}
                </div>
                <button
                  onClick={createSchedule}
                  disabled={saving || (editingScheduleId === null && selectedRequestIds.length === 0) || (editingScheduleId !== null && !hasEditChanges)}
                  title={editingScheduleId !== null && !hasEditChanges ? 'No hay cambios para guardar' : undefined}
                  style={{
                    border: 'none',
                    borderRadius: '6px',
                    padding: '10px 16px',
                    fontWeight: 600,
                    cursor: saving || (editingScheduleId === null && selectedRequestIds.length === 0) || (editingScheduleId !== null && !hasEditChanges) ? 'not-allowed' : 'pointer',
                    color: 'white',
                    backgroundColor: saving || (editingScheduleId === null && selectedRequestIds.length === 0) || (editingScheduleId !== null && !hasEditChanges) ? '#90a4ae' : '#1976d2'
                  }}
                >
                  {saving ? (editingScheduleId ? 'Guardando...' : 'Creando...') : (editingScheduleId ? 'Guardar Cambios' : 'Crear Programación')}
                </button>
                {editingScheduleId && (
                  <button
                    onClick={cancelEditMode}
                    style={{
                      border: 'none',
                      borderRadius: '6px',
                      padding: '10px 16px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'white',
                      backgroundColor: '#616161',
                      marginLeft: '10px'
                    }}
                  >
                    Cancelar Edición
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {!isScheduleEditTab && (
      <section style={{ background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ marginTop: 0, color: '#1976d2' }}>Programaciones Registradas</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <select
              value={scheduleStatusFilter}
              onChange={(event) => setScheduleStatusFilter(event.target.value as 'TODOS' | PaymentSchedule['status'])}
              style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '8px 10px', fontSize: '0.9rem', cursor: 'pointer' }}
            >
              <option value="TODOS">Todos ({schedules.length})</option>
              <option value="PENDIENTE_APROBACION">Pendientes ({schedules.filter((schedule) => schedule.status === 'PENDIENTE_APROBACION').length})</option>
              <option value="APROBADA">Aprobadas ({schedules.filter((schedule) => schedule.status === 'APROBADA').length})</option>
              <option value="ENVIADA_FINANZAS">Enviadas ({schedules.filter((schedule) => schedule.status === 'ENVIADA_FINANZAS').length})</option>
              <option value="CANCELADA">Canceladas ({schedules.filter((schedule) => schedule.status === 'CANCELADA').length})</option>
            </select>
            <button
              onClick={fetchData}
              style={{ border: 'none', background: '#2196f3', color: 'white', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer' }}
            >
              Recargar
            </button>
            <button
              onClick={exportFilteredSchedulesToExcel}
              style={{ border: 'none', background: '#2e7d32', color: 'white', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer' }}
            >
              Exportar filtro Excel
            </button>
            <button
              onClick={exportFilteredSchedulesToPDF}
              style={{ border: 'none', background: '#546e7a', color: 'white', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer' }}
            >
              Exportar filtro PDF
            </button>
          </div>
        </div>

        {loading ? (
          <p>Cargando programaciones...</p>
        ) : filteredSchedules.length === 0 ? (
          <p style={{ color: '#666' }}>No hay programaciones registradas.</p>
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {filteredSchedules.map((schedule) => {
              const visibleLines = schedule.lines.filter((line) => line.paymentRequest.status !== 'RECHAZADO');
              const hasNotApproved = visibleLines.some((line) => line.paymentRequest.status !== 'APROBADO');
              const totalSchedule = visibleLines.reduce((sum, line) => sum + (Number(line.paymentRequest.netTotal) || 0), 0);
              const hiddenRejectedCount = schedule.lines.length - visibleLines.length;

              return (
                <article key={schedule.id} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ color: '#1565c0' }}>{schedule.scheduleNumber}</strong>
                      <div style={{ color: '#666', fontSize: '0.9rem' }}>{new Date(schedule.date).toLocaleDateString('es-DO')}</div>
                      <div style={{ color: '#666', fontSize: '0.9rem' }}>
                        Compromiso: {new Date(schedule.commitmentDate).toLocaleDateString('es-DO')}
                      </div>
                      <div style={{ color: '#666', fontSize: '0.9rem' }}>
                        Pago/Fondos: {new Date(schedule.paymentDate).toLocaleDateString('es-DO')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{
                        borderRadius: '999px',
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: schedule.status === 'ENVIADA_FINANZAS'
                          ? '#e8f5e9'
                          : schedule.status === 'APROBADA'
                            ? '#e3f2fd'
                            : schedule.status === 'CANCELADA'
                              ? '#ffebee'
                              : '#fff3e0',
                        color: schedule.status === 'ENVIADA_FINANZAS'
                          ? '#1b5e20'
                          : schedule.status === 'APROBADA'
                            ? '#0d47a1'
                            : schedule.status === 'CANCELADA'
                              ? '#b71c1c'
                              : '#e65100',
                        border: schedule.status === 'ENVIADA_FINANZAS'
                          ? '1px solid #c8e6c9'
                          : schedule.status === 'APROBADA'
                            ? '1px solid #bbdefb'
                            : schedule.status === 'CANCELADA'
                              ? '1px solid #ffcdd2'
                              : '1px solid #ffcc80'
                      }}>
                        {statusLabel(schedule.status)}
                      </span>

                      {schedule.status === 'PENDIENTE_APROBACION' && canApprovePaymentRequests && (
                        <button
                          onClick={() => approveSchedule(schedule.id)}
                          disabled={hasNotApproved}
                          title={hasNotApproved ? 'No se puede aprobar: hay boletines pendientes' : 'Aprobar programación'}
                          style={{
                            border: 'none',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            background: hasNotApproved ? '#90a4ae' : '#2e7d32',
                            color: 'white',
                            cursor: hasNotApproved ? 'not-allowed' : 'pointer'
                          }}
                        >
                          Aprobar
                        </button>
                      )}

                      {schedule.status === 'APROBADA' && canApprovePaymentRequests && (
                        <button
                          onClick={() => sendToFinance(schedule.id)}
                          style={{ border: 'none', borderRadius: '6px', padding: '8px 12px', background: '#6a1b9a', color: 'white', cursor: 'pointer' }}
                        >
                          Enviar a Finanzas
                        </button>
                      )}

                      {(schedule.status === 'APROBADA' || schedule.status === 'ENVIADA_FINANZAS') && canApprovePaymentRequests && (
                        <button
                          onClick={() => restartScheduleFlow(schedule)}
                          style={{ border: 'none', borderRadius: '6px', padding: '8px 12px', background: '#8e24aa', color: 'white', cursor: 'pointer' }}
                        >
                          Reiniciar Flujo
                        </button>
                      )}

                      {(schedule.status === 'PENDIENTE_APROBACION' || schedule.status === 'APROBADA') && canApprovePaymentRequests && (
                        <button
                          onClick={() => window.open(`/?paymentScheduleEdit=${schedule.id}`, '_blank')}
                          style={{ border: 'none', borderRadius: '6px', padding: '8px 12px', background: '#ef6c00', color: 'white', cursor: 'pointer' }}
                        >
                          Editar
                        </button>
                      )}

                      {(schedule.status === 'PENDIENTE_APROBACION' || schedule.status === 'APROBADA') && canApprovePaymentRequests && (
                        <button
                          onClick={() => cancelSchedule(schedule.id)}
                          style={{ border: 'none', borderRadius: '6px', padding: '8px 12px', background: '#c62828', color: 'white', cursor: 'pointer' }}
                        >
                          Cancelar
                        </button>
                      )}

                      <button
                        onClick={() => exportScheduleToExcel(schedule)}
                        style={{ border: 'none', borderRadius: '6px', padding: '8px 12px', background: '#2e7d32', color: 'white', cursor: 'pointer' }}
                      >
                        Excel
                      </button>

                      <button
                        onClick={() => exportScheduleToPDF(schedule)}
                        style={{ border: 'none', borderRadius: '6px', padding: '8px 12px', background: '#546e7a', color: 'white', cursor: 'pointer' }}
                      >
                        PDF
                      </button>
                    </div>
                  </div>

                  {schedule.notes && (
                    <p style={{ margin: '10px 0 0 0', color: '#555', fontSize: '0.9rem' }}>{schedule.notes}</p>
                  )}

                  {hasNotApproved && (
                    <div style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ffcc80', background: '#fff8e1', color: '#e65100', fontSize: '0.85rem' }}>
                      Esta programación contiene boletines no aprobados. Deben aprobarse antes del envío a finanzas.
                    </div>
                  )}

                  {hiddenRejectedCount > 0 && (
                    <div style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ffcdd2', background: '#ffebee', color: '#b71c1c', fontSize: '0.85rem' }}>
                      Se ocultaron {hiddenRejectedCount} boletín(es) rechazado(s) en esta vista.
                    </div>
                  )}

                  <div style={{ marginTop: '12px', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'left' }}>Boletín</th>
                          <th style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'left' }}>Proveedor</th>
                          <th style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'left' }}>Proyecto</th>
                          <th style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>Neto</th>
                          <th style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>Estado</th>
                          {canApprovePaymentRequests && (
                            <th style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>Acción</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLines.map((line) => {
                          const request = line.paymentRequest;
                          const notApproved = request.status !== 'APROBADO';
                          return (
                            <tr key={line.id} style={{ backgroundColor: notApproved ? '#fff8e1' : 'transparent' }}>
                              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>{request.docNumber}</td>
                              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{request.vendorName}</td>
                              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{request.projectName || 'Sin proyecto'}</td>
                              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>${formatCurrency(request.netTotal)}</td>
                              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>{request.status}</td>
                              {canApprovePaymentRequests && (
                                <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                                  {request.status === 'PENDIENTE' ? (
                                    <button
                                      onClick={() => approvePaymentRequest(request.id)}
                                      disabled={approvingRequestId === request.id}
                                      style={{
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '6px 10px',
                                        background: approvingRequestId === request.id ? '#90a4ae' : '#2e7d32',
                                        color: 'white',
                                        cursor: approvingRequestId === request.id ? 'not-allowed' : 'pointer'
                                      }}
                                    >
                                      {approvingRequestId === request.id ? 'Aprobando...' : 'Aprobar'}
                                    </button>
                                  ) : (
                                    <span style={{ color: '#607d8b', fontSize: '0.85rem' }}>—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={canApprovePaymentRequests ? 4 : 3} style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>Total programación:</td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>${formatCurrency(totalSchedule)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {Array.isArray(schedule.auditLogs) && schedule.auditLogs.length > 0 && (
                    <div style={{ marginTop: '12px', background: '#fafafa', border: '1px solid #eceff1', borderRadius: '6px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#455a64', marginBottom: '6px' }}>
                        Auditoría reciente
                      </div>
                      {schedule.auditLogs.slice(0, 5).map((log) => (
                        <div key={log.id} style={{ fontSize: '0.8rem', color: '#607d8b', marginBottom: '4px' }}>
                          {new Date(log.createdAt).toLocaleString('es-DO')} · {actionLabel(log.action)} · {log.createdBy || 'Sistema'}
                          {log.statusBefore || log.statusAfter ? ` (${log.statusBefore || '-'} → ${log.statusAfter || '-'})` : ''}
                          {log.detail ? ` · ${log.detail}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      )}
    </div>
  );
};
