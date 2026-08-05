import { formatFechaCorta } from '../utils/personal';
import { LABEL_TIPO_ASIGNACION, LABEL_ESTADO_ASIGNACION, CLASE_ESTADO_ASIGNACION } from '../utils/asignaciones';
import './AsignacionCard.css';

export default function AsignacionCard({ asignacion, onClick }) {
    return (
        <div className="asig-card" onClick={onClick}>
            <div className="asig-card-top">
                <span className="asig-card-tipo">{LABEL_TIPO_ASIGNACION[asignacion.tipo] || asignacion.tipo}</span>
                <span className={`estado-asignacion ${CLASE_ESTADO_ASIGNACION[asignacion.estado] || ''}`}>
                    {LABEL_ESTADO_ASIGNACION[asignacion.estado] || asignacion.estado}
                </span>
            </div>

            <h3 className="asig-card-tecnico">{asignacion.tecnico_nombre || `Técnico #${asignacion.tecnico_id}`}</h3>

            <p className="asig-card-cliente">
                {asignacion.cliente}
                {asignacion.empresa ? ` · ${asignacion.empresa}` : ''}
            </p>
            <p className="asig-card-ciudad">{asignacion.ciudad}</p>

            <p className="asig-card-fechas">
                {formatFechaCorta(asignacion.fecha_inicio)} → {formatFechaCorta(asignacion.fecha_fin)}
            </p>
        </div>
    );
}
