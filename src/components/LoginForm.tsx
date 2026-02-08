import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginForm: React.FC<{ onToggle: () => void }> = ({ onToggle }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        login(data.token, data.user);
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('Connection error');
    }
  };

  return (
    <div className="auth-container">
      <h2 className="auth-title">SISTEMA DE OBRA</h2>
      <p className="auth-subtitle">Ingreso de Personal Técnico</p>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Email Corporativo</label>
          <input
            type="email"
            className="form-input"
            placeholder="usuario@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Contraseña</label>
          <input
            type="password"
            className="form-input"
            placeholder="Introduce tu clave"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="error-message">{error}</div>}
        <button type="submit" className="btn-primary">
          Iniciar Sesión
        </button>
        <button type="button" onClick={onToggle} className="btn-link">
          Solicitar acceso / Registro
        </button>
      </form>
    </div>
  );
};
