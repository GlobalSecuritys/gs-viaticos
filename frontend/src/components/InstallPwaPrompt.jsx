import { useEffect, useState } from 'react';
import './InstallPwaPrompt.css';

export default function InstallPwaPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [esIOS, setEsIOS] = useState(false);
    const [mostrarModalIOS, setMostrarModalIOS] = useState(false);
    const [yaInstalado, setYaInstalado] = useState(false);

    useEffect(() => {
        // Verificar si la app ya está corriendo instalada (standalone mode)
        const isStandalone =
            window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true;

        if (isStandalone) {
            setYaInstalado(true);
            return;
        }

        // Detectar si es iOS (iPhone/iPad)
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
        setEsIOS(isIosDevice);

        // Listener para Chrome/Android/Edge beforeinstallprompt
        function handleBeforeInstallPrompt(e) {
            e.preventDefault();
            setDeferredPrompt(e);
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Listener para cuando se instala exitosamente
        window.addEventListener('appinstalled', () => {
            setYaInstalado(true);
            setDeferredPrompt(null);
        });

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    async function handleInstalar() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const choiceResult = await deferredPrompt.userChoice;
            if (choiceResult.outcome === 'accepted') {
                setYaInstalado(true);
            }
            setDeferredPrompt(null);
        } else if (esIOS) {
            setMostrarModalIOS(true);
        } else {
            // Instrucciones genéricas para navegadores donde no saltó el prompt
            alert('Para instalar la app:\n\n• En Chrome/Edge: Haz clic en los 3 puntos de la esquina (⋮) y selecciona "Instalar aplicación" o "Agregar a pantalla principal".');
        }
    }

    if (yaInstalado) {
        return null; // Si ya está instalada, no mostrar
    }

    return (
        <>
            {/* Botón / Banner de instalación en Header */}
            <div className="pwa-install-pill-wrap">
                <button
                    className="pwa-install-btn"
                    onClick={handleInstalar}
                    title="Instalar GS Viáticos en tu dispositivo"
                >
                    <span className="pwa-install-icon">📲</span>
                    <span className="pwa-install-text">Instalar App</span>
                </button>
            </div>

            {/* Modal instructivo para iPhone / iOS */}
            {mostrarModalIOS && (
                <div className="pwa-ios-modal-overlay" onClick={() => setMostrarModalIOS(false)}>
                    <div className="pwa-ios-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="pwa-ios-close" onClick={() => setMostrarModalIOS(false)}>×</button>

                        <div className="pwa-ios-header">
                            <span className="pwa-ios-app-icon">💼</span>
                            <div>
                                <h3>Instalar GS Viáticos</h3>
                                <p>Sigue estos sencillos pasos en iPhone/iPad:</p>
                            </div>
                        </div>

                        <ol className="pwa-ios-steps">
                            <li>
                                Toca el botón <strong>Compartir</strong> <span className="pwa-share-icon">⬆️</span> en la barra inferior de Safari.
                            </li>
                            <li>
                                Desplázate hacia abajo y selecciona <strong>"Agregar a inicio"</strong> <span className="pwa-add-icon">➕</span>.
                            </li>
                            <li>
                                Toca <strong>"Agregar"</strong> en la esquina superior derecha. ¡Listo!
                            </li>
                        </ol>

                        <button className="pwa-ios-btn-entendido" onClick={() => setMostrarModalIOS(false)}>
                            ¡Entendido!
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
