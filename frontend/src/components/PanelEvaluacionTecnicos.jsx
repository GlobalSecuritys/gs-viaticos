/**
 * PanelEvaluacionTecnicos.jsx
 * Panel de gestion AD-FR-35 para Pilar / superadmin en TalentoHumanoAdmin.
 * Funcionalidades:
 *  - Ver periodos semestrales.
 *  - Abrir nuevo periodo.
 *  - Configurar evaluadoras de capa (viaticos / asistente_oper).
 *  - Listado de evaluaciones del periodo con estados de las 3 capas.
 *  - Seleccionar evaluacion para abrir EvaluacionTecnicoADFR35.
 */
import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { formatApiError } from "../utils/formatError";
import EvaluacionTecnicoADFR35 from "./EvaluacionTecnicoADFR35";
import "./PanelEvaluacionTecnicos.css";

const CAPAS_META = {
  auto: { etiqueta: "AUTO", icon: "👤", color: "#7c3aed" },
  viaticos: { etiqueta: "VIATICOS", icon: "💼", color: "#0284c7" },
  asistente_oper: { etiqueta: "ASIST.OP", icon: "⚙️", color: "#d97706" },
};
const ESTADO_BADGE = {
  pendiente:         { label: "Pendiente",       bg: "#fef9c3", color: "#92400e" },
  en_evaluacion:     { label: "En evaluacion",   bg: "#dbeafe", color: "#1e40af" },
  listo_para_cierre: { label: "Listo cierre",    bg: "#d1fae5", color: "#065f46" },
  completado:        { label: "Completado",      bg: "#7c3aed", color: "#fff" },
  borrador:          { label: "Borrador",        bg: "#f1f5f9", color: "#475569" },
  enviado:           { label: "Enviado",         bg: "#7c3aed", color: "#fff" },
};
function badge(estado) {
  const m = ESTADO_BADGE[estado] || { label: estado, bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{ padding: "0.15rem 0.5rem", borderRadius: "12px", fontSize: "0.68rem", fontWeight: 700, background: m.bg, color: m.color, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}

export default function PanelEvaluacionTecnicos() {
  /* ── Estado ── */
  const [periodos, setPeriodos] = useState([]);
  const [periodoActivo, setPeriodoActivo] = useState(null);
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [configCapas, setConfigCapas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingEvals, setLoadingEvals] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [evalSelId, setEvalSelId] = useState(null);

  /* Nuevo periodo */
  const [mostrarNuevoPeriodo, setMostrarNuevoPeriodo] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [creandoPeriodo, setCreandoPeriodo] = useState(false);

  /* Config capas */
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState({});

  /* Agregar tecnico al periodo */
  const [mostrarAddTecnico, setMostrarAddTecnico] = useState(false);
  const [tecnicoAddId, setTecnicoAddId] = useState("");
  const [addingTecnico, setAddingTecnico] = useState(false);

  /* Vista detalle */
  const [vistaDetalle, setVistaDetalle] = useState(false);

  /* ── Carga inicial ── */
  const cargarPeriodos = useCallback(async () => {
    try {
      const { data } = await api.get("/evaluaciones-tecnicos/periodos");
      setPeriodos(data);
      if (!periodoActivo && data.length > 0) setPeriodoActivo(data[0]);
    } catch (e) { setError(formatApiError(e, "No se pudieron cargar los periodos.")); }
  }, [periodoActivo]);

  const cargarConfigCapas = useCallback(async () => {
    try {
      const { data } = await api.get("/evaluaciones-tecnicos/configuracion-capas");
      setConfigCapas(data);
    } catch (e) { /* silencioso */ }
  }, []);

  const cargarUsuarios = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/usuarios");
      setUsuarios(data.filter((u) => u.activo));
    } catch (e) { /* silencioso */ }
  }, []);

  const cargarEvaluaciones = useCallback(async (pid) => {
    if (!pid) return;
    setLoadingEvals(true);
    try {
      const { data } = await api.get(`/evaluaciones-tecnicos/listado?periodo_id=${pid}`);
      setEvaluaciones(data);
    } catch (e) { setError(formatApiError(e, "No se pudieron cargar las evaluaciones.")); }
    finally { setLoadingEvals(false); }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([cargarPeriodos(), cargarConfigCapas(), cargarUsuarios()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (periodoActivo) cargarEvaluaciones(periodoActivo.id);
  }, [periodoActivo, cargarEvaluaciones]);

  /* ── Handlers ── */
  async function handleCrearPeriodo() {
    if (!nombreNuevo.trim()) { setError("Ingrese un nombre para el periodo."); return; }
    setCreandoPeriodo(true);
    try {
      const { data } = await api.post("/evaluaciones-tecnicos/periodos", { nombre: nombreNuevo.trim() });
      setOk(`✅ Periodo "${data.nombre}" creado con ${data.total_evaluaciones} evaluaciones.`);
      setTimeout(() => setOk(""), 4000);
      setMostrarNuevoPeriodo(false);
      setNombreNuevo("");
      await cargarPeriodos();
      setPeriodoActivo(data);
    } catch (e) { setError(formatApiError(e, "No se pudo crear el periodo.")); }
    finally { setCreandoPeriodo(false); }
  }

  function abrirConfig() {
    const draft = {};
    configCapas.forEach((c) => { draft[c.capa] = c.usuario_id || ""; });
    setConfigDraft(draft);
    setMostrarConfig(true);
  }

  async function handleGuardarConfig() {
    setGuardandoConfig(true);
    setError("");
    try {
      await Promise.all(
        Object.entries(configDraft).map(([capa, uid]) =>
          api.put("/evaluaciones-tecnicos/configuracion-capas", {
            capa,
            usuario_id: uid ? Number(uid) : null,
          })
        )
      );
      await cargarConfigCapas();
      setOk("✅ Configuracion de evaluadoras guardada.");
      setTimeout(() => setOk(""), 3000);
      setMostrarConfig(false);
    } catch (e) { setError(formatApiError(e, "Error al guardar configuracion.")); }
    finally { setGuardandoConfig(false); }
  }

  async function handleAddTecnico() {
    if (!tecnicoAddId || !periodoActivo) return;
    setAddingTecnico(true);
    setError("");
    try {
      await api.post(`/evaluaciones-tecnicos/periodos/${periodoActivo.id}/agregar-tecnico/${tecnicoAddId}`);
      setOk("✅ Tecnico agregado al periodo.");
      setTimeout(() => setOk(""), 3000);
      setMostrarAddTecnico(false);
      setTecnicoAddId("");
      await cargarEvaluaciones(periodoActivo.id);
    } catch (e) { setError(formatApiError(e, "No se pudo agregar el tecnico.")); }
    finally { setAddingTecnico(false); }
  }

  function seleccionarEval(id) {
    setEvalSelId(id);
    setVistaDetalle(true);
  }

  function volverAListado() {
    setVistaDetalle(false);
    cargarEvaluaciones(periodoActivo?.id);
  }

  if (loading) return <div className="petf-loading">Cargando panel de tecnicos...</div>;

  /* ── VISTA DETALLE ── */
  if (vistaDetalle && evalSelId) {
    return (
      <div className="petf-root">
        <div className="petf-back-bar">
          <button type="button" className="petf-back-btn" onClick={volverAListado}>
            ← Volver al listado
          </button>
          <span className="petf-back-title">Evaluacion Tecnica AD-FR-35</span>
        </div>
        <EvaluacionTecnicoADFR35
          evaluacionId={evalSelId}
          onCerrada={() => { cargarEvaluaciones(periodoActivo?.id); }}
        />
      </div>
    );
  }

  /* ── VISTA LISTADO ── */
  const tecnicos = usuarios.filter((u) => u.rol === "tecnico");

  return (
    <div className="petf-root">
      {/* HEADER */}
      <div className="petf-header">
        <div className="petf-header-info">
          <span style={{ fontSize: "1.35rem" }}>🛠️</span>
          <div>
            <div className="petf-header-title">Evaluacion de Tecnicos Contratistas</div>
            <div className="petf-header-sub">AD-FR-35 · Formato de 3 capas (Auto / Viaticos / Asistente Oper.)</div>
          </div>
        </div>
        <div className="petf-header-actions">
          <button type="button" className="petf-btn petf-btn--secondary" onClick={abrirConfig} title="Configurar evaluadoras por capa">
            ⚙️ Configurar evaluadoras
          </button>
          <button type="button" className="petf-btn petf-btn--primary" onClick={() => { setNombreNuevo(""); setMostrarNuevoPeriodo(true); }}>
            + Nuevo periodo
          </button>
        </div>
      </div>

      {error && (
        <div className="petf-feedback petf-feedback--err">
          {error}
          <button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", fontWeight: 700, cursor: "pointer" }}>×</button>
        </div>
      )}
      {ok && <div className="petf-feedback petf-feedback--ok">{ok}</div>}

      {/* PERIODOS */}
      <div className="petf-periodos-bar">
        <span className="petf-periodos-label">Periodo:</span>
        <div className="petf-periodos-chips">
          {periodos.length === 0 ? (
            <span style={{ color: "#94a3b8", fontSize: "0.84rem" }}>Sin periodos. Cree el primero.</span>
          ) : (
            periodos.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`petf-periodo-chip${periodoActivo?.id === p.id ? " petf-periodo-chip--active" : ""}`}
                onClick={() => { setPeriodoActivo(p); setEvalSelId(null); }}
              >
                <span>{p.nombre}</span>
                {p.activo && <span className="petf-periodo-activo-dot" title="Activo" />}
                <span className="petf-periodo-count">{p.total_evaluaciones} tec.</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* CONFIGURACION CAPAS RESUMEN */}
      {configCapas.length > 0 && (
        <div className="petf-config-row">
          {configCapas.map((c) => (
            <div key={c.capa} className="petf-config-chip" style={{ borderLeftColor: CAPAS_META[c.capa]?.color }}>
              <span>{CAPAS_META[c.capa]?.icon}</span>
              <span className="petf-config-capa-label">{CAPAS_META[c.capa]?.etiqueta}:</span>
              <span className="petf-config-usuario">{c.usuario_nombre || <em style={{ color: "#94a3b8" }}>Sin asignar</em>}</span>
            </div>
          ))}
        </div>
      )}

      {/* LISTADO */}
      {periodoActivo ? (
        <>
          <div className="petf-list-header">
            <div className="petf-list-header-left">
              <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.92rem" }}>
                {periodoActivo.nombre}
              </span>
              <span style={{ color: "#64748b", fontSize: "0.8rem" }}>
                — {evaluaciones.length} evaluaciones
              </span>
            </div>
            <button type="button" className="petf-btn petf-btn--secondary" style={{ fontSize: "0.78rem", padding: "0.35rem 0.8rem" }} onClick={() => setMostrarAddTecnico(true)}>
              + Agregar tecnico
            </button>
          </div>

          {loadingEvals ? (
            <div className="petf-loading">Cargando evaluaciones...</div>
          ) : evaluaciones.length === 0 ? (
            <div className="petf-empty">
              <span style={{ fontSize: "2rem" }}>📋</span>
              <p>No hay evaluaciones en este periodo.</p>
            </div>
          ) : (
            <div className="petf-eval-table-wrap">
              <table className="petf-eval-table">
                <thead>
                  <tr>
                    <th>Tecnico</th>
                    <th>Estado general</th>
                    <th style={{ textAlign: "center" }}>AUTO</th>
                    <th style={{ textAlign: "center" }}>VIATICOS</th>
                    <th style={{ textAlign: "center" }}>ASIST.OP</th>
                    <th style={{ textAlign: "center" }}>Calif. final</th>
                    <th style={{ textAlign: "center" }}>Resultado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {evaluaciones.map((ev) => (
                    <tr key={ev.id} className={`petf-eval-row${evalSelId === ev.id ? " petf-eval-row--sel" : ""}`} onClick={() => seleccionarEval(ev.id)}>
                      <td>
                        <div className="petf-tecnico-nombre">{ev.tecnico_nombre}</div>
                        {ev.tecnico_cedula && <div className="petf-tecnico-cedula">CC {ev.tecnico_cedula}</div>}
                      </td>
                      <td>{badge(ev.estado)}</td>
                      <td style={{ textAlign: "center" }}>{badge(ev.estado_auto)}</td>
                      <td style={{ textAlign: "center" }}>{badge(ev.estado_viaticos)}</td>
                      <td style={{ textAlign: "center" }}>{badge(ev.estado_asistente_oper)}</td>
                      <td style={{ textAlign: "center", fontWeight: 700, color: "#0f172a" }}>
                        {ev.calificacion_final != null ? Number(ev.calificacion_final).toFixed(2) : "—"}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {ev.resultado ? (
                          <span style={{ fontWeight: 700, color: ev.resultado === "APRUEBA" ? "#059669" : "#dc2626", fontSize: "0.78rem" }}>
                            {ev.resultado}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="petf-btn petf-btn--ghost"
                          onClick={(e) => { e.stopPropagation(); seleccionarEval(ev.id); }}
                        >
                          Ver →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="petf-empty">
          <span style={{ fontSize: "2.5rem" }}>📅</span>
          <p>Cree un nuevo periodo semestral para comenzar las evaluaciones.</p>
        </div>
      )}

      {/* MODAL NUEVO PERIODO */}
      {mostrarNuevoPeriodo && (
        <div className="petf-modal-overlay" onClick={() => setMostrarNuevoPeriodo(false)}>
          <div className="petf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="petf-modal-header">
              <span style={{ fontSize: "1.3rem" }}>📅</span>
              <div>
                <div className="petf-modal-title">Nuevo Periodo de Evaluacion</div>
                <div className="petf-modal-sub">Se crearan evaluaciones para todos los tecnicos activos.</div>
              </div>
              <button className="petf-modal-close" onClick={() => setMostrarNuevoPeriodo(false)}>×</button>
            </div>
            <label className="petf-modal-label">Nombre del periodo *</label>
            <input
              className="petf-modal-input"
              type="text"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              placeholder="Ej: SEGUNDO SEMESTRE 2026"
            />
            <div className="petf-modal-actions">
              <button type="button" className="petf-btn petf-btn--secondary" onClick={() => setMostrarNuevoPeriodo(false)}>Cancelar</button>
              <button type="button" className="petf-btn petf-btn--primary" disabled={creandoPeriodo} onClick={handleCrearPeriodo}>
                {creandoPeriodo ? "Creando..." : "✅ Crear periodo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIG CAPAS */}
      {mostrarConfig && (
        <div className="petf-modal-overlay" onClick={() => setMostrarConfig(false)}>
          <div className="petf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="petf-modal-header">
              <span style={{ fontSize: "1.3rem" }}>⚙️</span>
              <div>
                <div className="petf-modal-title">Configurar Evaluadoras de Capa</div>
                <div className="petf-modal-sub">Asigne que usuario evalua cada capa.</div>
              </div>
              <button className="petf-modal-close" onClick={() => setMostrarConfig(false)}>×</button>
            </div>
            {["viaticos", "asistente_oper"].map((c) => (
              <div key={c} style={{ marginBottom: "0.85rem" }}>
                <label className="petf-modal-label" style={{ color: CAPAS_META[c]?.color }}>
                  {CAPAS_META[c]?.icon} {c === "viaticos" ? "Evaluadora de Viaticos" : "Evaluadora Asistente Oper."}
                </label>
                <select
                  className="petf-modal-select"
                  value={configDraft[c] || ""}
                  onChange={(e) => setConfigDraft({ ...configDraft, [c]: e.target.value })}
                >
                  <option value="">— Sin asignar —</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre} ({u.correo})</option>
                  ))}
                </select>
              </div>
            ))}
            {error && <div className="petf-feedback petf-feedback--err" style={{ marginBottom: "0.75rem" }}>{error}</div>}
            <div className="petf-modal-actions">
              <button type="button" className="petf-btn petf-btn--secondary" onClick={() => setMostrarConfig(false)}>Cancelar</button>
              <button type="button" className="petf-btn petf-btn--primary" disabled={guardandoConfig} onClick={handleGuardarConfig}>
                {guardandoConfig ? "Guardando..." : "💾 Guardar configuracion"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AGREGAR TECNICO */}
      {mostrarAddTecnico && (
        <div className="petf-modal-overlay" onClick={() => setMostrarAddTecnico(false)}>
          <div className="petf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="petf-modal-header">
              <span style={{ fontSize: "1.3rem" }}>👤</span>
              <div>
                <div className="petf-modal-title">Agregar Tecnico al Periodo</div>
                <div className="petf-modal-sub">El tecnico debe tener rol "tecnico" en el sistema.</div>
              </div>
              <button className="petf-modal-close" onClick={() => setMostrarAddTecnico(false)}>×</button>
            </div>
            <label className="petf-modal-label">Seleccionar tecnico</label>
            <select
              className="petf-modal-select"
              value={tecnicoAddId}
              onChange={(e) => setTecnicoAddId(e.target.value)}
            >
              <option value="">— Seleccione —</option>
              {tecnicos.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre} ({u.correo})</option>
              ))}
            </select>
            {error && <div className="petf-feedback petf-feedback--err" style={{ marginBottom: "0.75rem" }}>{error}</div>}
            <div className="petf-modal-actions">
              <button type="button" className="petf-btn petf-btn--secondary" onClick={() => setMostrarAddTecnico(false)}>Cancelar</button>
              <button type="button" className="petf-btn petf-btn--primary" disabled={addingTecnico || !tecnicoAddId} onClick={handleAddTecnico}>
                {addingTecnico ? "Agregando..." : "✅ Agregar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
