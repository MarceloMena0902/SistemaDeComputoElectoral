-- =============================================================
--  SISTEMA NACIONAL DE CÓMPUTO ELECTORAL - BOLIVIA
--  Schema PostgreSQL - Tolerante a Fallos
--  Versión: 1.0.0
-- =============================================================
--
--  ESTRATEGIA ANTI-GAPS EN SECUENCIAS:
--  PostgreSQL usa secuencias internas que pueden generar "saltos"
--  cuando una transacción falla (el valor de la secuencia ya se
--  incrementó pero el INSERT fue revertido). Para mitigar esto:
--    1. Usamos CACHE 1 en todas las secuencias (default).
--    2. Para IDs de auditoría críticos, usamos una tabla-contador
--       con SELECT ... FOR UPDATE (serializable, sin saltos).
--    3. Las FKs usan ON DELETE RESTRICT para mantener integridad.
-- =============================================================

-- Crear base de datos para n8n si no existe (se ejecuta desde script externo)
-- CREATE DATABASE n8n_db;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

-- ==============================================================
--  EXTENSIONES
-- ==============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================
--  TABLA AUXILIAR: Contador sin saltos para auditoría
--  Técnica: SELECT ... FOR UPDATE garantiza secuencia continua
-- ==============================================================
CREATE TABLE IF NOT EXISTS seq_auditoria (
    nombre      VARCHAR(50)  PRIMARY KEY,
    valor_actual BIGINT      NOT NULL DEFAULT 0
);

-- Insertar el contador de auditoría
INSERT INTO seq_auditoria (nombre, valor_actual) VALUES ('log_auditoria', 0)
ON CONFLICT (nombre) DO NOTHING;

-- Función para obtener el siguiente ID sin saltos
CREATE OR REPLACE FUNCTION siguiente_id_auditoria()
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_nuevo_id BIGINT;
BEGIN
    UPDATE seq_auditoria
       SET valor_actual = valor_actual + 1
     WHERE nombre = 'log_auditoria'
    RETURNING valor_actual INTO v_nuevo_id;
    RETURN v_nuevo_id;
END;
$$;

-- ==============================================================
--  ENUMERACIONES
-- ==============================================================
CREATE TYPE estado_acta AS ENUM (
    'PENDIENTE',
    'EN_PROCESO',
    'VALIDADA',
    'OBSERVADA',
    'RECHAZADA',
    'ANULADA'
);

CREATE TYPE pipeline_tipo AS ENUM (
    'RRV',        -- Resultados Rápidos de Votación (TREP)
    'COMPUTO_OFICIAL'
);

CREATE TYPE tipo_eleccion AS ENUM (
    'PRESIDENTE_VICEPRESIDENTE',
    'SENADORES',
    'DIPUTADOS_UNINOMINALES',
    'DIPUTADOS_PLURINOMINALES',
    'DIPUTADOS_ESPECIALES'
);

CREATE TYPE rol_usuario AS ENUM (
    'NOTARIO',
    'SUPERVISOR',
    'OPERADOR_OCR',
    'AUDITOR',
    'ADMIN'
);

CREATE TYPE accion_auditoria AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'VALIDACION_FALLIDA',
    'OCR_PROCESADO',
    'ACTA_SUBIDA',
    'ACTA_APROBADA',
    'ACTA_RECHAZADA'
);

