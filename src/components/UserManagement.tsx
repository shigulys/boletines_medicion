import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface UserData {
  id: number;
  email: string;
  name: string | null;
  role: string;
  isApproved: boolean;
  accessIngenieria: boolean;
  accessSubcontratos: boolean;
  accessContabilidad: boolean;
}

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  
  // States for the new user form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' });
  const [formError, setFormError] = useState('');

  const fetchUsers = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        // Asegurarnos que isApproved tenga un valor booleano
        const cleanedData = data.map((u: UserData) => ({
          ...u,
          isApproved: !!u.isApproved,
          accessIngenieria: !!u.accessIngenieria,
          accessSubcontratos: !!u.accessSubcontratos,
          accessContabilidad: !!u.accessContabilidad,
        }));
        setUsers(cleanedData);
      } else {
        console.error('Error in fetch response:', data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching users:', error);
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    try {
      const response = await fetch('http://localhost:5000/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newUser, isApprovedFromAdmin: true })
      });

      if (response.ok) {
        setShowAddForm(false);
        setNewUser({ name: '', email: '', password: '', role: 'user' });
        fetchUsers();
      } else {
        const data = await response.json();
        setFormError(data.message || 'Error al crear usuario');
      }
    } catch {
      setFormError('Error de conexión');
    }
  };

  useEffect(() => {
    const load = async () => {
      if (token) {
        await fetchUsers();
      }
    };
    load();
  }, [token]);

  const togglePermission = async (userId: number, field: keyof UserData, currentValue: any) => {
    // Si es un campo booleano, lo invertimos. Si no (como role), usamos el valor que venga.
    // Si el valor actual es null o undefined, asumimos que queremos activarlo (true).
    let updatedValue;
    if (typeof currentValue === 'boolean') {
      updatedValue = !currentValue;
    } else if (currentValue === null || currentValue === undefined) {
      updatedValue = true;
    } else {
      updatedValue = currentValue;
    }

    console.log(`Cambiando ${field} para usuario ${userId}: ${currentValue} -> ${updatedValue}`);
    
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;

      const updatedData = { ...user, [field]: updatedValue };

      const response = await fetch(`http://localhost:5000/api/users/${userId}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedData)
      });

      if (response.ok) {
        const savedUser = await response.json();
        console.log('Servidor respondió con usuario actualizado:', savedUser);
        
        // Aseguramos que el estado local use los valores actualizados y mantenga los existentes
        const finalUser = {
          ...user,
          ...savedUser,
          isApproved: typeof savedUser.isApproved === 'boolean' ? savedUser.isApproved : updatedValue
        };
        
        setUsers(users.map(u => u.id === userId ? finalUser : u));
      } else {
        const errorData = await response.json();
        console.error('Error del servidor:', errorData);
        alert('Error al actualizar: ' + (errorData.message || 'Desconocido'));
      }
    } catch {
      console.error('Error de conexión');
      alert('Error de conexión con el servidor');
    }
  };

  if (loading) return <div>Cargando usuarios...</div>;

  return (
    <div className="dashboard-card" style={{ width: '100%', overflowX: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, color: '#1a1a1a' }}>Gestión de Usuarios</h2>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn-primary" 
          style={{ width: 'auto', padding: '8px 16px', fontSize: '0.85rem' }}
        >
          {showAddForm ? 'Cancelar' : '+ Nuevo Usuario'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddUser} style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #dee2e6' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>Registrar Nuevo Personal</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label>Nombre</label>
              <input 
                className="form-input" 
                type="text" 
                placeholder="Ej. Ing. Luis Garcia"
                value={newUser.name}
                onChange={e => setNewUser({...newUser, name: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input 
                className="form-input" 
                type="email" 
                placeholder="correo@empresa.com"
                value={newUser.email}
                onChange={e => setNewUser({...newUser, email: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>Contraseña Provisional</label>
              <input 
                className="form-input" 
                type="password"
                value={newUser.password}
                onChange={e => setNewUser({...newUser, password: e.target.value})}
                required
              />
            </div>
          </div>
          {formError && <p style={{ color: 'red', fontSize: '0.85rem' }}>{formError}</p>}
          <button type="submit" className="btn-primary" style={{ marginTop: '1rem', width: 'auto', padding: '10px 24px' }}>
            Guardar Usuario
          </button>
        </form>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ padding: '12px' }}>Usuario</th>
            <th style={{ padding: '12px' }}>Estado</th>
            <th style={{ padding: '12px' }}>Ingeniería</th>
            <th style={{ padding: '12px' }}>Subcontratos</th>
            <th style={{ padding: '12px' }}>Contabilidad</th>
            <th style={{ padding: '12px' }}>Rol</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} style={{ borderBottom: '1px solid #eee', backgroundColor: user.isApproved ? 'transparent' : '#fff9db' }}>
              <td style={{ padding: '12px' }}>
                <div style={{ fontWeight: 600 }}>{user.name || 'Sin nombre'}</div>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>{user.email}</div>
              </td>
              <td style={{ padding: '12px' }}>
                <button 
                  onClick={() => togglePermission(user.id, 'isApproved', user.isApproved)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: user.isApproved ? '#28a745' : '#ffc107',
                    color: user.isApproved ? 'white' : 'black',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  {user.isApproved ? 'Aprobado' : 'Pendiente'}
                </button>
              </td>
              <td style={{ padding: '12px' }}>
                <input 
                  type="checkbox" 
                  checked={user.accessIngenieria} 
                  disabled={!user.isApproved}
                  onChange={() => togglePermission(user.id, 'accessIngenieria', user.accessIngenieria)}
                />
              </td>
              <td style={{ padding: '12px' }}>
                <input 
                  type="checkbox" 
                  checked={user.accessSubcontratos} 
                  onChange={() => togglePermission(user.id, 'accessSubcontratos', user.accessSubcontratos)}
                />
              </td>
              <td style={{ padding: '12px' }}>
                <input 
                  type="checkbox" 
                  checked={user.accessContabilidad} 
                  onChange={() => togglePermission(user.id, 'accessContabilidad', user.accessContabilidad)}
                />
              </td>
              <td style={{ padding: '12px' }}>
                <select 
                  value={user.role} 
                  onChange={(e) => togglePermission(user.id, 'role', e.target.value)}
                  style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
                >
                  <option value="user">Usuario</option>
                  <option value="admin">Administrador</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
