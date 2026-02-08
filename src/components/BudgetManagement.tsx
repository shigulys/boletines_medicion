import React, { useState, useEffect } from 'react';

interface BudgetItem {
  id: number;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  isChapter?: boolean;
  measurements?: { quantity: number }[];
}

interface Budget {
  id: number;
  projectName: string;
  description: string;
  totalAmount: number;
  createdAt: string;
  _count?: {
    items: number;
  };
}

export const BudgetManagement: React.FC = () => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchBudgets();
  }, []);

  const fetchBudgets = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/budgets', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setBudgets(data);
      }
    } catch (error) {
      console.error('Error fetching budgets:', error);
    }
  };

  const fetchBudgetDetails = async (id: number) => {
    try {
      const response = await fetch(`http://localhost:5000/api/budgets/${id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedBudget(data);
        setBudgetItems(data.items);
      }
    } catch (error) {
      console.error('Error fetching budget details:', error);
    }
  };

  const deleteBudget = async (id: number) => {
    console.log(`Intentando eliminar presupuesto ID: ${id}`);
    if (!window.confirm('¿Está seguro de eliminar este presupuesto?')) return;

    try {
      const response = await fetch(`http://localhost:5000/api/budgets/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      console.log('Respuesta de eliminación:', response.status);
      
      if (response.ok) {
        setMessage({ text: 'Presupuesto eliminado con éxito', type: 'success' });
        await fetchBudgets();
      } else {
        const errorData = await response.json();
        setMessage({ text: `Error: ${errorData.message}`, type: 'error' });
      }
    } catch (error) {
      console.error('Error deleting budget:', error);
      setMessage({ text: 'Error de conexión al eliminar', type: 'error' });
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !projectName) {
      setMessage({ text: 'Por favor complete todos los campos', type: 'error' });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectName', projectName);
    formData.append('description', description);

    try {
      const response = await fetch('http://localhost:5000/api/budgets/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (response.ok) {
        setMessage({ text: 'Presupuesto cargado con éxito', type: 'success' });
        setProjectName('');
        setDescription('');
        setFile(null);
        fetchBudgets();
      } else {
        const errorData = await response.json();
        setMessage({ text: errorData.message || 'Error al cargar el presupuesto', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Error de conexión con el servidor', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="budget-management">
      <div className="budget-header-actions">
        <h2>Gestión de Presupuestos</h2>
        <button 
          className="btn-primary" 
          onClick={() => { setSelectedBudget(null); setMessage({ text: '', type: '' }); }}
        >
          {selectedBudget ? 'Volver a la lista' : 'Refrescar'}
        </button>
      </div>

      {message.text && (
        <div className={`alert ${message.type}`}>
          {message.text}
        </div>
      )}

      {!selectedBudget ? (
        <div className="budget-grid">
          <section className="upload-section card">
            <h3>Cargar Nuevo Presupuesto</h3>
            <form onSubmit={handleFileUpload} className="upload-form">
              <div className="form-group">
                <label>Nombre del Proyecto/Obra</label>
                <input 
                  type="text" 
                  value={projectName} 
                  onChange={(e) => setProjectName(e.target.value)} 
                  placeholder="Ej: Edificio Miraflores"
                  required
                />
              </div>
              <div className="form-group">
                <label>Descripción (Opcional)</label>
                <textarea 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="Detalles adicionales..."
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Archivo Excel</label>
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required
                />
                <small>Formatos compatibles: Presto (Código, Resumen, Ud, CanPres, Pres, ImpPres).</small>
              </div>
              <button type="submit" className="btn-upload" disabled={isUploading}>
                {isUploading ? 'Procesando...' : 'Subir Presupuesto'}
              </button>
            </form>
          </section>

          <section className="budgets-list card">
            <h3>Presupuestos Cargados</h3>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Proyecto</th>
                    <th>Fecha</th>
                    <th>Monto Total</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center' }}>No hay presupuestos cargados</td>
                    </tr>
                  ) : (
                    budgets.map(b => (
                      <tr key={b.id}>
                        <td><strong>{b.projectName}</strong></td>
                        <td>{new Date(b.createdAt).toLocaleDateString('es-ES')}</td>
                        <td>${b.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => fetchBudgetDetails(b.id)} className="btn-small">Ver</button>
                            <button onClick={() => deleteBudget(b.id)} className="btn-small btn-danger">×</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <div className="budget-detail card">
          <div className="detail-header">
            <h3>{selectedBudget.projectName}</h3>
            <p>{selectedBudget.description}</p>
          </div>
          
          <section className="summary-section">
            <h4>Resumen por Capítulos</h4>
            <table className="data-table summary-table">
              <thead>
                <tr>
                  <th>Cod.</th>
                  <th>Descripción del Capítulo</th>
                  <th style={{ textAlign: 'right' }}>Total Capítulo</th>
                </tr>
              </thead>
              <tbody>
                {budgetItems.filter(item => item.isChapter).map(chapter => (
                  <tr key={chapter.id} className="chapter-row">
                    <td>{chapter.code}</td>
                    <td>{chapter.description}</td>
                    <td style={{ textAlign: 'right' }}>${chapter.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="grand-total-row">
                  <td colSpan={2}>TOTAL PRESUPUESTO</td>
                  <td style={{ textAlign: 'right' }}>${selectedBudget.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <hr style={{ margin: '30px 0', border: 'none', borderTop: '1px solid #eee' }} />

          <h4>Detalle de Partidas</h4>
          <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Descripción</th>
                  <th>Und</th>
                  <th>Cant. Pres</th>
                  <th>Cant. Medida</th>
                  <th>% Avance</th>
                  <th>P.U.</th>
                  <th>Total Pres</th>
                </tr>
              </thead>
              <tbody>
                {budgetItems.map(item => {
                  const isTopografía = item.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('topografia');
                  const measuredQty = item.measurements?.reduce((acc, m) => acc + m.quantity, 0) || 0;
                  const progressPct = item.quantity > 0 ? (measuredQty / item.quantity) * 100 : 0;
                  
                  return (
                    <tr 
                      key={item.id} 
                      className={`${item.isChapter ? 'is-chapter' : ''} ${isTopografía ? 'highlight-topo' : ''}`}
                    >
                      <td>{item.code}</td>
                      <td>{item.description}</td>
                      <td>{item.unit}</td>
                      <td>{item.quantity.toLocaleString('en-US')}</td>
                      <td style={{ fontWeight: 'bold', color: measuredQty > 0 ? '#28a745' : '#888' }}>
                        {measuredQty.toLocaleString('en-US')}
                      </td>
                      <td>
                        {!item.isChapter && (
                          <div className="progress-bar-container">
                            <div className="progress-bar" style={{ width: `${Math.min(progressPct, 100)}%` }}></div>
                            <span>{progressPct.toFixed(1)}%</span>
                          </div>
                        )}
                      </td>
                      <td>${item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td>${item.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        .budget-management {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .budget-header-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .budget-grid {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 20px;
          align-items: start;
        }
        .card {
          background: white;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          height: fit-content;
        }
        .table-responsive {
          max-height: 600px;
          overflow-y: auto;
        }
        .upload-form {
          display: grid;
          gap: 15px;
          margin-top: 15px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .form-group input, .form-group textarea {
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 6px;
        }
        .btn-upload {
          background: #4a90e2;
          color: white;
          border: none;
          padding: 10px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
        }
        .btn-upload:disabled {
          background: #ccc;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        .data-table th, .data-table td {
          text-align: left;
          padding: 12px;
          border-bottom: 1px solid #eee;
        }
        .data-table thead th {
          position: sticky;
          top: 0;
          background-color: #f8f9fa;
          z-index: 10;
          box-shadow: 0 2px 2px -1px rgba(0, 0, 0, 0.1);
        }
        .btn-small {
          padding: 5px 10px;
          background: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
        }
        .btn-danger {
          color: #dc3545;
          border-color: #dc3545;
        }
        .btn-danger:hover {
          background: #dc3545;
          color: white;
        }
        .alert {
          padding: 12px;
          border-radius: 6px;
          font-weight: 600;
        }
        .alert.error {
          background: #ffebee;
          color: #c62828;
          border: 1px solid #ef9a9a;
        }
        .alert.success {
          background: #e8f5e9;
          color: #2e7d32;
          border: 1px solid #a5d6a7;
        }
        .budget-summary {
          margin: 15px 0;
          font-size: 1.2rem;
          color: #2e7d32;
        }
        .summary-section {
          margin-top: 20px;
          background: #fcfcfc;
          padding: 15px;
          border-radius: 8px;
          border: 1px solid #edf2f7;
        }
        .summary-table {
          background: white;
        }
        .chapter-row {
          font-weight: 600;
          color: #2d3748;
        }
        .grand-total-row {
          background-color: #f7fafc;
          font-weight: 800;
          font-size: 1.1rem;
          color: #276749;
        }
        .is-chapter {
          background-color: #f8fafc;
          font-weight: 600;
        }
        .highlight-topo {
          background-color: #fff9db !important;
          border-left: 4px solid #fcc419;
        }
        .highlight-topo td {
          color: #856404;
          font-weight: 500;
        }
        .progress-bar-container {
          width: 80px;
          background-color: #eee;
          border-radius: 10px;
          height: 14px;
          position: relative;
          overflow: hidden;
          display: inline-block;
          vertical-align: middle;
          margin-right: 5px;
        }
        .progress-bar {
          background-color: #28a745;
          height: 100%;
          transition: width 0.3s ease;
        }
        .progress-bar-container span {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          font-size: 0.65rem;
          color: #333;
          font-weight: bold;
          line-height: 14px;
        }
      `}</style>
    </div>
  );
};
