import { useEffect, useMemo, useState } from 'react';
import TecnicoLayout from '../components/TecnicoLayout';
import SelectorEvidencias from '../components/SelectorEvidencias';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { numeroALetras } from '../utils/numeroALetras';
import './CuentaCobro.css';

function formatCOP(val) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(Number(val) || 0);
}

function getFechaActualISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatFechaLargaEs(fechaStr) {
    if (!fechaStr) return '';
    const parts = fechaStr.split('-');
    if (parts.length !== 3) return fechaStr;
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    const dia = dateObj.getDate();
    const mes = dateObj.toLocaleString('es-CO', { month: 'long' }).toUpperCase();
    const anio = dateObj.getFullYear();
    return `${dia} ${mes} del ${anio}`;
}

function getMesDiaAnio(fechaStr) {
    if (!fechaStr) return { dia: '', mes: '', anio: '' };
    const parts = fechaStr.split('-');
    if (parts.length !== 3) return { dia: '', mes: '', anio: '' };
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    return {
        dia: dateObj.getDate(),
        mes: dateObj.toLocaleString('es-CO', { month: 'long' }).toUpperCase(),
        anio: dateObj.getFullYear(),
    };
}

export default function CuentaCobro() {
    const { user } = useAuth();

    const [tab, setTab] = useState('crear'); // 'crear' | 'historial' | 'imprimir'
    const [cuentas, setCuentas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [exito, setExito] = useState('');

    // Cuenta seleccionada para imprimir / ver
    const [cuentaImprimir, setCuentaImprimir] = useState(null);

    // Formulario Estado
    const [fecha, setFecha] = useState(getFechaActualISO());
    const [ciudad, setCiudad] = useState('Bogotá. D. C.');
    const [tipoIdentificacion, setTipoIdentificacion] = useState('cedula');
    const [identificacion, setIdentificacion] = useState(user?.codigo_empleado || '');
    const [conceptoServicio, setConceptoServicio] = useState('Servicio de alimentación y hospedaje VELEZ SANTANDER MANTENIMIENTO PREVENTIVO');

    // Datos bancarios
    const [banco, setBanco] = useState('Banco Caja Social');
    const [tipoCuenta, setTipoCuenta] = useState('Ahorros');
    const [numeroCuenta, setNumeroCuenta] = useState('');
    const [titularNombre, setTitularNombre] = useState(user?.nombre || user?.correo || '');
    const [titularCedula, setTitularCedula] = useState(user?.codigo_empleado || '');
    const [titularCelular, setTitularCelular] = useState('');

    // Checkbox de autorización obligatorio
    const [autorizacionDatos, setAutorizacionDatos] = useState(false);

    // Evidencias / soportes opcionales
    const [archivos, setArchivos] = useState([]);
    const [errorArchivos, setErrorArchivos] = useState('');

    // Ítems dinámicos
    const [items, setItems] = useState([
        {
            oficina: 'VELES',
            fecha_inicio: getFechaActualISO(),
            fecha_fin: getFechaActualISO(),
            num_tecnicos: 1,
            valor_diario: 100000,
            valor_total: 100000,
        },
    ]);

    // Autocompletar cuando carga el usuario
    useEffect(() => {
        if (user) {
            if (!identificacion) setIdentificacion(user.codigo_empleado || '');
            if (!titularNombre) setTitularNombre(user.nombre || user.correo || '');
            if (!titularCedula) setTitularCedula(user.codigo_empleado || '');
        }
    }, [user]);

    async function cargarCuentas() {
        try {
            setLoading(true);
            const { data } = await api.get('/cuentas-cobro');
            setCuentas(data || []);
        } catch {
            setError('No se pudieron cargar las cuentas de cobro.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        cargarCuentas();
    }, []);

    // Manejo de ítems
    function handleItemChange(index, field, value) {
        const nuevosItems = [...items];
        nuevosItems[index][field] = value;

        const numTec = Number(nuevosItems[index].num_tecnicos) || 1;
        const valDia = Number(nuevosItems[index].valor_diario) || 0;
        nuevosItems[index].valor_total = numTec * valDia;

        setItems(nuevosItems);
    }

    function agregarItem() {
        setItems([
            ...items,
            {
                oficina: '',
                fecha_inicio: fecha,
                fecha_fin: fecha,
                num_tecnicos: 1,
                valor_diario: 0,
                valor_total: 0,
            },
        ]);
    }

    function eliminarItem(index) {
        if (items.length === 1) return;
        setItems(items.filter((_, i) => i !== index));
    }

    const totalGeneral = useMemo(() => {
        return items.reduce((acc, it) => acc + (Number(it.valor_total) || 0), 0);
    }, [items]);

    // Guardar Cuenta de Cobro
    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setExito('');

        if (!autorizacionDatos) {
            setError('Debe autorizar el uso de sus datos bancarios para enviar la cuenta de cobro.');
            return;
        }

        if (items.length === 0 || totalGeneral <= 0) {
            setError('Debe registrar al menos un ítem con valor válido.');
            return;
        }

        try {
            setLoading(true);
            const payload = {
                fecha,
                ciudad,
                tipo_identificacion: tipoIdentificacion,
                identificacion,
                concepto_servicio: conceptoServicio,
                items,
                total: totalGeneral,
                banco,
                tipo_cuenta: tipoCuenta,
                numero_cuenta: numeroCuenta,
                titular_nombre: titularNombre,
                titular_cedula: titularCedula,
                titular_celular: titularCelular,
                autorizacion_datos: autorizacionDatos,
            };

            const { data } = await api.post('/cuentas-cobro', payload);
            setExito(`✅ Cuenta de cobro guardada correctamente (Consecutivo: ${data.consecutivo || data.id}).`);
            setCuentaImprimir(data);
            setTab('imprimir');
            cargarCuentas();
        } catch (err) {
            const d = err.response?.data?.detail;
            let msg = 'Error al guardar la cuenta de cobro.';
            if (typeof d === 'string') {
                msg = d;
            } else if (Array.isArray(d)) {
                msg = d.map((item) => `${item.loc?.slice(-1)[0] || 'Campo'}: ${item.msg}`).join(' | ');
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    function verCuentaParaImprimir(cuenta) {
        setCuentaImprimir(cuenta);
        setTab('imprimir');
    }

    function imprimirDocumento() {
        window.print();
    }

    return (
        <TecnicoLayout>
            <div className="cc-container">

                {/* Header & Tabs */}
                <div className="cc-header no-print">
                    <div>
                        <h1 className="cc-title">💵 Cuenta de Cobro</h1>
                        <p className="cc-sub">Módulo para reembolsos por transferencias bancarias de gastos asumidos</p>
                    </div>
                    <div className="cc-tab-buttons">
                        <button
                            className={`cc-tab-btn ${tab === 'crear' ? 'cc-tab-btn--active' : ''}`}
                            onClick={() => setTab('crear')}
                        >
                            ➕ Crear Nueva
                        </button>
                        <button
                            className={`cc-tab-btn ${tab === 'historial' ? 'cc-tab-btn--active' : ''}`}
                            onClick={() => setTab('historial')}
                        >
                            📋 Historial ({cuentas.length})
                        </button>
                        {cuentaImprimir && (
                            <button
                                className={`cc-tab-btn ${tab === 'imprimir' ? 'cc-tab-btn--active' : ''}`}
                                onClick={() => setTab('imprimir')}
                            >
                                📄 Vista Documento
                            </button>
                        )}
                    </div>
                </div>

                {error && <div className="admin-error-banner no-print">{error}</div>}
                {exito && <div className="admin-success-banner no-print">{exito}</div>}

                {/* TAB 1: FORMULARIO CREAR */}
                {tab === 'crear' && (
                    <form onSubmit={handleSubmit} className="no-print">
                        <div className="cc-card">
                            <h2 className="cc-section-title">1. Datos Generales de la Cuenta</h2>
                            <div className="cc-form-grid">
                                <div className="cc-form-group">
                                    <label>Fecha del Documento</label>
                                    <input
                                        type="date"
                                        value={fecha}
                                        onChange={(e) => setFecha(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="cc-form-group">
                                    <label>Ciudad</label>
                                    <input
                                        type="text"
                                        value={ciudad}
                                        onChange={(e) => setCiudad(e.target.value)}
                                        placeholder="Ej: Bogotá. D. C."
                                        required
                                    />
                                </div>
                                <div className="cc-form-group">
                                    <label>Tipo Identificación</label>
                                    <select
                                        value={tipoIdentificacion}
                                        onChange={(e) => setTipoIdentificacion(e.target.value)}
                                    >
                                        <option value="cedula">Cédula de Ciudadanía</option>
                                        <option value="nit_proveedor">NIT Proveedor</option>
                                    </select>
                                </div>
                                <div className="cc-form-group">
                                    <label>No. Identificación</label>
                                    <input
                                        type="text"
                                        value={identificacion}
                                        onChange={(e) => setIdentificacion(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="cc-form-group" style={{ marginTop: '1.2rem' }}>
                                <label>Concepto / Servicio Prestado</label>
                                <textarea
                                    rows="2"
                                    value={conceptoServicio}
                                    onChange={(e) => setConceptoServicio(e.target.value)}
                                    placeholder="Describa brevemente el servicio o concepto del gasto"
                                    required
                                />
                            </div>
                        </div>

                        {/* TABLA DE ÍTEMS */}
                        <div className="cc-card">
                            <div className="cc-section-title">
                                <span>2. Ítems y Gastos Realizados</span>
                                <button type="button" className="cc-btn-add-item" onClick={agregarItem}>
                                    + Agregar Ítem
                                </button>
                            </div>

                            <div className="cc-items-table-wrap">
                                <table className="cc-items-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Oficina / Lugar</th>
                                            <th>Fecha Inicio</th>
                                            <th>Fecha Final</th>
                                            <th>No. Técnicos</th>
                                            <th>Valor Diario ($)</th>
                                            <th>Valor Total ($)</th>
                                            <th>Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((it, idx) => (
                                            <tr key={idx}>
                                                <td>{idx + 1}</td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        value={it.oficina}
                                                        onChange={(e) => handleItemChange(idx, 'oficina', e.target.value)}
                                                        placeholder="Lugar u oficina"
                                                        required
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="date"
                                                        value={it.fecha_inicio}
                                                        onChange={(e) => handleItemChange(idx, 'fecha_inicio', e.target.value)}
                                                        required
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="date"
                                                        value={it.fecha_fin}
                                                        onChange={(e) => handleItemChange(idx, 'fecha_fin', e.target.value)}
                                                        required
                                                    />
                                                </td>
                                                <td style={{ width: '80px' }}>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={it.num_tecnicos}
                                                        onChange={(e) => handleItemChange(idx, 'num_tecnicos', e.target.value)}
                                                        required
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={it.valor_diario}
                                                        onChange={(e) => handleItemChange(idx, 'valor_diario', e.target.value)}
                                                        required
                                                    />
                                                </td>
                                                <td>
                                                    <strong>{formatCOP(it.valor_total)}</strong>
                                                </td>
                                                <td>
                                                    {items.length > 1 && (
                                                        <button
                                                            type="button"
                                                            className="cc-btn-remove-item"
                                                            onClick={() => eliminarItem(idx)}
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="cc-total-bar">
                                <span className="cc-total-label">TOTAL CUENTA DE COBRO:</span>
                                <span className="cc-total-val">{formatCOP(totalGeneral)}</span>
                            </div>
                        </div>

                        {/* DATOS BANCARIOS */}
                        <div className="cc-card">
                            <h2 className="cc-section-title">3. Datos Bancarios para Desembolso</h2>
                            <div className="cc-form-grid">
                                <div className="cc-form-group">
                                    <label>Banco</label>
                                    <input
                                        type="text"
                                        value={banco}
                                        onChange={(e) => setBanco(e.target.value)}
                                        placeholder="Ej: Banco Caja Social"
                                        required
                                    />
                                </div>
                                <div className="cc-form-group">
                                    <label>Tipo de Cuenta</label>
                                    <select value={tipoCuenta} onChange={(e) => setTipoCuenta(e.target.value)}>
                                        <option value="Ahorros">Cuenta de Ahorros</option>
                                        <option value="Corriente">Cuenta Corriente</option>
                                    </select>
                                </div>
                                <div className="cc-form-group">
                                    <label>No. de Cuenta</label>
                                    <input
                                        type="text"
                                        value={numeroCuenta}
                                        onChange={(e) => setNumeroCuenta(e.target.value)}
                                        placeholder="Número de cuenta bancaria"
                                        required
                                    />
                                </div>
                                <div className="cc-form-group">
                                    <label>Titular de la Cuenta</label>
                                    <input
                                        type="text"
                                        value={titularNombre}
                                        onChange={(e) => setTitularNombre(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="cc-form-group">
                                    <label>Cédula del Titular</label>
                                    <input
                                        type="text"
                                        value={titularCedula}
                                        onChange={(e) => setTitularCedula(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="cc-form-group">
                                    <label>Celular de Contacto</label>
                                    <input
                                        type="text"
                                        value={titularCelular}
                                        onChange={(e) => setTitularCelular(e.target.value)}
                                        placeholder="Ej: 3112289063"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="cc-auth-box">
                                <input
                                    type="checkbox"
                                    id="chkAutorizacion"
                                    checked={autorizacionDatos}
                                    onChange={(e) => setAutorizacionDatos(e.target.checked)}
                                />
                                <label htmlFor="chkAutorizacion">
                                    Autorizo expresamente a Global Security Bank SAS para el uso de mis datos bancarios en el desembolso y transferencia de esta cuenta de cobro.
                                </label>
                            </div>
                        </div>

                        {/* SOPORTES OPCIONALES */}
                        <div className="cc-card">
                            <h2 className="cc-section-title">4. Soportes Opcionales</h2>
                            <SelectorEvidencias
                                archivos={archivos}
                                setArchivos={setArchivos}
                                error={errorArchivos}
                                setError={setErrorArchivos}
                            />
                        </div>

                        <button
                            type="submit"
                            className="cc-btn-submit"
                            disabled={!autorizacionDatos || loading}
                        >
                            {loading ? 'Guardando...' : '💾 Guardar Cuenta de Cobro'}
                        </button>
                    </form>
                )}

                {/* TAB 2: HISTORIAL */}
                {tab === 'historial' && (
                    <div className="cc-card no-print">
                        <h2 className="cc-section-title">Historial de Cuentas de Cobro</h2>
                        {cuentas.length === 0 ? (
                            <p style={{ color: '#64748B', fontStyle: 'italic' }}>No has registrado cuentas de cobro aún.</p>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Consecutivo</th>
                                            <th>Fecha</th>
                                            <th>Concepto</th>
                                            <th>Banco</th>
                                            <th>Total</th>
                                            <th>Estado</th>
                                            <th>Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cuentas.map((c) => (
                                            <tr key={c.id}>
                                                <td><strong>No. {c.consecutivo || `${c.fecha?.split('-')?.[0] || '2026'}-${c.id}`}</strong></td>
                                                <td>{c.fecha}</td>
                                                <td>{c.concepto_servicio}</td>
                                                <td>{c.banco} ({c.tipo_cuenta})</td>
                                                <td><strong style={{ color: 'var(--color-primary-blue)' }}>{formatCOP(c.total)}</strong></td>
                                                <td>
                                                    <span className="estado-badge estado-badge--inactivo">
                                                        {(c.estado || 'PENDIENTE').toUpperCase()}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button
                                                        className="admin-mini-btn"
                                                        onClick={() => verCuentaParaImprimir(c)}
                                                    >
                                                        👁️ Ver / Imprimir
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 3: DOCUMENTO IMPRIMIBLE / EXPORTABLE EN PDF */}
                {tab === 'imprimir' && cuentaImprimir && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }} className="no-print">
                            <button className="admin-back-btn" onClick={() => setTab('crear')}>← Volver al Formulario</button>
                            <button className="cuenta-print-btn" onClick={imprimirDocumento}>
                                🖨️ Imprimir / Exportar a PDF
                            </button>
                        </div>

                        {/* Vista exacta del Documento según Imagen de Referencia */}
                        <div className="cc-document-view">
                            <div className="cc-doc-header-num">
                                CUENTA DE COBRO No: {cuentaImprimir.consecutivo || `2026-${cuentaImprimir.id}`}
                            </div>

                            <div className="cc-doc-date">
                                {formatFechaLargaEs(cuentaImprimir.fecha || fecha)}
                            </div>

                            <div className="cc-doc-company">
                                GLOBAL SECURITY BANK<br />
                                Nit 830 057 616-3
                            </div>

                            <div className="cc-doc-debe-a">
                                Debe a<br />
                                <span className="cc-doc-debe-a-nombre">{cuentaImprimir.titular_nombre || titularNombre}</span><br />
                                OCC {cuentaImprimir.titular_cedula || titularCedula}
                            </div>

                            <div className="cc-doc-suma-text">
                                La suma de <strong>{numeroALetras(cuentaImprimir.total || totalGeneral)} MCTE ({formatCOP(cuentaImprimir.total || totalGeneral)})</strong> por <span className="cc-doc-highlight">{cuentaImprimir.concepto_servicio || conceptoServicio}</span>
                            </div>

                            <table className="cc-doc-table">
                                <thead>
                                    <tr>
                                        <th>ITEM</th>
                                        <th>OFICINA</th>
                                        <th>FECHA INICO</th>
                                        <th>FECHA FINAL</th>
                                        <th>No TECNICOS</th>
                                        <th>VALOR DIARIO</th>
                                        <th>VALOR TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(typeof cuentaImprimir.items === 'string' ? JSON.parse(cuentaImprimir.items) : (cuentaImprimir.items || items)).map((it, idx) => (
                                        <tr key={idx}>
                                            <td>{idx + 1}</td>
                                            <td>{it.oficina}</td>
                                            <td>{it.fecha_inicio}</td>
                                            <td>{it.fecha_fin}</td>
                                            <td>{it.num_tecnicos}</td>
                                            <td>{formatCOP(it.valor_diario)}</td>
                                            <td>{formatCOP(it.valor_total)}</td>
                                        </tr>
                                    ))}
                                    <tr className="total-row">
                                        <td colSpan="6" style={{ textAlign: 'right' }}>TOTAL</td>
                                        <td style={{ backgroundColor: '#FF66CC' }}>{formatCOP(cuentaImprimir.total || totalGeneral)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className="cc-doc-bank-info">
                                Por favor consignar a <strong>{cuentaImprimir.banco || banco}</strong> Cuenta {cuentaImprimir.tipo_cuenta || tipoCuenta} N° <strong>{cuentaImprimir.numero_cuenta || numeroCuenta}</strong> a nombre de <strong>{cuentaImprimir.titular_nombre || titularNombre}</strong> con No CC {cuentaImprimir.titular_cedula || titularCedula}
                            </div>

                            <div className="cc-doc-sign-date">
                                Se firma en {cuentaImprimir.ciudad || ciudad}, a los {getMesDiaAnio(cuentaImprimir.fecha || fecha).dia} días del mes {getMesDiaAnio(cuentaImprimir.fecha || fecha).mes} del {getMesDiaAnio(cuentaImprimir.fecha || fecha).anio}
                            </div>

                            <div className="cc-doc-signature-block">
                                <div>
                                    Cordialmente<br /><br />
                                    <strong>Nombre:</strong> {cuentaImprimir.titular_nombre || titularNombre}<br />
                                    <strong>Cedula:</strong> {cuentaImprimir.titular_cedula || titularCedula}<br />
                                    <strong>Celular:</strong> {cuentaImprimir.titular_celular || titularCelular}
                                </div>
                                <div>
                                    <strong>FIRMA</strong> <span className="cc-doc-signature-line"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </TecnicoLayout>
    );
}
