import React, { useState, useEffect } from 'react';

interface Signature {
    id?: number;
    name: string;        // Nombre completo (de AdmCloud)
    alias?: string;      // Abreviatura para mostrar en PDF
    role: string;
}

export const SignatureConfigManagement: React.FC = () => {
    const [employees, setEmployees] = useState<{ FullName: string }[]>([]);
    const [signatures, setSignatures] = useState<Signature[]>([
        { name: '', alias: '', role: '' },
        { name: '', alias: '', role: '' },
    ]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const token = () => localStorage.getItem('token');

    useEffect(() => {
        setLoading(true);
        Promise.all([
            fetch('http://localhost:5000/api/signature-config', { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
            fetch('http://localhost:5000/api/admcloud/employees', { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.ok ? r.json() : [])
        ])
            .then(([sigs, emps]) => {
                setEmployees(emps || []);
                if (Array.isArray(sigs) && sigs.length > 0) {
                    setSignatures(sigs.map((s: any) => ({ id: s.id, name: s.name, alias: s.alias || '', role: s.role })));
                }
            })
            .catch(() => setMessage({ type: 'error', text: 'Error cargando datos. Verifique que el servidor esté activo.' }))
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        const toSave = signatures
            .filter(s => s.name.trim())
            .map(s => ({ name: s.name, alias: s.alias?.trim() || undefined, role: s.role }));
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch('http://localhost:5000/api/signature-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ signatures: toSave })
            });
            if (res.ok) {
                const updated = await res.json();
                setSignatures(
                    updated.length > 0
                        ? updated.map((s: any) => ({ ...s, alias: s.alias || '' }))
                        : [{ name: '', alias: '', role: '' }, { name: '', alias: '', role: '' }]
                );
                setMessage({ type: 'success', text: `✅ Configuración guardada — ${updated.length} firma(s) activa(s)` });
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.message || 'Error al guardar' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Error de conexión con el servidor' });
        } finally {
            setSaving(false);
        }
    };

    const updateRow = (idx: number, field: keyof Signature, value: string) =>
        setSignatures(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));

    const addRow = () => setSignatures(prev => [...prev, { name: '', alias: '', role: '' }]);
    const removeRow = (idx: number) => setSignatures(prev => prev.filter((_, i) => i !== idx));

    return (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Cargando...</div>
            ) : (
                <>
                    {/* Info */}
                    <div style={{ backgroundColor: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                        <p style={{ margin: 0, color: '#1565c0', fontSize: '0.95rem' }}>
                            <strong>📌 Nota:</strong> Las firmas se incluyen automáticamente en todos los PDFs. La <strong>Abreviatura</strong> es opcional — si se define, se muestra en el PDF en lugar del nombre completo, aunque el empleado sigue siendo el seleccionado de AdmCloud.
                        </p>
                    </div>

                    {/* Table */}
                    <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
                        {/* Header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 1fr 40px', backgroundColor: '#f8f9fa', padding: '12px 16px', borderBottom: '1px solid #dee2e6', fontWeight: '700', fontSize: '0.82rem', color: '#555' }}>
                            <span>NOMBRE (AdmCloud)</span>
                            <span>ABREVIATURA <span style={{ fontWeight: 400, color: '#999' }}>(PDF)</span></span>
                            <span>CARGO / ROL</span>
                            <span />
                        </div>

                        {/* Rows */}
                        {signatures.map((sig, idx) => (
                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 1fr 40px', padding: '10px 16px', borderBottom: idx < signatures.length - 1 ? '1px solid #eee' : 'none', alignItems: 'center', backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa', gap: '8px' }}>
                                {/* Nombre completo - dropdown AdmCloud */}
                                <select
                                    value={sig.name}
                                    onChange={e => updateRow(idx, 'name', e.target.value)}
                                    style={{ width: '100%', padding: '7px 8px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '0.85rem', backgroundColor: 'white' }}
                                >
                                    <option value="">— Seleccionar —</option>
                                    {employees.map(emp => (
                                        <option key={emp.FullName} value={emp.FullName}>{emp.FullName}</option>
                                    ))}
                                </select>

                                {/* Alias / Abreviatura */}
                                <input
                                    type="text"
                                    placeholder="Ej: Ing. J. Pérez"
                                    value={sig.alias || ''}
                                    onChange={e => updateRow(idx, 'alias', e.target.value)}
                                    title={sig.name ? `Nombre completo: ${sig.name}` : 'Seleccione empleado primero'}
                                    style={{ width: '100%', padding: '7px 8px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                />

                                {/* Cargo / Rol */}
                                <input
                                    type="text"
                                    placeholder="ej: Director, Residente de Obra"
                                    value={sig.role}
                                    onChange={e => updateRow(idx, 'role', e.target.value)}
                                    style={{ width: '100%', padding: '7px 8px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                />

                                {/* Eliminar */}
                                <div style={{ textAlign: 'center' }}>
                                    {signatures.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeRow(idx)}
                                            style={{ padding: '4px 8px', backgroundColor: '#ffebee', color: '#d32f2f', border: '1px solid #ffcdd2', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                                            title="Eliminar fila"
                                        >✕</button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={addRow}
                            disabled={signatures.length >= 6}
                            style={{ padding: '8px 16px', backgroundColor: '#e3f2fd', color: signatures.length >= 6 ? '#aaa' : '#1976d2', border: `1px solid ${signatures.length >= 6 ? '#ccc' : '#1976d2'}`, borderRadius: '6px', cursor: signatures.length >= 6 ? 'not-allowed' : 'pointer', fontSize: '0.9rem', fontWeight: '600' }}
                        >
                            + Agregar firmante
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            style={{ padding: '10px 28px', backgroundColor: saving ? '#aaa' : '#1976d2', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '1rem', fontWeight: '700' }}
                        >
                            {saving ? '⏳ Guardando...' : '💾 Guardar Configuración'}
                        </button>
                    </div>

                    {/* Status */}
                    {message && (
                        <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '6px', backgroundColor: message.type === 'success' ? '#e8f5e9' : '#ffebee', border: `1px solid ${message.type === 'success' ? '#a5d6a7' : '#ffcdd2'}`, color: message.type === 'success' ? '#2e7d32' : '#c62828', fontSize: '0.95rem' }}>
                            {message.text}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
