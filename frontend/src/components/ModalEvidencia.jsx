import { useState } from 'react';
import './ModalEvidencia.css';

const LABEL_TIPO = {
    alimentacion: 'Alimentación',
    transporte: 'Transporte',
    hotel: 'Hotel',
    peajes: 'Peajes',
    parqueadero: 'Parqueadero',
    otros: 'Otros',
};

function formatCOP(value) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(value);
}

function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

export default function ModalEvidencia({ viatico, onClose, onAprobar, onRechazar }) {
    const [indiceActivo, setIndiceActivo] = useState(0);
    const evidencias = viatico.evidencias || [];
    const tieneEvidencias = evidencias.length > 0;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-evidencia" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={onClose}>×</button>

                <div className="modal-imagen-lado">
                    {tieneEvidencias ? (
                        <>
                            <img
                                src={evidencias[indiceActivo].secure_url}
                                alt={`Evidencia ${indiceActivo + 1}`}
                                className="modal-imagen-principal"
                            />
                            {evidencias.length > 1 && (
                                <div className="modal-thumbs-strip">
                                    {evidencias.map((ev, i) => (
                                        <img
                                            key={ev.id}
                                            src={ev.secure_url}
                                            alt={`Miniatura ${i + 1}`}
                                            className={`modal-thumb ${i === indiceActivo ? 'modal-thumb--activa' : ''}`}
                                            onClick={() => setIndiceActivo(i)}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="modal-sin-evidencia">
                            <span>📷</span>
                            <p>Este viático no tiene fotografías adjuntas</p>
                        </div>
                    )}
                </div>

                <div className="modal-info-lado">
                    <span className={`badge-estado badge-estado--${viatico.estado}`}>
                        {viatico.estado.charAt(0).toUpperCase() + viatico.estado.slice(1)}
                    </span>

                    <h2 className="modal-info-titulo">{viatico.cliente}</h2>
                    <p className="modal-info-ot">OT: {viatico.ot}</p>

                    <div className="modal-info-grid">
                        <div>
                            <span className="modal-info-label">Técnico</span>
                            <span className="modal-info-valor">{viatico.nombre}</span>
                        </div>
                        <div>
                            <span className="modal-info-label">Correo</span>
                            <span className="modal-info-valor">{viatico.correo}</span>
                        </div>
                        <div>
                            <span className="modal-info-label">Código empleado</span>
                            <span className="modal-info-valor">{viatico.codigo_empleado || '—'}</span>
                        </div>
                        <div>
                            <span className="modal-info-label">Fecha</span>
                            <span className="modal-info-valor">{formatDate(viatico.fecha)}</span>
                        </div>
                        <div>
                            <span className="modal-info-label">Ciudad</span>
                            <span className="modal-info-valor">{viatico.ciudad}</span>
                        </div>
                        <div>
                            <span className="modal-info-label">Tipo de gasto</span>
                            <span className="modal-info-valor">{LABEL_TIPO[viatico.tipo_gasto] || viatico.tipo_gasto}</span>
                        </div>
                    </div>

                    <div className="modal-info-valor-grande">
                        <span className="modal-info-label">Valor</span>
                        <span className="modal-valor-monto">{formatCOP(viatico.valor)}</span>
                    </div>

                    {viatico.descripcion && (
                        <div className="modal-descripcion">
                            <span className="modal-info-label">Descripción</span>
                            <p>{viatico.descripcion}</p>
                        </div>
                    )}

                    {viatico.estado === 'pendiente' && (
                        <div className="modal-acciones">
                            <button
                                className="btn-rechazar"
                                onClick={() => onRechazar(viatico.id)}
                            >
                                Rechazar
                            </button>
                            <button
                                className="btn-aprobar"
                                onClick={() => onAprobar(viatico.id)}
                            >
                                Aprobar
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}