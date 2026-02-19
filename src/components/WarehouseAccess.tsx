import React, { useState } from 'react';

interface UserAccess {
  ID: string;
  LocationID: string;
  RelationshipID: string;
  RelationshipName: string;
}

const initialUserAccess: UserAccess = {
  ID: '',
  LocationID: '',
  RelationshipID: '',
  RelationshipName: '',
};

const WarehouseAccess: React.FC = () => {
  const [userAccess, setUserAccess] = useState<UserAccess>(initialUserAccess);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserAccess({ ...userAccess, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      // Llamada al endpoint backend
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admcloud/warehouse-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ Users: [userAccess] }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message || 'Acceso concedido correctamente.');
        setUserAccess(initialUserAccess);
      } else {
        setMessage(data.message || 'Error al conceder acceso.');
      }
    } catch (error) {
      setMessage('Error al conceder acceso.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Acceso a Almacenes</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>ID Usuario:</label>
          <input name="ID" value={userAccess.ID} onChange={handleChange} required />
        </div>
        <div>
          <label>ID Almacén (LocationID):</label>
          <input name="LocationID" value={userAccess.LocationID} onChange={handleChange} required />
        </div>
        <div>
          <label>ID Relación:</label>
          <input name="RelationshipID" value={userAccess.RelationshipID} onChange={handleChange} required />
        </div>
        <div>
          <label>Nombre Relación:</label>
          <input name="RelationshipName" value={userAccess.RelationshipName} onChange={handleChange} required />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Procesando...' : 'Conceder Acceso'}
        </button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
};

export default WarehouseAccess;
