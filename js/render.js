'use strict';
// ───────── Отрисовка: микроскоп тёмного поля ─────────

const R = {
  canvas: null, ctx: null, dpr: 1, W: 0, H: 0,
  fieldCanvas: null, fieldCtx: null, fieldImg: null,
  frame: 0, animT: 0, dishGrad: null,
  layers: { N: true, T: true, Q: false, S: false, light: true, senses: true },
  mouse: { x: 0, y: 0, wx: 0, wy: 0, inside: false },
};
const cam = { x: WORLD.cx, y: WORLD.cy, z: 0.45, follow: false };

function initRender(canvas) {
  R.canvas = canvas;
  R.ctx = canvas.getContext('2d', { alpha: false });
  R.fieldCanvas = document.createElement('canvas');
  R.fieldCanvas.width = R.fieldCanvas.height = FIELD_N;
  R.fieldCtx = R.fieldCanvas.getContext('2d');
  R.fieldImg = R.fieldCtx.createImageData(FIELD_N, FIELD_N);
  resizeCanvas();
  fitCamera();
}

function resizeCanvas() {
  R.dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = R.canvas.clientWidth, h = R.canvas.clientHeight;
  R.W = Math.max(1, Math.round(w * R.dpr));
  R.H = Math.max(1, Math.round(h * R.dpr));
  R.canvas.width = R.W; R.canvas.height = R.H;
  const g = R.ctx.createRadialGradient(WORLD.cx, WORLD.cy - 200, 50, WORLD.cx, WORLD.cy, WORLD.dishR);
  g.addColorStop(0, '#0d2230');
  g.addColorStop(0.7, '#091822');
  g.addColorStop(1, '#050d14');
  R.dishGrad = g;
}

function fitCamera() {
  const w = R.W / R.dpr, h = R.H / R.dpr;
  cam.z = Math.min(w, h) / (WORLD.dishR * 2 + 60);
  cam.x = WORLD.cx; cam.y = WORLD.cy;
}

function screenToWorld(px, py) {
  return [cam.x + (px - R.W / R.dpr / 2) / cam.z, cam.y + (py - R.H / R.dpr / 2) / cam.z];
}

function updateFieldImage() {
  const d = R.fieldImg.data, m = env.mask;
  const N = env.N.a, Tx = env.T.a, Q = env.Q.a, S = env.S.a, L = R.layers;
  for (let k = 0, p = 0; k < m.length; k++, p += 4) {
    if (!m[k]) { d[p + 3] = 0; continue; }
    const n = L.N ? Math.min(1, N[k] * 0.32) : 0;
    const t = L.T ? Math.min(1, Tx[k] * 1.3) : 0;
    const q = L.Q ? Math.min(1, Q[k] * 0.8) : 0;
    const s = L.S ? Math.min(1, S[k] * 0.5) : 0;
    const w = n + t + q + s;
    if (w < 0.004) { d[p + 3] = 0; continue; }
    d[p] = (n * 30 + t * 235 + q * 240 + s * 120) / w;
    d[p + 1] = (n * 170 + t * 50 + q * 200 + s * 110) / w;
    d[p + 2] = (n * 150 + t * 175 + q * 60 + s * 240) / w;
    d[p + 3] = Math.min(220, (n * 0.42 + t * 0.75 + q * 0.5 + s * 0.4) * 255);
  }
  R.fieldCtx.putImageData(R.fieldImg, 0, 0);
}

