import React, { useState, useEffect } from 'react';

interface Transaction {
  ID: string;
  DocID: string;
  DocType: string;
  DocDate: string;
  Reference: string | null;
  Status: number;
  TaxAmount: number;
  TotalAmount: number;
  VendorName?: string;
  ProjectName?: string;
}

interface TransactionItem {
  ID: string;
  TransID: string;
  ItemID: string;
  Name: string;
  OrderedQuantity: number;
  ReceivedQuantity: number;
  Price: number;
  TaxAmount: number;
  TotalSalesAmount: number;
}

interface Budget {
  id: number;
  projectName: string;
  items?: BudgetItem[];
}

interface BudgetItem {
  id: number;
  code: string | null;
  description: string;
  isChapter?: boolean;
}

export const AdmCloudTransactions: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // States for Linking
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedItemToLink, setSelectedItemToLink] = useState<TransactionItem | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | ''>('');
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [budgetItemsLoading, setBudgetItemsLoading] = useState(false);
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState<number | ''>('');
  const [linkQuantity, setLinkQuantity] = useState<number>(0);
  const [isLinking, setIsLinking] = useState(false);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/admcloud/transactions', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setTransactions(data);
        setFilteredTransactions(data);
      } else {
        setError('Error al obtener transacciones de AdmCloud');
      }
    } catch {
      setError('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleMedir = async (tx: Transaction) => {
    setSelectedTx(tx);
    setItems([]); 
    setItemsLoading(true);
    // Limpiar estado de vinculación al abrir nueva OC
    setSelectedItemToLink(null);
    setSelectedBudgetId('');
    setBudgetItems([]);
    setSelectedBudgetItemId('');
    setLinkQuantity(0);

    try {
      const response = await fetch(`http://localhost:5000/api/admcloud/transactions/${tx.ID}/items`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setItems(data);
      } else {
        setError('Error al obtener ítems de la transacción');
      }
    } catch {
      setError('Error de conexión al obtener ítems');
    } finally {
      setItemsLoading(false);
    }
  };

  const saveMeasurement = async () => {
    if (!selectedBudgetItemId || !selectedItemToLink) return;
    
    setIsLinking(true);
    try {
      const response = await fetch('http://localhost:5000/api/measurements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          budgetItemId: selectedBudgetItemId,
          externalTransID: selectedItemToLink.TransID,
          externalItemID: selectedItemToLink.ItemID,
          quantity: linkQuantity || selectedItemToLink.ReceivedQuantity,
          price: selectedItemToLink.Price,
          notes: `Vínculo desde OC ${selectedTx?.DocID} (Basado en Recepciones)`
        })
      });

      if (response.ok) {
        alert('Medición registrada con éxito');
        setSelectedItemToLink(null);
      } else {
        alert('Error al registrar la medición');
      }
    } catch {
      alert('Error de conexión');
    } finally {
      setIsLinking(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchBudgets();
  }, []);

  const fetchBudgets = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/budgets', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setBudgets(data);
      }
    } catch {
      console.error("Error al cargar presupuestos");
    }
  };

  const fetchBudgetItems = async (budgetId: number) => {
    if (!budgetId) return;
    setBudgetItemsLoading(true);
    console.log("Solicitando partidas para budget ID:", budgetId);
    try {
      const response = await fetch(`http://localhost:5000/api/budgets/${budgetId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        console.log("Presupuesto recibido:", data.projectName, "Total items:", data.items?.length);
        if (data && data.items) {
          const items = (data.items || []) as BudgetItem[];
          // Filtrado: Incluir si isChapter es falso, undefined o null
          const filteredItems = items.filter(i => i.isChapter === false || i.isChapter === undefined || i.isChapter === null);
          console.log(`Partidas filtradas: ${filteredItems.length} de ${items.length}`);
          setBudgetItems(filteredItems);
        } else {
          setBudgetItems([]);
        }
      } else {
        console.error("Error al obtener detalle del presupuesto. Status:", response.status);
        alert(`Error al cargar partidas: Código ${response.status}`);
      }
    } catch (err) {
      console.error("Excepción al cargar partidas:", err);
      alert("Error de conexión al cargar partidas.");
    } finally {
      setBudgetItemsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBudgetId !== '' && selectedBudgetId !== 0) {
      fetchBudgetItems(Number(selectedBudgetId));
    } else {
      setBudgetItems([]);
    }
    setSelectedBudgetItemId(''); 
  }, [selectedBudgetId]);

  useEffect(() => {
    const filtered = transactions.filter(tx => 
      tx.DocID.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (tx.Reference && tx.Reference.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (tx.VendorName && tx.VendorName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (tx.ProjectName && tx.ProjectName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredTransactions(filtered);
  }, [searchTerm, transactions]);

  return (
    <div className="admcloud-container">
      <div className="header-actions">
        <h2>Transacciones AdmCloud (Órdenes de Compra)</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            placeholder="Buscar por Doc ID o Referencia..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', width: '250px' }}
          />
          <button className="btn-primary" onClick={fetchTransactions} disabled={loading}>
            {loading ? 'Cargando...' : 'Refrescar Datos'}
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="table-responsive" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="data-table">
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 1 }}>
              <tr>
                <th>Doc ID</th>
                <th>Fecha</th>
                <th>Proyecto</th>
                <th>Proveedor</th>
                <th>Referencia</th>
                <th style={{ textAlign: 'right' }}>Impuesto</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 && !loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '20px' }}>No se encontraron transacciones.</td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.ID}>
                    <td><strong>{tx.DocID}</strong></td>
                    <td>{new Date(tx.DocDate).toLocaleDateString('es-ES')}</td>
                    <td>
                      <div className="text-truncate" title={tx.ProjectName || 'General'}>
                        {tx.ProjectName || 'General'}
                      </div>
                    </td>
                    <td>
                      <div className="text-truncate" title={tx.VendorName || 'N/A'}>
                        {tx.VendorName || 'N/A'}
                      </div>
                    </td>
                    <td>{tx.Reference || '-'}</td>
                    <td style={{ textAlign: 'right' }}>${tx.TaxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td style={{ textAlign: 'right' }}><strong>${tx.TotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
                    <td>
                      <span className={`status-badge status-${tx.Status}`}>
                        {tx.Status === 0 ? 'Abierto' : tx.Status}
                      </span>
                    </td>
                    <td>
                      <button className="btn-small" onClick={() => handleMedir(tx)}>Medir</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTx && (
        <div className="modal-overlay">
          <div className="modal-content large">
            <div className="modal-header">
              <h3>Detalle de la Orden: {selectedTx.DocID}</h3>
              <button className="btn-close" onClick={() => setSelectedTx(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="tx-summary">
                <p><strong>Proveedor:</strong> {selectedTx.VendorName}</p>
                <p><strong>Proyecto:</strong> {selectedTx.ProjectName || 'General'}</p>
                <p><strong>Referencia:</strong> {selectedTx.Reference || '-'}</p>
              </div>

              {itemsLoading ? (
                <div className="loading-spinner">Cargando ítems y recepciones...</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Descripción del Ítem</th>
                      <th style={{ textAlign: 'right' }}>Pedida (OC)</th>
                      <th style={{ textAlign: 'right' }}>Recibida (RE)</th>
                      <th style={{ textAlign: 'right' }}>P. Unitario</th>
                      <th style={{ textAlign: 'right' }}>Total OC</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const isIncomplete = item.ReceivedQuantity < item.OrderedQuantity;
                      return (
                        <tr key={item.ID}>
                          <td>{item.Name}</td>
                          <td style={{ textAlign: 'right' }}>{item.OrderedQuantity.toLocaleString('en-US')}</td>
                          <td style={{ 
                            textAlign: 'right', 
                            fontWeight: 'bold', 
                            color: isIncomplete ? '#d32f2f' : '#28a745'
                          }}>
                            {item.ReceivedQuantity.toLocaleString('en-US')}
                            {isIncomplete && <span title="Recepción Incompleta" style={{ marginLeft: '5px', cursor: 'help' }}>⚠️</span>}
                          </td>
                          <td style={{ textAlign: 'right' }}>${item.Price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td style={{ textAlign: 'right' }}><strong>${item.TotalSalesAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
                          <td>
                            <button 
                              className="btn-small btn-success" 
                              onClick={() => {
                                setSelectedItemToLink(item);
                                setLinkQuantity(item.ReceivedQuantity); // Proponer vincular lo recibido
                              }}
                            >
                              Cubicación
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {selectedItemToLink && (
                <div className="link-selector-panel card" style={{ marginTop: '20px', border: '2px solid #28a745' }}>
                  <h4>Vincular ítem: {selectedItemToLink.Name}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px auto', gap: '10px', alignItems: 'end' }}>
                    <div>
                      <label>Seleccionar Presupuesto</label>
                      <select 
                        className="form-control" 
                        value={selectedBudgetId} 
                        onChange={(e) => {
                          const val = e.target.value;
                          console.log("Budget selected:", val);
                          setSelectedBudgetId(val === "" ? "" : Number(val));
                          setSelectedBudgetItemId(""); // Limpiar partida al cambiar presupuesto
                        }}
                      >
                        <option value="">-- Seleccione un presupuesto --</option>
                        {budgets.map(b => <option key={b.id} value={b.id}>{b.projectName}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Seleccionar Partida</label>
                      <select 
                        className="form-control" 
                        value={selectedBudgetItemId} 
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedBudgetItemId(val === "" ? "" : Number(val));
                        }}
                        disabled={!selectedBudgetId || budgetItemsLoading}
                      >
                        <option value="">
                          {budgetItemsLoading ? 'Cargando partidas...' : (budgetItems.length === 0 && selectedBudgetId ? 'No hay partidas' : '-- Seleccione una partida --')}
                        </option>
                        {budgetItems.map(bi => (
                          <option key={bi.id} value={bi.id}>
                            {bi.code ? `${bi.code} - ` : ''}{bi.description}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Cant. a Medir</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={linkQuantity} 
                        onChange={(e) => setLinkQuantity(Number(e.target.value))}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button className="btn-primary" onClick={saveMeasurement} disabled={isLinking || !selectedBudgetItemId}>
                        {isLinking ? 'Guardando...' : 'Confirmar Vínculo'}
                      </button>
                      <button className="btn-small" onClick={() => setSelectedItemToLink(null)}>Cancelar</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .admcloud-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .header-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .status-badge {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .status-0 {
          background-color: #e3f2fd;
          color: #1976d2;
        }
        .table-responsive {
          border: 1px solid #eee;
          border-radius: 8px;
        }
        .text-truncate {
          max-width: 150px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }
        .data-table th, .data-table td {
          padding: 12px 15px;
          text-align: left;
          border-bottom: 1px solid #eee;
        }
        .data-table thead th {
          background-color: #f8f9fa;
          color: #333;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.5px;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .modal-content.large {
          background: white;
          padding: 25px;
          border-radius: 12px;
          width: 90%;
          max-width: 1000px;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
        }
        .btn-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #888;
        }
        .tx-summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 15px;
          background: #fcfcfc;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          border: 1px solid #f0f0f0;
        }
        .btn-success {
          background-color: #28a745;
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.8rem;
        }
        .form-control {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          color: #333;
        }
        .link-selector-panel {
          background: #f8fff9;
          padding: 20px;
          border-radius: 8px;
          animation: slideUp 0.3s ease-out;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
