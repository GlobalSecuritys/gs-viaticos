import { useAuth } from '../context/AuthContext';
import TalentoHumanoAdmin from './TalentoHumanoAdmin';
import TalentoHumanoTecnico from './TalentoHumanoTecnico';

export default function TalentoHumano() {
    const { user } = useAuth();

    // Yeimy (contable) tiene acceso especial a TalentoHumanoAdmin
    // para poder realizar su autoevaluación de desempeño
    const esYeimyContable = user?.correo?.toLowerCase() === 'secretaria@gsbsecurity.com';

    if (user?.rol === 'admin' || user?.rol === 'superadmin' || esYeimyContable) {
        return <TalentoHumanoAdmin />;
    }

    return <TalentoHumanoTecnico />;
}
