import React, { useMemo, useState } from 'react';
import EmpresaName from './EmpresaName';
import * as XLSX from 'xlsx';

interface PayrollTransaction {
  ID: string;
  SubsidiaryID: string;
  DocID: string;
  DocType: string;
  DocDate: string;
  DateTo: string | null;
  Reference: string | null;
  PaymentTypeID: string | null;
  Year: number | null;
  Month: number | null;
  ConceptSummary?: string | null;
}

type PayrollDetailRow = Record<string, unknown>;
type PayrollBenefitDiscountRow = Record<string, unknown>;
type PayrollEmployeeSummaryRow = Record<string, unknown>;
type PayrollUnifiedRow = Record<string, unknown>;

const DEFAULT_SUBSIDIARY_ID = 'FBC6AADF-8B12-47F7-AA18-08DDDFE6F02E';
const PAYROLL_EXPORT_COLUMNS: Array<keyof PayrollTransaction> = [
  'ID',
  'SubsidiaryID',
  'DocID',
  'DocType',
  'DocDate',
  'DateTo',
  'ConceptSummary',
  'PaymentTypeID',
  'Year',
  'Month',
];

const PAYROLL_EXPORT_HEADERS: Record<keyof PayrollTransaction, string> = {
  ID: 'Transacción ID',
  SubsidiaryID: 'Subsidiaria ID',
  DocID: 'Documento',
  DocType: 'Tipo Documento',
  DocDate: 'Fecha Documento',
  DateTo: 'Fecha Hasta',
  Reference: 'Referencia',
  ConceptSummary: 'Concepto',
  PaymentTypeID: 'Tipo Pago ID',
  Year: 'Año',
  Month: 'Mes',
};

const renderValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '-';

  if (typeof value === 'number') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  if (typeof value === 'string') {
    const maybeDate = new Date(value);
    if (!Number.isNaN(maybeDate.getTime()) && value.includes('T')) {
      return maybeDate.toLocaleDateString('es-DO');
    }
    return value;
  }

  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
};

