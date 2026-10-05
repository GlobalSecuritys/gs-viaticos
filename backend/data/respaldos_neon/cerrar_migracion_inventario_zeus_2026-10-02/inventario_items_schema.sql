-- Esquema actual de inventario_items (pre-DDL)
  id int4 NOT NULL DEFAULT nextval('inventario_legacy_items_id_seq'::regclass)
  codigo varchar(60)
  descripcion varchar(255) NOT NULL
  marca varchar(60) NOT NULL DEFAULT 'GENERICA'::character varying
  planilla_id int4 NOT NULL
  stock_actual int4 NOT NULL DEFAULT 0
  foto_referencia_url varchar(500)
  foto_public_id varchar(255)
  creado_por_id int4
  eliminado_en timestamp
  creado_en timestamp NOT NULL DEFAULT now()
  actualizado_en timestamp NOT NULL DEFAULT now()
  numero_articulo varchar(60)
  tiempo_entrega varchar(80)

-- Enums
  inventario_estado_entrega = en_stock,en_transito,en_proceso
  inventario_union_temporal = RTC,MANTENIMIENTO,PROYECTO_ZEUS
