import { useEffect, useMemo, useState } from 'react';
import TecnicoLayout from '../components/TecnicoLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatFechaLarga } from '../utils/personal';
import './CuentaCobro.css';

function formatCOP(val) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(val);
}

export default function CuentaCobro() {
    const { user } = useAuth();

    const [viaticos, setViaticos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function cargar() {
            try {
                const { data } = await api.get('/viaticos');
                setViaticos(data || []);
            } catch {
                setError('No se pudieron cargar los datos de la cuenta de cobro.');
            } finally {
                setLoading(false);
            }
        }
        cargar();
    }, []);

    const aprobados = useMemo(
        () => viaticos.filter((v) => v.estado === 'aprobado'),
        [viaticos]
    );

    const pendientes = useMemo(
        () => viaticos.filter((v) => v.estado === 'pendiente'),
        [viaticos]
    );

    const totalAprobado = useMemo(
        () => aprobados.reduce((acc, v) => acc + Number(v.valor), 0),
        [aprobados]
    );

    const totalPendiente = useMemo(
        () => pendientes.reduce((acc, v) => acc + Number(v.valor), 0),
        [pendientes]
    );

    function imprimirCuenta() {
        window.print();
    }

    return (
        <TecnicoLayout>
            <div className="cuenta-container">
                <div className="cuenta-header">
                    <div>
                        <h1 className="cuenta-title">💵 Cuenta de Cobro / Estado de Cuenta</h1>
                        <p className="cuenta-sub">Resumen de viáticos aprobados y balance a favor de la empresa o técnico</p>
                    </div>
                    <button className="cuenta-print-btn" onClick={imprimirCuenta}>
                        🖨️ Imprimir / Exportar PDF
                    </button>
                </div>

                {error && <div className="admin-error-banner">{error}</div>}

                {/* Card de Resumen Financiero */}
                <div className="admin-card-container cuenta-summary-card">
                    <div className="cuenta-summary-grid">
                        <div className="cuenta-summary-item">
                            <span className="cs-label">Técnico Titular</span>
                            <span className="cs-val">{user?.nombre || user?.correo}</span>
                        </div>
                        <div className="cuenta-summary-item">
                            <span className="cs-label">Cédula</span>
                            <span className="cs-val">{user?.codigo_empleado ? `CC ${user.codigo_empleado}` : '1.234.567.890'}</span>
                        </div>
                        <div className="cuenta-summary-item">
                            <span className="cs-label">Total Viáticos Aprobados</span>
                            <span className="cs-val cs-val--green">{formatCOP(totalAprobado)}</span>
                        </div>
                        <div className="cuenta-summary-item">
                            <span className="cs-label">En Proceso de Aprobación</span>
                            <span className="cs-val cs-val--orange">{formatCOP(totalPendiente)}</span>
                        </div>
                    </div>
                </div>

                {/* Detalle de Gastos Aprobados */}
                <div className="admin-card-container">
                    <div className="admin-card-toolbar">
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                            Detalle de Viáticos Aprobados ({aprobados.length})
                        </h3>
                    </div>

                    {loading ? (
                        <div className="admin-loading-state">
                            <p>Cargando información financiera...</p>
                        </div>
                    ) : aprobados.length === 0 ? (
                        <div className="admin-loading-state">
                            <p>No tienes viáticos legalizados en estado aprobado actualmente.</p>
                        </div>
                    ) : (
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Concepto</th>
                                        <th>Cliente / Lugar</th>
                                        <th>Ciudad</th>
                                        <th>Valor</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {aprobados.map((v) => (
                                        <tr key={v.id}>
                                            <td>{formatFechaLarga(v.fecha)}</td>
                                            <td>
                                                <strong style={{ textTransform: 'capitalize' }}>
                                                    {v.tipo_gasto}
                                                </strong>
                                            </td>
                                            <td>{v.cliente}</td>
                                            <td>{v.ciudad}</td>
                                            <td>
                                                <strong style={{ color: 'var(--color-primary-blue)' }}>
                                                    {formatCOP(v.valor)}
                                                </strong>
                                            </td>
                                            <td>
                                                <span className="estado-badge estado-badge--activo">
                                                    APROBADO
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </TecnicoLayout>
    );
}
