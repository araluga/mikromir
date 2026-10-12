'use strict';
// ───────── Колонии и многоклеточность ─────────
// Клетки могут оставаться склеенными после деления (ген «Сцепление» задаёт, может ли клетка
// вообще клеиться и сколько связей держит; выход нейросети «сцепление» — хочет ли она этого сейчас).
// Внутри колонии клетки делятся энергией, обмениваются сигналами с соседями (как Notch–Delta)
// и выбирают роль: «сома» лучше кормится и плавает, но не делится; «зародышевая» клетка
// кормится хуже, зато быстро растёт и размножается — классическое разделение труда вольвокса.

const SHARE_RATE = 0.8;      // скорость перетока энергии по связи (доля разницы в секунду)
const SHARE_EFF = 0.9;       // потери при передаче
const ROLE_T = 0.3;          // порог роли: spec > ROLE_T — сома, spec < −ROLE_T — зародышевая

// 2 связи — нити (как у анабены), 3–4 — комки и шары (как у вольвокса)
function maxBondsOf(t) { return 2 + Math.floor(t[T.ADHES] * 2.99); }
function canBond(c) { return !c.dead && c.state === 0 && c.t[T.ADHES] > 0.08 && c.bonds.length < maxBondsOf(c.t); }

function bondCells(a, b) {
  if (a === b || a.bonds.includes(b)) return;
  a.bonds.push(b); b.bonds.push(a);
}
function unbondCells(a, b) {
  let i = a.bonds.indexOf(b); if (i >= 0) a.bonds.splice(i, 1);
  i = b.bonds.indexOf(a); if (i >= 0) b.bonds.splice(i, 1);
}
function unbondAll(c) {
  for (const o of c.bonds) { const i = o.bonds.indexOf(c); if (i >= 0) o.bonds.splice(i, 1); }
  c.bonds.length = 0;
}

// Остаются ли мать и дочь вместе после деления
function bondAtDivision(parent, child) {
  if (!canBond(parent) || !canBond(child)) return false;
  // вероятность: способность (ген) × желание (сглаженный выход сети «сцепление»)
  const p = Math.min(parent.t[T.ADHES], child.t[T.ADHES]) * 2 / (1 + Math.exp(-4 * parent.adhere));
  if (Math.random() < p) { bondCells(parent, child); return true; }
  return false;
}

// Толщина общей оболочки колонии вокруг клетки (для столкновений и отрисовки)
function envPad(c) { return c.r * 0.7 + 2; }

// Слабо прикреплённую клетку с края колонии (конец нити, одна связь) хищник может «откусить»
function nibbleable(o) { return o.col !== null && o.bonds.length <= 1; }

// Эффективный радиус «жертвы»: колонию целиком хищнику не проглотить
function effRadius(c) { return c.col ? c.col.effR : c.r; }

// Физика связей и обмен энергией (каждый тик)
function colonyStep(dt) {
  const cells = sim.cells;
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i];
    if (a.dead || !a.bonds.length) continue;
    for (let k = a.bonds.length - 1; k >= 0; k--) {
      const b = a.bonds[k];
      if (b.dead) { a.bonds.splice(k, 1); continue; }
      if (a.id > b.id) continue;          // каждую связь обрабатываем один раз
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const rest = a.r + b.r;
      if (d > rest * 3) { unbondCells(a, b); continue; }   // связь порвалась
      // пружина: тянет к касанию; смещение распределяется по массам
      const corr = (d - rest) / d * 0.5, ma = a.mass, mb = b.mass, sm = ma + mb;
      a.x += dx * corr * (mb / sm); a.y += dy * corr * (mb / sm);
      b.x -= dx * corr * (ma / sm); b.y -= dy * corr * (ma / sm);
      // переток энергии: решает тот, у кого её больше (он может «пожадничать»)
      const fa = a.energy / a.cap, fb = b.energy / b.cap;
      const giver = fa > fb ? a : b, taker = giver === a ? b : a;
      const will = giver.shareOut;
      if (will > 0) {
        const diff = Math.abs(fa - fb);
        const amt = SHARE_RATE * will * diff * Math.min(a.cap, b.cap) * 0.5 * dt;
        if (amt > 0) {
          giver.energy -= amt;
          taker.energy = Math.min(taker.cap, taker.energy + amt * SHARE_EFF);
          if (a.sp.rootArc !== 'volvox') sim.shared += amt;   // в цели идёт только «изобретённая» взаимопомощь
          giver.sharedOut += amt;
        }
      }
    }
  }
}

