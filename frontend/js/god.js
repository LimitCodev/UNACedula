/* ══════════════════════════════════════════
   GOD MODE — panel de control del desarrollador
══════════════════════════════════════════ */

let eleccionesActivas = true;
let simCount          = 0;
let auditInterval     = null;

document.addEventListener('DOMContentLoaded', () => {
  cargarAudit();
  auditInterval = setInterval(cargarAudit, 10000);
});

/* ── SEMÁFORO ── */
async function toggleElecciones() {
  const btn = document.getElementById('btn-toggle-sem');
  btn.disabled = true;

  try {
    const nuevoEstado = !eleccionesActivas;
    const data = await API.toggleElecciones({ activas: nuevoEstado });
    if (!data.ok) { btn.disabled = false; return; }

    eleccionesActivas = nuevoEstado;
    actualizarSemaforo();
    agregarAuditLocal(`Elecciones ${eleccionesActivas ? 'ACTIVADAS' : 'DESACTIVADAS'} por desarrollador`);
  } catch {
    agregarAuditLocal('Error al cambiar estado de elecciones');
  }
  btn.disabled = false;
}

function actualizarSemaforo() {
  const dot     = document.getElementById('sem-dot');
  const label   = document.getElementById('sem-label');
  const wrap    = document.getElementById('sem-dot-wrap');
  const btnText = document.getElementById('sem-btn-text');
  const btn     = document.getElementById('btn-toggle-sem');

  if (eleccionesActivas) {
    dot.className   = 'semaforo__dot on';
    label.textContent = '● ACTIVAS';
    label.style.color = '#4ade80';
    wrap.style.background = 'rgba(74,222,128,0.15)';
    btn.className   = 'god-toggle-btn deactivate';
    btnText.textContent = 'Desactivar Elecciones';
  } else {
    dot.className   = 'semaforo__dot off';
    label.textContent = '● INACTIVAS';
    label.style.color = '#f87171';
    wrap.style.background = 'rgba(248,113,113,0.15)';
    btn.className   = 'god-toggle-btn activate';
    btnText.textContent = 'Activar Elecciones';
  }
}

/* ── ACCIONES DE CONTINGENCIA ── */
async function godAction(tipo, params) {
  try {
    let data;
    if (tipo === 'forzar_apertura') {
      data = await API.forzarApertura(params);
      agregarAuditLocal(`Mesa ${params.mesa} abierta por desarrollador`);
    } else if (tipo === 'extender_horario') {
      data = await API.toggleElecciones({ extender: true });
      agregarAuditLocal('Horario extendido 30 minutos');
    } else {
      // habilitar_suplente u otras acciones
      data = await apiFetch(`/god/${tipo}`, { method: 'POST', body: JSON.stringify(params) });
      agregarAuditLocal(`${tipo} ejecutado — Mesa ${params.mesa || ''}`);
    }
    if (data && !data.ok) agregarAuditLocal(`Error: ${data.error || tipo}`);
  } catch {
    agregarAuditLocal(`Error de conexión en acción: ${tipo}`);
  }
}

/* ── SIMULACIÓN DE VOTOS ── */
async function simularVotos(cantidad, blanco = false) {
  try {
    const data = await API.simularVotos({ cantidad, blanco });
    if (data.ok) {
      simCount += cantidad;
      document.getElementById('sim-count').textContent = simCount;
      agregarAuditLocal(`${cantidad} ${blanco ? 'votos blancos' : 'votos'} simulados exitosamente`);
    }
  } catch {
    agregarAuditLocal('Error al simular votos');
  }
}

/* ── RESET ── */
function confirmarReset() {
  document.getElementById('modal-reset').style.display = 'flex';
}

async function ejecutarReset() {
  document.getElementById('modal-reset').style.display = 'none';
  try {
    const data = await API.resetDemo();
    if (data.ok) {
      simCount = 0;
      document.getElementById('sim-count').textContent = '0';
      agregarAuditLocal('⚠ Base de datos reiniciada. Todos los votos eliminados.');
    }
  } catch {
    agregarAuditLocal('Error al reiniciar la base de datos');
  }
}

/* ── AUDIT LOG ── */
async function cargarAudit() {
  try {
    const data = await API.getAuditLog();
    if (!data.ok || !data.logs?.length) return;
    renderAudit(data.logs);
  } catch {}
}

function renderAudit(logs) {
  const container = document.getElementById('audit-log');
  container.innerHTML = logs.slice(0, 10).map((l, i) =>
    `<div class="audit-entry ${i===0?'new':''}">› ${l.fecha || ''} — <span style="color:${i===0?'#86efac':'#4ade80'}">${l.descripcion || l.mensaje || JSON.stringify(l)}</span></div>`
  ).join('');
}

function agregarAuditLocal(msg) {
  const now  = new Date().toISOString().replace('T',' ').slice(0,19);
  const container = document.getElementById('audit-log');
  const entry = document.createElement('div');
  entry.className = 'audit-entry new';
  entry.textContent = `› ${now} — ${msg}`;
  container.insertBefore(entry, container.firstChild);
  // Limitar a 10
  while (container.children.length > 10) container.removeChild(container.lastChild);
}

window.addEventListener('beforeunload', () => { if (auditInterval) clearInterval(auditInterval); });
