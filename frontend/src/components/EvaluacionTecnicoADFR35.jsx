/**
 * EvaluacionTecnicoADFR35.jsx
 * Componente para la evaluacion de tecnicos contratistas (AD-FR-35).
 * - Pilar/superadmin : ve todas las capas, puede cerrar.
 * - Evaluadora de capa : ve/llena su capa (viaticos / asistente_oper).
 * - Tecnico : ve/llena su capa "auto".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { formatApiError } from "../utils/formatError";
import { PLANTILLAS_EVALUACION } from "../data/plantillasEvaluacion";
import SeccionCompromisos from "./SeccionCompromisos";
import "./EvaluacionTecnicoADFR35.css";

const PLANTILLA = PLANTILLAS_EVALUACION["tecnico_adfr35"];
const SECCIONES = PLANTILLA?.secciones || [];
const CRITERIOS = SECCIONES.flatMap((s) => s.items.map((it) => it.numero));

const ESCALA = [
  { valor: 4, etiqueta: "MUY BUENO", color: "#059669" },
  { valor: 3, etiqueta: "BUENO", color: "#0284c7" },
  { valor: 2, etiqueta: "ACEPTABLE", color: "#d97706" },
  { valor: 1, etiqueta: "DEFICIENTE", color: "#dc2626" },
  { valor: "N/A", etiqueta: "N/A", color: "#6b7280" },
];

const CAPAS_META = {
  auto: { etiqueta: "Autoevaluacion", icon: "👤", color: "#7c3aed" },
  viaticos: { etiqueta: "Viaticos", icon: "💼", color: "#0284c7" },
  asistente_oper: { etiqueta: "Asistente Oper.", icon: "⚙️", color: "#d97706" },
};

const ESTADO_BADGE_MAP = {
  pendiente: { label: "Pendiente", cls: "etfr-badge--pendiente" },
  en_evaluacion: { label: "En evaluacion", cls: "etfr-badge--progreso" },
  listo_para_cierre: { label: "Listo para cierre", cls: "etfr-badge--listo" },
  completado: { label: "Completado ✓", cls: "etfr-badge--completado" },
  borrador: { label: "Borrador", cls: "etfr-badge--borrador" },
  enviado: { label: "Enviado ✓", cls: "etfr-badge--enviado" },
};

function BadgeEstado({ estado }) {
  const meta = ESTADO_BADGE_MAP[estado] || { label: estado, cls: "" };
  return <span className={`etfr-badge ${meta.cls}`}>{meta.label}</span>;
}

function fmtCal(v) { return v == null ? "—" : Number(v).toFixed(2); }
function fmtPct(v) { return v == null ? "—" : (v * 100).toFixed(1) + "%"; }

/* ───── CapaForm ───── */
function CapaForm({ evaluacionId, capa, capaData, puedeEditar, onUpdated, readOnly }) {
  const [respuestas, setRespuestas] = useState({});
  const [observacion, setObservacion] = useState("");
  const [version, setVersion] = useState(1);
  const [guardando, setGuardando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errCapa, setErrCapa] = useState("");
  const [ok, setOk] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    if (capaData) {
      setRespuestas(capaData.respuestas || {});
      setObservacion(capaData.observacion || "");
      setVersion(capaData.version || 1);
    }
  }, [capaData?.id, capaData?.version]);

  const estaEnviada = capaData?.estado === "enviado";
  const disabled = !puedeEditar || estaEnviada || readOnly;

  function setValor(crit, val) {
    const nv = { ...respuestas, [crit]: val };
    setRespuestas(nv);
    setErrCapa("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => guardar(false, nv), 2000);
  }

  async function guardar(mostrarOk = true, respAct = null) {
    if (disabled) return;
    setGuardando(true);
    try {
      const { data } = await api.put(
        `/evaluaciones-tecnicos/evaluacion/${evaluacionId}/capa/${capa}`,
        { respuestas: respAct || respuestas, observacion, version }
      );
      setVersion(data.version);
      if (mostrarOk) { setOk("Borrador guardado ✓"); setTimeout(() => setOk(""), 2500); }
      onUpdated?.();
    } catch (e) {
      if (e?.response?.status === 409)
        setErrCapa("⚠️ Conflicto de concurrencia. Recarga la pagina.");
      else setErrCapa(formatApiError(e, "No se pudo guardar."));
    } finally { setGuardando(false); }
  }

  async function enviar() {
    const falt = CRITERIOS.filter((c) => respuestas[c] == null || String(respuestas[c]).trim() === "");
    if (falt.length) { setErrCapa(`Faltan: ${falt.join(", ")}`); return; }
    const nums = CRITERIOS.filter((c) => {
      const v = String(respuestas[c]).toUpperCase().trim();
      return v !== "N/A" && v !== "NA";
    });
    if (!nums.length) { setErrCapa("Al menos un criterio debe tener valor numerico."); return; }
    if (!window.confirm(`¿Confirma enviar la capa "${CAPAS_META[capa]?.etiqueta}"? Esta accion es irreversible.`)) return;
    setEnviando(true);
    try {
      await api.post(
        `/evaluaciones-tecnicos/evaluacion/${evaluacionId}/capa/${capa}/enviar`,
        { respuestas, observacion, version }
      );
      setOk("¡Capa enviada exitosamente!");
      onUpdated?.();
    } catch (e) {
      if (e?.response?.status === 409)
        setErrCapa("⚠️ Conflicto: la capa fue modificada. Recarga e intenta de nuevo.");
      else setErrCapa(formatApiError(e, "No se pudo enviar."));
    } finally { setEnviando(false); }
  }

  const promLocal = useMemo(() => {
    const ns = CRITERIOS
      .map((c) => respuestas[c])
      .filter((v) => v != null && String(v).toUpperCase() !== "N/A" && !isNaN(Number(v)))
      .map(Number);
    return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
  }, [respuestas]);

  const meta = CAPAS_META[capa];

  return (
    <div className="etfr-capa-form">
      <div className="etfr-capa-form__header" style={{ borderLeftColor: meta?.color }}>
        <div className="etfr-capa-form__title">
          <span style={{ fontSize: "1.25rem" }}>{meta?.icon}</span>
          <span>{meta?.etiqueta}</span>
          <BadgeEstado estado={capaData?.estado || "borrador"} />
          {capaData?.enviado_en && (
            <span className="etfr-capa-form__enviado-info">
              Enviado por {capaData.enviado_por_nombre || "?"} el{" "}
              {new Date(capaData.enviado_en).toLocaleDateString("es-CO")}
            </span>
          )}
        </div>
        {promLocal != null && (
          <div className="etfr-capa-form__prom">
            Promedio parcial: <strong>{fmtCal(promLocal)}</strong>/4
          </div>
        )}
      </div>

      {/* Escala */}
      <div className="etfr-escala-row">
        {ESCALA.map((e) => (
          <span key={String(e.valor)} className="etfr-escala-item" style={{ borderColor: e.color, color: e.color }}>
            <strong>{e.valor}</strong> = {e.etiqueta}
          </span>
        ))}
      </div>

      {/* Secciones */}
      {SECCIONES.map((sec) => (
        <div key={sec.numero} className="etfr-seccion-bloque">
          <div className="etfr-seccion-titulo">{sec.titulo}</div>
          <div className="etfr-items-grid">
            {sec.items.map((it) => {
              const val = respuestas[it.numero];
              return (
                <div key={it.numero} className={`etfr-item-row${val != null ? " etfr-item-row--calificado" : ""}`}>
                  <div className="etfr-item-numero">{it.numero}</div>
                  <div className="etfr-item-texto">{it.texto}</div>
                  <div className="etfr-item-opciones">
                    {ESCALA.map((e) => {
                      const sel = String(val) === String(e.valor);
                      return (
                        <button
                          key={String(e.valor)}
                          type="button"
                          disabled={disabled}
                          title={e.etiqueta}
                          onClick={() => !disabled && setValor(it.numero, e.valor)}
                          className={`etfr-opt-btn${sel ? " etfr-opt-btn--sel" : ""}`}
                          style={sel ? { background: e.color, borderColor: e.color, color: "#fff" } : {}}
                        >
                          {e.valor}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Observacion */}
      <div className="etfr-obs-row">
        <label className="etfr-obs-label">Observacion de la capa (opcional):</label>
        <textarea
          className="etfr-obs-textarea"
          rows={3}
          disabled={disabled}
          value={observacion}
          onChange={(e) => { setObservacion(e.target.value); setErrCapa(""); }}
          placeholder="Observaciones adicionales para esta capa..."
        />
      </div>

      {!disabled && (
        <div className="etfr-capa-actions">
          <button type="button" className="etfr-btn etfr-btn--secondary" disabled={guardando} onClick={() => guardar(true)}>
            {guardando ? "Guardando..." : "💾 Guardar borrador"}
          </button>
          <button type="button" className="etfr-btn etfr-btn--primary" disabled={enviando} onClick={enviar}>
            {enviando ? "Enviando..." : "✅ Enviar capa"}
          </button>
        </div>
      )}
      {ok && <div className="etfr-feedback etfr-feedback--ok">{ok}</div>}
      {errCapa && <div className="etfr-feedback etfr-feedback--err">{errCapa}</div>}
    </div>
  );
}

/* ───── ResumenPanel ───── */
function ResumenPanel({ resumen }) {
  if (!resumen) return null;
  const nivelColor =
    resumen.nivel === "MUY BUENO" ? "#059669"
    : resumen.nivel === "BUENO" ? "#0284c7"
    : resumen.nivel === "ACEPTABLE" ? "#d97706"
    : "#dc2626";
  const aprueba = resumen.resultado === "APRUEBA";
  return (
    <div className="etfr-resumen-panel">
      <div className="etfr-resumen-header">
        <span style={{ fontSize: "1.5rem" }}>📊</span>
        <div>
          <div className="etfr-resumen-title">Resultado Final de la Evaluacion</div>
          <div className="etfr-resumen-sub">
            Cerrado el {resumen.cerrado_en ? new Date(resumen.cerrado_en).toLocaleDateString("es-CO") : "?"}
            {resumen.cerrado_por_nombre ? ` por ${resumen.cerrado_por_nombre}` : ""}
          </div>
        </div>
        <span className={`etfr-resultado-badge ${aprueba ? "etfr-resultado-badge--aprueba" : "etfr-resultado-badge--no-aprueba"}`}>
          {resumen.resultado || "—"}
        </span>
      </div>
      <div className="etfr-resumen-grid">
        <div className="etfr-resumen-card">
          <div className="etfr-resumen-card-label">Autoevaluacion (AUTO)</div>
          <div className="etfr-resumen-card-val">{fmtCal(resumen.calificacion_auto)}</div>
        </div>
        <div className="etfr-resumen-card">
          <div className="etfr-resumen-card-label">Viaticos</div>
          <div className="etfr-resumen-card-val">{fmtCal(resumen.calificacion_viaticos)}</div>
        </div>
        <div className="etfr-resumen-card">
          <div className="etfr-resumen-card-label">Asistente Oper.</div>
          <div className="etfr-resumen-card-val">{fmtCal(resumen.calificacion_asistente_oper)}</div>
        </div>
        <div className="etfr-resumen-card etfr-resumen-card--final">
          <div className="etfr-resumen-card-label">Calificacion Final</div>
          <div className="etfr-resumen-card-val etfr-resumen-card-val--big">{fmtCal(resumen.calificacion_final)}</div>
          <div className="etfr-resumen-card-sub">Porcentaje: {fmtPct(resumen.porcentaje)}</div>
        </div>
        <div className="etfr-resumen-card etfr-resumen-card--nivel" style={{ borderColor: nivelColor }}>
          <div className="etfr-resumen-card-label">Nivel de Desempeno</div>
          <div className="etfr-resumen-card-val" style={{ color: nivelColor }}>{resumen.nivel}</div>
        </div>
      </div>
      {resumen.observacion_final && (
        <div className="etfr-resumen-obs">
          <div className="etfr-resumen-obs-label">Observacion Final (Direccion Administrativa):</div>
          <div className="etfr-resumen-obs-text">{resumen.observacion_final}</div>
        </div>
      )}
    </div>
  );
}

/* ───── Componente principal ───── */
export default function EvaluacionTecnicoADFR35({ evaluacionId, onCerrada }) {
  const { user } = useAuth();
  const esPilarAdmin =
    user?.correo?.toLowerCase() === "pilaradmin@gsbank.com" || user?.rol === "superadmin";

  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [capaActiva, setCapaActiva] = useState(null);
  const [mostrarCierre, setMostrarCierre] = useState(false);
  const [obsCierre, setObsCierre] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [errCierre, setErrCierre] = useState("");
  const [okCierre, setOkCierre] = useState("");

  const cargar = useCallback(async () => {
    if (!evaluacionId) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/evaluaciones-tecnicos/evaluacion/${evaluacionId}`);
      setDetalle(data);
      setCapaActiva((prev) => {
        if (prev && Object.keys(data.capas || {}).includes(prev)) return prev;
        return (data.puede_editar_capas || [])[0] || Object.keys(data.capas || {})[0] || "auto";
      });
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar la evaluacion."));
    } finally {
      setLoading(false);
    }
  }, [evaluacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleCerrar() {
    if (!obsCierre.trim() || obsCierre.trim().length < 5) {
      setErrCierre("La observacion final es obligatoria (minimo 5 caracteres).");
      return;
    }
    setCerrando(true);
    setErrCierre("");
    try {
      await api.post(`/evaluaciones-tecnicos/evaluacion/${evaluacionId}/cerrar`, {
        observacion_final: obsCierre.trim(),
      });
      setOkCierre("✅ Evaluacion cerrada exitosamente.");
      setMostrarCierre(false);
      onCerrada?.();
      await cargar();
    } catch (e) {
      setErrCierre(formatApiError(e, "No se pudo cerrar la evaluacion."));
    } finally {
      setCerrando(false);
    }
  }

  if (!evaluacionId) return (
    <div className="etfr-empty">
      <span style={{ fontSize: "2.5rem" }}>🔍</span>
      <p>Seleccione una evaluacion del listado.</p>
    </div>
  );
  if (loading) return <div className="etfr-loading">Cargando evaluacion...</div>;
  if (error) return <div className="etfr-error">{error}</div>;
  if (!detalle) return null;

  const { estado, tecnico_nombre, tecnico_cedula, cargo, periodo_nombre, fecha, capas = {}, resumen, puede_editar_capas = [] } = detalle;
  const estaCompletada = estado === "completado";
  const listaParaCierre = estado === "listo_para_cierre";
  const capsDisp = Object.keys(capas);

  return (
    <div className="etfr-root">
      {/* HEADER */}
      <div className="etfr-eval-header">
        <div className="etfr-eval-info">
          <div className="etfr-eval-nombre">{tecnico_nombre}</div>
          <div className="etfr-eval-meta">
            <span>📋 {cargo || "TECNICO CONTRATISTA"}</span>
            {tecnico_cedula && <span>🪪 CC {tecnico_cedula}</span>}
            {periodo_nombre && <span>📅 {periodo_nombre}</span>}
            {fecha && <span>🗓 {new Date(fecha + "T12:00:00").toLocaleDateString("es-CO")}</span>}
          </div>
        </div>
        <div className="etfr-eval-estado-wrap">
          <BadgeEstado estado={estado} />
          {estaCompletada && (
            <button
              type="button"
              className="etfr-btn etfr-btn--secondary"
              onClick={() => {
                import("../utils/pdfEvaluacionTecnico").then((m) => {
                  m.generarPdfEvaluacionTecnico({ detalle });
                });
              }}
              title="Descargar Formato Individual Oficial AD-FR-35 en PDF"
            >
              📄 Descargar PDF
            </button>
          )}
          {esPilarAdmin && !estaCompletada && listaParaCierre && (
            <button type="button" className="etfr-btn etfr-btn--danger" onClick={() => setMostrarCierre(true)}>
              🔒 Cerrar evaluacion
            </button>
          )}
        </div>
      </div>

      {okCierre && <div className="etfr-feedback etfr-feedback--ok" style={{ marginBottom: "1rem" }}>{okCierre}</div>}

      {/* MODAL CIERRE */}
      {mostrarCierre && (
        <div className="etfr-modal-overlay" onClick={() => setMostrarCierre(false)}>
          <div className="etfr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="etfr-modal-header">
              <span style={{ fontSize: "1.3rem" }}>🔒</span>
              <div>
                <div className="etfr-modal-title">Cerrar Evaluacion Tecnica</div>
                <div className="etfr-modal-sub">Calculara el resultado final y marcara la evaluacion como completada.</div>
              </div>
              <button className="etfr-modal-close" onClick={() => setMostrarCierre(false)}>×</button>
            </div>
            <label className="etfr-obs-label" style={{ marginTop: "1rem", display: "block" }}>
              Observacion Final de la Direccion Administrativa *
            </label>
            <textarea
              className="etfr-obs-textarea"
              rows={4}
              value={obsCierre}
              onChange={(e) => { setObsCierre(e.target.value); setErrCierre(""); }}
              placeholder="Observacion final obligatoria..."
            />
            {errCierre && <div className="etfr-feedback etfr-feedback--err">{errCierre}</div>}
            <div className="etfr-modal-actions">
              <button type="button" className="etfr-btn etfr-btn--secondary" onClick={() => setMostrarCierre(false)}>Cancelar</button>
              <button type="button" className="etfr-btn etfr-btn--danger" disabled={cerrando} onClick={handleCerrar}>
                {cerrando ? "Cerrando..." : "🔒 Confirmar cierre"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESUMEN FINAL */}
      {estaCompletada && resumen && <ResumenPanel resumen={resumen} />}

      {/* TABS DE CAPAS */}
      {capsDisp.length > 0 && (
        <div className="etfr-capas-container">
          <div className="etfr-capas-tabs">
            {capsDisp.map((c) => {
              const meta = CAPAS_META[c];
              const cData = capas[c];
              const esActiva = capaActiva === c;
              const puedeEditar = puede_editar_capas.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  className={`etfr-capa-tab${esActiva ? " etfr-capa-tab--active" : ""}`}
                  style={esActiva ? { borderBottomColor: meta?.color } : {}}
                  onClick={() => setCapaActiva(c)}
                >
                  <span>{meta?.icon}</span>
                  <span>{meta?.etiqueta}</span>
                  <BadgeEstado estado={cData?.estado || "borrador"} />
                  {puedeEditar && !estaCompletada && cData?.estado !== "enviado" && (
                    <span className="etfr-capa-tab__editable">✏️</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="etfr-capa-content">
            {capaActiva && capas[capaActiva] ? (
              <CapaForm
                key={`${evaluacionId}-${capaActiva}-${capas[capaActiva]?.version}`}
                evaluacionId={evaluacionId}
                capa={capaActiva}
                capaData={capas[capaActiva]}
                puedeEditar={puede_editar_capas.includes(capaActiva)}
                onUpdated={cargar}
                readOnly={estaCompletada}
              />
            ) : (
              <div className="etfr-capa-no-acceso">
                <span style={{ fontSize: "1.5rem" }}>🔒</span>
                <p>No tiene acceso a esta capa.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {capsDisp.length === 0 && (
        <div className="etfr-empty">
          <span style={{ fontSize: "2rem" }}>⏳</span>
          <p>No hay capas visibles para esta evaluacion.</p>
        </div>
      )}

      {/* COMPROMISOS (solo completado + pilar) */}
      {estaCompletada && esPilarAdmin && (
        <div className="etfr-compromisos-wrap">
          <SeccionCompromisos evaluacionId={evaluacionId} readOnly={false} key={`comp-${evaluacionId}`} />
        </div>
      )}
    </div>
  );
}
