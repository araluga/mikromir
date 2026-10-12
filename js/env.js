'use strict';
// ───────── Среда: химические поля, свет, источники питания ─────────

class Field {
  constructor(D, decay, max) {
    this.a = new Float32Array(FIELD_N * FIELD_N);
    this.b = new Float32Array(FIELD_N * FIELD_N);
    this.D = D; this.decay = decay; this.max = max;
  }
}

const env = {
  N: null,   // растворённая органика (сахара, аминокислоты)
  T: null,   // токсины / антибиотики
  S: null,   // запах метаболитов живых клеток
  Q: null,   // сигнальные молекулы кворума
  mask: new Uint8Array(FIELD_N * FIELD_N),
  vents: [],
  lamp: { x: WORLD.cx, y: WORLD.cy - 520, sigma: 430 },
  shade: new Float32Array(BN * BN).fill(1),
  shadeAcc: new Float32Array(BN * BN),
  massAcc: new Float32Array(BN * BN),   // биомасса в ячейке сетки (локальная теснота)
  day: 1,
};

function randomInDish(margin) {
  const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * (WORLD.dishR - margin);
  return [WORLD.cx + Math.cos(a) * d, WORLD.cy + Math.sin(a) * d];
}

function newVent() {
  const [x, y] = randomInDish(140);
  return { x, y, rate: rand(45, 85), phase: rand(0, TAU), age: 0, life: rand(160, 420), vx: 0, vy: 0 };
}

function initEnv(opts = {}) {
  env.N = new Field(70, 0.002, 5);
  env.T = new Field(110, 0.035, 6);
  env.S = new Field(260, 0.6, 5);
  env.Q = new Field(180, 0.3, 5);
  const R2 = (WORLD.dishR - 4) * (WORLD.dishR - 4);
  for (let y = 0; y < FIELD_N; y++) for (let x = 0; x < FIELD_N; x++) {
    const wx = (x + 0.5) * FIELD_DX - WORLD.cx, wy = (y + 0.5) * FIELD_DX - WORLD.cy;
    const k = y * FIELD_N + x;
    env.mask[k] = (wx * wx + wy * wy < R2 && x > 0 && y > 0 && x < FIELD_N - 1 && y < FIELD_N - 1) ? 1 : 0;
    env.N.a[k] = env.mask[k] ? (opts.richness ?? 0.6) * (0.8 + Math.random() * 0.4) : 0;
  }
  env.vents = [];
  for (let i = 0; i < (opts.vents ?? 5); i++) { const v = newVent(); v.age = rand(20, 80); env.vents.push(v); }
  env.lamp = { x: WORLD.cx, y: WORLD.cy - 520, sigma: 430 };
  env.shade.fill(1);
  env.day = 1;
}

function fieldIdx(x, y) {
  let ix = (x / FIELD_DX) | 0, iy = (y / FIELD_DX) | 0;
  if (ix < 0) ix = 0; else if (ix >= FIELD_N) ix = FIELD_N - 1;
  if (iy < 0) iy = 0; else if (iy >= FIELD_N) iy = FIELD_N - 1;
  return iy * FIELD_N + ix;
}

function sampleF(a, x, y) {
  let fx = x / FIELD_DX - 0.5, fy = y / FIELD_DX - 0.5;
  if (fx < 0) fx = 0; else if (fx > FIELD_N - 1.001) fx = FIELD_N - 1.001;
  if (fy < 0) fy = 0; else if (fy > FIELD_N - 1.001) fy = FIELD_N - 1.001;
  const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, k = iy * FIELD_N + ix;
  return (a[k] * (1 - tx) + a[k + 1] * tx) * (1 - ty) + (a[k + FIELD_N] * (1 - tx) + a[k + FIELD_N + 1] * tx) * ty;
}

function addField(f, x, y, conc) {
  const k = fieldIdx(x, y);
  if (env.mask[k]) f.a[k] = Math.min(f.max, f.a[k] + conc);
}

