/* ══════════════════════════════════════════
   VOTANTE — lógica del portal de voto
══════════════════════════════════════════ */

let candidatos      = [];
let seleccionado    = null; // índice 0-based
let avanceInterval  = null;
let tiempoInterval  = null;

document.addEventListener('DOMContentLoaded', async () => {
  const usuario = Session.get('usuario');
  if (!usuario) { window.location.href = 'index.html'; return; }

  // Completar banner
  document.getElementById('banner-dni-codigo').textContent = `DNI: ${usuario.dni} · Código: ${usuario.codigo}`;
  document.getElementById('chip-mesa').textContent         = `Mesa Nº ${usuario.id_mesa || '—'}`;
  document.getElementById('chip-facultad').textContent     = usuario.facultad || '—';

  // Verificar si ya votó
  if (usuario.ya_voto) { mostrarVotado(usuario); return; }

  await cargarCandidatos();
  await actualizarAvance(usuario);
  avanceInterval = setInterval(() => actualizarAvance(usuario), 15000);
  iniciarReloj();

  document.getElementById('view-loading').style.display = 'none';
  document.getElementById('view-voto').style.display    = 'flex';
});

/* ── CARGA CANDIDATOS ── */
async function cargarCandidatos() {
  try {
    const data = await API.getCandidatos();
    if (!data.ok || !data.candidatos.length) { showAlert('votante-alert', 'error', 'No se pudieron cargar los candidatos.'); return; }
    candidatos = data.candidatos;
    renderBallot();
  } catch {
    showAlert('votante-alert', 'error', 'Error de conexión al cargar candidatos.');
  }
}

function renderBallot() {
  const colors = ['#023047', '#219ebc', '#fb8500'];
  const container = document.getElementById('ballot-rows');
  container.innerHTML = candidatos.map((c, i) => `
    <div class="ballot-row" id="ballot-row-${i}" onclick="seleccionarCandidato(${i})">
      <div class="ballot-row__num" id="num-${i}" style="color:${colors[i]}">${String(i+1).padStart(2,'0')}</div>
      <div class="ballot-row__logo">
        ${partyLogoSVG(i+1, 44)}
        <p class="ballot-row__party">${c.nombre_partido || `Lista ${i+1}`}</p>
      </div>
      <div class="ballot-row__info">
        <p class="ballot-row__role">CANDIDATO A RECTOR</p>
        <p class="ballot-row__name">${c.nombre_candidato || c.nombre}</p>
        <p class="ballot-row__bio">${c.biografia || ''}</p>
      </div>
      <div class="ballot-row__radio">
        <div class="radio-circle" id="radio-${i}">
          <div class="radio-dot" id="dot-${i}"></div>
        </div>
      </div>
    </div>`).join('');
}

/* ── SELECCIÓN ── */
function seleccionarCandidato(i) {
  const colores = ['#023047', '#219ebc', '#fb8500'];

  // Reset anterior
  candidatos.forEach((_, j) => {
    const row   = document.getElementById(`ballot-row-${j}`);
    const radio = document.getElementById(`radio-${j}`);
    const dot   = document.getElementById(`dot-${j}`);
    const num   = document.getElementById(`num-${j}`);
    row.style.outline   = 'none';
    radio.style.borderColor = '#d1d5db';
    dot.style.display   = 'none';
    num.style.background = 'transparent';
    num.style.color      = colores[j];
  });

  // Aplicar selección
  seleccionado = i;
  const c = colores[i];
  const row   = document.getElementById(`ballot-row-${i}`);
  const radio = document.getElementById(`radio-${i}`);
  const dot   = document.getElementById(`dot-${i}`);
  const num   = document.getElementById(`num-${i}`);

  row.style.outline        = `2px solid ${c}`;
  radio.style.borderColor  = c;
  dot.style.display        = 'block';
  dot.style.background     = c;
  num.style.background     = c;
  num.style.color          = '#fff';

  // Habilitar botón
  const btn = document.getElementById('btn-votar');
  btn.disabled = false;
  document.getElementById('btn-votar-text').textContent = `Votar por Lista ${i+1}: ${candidatos[i].nombre_partido || ''}`;
}

