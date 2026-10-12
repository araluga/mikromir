'use strict';
// ───────── Симуляция: шаг мира, взаимодействия, статистика ─────────

const sim = {
  cells: [], births: [], debris: [], fx: [],
  tick: 0, time: 0,
  cellHead: new Int32Array(BN * BN), cellNext: new Int32Array(4096),
  debHead: new Int32Array(BN * BN), debNext: new Int32Array(4096),
  logs: [], hist: [], lastStat: 0, classSeen: {},
  selected: null, maxGen: 0, totalBorn: 0, totalDied: 0, preset: 'balanced',
  kills: 0, conj: 0, newSpecies: 0, pendingDiv: 0,
};

// Запись журнала хранит ключ и параметры — текст собирается на текущем языке при показе
function simLog(key, params, kind = 'info') {
  sim.logs.push({ t: sim.time, key, params: params || null, kind, at: Date.now() });
  if (sim.logs.length > 120) sim.logs.shift();
}

function bucketOf(x, y) {
  let bx = (x / BUCKET) | 0, by = (y / BUCKET) | 0;
  if (bx < 0) bx = 0; else if (bx >= BN) bx = BN - 1;
  if (by < 0) by = 0; else if (by >= BN) by = BN - 1;
  return by * BN + bx;
}

function addCell(c) {
  sim.cells.push(c);
  const sp = c.sp;
  sp.count++; sp.total++;
  if (sp.extinct >= 0) sp.extinct = -1;
  if (sp.count > sp.maxCount) sp.maxCount = sp.count;
  if (c.gen > sp.maxGen) sp.maxGen = c.gen;
  if (c.gen > sim.maxGen) sim.maxGen = c.gen;
  if (!sp.established && sp.count >= 10) {
    sp.established = true;
    sim.newSpecies++;
    simLog(sp.parentName ? 'log.newSpeciesFrom' : 'log.newSpecies', { sp, latin: sp.latin, parent: sp.parentName }, 'species');
  }
}

function onCellDeath(c, eaten) {
  const sp = c.sp;
  sp.count--;
  sim.totalDied++;
  if (sp.count <= 0) {
    sp.count = 0;
    sp.extinct = sim.time;
    if (sp.established && sp.maxCount >= 10) simLog('log.extinct', { sp, latin: sp.latin }, 'extinct');
  }
  if (!eaten) {
    const total = c.energy * 0.6 + c.mass * 0.8;
    const n = clamp(Math.round(c.mass / 30), 1, 8);
    for (let i = 0; i < n; i++) {
      sim.debris.push({ x: c.x + randn() * c.r * 0.5, y: c.y + randn() * c.r * 0.5, e: total * 0.7 / n });
    }
    addField(env.N, c.x, c.y, total * 0.3 / FIELD_AMT);
  }
  if (sim.fx.length < 500) {
    const n = Math.min(10, 3 + (c.r | 0));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(4, 18);
      sim.fx.push({ x: c.x, y: c.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, max: rand(0.6, 1.3), col: eaten ? '255,120,80' : '200,200,170', s: rand(0.6, 1.4) });
    }
  }
}

function divideCell(c) {
  c.divT = -1;
  const childG = c.g.mutated(SETTINGS.mutMul, SETTINGS.lamarck ? c.brain.d : null);
  const m = c.mass / 2, e = c.energy / 2;
  c.mass = m; c.energy = e; c.r = Math.sqrt(m); c.m75 = Math.pow(m, 0.75);
  const ox = Math.cos(c.ang) * c.r * 0.7, oy = Math.sin(c.ang) * c.r * 0.7;
  const sp = speciesForChild(c.sp, childG);
  const child = new Cell(childG, sp, c.x + ox, c.y + oy, { gen: c.gen + 1, mass: m, energy: e, ang: c.ang + randn() * 0.4, parentId: c.id });
  c.x -= ox; c.y -= oy;
  if (SETTINGS.lamarck) child.brain.copyCriticFrom(c.brain);
  c.kids++;
  c.lastV = c.energy + c.mass;
  sim.births.push(child);
  sim.totalBorn++;
  if (sim.fx.length < 500) sim.fx.push({ x: c.x + ox * 0.5, y: c.y + oy * 0.5, vx: 0, vy: 0, life: 1, max: 0.6, col: '160,255,220', s: c.r * 0.5, ring: true });
}

