import DocumentoCuentaCobro from './DocumentoCuentaCobro';
import './ModalCuentaCobro.css';

export default function ModalCuentaCobro({ cuenta, archivoUrl, onClose }) {
    if (!cuenta && !archivoUrl) return null;

    const esPdf = archivoUrl?.toLowerCase().endsWith('.pdf') || archivoUrl?.includes('/raw/') || false;

    function handlePrint() {
        window.print();
    }

    return (
        <div className="mcc-overlay" onClick={onClose}>
            <div className="mcc-modal" onClick={(e) => e.stopPropagation()}>
                <div className="mcc-header no-print">
                    <div className="mcc-header-info">
                        <span className="mcc-header-icon">💵</span>
                        <div>
                            <h3 className="mcc-header-title">
                                {cuenta?.consecutivo ? `Cuenta de Cobro No. ${cuenta.consecutivo}` : 'Cuenta de Cobro Digital'}
                            </h3>
                            <span className="mcc-header-sub">
                                Formato Oficial y Soporte del Técnico
                            </span>
                        </div>
                    </div>
                    <div className="mcc-header-actions">
                        {cuenta && (
                            <button className="mcc-btn-print" onClick={handlePrint}>
                                🖨️ Imprimir / PDF
                            </button>
                        )}
                        {archivoUrl && (
                            <a
                                href={archivoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mcc-btn-download"
                            >
                                📥 Abrir original
                            </a>
                        )}
                        <button className="mcc-btn-close" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="mcc-body">
                    {cuenta ? (
                        <div className="mcc-doc-wrapper">
                            <DocumentoCuentaCobro cuenta={cuenta} />
                        </div>
                    ) : (
                        <div className="mcc-file-viewer">
                            {esPdf ? (
                                <iframe
                                    src={archivoUrl}
                                    title="Cuenta de Cobro PDF"
                                    className="mcc-iframe"
                                />
                            ) : (
                                <div className="mcc-img-wrapper">
                                    <img src={archivoUrl} alt="Cuenta de Cobro Digital" className="mcc-img" />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
