import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { formatCOP } from '../utils/personal';
import './NotificationBell.css';

const ICONO_TIPO = {
    pendiente: (
        <svg viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 6.5V10l2.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    editado: (
        <svg viewBox="0 0 20 20" fill="none">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    borrado: (
        <svg viewBox="0 0 20 20" fill="none">
            <path d="M4 6h12M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2m2 0v10a2 2 0 01-2 2H7a2 2 0 01-2-2V6h10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    aprobado: (
        <svg viewBox="0 0 20 20" fill="none">
            <path d="M4.5 10.5l3.2 3.2L15.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    rechazado: (
        <svg viewBox="0 0 20 20" fill="none">
            <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    ),
    cuenta_cobro: (
        <svg viewBox="0 0 20 20" fill="none">
            <path d="M4 4h12v12H4V4zm3 3h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
};

function tiempoRelativo(fechaISO) {
    if (!fechaISO) return '';
    const diffMs = Date.now() - new Date(fechaISO).getTime();
    const minutos = Math.floor(diffMs / 60000);

    if (minutos < 1) return 'Hace instantes';
    if (minutos < 60) return `Hace ${minutos} minuto${minutos === 1 ? '' : 's'}`;

    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `Hace ${horas} hora${horas === 1 ? '' : 's'}`;

    const dias = Math.floor(horas / 24);
    if (dias === 1) return 'Ayer';
    return `Hace ${dias} días`;
}

import { useAuth } from '../context/AuthContext';

export default function NotificationBell() {
    const { user } = useAuth();
    const [abierto, setAbierto] = useState(false);
    const [viaticos, setViaticos] = useState([]);
    const [notificacionesBorrado, setNotificacionesBorrado] = useState([]);
    const [asignacionesConCuenta, setAsignacionesConCuenta] = useState([]);
    const [leidas, setLeidas] = useState(new Set());
    const contenedorRef = useRef(null);

    const esAdmin = user?.rol === 'admin' || user?.rol === 'superadmin';

    useEffect(() => {
        async function cargar() {
            try {
                if (esAdmin) {
                    const [resViaticos, resNotif, resAsig] = await Promise.all([
                        api.get('/admin/viaticos').catch(() => ({ data: [] })),
                        api.get('/admin/notificaciones').catch(() => ({ data: [] })),
                        api.get('/admin/asignaciones').catch(() => ({ data: [] })),
                    ]);
                    setViaticos(resViaticos.data || []);
                    setNotificacionesBorrado(resNotif.data || []);
                    // Solo las asignaciones que tienen cuenta de cobro subida
                    setAsignacionesConCuenta(
                        (resAsig.data || []).filter((a) => a.cuenta_cobro?.secure_url)
                    );
                } else {
                    const resViaticos = await api.get('/viaticos').catch(() => ({ data: [] }));
                    setViaticos(resViaticos.data || []);
                }
            } catch (err) {
                console.error('Error cargando notificaciones', err);
            }
        }
        cargar();
    }, [esAdmin]);

    useEffect(() => {
        function manejarClicFuera(e) {
            if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
                setAbierto(false);
            }
        }
        document.addEventListener('mousedown', manejarClicFuera);
        return () => document.removeEventListener('mousedown', manejarClicFuera);
    }, []);

    const timeline = [];

    if (esAdmin) {
        viaticos.forEach((v) => {
            const nombre = v.nombre || `Usuario #${v.usuario_id}`;
            if (v.estado === 'pendiente') {
                const tCreated = new Date(v.created_at).getTime();
                const tUpdated = v.updated_at ? new Date(v.updated_at).getTime() : tCreated;
                const esEditado = tUpdated - tCreated > 5000;

                if (esEditado) {
                    timeline.push({
                        id: `viatico-edit-${v.id}`,
                        icono: 'editado',
                        texto: `${nombre} editó su viático.`,
                        subtexto: `Cliente: ${v.cliente} • ${v.ot}`,
                        fecha: v.updated_at,
                    });
                } else {
                    timeline.push({
                        id: `viatico-${v.id}`,
                        icono: 'pendiente',
                        texto: `${nombre} solicitó un nuevo viático.`,
                        subtexto: `Cliente: ${v.cliente} • ${v.ot}`,
                        fecha: v.created_at,
                    });
                }
            } else if (v.estado === 'aprobado') {
                timeline.push({
                    id: `viatico-${v.id}`,
                    icono: 'aprobado',
                    texto: `Se aprobó el viático de ${nombre}.`,
                    subtexto: `Cliente: ${v.cliente} • ${v.ot}`,
                    fecha: v.updated_at || v.created_at,
                });
            } else if (v.estado === 'rechazado') {
                timeline.push({
                    id: `viatico-${v.id}`,
                    icono: 'rechazado',
                    texto: `Se rechazó el viático de ${nombre}.`,
                    subtexto: `Cliente: ${v.cliente} • ${v.ot}${v.comentario_admin ? ` • Motivo: ${v.comentario_admin}` : ''}`,
                    fecha: v.updated_at || v.created_at,
                });
            }
        });

        notificacionesBorrado.forEach((n) => {
            timeline.push({
                id: `notif-del-${n.id}`,
                icono: 'borrado',
                texto: `${n.tecnico_nombre} eliminó un viático de ${formatCOP(Number(n.valor))} en ${n.ciudad}.`,
                subtexto: 'Viático eliminado',
                fecha: n.created_at,
            });
        });

        asignacionesConCuenta.forEach((a) => {
            const tecnicoNombre = a.tecnico_nombre || `Técnico #${a.tecnico_id}`;
            timeline.push({
                id: `cuenta-cobro-${a.id}`,
                icono: 'cuenta_cobro',
                texto: `${tecnicoNombre} subió su cuenta de cobro.`,
                subtexto: `Misión #${a.id} — ${a.cliente} · ${a.ciudad}`,
                fecha: a.cuenta_cobro.fecha_subida || a.cuenta_cobro.created_at,
                url: a.cuenta_cobro.secure_url,
            });
        });
    } else {
        // Notificaciones para el Técnico
        viaticos.forEach((v) => {
            if (v.estado === 'aprobado') {
                timeline.push({
                    id: `tec-aprobado-${v.id}`,
                    icono: 'aprobado',
                    texto: `¡Tu viático de ${v.cliente} por ${formatCOP(Number(v.valor))} fue APROBADO!`,
                    subtexto: `OT: ${v.ot}${v.comentario_admin ? ` • Comentario: ${v.comentario_admin}` : ''}`,
                    fecha: v.updated_at || v.created_at,
                });
            } else if (v.estado === 'rechazado') {
                timeline.push({
                    id: `tec-rechazado-${v.id}`,
                    icono: 'rechazado',
                    texto: `Tu viático de ${v.cliente} por ${formatCOP(Number(v.valor))} fue RECHAZADO.`,
                    subtexto: `OT: ${v.ot}${v.comentario_admin ? ` • Motivo: ${v.comentario_admin}` : ''}`,
                    comentario: v.comentario_admin,
                    fecha: v.updated_at || v.created_at,
                });
            } else if (v.estado === 'pendiente') {
                timeline.push({
                    id: `tec-pendiente-${v.id}`,
                    icono: 'pendiente',
                    texto: `Tu viático de ${v.cliente} por ${formatCOP(Number(v.valor))} está en revisión.`,
                    subtexto: `OT: ${v.ot}`,
                    fecha: v.created_at,
                });
            }
        });
    }

    timeline.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // Para el ADMIN: el badge muestra siempre los ítems que requieren atención
    // (viáticos pendientes + notificaciones de borrado). El acto de "leer" una
    // notificación NO reduce el contador — solo quita el resaltado visual.
    // Para el TÉCNICO: el badge muestra aprobados + rechazados (respuestas sin ver).
    const noLeidasCount = esAdmin
        ? viaticos.filter((v) => v.estado === 'pendiente').length +
          notificacionesBorrado.length +
          asignacionesConCuenta.filter((a) => !leidas.has(`cuenta-cobro-${a.id}`)).length
        : timeline.filter(
              (item) =>
                  !leidas.has(item.id) &&
                  (item.icono === 'aprobado' || item.icono === 'rechazado')
          ).length;

    function marcarLeida(id) {
        setLeidas((prev) => new Set(prev).add(id));
    }

    function marcarTodasLeidas() {
        setLeidas(new Set(timeline.map((item) => item.id)));
    }

    function toggleAbierto() {
        setAbierto((prev) => {
            const nuevoEstado = !prev;
            // Al abrir el panel, marcar todas las notificaciones del técnico como leídas
            if (nuevoEstado && !esAdmin) {
                setLeidas(new Set(timeline.map((item) => item.id)));
            }
            return nuevoEstado;
        });
    }

    return (
        <div className="notif-wrap" ref={contenedorRef}>
            <button
                className="notif-bell-btn"
                onClick={toggleAbierto}
                aria-label="Notificaciones"
                aria-expanded={abierto}
            >
                <svg className="notif-bell-icon" viewBox="0 0 24 24" fill="none">
                    <path
                        d="M12 3.5c-3.04 0-5.5 2.46-5.5 5.5v3.1c0 .55-.2 1.08-.57 1.49L4.8 15.03c-.83.92-.18 2.4 1.06 2.4h12.28c1.24 0 1.89-1.48 1.06-2.4l-1.13-1.44a2.24 2.24 0 0 1-.57-1.49V9c0-3.04-2.46-5.5-5.5-5.5Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M9.5 19.5a2.5 2.5 0 0 0 5 0"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                    />
                </svg>
                {noLeidasCount > 0 && (
                    <span className="notif-badge">{noLeidasCount > 9 ? '9+' : noLeidasCount}</span>
                )}
            </button>

            {abierto && (
                <div className="notif-dropdown">
                    <div className="notif-dropdown-header">
                        <span className="notif-dropdown-title">Notificaciones</span>
                        <span className="notif-dropdown-count">
                            {noLeidasCount > 0 ? `${noLeidasCount} no leída(s)` : 'Al día'}
                        </span>
                    </div>

                    <div className="notif-list">
                        {timeline.length === 0 ? (
                            <div className="notif-empty">No hay notificaciones.</div>
                        ) : (
                            timeline.map((item) => {
                                const noLeida = !leidas.has(item.id);
                                return item.url ? (
                                    <a
                                        key={item.id}
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`notif-item ${noLeida ? 'notif-item--nueva' : ''}`}
                                        style={{ textDecoration: 'none' }}
                                        onClick={() => marcarLeida(item.id)}
                                    >
                                        <span className={`notif-item-icon notif-item-icon--${item.icono}`}>
                                            {ICONO_TIPO[item.icono] || ICONO_TIPO.pendiente}
                                        </span>
                                        <span className="notif-item-body">
                                            <span className="notif-item-text">{item.texto}</span>
                                            <span className="notif-item-time">
                                                {item.subtexto} — {tiempoRelativo(item.fecha)}
                                            </span>
                                        </span>
                                        {noLeida && <span className="notif-item-dot" />}
                                    </a>
                                ) : (
                                    <button
                                        key={item.id}
                                        className={`notif-item ${noLeida ? 'notif-item--nueva' : ''}`}
                                        onClick={() => marcarLeida(item.id)}
                                    >
                                        <span className={`notif-item-icon notif-item-icon--${item.icono}`}>
                                            {ICONO_TIPO[item.icono] || ICONO_TIPO.pendiente}
                                        </span>
                                        <span className="notif-item-body">
                                            <span className="notif-item-text">{item.texto}</span>
                                            <span className="notif-item-time">
                                                {item.subtexto} — {tiempoRelativo(item.fecha)}
                                            </span>
                                        </span>
                                        {noLeida && <span className="notif-item-dot" />}
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {timeline.length > 0 && (
                        <div className="notif-dropdown-footer">
                            <button className="notif-mark-all" onClick={marcarTodasLeidas}>
                                Marcar todas como leídas
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
