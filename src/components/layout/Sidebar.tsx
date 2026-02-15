import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface AccordionProps {
  title: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

const AccordionItem: React.FC<AccordionProps> = ({ title, children, isOpen, onToggle }) => {
  return (
    <div className="sidebar-accordion">
      <button className={`accordion-header ${isOpen ? 'active' : ''}`} onClick={onToggle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>{title}</span>
        <span className={`accordion-icon ${isOpen ? 'open' : ''}`}>▼</span>
      </button>
      <div className={`accordion-content ${isOpen ? 'show' : ''}`}>
        {children}
      </div>
    </div>
  );
};

export const Sidebar: React.FC<{ 
  onSelectManagement: () => void; 
  onSelectDashboard: () => void;
  onSelectBudget: () => void;
  onSelectAdmCloud: () => void;
  onSelectBoletin: () => void;
  onSelectRetentions: () => void;
  onSelectUnits: () => void;
}> = ({ onSelectManagement, onSelectDashboard, onSelectBudget, onSelectAdmCloud, onSelectBoletin, onSelectRetentions, onSelectUnits }) => {
  const { user, logout } = useAuth();
  const [openSection, setOpenSection] = useState<string | null>('Ingeniería');
  const [ordersCount, setOrdersCount] = useState<number>(0);
  const [ordersAmountDop, setOrdersAmountDop] = useState<number>(0);
  const [ordersAmountUsd, setOrdersAmountUsd] = useState<number>(0);
  const [ordersCountDop, setOrdersCountDop] = useState<number>(0);
  const [ordersCountUsd, setOrdersCountUsd] = useState<number>(0);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);

  const resolveCurrency = (value?: string) => {
    const currencyValue = String(value || '').trim().toUpperCase();
    if (currencyValue === '2' || currencyValue === 'USD' || currencyValue === 'B99EF67E-9001-4BAA-ADCE-08DDAA50AC6E') {
      return 'USD';
    }
    return 'DOP';
  };

  React.useEffect(() => {
    const fetchOrdersSummary = async () => {
      if (!user?.accessContabilidad && !user?.accessSubcontratos && !user?.accessIngenieria) return;

      setLoadingSummary(true);
      try {
        const response = await fetch('http://localhost:5000/api/admcloud/transactions', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          const summary = data.reduce((acc: { count: number; dop: number; usd: number; countDop: number; countUsd: number }, tx: { TotalAmount: number; Currency?: string }) => {
            const amount = Number(tx.TotalAmount) || 0;
            const currency = resolveCurrency(tx.Currency);
            acc.count += 1;
            if (currency === 'USD') {
              acc.usd += amount;
              acc.countUsd += 1;
            } else {
              acc.dop += amount;
              acc.countDop += 1;
            }
            return acc;
          }, { count: 0, dop: 0, usd: 0, countDop: 0, countUsd: 0 });

          setOrdersCount(summary.count);
          setOrdersAmountDop(summary.dop);
          setOrdersAmountUsd(summary.usd);
          setOrdersCountDop(summary.countDop);
          setOrdersCountUsd(summary.countUsd);
        }
      } catch (error) {
        console.error('Error cargando resumen de órdenes:', error);
      } finally {
        setLoadingSummary(false);
      }
    };

    fetchOrdersSummary();
  }, [user?.accessContabilidad, user?.accessSubcontratos, user?.accessIngenieria]);

  const formatMoney = (amount: number) => amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Log para depurar el estado del usuario en el Sidebar
  console.log("Sidebar User State:", { email: user?.email, isApproved: user?.isApproved, role: user?.role });

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  return (
    <aside className="main-sidebar">
      <div className="sidebar-brand" onClick={onSelectDashboard} style={{ cursor: 'pointer' }}>
        <h3><span style={{ marginRight: '8px' }}>🏗️</span>SISTEMA DE OBRA v1.3</h3>
        <p><span style={{ marginRight: '6px' }}>📊</span>Panel de Control Activo</p>
      </div>

      <div className="sidebar-user">
        <div className="user-avatar">{user?.name?.charAt(0) || 'U'}</div>
        <div className="user-info">
          <span className="user-name">{user?.name || user?.email}</span>
          <span className="user-role"><span style={{ marginRight: '6px' }}>{user?.role === 'admin' ? '👑' : '👤'}</span>{user?.role === 'admin' ? 'Administrador' : 'Ingeniero de Obra'}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {(user && !user.isApproved && user.role !== 'admin') ? (
          <div style={{ padding: '1.2rem', color: '#856404', background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '8px', margin: '0 1rem', fontSize: '0.8rem', textAlign: 'center' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>ACCESO RESTRINGIDO</p>
            <p style={{ margin: '5px 0 0 0', opacity: 0.8 }}>Su cuenta está en espera de validación por TI.</p>
          </div>
        ) : (
          <>
            {user?.accessIngenieria && (
              <AccordionItem 
                title={<><span style={{ fontSize: '1.2rem' }}>📏</span> INGENIERÍA</>} 
                isOpen={openSection === 'Ingeniería'} 
                onToggle={() => toggleSection('Ingeniería')}
              >
                <ul>
                  <li><span style={{ marginRight: '8px' }}>📈</span>Control de Avance</li>
                  <li><span style={{ marginRight: '8px' }}>🗃️</span>Planos y Especificaciones</li>
                  <li><span style={{ marginRight: '8px' }}>📓</span>Bitácora de Obra</li>
                </ul>
              </AccordionItem>
            )}

            {user?.accessSubcontratos && (
              <AccordionItem 
                title={<><span style={{ fontSize: '1.2rem' }}>👷</span> SUBCONTRATOS</>} 
                isOpen={openSection === 'Subcontratos'} 
                onToggle={() => toggleSection('Subcontratos')}
              >
                <ul>
                  <li><span style={{ marginRight: '8px' }}>🤝</span>Gestión de Contratistas</li>
                  <li><span style={{ marginRight: '8px' }}>💸</span>Estimaciones de Pago</li>
                  <li><span style={{ marginRight: '8px' }}>✓️</span>Seguimiento de Tareas</li>
                </ul>
              </AccordionItem>
            )}

            {user?.accessContabilidad && (
              <AccordionItem 
                title={<><span style={{ fontSize: '1.2rem' }}>💰</span> CONTABILIDAD</>} 
                isOpen={openSection === 'Contabilidad'} 
                onToggle={() => toggleSection('Contabilidad')}
              >
                <ul>
                  <li onClick={onSelectBudget} style={{ cursor: 'pointer' }}><span style={{ marginRight: '8px' }}>📋</span>Presupuestos</li>
                  <li onClick={onSelectAdmCloud} style={{ cursor: 'pointer' }}><span style={{ marginRight: '8px' }}>☁️</span>AdmCloud PO</li>
                  <li onClick={onSelectBoletin} style={{ cursor: 'pointer', fontWeight: 'bold', color: '#1976d2' }}><span style={{ marginRight: '8px' }}>📋</span>Boletín de Medición</li>
                  <li><span style={{ marginRight: '8px' }}>📦</span>Órdenes de Compra</li>
                  <li><span style={{ marginRight: '8px' }}>📄</span>Reportes Financieros</li>
                </ul>
              </AccordionItem>
            )}

            {user?.role === 'admin' && (
              <div className="sidebar-accordion" style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                <AccordionItem 
                  title={<><span style={{ fontSize: '1.2rem' }}>⚙️</span> ADMINISTRACIÓN</>} 
                  isOpen={openSection === 'Admin'} 
                  onToggle={() => toggleSection('Admin')}
                >
                  <ul>
                    <li onClick={onSelectManagement} style={{ cursor: 'pointer' }}><span style={{ marginRight: '8px' }}>👥</span>Usuarios y Permisos</li>
                    <li onClick={onSelectRetentions} style={{ cursor: 'pointer' }}><span style={{ marginRight: '8px' }}>📊</span>Catálogo de Retenciones</li>
                    <li onClick={onSelectUnits} style={{ cursor: 'pointer' }}><span style={{ marginRight: '8px' }}>📐</span>Unidades de Medida</li>
                  </ul>
                </AccordionItem>
              </div>
            )}
          </>
        )}
      </nav>

      <div className="sidebar-quick-info">
        <div className="quick-info-header">
          <span>📊 Resumen Rápido</span>
        </div>
        <div className="quick-stats">
          <div className="quick-stat-item">
            <div className="stat-value">{loadingSummary ? '...' : ordersCount}</div>
            <div className="stat-label">Órdenes Generadas</div>
          </div>
          <div className="quick-stat-item">
            <div className="stat-value">{loadingSummary ? '...' : `$${formatMoney(ordersAmountDop)}`}</div>
            <div className="stat-label">Total DOP</div>
            <div className="stat-label" style={{ marginTop: '2px', fontSize: '0.7rem', opacity: 0.8 }}>
              {loadingSummary ? '...' : `${ordersCountDop} órdenes`}
            </div>
          </div>
          <div className="quick-stat-item quick-stat-item-last">
            <div className="stat-value">{loadingSummary ? '...' : `$${formatMoney(ordersAmountUsd)}`}</div>
            <div className="stat-label">Total USD</div>
            <div className="stat-label" style={{ marginTop: '2px', fontSize: '0.7rem', opacity: 0.8 }}>
              {loadingSummary ? '...' : `${ordersCountUsd} órdenes`}
            </div>
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <button onClick={logout} className="logout-button">
          <span style={{ marginRight: '8px' }}>🚪</span>Cerrar Sesión
        </button>
      </div>
    </aside>
  );
};
