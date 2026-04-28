-- ============================================================
-- MIGRACION 002: Datos iniciales (seed)
-- Usuarios del sistema, distribucion territorial, recintos y
-- mesas compatibles con el CSV de automatizacion.
-- ============================================================

-- ─── Usuarios del sistema ────────────────────────────────────────
INSERT INTO usuario (id_usuario, nombre_usuario) VALUES
    (1, 'sistema_automatizacion'),
    (2, 'operador_1'),
    (3, 'operador_2'),
    (4, 'supervisor')
ON CONFLICT (id_usuario) DO NOTHING;

-- Actualizar secuencia para no colisionar con los IDs insertados
SELECT setval('usuario_id_usuario_seq', (SELECT MAX(id_usuario) FROM usuario));

-- ─── Distribucion territorial (muestra representativa) ───────────
INSERT INTO distribucion_territorial (codigo_territorial, departamento, municipio, provincia) VALUES
    (10101, 'La Paz',       'La Paz',                    'Murillo'),
    (10102, 'La Paz',       'El Alto',                   'Murillo'),
    (10201, 'La Paz',       'Viacha',                    'Ingavi'),
    (10301, 'La Paz',       'Achacachi',                 'Omasuyos'),
    (20101, 'Cochabamba',   'Cochabamba',                'Cercado'),
    (20201, 'Cochabamba',   'Quillacollo',               'Quillacollo'),
    (30101, 'Santa Cruz',   'Santa Cruz de la Sierra',   'Andres Ibanez'),
    (30201, 'Santa Cruz',   'Warnes',                    'Warnes'),
    (40101, 'Oruro',        'Oruro',                     'Cercado'),
    (50101, 'Potosi',       'Potosi',                    'Tomas Frias'),
    (60101, 'Tarija',       'Tarija',                    'Cercado'),
    (70101, 'Chuquisaca',   'Sucre',                     'Oropeza'),
    (80101, 'Beni',         'Trinidad',                  'Cercado'),
    (90101, 'Pando',        'Cobija',                    'Nicolas Suarez')
ON CONFLICT (codigo_territorial) DO NOTHING;

-- ─── Recintos electorales ────────────────────────────────────────
INSERT INTO recinto_electoral (recinto_id, codigo_territorial, nombre_recinto, direccion, cantidad_mesas) VALUES
    (10101001, 10101, 'Unidad Educativa Juan XXIII',          'Av. Buenos Aires 123, La Paz',            3),
    (10101002, 10101, 'Colegio Nacional Ayacucho',            'C. Ayacucho 456, La Paz',                 3),
    (10102001, 10102, 'Colegio Boliviano Aleman',             'Av. 6 de Marzo 789, El Alto',             3),
    (10102002, 10102, 'Unidad Educativa Revolucion',          'C. Panoramica 321, El Alto',              2),
    (20101001, 20101, 'Instituto Tecnico Superior',           'Av. Heroinas 100, Cochabamba',             3),
    (30101001, 30101, 'Escuela Primaria Santa Cruz',          'Av. Cristo Redentor 200, Santa Cruz',     4)
ON CONFLICT (recinto_id) DO NOTHING;

-- Actualizar secuencia de recintos
SELECT setval('recinto_electoral_recinto_id_seq', (SELECT MAX(recinto_id) FROM recinto_electoral));

-- ─── Mesas electorales (compatibles con el CSV de automatizacion) ─
INSERT INTO mesa_electoral (codigo_mesa, recinto_id, codigo_territorial, nro_mesa, nro_votantes) VALUES
    -- La Paz - Recinto 10101001
    (10101001001, 10101001, 10101, 1, 339),
    (10101001002, 10101001, 10101, 2, 920),
    (10101001003, 10101001, 10101, 3, 894),
    -- El Alto - Recinto 10102002
    (10102002001, 10102002, 10102, 1, 175),
    (10102002002, 10102002, 10102, 2, 661)
ON CONFLICT (codigo_mesa) DO NOTHING;
