import { useAuth } from '../context/AuthContext';
import TalentoHumanoAdmin from './TalentoHumanoAdmin';
import TalentoHumanoTecnico from './TalentoHumanoTecnico';

export default function TalentoHumano() {
    const { user } = useAuth();

    if (user?.rol === 'admin' || user?.rol === 'superadmin') {
        return <TalentoHumanoAdmin />;
    }

    return <TalentoHumanoTecnico />;
}
