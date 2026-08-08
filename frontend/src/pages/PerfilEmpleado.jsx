import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { listarAsignaciones } from '../services/asignaciones';
import {
    LABEL_TIPO_ASIGNACION,
    obtenerAsignacionesActivasDeTecnico,
} from '../utils/asignaciones';
import ModalEvidencia from '../components/ModalEvidencia';
import {
    ICONO_TIPO_GASTO,
    LABEL_CARGO,
    LABEL_TIPO_GASTO,
    filtrarPorRango,
    finDeSemana,
    formatCOP,
    formatFechaLarga,
    hoyISO,
    iniciales,
    inicioDeSemana,
    rangoSemanaDelMes,
    resumen,
    semanaDelMesActual,
} from '../utils/personal';
import './PerfilEmpleado.css';

const FILTROS_PERIODO = [
    { id: 'hoy', label: 'Hoy' },
    { id: 'semana', label: 'Semana' },
    { id: 'mes', label: 'Mes' },
    { id: 'personalizado', label: 'Personalizado' },
];

const FILTROS_TIPO_ASIGNACION = [
    { id: 'todas', label: 'Todas' },
    { id: 'rtc', label: 'RTC' },
    { id: 'oficina', label: 'Oficina' },
];

function aISO(date) {
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mes}-${dia}`;
}

const LABEL_ESTADO_VIATICO = {
    aprobado: 'Aprobado',
    pendiente: 'Pendiente',
    rechazado: 'Rechazado',
};

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
    const [semanaNumero, setSemanaNumero] = useState(() => semanaDelMesActual(hoy));
    // Filtro 2 (tipo de asignación): la UI queda lista, pero no filtra nada
    // todavía porque el backend no tiene un campo que distinga RTC/Oficina
    // por viático. Ver nota en el mensaje de entrega.
    const [tipoAsignacion, setTipoAsignacion] = useState('todas');

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

            // Aparte y tolerante a fallos: si /admin/asignaciones falla (tabla
            // sin migrar, red, etc.) no debe tumbar la carga del resto del perfil.
            try {
                const resAsignaciones = await listarAsignaciones();
                setAsignaciones(resAsignaciones.data);
            } catch {
                setAsignaciones([]);
            }
        }
        cargar();
    }, [id]);

    const asignacionesActivas = useMemo(
        () => obtenerAsignacionesActivasDeTecnico(asignaciones, id),
        [asignaciones, id]
    );

    const viaticosFiltrados = useMemo(() => {
        if (filtro === 'hoy') {
            const h = hoyISO();
            return filtrarPorRango(viaticos, h, h);
        }
        if (filtro === 'semana') {
            const { inicio, fin } = rangoSemanaDelMes(semanaNumero, hoy);
            return filtrarPorRango(viaticos, inicio, fin);
        }
        if (filtro === 'mes') {
            return filtrarPorRango(viaticos, inicioMesISO, hoyISO());
        }
        // personalizado
        return filtrarPorRango(viaticos, rangoInicio, rangoFin);
    }, [filtro, viaticos, rangoInicio, rangoFin, hoy, inicioMesISO, semanaNumero]);

    const resumenPeriodo = useMemo(() => resumen(viaticosFiltrados), [viaticosFiltrados]);

    const viaticosOrdenados = useMemo(
        () => [...viaticosFiltrados].sort((a, b) => b.fecha.localeCompare(a.fecha)),
        [viaticosFiltrados]
    );

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
                    <button className="admin-back-btn" onClick={() => navigate('/admin')}>← Volver</button>
                    <p style={{ color: 'var(--color-rechazado, #EF4444)' }}>{error || 'Empleado no encontrado.'}</p>
                </div>
            </div>
        );
    }

    const esAdmin = usuario.rol === 'admin' || usuario.rol === 'superadmin';

    return (
        <div className="admin-root">
            <div className="admin-main pf-main">

                {/* Sección 1: Cabecera del perfil */}
                <div className="pf-card pf-header-card">
                    <div className="pf-header-top">
                        <button className="admin-back-btn" onClick={() => navigate('/admin')}>← Volver</button>
                        <span className={`pf-estado-pill ${usuario.activo ? 'pf-estado-pill--activo' : 'pf-estado-pill--inactivo'}`}>
                            <span className="pf-estado-dot" />
                            {usuario.activo ? 'Activo' : 'Inactivo'}
                        </span>
                    </div>

                    <div className="pf-header-body">
                        <div className="pf-avatar">{iniciales(usuario.nombre)}</div>
                        <div className="pf-header-datos">
                            <div className="pf-header-nombre-row">
                                <h1 className="pf-nombre">{usuario.nombre}</h1>
                                <span className={`pf-rol-badge ${esAdmin ? 'pf-rol-badge--admin' : 'pf-rol-badge--tecnico'}`}>
                                    {LABEL_CARGO[usuario.rol] || usuario.rol}
                                </span>
                            </div>
                            <div className="pf-header-meta">
                                <span>Código: {usuario.codigo_empleado || '—'}</span>
                                <span className="pf-header-meta-sep">•</span>
                                <span>{usuario.correo}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sección 2: Misión / asignaciones actuales */}
                <h2 className="pf-section-title">Asignación actual</h2>
                {asignacionesActivas.length > 0 ? (
                    <div className="pf-mision-lista">
                        {asignacionesActivas.map((asignacion) => (
                            <div className="pf-mision-card" key={asignacion.id}>
                                <div className="pf-mision-top">
                                    <span className="pf-mision-label">📍 Asignación actual</span>
                                </div>

                                <div className="pf-mision-grid">
                                    <div>
                                        <span className="pf-info-label">Cliente</span>
                                        <span className="pf-info-valor">{asignacion.cliente}</span>
                                    </div>
                                    <div>
                                        <span className="pf-info-label">Ciudad</span>
                                        <span className="pf-info-valor">{asignacion.ciudad}</span>
                                    </div>
                                    <div>
                                        <span className="pf-info-label">Tipo</span>
                                        <span className="pf-info-valor">
                                            {LABEL_TIPO_ASIGNACION[asignacion.tipo] || asignacion.tipo}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="pf-info-label">Inicio</span>
                                        <span className="pf-info-valor">{formatFechaLarga(asignacion.fecha_inicio)}</span>
                                    </div>
                                    <div>
                                        <span className="pf-info-label">Final</span>
                                        <span className="pf-info-valor">{formatFechaLarga(asignacion.fecha_fin)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="pf-mision-vacia">No tienes asignaciones activas.</div>
                )}

                {/* Sección 3: Filtros */}
                <h2 className="pf-section-title">Viáticos</h2>

                <div className="pf-filtros-wrap">
                    <div className="pf-filtro-grupo">
                        <span className="pf-filtro-grupo-label">Periodo</span>
                        <div className="pf-tabs">
                            {FILTROS_PERIODO.map((f) => (
                                <button
                                    key={f.id}
                                    className={`pf-tab ${filtro === f.id ? 'pf-tab--activo' : ''}`}
                                    onClick={() => setFiltro(f.id)}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        {filtro === 'semana' && (
                            <div className="pf-subtabs">
                                {[1, 2, 3, 4].map((n) => (
                                    <button
                                        key={n}
                                        className={`pf-subtab ${semanaNumero === n ? 'pf-subtab--activo' : ''}`}
                                        onClick={() => setSemanaNumero(n)}
                                    >
                                        Semana {n}
                                    </button>
                                ))}
                            </div>
                        )}

                        {filtro === 'personalizado' && (
                            <div className="pf-rango-personalizado">
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
                    </div>

                    <div className="pf-filtro-grupo">
                        <span className="pf-filtro-grupo-label">
                            Tipo de asignación
                            <span className="pf-filtro-nota" title="El backend aún no distingue RTC/Oficina por viático">
                                (próximamente)
                            </span>
                        </span>
                        <div className="pf-tabs pf-tabs--deshabilitado">
                            {FILTROS_TIPO_ASIGNACION.map((f) => (
                                <button
                                    key={f.id}
                                    className={`pf-tab ${tipoAsignacion === f.id ? 'pf-tab--activo' : ''}`}
                                    onClick={() => setTipoAsignacion(f.id)}
                                    disabled
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Sección 4: Resumen compacto */}
                <div className="pf-resumen-bar">
                    <div className="pf-resumen-item pf-resumen-item--total">
                        <span className="pf-resumen-valor">{formatCOP(resumenPeriodo.total)}</span>
                        <span className="pf-resumen-label">Total gastado</span>
                    </div>
                    <div className="pf-resumen-divisor" />
                    <div className="pf-resumen-item">
                        <span className="pf-resumen-valor">{resumenPeriodo.cantidad}</span>
                        <span className="pf-resumen-label">Solicitudes</span>
                    </div>
                    <div className="pf-resumen-item">
                        <span className="pf-resumen-valor pf-resumen-valor--pendiente">{resumenPeriodo.pendientes}</span>
                        <span className="pf-resumen-label">Pendientes</span>
                    </div>
                    <div className="pf-resumen-item">
                        <span className="pf-resumen-valor pf-resumen-valor--aprobado">{resumenPeriodo.aprobados}</span>
                        <span className="pf-resumen-label">Aprobadas</span>
                    </div>
                    <div className="pf-resumen-item">
                        <span className="pf-resumen-valor pf-resumen-valor--rechazado">{resumenPeriodo.rechazados}</span>
                        <span className="pf-resumen-label">Rechazadas</span>
                    </div>
                </div>

                {/* Sección 5: Historial como tarjetas */}
                <h2 className="pf-section-title">Historial</h2>

                {viaticosOrdenados.length === 0 ? (
                    <div className="pf-mision-vacia">Sin viáticos registrados en este periodo.</div>
                ) : (
                    <div className="pf-historial-grid">
                        {viaticosOrdenados.map((v) => {
                            const miniatura = v.evidencias?.[0]?.secure_url;
                            return (
                                <div key={v.id} className="pf-viatico-card">
                                    <div className="pf-viatico-top">
                                        <span className="pf-viatico-tipo">
                                            <span className="pf-viatico-icono">{ICONO_TIPO_GASTO[v.tipo_gasto] || '📦'}</span>
                                            {LABEL_TIPO_GASTO[v.tipo_gasto] || v.tipo_gasto}
                                        </span>
                                        <span className={`pf-estado-badge pf-estado-badge--${v.estado}`}>
                                            {LABEL_ESTADO_VIATICO[v.estado] || v.estado}
                                        </span>
                                    </div>

                                    <p className="pf-viatico-lugar">{v.cliente} · {v.ciudad}</p>
                                    <p className="pf-viatico-fecha">{formatFechaLarga(v.fecha)}</p>

                                    {/* El backend no guarda un "motivo de rechazo" separado hoy;
                                       si algún día se agrega, aparece automáticamente aquí. */}
                                    {v.estado === 'rechazado' && v.motivo_rechazo && (
                                        <p className="pf-viatico-motivo">Motivo: {v.motivo_rechazo}</p>
                                    )}

                                    <div className="pf-viatico-footer">
                                        <span className="pf-viatico-valor">{formatCOP(v.valor)}</span>
                                        {miniatura ? (
                                            <img
                                                src={miniatura}
                                                alt="Evidencia"
                                                className="pf-viatico-thumb"
                                                onClick={() => setSeleccionado(v)}
                                            />
                                        ) : (
                                            <span className="pf-viatico-sin-evidencia">Sin evidencia</span>
                                        )}
                                    </div>

                                    <button className="pf-viatico-detalle-btn" onClick={() => setSeleccionado(v)}>
                                        Ver detalle
                                    </button>
                                </div>
                            );
                        })}
                    </div>
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
