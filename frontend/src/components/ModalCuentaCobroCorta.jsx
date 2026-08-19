import { useEffect, useState } from 'react';
import api from '../services/api';
import { formatMiles, limpiarNumero } from '../utils/personal';
import './ModalCuentaCobroCorta.css';

function getFechaActualISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export default function ModalCuentaCobroCorta({
    isOpen,
    onClose,
    onConfirm,
    gasto,
    asignacion,
    user,
    fechaSeleccionada,
    initialData = null,
}) {
    // 4 campos editables por el técnico
    const [celular, setCelular] = useState('');
    const [numeroCuenta, setNumeroCuenta] = useState('');
    const [valor, setValor] = useState('');
    const [concepto, setConcepto] = useState('');

    // Datos bancarios previos recordados (ocultos)
    const [banco, setBanco] = useState('');
    const [tipoCuenta, setTipoCuenta] = useState('Ahorros');

    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setError('');

        // Cargar datos previos si ya existía cuenta en este gasto
        if (initialData) {
            setCelular(initialData.titular_celular || '');
            setNumeroCuenta(initialData.numero_cuenta || '');
            setValor(initialData.total ? formatMiles(String(initialData.total)) : '');
            setConcepto(initialData.concepto_servicio || '');
            setBanco(initialData.banco || '');
            setTipoCuenta(initialData.tipo_cuenta || 'Ahorros');
            return;
        }

        // Si no hay datos iniciales, pre-cargar valor y concepto del gasto
        const defaultValor = gasto?.valor ? formatMiles(String(gasto.valor)) : '';
        setValor(defaultValor);

        const conceptoBase = gasto?.concepto ? gasto.concepto.toUpperCase() : 'VIÁTICOS Y COMISIÓN';
        const ciudadDestino = asignacion?.ciudad || gasto?.destino || 'SEDE';
        const clienteProyecto = asignacion?.cliente || gasto?.razon_social || '';
        const defaultConcepto = clienteProyecto
            ? `Servicio de ${conceptoBase.toLowerCase()} en ${ciudadDestino} - ${clienteProyecto}`
            : `Servicio de ${conceptoBase.toLowerCase()} en ${ciudadDestino}`;
        setConcepto(defaultConcepto);

        // Consultar última cuenta de cobro previa para pre-cargar banco, cuenta y celular
        let cancel = false;
        api.get('/cuentas-cobro')
            .then((res) => {
                if (!cancel && res.data && res.data.length > 0) {
                    const ultima = res.data[0];
                    if (ultima) {
                        if (ultima.banco) setBanco(ultima.banco);
                        if (ultima.tipo_cuenta) setTipoCuenta(ultima.tipo_cuenta);
                        if (ultima.numero_cuenta) setNumeroCuenta(ultima.numero_cuenta);
                        if (ultima.titular_celular) setCelular(ultima.titular_celular);
                    }
                }
            })
            .catch(() => {});

        return () => {
            cancel = true;
        };
    }, [isOpen, initialData, gasto, asignacion]);

    if (!isOpen) return null;

    function handleValorChange(e) {
        const raw = limpiarNumero(e.target.value);
        setValor(formatMiles(raw));
    }

    function handleGuardar(e) {
        e.preventDefault();
        setError('');

        const valNum = Number(limpiarNumero(valor));
        if (!valNum || valNum <= 0) {
            setError('Ingresa un valor válido mayor a 0.');
            return;
        }

        if (!numeroCuenta.trim()) {
            setError('Ingresa el número de cuenta bancaria.');
            return;
        }

        if (!concepto.trim()) {
            setError('Ingresa el concepto del servicio prestado.');
            return;
        }

        const fechaDoc = getFechaActualISO();
        const ciudadDoc = asignacion?.ciudad || gasto?.destino || 'Bogotá D.C.';
        const fechaGasto = gasto?.fecha || fechaSeleccionada || fechaDoc;

        // Construcción completa del payload de Cuenta de Cobro
        const cuentaCobroData = {
            fecha: fechaDoc,
            ciudad: ciudadDoc,
            tipo_identificacion: 'cedula',
            identificacion: user?.codigo_empleado || user?.cedula || '1000000000',
            concepto_servicio: concepto.trim(),
            items: [
                {
                    oficina: ciudadDoc,
                    fecha_inicio: fechaGasto,
                    fecha_fin: fechaGasto,
                    num_tecnicos: 1,
                    valor_diario: valNum,
                    valor_total: valNum,
                },
            ],
            total: valNum,
            banco: banco.trim() || 'Bancolombia',
            tipo_cuenta: tipoCuenta || 'Ahorros',
            numero_cuenta: numeroCuenta.trim(),
            titular_nombre: user?.nombre || user?.correo || 'Técnico GSB',
            titular_cedula: user?.codigo_empleado || user?.cedula || '1000000000',
            titular_celular: celular.trim() || null,
            autorizacion_datos: true,
        };

        onConfirm(cuentaCobroData);
        onClose();
    }

    return (
        <div className="mccc-overlay" onClick={onClose}>
            <div className="mccc-modal" onClick={(e) => e.stopPropagation()}>
                <div className="mccc-header">
                    <div className="mccc-header-info">
                        <span className="mccc-header-icon">📄</span>
                        <div>
                            <h3 className="mccc-header-title">Cuenta de Cobro del Viático</h3>
                            <p className="mccc-header-sub">
                                {user?.nombre ? `${user.nombre} · ` : ''}
                                {asignacion?.cliente || 'Gasto Operativo'}
                            </p>
                        </div>
                    </div>
                    <button type="button" className="mccc-close-btn" onClick={onClose}>
                        ✕
                    </button>
                </div>

                <form onSubmit={handleGuardar}>
                    <div className="mccc-body">
                        {error && <div className="mccc-error">{error}</div>}

                        <div className="mccc-badge-autofill">
                            <span>ℹ️</span>
                            <span>
                                Los datos de titular ({user?.nombre || 'Técnico'}), cédula y ciudad se
                                autocompletan de tu perfil y de la asignación.
                            </span>
                        </div>

                        <div className="mccc-field-row">
                            <div className="mccc-field">
                                <label>Celular de contacto</label>
                                <input
                                    type="tel"
                                    placeholder="Ej: 3101234567"
                                    value={celular}
                                    onChange={(e) => setCelular(e.target.value)}
                                />
                            </div>

                            <div className="mccc-field">
                                <label>No. de cuenta bancaria *</label>
                                <input
                                    type="text"
                                    placeholder="Ej: 1234567890"
                                    value={numeroCuenta}
                                    onChange={(e) => setNumeroCuenta(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="mccc-field">
                            <label>Valor *</label>
                            <input
                                type="text"
                                placeholder="$ 0"
                                value={valor}
                                onChange={handleValorChange}
                                required
                            />
                        </div>

                        <div className="mccc-field">
                            <label>Concepto / Servicio prestado *</label>
                            <textarea
                                rows={3}
                                placeholder="Describe el servicio prestado..."
                                value={concepto}
                                onChange={(e) => setConcepto(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="mccc-footer">
                        <button type="button" className="mccc-btn-cancel" onClick={onClose}>
                            Cancelar
                        </button>
                        <button type="submit" className="mccc-btn-confirm">
                            Adjuntar Cuenta de Cobro
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
