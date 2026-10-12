'use strict';
// ───────── Интерфейс ─────────

const ui = {
  tool: 'inspect', brush: 80, seed: 'arc:ecoli', speed: 1, prevSpeed: 1,
  chartTab: 'pop', chartHover: -1,
  strains: [], strainSpecies: new Map(),
  painting: false, drag: null,
  lastKpi: 0, lastSpecies: 0, lastChart: 0, lastIns: 0, lastBrain: 0,
  logSeen: 0, tps: 0, started: false, lastGoals: 0,
};
const $ = (id) => document.getElementById(id);


// ───── штаммы (сохранённые геномы) ─────
const STRAIN_KEY = 'mikromir.strains.v1';
function loadStrains() {
  try { ui.strains = JSON.parse(localStorage.getItem(STRAIN_KEY) || '[]').filter(s => s.t && s.w && s.w.length === N_W); }
  catch (e) { ui.strains = []; }
}
function saveStrains() {
  try { localStorage.setItem(STRAIN_KEY, JSON.stringify(ui.strains)); return true; }
  catch (e) { return false; }
}

function fillSeedSelect() {
  const sel = $('seed');
  const cur = ui.seed;
  sel.innerHTML = '';
  const g1 = document.createElement('optgroup'); g1.label = t('seed.g1');
  const costTxt = (v) => isGenesis() ? ` — ${seedCost(v)} ${t('pts')}` : '';
  for (const a of ARCHETYPES) g1.appendChild(new Option(t('arc.' + a.key + '.name') + costTxt('arc:' + a.key), 'arc:' + a.key));
  sel.appendChild(g1);
  const g2 = document.createElement('optgroup'); g2.label = t('seed.g2');
  g2.appendChild(new Option(t('seed.random') + costTxt('random'), 'random'));
  sel.appendChild(g2);
  if (ui.strains.length) {
    const g3 = document.createElement('optgroup'); g3.label = t('seed.g3');
    ui.strains.forEach((s, i) => g3.appendChild(new Option(`★ ${s.name} (${t('gen.short')} ${s.gen})` + costTxt('strain:' + i), 'strain:' + i)));
    sel.appendChild(g3);
  }
  sel.value = cur;
  if (sel.value !== cur) { sel.value = 'arc:ecoli'; ui.seed = 'arc:ecoli'; }
  updateSeedCost();
}

function updateSeedCost() {
  $('seed-cost').textContent = isGenesis() ? t('seed.cost', { n: seedCost(ui.seed) }) : '';
}

function spawnSeed(x, y) {
  const v = ui.seed;
  const cost = seedCost(v);
  if (!trySpend(cost)) {
    simLog('log.noPoints', { cost, have: Math.floor(sim.mode.budget) }, 'warn');
    return;
  }
  let out = [];
  if (v.startsWith('arc:')) {
    const a = ARCHETYPES.find(a => a.key === v.slice(4));
    const n = a.traits.size > 0.3 ? 4 : 12;
    out = spawnArchetype(a, n, x, y, 40);
  } else if (v === 'random') {
    out = spawnRandom(10, x, y, 45);
  } else if (v.startsWith('strain:')) {
    const i = +v.slice(7), s = ui.strains[i];
    if (!s) return;
    const g = new Genome(Float32Array.from(s.t), Float32Array.from(s.w));
    let sp = ui.strainSpecies.get(i);
    if (!sp || !speciesMap.has(sp.id)) {
      sp = new Species(g, null, { name: s.name, latin: s.latin, hue: s.hue });
      sp.established = true;
      ui.strainSpecies.set(i, sp);
    }
    out = spawnGenome(g, sp, maxRadiusOf(g.t) > 7 ? 4 : 10, x, y, 40);
  }
  if (out.length) simLog('log.seeded', { sp: out[0].sp, n: out.length }, 'info');
}

