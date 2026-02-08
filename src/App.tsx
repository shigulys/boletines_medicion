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
                  <h3>Resumen de Ingeniería</h3>
                  <p>No hay tareas pendientes para hoy.</p>
                </div>
              )}
              {user?.accessSubcontratos && (
                <div className="dashboard-card">
                  <h3>Subcontratos Activos</h3>
                  <p>8 subcontratos en ejecución.</p>
                </div>
              )}
              {user?.accessContabilidad && (
                <div className="dashboard-card">
                  <h3>Estado Contable</h3>
                  <p>Presupuesto ejecutado al 45%.</p>
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
