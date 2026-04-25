-- =============================================================
--  DATOS INICIALES - Bolivia Electoral
-- =============================================================

-- Departamentos de Bolivia
INSERT INTO departamentos (codigo, nombre, capital) VALUES
    ('LP', 'La Paz',        'La Paz'),
    ('CB', 'Cochabamba',    'Cochabamba'),
    ('SC', 'Santa Cruz',    'Santa Cruz de la Sierra'),
    ('OR', 'Oruro',         'Oruro'),
    ('PT', 'Potosí',        'Potosí'),
    ('CH', 'Chuquisaca',    'Sucre'),
    ('TJ', 'Tarija',        'Tarija'),
    ('BN', 'Beni',          'Trinidad'),
    ('PD', 'Pando',         'Cobija')
ON CONFLICT (codigo) DO NOTHING;

-- Partidos políticos (Elecciones 2020 como referencia)
INSERT INTO partidos_politicos (codigo, nombre_completo, sigla, color_hex, orden_boleta) VALUES
    ('MAS-IPSP', 'Movimiento al Socialismo - Instrumento Político por la Soberanía de los Pueblos', 'MAS-IPSP', '#0066CC', 1),
    ('CC',       'Comunidad Ciudadana',                                                              'CC',       '#FF6600', 2),
    ('CREEMOS',  'Creemos',                                                                          'CREEMOS',  '#009900', 3),
    ('FPV',      'Frente Para la Victoria',                                                          'FPV',      '#CC0000', 4),
    ('MTS',      'Movimiento Tercer Sistema',                                                        'MTS',      '#9900CC', 5),
    ('UCS',      'Unidad Cívica Solidaridad',                                                        'UCS',      '#FF9900', 6),
    ('21F',      'Partido 21F',                                                                      '21F',      '#006666', 7),
    ('PDC',      'Partido Demócrata Cristiano',                                                      'PDC',      '#003366', 8),
    ('PANBOL',   'Pan-Bolivia',                                                                       'PANBOL',   '#666666', 9),
    ('MNR',      'Movimiento Nacionalista Revolucionario',                                           'MNR',      '#CC6600', 10)
ON CONFLICT (codigo) DO NOTHING;

-- Usuario administrador inicial (password: Admin2024!)
INSERT INTO usuarios_notarios (ci, nombres, apellidos, email, rol, password_hash) VALUES
    ('0000001', 'Administrador', 'Sistema', 'admin@electoral.bo', 'ADMIN',
     crypt('Admin2024!', gen_salt('bf', 10)))
ON CONFLICT (ci) DO NOTHING;
