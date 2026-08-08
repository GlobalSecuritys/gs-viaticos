import { formatFechaCorta, iniciales } from '../utils/personal';
import { LABEL_TIPO_ASIGNACION } from '../utils/asignaciones';
import './AsignacionCard.css';

export default function AsignacionCard({ asignacion, onClick }) {
    const nombre = asignacion.tecnico_nombre || `Técnico #${asignacion.tecnico_id}`;

    return (
        <div className="asig-card" onClick={onClick}>
            <span className="asig-card-tipo">{LABEL_TIPO_ASIGNACION[asignacion.tipo] || asignacion.tipo}</span>

            <div className="asig-card-tecnico-row">
                <span className="asig-card-avatar">{iniciales(nombre)}</span>
                <h3 className="asig-card-tecnico">{nombre}</h3>
            </div>

            <p className="asig-card-cliente">
                {asignacion.cliente}
                {asignacion.empresa ? ` · ${asignacion.empresa}` : ''}
            </p>
            <p className="asig-card-ciudad">📍 {asignacion.ciudad}</p>

            <div className="asig-card-footer">
                <span className="asig-card-fechas">
                    {formatFechaCorta(asignacion.fecha_inicio)} → {formatFechaCorta(asignacion.fecha_fin)}
                </span>
            </div>
        </div>
    );
}