function rebuildGrids() {
  const cells = sim.cells;
  if (sim.cellNext.length < cells.length) sim.cellNext = new Int32Array(cells.length * 2);
  const head = sim.cellHead, next = sim.cellNext, acc = env.shadeAcc, mAcc = env.massAcc;
  head.fill(-1); acc.fill(0); mAcc.fill(0);
  sim.pendingDiv = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i], b = bucketOf(c.x, c.y);
    if (c.divT >= 0) sim.pendingDiv++;
    next[i] = head[b]; head[b] = i;
    mAcc[b] += c.mass;
    if (c.state === 0 && c.t[T.CHLORO] > 0.02) acc[b] += c.t[T.CHLORO] * c.mass;
  }
  for (let b = 0; b < acc.length; b++) env.shade[b] = acc[b] > 0 ? Math.exp(-acc[b] / 600) : 1;

  const deb = sim.debris;
  if (sim.debNext.length < deb.length) sim.debNext = new Int32Array(deb.length * 2);
  const dh = sim.debHead, dn = sim.debNext;
  dh.fill(-1);
  for (let i = 0; i < deb.length; i++) { const b = bucketOf(deb[i].x, deb[i].y); dn[i] = dh[b]; dh[b] = i; }
}

// Соседи: столкновения, ощущение ближайшего, контактные действия
function interactCells() {
  const cells = sim.cells, head = sim.cellHead, next = sim.cellNext;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.dead) continue;
    const bx = (c.x / BUCKET) | 0, by = (c.y / BUCKET) | 0;
    // полный «осмотр» соседей — только в такт мышления клетки, в остальные тики — лишь контакты
    const sensing = c.state === 0 && (sim.tick + c.id) % BRAIN_EVERY === 0;
    const extra = sensing ? SENSE_RANGE : 1.5 + c.reachK * c.r;
    let prey = null, preyGap = 1e9, thr = null, thrGap = 1e9, kin = 0;
    const cEat = c.t[T.PHAGO] > 0.05 ? c.r * (c.engulfRatio + 0.3 * c.t[T.HARPOON] * c.euk) : 0;
    const cHarp = c.t[T.HARPOON] > 0.2 ? c.r * 3.5 : 0;
    const cMax = cEat > cHarp ? cEat : cHarp;
    for (let gy = by - 1; gy <= by + 1; gy++) {
      if (gy < 0 || gy >= BN) continue;
      for (let gx = bx - 1; gx <= bx + 1; gx++) {
        if (gx < 0 || gx >= BN) continue;
        let j = head[gy * BN + gx];
        while (j !== -1) {
          if (j !== i) {
            const o = cells[j];
            if (!o.dead) {
              const dx = o.x - c.x, dy = o.y - c.y, rr = c.r + o.r;
              const lim = rr + extra;
              const d2 = dx * dx + dy * dy;
              if (d2 < lim * lim) {
                const d = Math.sqrt(d2) || 0.01;
                const gap = d - rr;
                if (!sensing) { /* только столкновения и контакт */ }
                else if (o.sp === c.sp) kin++;
                else {
                  // химическое распознавание: «могу съесть» / «может съесть меня»
                  if (o.r <= cMax && gap < preyGap) { preyGap = gap; prey = o; }
                  if (gap < thrGap && ((o.t[T.PHAGO] > 0.05 && o.r * o.engulfRatio >= c.r) || (o.t[T.HARPOON] > 0.25 && o.r * 3.5 >= c.r))) { thrGap = gap; thr = o; }
                }
                if (gap < 0) {
                  const push = -gap * (o.mass / (c.mass + o.mass)) * 0.6;
                  c.x -= dx / d * push; c.y -= dy / d * push;
                }
                if (gap < 1.5 + c.reachK * c.r && c.state === 0) contact(c, o);
                if (c.dead) break;
              }
            }
          }
          j = next[j];
        }
        if (c.dead) break;
      }
      if (c.dead) break;
    }
    if (sensing) { c.nb = prey; c.nbGap = preyGap; c.thr = thr; c.thrGap = thrGap; c.kinN = kin; }
  }
}

