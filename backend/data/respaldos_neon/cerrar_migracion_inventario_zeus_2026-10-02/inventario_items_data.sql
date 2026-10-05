-- Respaldo LOGICO de inventario_items previo al ALTER (orden_compra, estado_entrega)
-- fecha: 2026-10-02T13:59:27.652281

INSERT INTO public.inventario_items ("id", "codigo", "descripcion", "marca", "planilla_id", "stock_actual", "foto_referencia_url", "foto_public_id", "creado_por_id", "eliminado_en", "creado_en", "actualizado_en", "numero_articulo", "tiempo_entrega") VALUES (1, 'INV-2026-0001', 'PRUEBA 1', 'PRUEBA 2', 1, 1, 'https://res.cloudinary.com/lga5mica/image/upload/v1788902828/gs_viaticos/inventario/items/file_drfvzt.jpg', 'gs_viaticos/inventario/items/file_drfvzt', 28, NULL, '2026-09-08 21:27:05.146963', '2026-09-08 21:27:07.736042', NULL, NULL);

SELECT setval('inventario_items_id_seq', GREATEST((SELECT COALESCE(MAX(id),1) FROM inventario_items),1));