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
import { RetentionManagement } from './components/RetentionManagement'
import { UnitOfMeasureManagement } from './components/UnitOfMeasureManagement'
import { PaymentScheduling } from './components/PaymentScheduling'
import { AdmCloudPayrollReport } from './components/AdmCloudPayrollReport'
import WarehouseAccess from './components/WarehouseAccess'

function App() {
  const { user, isLoading } = useAuth();
  const [view, setView] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'budget' | 'admcloud' | 'boletin' | 'paymentScheduling' | 'retentions' | 'units' | 'payrollReport' | 'warehouseAccess'>('dashboard');
  const [isEditingInNewTab, setIsEditingInNewTab] = useState(false);
  const [subcontractCount, setSubcontractCount] = useState<number>(0);
  const [loadingSubcontracts, setLoadingSubcontracts] = useState<boolean>(false);
  const [boletinesCount, setBoletinesCount] = useState<number>(0);
  const [boletinesPendientes, setBoletinesPendientes] = useState<number>(0);
  const [boletinesRechazados, setBoletinesRechazados] = useState<number>(0);
  const [loadingBoletines, setLoadingBoletines] = useState<boolean>(false);
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

  const formatMoney = (amount: number) => amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('editBoletin') || params.get('generateBoletin') || params.get('boletinSelection')) {
      setActiveTab('boletin');
      setIsEditingInNewTab(true);
      return;
    }

    if (params.get('paymentScheduleEdit')) {
      setActiveTab('paymentScheduling');
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
      if (!user?.accessContabilidad) return;
      
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
          
          // Contar por estado
          const pendientes = data.filter((b: any) => b.status === 'PENDIENTE').length;
          const rechazados = data.filter((b: any) => b.status === 'RECHAZADO').length;
          
          setBoletinesPendientes(pendientes);
          setBoletinesRechazados(rechazados);
        }
      } catch (error) {
        console.error('Error cargando conteo de boletines:', error);
      } finally {
        setLoadingBoletines(false);
      }
    };

    fetchBoletinesCount();
  }, [user?.accessContabilidad]);

  useEffect(() => {
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
                  <div className="dashboard-card-metric">{loadingSubcontracts ? '...' : subcontractCount}</div>
                  <div className="dashboard-card-label">Órdenes del Departamento de Subcontratos</div>
                </div>
              )}

              {user?.accessContabilidad && (
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <div className="dashboard-card-icon">📋</div>
                    <h3>Boletines</h3>
                  </div>
                  <div className="dashboard-card-metric">{loadingBoletines ? '...' : boletinesCount}</div>
                  <div className="dashboard-card-label">Boletines Emitidos</div>
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

      case 'paymentScheduling':
        return <PaymentSchedulingWrapper />;

      case 'retentions':
        return user?.role === 'admin' ? <RetentionWrapper /> : <div>No tiene permiso para acceder a esta sección.</div>;

      case 'units':
        return user?.role === 'admin' ? <UnitsWrapper /> : <div>No tiene permiso para acceder a esta sección.</div>;

      case 'payrollReport':
        return <PayrollReportWrapper />;

      case 'warehouseAccess':
        return user?.role === 'admin' ? <WarehouseAccess /> : <div>No tiene permiso para acceder a esta sección.</div>;

      default:
        return <div>Sección no encontrada.</div>;
    }
  };

  return (
    <div className="App">
      {user ? (
        <>
          <Sidebar
            onSelectManagement={() => setActiveTab('users')}
            onSelectDashboard={() => setActiveTab('dashboard')}
            onSelectBudget={() => setActiveTab('budget')}
            onSelectAdmCloud={() => setActiveTab('admcloud')}
            onSelectBoletin={() => setActiveTab('boletin')}
            onSelectPaymentScheduling={() => setActiveTab('paymentScheduling')}
            onSelectRetentions={() => setActiveTab('retentions')}
            onSelectUnits={() => setActiveTab('units')}
            onSelectPayrollReport={() => setActiveTab('payrollReport')}
            onSelectWarehouseAccess={() => setActiveTab('warehouseAccess')}
          />
          <main className="main-content">{renderContent()}</main>
        </>
      ) : (
        <div className="auth-container">
          {view === 'login' ? (
            <LoginForm onSwitch={() => setView('register')} />
          ) : (
            <RegisterForm onSwitch={() => setView('login')} />
          )}
        </div>
      )}
    </div>
  );

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

const PaymentSchedulingWrapper = () => (
  <>
    <header className="content-header">
      <h1>Programación de Pagos</h1>
      <p>Consolidación de boletines para aprobación y envío a finanzas</p>
    </header>
    <PaymentScheduling />
  </>
);

const RetentionWrapper = () => (
  <>
    <header className="content-header">
      <h1>Catálogo de Retenciones</h1>
      <p>Administración de tipos de retención para boletines de medición</p>
    </header>
    <RetentionManagement />
  </>
);

const UnitsWrapper = () => (
  <>
    <header className="content-header">
      <h1>Catálogo de Unidades de Medida</h1>
      <p>Administración de unidades para uso en boletines de medición</p>
    </header>
    <UnitOfMeasureManagement />
  </>
);

const PayrollReportWrapper = () => (
  <>
    <header className="content-header">
      <h1>Reporte de Nóminas AdmCloud</h1>
      <p>Consulta columnar de nóminas generadas y su detalle de empleados</p>
    </header>
    <AdmCloudPayrollReport />
  </>
);


export default App
