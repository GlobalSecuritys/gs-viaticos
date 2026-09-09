import { etiquetaTipoMovimiento } from '../../services/inventario';
import './TablaKardex.css';

function formatFecha(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Kardex de un ítem: historial inmutable de entradas y salidas, con el stock
 * resultante que quedó registrado en cada movimiento.
 */
export default function TablaKardex({ movimientos, cargando }) {
    if (cargando) {
        return <p className="sgc-inv-kardex-vacio">Cargando movimientos…</p>;
    }

    if (!movimientos?.length) {
        return <p className="sgc-inv-kardex-vacio">Este ítem todavía no tiene movimientos registrados.</p>;
    }

    return (
        <div className="sgc-inv-kardex-wrap">
            <table className="sgc-inv-kardex">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Movimiento</th>
                        <th className="sgc-inv-num">Cantidad</th>
                        <th className="sgc-inv-num">Stock</th>
                        <th>Responsable</th>
                        <th>Observación</th>
                    </tr>
                </thead>
                <tbody>
                    {movimientos.map((mov) => {
                        const meta = etiquetaTipoMovimiento(mov.tipo);
                        const esSalida = mov.tipo === 'salida' || mov.tipo === 'traspaso_salida';
                        return (
                            <tr key={mov.id}>
                                <td className="sgc-inv-kardex-fecha">{formatFecha(mov.fecha)}</td>
                                <td>
                                    <span className={`sgc-inv-tag ${esSalida ? 'sgc-inv-tag--salida' : 'sgc-inv-tag--entrada'}`}>
                                        {meta.icon} {meta.label}
                                    </span>
                                </td>
                                <td className={`sgc-inv-num ${esSalida ? 'sgc-inv-neg' : 'sgc-inv-pos'}`}>
                                    {meta.signo}{mov.cantidad}
                                </td>
                                <td className="sgc-inv-num">{mov.stock_resultante}</td>
                                <td>{mov.usuario_nombre || '—'}</td>
                                <td className="sgc-inv-kardex-obs">
                                    {/* Los movimientos nacidos de un traspaso dicen de qué
                                        entidad vinieron o hacia cuál se fueron. */}
                                    {mov.traspaso_contraparte && (
                                        <span className="sgc-inv-kardex-entidad">
                                            {mov.traspaso_contraparte}
                                        </span>
                                    )}
                                    {mov.observacion || (mov.traspaso_contraparte ? '' : '—')}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