// Распознавание колоний (обход связей), раз в несколько тиков
function findColonies() {
  const cells = sim.cells, mark = ++sim.colPass;   // свой номер обхода (повторный вызов в тот же тик тоже корректен)
  sim.colonies = [];
  for (const c of cells) c.col = null;
  for (const c0 of cells) {
    if (c0.dead || !c0.bonds.length || c0.colMark === mark) continue;
    const list = [c0];
    c0.colMark = mark;
    for (let q = 0; q < list.length; q++) {
      for (const o of list[q].bonds) if (!o.dead && o.colMark !== mark) { o.colMark = mark; list.push(o); }
    }
    if (list.length < 2) continue;
    let mass = 0, cx = 0, cy = 0, ef = 0, soma = 0, germ = 0;
    for (const c of list) {
      mass += c.mass; cx += c.x * c.mass; cy += c.y * c.mass; ef += c.energy / c.cap;
      if (c.spec > ROLE_T) soma++; else if (c.spec < -ROLE_T) germ++;
    }
    cx /= mass; cy /= mass;
    let rad = 0;
    for (const c of list) rad = Math.max(rad, Math.hypot(c.x - cx, c.y - cy));
    const col = { cells: list, size: list.length, mass, cx, cy, rad, effR: Math.sqrt(mass), energy: ef / list.length, soma, germ, sp: c0.sp };
    for (const c of list) c.col = col;
    sim.colonies.push(col);
  }
}

// Колонии, возникшие в ходе эволюции (а не у врождённо колониального вольвокса и его потомков)
function evolvedColony(col) { return col.sp.rootArc !== 'volvox'; }

// Колония с разделением труда: есть и сома, и зародышевые клетки
function hasLabor(col, minEach = 2) { return col.soma >= minEach && col.germ >= minEach; }

function roleOf(c) {
  if (!c.col) return null;
  return c.spec > ROLE_T ? 'soma' : c.spec < -ROLE_T ? 'germ' : 'mixed';
}

// Сводка для статистики и целей
function colonyStats(evolvedOnly) {
  let maxCol = 1, inCol = 0, laborCols = 0, organism = 0;
  for (const col of sim.colonies) {
    if (evolvedOnly && !evolvedColony(col)) continue;
    if (col.size > maxCol) maxCol = col.size;
    inCol += col.size;
    if (col.size >= 6 && hasLabor(col)) laborCols++;
    if (col.size >= 10 && hasLabor(col)) organism++;
  }
  const n = sim.cells.length || 1;
  // средний размер колонии, в которой живёт клетка (одиночка — «колония» из 1)
  let sumSq = n - inCol;
  for (const col of sim.colonies) if (!evolvedOnly || evolvedColony(col)) sumSq += col.size * col.size;
  return { maxCol, colonies: sim.colonies.length, inColFrac: inCol / n, avgCol: sumSq / n, laborCols, organism };
}

// Самый «колониальный» вид: доля особей в колониях из 3+ клеток (для видов от 30 особей)
function bestColonialShare() {
  const tot = new Map(), inc = new Map();
  for (const c of sim.cells) {
    tot.set(c.sp, (tot.get(c.sp) || 0) + 1);
    if (c.col && c.col.size >= 3) inc.set(c.sp, (inc.get(c.sp) || 0) + 1);
  }
  let best = 0;
  for (const [sp, n] of tot) if (n >= 30 && sp.rootArc !== 'volvox') best = Math.max(best, (inc.get(sp) || 0) / n);
  return best;
}