// Мягкая кисть (для инструментов игрока и источников)
function brushField(f, x, y, rad, conc) {
  const cr = Math.ceil(rad / FIELD_DX) + 1;
  const cx = (x / FIELD_DX) | 0, cy = (y / FIELD_DX) | 0;
  for (let j = -cr; j <= cr; j++) for (let i = -cr; i <= cr; i++) {
    const gx = cx + i, gy = cy + j;
    if (gx < 0 || gy < 0 || gx >= FIELD_N || gy >= FIELD_N) continue;
    const k = gy * FIELD_N + gx;
    if (!env.mask[k]) continue;
    const dx = (gx + 0.5) * FIELD_DX - x, dy = (gy + 0.5) * FIELD_DX - y;
    const q = (dx * dx + dy * dy) / (rad * rad);
    if (q > 1) continue;
    f.a[k] = Math.min(f.max, Math.max(0, f.a[k] + conc * (1 - q)));
  }
}

// Явная схема диффузии с непроницаемыми стенками чашки
function fieldStep(f, dt, inflow) {
  const n = FIELD_N, a = f.a, b = f.b, m = env.mask;
  const kD = f.D * dt / (FIELD_DX * FIELD_DX);
  const dec = 1 - f.decay * dt, mx = f.max;
  for (let y = 1; y < n - 1; y++) {
    let k = y * n + 1;
    for (let x = 1; x < n - 1; x++, k++) {
      if (!m[k]) continue;
      const c = a[k];
      const l = m[k - 1] ? a[k - 1] : c, r = m[k + 1] ? a[k + 1] : c;
      const u = m[k - n] ? a[k - n] : c, d = m[k + n] ? a[k + n] : c;
      const v = (c + kD * (l + r + u + d - 4 * c)) * dec + inflow;
      b[k] = v > mx ? mx : v;
    }
  }
  f.a = b; f.b = a;
}

function lightRaw(x, y) {
  const dx = x - env.lamp.x, dy = y - env.lamp.y, s = env.lamp.sigma;
  return SETTINGS.light * env.day * (0.1 + Math.exp(-(dx * dx + dy * dy) / (2 * s * s)));
}
function shadeAt(x, y) {
  let bx = (x / BUCKET) | 0, by = (y / BUCKET) | 0;
  if (bx < 0) bx = 0; else if (bx >= BN) bx = BN - 1;
  if (by < 0) by = 0; else if (by >= BN) by = BN - 1;
  return env.shade[by * BN + bx];
}
function lightAt(x, y) { return lightRaw(x, y) * shadeAt(x, y); }

function envStep(dt) {
  env.day = SETTINGS.dayCycle ? 0.22 + 0.78 * clamp(0.5 + 0.7 * Math.cos(TAU * sim.time / SETTINGS.dayLength), 0, 1) : 1;
  // источники органики (как «гидротермальные» выходы / гниющие остатки)
  for (let i = 0; i < env.vents.length; i++) {
    const v = env.vents[i];
    v.age += dt;
    const fade = smoothstep(0, 20, v.age) * (1 - smoothstep(v.life - 30, v.life, v.age));
    const rate = v.rate * SETTINGS.nutrient * fade * (0.6 + 0.4 * Math.sin(sim.time * 0.05 + v.phase));
    brushField(env.N, v.x, v.y, 45, rate * dt / FIELD_AMT / 18);
    v.vx += randn() * 0.5 * dt; v.vy += randn() * 0.5 * dt;
    v.vx *= 0.995; v.vy *= 0.995;
    v.x += v.vx * dt; v.y += v.vy * dt;
    const dx = v.x - WORLD.cx, dy = v.y - WORLD.cy, dd = Math.hypot(dx, dy), lim = WORLD.dishR - 140;
    if (dd > lim) { v.x = WORLD.cx + dx / dd * lim; v.y = WORLD.cy + dy / dd * lim; v.vx = -v.vx; v.vy = -v.vy; }
    if (v.age > v.life) {
      env.vents[i] = newVent();
      simLog('Источник органики иссяк — где-то забил новый', 'env');
    }
  }
  fieldStep(env.N, dt, 0.0012 * SETTINGS.nutrient * dt);
  fieldStep(env.T, dt, 0);
  fieldStep(env.S, dt, 0);
  fieldStep(env.Q, dt, 0);
}
