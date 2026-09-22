import React from 'react';
import '../mantenimiento/Mantenimiento.css';

/**
 * 4 Botones / Tarjetas de navegación ejecutiva para "Unión Temporal RTC American Global".
 * Permite cambiar de forma directa entre: Equipos, Movimientos, Técnicos y Ventas.
 */
export default function TarjetasBotonesRTC({
    seccionActiva,
    onCambiarSeccion,
    datosResumen,
    conteoVentas = 0,
    conteoTecnicosActivos = 0,
}) {
    const botones = [
        {
            id: 'equipos',
            titulo: 'Equipos',
            subtitulo: 'Stock, seriales y referencias',
            icono: '📦',
            cifra:
                datosResumen?.total_unidades !== undefined
                    ? `${datosResumen.total_unidades.toLocaleString('es-CO')} unid.`
                    : null,
        },
        {
            id: 'movimientos',
            titulo: 'Movimientos',
            subtitulo: 'Salidas y préstamos unificados',
            icono: '🔄',
            cifra:
                datosResumen?.total_despachos !== undefined
                    ? `${(
                          datosResumen.total_despachos + (datosResumen.total_prestamos || 0)
                      ).toLocaleString('es-CO')} mov.`
                    : null,
        },
        {
            id: 'tecnicos',
            titulo: 'Técnicos',
            subtitulo: 'Despachos por técnico activo',
            icono: '👷',
            cifra:
                conteoTecnicosActivos > 0
                    ? `${conteoTecnicosActivos} técnicos activos`
                    : 'Personal RTC',
        },
        {
            id: 'ventas',
            titulo: 'Ventas',
            subtitulo: 'Salidas destinadas a venta (SDS/GSB)',
            icono: '🏷️',
            cifra:
                conteoVentas > 0
                    ? `${conteoVentas.toLocaleString('es-CO')} ventas`
                    : 'Registro ventas',
        },
    ];

    return (
        <nav className="inv-nav-mantenimiento" aria-label="Secciones de RTC American Global">
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
