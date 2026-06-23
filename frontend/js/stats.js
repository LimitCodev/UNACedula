/* ══════════════════════════════════════════
   STATS — estadísticas electorales en vivo
══════════════════════════════════════════ */

const COLORES    = ['#023047', '#219ebc', '#fb8500'];
const FACULTADES = [
  { id:'FIPA',  nombre:'Fac. Ing. de Pesquería y Alimentos' },
  { id:'FCNM',  nombre:'Fac. de Ciencias Naturales y Matemáticas' },
  { id:'FIQ',   nombre:'Fac. de Ing. Química' },
  { id:'FCE',   nombre:'Fac. de Ciencias Económicas' },
  { id:'FIARN', nombre:'Fac. de Ing. Ambiental y Recursos Naturales' },
  { id:'FCC',   nombre:'Fac. de Ciencias Contables' },
  { id:'FCA',   nombre:'Fac. de Ciencias Administrativas' },
  { id:'FIEE',  nombre:'Fac. de Ing. Eléctrica y Electrónica' },
  { id:'FIIS',  nombre:'Fac. de Ing. Industrial y de Sistemas' },
  { id:'FCS',   nombre:'Fac. de Ciencias de la Salud' },
  { id:'FIME',  nombre:'Fac. de Ing. Mecánica-Energía' },
  { id:'FCED',  nombre:'Fac. de Ciencias de la Educación' },
];

let statsGlobal  = null;
let barChart     = null;
let pieChart     = null;
let statsInterval = null;
let facSelected  = null;

document.addEventListener('DOMContentLoaded', async () => {
  buildFacMap();
  buildFacFilter();
  await cargarStats();
  statsInterval = setInterval(cargarStats, 20000);
  document.getElementById('live-badge').style.display = 'flex';
});

/* ── CARGAR DATOS ── */
async function cargarStats() {
  try {
    const data = await API.getEstadisticas();
    if (!data.ok) return;
    statsGlobal = data;

    // Contadores
    document.getElementById('cnt-total').textContent   = (data.total_votos || 0).toLocaleString();
    document.getElementById('cnt-validos').textContent = (data.votos_validos || 0).toLocaleString();
    document.getElementById('cnt-blancos').textContent = (data.votos_blancos || 0).toLocaleString();
    document.getElementById('cnt-nulos').textContent   = (data.votos_nulos || 0).toLocaleString();

    // Tarjetas candidatos
    renderCandCards(data.candidatos || []);
    // Gráficos
    renderCharts(data);
    // Mini-bars facultades
    renderMiniBars(data.por_facultad || []);
    // Actualizar mapa
    updateMapColors(data.por_facultad || []);

  } catch {}
}

/* ── TARJETAS CANDIDATOS ── */
function renderCandCards(candidatos) {
  const total = candidatos.reduce((s, c) => s + (c.votos_validos || 0), 0);
  document.getElementById('cand-cards').innerHTML = candidatos.map((c, i) => {
    const pct = total > 0 ? ((c.votos_validos / total) * 100).toFixed(2) : 0;
    const color = COLORES[i] || '#6b7280';
    return `
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
          ${partyLogoSVG(i+1, 38)}
          <div>
            <p style="font-family:var(--bf);font-size:0.68rem;color:#9ca3af">${c.nombre_partido || `Lista ${i+1}`}</p>
            <p style="font-family:var(--tf);font-weight:800;font-size:0.9rem;color:var(--navy)">${c.nombre_candidato || c.nombre}</p>
          </div>
        </div>
        <p class="cand-card__pct" style="color:${color}">${pct}<span>%</span></p>
        <p class="cand-card__count">${(c.votos_validos || 0).toLocaleString()} votos válidos</p>
        <div class="progress" style="margin-top:10px">
          <div class="progress__fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join('');
}

/* ── GRÁFICOS ── */
function renderCharts(data) {
  const candidatos = data.candidatos || [];
  const labels     = candidatos.map((c, i) => c.nombre_candidato?.split(' ').slice(1,3).join(' ') || `Lista ${i+1}`);
  const votos      = candidatos.map(c => c.votos_validos || 0);

  // Barras
  if (barChart) barChart.destroy();
  const ctxBar = document.getElementById('chart-barras').getContext('2d');
  barChart = new Chart(ctxBar, {
    type: 'bar',
    data: { labels, datasets: [{ data: votos, backgroundColor: COLORES, borderRadius: 8, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: '#f0f4f8' }, ticks: { font: { family: 'Inter', size: 10 } } }, x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 } } } }
    }
  });

  // Pie
  const pieLabels = [...labels, 'Blancos', 'Nulos'];
  const pieData   = [...votos, data.votos_blancos || 0, data.votos_nulos || 0];
  const pieColors = [...COLORES, '#9ca3af', '#ef4444'];

  if (pieChart) pieChart.destroy();
  const ctxPie = document.getElementById('chart-pie').getContext('2d');
  pieChart = new Chart(ctxPie, {
    type: 'doughnut',
    data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieColors, borderWidth: 2, borderColor: '#fff' }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: false } } }
  });

  // Leyenda pie
  document.getElementById('pie-legend').innerHTML = pieLabels.map((l, i) =>
    `<div class="legend-item"><span class="legend-dot" style="background:${pieColors[i]}"></span><span class="legend-label">${l}</span></div>`
  ).join('');
}

/* ── MAP SVG ── */
function buildFacMap() {
  const cols = 4, rows = 3;
  const W = 110, H = 72, gx = 14, gy = 12, ox = 30, oy = 32;
  const g = document.getElementById('fac-blocks');
  g.innerHTML = '';

  FACULTADES.forEach((f, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x   = ox + col * (W + gx);
    const y   = oy + row * (H + gy);

    const block = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    block.setAttribute('class', 'fac-block');
    block.setAttribute('id', `fac-${f.id}`);
    block.setAttribute('data-id', f.id);

    block.innerHTML = `
      <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="8" fill="#1e3a5f" stroke="#2d4f7a" stroke-width="1"/>
      <text x="${x+W/2}" y="${y+H/2-8}" text-anchor="middle" font-family="Montserrat,sans-serif" font-size="10" font-weight="800" fill="#fff">${f.id}</text>
      <text x="${x+W/2}" y="${y+H/2+8}" text-anchor="middle" font-family="Inter,sans-serif" font-size="7.5" fill="rgba(255,255,255,0.7)" id="map-votes-${f.id}">— votos</text>`;

    block.addEventListener('mouseenter', () => mostrarDetalleFac(f.id));
    block.addEventListener('click',      () => { facSelected = f.id; mostrarDetalleFac(f.id); });
    g.appendChild(block);
  });
}

function updateMapColors(porFacultad) {
  porFacultad.forEach(f => {
    const rect = document.querySelector(`#fac-${f.facultad} rect`);
    const txt  = document.getElementById(`map-votes-${f.facultad}`);
    if (!rect) return;
    const pct = f.pct_participacion || 0;
    const alpha = 0.3 + (pct / 100) * 0.7;
    rect.setAttribute('fill', `rgba(33,158,188,${alpha.toFixed(2)})`);
    rect.setAttribute('stroke', pct >= 100 ? '#ffb703' : '#2d4f7a');
    if (txt) txt.textContent = `${f.total_votos || 0} votos`;
  });
}

