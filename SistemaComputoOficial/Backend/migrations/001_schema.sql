-- ============================================================
-- MIGRACION 001: Esquema inicial del Sistema de Computo Oficial
-- Basado en el diagrama relacional de la Practica 4
-- ============================================================

-- ─── Tabla: distribucion_territorial ────────────────────────────
CREATE TABLE IF NOT EXISTS distribucion_territorial (
    codigo_territorial  INT          PRIMARY KEY,
    departamento        VARCHAR(100) NOT NULL,
    municipio           VARCHAR(100) NOT NULL,
    provincia           VARCHAR(100) NOT NULL
);

-- ─── Tabla: usuario ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario      SERIAL       PRIMARY KEY,
    nombre_usuario  VARCHAR(120) NOT NULL UNIQUE,
    created_at      TIMESTAMP    DEFAULT NOW()
);

-- ─── Tabla: recinto_electoral ────────────────────────────────────
CREATE TABLE IF NOT EXISTS recinto_electoral (
    recinto_id          BIGSERIAL    PRIMARY KEY,
    codigo_territorial  INT          NOT NULL REFERENCES distribucion_territorial(codigo_territorial),
    nombre_recinto      VARCHAR(200) NOT NULL,
    direccion           TEXT,
    cantidad_mesas      INT          DEFAULT 0
);

-- ─── Tabla: mesa_electoral ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS mesa_electoral (
    codigo_mesa         BIGINT  PRIMARY KEY,
    recinto_id          BIGINT  NOT NULL REFERENCES recinto_electoral(recinto_id),
    codigo_territorial  INT     NOT NULL REFERENCES distribucion_territorial(codigo_territorial),
    nro_mesa            INT     NOT NULL,
    nro_votantes        INT     DEFAULT 0,
    UNIQUE (recinto_id, nro_mesa)
);

-- ─── Tabla: acta_oficial ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acta_oficial (
    id_acta              BIGSERIAL    PRIMARY KEY,
    nro_acta             VARCHAR(50)  NOT NULL UNIQUE,
    codigo_mesa          BIGINT       NOT NULL REFERENCES mesa_electoral(codigo_mesa),
    estado               VARCHAR(30)  NOT NULL DEFAULT 'PENDIENTE',
    observacion          TEXT,
    fecha_registro       TIMESTAMP    DEFAULT NOW(),
    fecha_actualizacion  TIMESTAMP    DEFAULT NOW(),
    registrado_por       INT          REFERENCES usuario(id_usuario),
    actualizado_por      INT          REFERENCES usuario(id_usuario),
    CONSTRAINT chk_acta_estado CHECK (estado IN ('PENDIENTE','PROCESADO','OBSERVADO','RECHAZADO'))
);

-- ─── Tabla: voto_oficial ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voto_oficial (
    id_voto              BIGSERIAL  PRIMARY KEY,
    id_acta              BIGINT     NOT NULL REFERENCES acta_oficial(id_acta),
    partido1             INT        NOT NULL DEFAULT 0,
    partido2             INT        NOT NULL DEFAULT 0,
    partido3             INT        NOT NULL DEFAULT 0,
    partido4             INT        NOT NULL DEFAULT 0,
    votos_validos        INT        NOT NULL,
    votos_blancos        INT        NOT NULL DEFAULT 0,
    votos_nulos          INT        NOT NULL DEFAULT 0,
    total_votos          INT        NOT NULL,
    registrado_por       INT        REFERENCES usuario(id_usuario),
    actualizado_por      INT        REFERENCES usuario(id_usuario),
    fecha_registro       TIMESTAMP  DEFAULT NOW(),
    fecha_actualizacion  TIMESTAMP  DEFAULT NOW(),
    -- Restricciones de integridad aritmetica
    CONSTRAINT chk_votos_validos  CHECK (votos_validos = partido1 + partido2 + partido3 + partido4),
    CONSTRAINT chk_total_votos    CHECK (total_votos   = votos_validos + votos_blancos + votos_nulos),
    CONSTRAINT chk_non_negative   CHECK (
        partido1 >= 0 AND partido2 >= 0 AND partido3 >= 0 AND partido4 >= 0 AND
        votos_blancos >= 0 AND votos_nulos >= 0
    )
);

-- ─── Tabla: auditoria_voto ───────────────────────────────────────
-- Registra toda accion de insercion, modificacion o rechazo.
-- Permite trazabilidad completa por usuario y tipo de accion.
CREATE TABLE IF NOT EXISTS auditoria_voto (
    id_auditoria      BIGSERIAL    PRIMARY KEY,
    id_voto           BIGINT       REFERENCES voto_oficial(id_voto),
    id_usuario        INT          REFERENCES usuario(id_usuario),
    accion            VARCHAR(50)  NOT NULL,      -- INSERCION | CONFLICTO_DATOS | RECHAZO_VALIDACION
    campo_modificado  VARCHAR(100),
    valor_anterior    TEXT,
    valor_nuevo       TEXT,
    detalle           TEXT,
    fecha_accion      TIMESTAMP    DEFAULT NOW()
);

-- ─── Tabla: fallo_db ─────────────────────────────────────────────
-- Registro de fallos del cluster de base de datos distribuida.
CREATE TABLE IF NOT EXISTS fallo_db (
    id_fallo           BIGSERIAL    PRIMARY KEY,
    nodo               VARCHAR(100) NOT NULL,
    tipo_fallo         VARCHAR(100),
    detalle            TEXT,
    fecha_fallo        TIMESTAMP    DEFAULT NOW(),
    resuelto           BOOLEAN      DEFAULT FALSE,
    fecha_resolucion   TIMESTAMP
);

-- ─── Indices de rendimiento ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_acta_estado       ON acta_oficial(estado);
CREATE INDEX IF NOT EXISTS idx_acta_mesa         ON acta_oficial(codigo_mesa);
CREATE INDEX IF NOT EXISTS idx_acta_nro          ON acta_oficial(nro_acta);
CREATE INDEX IF NOT EXISTS idx_voto_acta         ON voto_oficial(id_acta);
CREATE INDEX IF NOT EXISTS idx_mesa_territorial  ON mesa_electoral(codigo_territorial);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria_voto(id_usuario);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion  ON auditoria_voto(accion);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha   ON auditoria_voto(fecha_accion DESC);
CREATE INDEX IF NOT EXISTS idx_fallo_nodo        ON fallo_db(nodo);
CREATE INDEX IF NOT EXISTS idx_fallo_resuelto    ON fallo_db(resuelto);
