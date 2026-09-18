import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { esAdministradorSeccion, tieneAccesoSeccion } from '../utils/permisos';
import { formatApiError } from '../utils/formatError';
import { listarProcesosCalidad } from '../services/calidadProcesos';
import { listarTecnicos, obtenerResumen } from '../services/inventario';
import TarjetasInventario from '../components/inventario/TarjetasInventario';
import TabStock from '../components/inventario/TabStock';
import TabTecnicos from '../components/inventario/TabTecnicos';
import TabDespachos from '../components/inventario/TabDespachos';
import TabPrestamos from '../components/inventario/TabPrestamos';
import ModalDespacho from '../components/inventario/ModalDespacho';
import './Inventario.css';

const PESTANAS = [
    { id: 'stock', label: 'Stock (General)' },
    { id: 'tecnicos', label: 'Técnicos' },
    { id: 'despachos', label: 'Despachos (Salidas)' },
    { id: 'prestamos', label: 'Préstamos' },
];

// Segmento de la URL -> unión temporal. 'global' no filtra: es el consolidado.
const ALCANCES = {
    rtc: 'RTC',
    mantenimiento: 'MANTENIMIENTO',
    proyecto_zeus: 'PROYECTO_ZEUS',
    zeus: 'PROYECTO_ZEUS',
    tecnicos: 'TECNICOS',
    global: null,
};

/**
 * Módulo Inventario (proceso IN del Mapa SGC). La app es la única fuente de
 * verdad: stock, despachos y préstamos se gestionan aquí, sin Excel.
 *
 *   /inventario            -> tarjetas de cada inventario (RTC, Mantenimiento, Técnicos, Global)
 *   /inventario/:alcance   -> ese inventario, con sus pestañas correspondientes
 *
 * Permisos iguales a los del backend (require_seccion("IN", ...)):
 * superadmin o admin de IN editan; lector de IN solo consulta.
 */
