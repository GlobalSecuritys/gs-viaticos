import React from 'react';
import './Mantenimiento.css';

/**
 * 4 Botones / Tarjetas de navegación ejecutiva para "Unión Temporal Mantenimiento GSB_SDSS".
 * Permite cambiar de forma directa entre las 4 secciones principales sin salir de la vista.
 */
export default function TarjetasBotonesMantenimiento({ seccionActiva, onCambiarSeccion, datosResumen }) {
    const botones = [
        {
            id: 'equipos',
            titulo: 'Equipos',
            subtitulo: 'Stock, seriales y referencias',
            icono: '📦',
            cifra: datosResumen?.total_unidades !== undefined ? `${datosResumen.total_unidades.toLocaleString('es-CO')} unid.` : null,
        },
        {
            id: 'movimientos',
            titulo: 'Movimientos',
            subtitulo: 'Salidas y préstamos unificados',
            icono: '🔄',
            cifra: datosResumen?.total_despachos !== undefined ? `${(datosResumen.total_despachos + (datosResumen.total_prestamos || 0)).toLocaleString('es-CO')} mov.` : null,
        },
        {
            id: 'tecnicos',
            titulo: 'Técnicos',
            subtitulo: 'Custodia personal y despachos',
            icono: '👷',
            cifra: datosResumen?.total_items_tecnicos !== undefined ? `${datosResumen.total_items_tecnicos.toLocaleString('es-CO')} en custodia` : null,
        },
        {
            id: 'resumen',
            titulo: 'Resumen',
            subtitulo: 'Cifras, KPIs y alertas',
            icono: '📊',
            cifra: datosResumen?.pendientes !== undefined && datosResumen.pendientes > 0
                ? `${datosResumen.pendientes} por revisar`
                : 'Al día',
        },
    ];

    return (
        <nav className="inv-nav-mantenimiento" aria-label="Secciones de Mantenimiento">
            {botones.map((b) => {
                const activo = seccionActiva === b.id;
                return (
                    <button
                        key={b.id}
                        type="button"
                        className={`inv-nav-btn ${activo ? 'inv-nav-btn--activo' : ''}`}
                        onClick={() => onCambiarSeccion(b.id)}
                        aria-current={activo ? 'page' : undefined}
                    >
                        <div className="inv-nav-head">
                            <span className="inv-nav-icono" aria-hidden="true">
                                {b.icono}
                            </span>
                            {b.cifra && <span className="inv-nav-cifra">{b.cifra}</span>}
                        </div>
                        <strong className="inv-nav-titulo">{b.titulo}</strong>
                        <span className="inv-nav-subtitulo">{b.subtitulo}</span>
                    </button>
                );
            })}
        </nav>
    );
}
