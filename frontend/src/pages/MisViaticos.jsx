import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './MisViaticos.css';
import ModalEvidencia from '../components/ModalEvidencia';

const LABEL_TIPO = {
  alimentacion: 'Alimentación',
  transporte: 'Transporte',
  hotel: 'Hotel',
  peajes: 'Peajes',
  parqueadero: 'Parqueadero',
  otros: 'Otros',
};

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export default function MisViaticos() {
  const navigate = useNavigate();
  const [viaticos, setViaticos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);

  useEffect(() => {
    async function fetchViaticos() {
      try {
        const { data } = await api.get('/viaticos');
        setViaticos(data);
      } catch {
        setError('No se pudieron cargar los viáticos. Intente nuevamente.');
      } finally {
        setLoading(false);
      }
    }
    fetchViaticos();
  }, []);

  return (
    <div className="mv-root">
      <header className="form-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', padding: '1.8rem 2rem 1.4rem', background: '#0d1520', borderBottom: '1px solid #1a2e47' }}>
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          ← Volver
        </button>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#e2eaf5', margin: '0 0 0.2rem' }}>
            Mis Viáticos
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#4a6a8a', margin: 0 }}>
            Historial de gastos operativos registrados
          </p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn-nuevo" onClick={() => navigate('/nuevo-viatico')}>
            + Nuevo Viático
          </button>
        </div>
      </header>

      <div className="mv-body">
        {loading && (
          <div className="mv-loading">
            <div className="mv-spinner" />
            <span>Cargando viáticos…</span>
          </div>
        )}

        {error && (
          <div className="form-error" role="alert">
            <span>⚠</span> {error}
          </div>
        )}

        {!loading && !error && viaticos.length === 0 && (
          <div className="mv-empty">
            <div className="mv-empty-icon">📋</div>
            <p>No tienes viáticos registrados aún.</p>
            <button className="btn-primary" onClick={() => navigate('/nuevo-viatico')}>
              Registrar primer viático
            </button>
          </div>
        )}

        {!loading && viaticos.length > 0 && (
          <div className="mv-table-wrap">
            <table className="mv-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Ciudad</th>
                  <th>OT</th>
                  <th>Tipo de Gasto</th>
                  <th className="text-right">Valor</th>
                  <th className="text-center">Evidencia</th>
                  <th className="text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {viaticos.map((v) => (
                  <tr key={v.id}>
                    <td className="td-date">{formatDate(v.fecha)}</td>
                    <td className="td-main">{v.cliente}</td>
                    <td>{v.ciudad}</td>
                    <td className="td-ot">{v.ot}</td>
                    <td>
                      <span className="badge-tipo">{LABEL_TIPO[v.tipo_gasto] || v.tipo_gasto}</span>
                    </td>
                    <td className="text-right td-valor">{formatCOP(v.valor)}</td>
                    <td className="text-center">
                      {v.evidencias?.length > 0 ? (
                        <button
                          onClick={() => setSeleccionado(v)}
                          className="badge-evidencia"
                          style={{ cursor: 'pointer' }}
                        >
                          📎 Ver evidencia
                        </button>
                      ) : (
                        <span className="badge-evidencia badge-evidencia--vacio">
                          Sin fotos
                        </span>
                      )}
                    </td>
                    <td className="text-center">
                      <span className={`badge-estado badge-estado--${v.estado}`}>
                        {v.estado.charAt(0).toUpperCase() + v.estado.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {seleccionado && (
        <ModalEvidencia
          viatico={seleccionado}
          onClose={() => setSeleccionado(null)}
          soloLectura={true}
        />
      )}
    </div>
  );
}
