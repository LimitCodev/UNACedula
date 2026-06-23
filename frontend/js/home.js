/* ══════════════════════════════════════════
   HOME — lógica de sección y login
══════════════════════════════════════════ */

let currentSection = null;

const MIEMBRO_INFO = [
  ['Mesa', 'Según tu asignación'],
  ['Rol', 'Miembro de Mesa'],
  ['Jornada', '15 Nov 2026'],
  ['Hora instalación', '07:30 a.m.'],
];
const VOTANTE_INFO = [
  ['Elección', 'Rector UNAC 2026'],
  ['Horario', '08:00 – 17:00 hrs'],
  ['Candidatos', '3 listas inscritas'],
  ['Tu voto', 'Secreto e irrepetible'],
];

/* Carga candidatos en la lista del panel derecho */
async function loadCandidatos() {
  try {
    const data = await API.getCandidatos();
    if (!data.ok || !data.candidatos.length) return;
    const list = document.getElementById('candidate-list');
    list.innerHTML = '<p class="candidate-list__hint">Selecciona una opción para comenzar</p>';
    data.candidatos.forEach((c, i) => {
      list.innerHTML += `
        <div class="candidate-item">
          <div>${partyLogoSVG(i + 1, 32)}</div>
          <div class="candidate-item__info">
            <p class="candidate-item__party">Lista ${i + 1}: ${c.nombre_partido || 'Lista ' + (i+1)}</p>
            <p class="candidate-item__name">${c.nombre_candidato || c.nombre || ''}</p>
          </div>
        </div>`;
    });
  } catch {}
}

function selectSection(sec) {
  currentSection = sec;

  // Highlight active button
  document.getElementById('btn-miembro').classList.remove('active', 'active--teal');
  document.getElementById('btn-votante').classList.remove('active', 'active--teal');
  if (sec === 'miembro') document.getElementById('btn-miembro').classList.add('active');
  if (sec === 'votante') document.getElementById('btn-votante').classList.add('active--teal');

  // Show login panel
  document.getElementById('panel-default').style.display = 'none';
  document.getElementById('panel-login').style.display  = 'flex';
  document.getElementById('panel-login').style.flexDirection = 'column';

  // Reset fields
  document.getElementById('input-dni').value = '';
  document.getElementById('input-codigo').value = '';
  document.getElementById('input-pw').value = '';
  document.getElementById('login-alert').style.display = 'none';

  if (sec === 'miembro') {
    document.getElementById('login-step-sub').textContent = 'Paso 1 de 2 — Ingreso como Miembro de Mesa';
    document.getElementById('form-title').textContent = 'Miembro de Mesa';
    document.getElementById('pw-label').textContent = 'Token de Mesa';
    document.getElementById('input-pw').placeholder = 'Contraseña asignada a la mesa';
    document.getElementById('login-btn').className = 'btn btn--gold btn--full btn--lg';
    document.getElementById('login-btn-text').textContent = 'Ingresar como Miembro';
    document.getElementById('login-step-num').className = '';
    document.getElementById('form-card').className = 'form-card';
    document.getElementById('form-icon').className = 'form-card__icon';
    document.getElementById('form-info').className = 'form-info';
    document.getElementById('form-info').querySelector('.form-info__title').textContent = '📋 Datos de tu mesa';
    renderInfoRows(MIEMBRO_INFO);
  } else {
    document.getElementById('login-step-sub').textContent = 'Paso 1 de 2 — Ingreso como Votante';
    document.getElementById('form-title').textContent = 'Votante';
    document.getElementById('pw-label').textContent = 'PIN de Acceso';
    document.getElementById('input-pw').placeholder = 'PIN de 4 dígitos';
    document.getElementById('login-btn').className = 'btn btn--teal btn--full btn--lg';
    document.getElementById('login-btn-text').textContent = 'Acceder a Votar';
    document.getElementById('login-step-num').className = 'login-panel__step-num--teal';
    document.getElementById('form-card').className = 'form-card form-card--teal';
    document.getElementById('form-icon').className = 'form-card__icon form-card__icon--teal';
    document.getElementById('form-info').className = 'form-info form-info--teal';
    document.getElementById('form-info').querySelector('.form-info__title').textContent = '🗳️ Información electoral';
    renderInfoRows(VOTANTE_INFO);
  }
}

function renderInfoRows(rows) {
  const container = document.getElementById('form-info-rows');
  container.innerHTML = rows.map(([k, v]) => `
    <div class="form-info__row">
      <span class="form-info__key">${k}</span>
      <span class="form-info__val">${v}</span>
    </div>`).join('');
}

function togglePw() {
  const input = document.getElementById('input-pw');
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function submitLogin() {
  const dni     = document.getElementById('input-dni').value.trim();
  const codigo  = document.getElementById('input-codigo').value.trim();
  const pw      = document.getElementById('input-pw').value.trim();

  if (!dni || !codigo || !pw) {
    showAlert('login-alert', 'error', 'Complete todos los campos para continuar.');
    return;
  }

  const originalHTML = `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> <span id="login-btn-text">${currentSection === 'miembro' ? 'Ingresar como Miembro' : 'Acceder a Votar'}</span>`;
  setLoading('login-btn', true, originalHTML);

  try {
    let data;
    if (currentSection === 'miembro') {
      data = await API.loginMiembro({ dni_usuario: dni, codigo_alumno: codigo, token_mesa: pw });
    } else {
      data = await API.loginVotante({ dni_usuario: dni, codigo_alumno: codigo, pin_acceso: pw });
    }

    if (!data.ok) {
      setLoading('login-btn', false, originalHTML);
      showAlert('login-alert', 'error', data.error || 'Credenciales incorrectas. Verifique sus datos.');
      return;
    }

    showAlert('login-alert', 'success', '¡Acceso concedido! Ingresando al sistema...');

    // Guardar sesión
    Session.set('usuario', { dni, codigo, ...data });

    setTimeout(() => {
      window.location.href = currentSection === 'miembro' ? 'mesa.html' : 'votante.html';
    }, 700);

  } catch (e) {
    setLoading('login-btn', false, originalHTML);
    showAlert('login-alert', 'error', 'Error de conexión con el servidor. Intente de nuevo.');
  }
}

// Init
document.addEventListener('DOMContentLoaded', loadCandidatos);
