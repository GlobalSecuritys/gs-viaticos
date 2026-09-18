/**
 * Pantalla de entrada del módulo: una tarjeta por inventario.
 * RTC y Mantenimiento son las dos uniones temporales; Global es la suma.
 *
 * Mismo lenguaje visual que las tarjetas del Mapa SGC: fondo navy, cifra en
 * dorado y franja superior de color para distinguir la caja.
 */
export default function TarjetasInventario({ resumen, cargando, onAbrir }) {
    if (cargando || !resumen) {
        return <p className="sgc-inv-cargando">Cargando inventarios…</p>;
    }

    const totalItemsTecnicos = resumen.uniones.reduce((acc, u) => acc + (u.total_items_tecnicos || 0), 0);

    const tarjetas = [
        ...resumen.uniones.map((u) => ({ ...u, variante: 'union' })),
        {
            clave: 'tecnicos',
            nombre: 'Técnicos',
            subnombre: 'Hojas individuales de técnicos',
            total_items: totalItemsTecnicos,
            total_unidades: totalItemsTecnicos,
            total_despachos: 0,
            total_prestamos: 0,
            pendientes: 0,
            variante: 'tecnicos',
        },
        { ...resumen.global, variante: 'global' },
    ];

    return (
        <section className="sgc-inv-entrada">
            {tarjetas.map((t) => (
                <button
                    key={t.clave}
                    type="button"
                    className={`sgc-inv-card sgc-inv-card--${t.variante}`}
                    style={t.variante === 'tecnicos' ? { borderTop: '3px solid #10b981' } : undefined}
                    onClick={() => onAbrir(t)}
                >
                    <header className="sgc-inv-card-head">
                        <span className="sgc-inv-card-tipo" style={t.variante === 'tecnicos' ? { color: '#10b981' } : undefined}>
                            {t.variante === 'global' ? 'Consolidado' : t.variante === 'tecnicos' ? 'Custodia Personal' : t.clave === 'PROYECTO_ZEUS' ? 'Proyecto' : 'Unión temporal'}
                        </span>
                        <h2 className="sgc-inv-card-nombre">{t.nombre}</h2>
                    </header>

                    <dl className="sgc-inv-card-cifras">
                        {t.variante === 'tecnicos' ? (
                            <>
                                <div>
                                    <dt>Artículos en técnicos</dt>
                                    <dd style={{ color: '#10b981' }}>{t.total_items.toLocaleString('es-CO')}</dd>
                                </div>
                                <div>
                                    <dt>Técnicos con inventario</dt>
                                    <dd>6</dd>
                                </div>
                                <div>
                                    <dt>Mantenimiento</dt>
                                    <dd>77 ítems</dd>
                                </div>
                                <div>
                                    <dt>Control</dt>
                                    <dd>Por hojas</dd>
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <dt>Unidades en stock</dt>
                                    <dd>{t.total_unidades.toLocaleString('es-CO')}</dd>
                                </div>
                                <div>
                                    <dt>Ítems</dt>
                                    <dd>{t.total_items.toLocaleString('es-CO')}</dd>
                                </div>
                                <div>
                                    <dt>Despachos</dt>
                                    <dd>{t.total_despachos.toLocaleString('es-CO')}</dd>
                                </div>
                                <div>
                                    <dt>Préstamos</dt>
                                    <dd>{t.total_prestamos.toLocaleString('es-CO')}</dd>
                                </div>
                            </>
                        )}
                    </dl>

                    <footer className="sgc-inv-card-pie">
                        {t.variante === 'tecnicos' ? (
                            <span>6 hojas individuales</span>
                        ) : t.pendientes > 0 ? (
                            <span className="sgc-inv-card-alerta">
                                {t.pendientes} despacho{t.pendientes === 1 ? '' : 's'} por revisar
                            </span>
                        ) : (
                            <span>Sin despachos por revisar</span>
                        )}
                        <span className="sgc-inv-card-entrar">Abrir →</span>
                    </footer>
                </button>
            ))}
        </section>
    );
}
