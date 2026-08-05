import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import ModalEvidencia from '../components/ModalEvidencia';
import { listarAsignaciones } from '../services/asignaciones';
import {
    LABEL_CARGO,
    LABEL_TIPO_GASTO,
    filtrarPorRango,
    finDeSemana,
    formatCOP,
    formatFechaLarga,
    hoyISO,
    iniciales,
    inicioDeSemana,
    nombreDia,
    numeroDeSemana,
    resumen,
} from '../utils/personal';
import { LABEL_TIPO_ASIGNACION, LABEL_ESTADO_ASIGNACION, CLASE_ESTADO_ASIGNACION, obtenerAsignacionActivaDeTecnico } from '../utils/asignaciones';
import './Personal.css';
import './PerfilEmpleado.css';
import '../components/AsignacionCard.css';

const FILTROS = [
    { id: 'hoy', label: 'Hoy' },
    { id: 'semana', label: 'Semana' },
    { id: 'mes', label: 'Mes' },
    { id: 'personalizado', label: 'Personalizado' },
];

function aISO(date) {
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mes}-${dia}`;
}

export default function PerfilEmpleado() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [usuario, setUsuario] = useState(null);
    const [viaticos, setViaticos] = useState([]);
    const [asignaciones, setAsignaciones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filtro, setFiltro] = useState('mes');
    const [seleccionado, setSeleccionado] = useState(null);

    async function recargarViaticos() {
        const resViaticos = await api.get('/admin/viaticos');
        setViaticos(resViaticos.data.filter((v) => String(v.usuario_id) === id));
    }

    async function aprobar(viaticoId) {
        try {
            await api.put(`/admin/viaticos/${viaticoId}/aprobar`);
            setSeleccionado(null);
            recargarViaticos();
        } catch {
            setError('No se pudo aprobar el viático.');
        }
    }

    async function rechazar(viaticoId) {
        try {
            await api.put(`/admin/viaticos/${viaticoId}/rechazar`);
            setSeleccionado(null);
            recargarViaticos();
        } catch {
            setError('No se pudo rechazar el viático.');
        }
    }

    const [hoy] = useState(() => new Date());
    const [inicioMesISO] = useState(() => aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
    const [rangoInicio, setRangoInicio] = useState(inicioMesISO);
    const [rangoFin, setRangoFin] = useState(hoyISO());

    useEffect(() => {
        async function cargar() {
            try {
                const [resUsuarios, resViaticos] = await Promise.all([
                    api.get('/admin/usuarios'),
                    api.get('/admin/viaticos'),
                ]);
                const encontrado = resUsuarios.data.find((u) => String(u.id) === id);
                if (!encontrado) {
                    setError('Empleado no encontrado.');
                } else {
                    setUsuario(encontrado);
                    setViaticos(resViaticos.data.filter((v) => String(v.usuario_id) === id));
                }
            } catch {
                setError('No se pudo cargar la información del empleado.');
            } finally {
                setLoading(false);
            }

            // Tolerante: si el backend de Asignaciones (Fase 2) aún no existe,
            // la sección simplemente mostrará "Sin asignación activa".
            try {
                const resAsignaciones = await listarAsignaciones();
                setAsignaciones(resAsignaciones.data);
            } catch {
                setAsignaciones([]);
            }
        }
        cargar();
    }, [id]);

    const asignacionActiva = useMemo(
        () => obtenerAsignacionActivaDeTecnico(asignaciones, id),
        [asignaciones, id]
    );

    const viaticosFiltrados = useMemo(() => {
        if (filtro === 'hoy') {
            const h = hoyISO();
            return filtrarPorRango(viaticos, h, h);
        }
        if (filtro === 'semana') {
            return filtrarPorRango(
                viaticos,
                aISO(inicioDeSemana(hoy)),
                aISO(finDeSemana(hoy))
            );
        }
        if (filtro === 'mes') {
            return filtrarPorRango(viaticos, inicioMesISO, hoyISO());
        }
        // personalizado
        return filtrarPorRango(viaticos, rangoInicio, rangoFin);
    }, [filtro, viaticos, rangoInicio, rangoFin, hoy, inicioMesISO]);

    const resumenPeriodo = useMemo(() => resumen(viaticosFiltrados), [viaticosFiltrados]);

    if (loading) {
        return (
            <div className="admin-root">
                <div className="admin-main">
                    <p style={{ color: 'var(--color-text-muted)' }}>Cargando perfil...</p>
                </div>
            </div>
        );
    }

    if (error || !usuario) {
        return (
            <div className="admin-root">
                <div className="admin-main">
                    <button className="admin-back-btn" onClick={() => navigate('/admin/personal')}>← Volver</button>
                    <p style={{ color: 'var(--color-rechazado, #EF4444)' }}>{error || 'Empleado no encontrado.'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-root">
            <div className="admin-main">
                <button className="admin-back-btn" onClick={() => navigate('/admin/personal')}>← Volver a Personal</button>

                {/* Sección 1: Información general */}
                <div className="perfil-header">
                    <div className="perfil-avatar">{iniciales(usuario.nombre)}</div>
                    <div>
                        <h1 className="perfil-nombre">{usuario.nombre}</h1>
                        <p className="perfil-cargo">{LABEL_CARGO[usuario.rol] || usuario.rol}</p>
                        <span className={`rol-badge rol-badge--${usuario.rol}`}>{usuario.rol.toUpperCase()}</span>
                    </div>
                </div>

                <div className="perfil-info-grid">
                    <div>
                        <span className="modal-info-label">Código empleado</span>
                        <span className="modal-info-valor">{usuario.codigo_empleado || '—'}</span>
                    </div>
                    <div>
                        <span className="modal-info-label">Correo</span>
                        <span className="modal-info-valor">{usuario.correo}</span>
                    </div>
                    <div>
                        <span className="modal-info-label">Estado actual</span>
                        <span className={`estado-pill ${usuario.activo ? 'estado-pill--activo' : 'estado-pill--inactivo'}`}>
                            {usuario.activo ? 'Activo' : 'Inactivo'}
                        </span>
                    </div>
                </div>

                {/* Sección 2: Asignación actual (entidad real de Fase 2, ya no inferida de viáticos) */}
                <h2 className="admin-section-title">Asignación actual</h2>
                {asignacionActiva ? (
                    <div className="asignacion-card">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <h3 className="asignacion-ot" style={{ margin: 0 }}>
                                {LABEL_TIPO_ASIGNACION[asignacionActiva.tipo] || asignacionActiva.tipo}
                            </h3>
                            <span className={`estado-asignacion ${CLASE_ESTADO_ASIGNACION[asignacionActiva.estado] || ''}`}>
                                {LABEL_ESTADO_ASIGNACION[asignacionActiva.estado] || asignacionActiva.estado}
                            </span>
                        </div>
                        <div className="perfil-info-grid">
                            <div>
                                <span className="modal-info-label">Cliente</span>
                                <span className="modal-info-valor">{asignacionActiva.cliente}</span>
                            </div>
                            <div>
                                <span className="modal-info-label">Empresa</span>
                                <span className="modal-info-valor">{asignacionActiva.empresa || '—'}</span>
                            </div>
                            <div>
                                <span className="modal-info-label">Ciudad</span>
                                <span className="modal-info-valor">{asignacionActiva.ciudad}</span>
                            </div>
                            <div>
                                <span className="modal-info-label">Inicio</span>
                                <span className="modal-info-valor">{formatFechaLarga(asignacionActiva.fecha_inicio)}</span>
                            </div>
                            <div>
                                <span className="modal-info-label">Final</span>
                                <span className="modal-info-valor">{formatFechaLarga(asignacionActiva.fecha_fin)}</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p style={{ color: 'var(--color-text-muted)' }}>Sin asignación activa.</p>
                )}

                {/* Sección 3: Filtros de tiempo */}
                <h2 className="admin-section-title">Viáticos por periodo</h2>

                <div className="filtro-tabs">
                    {FILTROS.map((f) => (
                        <button
                            key={f.id}
                            className={`filtro-tab ${filtro === f.id ? 'filtro-tab--activo' : ''}`}
                            onClick={() => setFiltro(f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {filtro === 'personalizado' && (
                    <div className="rango-personalizado">
                        <label>
                            Desde
                            <input type="date" value={rangoInicio} onChange={(e) => setRangoInicio(e.target.value)} />
                        </label>
                        <label>
                            Hasta
                            <input type="date" value={rangoFin} onChange={(e) => setRangoFin(e.target.value)} />
                        </label>
                    </div>
                )}

                {filtro === 'hoy' && <VistaHoy viaticos={viaticosFiltrados} resumenPeriodo={resumenPeriodo} />}
                {filtro === 'semana' && <VistaSemana viaticos={viaticosFiltrados} resumenPeriodo={resumenPeriodo} />}
                {(filtro === 'mes' || filtro === 'personalizado') && (
                    <VistaResumen
                        viaticos={viaticosFiltrados}
                        resumenPeriodo={resumenPeriodo}
                        titulo={filtro === 'mes' ? 'Este mes' : 'Periodo seleccionado'}
                        onVerDetalle={setSeleccionado}
                    />
                )}
            </div>

            {seleccionado && (
                <ModalEvidencia
                    viatico={seleccionado}
                    onClose={() => setSeleccionado(null)}
                    onAprobar={aprobar}
                    onRechazar={rechazar}
                />
            )}
        </div>
    );
}

function VistaHoy({ viaticos, resumenPeriodo }) {
    if (viaticos.length === 0) {
        return <p style={{ color: 'var(--color-text-muted)' }}>Sin viáticos registrados hoy.</p>;
    }
    return (
        <div className="periodo-card">
            <p className="periodo-fecha">{formatFechaLarga(viaticos[0].fecha)}</p>
            <ul className="checklist">
                {viaticos.map((v) => (
                    <li key={v.id}>
                        ✓ {LABEL_TIPO_GASTO[v.tipo_gasto] || v.tipo_gasto} — {formatCOP(v.valor)}
                    </li>
                ))}
            </ul>
            <div className="periodo-total">
                <span>Total</span>
                <strong>{formatCOP(resumenPeriodo.total)}</strong>
            </div>
        </div>
    );
}

function VistaSemana({ viaticos, resumenPeriodo }) {
    if (viaticos.length === 0) {
        return <p style={{ color: 'var(--color-text-muted)' }}>Sin viáticos registrados esta semana.</p>;
    }

    const porDia = new Map();
    for (const v of viaticos) {
        const dia = nombreDia(v.fecha);
        if (!porDia.has(dia)) porDia.set(dia, []);
        porDia.get(dia).push(v);
    }
    const orden = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    return (
        <div className="periodo-card">
            <p className="periodo-fecha">Semana {numeroDeSemana(new Date())}</p>
            {orden.filter((d) => porDia.has(d)).map((dia) => (
                <div key={dia} className="semana-dia">
                    <span className="semana-dia-nombre">{dia}</span>
                    <ul className="checklist">
                        {porDia.get(dia).map((v) => (
                            <li key={v.id}>{LABEL_TIPO_GASTO[v.tipo_gasto] || v.tipo_gasto}</li>
                        ))}
                    </ul>
                </div>
            ))}
            <div className="periodo-total">
                <span>Total semana</span>
                <strong>{formatCOP(resumenPeriodo.total)}</strong>
            </div>
        </div>
    );
}

function VistaResumen({ viaticos, resumenPeriodo, titulo, onVerDetalle }) {
    return (
        <div>
            <div className="admin-stats-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="admin-stat-card">
                    <span className="stat-label">Total gastado</span>
                    <span className="stat-value">{formatCOP(resumenPeriodo.total)}</span>
                </div>
                <div className="admin-stat-card">
                    <span className="stat-label">Solicitudes</span>
                    <span className="stat-value">{resumenPeriodo.cantidad}</span>
                </div>
                <div className="admin-stat-card admin-stat-card--aprobado">
                    <span className="stat-label">Aprobadas</span>
                    <span className="stat-value">{resumenPeriodo.aprobados}</span>
                </div>
                <div className="admin-stat-card admin-stat-card--pendiente">
                    <span className="stat-label">Pendientes</span>
                    <span className="stat-value">{resumenPeriodo.pendientes}</span>
                </div>
                <div className="admin-stat-card admin-stat-card--rechazado">
                    <span className="stat-label">Rechazadas</span>
                    <span className="stat-value">{resumenPeriodo.rechazados}</span>
                </div>
            </div>

            {viaticos.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)' }}>Sin viáticos en {titulo.toLowerCase()}.</p>
            ) : (
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Cliente</th>
                            <th>Ciudad</th>
                            <th>Tipo</th>
                            <th>Valor</th>
                            <th>Evidencias</th>
                            <th>Estado</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {viaticos.map((v) => (
                            <tr key={v.id}>
                                <td>{formatFechaLarga(v.fecha)}</td>
                                <td>{v.cliente}</td>
                                <td>{v.ciudad}</td>
                                <td>{LABEL_TIPO_GASTO[v.tipo_gasto] || v.tipo_gasto}</td>
                                <td>{formatCOP(v.valor)}</td>
                                <td>{v.evidencias?.length > 0 ? `📎 ${v.evidencias.length}` : 'Sin fotos'}</td>
                                <td>
                                    <span className={`rol-badge rol-badge--${v.estado === 'pendiente' ? 'tecnico' : v.estado === 'aprobado' ? 'admin' : 'tecnico'}`}>
                                        {v.estado.toUpperCase()}
                                    </span>
                                </td>
                                <td>
                                    <button className="admin-mini-btn" onClick={() => onVerDetalle(v)}>
                                        Ver detalle
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
