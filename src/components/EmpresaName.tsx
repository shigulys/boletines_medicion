import React, { useEffect, useState } from 'react';

interface EmpresaNameProps {
  subsidiaryId: string;
}

const EmpresaName: React.FC<EmpresaNameProps> = ({ subsidiaryId }) => {
  const [empresa, setEmpresa] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!subsidiaryId) {
      setEmpresa('');
      return;
    }
    setLoading(true);
    setError('');
    fetch(`http://localhost:5000/api/admcloud/subsidiaries/${subsidiaryId}`)
      .then((res) => res.json())
      .then((data) => {
        setEmpresa(data?.name || '');
      })
      .catch(() => setError('No se pudo obtener el nombre de la empresa.'))
      .finally(() => setLoading(false));
  }, [subsidiaryId]);

  if (loading) return <span>Cargando empresa...</span>;
  if (error) return <span style={{ color: 'red' }}>{error}</span>;
  return <span style={{ fontWeight: 600, fontSize: '1.1em' }}>{empresa || subsidiaryId}</span>;
};

export default EmpresaName;