// ───── инициализация ─────
function initUI() {
  loadStrains();
  fillSeedSelect();

  $('tools').addEventListener('click', e => {
    const b = e.target.closest('button[data-tool]');
    if (b) setTool(b.dataset.tool);
  });
  $('brush').addEventListener('input', e => { ui.brush = +e.target.value; $('brush-v').textContent = ui.brush; });
  $('seed').addEventListener('change', e => { ui.seed = e.target.value; updateSeedCost(); });

  document.querySelectorAll('[data-layer]').forEach(cb => {
    cb.checked = R.layers[cb.dataset.layer];
    cb.addEventListener('change', () => { R.layers[cb.dataset.layer] = cb.checked; updateFieldImage(); });
  });

  // настройки
  for (const key of ['light', 'nutrient', 'dayLength', 'mutMul', 'popCap']) {
    const inp = $('s-' + key), out = inp.parentElement.querySelector('output');
    inp.value = SETTINGS[key];
    const show = () => { out.textContent = key === 'popCap' || key === 'dayLength' ? inp.value : (+inp.value).toFixed(2); };
    show();
    inp.addEventListener('input', () => { SETTINGS[key] = +inp.value; show(); });
  }
  for (const key of ['dayCycle', 'brownian', 'learning', 'lamarck', 'panspermia', 'phages']) {
    const inp = $('s-' + key);
    inp.checked = SETTINGS[key];
    inp.addEventListener('change', () => {
      SETTINGS[key] = inp.checked;
      if (key === 'lamarck') simLog(inp.checked ? 'log.lamarckOn' : 'log.lamarckOff', null, 'info');
    });
  }

  // режимы и меню
  buildMenu();
  $('btn-restart').addEventListener('click', () => startMode(sim.preset));
  $('btn-menu').addEventListener('click', showMenu);
  $('btn-menu2').addEventListener('click', showMenu);
  $('menu-continue').addEventListener('click', hideMenu);
  $('menu-help').addEventListener('click', () => toggleModal(true));
  $('win-continue').addEventListener('click', () => $('win').classList.add('hidden'));
  $('win-menu').addEventListener('click', () => { $('win').classList.add('hidden'); showMenu(); });
  $('btn-fit').addEventListener('click', () => { cam.follow = false; fitCamera(); });
  $('hud').addEventListener('click', () => {
    if (window.innerWidth <= 980) { $('right').classList.toggle('open'); $('left').classList.remove('open'); }
    $('right').scrollTop = 0;
  });

  // скорость
  $('speed').addEventListener('click', e => {
    const b = e.target.closest('button[data-speed]');
    if (b) setSpeed(+b.dataset.speed);
  });

  // графики
  $('chart-tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    ui.chartTab = b.dataset.tab;
    document.querySelectorAll('#chart-tabs button').forEach(x => x.classList.toggle('on', x === b));
    drawChart();
  });
  const ch = $('chart');
  ch.addEventListener('pointermove', e => { const r = ch.getBoundingClientRect(); ui.chartHoverX = e.clientX - r.left; drawChart(); });
  ch.addEventListener('pointerleave', () => { ui.chartHoverX = null; drawChart(); });

  // инспектор
  $('ins-follow').addEventListener('click', toggleFollow);
  $('ins-kill').addEventListener('click', () => { const s = sim.selected; if (s && !s.dead) s.die('killed'); });
  $('ins-clone').addEventListener('click', () => {
    const s = sim.selected;
    if (!s) return;
    spawnGenome(s.g, s.sp, 5, s.x, s.y, 40);
    simLog('log.cloned', { sp: s.sp }, 'info');
  });
  $('ins-save').addEventListener('click', () => {
    const s = sim.selected;
    if (!s) return;
    ui.strains.push({
      name: `${s.sp.title} #${s.id}`, latin: s.sp.latin, hue: s.sp.hue, gen: s.gen,
      t: Array.from(s.g.t), w: Array.from(s.g.w), saved: Date.now(),
    });
    if (ui.strains.length > 30) ui.strains.shift();
    const ok = saveStrains();
    fillSeedSelect();
    simLog(ok ? 'log.strainSaved' : 'log.strainSession', { name: `${s.sp.title} #${s.id}` }, 'species');
  });

  // справка
  $('btn-help').addEventListener('click', () => toggleModal(true));
  $('modal-close').addEventListener('click', () => toggleModal(false));
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') toggleModal(false); });
  $('modal-tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-mtab]');
    if (!b) return;
    document.querySelectorAll('#modal-tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.mtab').forEach(x => x.classList.toggle('hidden', x.dataset.mtab !== b.dataset.mtab));
  });
  buildZoo();

  // язык
  document.querySelectorAll('[data-setlang]').forEach(b => b.addEventListener('click', () => changeLang(b.dataset.setlang)));

  // мобильные панели
  $('btn-left').addEventListener('click', () => { $('left').classList.toggle('open'); $('right').classList.remove('open'); });
  $('btn-right').addEventListener('click', () => { $('right').classList.toggle('open'); $('left').classList.remove('open'); });

  initPointer();
  initKeys();
  onWorldReset();
}

function onWorldReset() {
  $('log').innerHTML = '';
  $('toasts').innerHTML = '';
  ui.lastChart = ui.lastSpecies = 0;
  selectCell(null);
}

function setTool(tool) {
  ui.tool = tool;
  document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
  $('tool-hint').textContent = t('hint.' + tool);
  $('row-brush').classList.toggle('hidden', !(tool === 'nutrient' || tool === 'toxin' || tool === 'laser'));
  $('row-seed').classList.toggle('hidden', tool !== 'spawn');
}

function setSpeed(s) {
  if (s !== 0) ui.prevSpeed = s;
  ui.speed = s;
  document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
}

function toggleModal(show) {
  $('modal').classList.toggle('hidden', !show);
}

function toggleFollow() {
  cam.follow = !cam.follow && !!sim.selected;
  $('ins-follow').classList.toggle('on', cam.follow);
  $('ins-follow').textContent = t(cam.follow ? 'ins.unfollow' : 'ins.follow');
  if (cam.follow && cam.z < 1.2) cam.z = 1.6;
}

