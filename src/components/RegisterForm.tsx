import React, { useState } from 'react';

export const RegisterForm: React.FC<{ onToggle: () => void }> = ({ onToggle }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setIsError(false);

    try {
      const response = await fetch('http://localhost:5000/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('Usuario registrado con éxito. Ya puedes iniciar sesión.');
      } else {
        setIsError(true);
        setMessage(data.message || 'Error en el registro');
      }
    } catch (err) {
      setIsError(true);
      setMessage('Error de conexión');
    }
  };

  return (
    <div className="auth-container">
      <h2 className="auth-title">REGISTRO</h2>
      <p className="auth-subtitle">Alta de Nuevo Ingeniero / Técnico</p>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Nombre Completo</label>
          <input
            type="text"
            className="form-input"
            placeholder="Ing. Juan Pérez"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Correo Electrónico</label>
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
            placeholder="Define una contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {message && (
          <div className={isError ? "error-message" : "success-message"}>
            {message}
          </div>
        )}
        <button type="submit" className="btn-primary">
          Confirmar Registro
        </button>
        <button type="button" onClick={onToggle} className="btn-link">
          Volver al Inicio de Sesión
        </button>
      </form>
    </div>
  );
};