function contact(c, o) {
  if (o.dead) return;
  const t = c.t;
  // голодный и не занятый перевариванием (функциональный ответ Холлинга II типа)
  if (c.attack && o.sp !== c.sp && c.digest <= 0 && c.energy < 0.85 * c.cap) {
    const arm = Math.min(1, o.t[T.ARMOR] + (o.state === 1 ? 0.5 : 0));
    // гарпун / токсицисты: высасывание энергии
    if (t[T.HARPOON] > 0.08) {
      // гарпун эффективен против добычи сопоставимого размера (мелочь трудно поразить)
      const dr = t[T.HARPOON] * 1.6 * c.m75 * Math.max(0, 1 - 1.6 * arm) * Math.min(1, 1.5 * o.mass / c.mass) * DT;
      if (dr > 0) {
        o.energy -= dr;
        o.para = 1.2;
        o.dmg += 0.02;
        if (o.energy < 0) {
          o.hurt(-o.energy / (o.m75 * 2), 'harpoon');
          o.energy = 0;
        }
        const g = dr * 0.4;
        c.energy = Math.min(c.cap, c.energy + g);
        c.intake += g;
        c.gH += g * 0.125;
        c.energy -= 0.15 * c.m75 * DT * t[T.HARPOON];
        if (o.health <= 0) { o.die('harpoon'); c.kills++; sim.kills++; c.addVacuole(); c.digest = 1 + 4 * Math.min(1, o.mass / c.mass); return; }
      }
    }
    // фагоцитоз: проглотить целиком
    if (t[T.PHAGO] > 0.05) {
      const ratio = c.engulfRatio + (o.para > 0 ? 0.45 * t[T.PHAGO] * c.euk : 0);
      if (o.r <= c.r * ratio) {
        const p = (0.05 + 0.6 * t[T.PHAGO] - 0.7 * arm) * DT * 8;
        if (p > 0 && Math.random() < p) {
          const g = (o.energy + o.mass) * (0.6 + 0.35 * t[T.PHAGO]);
          c.energy = Math.min(c.cap * 1.3, c.energy + g);
          c.intake += g;
          c.gH += g * 0.125;
          o.die('eaten', true);
          c.digest = 0.5 + 6 * Math.min(1.5, o.mass / c.mass);
          c.kills++; sim.kills++;
          c.addVacuole();
          return;
        }
      }
    }
  }
  // конъюгация: обмен генами с родственной клеткой
  // (с тем же видом или с ближайшим родственным: предок/потомок)
  if (c.wantConj && c.conjCd <= 0 && o.conjCd <= 0 && o.state === 0 && (o.sp === c.sp || o.sp.parentId === c.sp.id || c.sp.parentId === o.sp.id)) {
    conjugate(c, o);
  }
}

const PLASMID_GENES = [T.OSMO, T.TOXIN, T.RESIST, T.HARPOON, T.ARMOR, T.CHLORO];
function conjugate(a, b) {
  if (a.euk > 0.5 && b.euk > 0.5) {
    // инфузории: взаимный обмен частями ядер (рекомбинация)
    for (const gi of PLASMID_GENES) if (Math.random() < 0.4) { const v = a.t[gi]; a.t[gi] = b.t[gi]; b.t[gi] = v; }
  } else {
    // бактерии: донор передаёт копию плазмиды
    for (const gi of PLASMID_GENES) if (Math.random() < 0.5) b.t[gi] = a.t[gi];
  }
  // передача «поведенческого модуля» — одного скрытого нейрона
  const j = randi(0, Math.min(a.nh, b.nh));
  for (let i = 0; i < N_IN; i++) b.g.w[i * N_HID + j] = a.g.w[i * N_HID + j];
  for (let o = 0; o < N_OUT; o++) b.g.w[W2_OFF + j * N_OUT + o] = a.g.w[W2_OFF + j * N_OUT + o];
  a.derive(); b.derive();
  a.conjCd = b.conjCd = 10;
  a.conjWith = b; b.conjWith = a; a.conjT = b.conjT = 1.5;
  a.energy -= 0.02 * a.mass; b.energy -= 0.02 * b.mass;
  sim.conj++;
}

