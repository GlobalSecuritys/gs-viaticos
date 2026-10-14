/**
 * EvaluacionTecnicoMe.jsx
 * Vista de evaluacion AD-FR-35 para el tecnico autenticado.
 * Consulta /evaluaciones-tecnicos/listado y renderiza EvaluacionTecnicoADFR35.
 */
import { useEffect, useState } from "react";
import api from "../services/api";
import { formatApiError } from "../utils/formatError";
import EvaluacionTecnicoADFR35 from "./EvaluacionTecnicoADFR35";

export default function EvaluacionTecnicoMe() {
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [evalSeleccionadaId, setEvalSeleccionadaId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function cargarEvaluaciones() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/evaluaciones-tecnicos/listado");
      setEvaluaciones(data || []);
      if (data && data.length > 0) {
        setEvalSeleccionadaId(data[0].id);
      }
    } catch (err) {
      setError(formatApiError(err, "No se pudieron consultar tus evaluaciones."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarEvaluaciones();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "3rem 1rem", textAlign: "center", color: "#64748b" }}>
        Cargando tu evaluacion de desempeno...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "1rem", borderRadius: "8px", margin: "1rem 0" }}>
        {error}
      </div>
    );
  }

  if (evaluaciones.length === 0) {
    return (
      <div style={{ padding: "3rem 1.5rem", textAlign: "center", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1", margin: "1.5rem 0" }}>
        <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.5rem" }}>📋</span>
        <h3 style={{ margin: "0 0 0.5rem 0", color: "#0f172a", fontSize: "1.1rem", fontWeight: 700 }}>
          Sin evaluacion activa
        </h3>
        <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem", maxWidth: "450px", marginLeft: "auto", marginRight: "auto" }}>
          Aun no tienes una evaluacion de desempeno (AD-FR-35) habilitada para este periodo. La Direccion Administrativa te notificara cuando sea iniciada.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingTop: "0.5rem" }}>
      {evaluaciones.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", background: "#f8fafc", padding: "0.5rem 0.75rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>Periodo:</span>
          {evaluaciones.map((ev) => (
            <button
              key={ev.id}
              type="button"
              onClick={() => setEvalSeleccionadaId(ev.id)}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: "6px",
                border: "1px solid",
                borderColor: evalSeleccionadaId === ev.id ? "#0284c7" : "#cbd5e1",
                background: evalSeleccionadaId === ev.id ? "#e0f2fe" : "white",
                color: evalSeleccionadaId === ev.id ? "#0369a1" : "#334155",
                fontWeight: evalSeleccionadaId === ev.id ? 700 : 500,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              {ev.periodo_nombre}
            </button>
          ))}
        </div>
      )}

      {evalSeleccionadaId && (
        <EvaluacionTecnicoADFR35
          evaluacionId={evalSeleccionadaId}
          onCerrada={cargarEvaluaciones}
        />
      )}
    </div>
  );
}
