/* ══════════════════════════════════════════
   UNACEDULA — API LAYER
   Reemplaza BASE_URL con tu URL de backend
══════════════════════════════════════════ */

const BASE_URL = 'https://unacedula-rosj609o.b4a.run';

/* ── UTILIDADES ── */
async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  return data;
}

/* ── SESSION ── */
const Session = {
  set: (key, val) => localStorage.setItem(`unac_${key}`, JSON.stringify(val)),
  get: (key) => { try { return JSON.parse(localStorage.getItem(`unac_${key}`)); } catch { return null; } },
  clear: () => Object.keys(localStorage).filter(k => k.startsWith('unac_')).forEach(k => localStorage.removeItem(k)),
};

/* ── UI HELPERS ── */
function showAlert(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert--${type}`;
  el.innerHTML = `${msg} <button class="alert__close" onclick="this.parentElement.style.display='none'">✕</button>`;
  el.style.display = 'flex';
}

function setLoading(btnId, loading, originalHTML) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<svg class="spin" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" opacity=".25"/><path d="M21 12a9 9 0 0 1-9 9"/></svg> Procesando...`
    : originalHTML;
}

function partyLogoSVG(num, size = 40) {
  const colors = ['#023047', '#219ebc', '#fb8500'];
  const icons = [
    '<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" fill="currentColor"/>',
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    '<path d="M4 19h16M4 15h16M4 11h10M4 7h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  ];
  const c = colors[(num - 1) % 3];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="color:${c}">${icons[(num - 1) % 3]}</svg>`;
}

function logout() {
  Session.clear();
  window.location.href = 'index.html';
}

/* ══════════════════════════════════════════
   API CALLS
══════════════════════════════════════════ */
const API = {
  /* AUTH */
  loginMiembro: (body) => apiFetch('/auth/miembro', { method: 'POST', body: JSON.stringify(body) }),
  loginVotante: (body) => apiFetch('/auth/votante', { method: 'POST', body: JSON.stringify(body) }),

  /* CANDIDATOS */
  getCandidatos: () => apiFetch('/candidatos'),

  /* MESA */
  getMesaInfo: (id_mesa) => apiFetch(`/mesa/${id_mesa}`),
  marcarAsistencia: (body) => apiFetch('/mesa/asistencia', { method: 'POST', body: JSON.stringify(body) }),
  iniciarMesa: (body) => apiFetch('/mesa/iniciar', { method: 'POST', body: JSON.stringify(body) }),
  getConteoMesa: (id_mesa) => apiFetch(`/mesa/${id_mesa}/conteo`),

  /* VOTANTE */
  emitirVoto: (body) => apiFetch('/voto/emitir', { method: 'POST', body: JSON.stringify(body) }),
  getAvance: (id_mesa) => apiFetch(`/mesa/${id_mesa}/avance`),

  /* STATS */
  getEstadisticas: () => apiFetch('/stats/global'),
  getStatsFacultad: (facultad) => apiFetch(`/stats/facultad/${facultad}`),

  /* GOD */
  toggleElecciones: (body) => apiFetch('/god/toggle-elecciones', { method: 'POST', body: JSON.stringify(body) }),
  forzarApertura: (body) => apiFetch('/god/forzar-apertura', { method: 'POST', body: JSON.stringify(body) }),
  simularVotos: (body) => apiFetch('/god/simular-votos', { method: 'POST', body: JSON.stringify(body) }),
  resetDemo: () => apiFetch('/god/reset-demo', { method: 'POST' }),
  getAuditLog: () => apiFetch('/god/audit-log'),
};