function selectCell(c) {
  sim.selected = c;
  if (!c) { cam.follow = false; }
  $('inspector').classList.toggle('hidden', !c);
  $('inspector-empty').classList.toggle('hidden', !!c);
  $('ins-follow').classList.toggle('on', cam.follow);
  $('ins-follow').textContent = t(cam.follow ? 'ins.unfollow' : 'ins.follow');
  if (c) {
    buildTraitRows(c);
    ui.lastIns = 0;
    if (window.innerWidth <= 980) $('right').classList.add('open');
  }
}

function findCellAt(wx, wy) {
  let best = null, bd = Infinity;
  const pick = 14 / cam.z;
  for (const c of sim.cells) {
    const d = Math.hypot(c.x - wx, c.y - wy);
    const lim = Math.max(c.r * 1.6, pick);
    if (d < lim && d < bd) { bd = d; best = c; }
  }
  return best;
}

// ───── мышь / касание ─────
function initPointer() {
  const cv = R.canvas;
  const upd = (e) => {
    const r = cv.getBoundingClientRect();
    R.mouse.x = e.clientX - r.left; R.mouse.y = e.clientY - r.top;
    [R.mouse.wx, R.mouse.wy] = screenToWorld(R.mouse.x, R.mouse.y);
  };
  cv.addEventListener('pointerenter', () => { R.mouse.inside = true; });
  cv.addEventListener('pointerleave', () => { R.mouse.inside = false; ui.painting = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  // щипок двумя пальцами — масштаб
  const touches = new Map();
  let pinch = null;
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z };
        ui.drag = null; ui.painting = false;
        return;
      }
    }
    upd(e);
    R.mouse.inside = true;
    cv.setPointerCapture(e.pointerId);
    const pan = e.button !== 0 || ui.tool === 'inspect';
    ui.drag = { x: R.mouse.x, y: R.mouse.y, cx: cam.x, cy: cam.y, moved: false, pan, button: e.button };
    if (e.button === 0) {
      if (ui.tool === 'nutrient' || ui.tool === 'toxin' || ui.tool === 'laser') ui.painting = true;
      else if (ui.tool === 'lamp') { env.lamp.x = R.mouse.wx; env.lamp.y = R.mouse.wy; }
      else if (ui.tool === 'spawn') spawnSeed(R.mouse.wx, R.mouse.wy);
    }
  });
  cv.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()];
      cam.z = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d), 0.15, 14);
      return;
    }
    upd(e);
    const d = ui.drag;
    if (!d) return;
    const dx = R.mouse.x - d.x, dy = R.mouse.y - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.pan && d.moved) {
      cam.follow = false;
      cam.x = d.cx - dx / cam.z; cam.y = d.cy - dy / cam.z;
    } else if (d.button === 0 && ui.tool === 'lamp') {
      const ddx = R.mouse.wx - WORLD.cx, ddy = R.mouse.wy - WORLD.cy, dd = Math.hypot(ddx, ddy), lim = WORLD.dishR - 20;
      env.lamp.x = dd > lim ? WORLD.cx + ddx / dd * lim : R.mouse.wx;
      env.lamp.y = dd > lim ? WORLD.cy + ddy / dd * lim : R.mouse.wy;
    }
  });
  const end = (e) => {
    touches.delete(e.pointerId);
    if (pinch) { if (touches.size < 2) pinch = null; ui.drag = null; return; }
    const d = ui.drag;
    ui.painting = false;
    ui.drag = null;
    if (d && !d.moved && d.button === 0 && ui.tool === 'inspect') selectCell(findCellAt(R.mouse.wx, R.mouse.wy));
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    upd(e);
    const [wx, wy] = [R.mouse.wx, R.mouse.wy];
    const nz = clamp(cam.z * Math.exp(-e.deltaY * 0.0015), 0.15, 14);
    cam.z = nz;
    if (!cam.follow) {
      cam.x = wx - (R.mouse.x - R.W / R.dpr / 2) / nz;
      cam.y = wy - (R.mouse.y - R.H / R.dpr / 2) / nz;
    }
  }, { passive: false });
}

function applyTools(dt) {
  if (!ui.painting || !R.mouse.inside) return;
  const { wx, wy } = R.mouse;
  if (ui.tool === 'nutrient') brushField(env.N, wx, wy, ui.brush, 3 * dt);
  else if (ui.tool === 'toxin') brushField(env.T, wx, wy, ui.brush, 2.5 * dt);
  else if (ui.tool === 'laser') {
    const r2 = ui.brush * ui.brush;
    for (const c of sim.cells) {
      if (c.dead) continue;
      const dx = c.x - wx, dy = c.y - wy;
      if (dx * dx + dy * dy < r2) c.die('laser');
    }
    let w = 0;
    for (const c of sim.cells) if (!c.dead) sim.cells[w++] = c;
    sim.cells.length = w;
  }
}