// Частицы-остатки (детрит): их едят фаготрофы и растворяют осмотрофы
function interactDebris() {
  const cells = sim.cells, deb = sim.debris, head = sim.debHead, next = sim.debNext;
  if (!deb.length) { for (const c of cells) { c.deb = null; c.debGap = 1e9; } return; }
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.dead || c.state !== 0) continue;
    const canPh = c.t[T.PHAGO] > 0.1 && c.euk > 0.3;
    const canOs = c.t[T.OSMO] > 0.15;
    const sensing = (sim.tick + c.id) % BRAIN_EVERY === 0;
    if (!canPh && !canOs && !sensing) continue;
    const bx = (c.x / BUCKET) | 0, by = (c.y / BUCKET) | 0;
    let best = null, bestGap = 1e9;
    for (let gy = by - 1; gy <= by + 1; gy++) {
      if (gy < 0 || gy >= BN) continue;
      for (let gx = bx - 1; gx <= bx + 1; gx++) {
        if (gx < 0 || gx >= BN) continue;
        let j = head[gy * BN + gx];
        while (j !== -1) {
          const d = deb[j];
          if (d.e > 0) {
            const dx = d.x - c.x, dy = d.y - c.y;
            const lim = c.r + SENSE_RANGE;
            const d2 = dx * dx + dy * dy;
            if (d2 < lim * lim) {
              const gap = Math.sqrt(d2) - c.r - 1.5;
              if (gap < bestGap) { bestGap = gap; best = d; }
              if (gap < 0.5) {
                if (canPh && (c.attack || c.t[T.PHAGO] > 0.4)) {
                  const g = d.e * (0.45 + 0.45 * c.t[T.PHAGO]);
                  c.energy = Math.min(c.cap * 1.3, c.energy + g);
                  c.intake += g;
                  c.gH += g * 0.125;
                  d.e = 0;
                  c.addVacuole();
                } else if (canOs) {
                  const take = Math.min(d.e, c.t[T.OSMO] * 1.5 * c.r * DT);
                  d.e -= take;
                  c.energy = Math.min(c.cap, c.energy + take * 0.85);
                  c.intake += take * 0.85;
                  c.gO += take * 0.85 * 0.125;
                }
              }
            }
          }
          j = next[j];
        }
      }
    }
    if (sensing) { c.deb = best; c.debGap = bestGap; }
  }
}

function updateDebris(dt) {
  const deb = sim.debris, N = env.N;
  if (deb.length > 4000) {
    for (let i = 0; i < deb.length - 4000; i++) { addField(N, deb[i].x, deb[i].y, deb[i].e / FIELD_AMT); deb[i].e = 0; }
  }
  let w = 0;
  for (let i = 0; i < deb.length; i++) {
    const d = deb[i];
    if (d.e <= 0) continue;
    // разложение бактериями-редуцентами → растворённая органика
    const rel = d.e * 0.015 * dt + 0.01 * dt;
    d.e -= rel;
    const k = fieldIdx(d.x, d.y);
    if (env.mask[k]) N.a[k] = Math.min(N.max, N.a[k] + rel / FIELD_AMT);
    if (d.e < 0.25) { if (env.mask[k]) N.a[k] = Math.min(N.max, N.a[k] + d.e / FIELD_AMT); continue; }
    if (SETTINGS.brownian) { d.x += (Math.random() - 0.5) * 0.7; d.y += (Math.random() - 0.5) * 0.7; }
    const dx = d.x - WORLD.cx, dy = d.y - WORLD.cy, dd = dx * dx + dy * dy, lim = WORLD.dishR - 3;
    if (dd > lim * lim) { const s = lim / Math.sqrt(dd); d.x = WORLD.cx + dx * s; d.y = WORLD.cy + dy * s; }
    deb[w++] = d;
  }
  deb.length = w;
}

