/* ═══════════════════════════════════════════
   god.js — Panel Desarrollador UNACedula
   Lee el estado REAL de la BD al cargar.
═══════════════════════════════════════════ */

let eleccionesActivas = false;
let votosSimulados    = 0;

document.addEventListener('DOMContentLoaded', async () => {
  await cargarEstadoInicial();
  await cargarAuditLog();
});

/* ── Estado inicial desde la BD ── */
async function cargarEstadoInicial() {
  try {
    const data = await API.getEstadoGod();
    if (data.ok) {
      eleccionesActivas = data.elecciones_activas;
      votosSimulados    = data.votos_simulados || 0;
      actualizarSemaforo();
      document.getElementById('sim-count').textContent = votosSimulados;
    }
  } catch (e) {
    logAudit('⚠ No se pudo leer el estado inicial');
  }
}

/* ── Semáforo ── */
function actualizarSemaforo() {
  const label   = document.getElementById('sem-label');
  const dot     = document.getElementById('sem-dot');
  const dotWrap = document.getElementById('sem-dot-wrap');
  const btnText = document.getElementById('sem-btn-text');
  const btn     = document.getElementById('btn-toggle-sem');

  if (eleccionesActivas) {
    label.textContent        = '● ACTIVAS';
    label.style.color        = '#4ade80';
    dot.className            = 'semaforo__dot on';
    dotWrap.style.background = 'rgba(74,222,128,0.15)';
    btnText.textContent      = 'Desactivar Elecciones';
    btn.className            = 'god-toggle-btn deactivate';
  } else {
    label.textContent        = '● INACTIVAS';
    label.style.color        = '#f87171';
    dot.className            = 'semaforo__dot off';
    dotWrap.style.background = 'rgba(248,113,113,0.15)';
    btnText.textContent      = 'Activar Elecciones';
    btn.className            = 'god-toggle-btn activate';
  }
}

async function toggleElecciones() {
  const nuevo = !eleccionesActivas;
  try {
    const data = await API.toggleElecciones({ activas: nuevo });
    if (data.ok) {
      eleccionesActivas = nuevo;
      actualizarSemaforo();
      logAudit(`Elecciones ${nuevo ? 'ACTIVADAS' : 'DESACTIVADAS'} desde panel god`);
    } else {
      logAudit(`⚠ ${data.error}`);
    }
  } catch (e) {
    logAudit('⚠ Error al cambiar estado de elecciones');
  }
}

/* ── Acciones de contingencia ── */
async function godAction(tipo, params) {
  try {
    let data;
    if (tipo === 'habilitar_suplente') {
      data = await API.habilitarSuplente(params);
      if (data.ok) logAudit(`✔ Suplente ${params.num} habilitado — Mesa ${String(params.mesa).padStart(3,'0')}`);
    } else if (tipo === 'forzar_apertura') {
      data = await API.forzarApertura({ mesa: params.mesa });
      if (data.ok) logAudit(`✔ Mesa ${String(params.mesa).padStart(3,'0')} abierta forzadamente`);
    } else if (tipo === 'extender_horario') {
      data = await API.extenderHorario({});
      if (data.ok) logAudit('✔ Horario de votación extendido');
    }
    if (data && !data.ok) logAudit(`⚠ ${data.error}`);
  } catch (e) {
    logAudit(`⚠ Error: ${e.message}`);
  }
}

/* ── Simulación de votos ── */
async function simularVotos(cantidad, blanco = false) {
  try {
    const data = await API.simularVotos({ cantidad, blanco });
    if (data.ok) {
      votosSimulados += data.cantidad;
      document.getElementById('sim-count').textContent = votosSimulados;
      logAudit(`✔ ${data.cantidad} voto(s) simulado(s)${blanco ? ' (blanco)' : ''}`);
    } else {
      logAudit(`⚠ ${data.error}`);
    }
  } catch (e) {
    logAudit(`⚠ Error simulando votos: ${e.message}`);
  }
}

/* ── Reset demo ── */
function confirmarReset() {
  document.getElementById('modal-reset').style.display = 'flex';
}

async function ejecutarReset() {
  document.getElementById('modal-reset').style.display = 'none';
  try {
    const data = await API.resetDemo();
    if (data.ok) {
      votosSimulados = 0;
      document.getElementById('sim-count').textContent = 0;
      logAudit('✔ BD reiniciada — Demo limpia');
      await cargarEstadoInicial();
    } else {
      logAudit(`⚠ ${data.error}`);
    }
  } catch (e) {
    logAudit(`⚠ Error en reset: ${e.message}`);
  }
}

/* ── Audit log ── */
async function cargarAuditLog() {
  try {
    const data = await API.getAuditLog();
    const log  = document.getElementById('audit-log');
    if (data.ok && data.logs.length) {
      log.innerHTML = data.logs.map(l => {
        const fecha = new Date(l.fecha).toLocaleString('es-PE');
        return `<div class="audit-entry">› [${fecha}] ${l.descripcion}</div>`;
      }).join('');
    } else {
      log.innerHTML = '<div class="audit-entry">› Sin registros aún.</div>';
    }
  } catch (e) {
    document.getElementById('audit-log').innerHTML =
      '<div class="audit-entry">⚠ No se pudo cargar el log.</div>';
  }
}

function logAudit(msg) {
  const log   = document.getElementById('audit-log');
  const entry = document.createElement('div');
  entry.className = 'audit-entry new';
  const hora  = new Date().toLocaleTimeString('es-PE');
  entry.textContent = `› [${hora}] ${msg}`;
  log.prepend(entry);
  setTimeout(() => entry.classList.remove('new'), 2000);
  setTimeout(cargarAuditLog, 1500);
}
