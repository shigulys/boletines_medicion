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
  const [subcontractCount, setSubcontractCount] = useState<number>(0);
  const [loadingSubcontracts, setLoadingSubcontracts] = useState<boolean>(false);
  const [boletinesCount, setBoletinesCount] = useState<number>(0);
  const [loadingBoletines, setLoadingBoletines] = useState<boolean>(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('editBoletin') || params.get('generateBoletin') || params.get('boletinSelection')) {
      setActiveTab('boletin');
      setIsEditingInNewTab(true);
    }
  }, []);

  // Cargar conteo de subcontratos del departamento específico
  useEffect(() => {
    const fetchSubcontractCount = async () => {
      if (!user?.accessSubcontratos) return;
      
      setLoadingSubcontracts(true);
      try {
        const token = localStorage.getItem('token');
        const url = new URL('http://localhost:5000/api/admcloud/transactions');
        url.searchParams.append('departmentFilter', 'subcontratos');
        
        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setSubcontractCount(data.length);
          console.log(`✅ Subcontratos cargados: ${data.length} órdenes del departamento 134A52D2-1FF9-4BB1-564D-08DE34362E70`);
        }
      } catch (error) {
        console.error('Error cargando conteo de subcontratos:', error);
      } finally {
        setLoadingSubcontracts(false);
      }
    };

    fetchSubcontractCount();
  }, [user?.accessSubcontratos]);

  // Cargar conteo total de boletines emitidos
  useEffect(() => {
    const fetchBoletinesCount = async () => {
      if (!user?.accessIngenieria) return;
      
      setLoadingBoletines(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:5000/api/payment-requests', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setBoletinesCount(data.length);
          console.log(`✅ Boletines cargados: ${data.length} boletines emitidos`);
        }
      } catch (error) {
        console.error('Error cargando conteo de boletines:', error);
      } finally {
        setLoadingBoletines(false);
      }
    };

    fetchBoletinesCount();
  }, [user?.accessIngenieria]);

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
              {user?.accessSubcontratos && (
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <div className="dashboard-card-icon">👷</div>
                    <h3>Subcontratos</h3>
                  </div>
                  <div className="dashboard-card-metric">
                    {loadingSubcontracts ? '...' : subcontractCount}
                  </div>
                  <div className="dashboard-card-label">
                    Órdenes del Departamento de Subcontratos
                  </div>
                  <div className="dashboard-card-progress">
                    <div className="progress-label">
                      <span>Departamento Específico</span>
                      <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>ID: 134A52D2</span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{width: '100%', background: 'linear-gradient(90deg, #4CAF50 0%, #66BB6A 100%)'}}></div>
                    </div>
                  </div>
                  <div className="dashboard-card-footer">
                    <div className="footer-stat">
                      <div className="footer-stat-value">{subcontractCount}</div>
                      <div className="footer-stat-label">Total OC</div>
                    </div>
                    <div className="footer-stat">
                      <div className="footer-stat-value">✓</div>
                      <div className="footer-stat-label">Filtrado</div>
                    </div>
                    <div className="footer-stat">
                      <div className="footer-stat-value">🔍</div>
                      <div className="footer-stat-label">Específico</div>
                    </div>
                  </div>
                </div>
              )}
              {user?.accessIngenieria && (
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <div className="dashboard-card-icon">📋</div>
                    <h3>Boletines</h3>
                  </div>
                  <div className="dashboard-card-metric">
                    {loadingBoletines ? '...' : boletinesCount}
                  </div>
                  <div className="dashboard-card-label">Boletines Emitidos</div>
                  <div className="dashboard-card-progress">
                    <div className="progress-label">
                      <span>Total de Documentos</span>
                      <span>{boletinesCount > 0 ? '✓' : '-'}</span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{width: boletinesCount > 0 ? '100%' : '0%', background: 'linear-gradient(90deg, #2196F3 0%, #42A5F5 100%)'}}></div>
                    </div>
                  </div>
                  <div className="dashboard-card-footer">
                    <div className="footer-stat">
                      <div className="footer-stat-value">{boletinesCount}</div>
                      <div className="footer-stat-label">Total</div>
                    </div>
                    <div className="footer-stat">
                      <div className="footer-stat-value">📄</div>
                      <div className="footer-stat-label">Emitidos</div>
                    </div>
                    <div className="footer-stat">
                      <div className="footer-stat-value">✓</div>
                      <div className="footer-stat-label">Activos</div>
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
