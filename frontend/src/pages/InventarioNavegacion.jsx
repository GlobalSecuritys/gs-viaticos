import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Inventario from './Inventario';
import { useAuth } from '../context/AuthContext';
import { formatApiError } from '../utils/formatError';
import { esPilarAdmin } from '../utils/permisos';
import { listarProcesosCalidad } from '../services/calidadProcesos';
import { listarEmpresas } from '../services/inventario';
import './InventarioNavegacion.css';

/**
 * Navegación jerárquica del módulo Inventario.
 *
 *   /inventario                              -> las 3 empresas
 *   /inventario/:empresaId                   -> tarjetas de Global, o el
 *                                               inventario directo si es una UT
 *   /inventario/:empresaId/:clienteId        -> inventario de esa tarjeta
 *
 * Cada tarjeta (Zeus, Oberon, Securitas, Electronic Servis Securitas) maneja su
 * propio inventario; las dos uniones temporales lo manejan directo en la caja.
 * Esto no toca el Mapa de Procesos SGC: es la navegación interna del módulo.
 */
export default function InventarioNavegacion() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { empresaId, clienteId } = useParams();

    const [empresas, setEmpresas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    // Ruta de la ficha del proceso IN en el Mapa SGC, que es de donde se entra
    // al módulo. Se resuelve por código porque la ficha se direcciona por id.
    const [rutaFichaIN, setRutaFichaIN] = useState('/calidad-de-procesos');

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            setEmpresas(await listarEmpresas());
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar la estructura de inventario.'));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        cargar();
    }, [cargar]);

    useEffect(() => {
        // Si falla, el botón Volver se queda con el mapa completo como destino.
        listarProcesosCalidad()
            .then((procesos) => {
                const proceso = procesos.find((p) => p.codigo === 'IN');
                if (proceso) setRutaFichaIN(`/calidad-de-procesos/proceso/${proceso.id}`);
            })
            .catch(() => {});
    }, []);

    const empresa = useMemo(
        () => empresas.find((e) => String(e.id) === String(empresaId)) || null,
        [empresas, empresaId]
    );
    const cliente = useMemo(
        () => empresa?.clientes?.find((c) => String(c.id) === String(clienteId)) || null,
        [empresa, clienteId]
    );

    if (cargando) {
        return <p className="sgc-invnav-estado">Cargando estructura de inventario…</p>;
    }
    if (error) {
        return <p className="sgc-invnav-estado sgc-invnav-estado--err">{error}</p>;
    }

    // ── Nivel 3: inventario ya acotado a una entidad ──────────────────────────
    if (empresa) {
        const esGlobal = empresa.tipo === 'global';
        const enTarjeta = Boolean(clienteId);
        // "general" es el inventario de Global que no cuelga de ninguna tarjeta:
        // las planillas heredadas (MANTENIMIENTO, RTC) viven ahí.
        const enGeneralDeGlobal = esGlobal && clienteId === 'general';

        if (!esGlobal || enGeneralDeGlobal || (enTarjeta && cliente)) {
            return (
                <Inventario
                    scope={{
                        empresaId: empresa.id,
                        clienteId: cliente ? cliente.id : null,
                        empresaNombre: empresa.nombre,
                        clienteNombre: cliente ? cliente.nombre : null,
                        empresaTipo: empresa.tipo,
                    }}
                    empresas={empresas}
                />
            );
        }

        if (enTarjeta && !cliente) {
            return (
                <p className="sgc-invnav-estado sgc-invnav-estado--err">
                    La tarjeta indicada no existe en {empresa.nombre}.
                </p>
            );
        }

        // ── Nivel 2: tarjetas de Global ───────────────────────────────────────
        return (
            <Pantalla
                titulo={empresa.nombre}
                subtitulo="Cada tarjeta maneja su propio inventario: ítems, stock y kardex independientes."
                onVolver={() => navigate('/inventario')}
            >
                {empresa.clientes.filter((c) => c.accesible).map((c) => (
                    <TarjetaEntidad
                        key={c.id}
                        nombre={c.nombre}
                        totalItems={c.total_items}
                        totalUnidades={c.total_unidades}
                        pie="Inventario propio"
                        onClick={() => navigate(`/inventario/${empresa.id}/${c.id}`)}
                    />
                ))}
                {empresa.total_items_directo > 0 && empresa.nivel !== 'ninguno' && (
                    <TarjetaEntidad
                        nombre="Inventario general"
                        totalItems={empresa.total_items_directo}
                        totalUnidades={empresa.total_unidades_directo}
                        pie="Planillas de la caja que no pertenecen a una tarjeta"
                        variante="general"
                        onClick={() => navigate(`/inventario/${empresa.id}/general`)}
                    />
                )}
            </Pantalla>
        );
    }

    // ── Nivel 1: las empresas ─────────────────────────────────────────────────
    return (
        <Pantalla
            titulo="Inventario"
            subtitulo="Inventario (IN) · Selecciona la empresa cuyo inventario quieres gestionar."
            onVolver={() => navigate(rutaFichaIN)}
            accion={
                esPilarAdmin(user) && (
                    <button
                        type="button"
                        className="sgc-invnav-accion"
                        onClick={() => navigate('/inventario/accesos')}
                    >
                        Gestionar accesos
                    </button>
                )
            }
        >
            {empresas.every((e) => !e.accesible) && (
                <p className="sgc-invnav-estado">
                    No tienes ninguna entidad de inventario asignada. Solicítala a la
                    Administradora Master.
                </p>
            )}
            {empresas.filter((e) => e.accesible).map((e) => (
                <TarjetaEntidad
                    key={e.id}
                    nombre={e.nombre}
                    totalItems={e.total_items}
                    totalUnidades={e.total_unidades}
                    pie={
                        e.tipo === 'global'
                            ? `${e.clientes.length} tarjetas con inventario independiente`
                            : 'Inventario directo de la caja'
                    }
                    variante={e.tipo === 'global' ? 'global' : 'union'}
                    onClick={() => navigate(`/inventario/${e.id}`)}
                />
            ))}
        </Pantalla>
    );
}

function Pantalla({ titulo, subtitulo, onVolver, accion = null, children }) {
    return (
        <div className="sgc-invnav">
            <header className="sgc-invnav-header">
                <button type="button" className="sgc-invnav-volver" onClick={onVolver}>
                    ← Volver
                </button>
                <div className="sgc-invnav-head-texto">
                    <h1 className="sgc-invnav-title">{titulo}</h1>
                    <p className="sgc-invnav-subtitle">{subtitulo}</p>
                </div>
                {accion}
            </header>
            <section className="sgc-invnav-grid">{children}</section>
        </div>
    );
}

function TarjetaEntidad({ nombre, totalItems, totalUnidades, pie, variante = 'union', onClick }) {
    return (
        <button
            type="button"
            className={`sgc-invnav-card sgc-invnav-card--${variante}`}
            onClick={onClick}
        >
            <span className="sgc-invnav-card-nombre">{nombre}</span>
            <span className="sgc-invnav-card-cifras">
                <strong>{totalItems}</strong> ítems · <strong>{totalUnidades}</strong> und.
            </span>
            <span className="sgc-invnav-card-pie">{pie}</span>
        </button>
    );
}
