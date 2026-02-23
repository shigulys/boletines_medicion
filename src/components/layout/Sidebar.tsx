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
  activeTab: string;
  onSelectManagement: () => void;
  onSelectDashboard: () => void;
  onSelectBudget: () => void;
  onSelectAdmCloud: () => void;
  onSelectBoletin: () => void;
  onSelectPaymentScheduling: () => void;
  onSelectRetentions: () => void;
  onSelectUnits: () => void;
  onSelectWarehouseAccess: () => void;
}> = ({ activeTab, onSelectManagement, onSelectDashboard, onSelectBudget, onSelectAdmCloud, onSelectBoletin, onSelectPaymentScheduling, onSelectRetentions, onSelectUnits, onSelectWarehouseAccess }) => {
  const { user, logout } = useAuth();
  const [openSection, setOpenSection] = useState<string | null>('Ingeniería');

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
            {user && (
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

            {user && (
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

            {user && (
              <AccordionItem
                title={<><span style={{ fontSize: '1.2rem' }}>💰</span> CONTABILIDAD</>}
                isOpen={openSection === 'Contabilidad'}
                onToggle={() => toggleSection('Contabilidad')}
              >
                <ul>
                  <li onClick={() => { console.log("Sidebar: Click Presupuestos"); onSelectBudget(); }} style={{ cursor: 'pointer', fontWeight: activeTab === 'budget' ? 'bold' : 'normal', color: activeTab === 'budget' ? '#1976d2' : 'inherit' }}><span style={{ marginRight: '8px' }}>📋</span>Presupuestos</li>
                  <li onClick={() => { console.log("Sidebar: Click AdmCloud"); onSelectAdmCloud(); }} style={{ cursor: 'pointer', fontWeight: activeTab === 'admcloud' ? 'bold' : 'normal', color: activeTab === 'admcloud' ? '#1976d2' : 'inherit' }}><span style={{ marginRight: '8px' }}>☁️</span>AdmCloud PO</li>
                  <li onClick={() => { console.log("Sidebar: Click Boletín"); onSelectBoletin(); }} style={{ cursor: 'pointer', fontWeight: activeTab === 'boletin' ? 'bold' : 'normal', color: activeTab === 'boletin' ? '#1976d2' : 'inherit' }}><span style={{ marginRight: '8px' }}>📋</span>Boletín de Medición</li>
                  <li onClick={() => { console.log("Sidebar: Click Pagos"); onSelectPaymentScheduling(); }} style={{ cursor: 'pointer', fontWeight: activeTab === 'paymentScheduling' ? 'bold' : 'normal', color: activeTab === 'paymentScheduling' ? '#1976d2' : 'inherit' }}><span style={{ marginRight: '8px' }}>💳</span>Programación de Pagos</li>
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
                    <li onClick={() => { console.log("Sidebar: Click Usuarios"); onSelectManagement(); }} style={{ cursor: 'pointer', fontWeight: activeTab === 'users' ? 'bold' : 'normal', color: activeTab === 'users' ? '#1976d2' : 'inherit' }}><span style={{ marginRight: '8px' }}>👥</span>Usuarios y Permisos</li>
                    <li onClick={() => { console.log("Sidebar: Click Retenciones"); onSelectRetentions(); }} style={{ cursor: 'pointer', fontWeight: activeTab === 'retentions' ? 'bold' : 'normal', color: activeTab === 'retentions' ? '#1976d2' : 'inherit' }}><span style={{ marginRight: '8px' }}>📊</span>Catálogo de Retenciones</li>
                    <li onClick={() => { console.log("Sidebar: Click Unidades"); onSelectUnits(); }} style={{ cursor: 'pointer', fontWeight: activeTab === 'units' ? 'bold' : 'normal', color: activeTab === 'units' ? '#1976d2' : 'inherit' }}><span style={{ marginRight: '8px' }}>📐</span>Unidades de Medida</li>
                    <li onClick={() => { console.log("Sidebar: Click Almacenes"); onSelectWarehouseAccess(); }} style={{ cursor: 'pointer', fontWeight: activeTab === 'warehouseAccess' ? 'bold' : 'normal', color: activeTab === 'warehouseAccess' ? '#1976d2' : 'inherit' }}><span style={{ marginRight: '8px' }}>🏬</span>Acceso Almacenes</li>
                  </ul>
                </AccordionItem>
              </div>
            )}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <button onClick={logout} className="logout-button">
          <span style={{ marginRight: '8px' }}>🚪</span>Cerrar Sesión
        </button>
      </div>
    </aside>
  );
};