function simStep() {
  sim.tick++;
  sim.time += DT;
  rebuildGrids();
  interactCells();
  interactDebris();
  const cells = sim.cells;
  for (let i = 0; i < cells.length; i++) { const c = cells[i]; if (!c.dead) c.update(DT); }
  let w = 0;
  for (let i = 0; i < cells.length; i++) { const c = cells[i]; if (!c.dead) cells[w++] = c; }
  cells.length = w;
  for (let i = 0; i < sim.births.length; i++) addCell(sim.births[i]);
  sim.births.length = 0;
  updateDebris(DT);
  if (sim.tick % 2 === 0) envStep(DT * 2);
  if (sim.time - sim.lastStat >= 1) recordStats();
  if (sim.tick % 250 === 0) { panspermia(); speciesCleanup(); }
  if (sim.tick % 50 === 0) phages();
  if (sim.tick % 25 === 0) modeTick();
}

function classCounts() {
  const c = { photo: 0, osmo: 0, grazer: 0, predator: 0, toxic: 0 };
  for (const cell of sim.cells) c[cell.sp.cls]++;
  return c;
}

function recordStats() {
  sim.lastStat = sim.time;
  const counts = classCounts();
  let alive = 0;
  for (const s of speciesMap.values()) if (s.count > 0) alive++;
  let learn = 0, plast = 0, gen = 0, n = 0, brain = 0;
  const cells = sim.cells;
  const step = Math.max(1, Math.floor(cells.length / 200));
  for (let i = 0; i < cells.length; i += step) {
    const c = cells[i];
    learn += c.t[T.LEARN]; plast += c.brain.dMag; gen += c.gen; brain += c.nh; n++;
  }
  sim.hist.push({
    t: sim.time, c: counts, total: cells.length, species: alive, maxGen: sim.maxGen,
    avgGen: n ? gen / n : 0, learn: n ? learn / n : 0, plast: n ? plast / n : 0, brain: n ? brain / n : 0,
    debris: sim.debris.length,
  });
  if (sim.hist.length > 1200) sim.hist = sim.hist.filter((_, i) => i % 2 === 0);
}

// «Убей победителя»: бактериофаги распространяются в самой плотной популяции
function phages() {
  if (!SETTINGS.phages) return;
  const pop = sim.cells.length;
  if (pop < 300) return;
  for (const s of speciesMap.values()) {
    const share = s.count / pop;
    if (s.count < 150 || share < 0.35) continue;
    const p = 0.02 * (share - 0.35) / 0.65 + 0.004;   // доля лизируемых за 2 с
    let killed = 0;
    for (const c of sim.cells) {
      if (c.sp !== s || c.dead) continue;
      if (Math.random() < p * (c.state === 1 ? 0.1 : 1) * (1 - 0.3 * c.t[T.ARMOR])) { c.die(c.euk > 0.5 ? 'virus' : 'phage'); killed++; }
    }
    if (killed > 0 && sim.time - (s.lastPhageLog || -1e9) > 60) {
      s.lastPhageLog = sim.time;
      simLog(eukOf(maxRadiusOf(s.rep.t)) > 0.5 ? 'log.virus' : 'log.phage', { latin: s.latin, pct: Math.round(share * 100) }, 'warn');
    }
  }
  let w = 0;
  for (const c of sim.cells) if (!c.dead) sim.cells[w++] = c;
  sim.cells.length = w;
}

function panspermia() {
  for (const k of CLASS_KEYS) if (!(k in sim.classSeen)) sim.classSeen[k] = sim.time;
  const counts = classCounts();
  for (const k of CLASS_KEYS) {
    if (counts[k] > 0) { sim.classSeen[k] = sim.time; continue; }
    if (!SETTINGS.panspermia || sim.time - sim.classSeen[k] < 40) continue;
    const arcs = ARCHETYPES.filter(a => a.cls === k);
    if (!arcs.length) continue;
    const a = pick(arcs);
    const [x, y] = randomInDish(150);
    spawnArchetype(a, a.cls === 'predator' ? 4 : 8, x, y, 60);
    sim.classSeen[k] = sim.time;
    simLog('log.panspermia', { arc: { k: 'arc.' + a.key + '.name' }, cls: { k: 'cls.' + k, lower: true } }, 'warn');
  }
  if (sim.cells.length < 15 && SETTINGS.panspermia) {
    for (const a of ARCHETYPES.slice(0, 2)) { const [x, y] = randomInDish(150); spawnArchetype(a, 15, x, y, 120); }
    simLog('log.lifeWind', null, 'warn');
  }
}