-- ==============================================================
--  GEOGRAFÍA: Departamentos
-- ==============================================================
CREATE TABLE IF NOT EXISTS departamentos (
    id              SMALLINT     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          CHAR(2)      NOT NULL UNIQUE,   -- LP, CB, SC, OR, PT, CH, TJ, BN, PD
    nombre          VARCHAR(50)  NOT NULL UNIQUE,
    capital         VARCHAR(50),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE departamentos IS 'Los 9 departamentos de Bolivia';

-- ==============================================================
--  GEOGRAFÍA: Municipios
-- ==============================================================
CREATE TABLE IF NOT EXISTS municipios (
    id              INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    departamento_id SMALLINT     NOT NULL REFERENCES departamentos(id) ON DELETE RESTRICT,
    codigo          VARCHAR(10)  NOT NULL UNIQUE,   -- Código INE
    nombre          VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_municipios_departamento ON municipios(departamento_id);

-- ==============================================================
--  RECINTOS ELECTORALES
-- ==============================================================
CREATE TABLE IF NOT EXISTS recintos (
    id              INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    municipio_id    INTEGER      NOT NULL REFERENCES municipios(id) ON DELETE RESTRICT,
    codigo          VARCHAR(20)  NOT NULL UNIQUE,
    nombre          VARCHAR(200) NOT NULL,
    direccion       VARCHAR(300),
    latitud         DECIMAL(10,7),
    longitud        DECIMAL(10,7),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recintos_municipio ON recintos(municipio_id);

-- ==============================================================
--  MESAS ELECTORALES
-- ==============================================================
CREATE TABLE IF NOT EXISTS mesas (
    id              INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recinto_id      INTEGER      NOT NULL REFERENCES recintos(id) ON DELETE RESTRICT,
    numero_mesa     SMALLINT     NOT NULL,
    habilitados     SMALLINT     NOT NULL DEFAULT 0 CHECK (habilitados >= 0),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (recinto_id, numero_mesa)
);

CREATE INDEX idx_mesas_recinto ON mesas(recinto_id);

-- ==============================================================
--  USUARIOS / NOTARIOS ELECTORALES
-- ==============================================================
CREATE TABLE IF NOT EXISTS usuarios_notarios (
    id              INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uuid            UUID         NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    ci              VARCHAR(20)  NOT NULL UNIQUE,   -- Cédula de identidad
    nombres         VARCHAR(100) NOT NULL,
    apellidos       VARCHAR(100) NOT NULL,
    email           VARCHAR(150) UNIQUE,
    telefono        VARCHAR(20),
    rol             rol_usuario  NOT NULL DEFAULT 'NOTARIO',
    mesa_id         INTEGER      REFERENCES mesas(id) ON DELETE SET NULL,
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    password_hash   VARCHAR(255) NOT NULL,
    ultimo_acceso   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuarios_mesa ON usuarios_notarios(mesa_id);
CREATE INDEX idx_usuarios_rol ON usuarios_notarios(rol);

-- ==============================================================
--  PARTIDOS POLÍTICOS
-- ==============================================================
CREATE TABLE IF NOT EXISTS partidos_politicos (
    id              SMALLINT     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          VARCHAR(20)  NOT NULL UNIQUE,   -- MAS-IPSP, CC, FPV, etc.
    nombre_completo VARCHAR(200) NOT NULL,
    sigla           VARCHAR(30)  NOT NULL,
    color_hex       CHAR(7),                         -- #RRGGBB para visualización
    orden_boleta    SMALLINT,                        -- Posición en el acta
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE partidos_politicos IS 'Organizaciones políticas habilitadas en el proceso electoral';

-- ==============================================================
--  ACTAS ELECTORALES (tabla central del sistema)
--
--  TOLERANCIA A FALLOS:
--  - id usa GENERATED ALWAYS AS IDENTITY (secuencia interna CACHE 1)
--  - uuid como identificador externo inmutable
--  - Constraint UNIQUE en (mesa_id, pipeline, eleccion_tipo) evita
--    duplicados ante reintentos de la app móvil
-- ==============================================================
CREATE TABLE IF NOT EXISTS actas (
    id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uuid            UUID         NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    mesa_id         INTEGER      NOT NULL REFERENCES mesas(id) ON DELETE RESTRICT,
    pipeline        pipeline_tipo NOT NULL,
    eleccion_tipo   tipo_eleccion NOT NULL DEFAULT 'PRESIDENTE_VICEPRESIDENTE',
    estado          estado_acta  NOT NULL DEFAULT 'PENDIENTE',

    -- Metadatos de captura
    imagen_original VARCHAR(500),           -- Ruta/URL de la imagen original
    imagen_procesada VARCHAR(500),          -- Ruta/URL después del OCR
    hash_imagen     VARCHAR(64),            -- SHA-256 de la imagen (detección de duplicados)
    calidad_imagen  DECIMAL(5,2),           -- Score de calidad OCR (0-100)
    angulo_correccion DECIMAL(6,2),         -- Grados de corrección de perspectiva

    -- Datos del acta (totales)
    total_votos_validos   SMALLINT CHECK (total_votos_validos >= 0),
    total_votos_blancos   SMALLINT CHECK (total_votos_blancos >= 0),
    total_votos_nulos     SMALLINT CHECK (total_votos_nulos >= 0),
    total_votos_emitidos  SMALLINT CHECK (total_votos_emitidos >= 0),

    -- Constraint de coherencia matemática (validado por trigger)
    -- total_votos_emitidos = total_votos_validos + total_votos_blancos + total_votos_nulos

    -- Geolocalización del envío
    latitud_envio   DECIMAL(10,7),
    longitud_envio  DECIMAL(10,7),
    ip_origen       INET,

    -- Trazabilidad
    usuario_id      INTEGER      REFERENCES usuarios_notarios(id) ON DELETE SET NULL,
    revisado_por    INTEGER      REFERENCES usuarios_notarios(id) ON DELETE SET NULL,
    observaciones   TEXT,

    -- Timestamps
    capturada_en    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    procesada_en    TIMESTAMPTZ,
    validada_en     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Evitar doble envío de la misma acta
    UNIQUE (mesa_id, pipeline, eleccion_tipo)
);

CREATE INDEX idx_actas_mesa       ON actas(mesa_id);
CREATE INDEX idx_actas_estado     ON actas(estado);
CREATE INDEX idx_actas_pipeline   ON actas(pipeline);
CREATE INDEX idx_actas_usuario    ON actas(usuario_id);
CREATE INDEX idx_actas_hash       ON actas(hash_imagen);
CREATE INDEX idx_actas_capturada  ON actas(capturada_en DESC);

COMMENT ON TABLE actas IS 'Actas electorales recibidas por la app móvil. Una acta por mesa por pipeline.';
COMMENT ON COLUMN actas.uuid IS 'ID público inmutable; usar en APIs externas para evitar enumeration attacks';
COMMENT ON COLUMN actas.hash_imagen IS 'SHA-256 de los bytes originales; detecta imágenes duplicadas o alteradas';

-- ==============================================================
--  RESULTADOS DE VOTOS (por partido, por acta)
-- ==============================================================
CREATE TABLE IF NOT EXISTS resultados_votos (
    id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    acta_id         BIGINT       NOT NULL REFERENCES actas(id) ON DELETE CASCADE,
    partido_id      SMALLINT     NOT NULL REFERENCES partidos_politicos(id) ON DELETE RESTRICT,
    votos           SMALLINT     NOT NULL DEFAULT 0 CHECK (votos >= 0),
    votos_ocr       SMALLINT,               -- Valor crudo del OCR (antes de corrección manual)
    confianza_ocr   DECIMAL(5,2),           -- % de confianza del modelo OCR
    corregido       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (acta_id, partido_id)
);

CREATE INDEX idx_resultados_acta    ON resultados_votos(acta_id);
CREATE INDEX idx_resultados_partido ON resultados_votos(partido_id);

-- ==============================================================
--  LOG DE AUDITORÍA (ID sin saltos garantizado)
--
--  Usa la función siguiente_id_auditoria() que emplea
--  SELECT ... FOR UPDATE sobre la tabla seq_auditoria.
--  Esto elimina gaps pero serializa las inserciones de log.
-- ==============================================================
CREATE TABLE IF NOT EXISTS log_auditoria (
    id              BIGINT       PRIMARY KEY DEFAULT siguiente_id_auditoria(),
    tabla_afectada  VARCHAR(50)  NOT NULL,
    registro_id     BIGINT,
    registro_uuid   UUID,
    accion          accion_auditoria NOT NULL,
    usuario_id      INTEGER      REFERENCES usuarios_notarios(id) ON DELETE SET NULL,
    ip_origen       INET,
    datos_anteriores JSONB,
    datos_nuevos     JSONB,
    mensaje          TEXT,
    exito            BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auditoria_tabla    ON log_auditoria(tabla_afectada);
CREATE INDEX idx_auditoria_usuario  ON log_auditoria(usuario_id);
CREATE INDEX idx_auditoria_accion   ON log_auditoria(accion);
CREATE INDEX idx_auditoria_fecha    ON log_auditoria(created_at DESC);
CREATE INDEX idx_auditoria_registro ON log_auditoria(registro_id);

COMMENT ON TABLE log_auditoria IS 'Log de auditoría sin saltos de ID. Usa tabla-contador con FOR UPDATE.';
COMMENT ON COLUMN log_auditoria.datos_anteriores IS 'Estado JSONB del registro antes de la modificación';
COMMENT ON COLUMN log_auditoria.datos_nuevos IS 'Estado JSONB del registro después de la modificación';

-- ==============================================================
--  VISTA: Resultados consolidados por departamento y partido
-- ==============================================================
CREATE OR REPLACE VIEW v_resultados_departamento AS
SELECT
    d.codigo                          AS dept_codigo,
    d.nombre                          AS departamento,
    pp.sigla                          AS partido,
    pp.color_hex,
    a.pipeline,
    a.eleccion_tipo,
    SUM(rv.votos)                     AS total_votos,
    COUNT(DISTINCT a.id)              AS actas_computadas,
    COUNT(DISTINCT m.id)              AS mesas_totales,
    ROUND(
        COUNT(DISTINCT a.id)::NUMERIC /
        NULLIF(COUNT(DISTINCT m.id), 0) * 100, 2
    )                                 AS pct_actas_procesadas
FROM resultados_votos rv
JOIN actas           a  ON rv.acta_id    = a.id
JOIN mesas           m  ON a.mesa_id     = m.id
JOIN recintos        r  ON m.recinto_id  = r.id
JOIN municipios      mu ON r.municipio_id = mu.id
JOIN departamentos   d  ON mu.departamento_id = d.id
JOIN partidos_politicos pp ON rv.partido_id = pp.id
WHERE a.estado = 'VALIDADA'
GROUP BY d.codigo, d.nombre, pp.sigla, pp.color_hex, a.pipeline, a.eleccion_tipo;

-- ==============================================================
--  VISTA: Progreso de cómputo por departamento
-- ==============================================================
CREATE OR REPLACE VIEW v_progreso_computo AS
SELECT
    d.codigo                          AS dept_codigo,
    d.nombre                          AS departamento,
    a.pipeline,
    COUNT(DISTINCT m.id)              AS total_mesas,
    COUNT(DISTINCT CASE WHEN a.estado = 'VALIDADA' THEN a.mesa_id END) AS mesas_validadas,
    COUNT(DISTINCT CASE WHEN a.estado = 'PENDIENTE' THEN a.mesa_id END) AS mesas_pendientes,
    COUNT(DISTINCT CASE WHEN a.estado = 'OBSERVADA' THEN a.mesa_id END) AS mesas_observadas,
    ROUND(
        COUNT(DISTINCT CASE WHEN a.estado = 'VALIDADA' THEN a.mesa_id END)::NUMERIC /
        NULLIF(COUNT(DISTINCT m.id), 0) * 100, 2
    )                                 AS pct_completado
FROM mesas m
JOIN recintos        r  ON m.recinto_id  = r.id
JOIN municipios      mu ON r.municipio_id = mu.id
JOIN departamentos   d  ON mu.departamento_id = d.id
LEFT JOIN actas      a  ON a.mesa_id = m.id
GROUP BY d.codigo, d.nombre, a.pipeline;

-- ==============================================================
--  VISTA: Comparativa RRV vs Cómputo Oficial por partido
-- ==============================================================
CREATE OR REPLACE VIEW v_comparativa_pipelines AS
SELECT
    pp.sigla                          AS partido,
    pp.color_hex,
    SUM(CASE WHEN a.pipeline = 'RRV' THEN rv.votos ELSE 0 END)            AS votos_rrv,
    SUM(CASE WHEN a.pipeline = 'COMPUTO_OFICIAL' THEN rv.votos ELSE 0 END) AS votos_oficial,
    SUM(CASE WHEN a.pipeline = 'RRV' THEN rv.votos ELSE 0 END) -
    SUM(CASE WHEN a.pipeline = 'COMPUTO_OFICIAL' THEN rv.votos ELSE 0 END) AS diferencia
FROM resultados_votos rv
JOIN actas           a  ON rv.acta_id  = a.id
JOIN partidos_politicos pp ON rv.partido_id = pp.id
WHERE a.estado = 'VALIDADA'
GROUP BY pp.sigla, pp.color_hex
ORDER BY votos_rrv DESC;

-- ==============================================================
--  TRIGGERS
-- ==============================================================

-- Trigger: actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_actas_updated_at
    BEFORE UPDATE ON actas
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_resultados_updated_at
    BEFORE UPDATE ON resultados_votos
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_usuarios_updated_at
    BEFORE UPDATE ON usuarios_notarios
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Trigger: validar coherencia matemática de totales del acta
CREATE OR REPLACE FUNCTION fn_validar_totales_acta()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.total_votos_emitidos IS NOT NULL AND
       NEW.total_votos_validos IS NOT NULL AND
       NEW.total_votos_blancos IS NOT NULL AND
       NEW.total_votos_nulos IS NOT NULL THEN

        IF NEW.total_votos_emitidos <>
           (NEW.total_votos_validos + NEW.total_votos_blancos + NEW.total_votos_nulos) THEN
            RAISE EXCEPTION
                'Inconsistencia en totales: emitidos(%) <> validos(%) + blancos(%) + nulos(%)',
                NEW.total_votos_emitidos,
                NEW.total_votos_validos,
                NEW.total_votos_blancos,
                NEW.total_votos_nulos;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_totales_acta
    BEFORE INSERT OR UPDATE ON actas
    FOR EACH ROW EXECUTE FUNCTION fn_validar_totales_acta();

-- Trigger: registrar cambios de estado de actas en auditoría
CREATE OR REPLACE FUNCTION fn_audit_acta_estado()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.estado <> NEW.estado) THEN
        INSERT INTO log_auditoria (
            tabla_afectada, registro_id, registro_uuid,
            accion, datos_anteriores, datos_nuevos, mensaje
        ) VALUES (
            'actas',
            NEW.id,
            NEW.uuid,
            CASE TG_OP
                WHEN 'INSERT' THEN 'INSERT'::accion_auditoria
                ELSE 'UPDATE'::accion_auditoria
            END,
            CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
            to_jsonb(NEW),
            format('Acta mesa_id=%s pipeline=%s: %s -> %s',
                   NEW.mesa_id, NEW.pipeline,
                   CASE WHEN TG_OP = 'UPDATE' THEN OLD.estado::TEXT ELSE 'NUEVA' END,
                   NEW.estado::TEXT)
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_acta
    AFTER INSERT OR UPDATE ON actas
    FOR EACH ROW EXECUTE FUNCTION fn_audit_acta_estado();

-- ==============================================================
--  ÍNDICES PARCIALES (optimización de queries frecuentes)
-- ==============================================================
CREATE INDEX idx_actas_pendientes
    ON actas(created_at DESC)
    WHERE estado = 'PENDIENTE';

CREATE INDEX idx_actas_observadas
    ON actas(created_at DESC)
    WHERE estado = 'OBSERVADA';

-- ==============================================================
--  ROW LEVEL SECURITY (RLS) - Seguridad por rol
-- ==============================================================
ALTER TABLE actas ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultados_votos ENABLE ROW LEVEL SECURITY;

-- Los notarios solo ven/modifican sus propias actas
CREATE POLICY notario_actas_policy ON actas
    FOR ALL
    TO PUBLIC
    USING (true);  -- Se reemplaza con lógica de app via current_setting

-- ==============================================================
--  PERMISOS
-- ==============================================================
GRANT CONNECT ON DATABASE electoral_db TO electoral_user;
GRANT USAGE ON SCHEMA public TO electoral_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO electoral_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO electoral_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO electoral_user;

-- ==============================================================
-- FIN DEL SCHEMA
-- ==============================================================
