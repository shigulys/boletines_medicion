import { useState, useEffect } from 'react'
import './App.css'
import { LoginForm } from './components/LoginForm'
import { RegisterForm } from './components/RegisterForm'
import { useAuth } from './context/AuthContext'
import { Sidebar } from './components/layout/Sidebar'
import { UserManagement } from './components/UserManagement'
import { BudgetManagement } from './components/BudgetManagement'
import { AdmCloudTransactions } from './components/AdmCloudTransactions'
import { BoletinMedicion } from './components/BoletinMedicion'

function App() {
  const { user, isLoading } = useAuth();
  const [view, setView] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'budget' | 'admcloud' | 'boletin'>('dashboard');
  const [isEditingInNewTab, setIsEditingInNewTab] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('editBoletin') || params.get('generateBoletin') || params.get('boletinSelection')) {
      setActiveTab('boletin');
      setIsEditingInNewTab(true);
    }
  }, []);

  if (isLoading) {
    return <div className="loading-screen">Cargando Sistema de Obra...</div>;
  }

  // Debug: Ver estado del usuario en consola
  if (user) console.log('Usuario actual en App:', user);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <>
            <header className="content-header">
              <h1>Panel General de Control</h1>
              <p>Estado actual de la obra y gestión de recursos</p>
            </header>
            
            <section className="dashboard-grid">
              {user?.accessIngenieria && (
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <div className="dashboard-card-icon">📋</div>
                    <h3>Ingeniería</h3>
                  </div>
                  <div className="dashboard-card-metric">12</div>
                  <div className="dashboard-card-label">Tareas en progreso</div>
                  <div className="dashboard-card-progress">
                    <div className="progress-label">
                      <span>Avance semanal</span>
                      <span>75%</span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{width: '75%'}}></div>
                    </div>
                  </div>
                  <div className="dashboard-card-footer">
                    <div className="footer-stat">
                      <div className="footer-stat-value">8</div>
                      <div className="footer-stat-label">Planos</div>
                    </div>
                    <div className="footer-stat">
                      <div className="footer-stat-value">24</div>
                      <div className="footer-stat-label">Revisiones</div>
                    </div>
                    <div className="footer-stat">
                      <div className="footer-stat-value">3</div>
                      <div className="footer-stat-label">Pendientes</div>
                    </div>
                  </div>
                </div>
              )}
              {user?.accessSubcontratos && (
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <div className="dashboard-card-icon">👷</div>
                    <h3>Subcontratos</h3>
                  </div>
                  <div className="dashboard-card-metric">8</div>
                  <div className="dashboard-card-label">Contratos en ejecución</div>
                  <div className="dashboard-card-progress">
                    <div className="progress-label">
                      <span>Cumplimiento</span>
                      <span>92%</span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{width: '92%'}}></div>
                    </div>
                  </div>
                  <div className="dashboard-card-footer">
                    <div className="footer-stat">
                      <div className="footer-stat-value">$2.4M</div>
                      <div className="footer-stat-label">Valor Total</div>
                    </div>
                    <div className="footer-stat">
                      <div className="footer-stat-value">5</div>
                      <div className="footer-stat-label">Activos</div>
                    </div>
                    <div className="footer-stat">
                      <div className="footer-stat-value">3</div>
                      <div className="footer-stat-label">Finalizando</div>
                    </div>
                  </div>
                </div>
              )}
              {user?.accessContabilidad && (
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <div className="dashboard-card-icon">💰</div>
                    <h3>Contabilidad</h3>
                  </div>
                  <div className="dashboard-card-metric">45%</div>
                  <div className="dashboard-card-label">Presupuesto ejecutado</div>
                  <div className="dashboard-card-progress">
                    <div className="progress-label">
                      <span>$5.2M de $11.5M</span>
                      <span>45%</span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{width: '45%'}}></div>
                    </div>
                  </div>
                  <div className="dashboard-card-footer">
                    <div className="footer-stat">
                      <div className="footer-stat-value">156</div>
                      <div className="footer-stat-label">Facturas</div>
                    </div>
                    <div className="footer-stat">
                      <div className="footer-stat-value">$1.2M</div>
                      <div className="footer-stat-label">Por Pagar</div>
                    </div>
                    <div className="footer-stat">
                      <div className="footer-stat-value">12</div>
                      <div className="footer-stat-label">Pendientes</div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        );
      case 'users':
        return user?.role === 'admin' ? <UserPermissionsWrapper /> : <div>No tiene permiso para acceder a esta sección.</div>;
      case 'budget':
        return <BudgetWrapper />;
      case 'admcloud':
        return <AdmCloudWrapper />;
      case 'boletin':
        return <BoletinWrapper />;
      default:
        return <div>Sección no encontrada.</div>;
    }
  };

  return (
    <div className="App">
      {!user ? (
        <div className="auth-wrapper">
          {view === 'login' ? (
            <LoginForm onToggle={() => setView('register')} />
          ) : (
            <RegisterForm onToggle={() => setView('login')} />
          )}
        </div>
      ) : (
        <div className={`app-layout ${isEditingInNewTab ? 'no-sidebar' : ''}`}>
          {!isEditingInNewTab && (
            <Sidebar 
              onSelectManagement={() => setActiveTab('users')} 
              onSelectDashboard={() => setActiveTab('dashboard')} 
              onSelectBudget={() => setActiveTab('budget')}
              onSelectAdmCloud={() => setActiveTab('admcloud')}
              onSelectBoletin={() => setActiveTab('boletin')}
            />
          )}
          <main className="main-content">
            {renderContent()}
          </main>
        </div>
      )}
    </div>
  )
}

const UserPermissionsWrapper = () => (
  <>
    <header className="content-header">
      <h1>Administración de Usuarios</h1>
      <p>Control de acceso y permisos del sistema</p>
    </header>
    <UserManagement />
  </>
);

const BudgetWrapper = () => (
  <>
    <header className="content-header">
      <h1>Presupuestos de Obra</h1>
      <p>Carga y administración de presupuestos desde Excel</p>
    </header>
    <BudgetManagement />
  </>
);

const AdmCloudWrapper = () => (
  <>
    <header className="content-header">
      <h1>Órdenes de Compra AdmCloud</h1>
      <p>Consulta de transacciones en tiempo real desde la nube</p>
    </header>
    <AdmCloudTransactions />
  </>
);

const BoletinWrapper = () => (
  <>
    <header className="content-header">
      <h1>Boletín de Medición</h1>
      <p>Gestión de cubicaciones y solicitudes de pago</p>
    </header>
    <BoletinMedicion />
  </>
);

export default App
