import { formatFechaCorta, iniciales, formatCOP } from '../utils/personal';
import { LABEL_TIPO_ASIGNACION, LABEL_ESTADO_ASIGNACION, CLASE_ESTADO_ASIGNACION } from '../utils/asignaciones';
import './AsignacionCard.css';

export default function AsignacionCard({ asignacion, onClick }) {
    const nombre = asignacion.tecnico_nombre || `Técnico #${asignacion.tecnico_id}`;

    // Cálculo de días de duración
    const fechaInicio = asignacion.fecha_inicio ? new Date(asignacion.fecha_inicio + 'T00:00:00') : null;
    const fechaFin = asignacion.fecha_fin ? new Date(asignacion.fecha_fin + 'T00:00:00') : null;
    let diasDuracion = 0;
    if (fechaInicio && fechaFin && !isNaN(fechaInicio) && !isNaN(fechaFin)) {
        const diffTime = Math.abs(fechaFin - fechaInicio);
        diasDuracion = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    const anticipo = Number(asignacion.monto_anticipo || 0);
    const gastado = Number(asignacion.total_gastado || 0);
    const saldo = Number(asignacion.saldo_restante || Math.max(0, anticipo - gastado));
    const porcentajeConsumido = anticipo > 0 ? Math.min(100, Math.round((gastado / anticipo) * 100)) : 0;
    const esExcedido = gastado > anticipo && anticipo > 0;

    return (
        <div className={`asig-card asig-card--${asignacion.estado}`} onClick={onClick}>
            {/* Header: Tipo & Estado Badge */}
            <div className="asig-card-header">
                <span className="asig-card-tipo">
                    🏷️ {LABEL_TIPO_ASIGNACION[asignacion.tipo] || asignacion.tipo}
                </span>
                <span className={`asig-card-badge ${CLASE_ESTADO_ASIGNACION[asignacion.estado] || ''}`}>
                    {LABEL_ESTADO_ASIGNACION[asignacion.estado] || asignacion.estado}
                </span>
            </div>

            {/* Técnico Info */}
            <div className="asig-card-tecnico-row">
                <span className="asig-card-avatar">{iniciales(nombre)}</span>
                <div className="asig-card-tecnico-info">
                    <h3 className="asig-card-tecnico">{nombre}</h3>
                </div>
            </div>

            {/* Cliente & Ubicación */}
            <div className="asig-card-body">
                <p className="asig-card-cliente">
                    <strong>{asignacion.cliente}</strong>
                    {asignacion.empresa ? ` · ${asignacion.empresa}` : ''}
                </p>
                <p className="asig-card-ciudad">📍 {asignacion.ciudad}</p>
            </div>

            {/* Barra Financiera de Consumo */}
            {anticipo > 0 && (
                <div className="asig-card-financial">
                    <div className="asig-fin-labels">
                        <span>Anticipo: <strong>{formatCOP(anticipo)}</strong></span>
                        <span className={esExcedido ? 'text-excedido' : ''}>
                            Gastado: <strong>{formatCOP(gastado)}</strong>
                        </span>
                    </div>
                    <div className="asig-progress-bar">
                        <div
                            className={`asig-progress-fill ${esExcedido ? 'asig-progress-fill--excedido' : ''}`}
                            style={{ width: `${porcentajeConsumido}%` }}
                        />
                    </div>
                    <div className="asig-fin-sub">
                        <span>Saldo Restante: <strong className={esExcedido ? 'text-excedido' : 'text-saldo'}>{formatCOP(saldo)}</strong></span>
                        <span>{porcentajeConsumido}% consumido</span>
                    </div>
                </div>
            )}

            {/* Footer con Fechas y Días */}
            <div className="asig-card-footer">
                <span className="asig-card-fechas">
                    📅 {formatFechaCorta(asignacion.fecha_inicio)} → {formatFechaCorta(asignacion.fecha_fin)}
                </span>
                {diasDuracion > 0 && (
                    <span className="asig-card-dias">
                        ⏱️ {diasDuracion} {diasDuracion === 1 ? 'día' : 'días'}
                    </span>
                )}
            </div>
        </div>
    );
}
