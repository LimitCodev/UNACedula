const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const db = mysql.createPool({
  host:               process.env.DB_HOST,
  port:               Number(process.env.DB_PORT),
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  ssl:                { rejectUnauthorized: true },
  waitForConnections: true,
  connectionLimit:    10,
});

const audit = (accion) =>
  db.query('INSERT INTO auditoria_electoral (accion) VALUES (?)', [accion]).catch(() => {});

app.get('/candidatos', async (req, res) => {
  try {
    const [candidatos] = await db.query(`
      SELECT c.id_candidato, p.nombre_partido, c.cargo_postula, e.dni AS nombre_candidato
      FROM candidato c
      JOIN partido_politico p ON c.id_partido    = p.id_partido
      JOIN elector          e ON c.dni_candidato = e.dni
      ORDER BY c.id_candidato
    `);
    res.json({ ok: true, candidatos });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/auth/miembro', async (req, res) => {
  const { dni_usuario, codigo_alumno, token_mesa } = req.body;
  if (!dni_usuario || !codigo_alumno || !token_mesa)
    return res.json({ ok: false, error: 'Campos incompletos.' });
  try {
    const [[elec]] = await db.query(
      'SELECT dni FROM elector WHERE dni = ? AND codigo_alumno = ?',
      [dni_usuario, codigo_alumno]
    );
    if (!elec?.length)
      return res.json({ ok: false, error: 'DNI o código incorrecto.' });

    const [[mm]] = await db.query(`
      SELECT mm.id_mesa, mm.rol, f.siglas AS facultad
      FROM miembro_mesa mm
      JOIN mesa     m ON mm.id_mesa    = m.id_mesa
      JOIN facultad f ON m.id_facultad = f.id_facultad
      WHERE mm.dni_miembro = ? AND mm.token_acceso = ? AND mm.permiso_activo = TRUE
    `, [dni_usuario, token_mesa]);

    if (!mm?.length)
      return res.json({ ok: false, error: 'Token de mesa incorrecto o sin permiso.' });

    const miembro = mm[0];
    await audit(`Login miembro: DNI ${dni_usuario} — Mesa ${miembro.id_mesa}`);
    res.json({ ok: true, rol: miembro.rol, id_mesa: miembro.id_mesa, facultad: miembro.facultad, token_mesa });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/auth/votante', async (req, res) => {
  const { dni_usuario, codigo_alumno, pin_acceso } = req.body;
  if (!dni_usuario || !codigo_alumno || !pin_acceso)
    return res.json({ ok: false, error: 'Campos incompletos.' });
  try {
    const [[cfg]] = await db.query(
      'SELECT elecciones_activas FROM configuracion_sistema WHERE id_config = 1'
    );
    if (!cfg?.[0]?.elecciones_activas)
      return res.json({ ok: false, error: 'Las elecciones no están activas.' });

    const [[el]] = await db.query(`
      SELECT e.*, es.id_facultad, f.siglas AS facultad
      FROM elector  e
      JOIN escuela  es ON e.id_escuela   = es.id_escuela
      JOIN facultad f  ON es.id_facultad = f.id_facultad
      WHERE e.dni = ? AND e.codigo_alumno = ? AND e.pin_acceso = ?
    `, [dni_usuario, codigo_alumno, pin_acceso]);

    if (!el?.length)
      return res.json({ ok: false, error: 'Credenciales incorrectas.' });

    const elector = el[0];
    if (elector.creditos_matriculados < 12)
      return res.json({ ok: false, error: 'Necesita mínimo 12 créditos matriculados.' });

    const [[mesa]] = await db.query(
      "SELECT id_mesa FROM mesa WHERE id_facultad = ? AND estado_mesa = 'abierta' LIMIT 1",
      [elector.id_facultad]
    );

    await audit(`Login votante: DNI ${dni_usuario}`);
    res.json({ ok: true, id_mesa: mesa?.[0]?.id_mesa || null, facultad: elector.facultad, ya_voto: !!elector.ya_voto });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/mesa/:id_mesa', async (req, res) => {
  const { id_mesa } = req.params;
  try {
    const [[mesa]] = await db.query(`
      SELECT m.id_mesa, m.estado_mesa, f.siglas AS facultad
      FROM mesa m JOIN facultad f ON m.id_facultad = f.id_facultad
      WHERE m.id_mesa = ?
    `, [id_mesa]);
    if (!mesa?.length) return res.json({ ok: false, error: 'Mesa no encontrada.' });
    const m = mesa[0];

    const [miembros] = await db.query(`
      SELECT rol, dni_miembro AS dni, token_acceso AS token, asistencia_marcada AS presente
      FROM miembro_mesa WHERE id_mesa = ? ORDER BY id_miembro
    `, [id_mesa]);

    const [[padron]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM elector e
      JOIN escuela es ON e.id_escuela  = es.id_escuela
      JOIN mesa    me ON me.id_mesa    = ?
      WHERE es.id_facultad = me.id_facultad
    `, [id_mesa]);

    const [[cands]] = await db.query('SELECT COUNT(*) AS total FROM candidato');

    res.json({
      ok:               true,
      numero_mesa:      m.id_mesa,
      facultad:         m.facultad,
      estado:           m.estado_mesa,
      total_padron:     padron[0]?.total || 0,
      total_candidatos: cands[0]?.total  || 0,
      presentes:        miembros.filter(x => x.presente).length,
      total_miembros:   miembros.length,
      miembros,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/mesa/asistencia', async (req, res) => {
  const { id_mesa, dni, token_mesa } = req.body;
  try {
    const [result] = await db.query(`
      UPDATE miembro_mesa SET asistencia_marcada = TRUE
      WHERE id_mesa = ? AND dni_miembro = ? AND token_acceso = ? AND permiso_activo = TRUE
    `, [id_mesa, dni, token_mesa]);

    if (result.affectedRows === 0)
      return res.json({ ok: false, error: 'Miembro no encontrado o token incorrecto.' });

    const [miembros] = await db.query(`
      SELECT rol, dni_miembro AS dni, token_acceso AS token, asistencia_marcada AS presente
      FROM miembro_mesa WHERE id_mesa = ? ORDER BY id_miembro
    `, [id_mesa]);

    await audit(`Asistencia marcada: DNI ${dni} — Mesa ${id_mesa}`);
    res.json({ ok: true, presentes: miembros.filter(x => x.presente).length, total_miembros: miembros.length, miembros });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/mesa/iniciar', async (req, res) => {
  const { id_mesa, dni } = req.body;
  try {
    const [[q]] = await db.query(
      'SELECT COUNT(*) AS presentes FROM miembro_mesa WHERE id_mesa = ? AND asistencia_marcada = TRUE',
      [id_mesa]
    );
    if ((q[0]?.presentes || 0) < 2)
      return res.json({ ok: false, error: 'Se requieren mínimo 2 miembros presentes.' });

    await db.query("UPDATE mesa SET estado_mesa = 'abierta' WHERE id_mesa = ?", [id_mesa]);
    await audit(`Mesa ${id_mesa} ABIERTA por DNI ${dni}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/mesa/:id_mesa/conteo', async (req, res) => {
  const { id_mesa } = req.params;
  try {
    const [[emitidos]] = await db.query(
      'SELECT COUNT(*) AS votos_emitidos FROM voto_registrado WHERE id_mesa = ?', [id_mesa]
    );
    const [[padron]] = await db.query(`
      SELECT COUNT(*) AS total_padron
      FROM elector e
      JOIN escuela es ON e.id_escuela  = es.id_escuela
      JOIN mesa    m  ON m.id_mesa     = ?
      WHERE es.id_facultad = m.id_facultad
    `, [id_mesa]);
    res.json({ ok: true, votos_emitidos: emitidos[0]?.votos_emitidos || 0, total_padron: padron[0]?.total_padron || 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/mesa/:id_mesa/avance', async (req, res) => {
  const { id_mesa } = req.params;
  try {
    const [[emitidos]] = await db.query(
      'SELECT COUNT(*) AS votos_emitidos FROM voto_registrado WHERE id_mesa = ?', [id_mesa]
    );
    const [[padron]] = await db.query(`
      SELECT COUNT(*) AS total_padron
      FROM elector e
      JOIN escuela es ON e.id_escuela  = es.id_escuela
      JOIN mesa    m  ON m.id_mesa     = ?
      WHERE es.id_facultad = m.id_facultad
    `, [id_mesa]);
    res.json({ ok: true, votos_emitidos: emitidos[0]?.votos_emitidos || 0, total_padron: padron[0]?.total_padron || 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/voto/emitir', async (req, res) => {
  const { dni_usuario, codigo_alumno, id_candidato, id_mesa } = req.body;
  try {
    const [[el]] = await db.query(
      'SELECT ya_voto, creditos_matriculados FROM elector WHERE dni = ? AND codigo_alumno = ?',
      [dni_usuario, codigo_alumno]
    );
    if (!el?.length)            return res.json({ ok: false, error: 'Elector no encontrado.' });
    if (el[0].ya_voto)          return res.json({ ok: false, error: 'Usted ya emitió su voto.' });
    if (el[0].creditos_matriculados < 12) return res.json({ ok: false, error: 'Créditos insuficientes.' });

    const tipo = id_candidato ? 'valido' : 'blanco';
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      await conn.query(
        'INSERT INTO voto_registrado (id_mesa, id_candidato, tipo_voto) VALUES (?, ?, ?)',
        [id_mesa, id_candidato || null, tipo]
      );
      await conn.query('UPDATE elector SET ya_voto = TRUE WHERE dni = ?', [dni_usuario]);
      await conn.commit();
    } catch (err) {
      await conn.rollback(); conn.release(); throw err;
    }
    conn.release();
    await audit(`Voto emitido — Mesa ${id_mesa} — tipo: ${tipo}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/stats/global', async (req, res) => {
  try {
    const [candidatos] = await db.query(`
      SELECT c.id_candidato, p.nombre_partido, e.dni AS nombre_candidato,
             COUNT(v.id_voto) AS votos_validos
      FROM candidato c
      JOIN partido_politico p ON c.id_partido    = p.id_partido
      JOIN elector          e ON c.dni_candidato = e.dni
      LEFT JOIN voto_registrado v ON v.id_candidato = c.id_candidato AND v.tipo_voto = 'valido'
      GROUP BY c.id_candidato ORDER BY c.id_candidato
    `);

    const [[totales]] = await db.query(`
      SELECT COUNT(*) AS total_votos,
             SUM(tipo_voto = 'valido') AS votos_validos,
             SUM(tipo_voto = 'blanco') AS votos_blancos,
             SUM(tipo_voto = 'nulo')   AS votos_nulos
      FROM voto_registrado
    `);

    const [por_facultad] = await db.query(`
      SELECT f.siglas AS facultad,
             COUNT(DISTINCT e.dni) AS total_padron,
             COUNT(v.id_voto)      AS total_votos,
             ROUND(COUNT(v.id_voto) * 100.0 / NULLIF(COUNT(DISTINCT e.dni), 0), 1) AS pct_participacion
      FROM facultad f
      LEFT JOIN escuela         es ON es.id_facultad = f.id_facultad
      LEFT JOIN elector          e ON e.id_escuela   = es.id_escuela
      LEFT JOIN mesa             m ON m.id_facultad  = f.id_facultad
      LEFT JOIN voto_registrado  v ON v.id_mesa      = m.id_mesa
      GROUP BY f.id_facultad, f.siglas
    `);

    res.json({
      ok: true, candidatos,
      total_votos:   totales[0]?.total_votos   || 0,
      votos_validos: totales[0]?.votos_validos  || 0,
      votos_blancos: totales[0]?.votos_blancos  || 0,
      votos_nulos:   totales[0]?.votos_nulos    || 0,
      por_facultad,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/stats/facultad/:facultad', async (req, res) => {
  const { facultad } = req.params;
  try {
    const [[padron]] = await db.query(`
      SELECT COUNT(DISTINCT e.dni) AS total_padron, SUM(e.ya_voto = TRUE) AS votos_emitidos
      FROM facultad f
      JOIN escuela es ON es.id_facultad = f.id_facultad
      JOIN elector  e ON e.id_escuela   = es.id_escuela
      WHERE f.siglas = ?
    `, [facultad]);

    const [candidatos] = await db.query(`
      SELECT p.nombre_partido, e2.dni AS nombre_candidato, COUNT(v.id_voto) AS votos
      FROM candidato c
      JOIN partido_politico p  ON c.id_partido    = p.id_partido
      JOIN elector          e2 ON c.dni_candidato = e2.dni
      LEFT JOIN voto_registrado v ON v.id_candidato = c.id_candidato
      LEFT JOIN mesa            m ON v.id_mesa      = m.id_mesa
      LEFT JOIN facultad        f ON m.id_facultad  = f.id_facultad AND f.siglas = ?
      GROUP BY c.id_candidato ORDER BY c.id_candidato
    `, [facultad]);

    res.json({ ok: true, ...padron[0], candidatos });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/god/toggle-elecciones', async (req, res) => {
  const { activas } = req.body;
  try {
    await db.query(
      'UPDATE configuracion_sistema SET elecciones_activas = ? WHERE id_config = 1',
      [activas ? 1 : 0]
    );
    await audit(`Elecciones ${activas ? 'ACTIVADAS' : 'DESACTIVADAS'}`);
    res.json({ ok: true, activas });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/god/forzar-apertura', async (req, res) => {
  const { mesa } = req.body;
  try {
    await db.query("UPDATE mesa SET estado_mesa = 'abierta' WHERE id_mesa = ?", [mesa]);
    await audit(`Apertura forzada — Mesa ${mesa}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/god/simular-votos', async (req, res) => {
  const { cantidad = 10, blanco = false } = req.body;
  try {
    const [candidatos] = await db.query('SELECT id_candidato FROM candidato');
    const [mesas]      = await db.query("SELECT id_mesa FROM mesa WHERE estado_mesa = 'abierta'");
    if (!mesas.length) return res.json({ ok: false, error: 'No hay mesas abiertas.' });

    const valores = [];
    for (let i = 0; i < cantidad; i++) {
      const id_mesa      = mesas[i % mesas.length].id_mesa;
      const id_candidato = blanco ? null : candidatos[i % candidatos.length].id_candidato;
      valores.push([id_mesa, id_candidato, blanco ? 'blanco' : 'valido']);
    }
    await db.query('INSERT INTO voto_registrado (id_mesa, id_candidato, tipo_voto) VALUES ?', [valores]);
    await audit(`${cantidad} votos simulados (blanco=${blanco})`);
    res.json({ ok: true, cantidad });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/god/reset-demo', async (req, res) => {
  try {
    await db.query('DELETE FROM voto_registrado');
    await db.query('UPDATE elector SET ya_voto = FALSE');
    await db.query('UPDATE miembro_mesa SET asistencia_marcada = FALSE');
    await db.query("UPDATE mesa SET estado_mesa = 'cerrada'");
    await audit('RESET DEMO — BD limpiada');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/god/audit-log', async (req, res) => {
  try {
    const [logs] = await db.query(
      'SELECT fecha_hora AS fecha, accion AS descripcion FROM auditoria_electoral ORDER BY fecha_hora DESC LIMIT 20'
    );
    res.json({ ok: true, logs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(8080, () => console.log('UNACedula backend UP :8080'));
