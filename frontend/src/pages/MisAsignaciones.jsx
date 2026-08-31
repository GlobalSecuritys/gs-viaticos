import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TecnicoLayout from '../components/TecnicoLayout';
import api from '../services/api';
import { listarAsignaciones, obtenerMisAsignacionesActivas } from '../services/asignaciones';
import { LABEL_TIPO_ASIGNACION, LABEL_ESTADO_ASIGNACION } from '../utils/asignaciones';
import { formatFechaLarga, formatCOP } from '../utils/personal';
import './MisAsignaciones.css';

/**
 * Devuelve true si la fecha actual está dentro del rango [fecha_inicio, fecha_fin]
 * de la asignación (inclusive en ambos extremos).
 */
function estaEnRango(asignacion) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicio = new Date(asignacion.fecha_inicio + 'T00:00:00');
    const fin = new Date(asignacion.fecha_fin + 'T00:00:00');
    return hoy >= inicio && hoy <= fin;
}

export default function MisAsignaciones() {
    const navigate = useNavigate();

    const [asignaciones, setAsignaciones] = useState([]);
    const [viaticos, setViaticos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function cargar() {
            try {
                const [resAsig, resViaticos] = await Promise.all([
                    obtenerMisAsignacionesActivas().catch(() => listarAsignaciones()),
                    api.get('/viaticos').catch(() => ({ data: [] })),
                ]);
                setAsignaciones(resAsig.data || []);
                setViaticos(resViaticos.data || []);
            } catch {
                setError('No se pudieron cargar tus asignaciones.');
            } finally {
                setLoading(false);
            }
        }
        cargar();
    }, []);

    // Mapa de viáticos vinculados a cada asignación
    const viaticosPorAsignacion = useMemo(() => {
        const map = new Map();
        viaticos.forEach((v) => {
            let asigId = null;
            try {
                const parsed = JSON.parse(v.descripcion);
                asigId = parsed?.asignacion_id;
            } catch {
                if (v.ot?.startsWith('ASIG-#')) {
                    asigId = Number(v.ot.replace('ASIG-#', ''));
                }
            }

            if (asigId) {
                const list = map.get(asigId) || [];
                list.push(v);
                map.set(asigId, list);
            }
        });
        return map;
    }, [viaticos]);

    return (
        <TecnicoLayout>
            <div className="mis-asig-container">
                <div className="mis-asig-header">
                    <h1 className="mis-asig-title">📋 Mis Asignaciones</h1>
                    <p className="mis-asig-sub">
                        Misiones de campo, anticipos asignados y legalización de viáticos
                    </p>
                </div>

                {error && <div className="admin-error-banner">{error}</div>}

                {loading ? (
                    <div className="admin-loading-state">
                        <p>Cargando tus asignaciones...</p>
                    </div>
                ) : asignaciones.length === 0 ? (
                    <div className="admin-card-container mis-asig-empty">
                        <span className="empty-icon">📍</span>
                        <h3>No tienes asignaciones registradas</h3>
                        <p>Cuando un administrador te asigne una nueva misión, aparecerá en este panel.</p>
                    </div>
                ) : (
                    <div className="mis-asig-grid">
                        {asignaciones.map((a) => {
                            const viaticosLinked = viaticosPorAsignacion.get(a.id) || [];
                            const totalGastado = a.total_gastado !== undefined ? Number(a.total_gastado) : viaticosLinked.reduce((acc, v) => acc + Number(v.valor), 0);
                            const anticipoNum = Number(a.monto_anticipo ?? a.anticipo ?? 0);
                            const saldoRestante = a.saldo_restante !== undefined ? Number(a.saldo_restante) : Math.max(0, anticipoNum - totalGastado);
                            const cantItems = a.cantidad_viaticos !== undefined ? a.cantidad_viaticos : viaticosLinked.length;
                            const estadoLeg = a.estado_legalizacion || (cantItems === 0 ? 'sin_gastos' : totalGastado > anticipoNum ? 'excedido' : 'en_curso');

                            const legLabel = {
                                sin_gastos: 'Sin gastos',
                                en_curso: 'En proceso',
                                legalizado: 'Legalizado',
                                excedido: 'Excedido',
                            }[estadoLeg] || estadoLeg;

                            return (
                                <div key={a.id} className="mis-asig-card">
                                    <div className="mac-top">
                                        <span className="mac-tipo">
                                            {LABEL_TIPO_ASIGNACION[a.tipo] || a.tipo}
                                        </span>
                                        <span className={`estado-badge estado-badge--${a.estado === 'en_curso' ? 'activo' : a.estado}`}>
                                            {LABEL_ESTADO_ASIGNACION[a.estado] || a.estado}
                                        </span>
                                    </div>

                                    <h3 className="mac-cliente">{a.cliente}</h3>
                                    {a.empresa && <p className="mac-empresa">{a.empresa}</p>}

                                    {/* Resumen financiero por Asignación */}
                                    <div className="mac-financial-box">
                                        <div className="mac-fin-row">
                                            <span>Anticipo entregado</span>
                                            <strong>{formatCOP(anticipoNum)}</strong>
                                        </div>
                                        <div className="mac-fin-row">
                                            <span>Total gastado</span>
                                            <strong style={{ color: 'var(--color-primary-blue)' }}>{formatCOP(totalGastado)}</strong>
                                        </div>
                                        <div className="mac-fin-row mac-fin-row--saldo">
                                            <span>Saldo restante GSB</span>
                                            <strong>{formatCOP(saldoRestante)}</strong>
                                        </div>
                                        {totalGastado > anticipoNum && (
                                            <div className="mac-fin-row" style={{ background: '#FEF2F2', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #FCA5A5' }}>
                                                <span style={{ color: '#991B1B', fontWeight: 600 }}>🚨 Saldo a favor técnico</span>
                                                <strong style={{ color: '#DC2626' }}>{formatCOP(totalGastado - anticipoNum)}</strong>
                                            </div>
                                        )}
                                        <div className="mac-fin-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Ítems vinculados: <strong>{cantItems}</strong></span>
                                            <span style={{ fontSize: '0.78rem', background: estadoLeg === 'excedido' ? '#FEE2E2' : '#F1F5F9', color: estadoLeg === 'excedido' ? '#991B1B' : '#475569', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                                                Legalización: {legLabel}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mac-details">
                                        <div className="mac-detail-item">
                                            <span className="mac-detail-label">Ciudad / Lugar</span>
                                            <span className="mac-detail-val">📍 {a.ciudad}</span>
                                        </div>
                                        <div className="mac-detail-item">
                                            <span className="mac-detail-label">Periodo</span>
                                            <span className="mac-detail-val">
                                                📅 {formatFechaLarga(a.fecha_inicio)} — {formatFechaLarga(a.fecha_fin)}
                                            </span>
                                        </div>
                                        <div className="mac-detail-item">
                                            <span className="mac-detail-label">Cuenta de cobro</span>
                                            <span className="mac-detail-val">
                                                {a.cuenta_cobro?.secure_url ? (
                                                    <a
                                                        href={a.cuenta_cobro.secure_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ color: '#0284C7', textDecoration: 'underline', fontWeight: 600 }}
                                                    >
                                                        📄 Ver cargada
                                                    </a>
                                                ) : (
                                                    <span style={{ color: '#94A3B8' }}>Pendiente</span>
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {a.observaciones && (
                                        <p className="mac-obs">
                                            <strong>Notas:</strong> {a.observaciones}
                                        </p>
                                    )}

                                    {/* Botón de registro de viático: activo solo dentro del rango de fechas */}
                                    {estaEnRango(a) ? (
                                        <button
                                            className="mac-btn-viatico"
                                            onClick={() => navigate(`/nuevo-viatico?asignacion_id=${a.id}`)}
                                        >
                                            📝 Registrar viático para esta asignación →
                                        </button>
                                    ) : (
                                        <div className="mac-fuera-rango">
                                            <button
                                                className="mac-btn-viatico mac-btn-viatico--bloqueado"
                                                disabled
                                                title={`Periodo válido: ${formatFechaLarga(a.fecha_inicio)} – ${formatFechaLarga(a.fecha_fin)}`}
                                            >
                                                🔒 Registro bloqueado
                                            </button>
                                            <p className="mac-fuera-rango-msg">
                                                ⚠️ Esta asignación está fuera de su período válido
                                                ({formatFechaLarga(a.fecha_inicio)} – {formatFechaLarga(a.fecha_fin)}).
                                                Contacta al administrador para extender la fecha.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </TecnicoLayout>
    );
}
