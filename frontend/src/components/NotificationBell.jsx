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

export default function NotificationBell() {
    const [abierto, setAbierto] = useState(false);
    const [viaticos, setViaticos] = useState([]);
    const [notificacionesBorrado, setNotificacionesBorrado] = useState([]);
    const [leidas, setLeidas] = useState(new Set());
    const contenedorRef = useRef(null);

    useEffect(() => {
        async function cargar() {
            try {
                const [resViaticos, resNotif] = await Promise.all([
                    api.get('/admin/viaticos').catch(() => ({ data: [] })),
                    api.get('/admin/notificaciones').catch(() => ({ data: [] })),
                ]);
                setViaticos(resViaticos.data || []);
                setNotificacionesBorrado(resNotif.data || []);
            } catch (err) {
                console.error('Error cargando notificaciones', err);
            }
        }
        cargar();
    }, []);

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
                subtexto: `Cliente: ${v.cliente} • ${v.ot}`,
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

    timeline.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const pendientesCount = viaticos.filter((v) => v.estado === 'pendiente').length;

    function marcarLeida(id) {
        setLeidas((prev) => new Set(prev).add(id));
    }

    function marcarTodasLeidas() {
        setLeidas(new Set(timeline.map((item) => item.id)));
    }

    return (
        <div className="notif-wrap" ref={contenedorRef}>
            <button
                className="notif-bell-btn"
                onClick={() => setAbierto((v) => !v)}
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
                {pendientesCount > 0 && (
                    <span className="notif-badge">{pendientesCount > 9 ? '9+' : pendientesCount}</span>
                )}
            </button>

            {abierto && (
                <div className="notif-dropdown">
                    <div className="notif-dropdown-header">
                        <span className="notif-dropdown-title">Notificaciones</span>
                        <span className="notif-dropdown-count">
                            {pendientesCount > 0 ? `${pendientesCount} pendientes` : 'Sin pendientes'}
                        </span>
                    </div>

                    <div className="notif-list">
                        {timeline.length === 0 ? (
                            <div className="notif-empty">No hay notificaciones.</div>
                        ) : (
                            timeline.map((item) => {
                                const noLeida = !leidas.has(item.id);
                                return (
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
