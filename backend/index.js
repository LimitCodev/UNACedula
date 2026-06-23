const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);

const app = express();
app.use(express.json());
app.use(cors());

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 4000,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true }
});

// ==================== VOTANTE ====================

app.post('/votar/login', async (req, res) => {
  const { codigo_alumno, pin_acceso } = req.body;
  if (!codigo_alumno || !pin_acceso) return res.status(400).json({ error: 'Faltan campos' });
  try {
    const [[config]] = await db.query('SELECT elecciones_activas FROM configuracion_sistema WHERE id_config=1');
    if (!config.elecciones_activas) return res.status(403).json({ error: 'Las elecciones no están activas' });

    const [[elector]] = await db.query(
      'SELECT * FROM elector WHERE codigo_alumno=? AND pin_acceso=?',
      [codigo_alumno, pin_acceso]
    );
    if (!elector) return res.status(401).json({ error: 'Credenciales incorrectas' });
    if (elector.creditos_matriculados < 12) return res.status(403).json({ error: 'Estudiante Especial inhabilitado para votar' });
    if (elector.ya_voto) return res.status(403).json({ error: 'Usted ya emitió su voto' });

    res.json({ ok: true, dni: elector.dni, id_escuela: elector.id_escuela });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

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

    const [[mesa]] = await conn.query('SELECT estado_mesa FROM mesa WHERE id_mesa=?', [id_mesa]);
    if (!mesa || mesa.estado_mesa != 'abierta') {
      await conn.rollback();
      return res.status(403).json({ error: 'La mesa no está abierta' });
    }

    await conn.query(
      'INSERT INTO voto_registrado(id_mesa, id_candidato, tipo_voto) VALUES(?,?,?)',
      [id_mesa, tipo_voto == 'valido' ? id_candidato : null, tipo_voto]
    );
    await conn.query('UPDATE elector SET ya_voto=TRUE WHERE dni=?', [elector.dni]);
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

// ==================== MIEMBRO DE MESA ====================

app.post('/mesa/login', async (req, res) => {
  const { dni_usuario, token_mesa, id_mesa } = req.body;
  if (!dni_usuario || !token_mesa || !id_mesa) return res.status(400).json({ error: 'Faltan campos' });
  try {
    const [[config]] = await db.query('SELECT elecciones_activas FROM configuracion_sistema WHERE id_config=1');
    if (!config.elecciones_activas) return res.status(403).json({ error: 'Las elecciones no están activas' });

    const [[miembro]] = await db.query(
      `SELECT m.*, ms.estado_mesa FROM miembro_mesa m
             JOIN mesa ms ON m.id_mesa=ms.id_mesa
             WHERE m.dni_miembro=? AND m.token_acceso=? AND m.id_mesa=?`,
      [dni_usuario, token_mesa, id_mesa]
    );
    if (!miembro) return res.status(401).json({ error: 'Credenciales incorrectas' });

    if (miembro.estado_mesa == 'abierta' && !miembro.asistencia_marcada) {
      await db.query('UPDATE miembro_mesa SET permiso_activo=FALSE WHERE id_miembro=?', [miembro.id_miembro]);
      await db.query('INSERT INTO auditoria_electoral(accion) VALUES(?)',
        [`Miembro ${dni_usuario} llegó tarde a mesa ${id_mesa} - acceso administrativo revocado`]);
      return res.status(403).json({ error: 'Su Mesa ya se encuentra supervisada por otras personas y el proceso ha iniciado' });
    }
    if (!miembro.permiso_activo) return res.status(403).json({ error: 'Su permiso ha sido desactivado. Contacte al supervisor' });

    res.json({ ok: true, rol: miembro.rol, id_miembro: miembro.id_miembro, estado_mesa: miembro.estado_mesa });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/mesa/marcar-asistencia', async (req, res) => {
  const { id_miembro } = req.body;
  if (!id_miembro) return res.status(400).json({ error: 'Faltan campos' });
  try {
    await db.query('UPDATE miembro_mesa SET asistencia_marcada=TRUE WHERE id_miembro=?', [id_miembro]);
    await db.query('INSERT INTO auditoria_electoral(accion) VALUES(?)',
      [`Miembro ${id_miembro} marcó asistencia`]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/mesa/abrir', async (req, res) => {
  const { id_mesa, id_miembro } = req.body;
  if (!id_mesa || !id_miembro) return res.status(400).json({ error: 'Faltan campos' });
  try {
    // Verifica mínimo 2 miembros con asistencia marcada y permiso activo
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM miembro_mesa
             WHERE id_mesa=? AND asistencia_marcada=TRUE AND permiso_activo=TRUE`,
      [id_mesa]
    );
    if (total < 2) return res.status(403).json({ error: 'Se necesitan al menos 2 miembros presentes para abrir la mesa' });

    await db.query(`UPDATE mesa SET estado_mesa='abierta' WHERE id_mesa=?`, [id_mesa]);
    await db.query('INSERT INTO auditoria_electoral(accion) VALUES(?)',
      [`Mesa ${id_mesa} abierta por miembro ${id_miembro}`]);
    res.json({ ok: true, mensaje: 'Mesa abierta exitosamente' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/mesa/escrutar', async (req, res) => {
  const { id_mesa } = req.body;
  if (!id_mesa) return res.status(400).json({ error: 'Faltan campos' });
  try {
    await db.query(`UPDATE mesa SET estado_mesa='escrutada' WHERE id_mesa=?`, [id_mesa]);
    await db.query('INSERT INTO auditoria_electoral(accion) VALUES(?)',
      [`Mesa ${id_mesa} marcada como escrutada`]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ==================== RESULTADOS (para Chart.js) ====================

app.get('/resultados', async (req, res) => {
  try {
    const [votos] = await db.query(
      `SELECT c.cargo_postula, p.nombre_partido, p.logo_url,
                    COUNT(v.id_voto) as total_votos
             FROM voto_registrado v
             JOIN candidato c ON v.id_candidato=c.id_candidato
             JOIN partido_politico p ON c.id_partido=p.id_partido
             WHERE v.tipo_voto='valido'
             GROUP BY v.id_candidato`
    );
    const [[{ blancos }]] = await db.query(
      `SELECT COUNT(*) as blancos FROM voto_registrado WHERE tipo_voto='blanco'`
    );
    const [[{ nulos }]] = await db.query(
      `SELECT COUNT(*) as nulos FROM voto_registrado WHERE tipo_voto='nulo'`
    );
    res.json({ ok: true, votos, blancos, nulos });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.get('/resultados/mesa/:id_mesa', async (req, res) => {
  const { id_mesa } = req.params;
  try {
    const [votos] = await db.query(
      `SELECT tipo_voto, COUNT(*) as total FROM voto_registrado
             WHERE id_mesa=? GROUP BY tipo_voto`,
      [id_mesa]
    );
    res.json({ ok: true, votos });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ==================== MODO DIOS (Supervisor) ====================

app.post('/supervisor/toggle-elecciones', async (req, res) => {
  try {
    const [[config]] = await db.query('SELECT elecciones_activas FROM configuracion_sistema WHERE id_config=1');
    const nuevo = !config.elecciones_activas;
    await db.query('UPDATE configuracion_sistema SET elecciones_activas=? WHERE id_config=1', [nuevo]);
    await db.query('INSERT INTO auditoria_electoral(accion) VALUES(?)',
      [`Elecciones ${nuevo ? 'activadas' : 'desactivadas'} por Supervisor`]);
    res.json({ ok: true, elecciones_activas: nuevo });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/supervisor/habilitar-suplente', async (req, res) => {
  const { id_miembro } = req.body;
  if (!id_miembro) return res.status(400).json({ error: 'Faltan campos' });
  try {
    await db.query('UPDATE miembro_mesa SET permiso_activo=TRUE WHERE id_miembro=?', [id_miembro]);
    await db.query('INSERT INTO auditoria_electoral(accion) VALUES(?)',
      [`Suplente ${id_miembro} habilitado por Supervisor`]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/supervisor/forzar-apertura', async (req, res) => {
  const { id_mesa } = req.body;
  if (!id_mesa) return res.status(400).json({ error: 'Faltan campos' });
  try {
    await db.query(`UPDATE mesa SET estado_mesa='abierta' WHERE id_mesa=?`, [id_mesa]);
    await db.query('INSERT INTO auditoria_electoral(accion) VALUES(?)',
      [`Mesa ${id_mesa} forzada a abrir por Supervisor`]);
    res.json({ ok: true, mensaje: 'Mesa forzada a abrir' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/supervisor/seed-votos', async (req, res) => {
  const { cantidad, id_mesa, tipo_voto } = req.body;
  if (!cantidad || !id_mesa) return res.status(400).json({ error: 'Faltan campos' });
  try {
    // Obtiene candidatos disponibles para distribución aleatoria
    const [candidatos] = await db.query('SELECT id_candidato FROM candidato');
    if (candidatos.length == 0 && tipo_voto == 'valido') return res.status(400).json({ error: 'No hay candidatos registrados' });

    const inserts = [];
    for (let i = 0; i < cantidad; i++) {
      if (tipo_voto == 'blanco' || tipo_voto == 'nulo') {
        inserts.push([id_mesa, null, tipo_voto]);
      } else {
        const candidato = candidatos[Math.floor(Math.random() * candidatos.length)];
        inserts.push([id_mesa, candidato.id_candidato, 'valido']);
      }
    }
    await db.query(
      'INSERT INTO voto_registrado(id_mesa, id_candidato, tipo_voto) VALUES ?',
      [inserts]
    );
    await db.query('INSERT INTO auditoria_electoral(accion) VALUES(?)',
      [`Supervisor insertó ${cantidad} votos de tipo ${tipo_voto || 'valido'} en mesa ${id_mesa}`]);
    res.json({ ok: true, insertados: cantidad });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/supervisor/reset', async (req, res) => {
  try {
    await db.query('DELETE FROM voto_registrado');
    await db.query('UPDATE elector SET ya_voto=FALSE');
    await db.query('UPDATE mesa SET estado_mesa=\'cerrada\'');
    await db.query('INSERT INTO auditoria_electoral(accion) VALUES(?)',
      ['Reset general ejecutado por Supervisor']);
    res.json({ ok: true, mensaje: 'Sistema reiniciado a cero' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.get('/supervisor/auditoria', async (req, res) => {
  try {
    const [logs] = await db.query(
      'SELECT * FROM auditoria_electoral ORDER BY fecha_hora DESC LIMIT 100'
    );
    res.json({ ok: true, logs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ==================== CANDIDATOS Y MESAS ====================

app.get('/candidatos', async (req, res) => {
  try {
    const [candidatos] = await db.query(
      `SELECT c.id_candidato, c.cargo_postula,
                    e.dni, e.codigo_alumno,
                    p.nombre_partido, p.logo_url
             FROM candidato c
             JOIN elector e ON c.dni_candidato=e.dni
             JOIN partido_politico p ON c.id_partido=p.id_partido`
    );
    res.json({ ok: true, candidatos });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.get('/mesas', async (req, res) => {
  try {
    const [mesas] = await db.query(
      `SELECT m.*, f.nombre_facultad, f.siglas,
                    COUNT(mm.id_miembro) as total_miembros
             FROM mesa m
             JOIN facultad f ON m.id_facultad=f.id_facultad
             LEFT JOIN miembro_mesa mm ON m.id_mesa=mm.id_mesa
             GROUP BY m.id_mesa`
    );
    res.json({ ok: true, mesas });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`UNACedula API corriendo en puerto ${PORT}`));