function initKeys() {
  const tools = { q: 'inspect', w: 'nutrient', e: 'toxin', r: 'lamp', t: 'spawn', y: 'laser' };
  const toolsRu = { 'й': 'inspect', 'ц': 'nutrient', 'у': 'toxin', 'к': 'lamp', 'е': 'spawn', 'н': 'laser' };
  window.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (menuOpen() && !['escape', 'm', 'ь', 'h', 'р'].includes(k)) return;
    if (k === ' ') { e.preventDefault(); setSpeed(ui.speed === 0 ? ui.prevSpeed : 0); }
    else if (k >= '1' && k <= '5') setSpeed([1, 3, 10, 40, 999][+k - 1]);
    else if (tools[k] || toolsRu[k]) setTool(tools[k] || toolsRu[k]);
    else if (k === 'f' || k === 'а') { cam.follow = false; fitCamera(); }
    else if (k === 'c' || k === 'с') toggleFollow();
    else if (k === 'h' || k === 'р') toggleModal($('modal').classList.contains('hidden'));
    else if (k === 'm' || k === 'ь') { if (menuOpen()) { if (ui.started) hideMenu(); } else showMenu(); }
    else if (k === 'escape') {
      if (!$('modal').classList.contains('hidden')) toggleModal(false);
      else if (menuOpen() && ui.started) hideMenu();
      else selectCell(null);
    }
  });
}

// ───── периодическое обновление ─────
function updateUI(now) {
  if (now - ui.lastKpi > 250) { ui.lastKpi = now; updateKpis(); flushLogs(); }
  if (isGenesis() && now - ui.lastGoals > 400) { ui.lastGoals = now; updateGoals(); }
  if (now - ui.lastSpecies > 1000) { ui.lastSpecies = now; updateSpecies(); }
  if (now - ui.lastChart > 1000) { ui.lastChart = now; drawChart(); }
  if (sim.selected) {
    if (now - ui.lastIns > 150) { ui.lastIns = now; updateInspector(); }
    if (now - ui.lastBrain > 70) { ui.lastBrain = now; drawBrain(); }
  }
}

function updateKpis() {
  $('k-time').textContent = fmtTime(sim.time);
  const day = env.day > 0.45;
  $('k-daylbl').textContent = t(!SETTINGS.dayCycle ? 'kpi.light' : day ? 'kpi.day' : 'kpi.night');
  $('k-day').textContent = (day ? '☀ ' : '☾ ') + Math.round(env.day * 100) + '%';
  $('k-pop').textContent = fmtNum(sim.cells.length);
  let alive = 0;
  for (const s of speciesMap.values()) if (s.count > 0) alive++;
  $('k-species').textContent = alive;
  $('k-gen').textContent = sim.maxGen;
  $('k-born').textContent = fmtNum(sim.totalBorn);
  $('k-tps').textContent = Math.round(ui.tps);
}

function flushLogs() {
  const logs = sim.logs;
  if (!logs.length) return;
  const last = logs[logs.length - 1].at;
  const fresh = logs.filter(l => l.at > ui.logSeen);
  if (!fresh.length) return;
  ui.logSeen = last;
  const box = $('log');
  for (const l of fresh) box.prepend(logRow(l));
  while (box.children.length > 60) box.lastChild.remove();
  const ts = $('toasts');
  for (const l of fresh.slice(-3)) {
    if (l.key === 'log.seeded' || l.key === 'log.cloned') continue;
    const el = document.createElement('div');
    el.className = 'toast ' + l.kind;
    el.textContent = logText(l);
    ts.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; }, 5500);
    setTimeout(() => el.remove(), 6200);
  }
  while (ts.children.length > 4) ts.firstChild.remove();
}

function logText(l) { return t(l.key, l.params); }
function logRow(l) {
  const d = document.createElement('div');
  d.className = l.kind;
  const tm = document.createElement('time');
  tm.textContent = fmtTime(l.t);
  d.appendChild(tm);
  d.appendChild(document.createTextNode(logText(l)));
  return d;
}
function rebuildLog() {
  const box = $('log');
  box.innerHTML = '';
  for (const l of sim.logs.slice(-60)) box.prepend(logRow(l));
}

function updateSpecies() {
  const list = [...speciesMap.values()].filter(s => s.count > 0).sort((a, b) => b.count - a.count);
  const extinct = [...speciesMap.values()].filter(s => s.count === 0 && s.established).length;
  $('species-note').textContent = t('sp.note', { a: list.length, b: extinct });
  const max = list.length ? list[0].count : 1;
  const box = $('species');
  box.innerHTML = '';
  for (const s of list.slice(0, 14)) {
    const row = document.createElement('div');
    row.className = 'sp-row';
    row.title = t('sp.tt');
    row.innerHTML = `<span class="dot" style="--c:${s.cSolid}"></span>
      <div class="nm"><div>${s.title}</div><small>${s.latin} · ${t('cls.' + s.cls).toLowerCase()}${s.parentName ? ' · ' + t('sp.from') + ' ' + s.parentName : ''}</small>
      <div class="sp-bar" style="--c:${s.cSolid};width:${Math.max(3, s.count / max * 100)}%"></div></div>
      <div class="ct">${s.count}<small>${t('gen.short')} ${s.maxGen}</small></div>`;
    row.addEventListener('click', () => {
      const cs = sim.cells.filter(c => c.sp === s);
      if (!cs.length) return;
      selectCell(pick(cs));
      cam.follow = true;
      if (cam.z < 1.4) cam.z = 2;
      $('ins-follow').classList.add('on');
      $('ins-follow').textContent = t('ins.unfollow');
    });
    box.appendChild(row);
  }
  if (list.length > 14) {
    const m = document.createElement('div');
    m.className = 'hint';
    m.textContent = t('sp.more', { n: list.length - 14 });
    box.appendChild(m);
  }
}

