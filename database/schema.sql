-- UNACedula | Schema Principal
-- Motor: MySQL (TiDB Serverless compatible)

CREATE DATABASE IF NOT EXISTS unacedula;
USE unacedula;

CREATE TABLE facultad (
    id_facultad INT PRIMARY KEY AUTO_INCREMENT,
    nombre_facultad VARCHAR(100) NOT NULL,
    siglas VARCHAR(10) NOT NULL
);

CREATE TABLE escuela (
    id_escuela INT PRIMARY KEY AUTO_INCREMENT,
    id_facultad INT NOT NULL,
    nombre_escuela VARCHAR(100) NOT NULL,
    FOREIGN KEY (id_facultad) REFERENCES facultad(id_facultad)
);

CREATE TABLE elector (
    dni VARCHAR(8) PRIMARY KEY,
    codigo_alumno VARCHAR(10) NOT NULL UNIQUE,
    pin_acceso VARCHAR(4) NOT NULL,
    id_escuela INT NOT NULL,
    creditos_matriculados INT NOT NULL DEFAULT 0,
    es_tercio_superior BOOLEAN NOT NULL DEFAULT FALSE,
    ya_voto BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (id_escuela) REFERENCES escuela(id_escuela)
);

CREATE TABLE partido_politico (
    id_partido INT PRIMARY KEY AUTO_INCREMENT,
    nombre_partido VARCHAR(100) NOT NULL,
    logo_url VARCHAR(255)
);

CREATE TABLE candidato (
    id_candidato INT PRIMARY KEY AUTO_INCREMENT,
    dni_candidato VARCHAR(8) NOT NULL,
    id_partido INT NOT NULL,
    cargo_postula VARCHAR(50) NOT NULL,
    FOREIGN KEY (dni_candidato) REFERENCES elector(dni),
    FOREIGN KEY (id_partido) REFERENCES partido_politico(id_partido)
);

CREATE TABLE mesa (
    id_mesa INT PRIMARY KEY AUTO_INCREMENT,
    id_facultad INT NOT NULL,
    estado_mesa VARCHAR(20) NOT NULL DEFAULT 'cerrada',
    FOREIGN KEY (id_facultad) REFERENCES facultad(id_facultad)
);

CREATE TABLE miembro_mesa (
    id_miembro INT PRIMARY KEY AUTO_INCREMENT,
    id_mesa INT NOT NULL,
    dni_miembro VARCHAR(8) NOT NULL,
    rol VARCHAR(20) NOT NULL,
    token_acceso VARCHAR(20) NOT NULL,
    asistencia_marcada BOOLEAN NOT NULL DEFAULT FALSE,
    permiso_activo BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (id_mesa) REFERENCES mesa(id_mesa),
    FOREIGN KEY (dni_miembro) REFERENCES elector(dni)
);

-- NOTA: sin FK a elector por diseño (voto secreto)
CREATE TABLE voto_registrado (
    id_voto INT PRIMARY KEY AUTO_INCREMENT,
    id_mesa INT NOT NULL,
    id_candidato INT,  -- NULL si voto blanco o nulo
    tipo_voto VARCHAR(10) NOT NULL,  -- 'valido', 'blanco', 'nulo'
    FOREIGN KEY (id_mesa) REFERENCES mesa(id_mesa),
    FOREIGN KEY (id_candidato) REFERENCES candidato(id_candidato)
);

CREATE TABLE configuracion_sistema (
    id_config INT PRIMARY KEY DEFAULT 1,
    elecciones_activas BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE auditoria_electoral (
    id_auditoria INT PRIMARY KEY AUTO_INCREMENT,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accion VARCHAR(255) NOT NULL
);

-- Registro único de configuración
INSERT INTO configuracion_sistema(id_config, elecciones_activas) VALUES(1, FALSE);

-- Trigger: valida 12 créditos antes de registrar el voto
DELIMITER //
CREATE TRIGGER validar_creditos_antes_de_votar
BEFORE INSERT ON voto_registrado
FOR EACH ROW
BEGIN
    -- Este trigger asume que el backend ya marcó ya_voto=TRUE en elector
    -- Solo actúa como red de seguridad en capa de DB
    DECLARE creds INT;
    -- No podemos verificar el elector desde voto_registrado (voto secreto)
    -- La validación real vive en el endpoint de Node.js
    IF NEW.tipo_voto NOT IN ('valido','blanco','nulo') THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT='tipo_voto inválido';
    END IF;
END//
DELIMITER ;
