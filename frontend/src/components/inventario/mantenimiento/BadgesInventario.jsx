import React from 'react';
import { etiquetaEstado } from '../../../services/inventario';

/**
 * Badges de estado y tipo para el módulo de Inventario Mantenimiento.
 * Colores consistentes y legibles con tokens del sistema.
 */
export default function BadgesInventario({ tipo, estado, etiqueta, cantidad, className = '' }) {
    let texto = etiqueta;
    let estiloClase = '';

    // 1. Tipos de movimiento o posesión
    if (tipo === 'en_poder' || tipo === 'custodia') {
        texto = texto || 'En poder de técnico';
        estiloClase = 'inv-badge--en-poder';
    } else if (tipo === 'salida' || tipo === 'despacho') {
        texto = texto || 'Salida';
        estiloClase = 'inv-badge--salida';
    } else if (tipo === 'prestamo') {
        texto = texto || 'Préstamo';
        estiloClase = 'inv-badge--prestamo';
    } else if (tipo === 'venta') {
        texto = texto || 'Venta';
        estiloClase = 'inv-badge--venta';
    } else if (tipo === 'stock') {
        texto = texto || (cantidad !== undefined ? `${cantidad} en stock` : 'En stock');
        estiloClase = cantidad === 0 ? 'inv-badge--sin-stock' : 'inv-badge--stock';
    }

    // 2. Estados de despacho
    if (estado) {
        const estNormalizado = estado === 'dañado' ? 'danado' : estado;
        texto = texto || etiquetaEstado(estado);
        estiloClase = `inv-badge--estado-${estNormalizado}`;
    }

    if (!texto) return null;

    return (
        <span className={`inv-badge ${estiloClase} ${className}`}>
            {texto}
            {cantidad !== undefined && tipo !== 'stock' && (
                <strong className="inv-badge-qty">({cantidad})</strong>
            )}
        </span>
    );
}

export function BadgeStock({ cantidad }) {
    if (cantidad === 0) {
        return <span className="inv-badge inv-badge--sin-stock">Sin stock (0)</span>;
    }
    return <span className="inv-badge inv-badge--stock">{cantidad} en stock</span>;
}
