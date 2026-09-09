import './BannerDuplicado.css';

/**
 * Aviso previo a la creación de un ítem: el backend encontró uno idéntico
 * (mismo código de fábrica) o parecido (descripción similar). No bloquea:
 * el usuario decide si suma sobre el existente o crea uno nuevo.
 */
export default function BannerDuplicado({ resultado, onUsarExistente, onIgnorar }) {
    if (!resultado || resultado.tipo === 'ninguno' || !resultado.matches?.length) return null;

    const esExacto = resultado.tipo === 'exacto';

    return (
        <div className={`sgc-inv-dup ${esExacto ? 'sgc-inv-dup--exacto' : 'sgc-inv-dup--posible'}`}>
            <div className="sgc-inv-dup-head">
                <span className="sgc-inv-dup-icon">{esExacto ? '⛔' : '⚠️'}</span>
                <div>
                    <strong className="sgc-inv-dup-title">
                        {esExacto
                            ? 'Este código ya está registrado'
                            : 'Puede que este elemento ya exista'}
                    </strong>
                    <p className="sgc-inv-dup-sub">
                        {esExacto
                            ? 'Un ítem con el mismo código de fábrica ya está en inventario. Registra el ingreso sobre él en lugar de duplicarlo.'
                            : 'Encontramos ítems con una descripción muy parecida. Revisa antes de crear uno nuevo.'}
                    </p>
                </div>
            </div>

            <ul className="sgc-inv-dup-list">
                {resultado.matches.map(({ item, score }) => (
                    <li key={item.id} className="sgc-inv-dup-item">
                        <div className="sgc-inv-dup-item-info">
                            <span className="sgc-inv-dup-item-desc">{item.descripcion}</span>
                            <span className="sgc-inv-dup-item-meta">
                                {item.codigo || 'Sin código'} · {item.marca} · {item.planilla_nombre}
                                {' · '}
                                <strong>{item.stock_actual} und.</strong>
                                {!esExacto && <> · {Math.round(score * 100)}% similar</>}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="sgc-inv-btn sgc-inv-btn--sm"
                            onClick={() => onUsarExistente(item)}
                        >
                            Usar este
                        </button>
                    </li>
                ))}
            </ul>

            {!esExacto && (
                <button type="button" className="sgc-inv-dup-ignorar" onClick={onIgnorar}>
                    Ninguno es el mío, crear uno nuevo
                </button>
            )}
        </div>
    );
}