export const AdmCloudPayrollReport: React.FC = () => {
  const [subsidiaryId] = useState(DEFAULT_SUBSIDIARY_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<PayrollTransaction[]>([]);

  const [selectedPayroll, setSelectedPayroll] = useState<PayrollTransaction | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailRows, setDetailRows] = useState<PayrollDetailRow[]>([]);
  const [benefitsLoading, setBenefitsLoading] = useState(false);
  const [benefitsError, setBenefitsError] = useState('');
  const [benefitRows, setBenefitRows] = useState<PayrollBenefitDiscountRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [summaryRows, setSummaryRows] = useState<PayrollEmployeeSummaryRow[]>([]);

  const benefitById = useMemo(() => {
    const map = new Map<string, PayrollBenefitDiscountRow>();
    benefitRows.forEach((row) => {
      const key = String(row.BenefitDiscountID || '').trim();
      if (key && !map.has(key)) {
        map.set(key, row);
      }
    });
    return map;
  }, [benefitRows]);

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();

    summaryRows.forEach((row) => {
      const employeeId = String(row.EmployeeID || '').trim();
      const employeeName = String(row.EmployeeName || '').trim();
      if (employeeId && employeeName) {
        map.set(employeeId, employeeName);
      }
    });

    detailRows.forEach((row) => {
      const employeeId = String(row.EmployeeID || '').trim();
      const employeeName = String(row.EmployeeName || '').trim();
      if (employeeId && employeeName && !map.has(employeeId)) {
        map.set(employeeId, employeeName);
      }
    });

    return map;
  }, [summaryRows, detailRows]);

  const conceptColumns = useMemo(() => {
    const map = new Map<string, string>();

    detailRows.forEach((row) => {
      const conceptId = String(row.BenefitDiscountID || '').trim();
      if (!conceptId) return;

      const benefitInfo = benefitById.get(conceptId);
      const conceptName = String(benefitInfo?.BenefitDiscountName || conceptId).trim();
      if (!map.has(conceptId)) {
        map.set(conceptId, conceptName);
      }
    });

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [detailRows, benefitById]);

  const matrixRows = useMemo<PayrollUnifiedRow[]>(() => {
    if (!selectedPayroll || detailRows.length === 0) return [];

    const employees = Array.from(new Set(detailRows.map((row) => String(row.EmployeeID || '').trim()).filter(Boolean)));

    return employees
      .map((employeeId) => {
        const employeeDetails = detailRows.filter((row) => String(row.EmployeeID || '').trim() === employeeId);
        const row: PayrollUnifiedRow = {
          Documento: selectedPayroll.DocID,
          TransID: selectedPayroll.ID,
          EmpleadoID: employeeId,
          'Nombre Empleado': employeeNameById.get(employeeId) || '',
        };

        conceptColumns.forEach((concept) => {
          const conceptAmount = employeeDetails
            .filter((item) => String(item.BenefitDiscountID || '').trim() === concept.id)
            .reduce((acc, item) => acc + (Number(item.Amount) || 0), 0);
          row[concept.name] = conceptAmount;
        });

        const summary = summaryRows.find((summaryRow) => String(summaryRow.EmployeeID || '').trim() === employeeId);
        row.Ingresos = Number(summary?.TotalIngresos) || 0;
        row.Descuentos = Number(summary?.TotalDescuentos) || 0;
        row['Neto a Pagar'] = Number(summary?.NetoEmpleado) || (Number(row.Ingresos) - Number(row.Descuentos));

        return row;
      })
      .filter((row) => {
        // Ocultar empleados si todos los valores numéricos (conceptos, ingresos, descuentos, neto a pagar) son 0
        const numericCols = [
          ...conceptColumns.map((c) => c.name),
          'Ingresos',
          'Descuentos',
          'Neto a Pagar',
        ];
        return numericCols.some((col) => Number(row[col]) !== 0);
      });
  }, [selectedPayroll, detailRows, conceptColumns, employeeNameById, summaryRows]);

  const matrixDisplayColumns = useMemo(() => {
    const base = ['Nombre Empleado'];
    const totals = ['Ingresos', 'Descuentos', 'Neto a Pagar'];
    // Reordenar para que 'Salario Admin' (si existe) sea el primer concepto
    const salarioAdminIdx = conceptColumns.findIndex((c) => c.name.trim().toLowerCase() === 'salario admin');
    let orderedConcepts = [...conceptColumns];
    if (salarioAdminIdx !== -1) {
      const [salarioAdmin] = orderedConcepts.splice(salarioAdminIdx, 1);
      orderedConcepts = [salarioAdmin, ...orderedConcepts];
    }
    return [...base, ...orderedConcepts.map((c) => c.name), ...totals];
  }, [conceptColumns]);

  const exportRowsToExcel = (data: Record<string, unknown>[], filePrefix: string) => {
    if (!data.length) return;

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte');

    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

    XLSX.writeFile(workbook, `${filePrefix}_${timestamp}.xlsx`);
  };

  const handleExportPayrolls = () => {
    const normalized = rows.map((row) => {
      const rowData: Record<string, unknown> = {};

      PAYROLL_EXPORT_COLUMNS.forEach((column) => {
        const rawValue = row[column];
        let formattedValue: unknown = rawValue ?? '';

        if ((column === 'DocDate' || column === 'DateTo') && rawValue) {
          const date = new Date(String(rawValue));
          formattedValue = Number.isNaN(date.getTime()) ? rawValue : date.toLocaleDateString('es-DO');
        }

        rowData[PAYROLL_EXPORT_HEADERS[column]] = formattedValue;
      });

      return rowData;
    });

    exportRowsToExcel(normalized, 'reporte_nominas_admcloud');
  };

  const handleExportDetail = () => {
    if (!selectedPayroll || matrixRows.length === 0) return;

    const normalized = matrixRows.map((row) => {
      const rowData: Record<string, unknown> = {};
      matrixDisplayColumns.forEach((column) => {
        rowData[column] = row[column] ?? '';
      });
      return rowData;
    });

    exportRowsToExcel(normalized, `reporte_unificado_nomina_${selectedPayroll.DocID}`);
  };

  const fetchPayrolls = async () => {
    setLoading(true);
    setError('');
    setRows([]);
    setSelectedPayroll(null);
    setDetailRows([]);
    setDetailError('');
    setBenefitRows([]);
    setBenefitsError('');
    setSummaryRows([]);
    setSummaryError('');

    try {
      const url = new URL('http://localhost:5000/api/admcloud/payrolls');
      url.searchParams.append('subsidiaryId', subsidiaryId.trim() || DEFAULT_SUBSIDIARY_ID);

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('No se pudo obtener el reporte de nóminas.');
      }

      const data = await response.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setError('Error al consultar nóminas en AdmCloud.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (payroll: PayrollTransaction) => {
    setSelectedPayroll(payroll);
    setDetailLoading(true);
    setBenefitsLoading(true);
    setSummaryLoading(true);
    setDetailError('');
    setBenefitsError('');
    setSummaryError('');
    setDetailRows([]);
    setBenefitRows([]);
    setSummaryRows([]);

    try {
      const [employeesResponse, benefitsResponse, summaryResponse] = await Promise.all([
        fetch(`http://localhost:5000/api/admcloud/payrolls/${payroll.ID}/employees`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }),
        fetch(`http://localhost:5000/api/admcloud/payrolls/${payroll.ID}/benefits-discounts`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }),
        fetch(`http://localhost:5000/api/admcloud/payrolls/${payroll.ID}/employee-summary`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }),
      ]);

      if (!employeesResponse.ok) {
        throw new Error('No se pudo obtener el detalle de nómina.');
      }

      const employeesData = await employeesResponse.json();
      setDetailRows(Array.isArray(employeesData) ? employeesData : []);

      if (benefitsResponse.ok) {
        const benefitsData = await benefitsResponse.json();
        setBenefitRows(Array.isArray(benefitsData) ? benefitsData : []);
      } else {
        setBenefitsError('No se pudieron obtener los conceptos de pago y descuentos.');
      }

      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        setSummaryRows(Array.isArray(summaryData) ? summaryData : []);
      } else {
        setSummaryError('No se pudo obtener el resumen por empleado.');
      }
    } catch {
      setDetailError('Error al consultar el detalle de la nómina.');
    } finally {
      setDetailLoading(false);
      setBenefitsLoading(false);
      setSummaryLoading(false);
    }
  };


  return (
    <div className="admcloud-container">
      <div className="header-actions">
        <h2>Reporte Columnar de Nóminas (AdmCloud)</h2>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ minWidth: '380px', flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 600 }}>
              Empresa
            </label>
            <EmpresaName subsidiaryId={subsidiaryId} />
          </div>
          <button className="btn-primary" onClick={fetchPayrolls} disabled={loading}>
            {loading ? 'Consultando...' : 'Generar Reporte'}
          </button>
          <button className="btn-primary" onClick={handleExportPayrolls} disabled={rows.length === 0 || loading}>
            Exportar Nóminas
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="table-responsive" style={{ maxHeight: '50vh', overflow: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 1 }}>
              <tr>
                <th>DocID / Fecha</th>
                <th>Concepto</th>
                <th>Año</th>
                <th>Mes</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '14px' }}>
                    No hay nóminas para mostrar.
                  </td>
                </tr>
              ) : (
                [...rows]
                  .sort((a, b) => {
                    const dateA = new Date(a.DocDate || '').getTime();
                    const dateB = new Date(b.DocDate || '').getTime();
                    return dateB - dateA;
                  })
                  .map((row) => (
                    <tr key={row.ID}>
                      <td>
                        <span style={{ fontWeight: 'bold' }}>{row.DocID}</span>
                        <span style={{ marginLeft: 8, color: '#555', fontSize: '0.95em' }}>
                          {row.DocDate ? new Date(row.DocDate).toLocaleDateString('es-DO') : '-'}
                        </span>
                      </td>
                      <td>{row.ConceptSummary || '-'}</td>
                      <td>{row.Year ?? '-'}</td>
                      <td>{row.Month ?? '-'}</td>
                      <td>
                        <button className="btn-small" onClick={() => fetchDetail(row)}>
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPayroll && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
            <h3 style={{ margin: 0 }}>
              Detalle Nómina: {selectedPayroll.DocID}
            </h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button className="btn-primary" onClick={handleExportDetail} disabled={matrixRows.length === 0 || detailLoading || benefitsLoading || summaryLoading}>
                Exportar Reporte Unificado
              </button>
            </div>
          </div>

          {detailError && <div className="alert error">{detailError}</div>}

          {(benefitsError || summaryError) && (
            <>
              {benefitsError && <div className="alert error" style={{ marginBottom: '0.5rem' }}>{benefitsError}</div>}
              {summaryError && <div className="alert error" style={{ marginBottom: '0.5rem' }}>{summaryError}</div>}
            </>
          )}

          <div className="table-responsive" style={{ maxHeight: '65vh', overflow: 'auto' }}>
            {detailLoading || benefitsLoading || summaryLoading ? (
              <div style={{ padding: '12px' }}>Cargando reporte unificado...</div>
            ) : matrixRows.length === 0 ? (
              <div style={{ padding: '12px' }}>No se encontraron registros para construir la vista matricial del reporte.</div>
            ) : (
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 1 }}>
                  <tr>
                    {matrixDisplayColumns.map((column) => (
                      <th
                        key={column}
                        style={column === 'Nombre Empleado'
                          ? {
                              minWidth: '260px',
                              width: '260px',
                              position: 'sticky',
                              left: 0,
                              backgroundColor: '#f8f9fa',
                              zIndex: 2,
                              textAlign: 'left',
                            }
                          : {
                              textAlign: 'center',
                            }}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map((row, index) => (
                    <tr key={`${selectedPayroll.ID}-unified-${index}`}>
                      {matrixDisplayColumns.map((column) => (
                        <td
                          key={`${column}-unified-${index}`}
                          style={column === 'Nombre Empleado'
                            ? {
                                minWidth: '260px',
                                width: '260px',
                                whiteSpace: 'nowrap',
                                position: 'sticky',
                                left: 0,
                                backgroundColor: '#ffffff',
                                zIndex: 1,
                                textAlign: 'left',
                              }
                            : typeof row[column] === 'number'
                              ? { textAlign: 'right' }
                              : { textAlign: 'center' }}
                        >
                          {renderValue(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