export default function Inventario() {
    const navigate = useNavigate();
    const { alcance } = useParams();
    const { user } = useAuth();
    const puedeEditar = user?.rol === 'superadmin' || esAdministradorSeccion(user, 'IN');
    const puedeVer = puedeEditar || tieneAccesoSeccion(user, 'IN');

    const alcanceKey = (alcance || '').toLowerCase().replace(/-/g, '_');
    const enPanel = alcanceKey in ALCANCES;
    const esTecnicos = alcanceKey === 'tecnicos';
    const unionTemporal = enPanel && !esTecnicos ? ALCANCES[alcanceKey] : (esTecnicos ? 'MANTENIMIENTO' : null);
    const esGlobal = alcanceKey === 'global';

    const [pestana, setPestana] = useState(esTecnicos ? 'tecnicos' : 'stock');
    const [resumen, setResumen] = useState(null);
    const [cargandoResumen, setCargandoResumen] = useState(true);
    const [tecnicos, setTecnicos] = useState([]);
    const [feedback, setFeedback] = useState('');
    const [error, setError] = useState('');
    const [rutaFichaIN, setRutaFichaIN] = useState('/calidad-de-procesos');

    // null | { despacho } | { itemInicial } | {}
    const [modalDespacho, setModalDespacho] = useState(null);
    const [versionDespachos, setVersionDespachos] = useState(0);
    const [versionStock, setVersionStock] = useState(0);

    const cargarResumen = useCallback(async () => {
        if (!puedeVer) return;
        try {
            setResumen(await obtenerResumen());
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar el resumen de inventario.'));
        } finally {
            setCargandoResumen(false);
        }
    }, [puedeVer]);

    const avisar = useCallback(
        (mensaje) => {
            setFeedback(mensaje);
            cargarResumen();
            setTimeout(() => setFeedback(''), 4500);
        },
        [cargarResumen]
    );

    useEffect(() => {
        cargarResumen();
    }, [cargarResumen]);

    useEffect(() => {
        if (!puedeVer) return;
        listarTecnicos()
            .then(setTecnicos)
            .catch((err) => setError(formatApiError(err, 'No se pudo cargar la lista de técnicos.')));
    }, [puedeVer]);

    useEffect(() => {
        // Si falla, Volver lleva al mapa completo.
        listarProcesosCalidad()
            .then((procesos) => {
                const proceso = procesos.find((p) => p.codigo === 'IN');
                if (proceso) setRutaFichaIN(`/calidad-de-procesos/proceso/${proceso.id}`);
            })
            .catch(() => {});
    }, []);

    // Alcance inexistente en la URL: se vuelve a las tarjetas.
    useEffect(() => {
        if (alcance && !enPanel) navigate('/inventario', { replace: true });
    }, [alcance, enPanel, navigate]);

    function despachoGuardado(despacho, editado) {
        setModalDespacho(null);
        avisar(editado ? `Despacho #${despacho.id} actualizado.` : `Despacho #${despacho.id} registrado.`);
        setVersionDespachos((v) => v + 1);
        setVersionStock((v) => v + 1);
        if (!editado) setPestana('despachos');
    }

    if (!puedeVer) {
        return (
            <div className="sgc-inv-panel">
                <Encabezado titulo="Inventario" subtitulo="Inventario (IN)" onVolver={() => navigate(rutaFichaIN)} />
                <p className="sgc-inv-vacio">
                    No tienes permisos sobre el proceso Inventario (IN). Solicítalos a la Administradora Master del
                    Mapa de Procesos SGC.
                </p>
            </div>
        );
    }

    // ── Pantalla de entrada: una tarjeta por inventario ──────────────────────
    if (!enPanel) {
        return (
            <div className="sgc-inv-panel">
                <Encabezado
                    titulo="Inventario"
                    subtitulo={
                        'Inventario (IN) · Elige el inventario que quieres gestionar' +
                        (puedeEditar ? '' : ' · solo lectura')
                    }
                    onVolver={() => navigate(rutaFichaIN)}
                    textoVolver="← Mapa SGC"
                />
                {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}
                <TarjetasInventario
                    resumen={resumen}
                    cargando={cargandoResumen}
                    onAbrir={(t) => navigate(`/inventario/${t.clave.toLowerCase()}`)}
                />
            </div>
        );
    }

    // ── Panel de un inventario ───────────────────────────────────────────────
    const cifras = esTecnicos
        ? {
            nombre: 'Técnicos (Mantenimiento)',
            total_items: resumen?.global?.total_items_tecnicos || 77,
            total_unidades: resumen?.global?.total_items_tecnicos || 77,
            total_items_tecnicos: resumen?.global?.total_items_tecnicos || 77,
            total_despachos: 0,
            pendientes: 0,
            total_prestamos: 0,
        }
        : (esGlobal
            ? resumen?.global
            : resumen?.uniones?.find((u) => u.union_temporal === unionTemporal));

    return (
        <div className="sgc-inv-panel">
            <Encabezado
                titulo={esTecnicos ? 'Técnicos (Mantenimiento)' : (cifras?.nombre || 'Inventario')}
                subtitulo={
                    esTecnicos
                        ? 'Inventario individual bajo custodia de cada técnico según hojas del Excel de Mantenimiento' + (puedeEditar ? '' : ' · solo lectura')
                        : ('Inventario (IN) · Stock, despachos a técnicos y préstamos' + (puedeEditar ? '' : ' · solo lectura'))
                }
                onVolver={() => navigate('/inventario')}
                textoVolver="← Inventarios"
            />

            <section className="sgc-inv-kpis">
                <Kpi label="Ítems stock" valor={cifras?.total_items} />
                <Kpi label="Unidades en stock" valor={cifras?.total_unidades} />
                <Kpi label="En técnicos" valor={cifras?.total_items_tecnicos} />
                <Kpi label="Despachos" valor={cifras?.total_despachos} />
                <Kpi label="Por revisar" valor={cifras?.pendientes} alerta={cifras?.pendientes > 0} />
                <Kpi label="Préstamos" valor={cifras?.total_prestamos} />
            </section>

            <nav className="sgc-inv-tabs">
                {PESTANAS.map((p) => (
                    <button
                        key={p.id}
                        type="button"
                        className={`sgc-inv-tab ${pestana === p.id ? 'sgc-inv-tab--activa' : ''}`}
                        onClick={() => setPestana(p.id)}
                    >
                        {p.label}
                    </button>
                ))}
            </nav>

            {feedback && <div className="sgc-inv-alerta sgc-inv-alerta--ok">{feedback}</div>}
            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            {pestana === 'stock' && (
                <TabStock
                    unionTemporal={unionTemporal}
                    mostrarUnion={esGlobal}
                    puedeEditar={puedeEditar}
                    version={versionStock}
                    onDespachar={(item) => setModalDespacho({ itemInicial: item })}
                    avisar={avisar}
                />
            )}
            {pestana === 'tecnicos' && (
                <TabTecnicos
                    unionTemporal={unionTemporal}
                    puedeEditar={puedeEditar}
                    version={versionStock}
                    avisar={avisar}
                />
            )}
            {pestana === 'despachos' && (
                <TabDespachos
                    unionTemporal={unionTemporal}
                    mostrarUnion={esGlobal}
                    tecnicos={tecnicos}
                    puedeEditar={puedeEditar}
                    version={versionDespachos}
                    onNuevo={() => setModalDespacho({})}
                    onEditar={(despacho) => setModalDespacho({ despacho })}
                    onIrATecnicos={() => setPestana('tecnicos')}
                    avisar={avisar}
                />
            )}
            {pestana === 'prestamos' && (
                <TabPrestamos
                    unionTemporal={unionTemporal}
                    mostrarUnion={esGlobal}
                    puedeEditar={puedeEditar}
                    avisar={avisar}
                />
            )}

            {modalDespacho && (
                <ModalDespacho
                    despacho={modalDespacho.despacho}
                    itemInicial={modalDespacho.itemInicial}
                    unionTemporal={unionTemporal}
                    tecnicos={tecnicos}
                    onCerrar={() => setModalDespacho(null)}
                    onGuardado={despachoGuardado}
                />
            )}
        </div>
    );
}

function Encabezado({ titulo, subtitulo, onVolver, textoVolver = '← Volver' }) {
    return (
        <header className="sgc-inv-panel-header">
            <button type="button" className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm" onClick={onVolver}>
                {textoVolver}
            </button>
            <div>
                <h1 className="sgc-inv-title">{titulo}</h1>
                <p className="sgc-inv-subtitle">{subtitulo}</p>
            </div>
        </header>
    );
}

function Kpi({ label, valor, alerta = false }) {
    return (
        <article className={`sgc-inv-kpi ${alerta ? 'sgc-inv-kpi--alerta' : ''}`}>
            <span className="sgc-inv-kpi-label">{label}</span>
            <strong className="sgc-inv-kpi-valor">
                {valor === undefined || valor === null ? '—' : valor.toLocaleString('es-CO')}
            </strong>
        </article>
    );
}
