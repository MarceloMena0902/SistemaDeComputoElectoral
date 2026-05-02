-- ============================================================
-- MIGRACION 003: Nuevos estados, columnas extra y tablas de
--               seguimiento de importaciones masivas.
-- ============================================================

-- ─── Actualizar constraint de estado en acta_oficial ─────────────
ALTER TABLE acta_oficial DROP CONSTRAINT IF EXISTS chk_acta_estado;
ALTER TABLE acta_oficial ADD CONSTRAINT chk_acta_estado
    CHECK (estado IN (
        'PENDIENTE','PROCESADO','OBSERVADO','RECHAZADO',
        'VALIDA','OBSERVADA_PENDIENTE_REVISION','RECHAZADA','DUPLICADA'
    ));

-- ─── Columna origen en acta_oficial ──────────────────────────────
ALTER TABLE acta_oficial
    ADD COLUMN IF NOT EXISTS origen VARCHAR(100) DEFAULT 'MANUAL';

-- ─── Columnas de papeletas en voto_oficial ────────────────────────
ALTER TABLE voto_oficial
    ADD COLUMN IF NOT EXISTS papeletas_anfora        INT NOT NULL DEFAULT 0;
ALTER TABLE voto_oficial
    ADD COLUMN IF NOT EXISTS papeletas_no_utilizadas INT NOT NULL DEFAULT 0;

-- ─── Tabla: acta_import_runs ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS acta_import_runs (
    id            BIGSERIAL    PRIMARY KEY,
    estado        VARCHAR(50)  NOT NULL DEFAULT 'INICIADO',
    total         INT          NOT NULL DEFAULT 0,
    exitosas      INT          NOT NULL DEFAULT 0,
    errores       INT          NOT NULL DEFAULT 0,
    observadas    INT          NOT NULL DEFAULT 0,
    duplicadas    INT          NOT NULL DEFAULT 0,
    iniciado_en   TIMESTAMP    DEFAULT NOW(),
    completado_en TIMESTAMP
);

-- ─── Tabla: acta_import_detalle ──────────────────────────────────
CREATE TABLE IF NOT EXISTS acta_import_detalle (
    id           BIGSERIAL   PRIMARY KEY,
    run_id       BIGINT      NOT NULL REFERENCES acta_import_runs(id),
    nro_acta     VARCHAR(50) NOT NULL,
    estado       VARCHAR(50) NOT NULL,
    errores_json TEXT,
    procesado_en TIMESTAMP   DEFAULT NOW()
);

-- ─── Índices nuevos ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_acta_origen     ON acta_oficial(origen);
CREATE INDEX IF NOT EXISTS idx_import_run      ON acta_import_detalle(run_id);
CREATE INDEX IF NOT EXISTS idx_import_nro_acta ON acta_import_detalle(nro_acta);
