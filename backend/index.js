const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Pool de conexiones a TiDB Serverless
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 4000,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true }  // TiDB requiere SSL
});

// --- ENDPOINT 1: Login de miembro de mesa ---
app.post('/mesa/login', async (req, res) => {
  const { dni_usuario, token_mesa, id_mesa } = req.body;
  if (!dni_usuario || !token_mesa || !id_mesa) {
    return res.status(400).json({ error: 'Faltan campos' });
  }
  try {
    // Validar que las elecciones estén activas
    const [[config]] = await db.query(
      'SELECT elecciones_activas FROM configuracion_sistema WHERE id_config=1'
    );
    if (!config.elecciones_activas) {
      return res.status(403).json({ error: 'Las elecciones no están activas' });
    }

    const [[miembro]] = await db.query(
      `SELECT m.*, ms.estado_mesa
             FROM miembro_mesa m
             JOIN mesa ms ON m.id_mesa=ms.id_mesa
             WHERE m.dni_miembro=? AND m.token_acceso=? AND m.id_mesa=?`,
      [dni_usuario, token_mesa, id_mesa]
    );

    if (!miembro) return res.status(401).json({ error: 'Credenciales incorrectas' });

    // Tardanza: mesa ya abierta y el miembro no había marcado asistencia
    if (miembro.estado_mesa == 'abierta' && !miembro.asistencia_marcada) {
      await db.query(
        'UPDATE miembro_mesa SET permiso_activo=FALSE WHERE id_miembro=?',
        [miembro.id_miembro]
      );
      await db.query(
        'INSERT INTO auditoria_electoral(accion) VALUES(?)',
        [`Miembro ${dni_usuario} llegó tarde a mesa ${id_mesa} - acceso administrativo revocado`]
      );
      return res.status(403).json({
        error: 'Su Mesa ya se encuentra supervisada por otras personas y el proceso ha iniciado'
      });
    }

    if (!miembro.permiso_activo) {
      return res.status(403).json({ error: 'Su permiso ha sido desactivado. Contacte al supervisor' });
    }

    res.json({ ok: true, rol: miembro.rol, id_miembro: miembro.id_miembro });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- ENDPOINT 2: Login de votante ---
app.post('/votar/login', async (req, res) => {
  const { codigo_alumno, pin_acceso } = req.body;
  if (!codigo_alumno || !pin_acceso) {
    return res.status(400).json({ error: 'Faltan campos' });
  }
  try {
    const [[config]] = await db.query(
      'SELECT elecciones_activas FROM configuracion_sistema WHERE id_config=1'
    );
    if (!config.elecciones_activas) {
      return res.status(403).json({ error: 'Las elecciones no están activas' });
    }

    const [[elector]] = await db.query(
      'SELECT * FROM elector WHERE codigo_alumno=? AND pin_acceso=?',
      [codigo_alumno, pin_acceso]
    );
    if (!elector) return res.status(401).json({ error: 'Credenciales incorrectas' });

    // Regla de los 12 créditos
    if (elector.creditos_matriculados < 12) {
      return res.status(403).json({
        error: 'Estudiante Especial inhabilitado para votar'
      });
    }
    if (elector.ya_voto) {
      return res.status(403).json({ error: 'Usted ya emitió su voto' });
    }

    res.json({ ok: true, dni: elector.dni, id_escuela: elector.id_escuela });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- ENDPOINT 3: Emitir voto ---
app.post('/votar/emitir', async (req, res) => {
  const { codigo_alumno, pin_acceso, id_candidato, tipo_voto, id_mesa } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[elector]] = await conn.query(
      'SELECT * FROM elector WHERE codigo_alumno=? AND pin_acceso=? FOR UPDATE',
      [codigo_alumno, pin_acceso]
    );
    if (!elector || elector.creditos_matriculados < 12 || elector.ya_voto) {
      await conn.rollback();
      return res.status(403).json({ error: 'Voto no permitido' });
    }

    const [[mesa]] = await conn.query(
      'SELECT estado_mesa FROM mesa WHERE id_mesa=?',
      [id_mesa]
    );
    if (mesa.estado_mesa != 'abierta') {
      await conn.rollback();
      return res.status(403).json({ error: 'La mesa no está abierta' });
    }

    // Insertar voto (sin DNI - voto secreto)
    await conn.query(
      'INSERT INTO voto_registrado(id_mesa, id_candidato, tipo_voto) VALUES(?,?,?)',
      [id_mesa, tipo_voto == 'valido' ? id_candidato : null, tipo_voto]
    );

    // Marcar elector como ya votó
    await conn.query(
      'UPDATE elector SET ya_voto=TRUE WHERE dni=?',
      [elector.dni]
    );

    await conn.commit();
    res.json({ ok: true, mensaje: 'Voto registrado con éxito' });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Error al registrar voto' });
  } finally {
    conn.release();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`UNACedula API corriendo en puerto ${PORT}`));
