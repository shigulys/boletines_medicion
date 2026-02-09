import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface AccordionProps {
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

const AccordionItem: React.FC<AccordionProps> = ({ title, children, isOpen, onToggle }) => {
  return (
    <div className="sidebar-accordion">
      <button className={`accordion-header ${isOpen ? 'active' : ''}`} onClick={onToggle}>
        <span>{title}</span>
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
}> = ({ onSelectManagement, onSelectDashboard, onSelectBudget, onSelectAdmCloud, onSelectBoletin }) => {
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
        <h3>SISTEMA DE OBRA v1.3</h3>
        <p>Panel de Control Activo</p>
      </div>

      <div className="sidebar-user">
        <div className="user-avatar">{user?.name?.charAt(0) || 'U'}</div>
        <div className="user-info">
          <span className="user-name">{user?.name || user?.email}</span>
          <span className="user-role">{user?.role === 'admin' ? 'Administrador' : 'Ingeniero de Obra'}</span>
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
                title="INGENIERÍA" 
                isOpen={openSection === 'Ingeniería'} 
                onToggle={() => toggleSection('Ingeniería')}
              >
                <ul>
                  <li>Control de Avance</li>
                  <li>Planos y Especificaciones</li>
                  <li>Bitácora de Obra</li>
                </ul>
              </AccordionItem>
            )}

            {user?.accessSubcontratos && (
              <AccordionItem 
                title="SUBCONTRATOS" 
                isOpen={openSection === 'Subcontratos'} 
                onToggle={() => toggleSection('Subcontratos')}
              >
                <ul>
                  <li>Gestión de Contratistas</li>
                  <li>Estimaciones de Pago</li>
                  <li>Seguimiento de Tareas</li>
                </ul>
              </AccordionItem>
            )}

            {user?.accessContabilidad && (
              <AccordionItem 
                title="CONTABILIDAD" 
                isOpen={openSection === 'Contabilidad'} 
                onToggle={() => toggleSection('Contabilidad')}
              >
                <ul>
                  <li onClick={onSelectBudget} style={{ cursor: 'pointer' }}>Presupuestos</li>
                  <li onClick={onSelectAdmCloud} style={{ cursor: 'pointer' }}>AdmCloud PO</li>
                  <li onClick={() => window.open('/?boletinSelection=true', '_blank')} style={{ cursor: 'pointer', fontWeight: 'bold', color: '#1976d2' }}>Boletín de Medición</li>
                  <li>Órdenes de Compra</li>
                  <li>Reportes Financieros</li>
                </ul>
              </AccordionItem>
            )}

            {user?.role === 'admin' && (
              <div className="sidebar-accordion" style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                <button className="accordion-header" onClick={onSelectManagement}>
                  <span>ADMINISTRACIÓN</span>
                </button>
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
            <div className="stat-value">24</div>
            <div className="stat-label">Documentos</div>
          </div>
          <div className="quick-stat-item">
            <div className="stat-value">8</div>
            <div className="stat-label">Tareas Hoy</div>
          </div>
          <div className="quick-stat-item">
            <div className="stat-value">$1.2M</div>
            <div className="stat-label">En Proceso</div>
          </div>
        </div>
        <div className="quick-info-section">
          <div className="info-section-title">Actividad Reciente</div>
          <div className="activity-item">
            <div className="activity-dot"></div>
            <div className="activity-text">Boletín #156 aprobado</div>
          </div>
          <div className="activity-item">
            <div className="activity-dot"></div>
            <div className="activity-text">OC-2024-89 recibida</div>
          </div>
          <div className="activity-item">
            <div className="activity-dot"></div>
            <div className="activity-text">3 docs pendientes</div>
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <button onClick={logout} className="logout-button">
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
};