// ───── инспектор ─────
function buildTraitRows(c) {
  const box = $('ins-traits');
  box.innerHTML = '';
  for (let i = 0; i < N_TRAITS; i++) {
    const row = document.createElement('div');
    row.className = 'bar';
    const info = t('traits')[i];
    row.title = info[1];
    row.innerHTML = `<span>${info[0]}</span><div class="tr"><div class="fl" style="--c:#5fb8d8"></div></div><b></b>`;
    box.appendChild(row);
  }
}

function barHTML(label, v, text, col) {
  return `<div class="bar"><span>${label}</span><div class="tr"><div class="fl" style="width:${clamp(v, 0, 1) * 100}%;--c:${col}"></div></div><b>${text}</b></div>`;
}

function updateInspector() {
  const c = sim.selected;
  if (!c) return;
  const sp = c.sp;
  $('ins-dot').style.setProperty('--c', sp.cSolid);
  $('ins-name').textContent = sp.title;
  $('ins-sub').textContent = t('ins.sub', { latin: sp.latin, id: c.id, gen: c.gen });
  const chips = [];
  const cause = t('cause.' + (c.cause || 'exhaust'));
  const act = t('act.' + c.activity(), { cause });
  chips.push(`<span class="chip ${c.dead ? 'bad' : 'hot'}">${act}</span>`);
  chips.push(`<span class="chip">${t('cls.' + sp.cls)}</span>`);
  chips.push(`<span class="chip">${t(c.euk > 0.5 ? 'ins.euk' : 'ins.prok')}</span>`);
  if (!c.dead && c.state === 0) {
    if (c.attack && (c.t[T.PHAGO] > 0.1 || c.t[T.HARPOON] > 0.1)) chips.push(`<span class="chip hot">${t('chip.attack')}</span>`);
    if (c.digest > 0) chips.push(`<span class="chip">${t('chip.digest')}</span>`);
    if (c.sigOut > 0.2) chips.push(`<span class="chip hot">${t('chip.signal')}</span>`);
    if (c.thr && c.thrGap < SENSE_RANGE) chips.push(`<span class="chip bad">${t('chip.threat')}</span>`);
    if (c.dmg > 0.03) chips.push(`<span class="chip bad">${t('chip.pain', { cause })}</span>`);
  }
  $('ins-state').innerHTML = chips.join('');
  $('ins-bars').innerHTML =
    barHTML(t('bar.energy'), c.energy / c.cap, Math.round(c.energy / c.cap * 100) + '%', '#f2c14e') +
    barHTML(t('bar.health'), c.health, Math.round(c.health * 100) + '%', '#ef6f6c') +
    barHTML(t('bar.growth'), c.mass / c.maxMass, Math.round(c.mass / c.maxMass * 100) + '%', '#5fe0c5') +
    barHTML(t('bar.reward'), (c.reward + 1) / 2, (c.reward >= 0 ? '+' : '') + c.reward.toFixed(2), c.reward >= 0 ? '#7bd88f' : '#ff8a7a');
  const inc = (v) => v > 0.05 ? (v / c.m75 * 100).toFixed(0) : '—';
  $('ins-grid').innerHTML = [
    ['g.age', fmtTime(c.age)], ['g.kids', c.kids], ['g.kills', c.kills],
    ['g.photo', inc(c.gP)], ['g.osmo', inc(c.gO)], ['g.hunt', inc(c.gH)],
    ['g.size', (c.r * 2).toFixed(1)], ['g.speed', Math.round(Math.hypot(c.vx, c.vy))], ['g.kin', c.kinN],
  ].map(([a, b]) => `<div><span>${t(a)}</span><b>${b}</b></div>`).join('');
  const lr = c.eta;
  $('ins-learn').textContent = lr > 0.0004 ? t('ins.learn', { eta: (lr * 1000).toFixed(1), dw: c.brain.dMag.toFixed(3) }) : t('ins.nolearn');
  const rows = $('ins-traits').children;
  for (let i = 0; i < N_TRAITS && i < rows.length; i++) {
    const v = c.t[i];
    rows[i].querySelector('.fl').style.width = (v * 100) + '%';
    rows[i].querySelector('b').textContent = v.toFixed(2);
  }
}