function archetypeSpecies(arc) {
  if (!arc.species || !speciesMap.has(arc.species.id)) {
    arc.species = new Species(archetypeGenome(arc, 0), null, { arcKey: arc.key, latin: arc.latin, archetype: true });
  }
  return arc.species;
}

function placeNear(x, y, spread) {
  for (let k = 0; k < 10; k++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * spread;
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (Math.hypot(px - WORLD.cx, py - WORLD.cy) < WORLD.dishR - 30) return [px, py];
  }
  return randomInDish(60);
}

function spawnArchetype(arc, n, x, y, spread) {
  const sp = archetypeSpecies(arc);
  const out = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = x === undefined ? randomInDish(40) : placeNear(x, y, spread);
    const c = new Cell(archetypeGenome(arc), sp, px, py);
    addCell(c); out.push(c);
  }
  return out;
}

function spawnGenome(genome, sp, n, x, y, spread) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = placeNear(x, y, spread);
    const c = new Cell(i === 0 ? genome.clone() : genome.mutated(0.5), sp, px, py);
    addCell(c); out.push(c);
  }
  return out;
}

function spawnRandom(n, x, y, spread) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const g = randomGenome();
    const sp = new Species(g, null);
    const [px, py] = x === undefined ? randomInDish(40) : placeNear(x, y, spread);
    const c = new Cell(g, sp, px, py);
    addCell(c); out.push(c);
  }
  return out;
}

const PRESETS = {
  genesis: {
    empty: true, panspermia: false,
    dots: ['photo', 'osmo', 'grazer', 'toxic', 'predator'], sparse: true,
  },
  sandbox: {
    empty: true, panspermia: false,
    dots: [], sparse: true,
  },
  balanced: {
    dots: ['photo', 'photo', 'osmo', 'osmo', 'grazer', 'toxic', 'predator'],
  },
  protists: {
    dots: ['photo', 'photo', 'photo', 'grazer', 'grazer', 'predator'],
  },
  bacteria: {
    dots: ['osmo', 'osmo', 'osmo', 'photo', 'photo', 'toxic', 'predator'],
  },
  soup: {
    dots: ['photo', 'osmo', 'grazer', 'toxic', 'predator', 'osmo', 'photo'],
  },
};

function initWorld(preset = 'balanced') {
  sim.cells = []; sim.births = []; sim.debris = []; sim.fx = [];
  sim.tick = 0; sim.time = 0; sim.logs = []; sim.hist = []; sim.lastStat = 0; sim.classSeen = {};
  sim.selected = null; sim.maxGen = 0; sim.totalBorn = 0; sim.totalDied = 0;
  sim.kills = 0; sim.conj = 0; sim.newSpecies = 0; sim.preset = preset;
  speciesMap.clear();
  for (const a of ARCHETYPES) { a.species = null; a.cls = classify(archetypeGenome(a, 0).t).cls; }
  const P = PRESETS[preset];
  SETTINGS.panspermia = P.panspermia !== false;
  initEnv(preset === 'soup' ? { richness: 0.9, vents: 6 } : {});
  simLog('log.newWorld', { mode: { k: 'preset.' + preset + '.name' } }, 'info');
  initMode(preset);
  const sel = {
    balanced: ARCHETYPES.map(a => [a.key, a.count]),
    bacteria: [['ecoli', 320], ['cyano', 220], ['strepto', 50], ['bdello', 25]],
    protists: [['cyano', 260], ['euglena', 70], ['diatom', 50], ['paramecium', 45], ['stentor', 10], ['amoeba', 10], ['didinium', 10]],
  }[preset];
  if (P.empty) {
    // пустая чашка — засевает игрок
  } else if (sel) {
    for (const [key, n] of sel) {
      const a = ARCHETYPES.find(x => x.key === key);
      // клетки сеются колониями
      let left = n;
      while (left > 0) {
        const k = Math.min(left, Math.max(4, Math.ceil(n / 4)));
        const [x, y] = randomInDish(120);
        spawnArchetype(a, k, x, y, 90);
        left -= k;
      }
    }
  } else {
    spawnRandom(450);
  }
  recordStats();
}
