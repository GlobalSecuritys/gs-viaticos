import { useState, useMemo } from 'react';
import clientesData from '../data/clientes.json';
import './ModalSeleccionarCliente.css';

export default function ModalSeleccionarCliente({ clienteSeleccionado, onSeleccionar, onClose }) {
    const [busqueda, setBusqueda] = useState('');

    const clientesFiltrados = useMemo(() => {
        if (!busqueda.trim()) return clientesData;
        const q = busqueda.toLowerCase().trim();
        return clientesData.filter(
            (c) => c.nombre.toLowerCase().includes(q) || c.nit.includes(q)
        );
    }, [busqueda]);

    return (
        <div className="mc-overlay" onClick={onClose}>
            <div className="mc-modal" onClick={(e) => e.stopPropagation()}>
                <div className="mc-header">
                    <div>
                        <h3 className="mc-title">Seleccionar Cliente</h3>
                        <p className="mc-sub">Elige un cliente de la lista oficial ({clientesData.length} disponibles)</p>
                    </div>
                    <button className="mc-close-btn" type="button" onClick={onClose}>✕</button>
                </div>

                <div className="mc-search-wrap">
                    <span className="mc-search-icon">🔍</span>
                    <input
                        type="text"
                        className="mc-search-input"
                        placeholder="Buscar por nombre o NIT..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        autoFocus
                    />
                    {busqueda && (
                        <button className="mc-search-clear" type="button" onClick={() => setBusqueda('')}>✕</button>
                    )}
                </div>

                <div className="mc-list">
                    {clientesFiltrados.length === 0 ? (
                        <div className="mc-empty">
                            No se encontraron clientes que coincidan con &quot;{busqueda}&quot;
                        </div>
                    ) : (
                        clientesFiltrados.map((item) => {
                            const esSeleccionado = clienteSeleccionado === item.nombre;
                            return (
                                <button
                                    key={item.nit}
                                    type="button"
                                    className={`mc-item ${esSeleccionado ? 'mc-item--selected' : ''}`}
                                    onClick={() => {
                                        onSeleccionar(item.nombre);
                                        onClose();
                                    }}
                                >
                                    <div className="mc-item-info">
                                        <span className="mc-item-nombre">{item.nombre}</span>
                                        <span className="mc-item-nit">NIT: {item.nit}</span>
                                    </div>
                                    {esSeleccionado && <span className="mc-item-check">✓</span>}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
