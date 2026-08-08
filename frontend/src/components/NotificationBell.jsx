import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import './NotificationBell.css';

const ICONO_TIPO = {
    pendiente: (
        <svg viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 6.5V10l2.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

function textoNotificacion(v) {
    const nombre = v.nombre || `Usuario #${v.usuario_id}`;
    if (v.estado === 'aprobado') return `Se aprobó el viático de ${nombre}.`;
    if (v.estado === 'rechazado') return `Se rechazó el viático de ${nombre}.`;
    return `${nombre} solicitó un nuevo viático.`;
}

export default function NotificationBell() {
    const [abierto, setAbierto] = useState(false);
    const [viaticos, setViaticos] = useState([]);
    const [leidas, setLeidas] = useState(new Set());
    const contenedorRef = useRef(null);

    useEffect(() => {
        async function cargar() {
            try {
                const { data } = await api.get('/admin/viaticos');
                setViaticos(data);
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

    const notificaciones = [...viaticos].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    const pendientesCount = viaticos.filter((v) => v.estado === 'pendiente').length;

    function marcarLeida(id) {
        setLeidas((prev) => new Set(prev).add(id));
    }

    function marcarTodasLeidas() {
        setLeidas(new Set(viaticos.map((v) => v.id)));
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
                        {notificaciones.length === 0 ? (
                            <div className="notif-empty">No hay notificaciones.</div>
                        ) : (
                            notificaciones.map((v) => {
                                const noLeida = !leidas.has(v.id);
                                return (
                                    <button
                                        key={v.id}
                                        className={`notif-item ${noLeida ? 'notif-item--nueva' : ''}`}
                                        onClick={() => marcarLeida(v.id)}
                                    >
                                        <span className={`notif-item-icon notif-item-icon--${v.estado}`}>
                                            {ICONO_TIPO[v.estado] || ICONO_TIPO.pendiente}
                                        </span>
                                        <span className="notif-item-body">
                                            <span className="notif-item-text">{textoNotificacion(v)}</span>
                                            <span className="notif-item-time">
                                                Cliente: {v.cliente} • {v.ot} — {tiempoRelativo(v.created_at)}
                                            </span>
                                        </span>
                                        {noLeida && <span className="notif-item-dot" />}
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {notificaciones.length > 0 && (
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
