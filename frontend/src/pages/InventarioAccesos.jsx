import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatApiError } from '../utils/formatError';
import {
    NIVELES_ENTIDAD,
    establecerAccesoInventario,
    etiquetaEntidad,
    listarAccesosInventario,
    listarEmpresas,
} from '../services/inventario';
// Reutiliza los inputs y alertas del módulo y el botón volver de la navegación.
import './Inventario.css';
import './InventarioNavegacion.css';
import './InventarioAccesos.css';

/**
 * Accesos por entidad del inventario (pantalla exclusiva de la cuenta Master).
 *
 * Define qué empresa/tarjeta ve cada usuario y con qué nivel. Es una tabla
 * aparte (inventario_usuarios_asignados): NO toca el Mapa de Procesos SGC ni
 * sus "Accesos por Proceso", que siguen gobernando la entrada al módulo.
 *
 * Mientras un usuario no tenga ninguna entidad definida aquí conserva el acceso
 * plano anterior; en cuanto se le fija la primera queda restringido a las suyas.
 * Por eso "Sin acceso" se guarda como tal en vez de borrar la fila.
 */
export default function InventarioAccesos() {
    const navigate = useNavigate();

    const [empresas, setEmpresas] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');
    const [guardando, setGuardando] = useState(null);
    const [busqueda, setBusqueda] = useState('');

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const [emp, usr] = await Promise.all([listarEmpresas(), listarAccesosInventario()]);
            setEmpresas(emp);
            setUsuarios(usr);
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudieron cargar los accesos de inventario.'));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        cargar();
    }, [cargar]);

    // Todas las entidades en una lista plana: las tarjetas de Global, su
    // inventario general, y cada unión temporal.
    const entidades = useMemo(() => {
        const lista = [];
        for (const empresa of empresas) {
            if (empresa.tipo === 'global') {
                for (const cliente of empresa.clientes || []) {
                    lista.push({
                        clave: `${empresa.id}:${cliente.id}`,
                        empresaId: empresa.id,
                        clienteId: cliente.id,
                        label: etiquetaEntidad(empresa.nombre, cliente.nombre),
                        corto: cliente.nombre,
                    });
                }
                lista.push({
                    clave: `${empresa.id}:`,
                    empresaId: empresa.id,
                    clienteId: null,
                    label: `${empresa.nombre} · Inventario general`,
                    corto: 'General',
                });
            } else {
                lista.push({
                    clave: `${empresa.id}:`,
                    empresaId: empresa.id,
                    clienteId: null,
                    label: empresa.nombre,
                    corto: empresa.nombre,
                });
            }
        }
        return lista;
    }, [empresas]);

    const usuariosFiltrados = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return usuarios;
        return usuarios.filter(
            (u) => u.nombre.toLowerCase().includes(q) || u.correo.toLowerCase().includes(q)
        );
    }, [usuarios, busqueda]);

    function nivelActual(usuario, entidad) {
        if (usuario.acceso_total) return 'admin';
        const acceso = usuario.accesos.find(
            (a) => a.empresa_id === entidad.empresaId && (a.cliente_id || null) === entidad.clienteId
        );
        return acceso?.nivel || 'ninguno';
    }

    async function cambiarNivel(usuario, entidad, nivel) {
        const clave = `${usuario.usuario_id}:${entidad.clave}`;
        setGuardando(clave);
        setError('');
        try {
            const accesos = await establecerAccesoInventario({
                usuarioId: usuario.usuario_id,
                empresaId: entidad.empresaId,
                clienteId: entidad.clienteId,
                nivel,
            });
            setUsuarios((prev) =>
                prev.map((u) => (u.usuario_id === usuario.usuario_id ? { ...u, accesos } : u))
            );
            setFeedback(`${usuario.nombre} · ${entidad.label}: ${nivel}.`);
            setTimeout(() => setFeedback(''), 3500);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo actualizar el acceso.'));
        } finally {
            setGuardando(null);
        }
    }

    return (
        <div className="sgc-invacc">
            <header className="sgc-invacc-header">
                <button
                    type="button"
                    className="sgc-invnav-volver"
                    onClick={() => navigate('/inventario')}
                >
                    ← Volver
                </button>
                <div>
                    <h1 className="sgc-invacc-title">Accesos de Inventario</h1>
                    <p className="sgc-invacc-subtitle">
                        Define qué empresa o tarjeta ve cada usuario y con qué nivel. No afecta al
                        Mapa de Procesos SGC.
                    </p>
                </div>
            </header>

            {feedback && <div className="sgc-inv-alerta sgc-inv-alerta--ok">{feedback}</div>}
            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            <p className="sgc-invacc-nota">
                Un usuario sin ninguna entidad definida aquí conserva el acceso que tenía antes
                (el de su nivel en el proceso IN). En cuanto se le fija la primera entidad queda
                restringido a las que aparezcan en esta tabla, por eso «Sin acceso» también se
                guarda.
            </p>

            <input
                type="search"
                className="sgc-inv-input sgc-invacc-buscador"
                placeholder="Buscar por nombre o correo…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
            />

            {cargando ? (
                <p className="sgc-invacc-vacio">Cargando…</p>
            ) : (
                <div className="sgc-invacc-tabla-wrap">
                    <table className="sgc-invacc-tabla">
                        <thead>
                            <tr>
                                <th>Usuario</th>
                                {entidades.map((ent) => (
                                    <th key={ent.clave} title={ent.label}>
                                        {ent.corto}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {usuariosFiltrados.map((u) => (
                                <tr key={u.usuario_id}>
                                    <td className="sgc-invacc-usuario">
                                        <strong>{u.nombre}</strong>
                                        <span>{u.correo}</span>
                                        {u.acceso_total && (
                                            <span className="sgc-invacc-badge">Acceso total</span>
                                        )}
                                    </td>
                                    {entidades.map((ent) => {
                                        const clave = `${u.usuario_id}:${ent.clave}`;
                                        return (
                                            <td key={ent.clave}>
                                                <select
                                                    className="sgc-inv-input sgc-inv-input--select sgc-invacc-select"
                                                    value={nivelActual(u, ent)}
                                                    onChange={(e) =>
                                                        cambiarNivel(u, ent, e.target.value)
                                                    }
                                                    disabled={u.acceso_total || guardando === clave}
                                                    title={
                                                        u.acceso_total
                                                            ? 'Administrador o Master: entra a todas las entidades'
                                                            : ent.label
                                                    }
                                                >
                                                    {NIVELES_ENTIDAD.map((n) => (
                                                        <option key={n.valor} value={n.valor}>
                                                            {n.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {usuariosFiltrados.length === 0 && (
                        <p className="sgc-invacc-vacio">Ningún usuario coincide con la búsqueda.</p>
                    )}
                </div>
            )}
        </div>
    );
}
