-- UNACedula | Seed de datos para demostración
USE unacedula;

-- ── FACULTADES ──────────────────────────────────────────────
INSERT INTO facultad (id_facultad, nombre_facultad, siglas) VALUES
(1,  'Ingeniería Pesquería y Alimentos',          'FIPA'),
(2,  'Ciencias Naturales y Matemáticas',          'FCNM'),
(3,  'Ingeniería Química',                        'FIQ'),
(4,  'Ciencias Económicas',                       'FCE'),
(5,  'Ingeniería Ambiental y Recursos Naturales', 'FIARN'),
(6,  'Ciencias Contables',                        'FCC'),
(7,  'Ciencias Administrativas',                  'FCA'),
(8,  'Ingeniería Eléctrica y Electrónica',        'FIEE'),
(9,  'Ingeniería Industrial y de Sistemas',       'FIIS'),
(10, 'Ciencias de la Salud',                      'FCS'),
(11, 'Ingeniería Mecánica-Energía',               'FIME'),
(12, 'Ciencias de la Educación',                  'FCED');

-- ── ESCUELAS (2 por facultad, muestra) ──────────────────────
INSERT INTO escuela (id_escuela, id_facultad, nombre_escuela) VALUES
(1,  1, 'Ingeniería Pesquería'),
(2,  1, 'Ingeniería de Alimentos'),
(3,  2, 'Matemáticas'),
(4,  2, 'Física'),
(5,  3, 'Ingeniería Química'),
(6,  4, 'Economía'),
(7,  5, 'Ingeniería Ambiental'),
(8,  6, 'Contabilidad'),
(9,  7, 'Administración'),
(10, 8, 'Ingeniería Eléctrica'),
(11, 9, 'Ingeniería Industrial'),
(12, 9, 'Ingeniería de Sistemas'),
(13, 10,'Enfermería'),
(14, 11,'Ingeniería Mecánica'),
(15, 12,'Educación');

-- ── CANDIDATOS COMO ELECTORES (DNI ficticios) ───────────────
INSERT INTO elector (dni, codigo_alumno, pin_acceso, id_escuela, creditos_matriculados, es_tercio_superior, ya_voto) VALUES
('11111111', 'C001', '0000', 11, 120, TRUE,  FALSE),
('22222222', 'C002', '0000', 9,  130, TRUE,  FALSE),
('33333333', 'C003', '0000', 6,  125, TRUE,  FALSE);

-- ── PARTIDOS POLÍTICOS ──────────────────────────────────────
INSERT INTO partido_politico (id_partido, nombre_partido) VALUES
(1, 'Excelencia Universitaria'),
(2, 'Transformación UNAC'),
(3, 'Unidad y Progreso');

-- ── CANDIDATOS ──────────────────────────────────────────────
INSERT INTO candidato (id_candidato, dni_candidato, id_partido, cargo_postula) VALUES
(1, '11111111', 1, 'Rector'),
(2, '22222222', 2, 'Rector'),
(3, '33333333', 3, 'Rector');

-- ── MESAS (1 por facultad) ──────────────────────────────────
INSERT INTO mesa (id_mesa, id_facultad, estado_mesa) VALUES
(1,  1,  'cerrada'),
(2,  2,  'cerrada'),
(3,  3,  'cerrada'),
(4,  9,  'cerrada'),  -- FIIS — mesa usada en demo
(5,  4,  'cerrada'),
(6,  5,  'cerrada'),
(7,  6,  'cerrada'),
(8,  7,  'cerrada'),
(9,  8,  'cerrada'),
(10, 10, 'cerrada'),
(11, 11, 'cerrada'),
(12, 12, 'cerrada');

-- ── ELECTORES (votantes de demo — mesa 4 FIIS) ──────────────
INSERT INTO elector (dni, codigo_alumno, pin_acceso, id_escuela, creditos_matriculados, es_tercio_superior, ya_voto) VALUES
('12345678', '20230001', '1234', 11, 18, FALSE, FALSE),
('12345679', '20230002', '5678', 11, 15, FALSE, FALSE),
('12345680', '20230003', '9012', 12, 20, TRUE,  FALSE);

-- ── MIEMBROS DE MESA 4 (demo) ───────────────────────────────
-- Presidente: DNI 12345678, token MTK-A4F2
-- Secretario: DNI 12345679, token MTK-B7C1
-- Tercer miembro: DNI 12345680, token MTK-C3E9
INSERT INTO miembro_mesa (id_mesa, dni_miembro, rol, token_acceso, asistencia_marcada, permiso_activo) VALUES
(4, '12345678', 'Presidente',     'MTK-A4F2', FALSE, TRUE),
(4, '12345679', 'Secretario',     'MTK-B7C1', FALSE, TRUE),
(4, '12345680', 'Tercer Miembro', 'MTK-C3E9', FALSE, TRUE);

-- ── CONFIGURACIÓN INICIAL ───────────────────────────────────
-- (ya insertada en schema.sql, pero por si se corre solo el seed)
INSERT IGNORE INTO configuracion_sistema (id_config, elecciones_activas) VALUES (1, FALSE);