// ───── визуализация нейросети ─────
function fitCanvas(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [ctx, w, h];
}

function drawBrain() {
  const c = sim.selected;
  const cv = $('brain');
  if (!c || cv.clientWidth === 0) return;
  const [ctx, W, H] = fitCanvas(cv);
  ctx.clearRect(0, 0, W, H);
  const b = c.brain, g = b.g, d = b.d;
  const xi = 74, xh = W * 0.5 + 6, xo = W - 70;
  const yi = i => 8 + i * (H - 16) / (N_IN - 1);
  const yh = j => 18 + j * (H - 36) / (N_HID - 1);
  const yo = o => 28 + o * (H - 56) / (N_OUT - 1);
  ctx.lineCap = 'round';
  // связи вход → скрытый
  for (let i = 0; i < N_IN; i++) {
    const x = b.inp[i];
    if (Math.abs(x) < 0.02) continue;
    for (let j = 0; j < N_HID; j++) {
      const w = g[i * N_HID + j] + d[i * N_HID + j];
      const s = w * x;
      const a = Math.min(0.9, Math.abs(s) * 0.45);
      if (a < 0.06) continue;
      ctx.strokeStyle = s > 0 ? `rgba(79,195,247,${a})` : `rgba(255,154,74,${a})`;
      ctx.lineWidth = Math.min(2.5, 0.4 + Math.abs(s) * 0.8);
      ctx.beginPath(); ctx.moveTo(xi, yi(i)); ctx.lineTo(xh, yh(j)); ctx.stroke();
    }
  }
  // связи скрытый → выход
  for (let j = 0; j < N_HID; j++) {
    const x = b.h[j];
    for (let o = 0; o < N_OUT; o++) {
      const w = g[W2_OFF + j * N_OUT + o] + d[W1_LEN + j * N_OUT + o];
      const s = w * x;
      const a = Math.min(0.9, Math.abs(s) * 0.45);
      if (a < 0.06) continue;
      ctx.strokeStyle = s > 0 ? `rgba(79,195,247,${a})` : `rgba(255,154,74,${a})`;
      ctx.lineWidth = Math.min(2.5, 0.4 + Math.abs(s) * 0.8);
      ctx.beginPath(); ctx.moveTo(xh, yh(j)); ctx.lineTo(xo, yo(o)); ctx.stroke();
    }
  }
  // рекуррентные петли (память)
  for (let j = 0; j < N_HID; j++) {
    const w = g[R_OFF + j * N_HID + j];
    if (Math.abs(w) < 0.15) continue;
    ctx.strokeStyle = w > 0 ? 'rgba(79,195,247,0.35)' : 'rgba(255,154,74,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(xh + 9, yh(j), 5, -2.2, 2.2); ctx.stroke();
  }
  const node = (x, y, v, r) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = v >= 0 ? `rgba(255,214,102,${0.15 + 0.85 * Math.min(1, v)})` : `rgba(90,150,255,${0.15 + 0.85 * Math.min(1, -v)})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,235,245,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  };
  ctx.font = '9.5px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  const inNames = t('in'), outNames = t('out');
  for (let i = 0; i < N_IN; i++) {
    node(xi, yi(i), b.inp[i], 3.2);
    ctx.fillStyle = Math.abs(b.inp[i]) > 0.05 ? '#c9d8e4' : '#5f7486';
    ctx.fillText(inNames[i], xi - 7, yi(i));
  }
  for (let j = 0; j < N_HID; j++) node(xh, yh(j), b.h[j], 4.5);
  ctx.textAlign = 'left';
  for (let o = 0; o < N_OUT; o++) {
    const v = b.out[o];
    node(xo, yo(o), v, 6);
    ctx.fillStyle = v > 0.2 ? '#eaf3f8' : '#7d93a5';
    ctx.font = (v > 0.2 ? '600 ' : '') + '11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(outNames[o], xo + 10, yo(o) - 4);
    ctx.font = '9px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#6c8194';
    ctx.fillText((v >= 0 ? '+' : '') + v.toFixed(2), xo + 10, yo(o) + 8);
  }
}

// ───── графики ─────
const CHARTS = {
  pop: {
    stacked: true,
    series: () => CLASS_KEYS.map(k => ({ name: t('cls.' + k), color: CLASSES[k].color, get: h => h.c[k] })),
  },
  species: { series: () => [{ name: t('chart.species'), color: '#2f95cc', get: h => h.species }] },
  gen: {
    series: () => [
      { name: t('chart.maxGen'), color: '#a35ee0', get: h => h.maxGen },
      { name: t('chart.avgGen'), color: '#3fa64e', get: h => h.avgGen },
    ],
  },
  learn: { series: () => [{ name: t('chart.plast'), color: '#b4880f', get: h => h.plast * 1000 }] },
};

function drawChart() {
  const cv = $('chart');
  if (!cv.clientWidth) return;
  const [ctx, W, H] = fitCanvas(cv);
  ctx.clearRect(0, 0, W, H);
  const hist = sim.hist;
  const spec = CHARTS[ui.chartTab];
  const series = spec.series();
  const pl = 34, pr = 6, pt = 6, pb = 16;
  const iw = W - pl - pr, ih = H - pt - pb;
  const n = hist.length;
  const legend = $('chart-legend');
  if (n < 2) { legend.innerHTML = ''; return; }
  let max = 1;
  for (const h of hist) {
    let s = 0;
    for (const se of series) { const v = se.get(h); s = spec.stacked ? s + v : Math.max(s, v); }
    if (s > max) max = s;
  }
  max = niceMax(max);
  const x = i => pl + i / (n - 1) * iw;
  const y = v => pt + ih - v / max * ih;
  // сетка
  ctx.strokeStyle = 'rgba(140,190,230,0.1)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#6c8194';
  ctx.font = '10px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let k = 0; k <= 3; k++) {
    const v = max * k / 3, yy = Math.round(y(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(pl, yy); ctx.lineTo(W - pr, yy); ctx.stroke();
    ctx.fillText(fmtNum(v), pl - 5, yy);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(fmtTime(hist[0].t), pl, H - 3);
  ctx.textAlign = 'right';
  ctx.fillText(fmtTime(hist[n - 1].t), W - pr, H - 3);

  if (spec.stacked) {
    const base = new Float32Array(n);
    for (const se of series) {
      const top = new Float32Array(n);
      for (let i = 0; i < n; i++) top[i] = base[i] + se.get(hist[i]);
      ctx.beginPath();
      ctx.moveTo(x(0), y(top[0]));
      for (let i = 1; i < n; i++) ctx.lineTo(x(i), y(top[i]));
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(x(i), y(base[i]));
      ctx.closePath();
      ctx.fillStyle = se.color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      // зазор цвета фона между слоями
      ctx.strokeStyle = '#0b141d'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x(0), y(top[0]));
      for (let i = 1; i < n; i++) ctx.lineTo(x(i), y(top[i]));
      ctx.stroke();
      base.set(top);
    }
  } else {
    for (const se of series) {
      ctx.strokeStyle = se.color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const v = se.get(hist[i]); i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)); }
      ctx.stroke();
    }
  }
  // наведение
  const tip = $('chart-tip');
  const hx = ui.chartHoverX;
  if (hx != null && hx >= pl && hx <= W - pr) {
    const i = Math.round((hx - pl) / iw * (n - 1));
    const h = hist[i], xx = x(i);
    ctx.strokeStyle = 'rgba(220,235,245,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xx, pt); ctx.lineTo(xx, pt + ih); ctx.stroke();
    let acc = 0;
    for (const se of series) {
      const v = se.get(h);
      acc = spec.stacked ? acc + v : v;
      ctx.beginPath(); ctx.arc(xx, y(acc), 4, 0, TAU);
      ctx.fillStyle = se.color; ctx.fill();
      ctx.strokeStyle = '#0b141d'; ctx.lineWidth = 2; ctx.stroke();
    }
    tip.innerHTML = `<div class="muted">${fmtTime(h.t)}${spec.stacked ? ' · ' + t('chart.total') + ' ' + h.total : ''}</div>` +
      series.slice().reverse().map(se => `<div class="r"><span class="sw" style="--c:${se.color}"></span>${se.name}<b>${fmtVal(se.get(h))}</b></div>`).join('');
    tip.classList.remove('hidden');
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(W - tw, Math.max(0, xx + 10 - (xx > W / 2 ? tw + 20 : 0))) + 'px';
    tip.style.top = '4px';
  } else tip.classList.add('hidden');

  const last = hist[n - 1];
  legend.innerHTML = series.map(se => `<span><span class="sw" style="--c:${se.color}"></span>${se.name}: <b>${fmtVal(se.get(last))}</b></span>`).join('') +
    (ui.chartTab === 'learn' ? `<span class="muted">${t('chart.learnGene', { v: last.learn.toFixed(2) })}</span>` : '');
}
function fmtVal(v) { return Number.isInteger(v) ? fmtNum(v) : v < 10 ? v.toFixed(1) : fmtNum(v); }
function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// ───── стартовое меню и режимы ─────
const MENU_ORDER = ['genesis', 'sandbox', 'balanced', 'protists', 'bacteria', 'soup'];

function buildMenu() {
  const box = $('modes');
  box.innerHTML = '';
  for (const key of MENU_ORDER) {
    const p = PRESETS[key];
    const b = document.createElement('button');
    b.className = 'mode' + (key === 'genesis' ? ' featured' : '');
    // мини-чашка с «клетками» состава режима
    let dots = '';
    const n = p.dots.length ? (p.sparse ? 6 : 16) : 0;
    for (let i = 0; i < n; i++) {
      const cls = p.dots[i % p.dots.length];
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 24;
      const x = 32 + Math.cos(a) * d - 3.5, y = 32 + Math.sin(a) * d - 2.5;
      dots += `<i style="--c:${CLASSES[cls].color};left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;transform:rotate(${(Math.random() * 180) | 0}deg)"></i>`;
    }
    b.innerHTML = `<div class="dish${p.empty ? ' empty' : ''}">${dots}</div>
      <div><span class="tag">${t('preset.' + key + '.tag')}</span><b>${t('preset.' + key + '.name')}</b><p>${t('preset.' + key + '.desc')}</p></div>`;
    b.addEventListener('click', () => startMode(key));
    box.appendChild(b);
  }
}

function menuOpen() { return !$('menu').classList.contains('hidden'); }
function showMenu() {
  $('menu').classList.remove('hidden');
  $('menu-continue').classList.toggle('hidden', !ui.started);
  $('left').classList.remove('open'); $('right').classList.remove('open');
}
function hideMenu() { $('menu').classList.add('hidden'); }

function startMode(key) {
  initWorld(key);
  ui.started = true;
  ui.logSeen = 0;
  ui.strainSpecies.clear();
  hideMenu();
  $('win').classList.add('hidden');
  onWorldReset();
  syncSettingsUI();
  cam.follow = false;
  fitCamera();
  setSpeed(1);
  const P = PRESETS[key];
  showModeInfo();
  $('goals-sec').classList.toggle('hidden', key !== 'genesis');
  $('hud').classList.toggle('hidden', key !== 'genesis');
  if (P.empty) {
    if (key === 'genesis') ui.seed = 'arc:cyano';
    setTool('spawn');
  } else setTool('inspect');
  fillSeedSelect();
  if (key === 'genesis') { buildGoals(); updateGoals(); }
}

function syncSettingsUI() {
  for (const key of ['dayCycle', 'brownian', 'learning', 'lamarck', 'panspermia', 'phages']) $('s-' + key).checked = SETTINGS[key];
}

function buildGoals() {
  $('goals').innerHTML = GOALS.map(g => `
    <div class="goal${g.final ? ' final' : ''}" id="goal-${g.id}" title="${g.final ? t('goal.ttFinal') : t('goal.tt', { n: g.reward })}">
      <div class="gt"><b class="gn">${t('goal.' + g.id + '.title')}</b><span></span></div>
      <div class="gd">${t('goal.' + g.id + '.desc')}</div>
      <div class="tr"><div class="fl"></div></div>
    </div>`).join('');
}

function updateGoals() {
  const m = sim.mode;
  $('budget-v').textContent = Math.floor(m.budget);
  $('budget-bar').style.width = (m.budget / m.budgetMax * 100) + '%';
  $('goals-count').textContent = t('goals.of', { a: m.done.size, b: GOALS.length });
  $('hud-pts').textContent = Math.floor(m.budget);
  $('hud-goals').textContent = t('hud.goals', { a: m.done.size, b: GOALS.length });
  for (const g of GOALS) {
    const el = $('goal-' + g.id);
    if (!el) continue;
    const [v, max] = m.progress[g.id] || [0, 1];
    const done = m.done.has(g.id);
    el.classList.toggle('done', done);
    el.querySelector('span').textContent = done ? '' : g.id === 'stable' ? `${fmtTime(v)} / 2:00` : `${v} / ${max}`;
    el.querySelector('.fl').style.width = (done ? 100 : v / max * 100) + '%';
  }
  if (m.justWon) {
    m.justWon = false;
    $('win-text').textContent = t('win.text', { time: fmtTime(m.wonAt), born: fmtNum(sim.totalBorn), gen: sim.maxGen, sp: sim.newSpecies });
    $('win').classList.remove('hidden');
  }
}

// ───── язык ─────
function buildZoo() {
  $('zoo').innerHTML = ARCHETYPES.map(a => {
    const c = classify(archetypeGenome(a, 0).t);
    return `<div class="zoo-item"><span class="dot" style="--c:${CLASSES[c.cls].color}"></span><div><b>${t('arc.' + a.key + '.name')}</b><i>${a.latin}</i> <span class="muted small">· ${t('cls.' + c.cls).toLowerCase()}</span><p>${t('arc.' + a.key + '.info')}</p></div></div>`;
  }).join('');
}

function showModeInfo() {
  $('cur-mode').textContent = t('preset.' + sim.preset + '.name');
  $('preset-desc').textContent = t('preset.' + sim.preset + '.desc');
}

function changeLang(l) {
  setLang(l);
  applyI18n();
  document.querySelectorAll('[data-setlang]').forEach(b => b.classList.toggle('on', b.dataset.setlang === LANG));
  setTool(ui.tool);
  fillSeedSelect();
  buildMenu();
  buildZoo();
  showModeInfo();
  if (isGenesis()) { buildGoals(); updateGoals(); }
  rebuildLog();
  $('ins-follow').textContent = t(cam.follow ? 'ins.unfollow' : 'ins.follow');
  if (sim.selected) { buildTraitRows(sim.selected); updateInspector(); drawBrain(); }
  updateKpis(); updateSpecies(); drawChart();
}
