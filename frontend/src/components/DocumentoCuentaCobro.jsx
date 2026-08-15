import { numeroALetras } from '../utils/numeroALetras';
import './DocumentoCuentaCobro.css';

function formatCOP(val) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(Number(val) || 0);
}

function formatFechaLargaEs(fechaStr) {
    if (!fechaStr) return '';
    const parts = String(fechaStr).split('T')[0].split('-');
    if (parts.length !== 3) return fechaStr;
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    const dia = dateObj.getDate();
    const mes = dateObj.toLocaleString('es-CO', { month: 'long' }).toUpperCase();
    const anio = dateObj.getFullYear();
    return `${dia} ${mes} del ${anio}`;
}

function getMesDiaAnio(fechaStr) {
    if (!fechaStr) return { dia: '', mes: '', anio: '' };
    const parts = String(fechaStr).split('T')[0].split('-');
    if (parts.length !== 3) return { dia: '', mes: '', anio: '' };
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    return {
        dia: dateObj.getDate(),
        mes: dateObj.toLocaleString('es-CO', { month: 'long' }).toUpperCase(),
        anio: dateObj.getFullYear(),
    };
}

export default function DocumentoCuentaCobro({ cuenta, idElemento = 'cc-documento-impresion' }) {
    if (!cuenta) return null;

    const consecutivo = cuenta.consecutivo || `${cuenta.fecha?.split('-')?.[0] || '2026'}-${cuenta.id || '001'}`;
    const items = typeof cuenta.items === 'string' ? JSON.parse(cuenta.items) : (cuenta.items || []);
    const fechaObj = getMesDiaAnio(cuenta.fecha);

    return (
        <div className="cc-document-view" id={idElemento}>
            <div className="cc-doc-header-num">
                CUENTA DE COBRO No: {consecutivo}
            </div>

            <div className="cc-doc-date">
                {formatFechaLargaEs(cuenta.fecha)}
            </div>

            <div className="cc-doc-company">
                GLOBAL SECURITY BANK<br />
                Nit 830 057 616-3
            </div>

            <div className="cc-doc-debe-a">
                Debe a<br />
                <span className="cc-doc-debe-a-nombre">{cuenta.titular_nombre || cuenta.nombre || 'TÉCNICO / PROVEEDOR'}</span><br />
                OCC {cuenta.titular_cedula || cuenta.identificacion || '—'}
            </div>

            <div className="cc-doc-suma-text">
                La suma de <strong>{numeroALetras(cuenta.total || 0)} MCTE ({formatCOP(cuenta.total || 0)})</strong> por <span className="cc-doc-highlight">{cuenta.concepto_servicio || 'Servicio de viáticos y gastos de viaje'}</span>
            </div>

            <table className="cc-doc-table">
                <thead>
                    <tr>
                        <th>ITEM</th>
                        <th>OFICINA</th>
                        <th>FECHA INICIO</th>
                        <th>FECHA FINAL</th>
                        <th>No TECNICOS</th>
                        <th>VALOR DIARIO</th>
                        <th>VALOR TOTAL</th>
                    </tr>
                </thead>
                <tbody>
                    {items.length === 0 ? (
                        <tr>
                            <td>1</td>
                            <td>{cuenta.ciudad || 'SEDE PRINCIPAL'}</td>
                            <td>{cuenta.fecha}</td>
                            <td>{cuenta.fecha}</td>
                            <td>1</td>
                            <td>{formatCOP(cuenta.total || 0)}</td>
                            <td>{formatCOP(cuenta.total || 0)}</td>
                        </tr>
                    ) : (
                        items.map((it, idx) => (
                            <tr key={idx}>
                                <td>{idx + 1}</td>
                                <td>{it.oficina}</td>
                                <td>{it.fecha_inicio}</td>
                                <td>{it.fecha_fin}</td>
                                <td>{it.num_tecnicos}</td>
                                <td>{formatCOP(it.valor_diario)}</td>
                                <td>{formatCOP(it.valor_total)}</td>
                            </tr>
                        ))
                    )}
                    <tr className="total-row">
                        <td colSpan="6" style={{ textAlign: 'right' }}>TOTAL</td>
                        <td style={{ backgroundColor: '#FF66CC' }}>{formatCOP(cuenta.total || 0)}</td>
                    </tr>
                </tbody>
            </table>

            <div className="cc-doc-bank-info">
                Por favor consignar a <strong>{cuenta.banco || 'Banco'}</strong> Cuenta {cuenta.tipo_cuenta || 'Ahorros'} N° <strong>{cuenta.numero_cuenta || '—'}</strong> a nombre de <strong>{cuenta.titular_nombre || cuenta.nombre || '—'}</strong> con No CC {cuenta.titular_cedula || cuenta.identificacion || '—'}
            </div>

            <div className="cc-doc-sign-date">
                Se firma en {cuenta.ciudad || 'Bogotá. D. C.'}, a los {fechaObj.dia} días del mes {fechaObj.mes} del {fechaObj.anio}
            </div>

            <div className="cc-doc-signature-block">
                <div>
                    Cordialmente<br /><br />
                    <strong>Nombre:</strong> {cuenta.titular_nombre || cuenta.nombre || '—'}<br />
                    <strong>Cedula:</strong> {cuenta.titular_cedula || cuenta.identificacion || '—'}<br />
                    <strong>Celular:</strong> {cuenta.titular_celular || '—'}
                </div>
            </div>
        </div>
    );
}
