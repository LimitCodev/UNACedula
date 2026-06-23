/* ══════════════════════════════════════════
   MESA — lógica del panel de miembro
══════════════════════════════════════════ */

let mesaData    = null;
let intervalId  = null;
let asistenciaMarcada = false;
let mesaAbierta = false;

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  const usuario = Session.get('usuario');
  if (!usuario) { window.location.href = 'index.html'; return; }

  // Banner de bienvenida
  document.getElementById('banner-title').textContent = `Bienvenido, ${usuario.rol || 'Miembro de Mesa'}`;
  document.getElementById('banner-sub').textContent   = `DNI: ${usuario.dni} · Código: ${usuario.codigo}`;

  await cargarMesa(usuario);
});

async function cargarMesa(usuario) {
  try {
    const data = await API.getMesaInfo(usuario.id_mesa);
    if (!data.ok) { showAlert('mesa-alert', 'error', 'No se pudo cargar la información de la mesa.'); return; }

    mesaData = data;

    // Tags
    document.getElementById('tag-mesa').textContent     = `Mesa Nº ${data.numero_mesa}`;
    document.getElementById('tag-facultad').textContent = data.facultad || '—';
    document.getElementById('acta-mesa-num').textContent = `Mesa Nº ${data.numero_mesa}`;
    document.getElementById('info-candidatos').textContent = `${data.total_candidatos || 3} listas inscritas`;
    document.getElementById('info-electores').textContent  = `${data.total_padron || '—'} estudiantes`;
    document.getElementById('total-padron').textContent    = data.total_padron || '—';
    document.getElementById('votos-restantes').textContent = data.total_padron || '—';

    renderRoster(data.miembros || []);
    actualizarEstadoMesa(data.estado || 'CERRADA');
    actualizarQuorum(data.presentes || 0, data.total_miembros || 2);

    if (data.estado === 'ABIERTA') {
      mesaAbierta = true;
      iniciarConteoLive();
    }

  } catch (e) {
    showAlert('mesa-alert', 'error', 'Error de conexión al cargar la mesa.');
  }
}

function renderRoster(miembros) {
  const container = document.getElementById('roster-list');
  if (!miembros.length) { container.innerHTML = '<p style="font-size:0.75rem;color:#9ca3af">Sin datos de miembros.</p>'; return; }

  const roles = ['Presidente', 'Secretario', 'Tercer Miembro'];
  container.innerHTML = miembros.map((m, i) => `
    <div class="roster-row ${m.presente ? 'present' : ''}">
      <div class="roster-row__avatar">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
      <div style="flex:1">
        <p class="roster-row__name">${roles[i] || 'Miembro'}</p>
        <p class="roster-row__sub">DNI: ${m.dni || '—'} · ${m.token || '—'}</p>
      </div>
      <span class="roster-row__status">${m.presente ? 'Presente' : 'Ausente'}</span>
    </div>`).join('');
}

function actualizarEstadoMesa(estado) {
  const el = document.getElementById('estado-val');
  if (estado === 'ABIERTA') {
    el.innerHTML = '● ABIERTA';
    el.style.color = '#10b981';
    document.getElementById('btn-mesa').disabled = true;
    document.getElementById('btn-mesa').innerHTML = `<svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Mesa Abierta`;
    document.getElementById('row-mesa').classList.add('done');
  } else {
    el.innerHTML = '● CERRADA';
    el.style.color = '#ffb703';
  }
}

function actualizarQuorum(presentes, total) {
  const pct = Math.min(100, (presentes / total) * 100);
  document.getElementById('quorum-label').textContent  = `Quórum: ${presentes}/${total} miembros presentes`;
  document.getElementById('progress-quorum').style.width = `${pct}%`;
  const listo = presentes >= total;
  const statusEl = document.getElementById('quorum-status');
  statusEl.textContent = listo ? '✓ LISTO' : 'Pendiente';
  statusEl.className   = `quorum-status ${listo ? 'ready' : 'pending'}`;
  document.getElementById('btn-mesa').disabled = !listo || mesaAbierta;
}

/* ── ACCIONES ── */
async function marcarAsistencia() {
  if (asistenciaMarcada) return;
  const usuario = Session.get('usuario');
  const btn = document.getElementById('btn-asistencia');

  btn.disabled = true;
  btn.textContent = 'Marcando...';

  try {
    const data = await API.marcarAsistencia({ id_mesa: usuario.id_mesa, dni: usuario.dni, token_mesa: usuario.token_mesa });
    if (!data.ok) {
      showAlert('mesa-alert', 'error', data.error || 'No se pudo marcar asistencia.');
      btn.disabled = false; btn.textContent = 'Marcar Asistencia'; return;
    }
    asistenciaMarcada = true;
    btn.innerHTML = `<svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Marcado`;
    document.getElementById('row-asistencia').classList.add('done');

    actualizarQuorum(data.presentes, data.total_miembros);
    renderRoster(data.miembros || []);
    showAlert('mesa-alert', 'success', 'Asistencia registrada correctamente.');
  } catch {
    showAlert('mesa-alert', 'error', 'Error de conexión.');
    btn.disabled = false; btn.textContent = 'Marcar Asistencia';
  }
}

async function iniciarMesa() {
  const usuario = Session.get('usuario');
  const btn = document.getElementById('btn-mesa');
  btn.disabled = true;
  btn.textContent = 'Iniciando...';

  try {
    const data = await API.iniciarMesa({ id_mesa: usuario.id_mesa, dni: usuario.dni });
    if (!data.ok) {
      showAlert('mesa-alert', 'error', data.error || 'No se pudo iniciar la mesa.');
      btn.disabled = false; return;
    }
    mesaAbierta = true;
    actualizarEstadoMesa('ABIERTA');
    showAlert('mesa-alert', 'success', `¡Mesa Nº ${mesaData?.numero_mesa} declarada ABIERTA! La votación ha comenzado oficialmente.`);
    iniciarConteoLive();
  } catch {
    showAlert('mesa-alert', 'error', 'Error de conexión.');
    btn.disabled = false;
  }
}

/* ── CONTEO LIVE ── */
function iniciarConteoLive() {
  document.getElementById('live-badge').style.display = 'flex';
  document.getElementById('counter-hint').style.display = 'none';
  actualizarConteo();
  intervalId = setInterval(actualizarConteo, 8000);
}

async function actualizarConteo() {
  const usuario = Session.get('usuario');
  try {
    const data = await API.getConteoMesa(usuario.id_mesa);
    if (!data.ok) return;

    const emitidos  = data.votos_emitidos || 0;
    const padron    = data.total_padron   || 0;
    const restantes = Math.max(0, padron - emitidos);
    const pct       = padron > 0 ? Math.round((emitidos / padron) * 100) : 0;

    document.getElementById('votos-emitidos').textContent    = emitidos;
    document.getElementById('votos-restantes').textContent   = restantes;
    document.getElementById('pct-participacion').textContent = `${pct}%`;
    document.getElementById('total-padron').textContent      = padron;
    document.getElementById('progress-votos').style.width    = `${pct}%`;
  } catch {}
}

window.addEventListener('beforeunload', () => { if (intervalId) clearInterval(intervalId); });