/* ── MODAL ── */
function abrirModal() {
  if (seleccionado === null) return;
  const c = candidatos[seleccionado];
  document.getElementById('modal-cand-party').textContent = `Lista ${seleccionado+1}: ${c.nombre_partido || ''}`;
  document.getElementById('modal-cand-party').style.color = ['#023047','#219ebc','#fb8500'][seleccionado];
  document.getElementById('modal-cand-name').textContent  = c.nombre_candidato || c.nombre;
  document.getElementById('modal-logo').innerHTML = partyLogoSVG(seleccionado+1, 40);
  document.getElementById('modal-confirmar').style.display = 'flex';
}

function cerrarModal() {
  document.getElementById('modal-confirmar').style.display = 'none';
}

/* ── CONFIRMAR VOTO ── */
async function confirmarVoto() {
  const usuario = Session.get('usuario');
  const btn = document.getElementById('btn-confirmar');
  btn.disabled = true;
  btn.innerHTML = '<svg class="spin" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" opacity=".25"/><path d="M21 12a9 9 0 0 1-9 9"/></svg> Registrando...';

  try {
    const data = await API.emitirVoto({
      dni_usuario:     usuario.dni,
      codigo_alumno:   usuario.codigo,
      id_candidato:    candidatos[seleccionado].id_candidato || candidatos[seleccionado].id,
      id_mesa:         usuario.id_mesa,
    });

    cerrarModal();

    if (!data.ok) {
      showAlert('votante-alert', 'error', data.error || 'No se pudo registrar el voto.');
      btn.disabled = false;
      btn.innerHTML = '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> Confirmar Voto';
      return;
    }

    clearInterval(avanceInterval);
    clearInterval(tiempoInterval);
    mostrarVotado({ ...usuario, ya_voto: true }, seleccionado);
    Session.set('usuario', { ...usuario, ya_voto: true });

  } catch {
    cerrarModal();
    showAlert('votante-alert', 'error', 'Error de conexión. Intente de nuevo.');
    btn.disabled = false;
    btn.innerHTML = '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> Confirmar Voto';
  }
}

/* ── PANTALLA VOTADO ── */
function mostrarVotado(usuario, idx = null) {
  document.getElementById('view-loading').style.display = 'none';
  document.getElementById('view-voto').style.display    = 'none';
  document.getElementById('view-votado').style.display  = 'flex';

  if (idx !== null && candidatos[idx]) {
    const c = candidatos[idx];
    document.getElementById('voted-name').textContent  = c.nombre_candidato || c.nombre;
    document.getElementById('voted-party').textContent = c.nombre_partido || `Lista ${idx+1}`;
    document.getElementById('voted-logo').innerHTML    = partyLogoSVG(idx+1, 48);
  }
}

/* ── AVANCE ── */
async function actualizarAvance(usuario) {
  try {
    const data = await API.getAvance(usuario.id_mesa);
    if (!data.ok) return;
    const padron   = data.total_padron   || 0;
    const emitidos = data.votos_emitidos || 0;
    const pct      = padron > 0 ? ((emitidos / padron) * 100).toFixed(1) : 0;
    document.getElementById('av-padron').textContent   = padron;
    document.getElementById('av-emitidos').textContent = emitidos;
    document.getElementById('av-pct').textContent      = `${pct}%`;
    document.getElementById('av-progress').style.width = `${pct}%`;
  } catch {}
}

/* ── RELOJ CUENTA REGRESIVA ── */
function iniciarReloj() {
  function tick() {
    const fin    = new Date('2026-11-15T17:00:00');
    const ahora  = new Date();
    const diff   = Math.max(0, fin - ahora);
    const h      = Math.floor(diff / 3600000);
    const m      = Math.floor((diff % 3600000) / 60000);
    document.getElementById('av-tiempo').textContent = `${h}h ${m}min`;
  }
  tick();
  tiempoInterval = setInterval(tick, 60000);
}
