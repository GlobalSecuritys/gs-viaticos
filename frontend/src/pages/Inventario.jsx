import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { esAdministradorSeccion, tieneAccesoSeccion } from '../utils/permisos';
import { formatApiError } from '../utils/formatError';
import { listarProcesosCalidad } from '../services/calidadProcesos';
import { UNIONES_TEMPORALES, listarTecnicos } from '../services/inventario';
import TabStock from '../components/inventario/TabStock';
import TabDespachos from '../components/inventario/TabDespachos';
import TabPrestamos from '../components/inventario/TabPrestamos';
import ModalDespacho from '../components/inventario/ModalDespacho';
import './Inventario.css';

const PESTANAS = [
    { id: 'stock', label: 'Stock' },
    { id: 'despachos', label: 'Despachos' },
    { id: 'prestamos', label: 'Préstamos' },
];

/**
 * Módulo Inventario (proceso IN del Mapa SGC). La app es la única fuente de
 * verdad: stock, despachos y préstamos se gestionan aquí, sin Excel.
 *
 * Permisos iguales a los del backend (require_seccion("IN", ...)):
 * superadmin o admin de IN editan; lector de IN solo consulta.
 */
export default function Inventario() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const puedeEditar = user?.rol === 'superadmin' || esAdministradorSeccion(user, 'IN');
    const puedeVer = puedeEditar || tieneAccesoSeccion(user, 'IN');

    const [pestana, setPestana] = useState('stock');
    const [unionTemporal, setUnionTemporal] = useState('');
    const [tecnicos, setTecnicos] = useState([]);
    const [feedback, setFeedback] = useState('');
    const [error, setError] = useState('');
    const [rutaFichaIN, setRutaFichaIN] = useState('/calidad-de-procesos');

    // null | { despacho } | { itemInicial } | {}
    const [modalDespacho, setModalDespacho] = useState(null);
    const [versionDespachos, setVersionDespachos] = useState(0);
    const [versionStock, setVersionStock] = useState(0);

    const avisar = useCallback((mensaje) => {
        setFeedback(mensaje);
        setTimeout(() => setFeedback(''), 4500);
    }, []);

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

    function despachoGuardado(despacho, editado) {
        setModalDespacho(null);
        avisar(editado ? `Despacho #${despacho.id} actualizado.` : `Despacho #${despacho.id} registrado.`);
        setVersionDespachos((v) => v + 1);
        setVersionStock((v) => v + 1);
        if (!editado) setPestana('despachos');
    }

    return (
        <div className="sgc-inv-panel">
            <header className="sgc-inv-panel-header">
                <div className="sgc-inv-panel-head-left">
                    <button
                        type="button"
                        className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm"
                        onClick={() => navigate(rutaFichaIN)}
                    >
                        ← Volver
                    </button>
                    <div>
                        <h1 className="sgc-inv-title">Inventario</h1>
                        <p className="sgc-inv-subtitle">
                            Inventario (IN) · Stock, despachos a técnicos y préstamos
                            {!puedeEditar && puedeVer && ' · solo lectura'}
                        </p>
                    </div>
                </div>
            </header>

            {!puedeVer ? (
                <p className="sgc-inv-vacio">
                    No tienes permisos sobre el proceso Inventario (IN). Solicítalos a la Administradora Master del
                    Mapa de Procesos SGC.
                </p>
            ) : (
                <>
                    <div className="sgc-inv-barra">
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
                        <label className="sgc-inv-ut">
                            Unión temporal
                            <select
                                className="sgc-inv-input sgc-inv-input--select"
                                value={unionTemporal}
                                onChange={(e) => setUnionTemporal(e.target.value)}
                            >
                                <option value="">Todas</option>
                                {UNIONES_TEMPORALES.map((u) => (
                                    <option key={u.valor} value={u.valor}>{u.etiqueta}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {feedback && <div className="sgc-inv-alerta sgc-inv-alerta--ok">{feedback}</div>}
                    {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

                    {pestana === 'stock' && (
                        <TabStock
                            unionTemporal={unionTemporal}
                            puedeEditar={puedeEditar}
                            version={versionStock}
                            onDespachar={(item) => setModalDespacho({ itemInicial: item })}
                            avisar={avisar}
                        />
                    )}
                    {pestana === 'despachos' && (
                        <TabDespachos
                            unionTemporal={unionTemporal}
                            tecnicos={tecnicos}
                            puedeEditar={puedeEditar}
                            version={versionDespachos}
                            onNuevo={() => setModalDespacho({})}
                            onEditar={(despacho) => setModalDespacho({ despacho })}
                            avisar={avisar}
                        />
                    )}
                    {pestana === 'prestamos' && (
                        <TabPrestamos unionTemporal={unionTemporal} puedeEditar={puedeEditar} avisar={avisar} />
                    )}
                </>
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