function render(fdt, running) {
  const ctx = R.ctx, W = R.W, H = R.H;
  R.frame++;
  if (running) R.animT += fdt;
  const sel = sim.selected;
  if (cam.follow && sel && !sel.dead) {
    cam.x += (sel.x - cam.x) * Math.min(1, fdt * 6);
    cam.y += (sel.y - cam.y) * Math.min(1, fdt * 6);
  }
  const k = cam.z * R.dpr;
  const ox = W / 2 - cam.x * k, oy = H / 2 - cam.y * k;
  const cpx = 1 / cam.z;   // 1 CSS-пиксель в единицах мира

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#03060a';
  ctx.fillRect(0, 0, W, H);

  ctx.setTransform(k, 0, 0, k, ox, oy);
  ctx.beginPath();
  ctx.arc(WORLD.cx, WORLD.cy, WORLD.dishR, 0, TAU);
  ctx.fillStyle = R.dishGrad;
  ctx.fill();

  ctx.save();
  ctx.clip();
  if (R.frame % 3 === 1) updateFieldImage();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(R.fieldCanvas, 0, 0, WORLD.size, WORLD.size);

  if (R.layers.light) {
    const s = env.lamp.sigma, a = 0.16 * SETTINGS.light * env.day;
    const g = ctx.createRadialGradient(env.lamp.x, env.lamp.y, 0, env.lamp.x, env.lamp.y, s * 2.2);
    g.addColorStop(0, `rgba(255,236,190,${a})`);
    g.addColorStop(0.45, `rgba(255,220,160,${a * 0.45})`);
    g.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(env.lamp.x - s * 2.2, env.lamp.y - s * 2.2, s * 4.4, s * 4.4);
    ctx.globalCompositeOperation = 'source-over';
  }

  // источники органики
  if (R.layers.N) {
    ctx.lineWidth = 1.2 * cpx;
    for (const v of env.vents) {
      const f = smoothstep(0, 20, v.age) * (1 - smoothstep(v.life - 30, v.life, v.age));
      const ph = (R.animT * 0.5 + v.phase) % 1;
      ctx.strokeStyle = `rgba(90,230,200,${0.25 * f * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(v.x, v.y, 20 + ph * 50, 0, TAU); ctx.stroke();
    }
  }

  const vx0 = cam.x - W / 2 / k - 40, vx1 = cam.x + W / 2 / k + 40;
  const vy0 = cam.y - H / 2 / k - 40, vy1 = cam.y + H / 2 / k + 40;

  // детрит
  const deb = sim.debris;
  if (deb.length) {
    ctx.fillStyle = 'rgba(176,146,98,0.75)';
    ctx.beginPath();
    const minS = 0.9 * cpx;
    for (let i = 0; i < deb.length; i++) {
      const d = deb[i];
      if (d.x < vx0 || d.x > vx1 || d.y < vy0 || d.y > vy1) continue;
      const s = Math.max(minS, 0.7 + Math.sqrt(d.e) * 0.3);
      ctx.moveTo(d.x + s, d.y);
      ctx.arc(d.x, d.y, s, 0, TAU);
    }
    ctx.fill();
  }

  drawCells(ctx, k, ox, oy, vx0, vx1, vy0, vy1, cpx);

  // ночь
  ctx.setTransform(k, 0, 0, k, ox, oy);
  if (env.day < 0.95) {
    ctx.fillStyle = `rgba(2,4,20,${(0.95 - env.day) * 0.42})`;
    ctx.fillRect(0, 0, WORLD.size, WORLD.size);
  }
  // частицы-эффекты
  drawFx(ctx, fdt, running, cpx);
  ctx.restore();

  // край чашки
  ctx.setTransform(k, 0, 0, k, ox, oy);
  ctx.beginPath(); ctx.arc(WORLD.cx, WORLD.cy, WORLD.dishR, 0, TAU);
  ctx.lineWidth = 7 * cpx; ctx.strokeStyle = 'rgba(120,180,215,0.12)'; ctx.stroke();
  ctx.lineWidth = 1.5 * cpx; ctx.strokeStyle = 'rgba(170,215,240,0.45)'; ctx.stroke();

  // лампа
  if (R.layers.light || ui.tool === 'lamp') {
    ctx.beginPath(); ctx.arc(env.lamp.x, env.lamp.y, 9 * cpx, 0, TAU);
    ctx.fillStyle = `rgba(255,230,160,${0.35 + 0.5 * env.day})`; ctx.fill();
    ctx.lineWidth = 1.5 * cpx; ctx.strokeStyle = 'rgba(255,240,200,0.8)'; ctx.stroke();
  }

  drawSelection(ctx, cpx);
  drawCursor(ctx, cpx);
}

function drawCells(ctx, k, ox, oy, vx0, vx1, vy0, vy1, cpx) {
  const cells = sim.cells, time = R.animT;
  // проход 1: мелкие — точками
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.95;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.x < vx0 || c.x > vx1 || c.y < vy0 || c.y > vy1) continue;
    const sr = c.r * k;
    if (sr >= 2.4) continue;
    const s = Math.max(1.3 * R.dpr, sr * 1.7);
    ctx.fillStyle = c.state === 1 ? '#d8c08a' : c.sp.cSolid;
    ctx.fillRect(c.x * k + ox - s / 2, c.y * k + oy - s / 2, s, s);
  }
  // проход 2: средние — пачками, один путь на вид (быстро даже для тысяч клеток)
  // проход 3: крупные на экране — подробно, с органеллами
  const conj = [], batches = new Map(), spores = [];
  const DETAIL = 7;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.x < vx0 || c.x > vx1 || c.y < vy0 || c.y > vy1) continue;
    const sr = c.r * k;
    if (c.conjT > 0 && c.conjWith && c.id < c.conjWith.id) conj.push(c);
    if (sr < 2.4 || sr >= DETAIL) continue;
    if (c.state === 1) { spores.push(c); continue; }
    let b = batches.get(c.sp);
    if (!b) { b = []; batches.set(c.sp, b); }
    b.push(c);
  }
  if (batches.size || spores.length) {
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.lineWidth = 1.1 * cpx;
    for (const [sp, list] of batches) {
      ctx.beginPath();
      for (const c of list) {
        const [rx, ry] = bodyRadii(c);
        const ca = Math.cos(c.ang), sa = Math.sin(c.ang);
        ctx.moveTo(c.x + ca * rx, c.y + sa * rx);
        ctx.ellipse(c.x, c.y, rx, ry, c.ang, 0, TAU);
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = sp.cBody; ctx.fill();
      ctx.strokeStyle = sp.cEdge; ctx.stroke();
    }
    if (spores.length) {
      ctx.beginPath();
      for (const c of spores) { ctx.moveTo(c.x + c.r * 0.7, c.y); ctx.arc(c.x, c.y, c.r * 0.7, 0, TAU); }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(120,96,52,0.85)'; ctx.fill();
      ctx.strokeStyle = '#e9d090'; ctx.stroke();
    }
  }
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.x < vx0 || c.x > vx1 || c.y < vy0 || c.y > vy1) continue;
    const sr = c.r * k;
    if (sr < DETAIL) continue;
    drawCell(ctx, c, k, c.x * k + ox, c.y * k + oy, sr, time);
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
  if (conj.length) {
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.strokeStyle = 'rgba(220,255,240,0.8)';
    ctx.lineWidth = 1.5 * cpx;
    ctx.setLineDash([3 * cpx, 2 * cpx]);
    ctx.beginPath();
    for (const c of conj) { ctx.moveTo(c.x, c.y); ctx.lineTo(c.conjWith.x, c.conjWith.y); }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function bodyRadii(c) {
  const r = c.r;
  switch (c.shape) {
    case 0: return [r * 1.45, r * 0.68];
    case 2: return [r * 1.25, r * 0.8];
    case 3: return [r * 1.12, r * 0.88];
    default: return [r, r];
  }
}

function blobPath(ctx, c, r, time) {
  const n = 14, pts = [];
  const s = c.seed;
  const push = Math.max(0, c.thrust);
  for (let i = 0; i < n; i++) {
    const th = i / n * TAU;
    let rad = 1 + 0.15 * Math.sin(time * 0.9 + s + i * 1.7) + 0.1 * Math.sin(time * 1.7 + s * 2 + i * 2.9);
    rad += 0.38 * Math.pow(Math.max(0, Math.cos(th - 0.4 * Math.sin(time * 0.5 + s))), 3) * push * (0.6 + 0.4 * Math.sin(time * 1.3 + s));
    // боковые ложноножки
    rad += 0.22 * Math.pow(Math.max(0, Math.sin(th * 2 + time * 0.35 + s)), 6);
    pts.push(Math.cos(th) * r * rad, Math.sin(th) * r * rad);
  }
  ctx.beginPath();
  let mx = (pts[2 * (n - 1)] + pts[0]) / 2, my = (pts[2 * (n - 1) + 1] + pts[1]) / 2;
  ctx.moveTo(mx, my);
  for (let i = 0; i < n; i++) {
    const x = pts[2 * i], y = pts[2 * i + 1];
    const j = (i + 1) % n;
    const nx = (x + pts[2 * j]) / 2, ny = (y + pts[2 * j + 1]) / 2;
    ctx.quadraticCurveTo(x, y, nx, ny);
  }
  ctx.closePath();
}

function bodyPath(ctx, c, rx, ry, time) {
  if (c.shape === 1) { blobPath(ctx, c, c.r, time); return; }
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
}

function drawCell(ctx, c, k, sx, sy, sr, time) {
  const r = c.r, t = c.t, sp = c.sp;
  const ca = Math.cos(c.ang), sa = Math.sin(c.ang);
  ctx.setTransform(k * ca, k * sa, -k * sa, k * ca, sx, sy);
  const px = 1 / k;

  if (c.state === 1) {   // спора
    ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.72, r * 0.52, 0, 0, TAU);
    ctx.fillStyle = 'rgba(120,96,52,0.85)'; ctx.fill();
    ctx.lineWidth = Math.max(px, r * 0.14); ctx.strokeStyle = '#e9d090'; ctx.stroke();
    return;
  }
  const ef = clamp(c.energy / c.cap, 0, 1);
  const alpha = 0.5 + 0.5 * Math.min(1, ef * 2.5);
  const [rx, ry] = bodyRadii(c);
  ctx.lineCap = 'round';

  if (t[T.FLAG] > 0.12 && sr > 3) drawFlagella(ctx, c, rx, time, px, alpha);

  if (c.divT >= 0) {
    const p = c.divT, off = rx * 0.5 * p, sc = 1 - 0.3 * p;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * off, 0);
      ctx.scale(sc, 1 - 0.1 * p);
      drawBody(ctx, c, rx, ry, sr, time, px, alpha);
      ctx.restore();
    }
  } else {
    drawBody(ctx, c, rx, ry, sr, time, px, alpha);
  }
}

function drawFlagella(ctx, c, rx, time, px, alpha) {
  const t = c.t, r = c.r;
  const front = c.euk > 0.5;   // у эукариот жгутик тянет спереди, у бактерий толкает сзади
  const len = r * (1.4 + 2.4 * t[T.FLAG]);
  const amp = r * 0.22;
  const ph = time * (10 + 26 * Math.abs(c.thrust)) + c.phase;
  const x0 = front ? rx * 0.95 : -rx * 0.95, dir = front ? 1 : -1;
  const n = !front && t[T.FLAG] > 0.5 ? 2 : 1;
  ctx.globalAlpha = alpha * 0.7;
  ctx.strokeStyle = c.sp.cEdge;
  ctx.lineWidth = Math.max(px * 0.9, r * 0.07);
  ctx.beginPath();
  for (let f = 0; f < n; f++) {
    const yo = n > 1 ? (f ? 1 : -1) * r * 0.18 : 0;
    ctx.moveTo(x0, yo);
    for (let s = 1; s <= 12; s++) {
      const u = s / 12;
      ctx.lineTo(x0 + dir * u * len, yo * (1 - u) + Math.sin(ph - u * 8 + f * 1.3) * amp * u);
    }
  }
  ctx.stroke();
}

function drawBody(ctx, c, rx, ry, sr, time, px, alpha) {
  const t = c.t, sp = c.sp, r = c.r;
  // реснички
  if (t[T.CILIA] > 0.12 && c.euk > 0.3 && sr > 4.5) {
    const n = sr > 18 ? 40 : 26;
    const L = r * (0.12 + 0.2 * t[T.CILIA]);
    const spd = 10 + 14 * Math.abs(c.thrust);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const th = i / n * TAU;
      const ex = Math.cos(th) * rx, ey = Math.sin(th) * ry;
      let nx = Math.cos(th) * ry, ny = Math.sin(th) * rx;
      const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
      const b = Math.sin(time * spd - th * 4 + c.phase) * 0.7;   // метахрональная волна
      const cb = Math.cos(b), sb = Math.sin(b);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + (nx * cb - ny * sb) * L, ey + (nx * sb + ny * cb) * L);
    }
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = sp.cEdge;
    ctx.lineWidth = Math.max(px * 0.7, r * 0.03);
    ctx.stroke();
  }

  bodyPath(ctx, c, rx, ry, time);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = sp.cBody;
  ctx.fill();
  ctx.lineWidth = Math.max(px * 1.1, r * 0.07) * (1 + t[T.ARMOR] * 1.4);
  ctx.strokeStyle = c.dmg > 0.03 ? 'rgba(255,90,80,0.95)' : sp.cEdge;
  ctx.stroke();

  if (sr < 4.5) return;

  if (t[T.ARMOR] > 0.35 && c.shape !== 1) {   // панцирь / клеточная стенка
    ctx.globalAlpha = alpha * 0.4 * t[T.ARMOR];
    ctx.strokeStyle = '#efe4b8';
    ctx.lineWidth = Math.max(px, r * 0.04);
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.84, ry * 0.8, 0, 0, TAU); ctx.stroke();
    if (c.euk > 0.5 && sr > 10) {
      ctx.beginPath();
      for (let i = -3; i <= 3; i++) { ctx.moveTo(i * rx * 0.2, -ry * 0.55); ctx.lineTo(i * rx * 0.2, ry * 0.55); }
      ctx.stroke();
    }
  }

  // хлоропласты / тилакоиды
  const chl = t[T.CHLORO];
  if (chl > 0.1) {
    if (c.euk < 0.5) {
      ctx.globalAlpha = alpha * 0.75 * chl;
      ctx.strokeStyle = '#6fe07a';
      ctx.lineWidth = Math.max(px, r * 0.08);
      ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.72, ry * 0.58, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.45, ry * 0.3, 0, 0, TAU); ctx.stroke();
    } else {
      const n = 2 + Math.round(chl * 9);
      const cr = r * 0.15;
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = '#4fd65d';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = c.seed * 7.1 + i * 2.399 + time * 0.12;
        const f = 0.3 + 0.48 * frac(c.seed * 3.3 + i * 0.618);
        const x = Math.cos(a) * rx * f, y = Math.sin(a) * ry * f;
        ctx.moveTo(x + Math.cos(a) * cr, y + Math.sin(a) * cr);
        ctx.ellipse(x, y, cr, cr * 0.62, a, 0, TAU);
      }
      ctx.fill();
    }
  }

  // ядро / нуклеоид
  if (c.euk > 0.5) {
    const nx = -rx * 0.18, ny = ry * 0.12, nr = r * 0.27;
    ctx.globalAlpha = alpha * 0.85;
    ctx.beginPath(); ctx.arc(nx, ny, nr, 0, TAU);
    ctx.fillStyle = sp.cNuc; ctx.fill();
    ctx.globalAlpha = alpha * 0.5;
    ctx.lineWidth = Math.max(px, r * 0.035); ctx.strokeStyle = sp.cEdge; ctx.stroke();
    ctx.beginPath(); ctx.arc(nx + nr * 0.2, ny - nr * 0.15, nr * 0.32, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
  } else if (sr > 6) {
    ctx.globalAlpha = alpha * 0.45;
    ctx.strokeStyle = sp.cDark;
    ctx.lineWidth = Math.max(px, r * 0.1);
    ctx.beginPath();
    ctx.moveTo(-rx * 0.45, 0);
    ctx.bezierCurveTo(-rx * 0.2, -ry * 0.5, rx * 0.1, ry * 0.5, rx * 0.4, -ry * 0.05);
    ctx.stroke();
  }

  // пищеварительные вакуоли (кружат — циклоз)
  if (c.vac.length) {
    ctx.fillStyle = 'rgba(168,118,62,0.75)';
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (const v of c.vac) {
      const a = v.a + time * 0.35, vr = r * 0.15 * (0.4 + 0.6 * v.life);
      const x = Math.cos(a) * rx * v.f, y = Math.sin(a) * ry * v.f;
      ctx.moveTo(x + vr, y); ctx.arc(x, y, vr, 0, TAU);
    }
    ctx.fill();
  }

  // токсичные гранулы
  if (t[T.TOXIN] > 0.3) {
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = '#c77dff';
    ctx.beginPath();
    const n = 2 + Math.round(t[T.TOXIN] * 4), gr = Math.max(px * 0.8, r * 0.09);
    for (let i = 0; i < n; i++) {
      const a = c.seed * 3.7 + i * 2.1, f = 0.25 + 0.4 * frac(c.seed + i * 0.37);
      const x = Math.cos(a) * rx * f, y = Math.sin(a) * ry * f;
      ctx.moveTo(x + gr, y); ctx.arc(x, y, gr, 0, TAU);
    }
    ctx.fill();
  }

  // сократительная вакуоль
  if (c.euk > 0.5 && sr > 9) {
    const p = 0.5 + 0.5 * Math.sin(time * 2.2 + c.phase);
    ctx.globalAlpha = alpha * (0.3 + 0.4 * p);
    ctx.beginPath(); ctx.arc(rx * 0.48, -ry * 0.25, r * 0.13 * (0.35 + 0.65 * p), 0, TAU);
    ctx.fillStyle = 'rgba(210,245,255,0.18)'; ctx.fill();
    ctx.strokeStyle = 'rgba(210,245,255,0.6)'; ctx.lineWidth = Math.max(px * 0.7, r * 0.025); ctx.stroke();
  }

  // хоботок / гарпун
  if (t[T.HARPOON] > 0.3) {
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = sp.cEdge;
    const L = r * (0.2 + 0.4 * t[T.HARPOON]) * (c.euk > 0.5 ? 1 : 0.7);
    ctx.beginPath();
    ctx.moveTo(rx * 0.92, -r * 0.16);
    ctx.lineTo(rx + L, 0);
    ctx.lineTo(rx * 0.92, r * 0.16);
    ctx.closePath();
    ctx.fill();
  }
  // глазок-стигма у фотосинтезирующих жгутиконосцев
  if (chl > 0.3 && c.euk > 0.5 && t[T.FLAG] > 0.3) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ff5a3a';
    ctx.beginPath(); ctx.arc(rx * 0.62, ry * 0.18, r * 0.09, 0, TAU); ctx.fill();
  }
  // рот открыт — атака
  if (c.attack && t[T.PHAGO] > 0.25 && c.euk > 0.5 && c.digest <= 0) {
    ctx.globalAlpha = alpha * 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(rx * 0.72, 0, r * 0.12, r * 0.2, 0, 0, TAU); ctx.fill();
  }
}

function drawFx(ctx, fdt, running, cpx) {
  const fx = sim.fx;
  if (!fx.length) return;
  ctx.globalCompositeOperation = 'lighter';
  let w = 0;
  for (let i = 0; i < fx.length; i++) {
    const p = fx[i];
    if (running) {
      p.life -= fdt / p.max;
      p.x += p.vx * fdt; p.y += p.vy * fdt;
      p.vx *= 0.92; p.vy *= 0.92;
    }
    if (p.life <= 0) continue;
    fx[w++] = p;
    if (p.ring) {
      ctx.globalAlpha = p.life * 0.7;
      ctx.strokeStyle = `rgb(${p.col})`;
      ctx.lineWidth = 1.2 * cpx;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s + (1 - p.life) * p.s * 3, 0, TAU); ctx.stroke();
    } else {
      ctx.globalAlpha = p.life * 0.9;
      ctx.fillStyle = `rgb(${p.col})`;
      const s = Math.max(p.s, 1.2 * cpx);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }
  fx.length = w;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawSelection(ctx, cpx) {
  const s = sim.selected;
  if (!s || s.dead) return;
  const [rx] = bodyRadii(s);
  const rad = Math.max(rx, s.r) * 1.35 + 6 * cpx;
  ctx.lineWidth = 1.5 * cpx;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.setLineDash([6 * cpx, 4 * cpx]);
  ctx.lineDashOffset = -R.animT * 20 * cpx;
  ctx.beginPath(); ctx.arc(s.x, s.y, rad, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  if (!R.layers.senses) return;
  // радиус ощущений
  ctx.strokeStyle = 'rgba(140,200,255,0.18)';
  ctx.lineWidth = 1 * cpx;
  ctx.beginPath(); ctx.arc(s.x, s.y, s.r + SENSE_RANGE, 0, TAU); ctx.stroke();
  // намерение: куда клетка гребёт
  const L = (s.r + 18) * (0.3 + Math.max(0, s.thrust));
  const ex = s.x + Math.cos(s.ang) * (s.r + L), ey = s.y + Math.sin(s.ang) * (s.r + L);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5 * cpx;
  ctx.beginPath();
  ctx.moveTo(s.x + Math.cos(s.ang) * s.r, s.y + Math.sin(s.ang) * s.r); ctx.lineTo(ex, ey);
  const a = s.ang, h = 6 * cpx;
  ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(a - 0.5) * h, ey - Math.sin(a - 0.5) * h);
  ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(a + 0.5) * h, ey - Math.sin(a + 0.5) * h);
  ctx.stroke();
  // что клетка «чует»
  const link = (o, col) => {
    ctx.strokeStyle = col;
    ctx.setLineDash([4 * cpx, 3 * cpx]);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(o.x, o.y); ctx.stroke();
    ctx.setLineDash([]);
  };
  if (s.nb && !s.nb.dead && s.nbGap < SENSE_RANGE) link(s.nb, 'rgba(120,255,140,0.75)');
  if (s.thr && !s.thr.dead && s.thrGap < SENSE_RANGE) link(s.thr, 'rgba(255,90,80,0.85)');
  if (s.deb && s.deb.e > 0 && s.debGap < SENSE_RANGE) link(s.deb, 'rgba(220,180,110,0.7)');
}

function drawCursor(ctx, cpx) {
  if (!R.mouse.inside) return;
  const tool = ui.tool;
  if (tool === 'nutrient' || tool === 'toxin' || tool === 'laser') {
    const col = tool === 'nutrient' ? '90,230,200' : tool === 'toxin' ? '235,90,200' : '255,80,60';
    ctx.strokeStyle = `rgba(${col},0.7)`;
    ctx.lineWidth = 1.2 * cpx;
    ctx.setLineDash([5 * cpx, 4 * cpx]);
    ctx.beginPath(); ctx.arc(R.mouse.wx, R.mouse.wy, ui.brush, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  } else if (tool === 'spawn') {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.2 * cpx;
    ctx.beginPath(); ctx.arc(R.mouse.wx, R.mouse.wy, 40, 0, TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R.mouse.wx - 8 * cpx, R.mouse.wy); ctx.lineTo(R.mouse.wx + 8 * cpx, R.mouse.wy);
    ctx.moveTo(R.mouse.wx, R.mouse.wy - 8 * cpx); ctx.lineTo(R.mouse.wx, R.mouse.wy + 8 * cpx);
    ctx.stroke();
  }
}