function buildFacFilter() {
  const sel = document.getElementById('filter-facultad');
  FACULTADES.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id; opt.textContent = f.id;
    sel.appendChild(opt);
  });
}

function filtrarFacultad(id) {
  FACULTADES.forEach(f => {
    const block = document.getElementById(`fac-${f.id}`);
    if (!block) return;
    block.style.opacity = (!id || f.id === id) ? '1' : '0.3';
  });
  if (id) mostrarDetalleFac(id);
}

async function mostrarDetalleFac(facId) {
  document.getElementById('hover-empty').style.display = 'none';
  document.getElementById('hover-data').style.display  = 'block';

  // Highlight en mapa
  FACULTADES.forEach(f => {
    const block = document.getElementById(`fac-${f.id}`);
    if (block) {
      const rect = block.querySelector('rect');
      if (rect) rect.setAttribute('stroke-width', f.id === facId ? '2.5' : '1');
    }
  });

  try {
    const data = await API.getStatsFacultad(facId);
    const fac  = FACULTADES.find(f => f.id === facId);
    document.getElementById('hover-nombre').textContent = fac?.nombre || facId;
    document.getElementById('hover-padron').textContent = `Padrón: ${data.total_padron || '—'} · Emitidos: ${data.votos_emitidos || 0}`;

    const cands = data.candidatos || [];
    document.getElementById('hover-cands').innerHTML = cands.map((c, i) => `
      <div class="hover-cand-row">
        ${partyLogoSVG(i+1, 18)}
        <span class="hover-cand-name">${c.nombre_candidato?.split(' ').slice(1,3).join(' ') || `Lista ${i+1}`}</span>
        <span class="hover-cand-votes" style="color:${COLORES[i]}">${c.votos || 0}</span>
      </div>`).join('');
  } catch {
    document.getElementById('hover-padron').textContent = 'No disponible';
    document.getElementById('hover-cands').innerHTML = '';
  }
}

/* ── MINI BARS ── */
function renderMiniBars(porFacultad) {
  const sorted = [...porFacultad].sort((a, b) => (b.pct_participacion || 0) - (a.pct_participacion || 0));
  document.getElementById('mini-bars').innerHTML = sorted.map(f => {
    const pct = Math.min(100, f.pct_participacion || 0);
    return `
      <div class="mini-bar-row" onclick="mostrarDetalleFac('${f.facultad}')">
        <span class="mini-bar-id">${f.facultad}</span>
        <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${pct}%;background:${pct>=100?'var(--gold)':'var(--teal)'}"></div></div>
        <span class="mini-bar-pct">${pct.toFixed(0)}%</span>
      </div>`;
  }).join('');
}

window.addEventListener('beforeunload', () => { if (statsInterval) clearInterval(statsInterval); });
