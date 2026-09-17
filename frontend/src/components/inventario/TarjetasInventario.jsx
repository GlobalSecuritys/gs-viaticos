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

    const tarjetas = [
        ...resumen.uniones.map((u) => ({ ...u, variante: 'union' })),
        { ...resumen.global, variante: 'global' },
    ];

    return (
        <section className="sgc-inv-entrada">
            {tarjetas.map((t) => (
                <button
                    key={t.clave}
                    type="button"
                    className={`sgc-inv-card sgc-inv-card--${t.variante}`}
                    onClick={() => onAbrir(t)}
                >
                    <header className="sgc-inv-card-head">
                        <span className="sgc-inv-card-tipo">
                            {t.variante === 'global' ? 'Consolidado' : 'Unión temporal'}
                        </span>
                        <h2 className="sgc-inv-card-nombre">{t.nombre}</h2>
                    </header>

                    <dl className="sgc-inv-card-cifras">
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
                    </dl>

                    <footer className="sgc-inv-card-pie">
                        {t.pendientes > 0 ? (
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
