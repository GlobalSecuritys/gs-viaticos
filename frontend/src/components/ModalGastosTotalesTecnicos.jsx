import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { formatCOP, iniciales } from '../utils/personal';
import './ModalGastosTotalesTecnicos.css';

export default function ModalGastosTotalesTecnicos({ onClose, onVerPerfil }) {
    const [tecnicos, setTecnicos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [busqueda, setBusqueda] = useState('');

    useEffect(() => {
        let cancelado = false;
        async function cargar() {
            setCargando(true);
            try {
                const { data } = await api.get('/admin/tecnicos-gastos-totales');
                if (!cancelado) {
                    setTecnicos(data || []);
                    setError('');
                }
            } catch (err) {
                if (!cancelado) {
                    setError('No se pudo cargar el listado de gastos de técnicos.');
                }
            } finally {
                if (!cancelado) setCargando(false);
            }
        }
        cargar();
        return () => { cancelado = true; };
    }, []);

    const filtrados = useMemo(() => {
        if (!busqueda.trim()) return tecnicos;
        const q = busqueda.toLowerCase().trim();
        return tecnicos.filter(t =>
            t.nombre?.toLowerCase().includes(q) ||
            t.codigo_empleado?.toLowerCase().includes(q) ||
            t.correo?.toLowerCase().includes(q)
        );
    }, [tecnicos, busqueda]);

    const totalConsolidado = useMemo(() => {
        return tecnicos.reduce((acc, t) => acc + Number(t.total_gastado || 0), 0);
    }, [tecnicos]);

    return (
        <div className="gsb-modal-overlay" onClick={onClose}>
            <div className="gsb-modal-box mgtt-modal-box" onClick={e => e.stopPropagation()}>
                <div className="mgtt-header">
                    <div>
                        <h2 className="mgtt-title">💰 Dinero Gastado por Técnico</h2>
                        <span className="mgtt-subtitle">
                            {cargando ? 'Cargando técnicos…' : `${tecnicos.length} técnicos registrados`}
                        </span>
                    </div>
                    <button type="button" className="mgtt-close-btn" onClick={onClose} aria-label="Cerrar">
                        ✕
                    </button>
                </div>

                <div className="mgtt-search-wrap">
                    <span className="mgtt-search-icon">🔍</span>
                    <input
                        type="text"
                        placeholder="Buscar por nombre o cédula..."
                        className="mgtt-search-input"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        autoFocus
                    />
                    {busqueda && (
                        <button type="button" className="mgtt-clear-btn" onClick={() => setBusqueda('')}>
                            ✕
                        </button>
                    )}
                </div>

                <div className="mgtt-body">
                    {cargando ? (
                        <div className="mgtt-loading">Cargando listado de técnicos…</div>
                    ) : error ? (
                        <div className="mgtt-error">{error}</div>
                    ) : filtrados.length === 0 ? (
                        <div className="mgtt-empty">Ningún técnico coincide con la búsqueda.</div>
                    ) : (
                        <div className="mgtt-list">
                            {filtrados.map((t, idx) => {
                                const gasto = Number(t.total_gastado || 0);
                                return (
                                    <div
                                        key={t.id}
                                        className="mgtt-row"
                                        onClick={() => onVerPerfil && onVerPerfil(t.id)}
                                        title={`Ver perfil de ${t.nombre}`}
                                    >
                                        <span className="mgtt-rank">#{idx + 1}</span>
                                        <div className="mgtt-avatar">
                                            {iniciales(t.nombre) || 'T'}
                                        </div>
                                        <div className="mgtt-info">
                                            <strong className="mgtt-name">{t.nombre}</strong>
                                            <span className="mgtt-meta">
                                                Cédula: {t.codigo_empleado || 'Sin asignar'}
                                            </span>
                                        </div>
                                        <div className="mgtt-amount">
                                            <span className="mgtt-amount-val">
                                                {formatCOP(gasto)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="mgtt-footer">
                    <div className="mgtt-total-box">
                        <span className="mgtt-total-lbl">Total Gastado General:</span>
                        <strong className="mgtt-total-val">{formatCOP(totalConsolidado)}</strong>
                    </div>
                    <button type="button" className="mgtt-btn-close" onClick={onClose}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
