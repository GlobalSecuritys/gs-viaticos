import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtenerMisAsignacionesActivas } from '../services/asignaciones';
import { LABEL_TIPO_ASIGNACION } from '../utils/asignaciones';
import { formatFechaCorta } from '../utils/personal';
import './ModalSeleccionarTipoViatico.css';

export default function ModalSeleccionarTipoViatico({ onClose }) {
    const navigate = useNavigate();
    const [asignaciones, setAsignaciones] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let activo = true;
        obtenerMisAsignacionesActivas()
            .then((res) => {
                if (activo) setAsignaciones(res.data || []);
            })
            .catch(() => {
                if (activo) setAsignaciones([]);
            })
            .finally(() => {
                if (activo) setLoading(false);
            });
        return () => {
            activo = false;
        };
    }, []);

    function seleccionarIndependiente() {
        onClose();
        navigate('/nuevo-viatico');
    }

    function seleccionarAsignacion(id) {
        onClose();
        navigate(`/nuevo-viatico?asignacion_id=${id}`);
    }

    return (
        <div className="mstv-overlay" onClick={onClose}>
            <div className="mstv-modal" onClick={(e) => e.stopPropagation()}>
                <div className="mstv-header">
                    <div>
                        <h2 className="mstv-title">Registrar Nuevo Viático</h2>
                        <p className="mstv-subtitle">Selecciona el tipo de registro que deseas realizar</p>
                    </div>
                    <button type="button" className="mstv-btn-close" onClick={onClose} title="Cerrar">
                        ✕
                    </button>
                </div>

                <div className="mstv-body">
                    {/* Opción 1: Viático Independiente */}
                    <div className="mstv-option-card mstv-option-card--indep" onClick={seleccionarIndependiente}>
                        <div className="mstv-option-icon">📄</div>
                        <div className="mstv-option-info">
                            <div className="mstv-option-header-row">
                                <h3 className="mstv-option-title">Viático Independiente</h3>
                                <span className="mstv-option-pill">Sin asignación</span>
                            </div>
                            <p className="mstv-option-desc">
                                Gastos directos u operativos que no están vinculados a una orden de asignación previa.
                            </p>
                        </div>
                        <span className="mstv-option-arrow">→</span>
                    </div>

                    {/* Opción 2: Asociar a Asignación Activa */}
                    <div className="mstv-section-asig">
                        <div className="mstv-section-asig-header">
                            <div className="mstv-asig-title-row">
                                <span className="mstv-asig-icon">📍</span>
                                <div>
                                    <h3 className="mstv-asig-section-title">Asociar a una Asignación Activa</h3>
                                    <p className="mstv-option-desc">
                                        Carga tus gastos directamente a tu asignación y presupuesto asignado.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {loading ? (
                            <div className="mstv-loading">
                                <div className="mstv-spinner" />
                                <span>Cargando tus asignaciones activas...</span>
                            </div>
                        ) : asignaciones.length === 0 ? (
                            <div className="mstv-empty-asig">
                                <span className="mstv-empty-icon">📂</span>
                                <p className="mstv-empty-title">No tienes asignaciones activas en este momento.</p>
                                <p className="mstv-empty-hint">
                                    Puedes registrar tu gasto seleccionando la opción de <strong>Viático Independiente</strong>.
                                </p>
                            </div>
                        ) : (
                            <div className="mstv-asig-list">
                                {asignaciones.map((a) => (
                                    <div
                                        key={a.id}
                                        className="mstv-asig-item"
                                        onClick={() => seleccionarAsignacion(a.id)}
                                    >
                                        <div className="mstv-asig-item-top">
                                            <span className="mstv-asig-tipo-badge">
                                                🏷️ {LABEL_TIPO_ASIGNACION[a.tipo] || a.tipo}
                                            </span>
                                            <span className="mstv-asig-badge-activa">✓ Asignación Activa</span>
                                        </div>
                                        <h4 className="mstv-asig-item-cliente">{a.cliente}</h4>
                                        <div className="mstv-asig-item-detalles">
                                            {a.empresa && (
                                                <span className="mstv-asig-tag-oficina">
                                                    🏢 {a.empresa}
                                                </span>
                                            )}
                                            <span className="mstv-asig-tag">
                                                📍 {a.ciudad}
                                            </span>
                                            <span className="mstv-asig-tag">
                                                📅 {formatFechaCorta(a.fecha_inicio)} → {formatFechaCorta(a.fecha_fin)}
                                            </span>
                                        </div>
                                        <div className="mstv-asig-item-action">
                                            <span>Registrar en esta asignación</span>
                                            <span className="mstv-item-arrow">→</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mstv-footer">
                    <button type="button" className="mstv-btn-cancel" onClick={onClose}>
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
}
