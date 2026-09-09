import { useCallback, useEffect, useState } from 'react';
import { formatApiError } from '../../utils/formatError';
import {
    aprobarTraspaso,
    etiquetaEntidad,
    listarTraspasos,
    rechazarTraspaso,
} from '../../services/inventario';
import './PanelTraspasos.css';

/**
 * Traspasos de una entidad: los que envía y los que recibe.
 *
 * Aprobar/rechazar solo aplica a los traspasos pendientes en los que esta
 * entidad es el DESTINO: el origen ya descontó su stock al solicitarlos, así
 * que la decisión es de quien recibe.
 */
export default function PanelTraspasos({ scope, puedeGestionar = false, onCambio }) {
    const [traspasos, setTraspasos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [resolviendo, setResolviendo] = useState(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            setTraspasos(await listarTraspasos(scope));
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudieron cargar los traspasos.'));
        } finally {
            setCargando(false);
        }
    }, [scope]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    async function resolver(traspaso, aceptar) {
        setResolviendo(traspaso.id);
        setError('');
        try {
            if (aceptar) {
                await aprobarTraspaso(traspaso.id);
            } else {
                await rechazarTraspaso(traspaso.id);
            }
            await cargar();
            onCambio?.();
        } catch (err) {
            setError(formatApiError(err, 'No se pudo resolver el traspaso.'));
        } finally {
            setResolviendo(null);
        }
    }

    function esDestino(t) {
        return (
            t.empresa_destino_id === scope.empresaId &&
            (t.cliente_destino_id || null) === (scope.clienteId || null)
        );
    }

    if (cargando) {
        return <p className="sgc-trasp-vacio">Cargando traspasos…</p>;
    }

    return (
        <div className="sgc-trasp">
            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            {traspasos.length === 0 ? (
                <p className="sgc-trasp-vacio">
                    Esta entidad no tiene traspasos registrados con ninguna otra.
                </p>
            ) : (
                <ul className="sgc-trasp-lista">
                    {traspasos.map((t) => {
                        const entrante = esDestino(t);
                        const contraparte = entrante
                            ? etiquetaEntidad(t.empresa_origen_nombre, t.cliente_origen_nombre)
                            : etiquetaEntidad(t.empresa_destino_nombre, t.cliente_destino_nombre);
                        return (
                            <li key={t.id} className="sgc-trasp-fila">
                                <div className="sgc-trasp-main">
                                    <span className="sgc-trasp-desc">
                                        <span className="sgc-trasp-flecha" aria-hidden="true">
                                            {entrante ? '⬅' : '➡'}
                                        </span>
                                        {t.item_descripcion || `Ítem #${t.item_origen_id}`}
                                    </span>
                                    <span className="sgc-trasp-meta">
                                        {t.cantidad} und. · {entrante ? 'desde' : 'hacia'}{' '}
                                        <strong>{contraparte}</strong>
                                        {t.item_codigo && ` · ${t.item_codigo}`}
                                    </span>
                                    {t.notas && <span className="sgc-trasp-notas">{t.notas}</span>}
                                </div>

                                <span className={`sgc-trasp-estado sgc-trasp-estado--${t.estado}`}>
                                    {t.estado}
                                </span>

                                {t.estado === 'pendiente' && entrante && puedeGestionar && (
                                    <div className="sgc-trasp-acciones">
                                        <button
                                            type="button"
                                            className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--primary"
                                            onClick={() => resolver(t, true)}
                                            disabled={resolviendo === t.id}
                                        >
                                            Recibir
                                        </button>
                                        <button
                                            type="button"
                                            className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--peligro"
                                            onClick={() => resolver(t, false)}
                                            disabled={resolviendo === t.id}
                                        >
                                            Rechazar
                                        </button>
                                    </div>
                                )}
                                {t.estado === 'pendiente' && !entrante && (
                                    <span className="sgc-trasp-espera">
                                        A la espera de que {contraparte} confirme
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
