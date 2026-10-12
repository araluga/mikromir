'use strict';
// ───────── Клетка ─────────

let nextCellId = 1;

// Ограничение численности (ради производительности): сначала тормозится деление мелких клеток
function divisionAllowed(c) {
  // учитываем и уже начатые деления: они дадут потомков через DIV_TIME
  const pop = sim.cells.length + sim.births.length + sim.pendingDiv, cap = SETTINGS.popCap;
  if (pop >= cap * 1.3) return false;   // аварийный потолок — ради производительности
  if (pop < cap) return true;
  // чашка переполнена: тормозим деление самых массовых видов (частотно-зависимый отбор);
  // основное же ограничение — рост затрат на жизнь в тесноте (см. update), он сохраняет смену поколений
  const share = c.sp.count / pop;
  return Math.random() > Math.min(1, share * 2.5) * (pop - cap) / (cap * 0.3);
}
function divisionAllowedCounted(c) {
  const ok = divisionAllowed(c);
  if (ok) sim.pendingDiv++;
  return ok;
}

class Cell {
  constructor(genome, species, x, y, o = {}) {
    this.id = nextCellId++;
    this.g = genome; this.t = genome.t; this.sp = species;
    this.gen = o.gen || 0; this.parentId = o.parentId || 0;
    this.x = x; this.y = y;
    this.ang = o.ang !== undefined ? o.ang : Math.random() * TAU;
    this.vx = 0; this.vy = 0;
    this.brain = null;
    this.derive();
    this.brain = new Brain(genome.w, this.eta, this.nh);
    this.mass = o.mass !== undefined ? o.mass : this.maxMass * rand(0.55, 0.9);
    this.r = Math.sqrt(this.mass);
    this.m75 = Math.pow(this.mass, 0.75);
    this.energy = o.energy !== undefined ? o.energy : this.mass * 0.9;
    this.lastV = this.energy + this.mass;
    this.health = 1; this.age = 0; this.dead = false; this.cause = '';
    this.state = 0;         // 0 — активна, 1 — спора
    this.sporeT = 0; this.divT = -1;
    this.dmg = 0; this.para = 0; this.digest = 0;
    this.conjCd = rand(4, 10); this.conjWith = null; this.conjT = 0;
    this.nEma = 0; this.kinN = 0; this.thr = null; this.thrGap = 1e9; this.nb = null; this.nbGap = 1e9; this.deb = null; this.debGap = 1e9;
    this.thrust = 0.5; this.turn = 0; this.tumble = false; this.attack = false;
    this.toxOut = 0; this.sigOut = 0;
    this.wantDiv = true; this.wantConj = false; this.wantSpore = false;
    this.reward = 0; this.intake = 0; this.phiOld = 0; this.hasPhi = false; this.L = 0; this.thinkN = 0; this.wall = 0;
    this.gP = 0; this.gO = 0; this.gH = 0;   // доходы: фотосинтез / осмотрофия / охота (сглаженные)
    this.kids = 0; this.kills = 0; this.born = sim.time;
    this.seed = Math.random() * 1000; this.phase = Math.random() * TAU;
    this.vac = [];
  }

  derive() {
    const t = this.t;
    this.maxR = maxRadiusOf(t);
    this.maxMass = this.maxR * this.maxR;
    this.euk = eukOf(this.maxR);
    const fEff = clamp(1.25 - this.maxR / 22, 0.3, 1);
    this.vF = t[T.FLAG] * 58 * fEff;
    this.vC = t[T.CILIA] * 70 * this.euk;
    this.vP = t[T.PSEUDO] * 20 * this.euk;
    this.vMax = this.vF + this.vC + this.vP + 2;
    this.turnK = 0.6 + t[T.FLAG] * 1.5 * fEff + t[T.CILIA] * 3.5 * this.euk + t[T.PSEUDO] * 2 * this.euk;
    let up = 0;
    for (let i = 0; i < N_TRAITS; i++) up += TRAIT_COST[i] * t[i];
    this.upK = up;
    this.moveK = 0.05 * t[T.FLAG] + 0.06 * t[T.CILIA] + 0.04 * t[T.PSEUDO];
    this.eta = 0.25 * SETTINGS.learnGain * t[T.LEARN] * t[T.LEARN];
    this.nh = brainSizeOf(t);
    this.brainCost = TRAIT_COST[T.BRAIN] * t[T.BRAIN];   // доля затрат на «мозг» (для инспектора)
    this.engulfRatio = this.euk * (0.35 + 0.45 * t[T.PHAGO] + 0.25 * t[T.PSEUDO]);
    // дотягиваются ли ложноножки / хоботок до соседа (доля радиуса)
    // у инфузорий реснички околоротовой воронки создают водоворот, затягивающий добычу
    this.reachK = this.euk * (0.35 * t[T.PSEUDO] + 0.3 * t[T.HARPOON] + 1.2 * t[T.CILIA] * t[T.PHAGO]);
    // форма для отрисовки: 0 палочка, 1 амёба, 2 инфузория, 3 жгутиконосец/водоросль
    if (this.euk < 0.5) this.shape = 0;
    else if (t[T.PSEUDO] > 0.3 && t[T.PSEUDO] >= t[T.CILIA] && t[T.PSEUDO] >= t[T.FLAG]) this.shape = 1;
    else if (t[T.CILIA] > 0.3 && t[T.CILIA] >= t[T.FLAG]) this.shape = 2;
    else this.shape = 3;
    if (this.brain) { this.brain.eta = this.eta; this.brain.nh = this.nh; }
  }

  get cap() { return this.mass * 2; }

  // ───── Органы чувств → входы нейросети ─────
  sense() {
    const inp = this.brain.inp;
    const ca = Math.cos(this.ang), sa = Math.sin(this.ang);
    const off = this.r + 4;
    const x = this.x, y = this.y;
    const fx = x + ca * off, fy = y + sa * off, bx = x - ca * off, by = y - sa * off;
    const lx = x - sa * off, ly = y + ca * off, rx = x + sa * off, ry = y - ca * off;
    const N = env.N.a, Tx = env.T.a, S = env.S.a;

    const nHere = sampleF(N, x, y);
    inp[0] = 1;
    inp[1] = this.energy / this.cap;
    inp[2] = this.health;
    inp[3] = this.mass / this.maxMass;
    inp[4] = Math.tanh(nHere * 1.5);
    inp[5] = Math.tanh((sampleF(N, fx, fy) - sampleF(N, bx, by)) * 12);
    inp[6] = Math.tanh((sampleF(N, lx, ly) - sampleF(N, rx, ry)) * 12);
    inp[7] = Math.tanh((nHere - this.nEma) * 25);   // временной градиент, как у E. coli
    this.nEma += (nHere - this.nEma) * 0.3;

    const sh = shadeAt(x, y);
    const L = lightRaw(x, y) * sh;
    this.L = L;
    inp[8] = L;
    inp[9] = Math.tanh((lightRaw(fx, fy) - lightRaw(bx, by)) * sh * 40);
    inp[10] = Math.tanh((lightRaw(lx, ly) - lightRaw(rx, ry)) * sh * 40);

    inp[11] = Math.tanh(sampleF(Tx, x, y) * 2);
    inp[12] = Math.tanh((sampleF(Tx, fx, fy) - sampleF(Tx, bx, by)) * 6);
    inp[13] = Math.tanh((sampleF(Tx, lx, ly) - sampleF(Tx, rx, ry)) * 6);
    inp[14] = Math.tanh((sampleF(S, fx, fy) - sampleF(S, bx, by)) * 6);
    inp[15] = Math.tanh((sampleF(S, lx, ly) - sampleF(S, rx, ry)) * 6);
    inp[16] = Math.tanh(sampleF(env.Q.a, x, y));

    const nb = this.nb;
    if (nb && !nb.dead && this.nbGap < SENSE_RANGE) {
      const dx = nb.x - x, dy = nb.y - y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      inp[I.PP] = 1 - clamp(this.nbGap / SENSE_RANGE, 0, 1);
      inp[I.PS] = (-dx * sa + dy * ca) / d;
      inp[I.PC] = (dx * ca + dy * sa) / d;
      inp[I.PR] = Math.tanh(Math.log(nb.r / this.r));
    } else { inp[I.PP] = inp[I.PS] = inp[I.PC] = inp[I.PR] = 0; }
    const th = this.thr;
    if (th && !th.dead && this.thrGap < SENSE_RANGE) {
      const dx = th.x - x, dy = th.y - y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      inp[I.TP] = 1 - clamp(this.thrGap / SENSE_RANGE, 0, 1);
      inp[I.TS] = (-dx * sa + dy * ca) / d;
      inp[I.TC] = (dx * ca + dy * sa) / d;
    } else { inp[I.TP] = inp[I.TS] = inp[I.TC] = 0; }
    inp[I.KIN] = Math.tanh(this.kinN / 5);

    const db = this.deb;
    if (db && db.e > 0 && this.debGap < SENSE_RANGE) {
      const dx = db.x - x, dy = db.y - y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      inp[I.DP] = 1 - clamp(this.debGap / SENSE_RANGE, 0, 1);
      inp[I.DS] = (-dx * sa + dy * ca) / d;
      inp[I.DC] = (dx * ca + dy * sa) / d;
    } else { inp[I.DP] = inp[I.DS] = inp[I.DC] = 0; }

    inp[I.DMG] = Math.min(1, this.dmg * 4);
    inp[I.CLK] = Math.sin(sim.time * 1.3 + this.phase);
    inp[I.RW] = this.reward;
  }

  // ───── Мышление и обучение ─────
  think() {
    const b = this.brain;
    // награда: прирост «энергия + биомасса» за шаг, штраф за боль
    // обучение идёт через такт мышления (экономия), награда считается за весь интервал
    const learning = SETTINGS.learning && this.eta > 0.0004 && (++this.thinkN % SETTINGS.learnEvery) === 0;
    if (!learning && SETTINGS.learning && this.eta > 0.0004) { this.sense(); b.step(0, false); this.decode(); return; }
    // награда — «вкус» добытой пищи за интервал (как привлечение аттрактанта у бактерий) минус боль;
    // затраты на движение сюда не входят: их оценивает эволюция, а не обучение
    const rate = this.intake / (this.m75 * DT * BRAIN_EVERY * SETTINGS.learnEvery);
    this.intake = 0;
    this.sense();
    // формирование награды через потенциал (Ng et al., 1999): поощряется улучшение условий —
    // больше еды, свет ближе к оптимуму, меньше яда. Оптимальное поведение от этого не меняется,
    // но сигнал становится быстрым и чётким — как хемотаксис у настоящих бактерий
    const phi = this.potential();
    const shaped = this.hasPhi ? (GAMMA * phi - this.phiOld) * SETTINGS.shapeK : 0;
    this.phiOld = phi; this.hasPhi = true;
    const R = Math.tanh(rate * 3) + shaped - Math.min(1, this.dmg * 4);
    b.step(R, learning);
    // «дофамин»: ошибка прогноза награды — и обучающий сигнал, и вход сети
    this.reward = clamp(b.delta, -1, 1);
    this.decode();
  }

  // «насколько здесь хорошо» по ощущениям клетки
  potential() {
    const t = this.t, inp = this.brain.inp, L = inp[I.L];
    const light = L > 0.85 ? 0.85 - 2 * (L - 0.85) : L;    // пик — полутень, яркий свет обжигает
    return (t[T.OSMO] + 0.5 * t[T.PHAGO]) * inp[I.N] + t[T.CHLORO] * light - (1 - t[T.RESIST]) * inp[I.TX];
  }

  decode() {
    const o = this.brain.out;
    this.thrust = o[O.THRUST] > 0 ? o[O.THRUST] : o[O.THRUST] * 0.3;
    this.turn = o[O.TURN];
    this.tumble = o[O.TUMBLE] > 0.3;
    this.attack = o[O.ATTACK] > 0;
    this.toxOut = o[O.TOXIN] > 0 ? o[O.TOXIN] : 0;
    this.sigOut = o[O.SIGNAL] > 0 ? o[O.SIGNAL] : 0;
    this.wantDiv = o[O.DIVIDE] > -0.2;
    this.wantConj = o[O.CONJ] > 0.4;
    this.wantSpore = o[O.SPORE] > 0.6;
    if (this.tumble && this.t[T.FLAG] > 0.08) this.ang += randn() * 1.6;
  }

  update(dt) {
    this.age += dt;
    if (this.state === 1) { this.updateSpore(dt); return; }
    if ((sim.tick + this.id) % BRAIN_EVERY === 0) this.think();
    const t = this.t;

    // ── движение: низкие числа Рейнольдса — инерции почти нет ──
    const ca = Math.cos(this.ang), sa = Math.sin(this.ang);
    let sp = this.vMax * this.thrust;
    if (this.tumble) sp *= 0.2;
    if (this.para > 0) { sp *= 0.25; this.para -= dt; }
    if (this.divT >= 0) sp *= 0.4;
    if (this.shape === 1) sp *= 0.4 + 1.1 * Math.abs(Math.sin(sim.time * 1.4 + this.phase));
    this.vx += (ca * sp - this.vx) * 0.5;
    this.vy += (sa * sp - this.vy) * 0.5;
    let bx = 0, by = 0;
    if (SETTINGS.brownian) {
      const s = Math.sqrt(2 * (30 / this.r) * dt);
      bx = randn() * s; by = randn() * s;
      this.ang += randn() * Math.sqrt(2 * (2.5 / (this.r * this.r)) * dt);
    }
    this.x += this.vx * dt + bx;
    this.y += this.vy * dt + by;
    this.ang += this.turn * this.turnK * dt;
    this.keepInDish();

    // ── обмен веществ ──
    const m75 = this.m75;
    const ix = fieldIdx(this.x, this.y);
    let gain = 0;
    if (t[T.OSMO] > 0.02) {
      const n = env.N.a[ix];
      let up = t[T.OSMO] * n * this.r * 0.9 * dt * (1 - 0.4 * this.euk);
      const avail = n * FIELD_AMT * 0.5;
      if (up > avail) up = avail;
      env.N.a[ix] = n - up / FIELD_AMT;
      gain += up * 0.9;
      this.intake += up * 0.9;
      this.gO += (up * 0.9 / dt - this.gO) * 0.005;
    }
    if (t[T.CHLORO] > 0.02) {
      const L = lightAt(this.x, this.y);
      const p = t[T.CHLORO] * L * Math.pow(this.r, 1.6) * 0.3 * dt;
      gain += p;
      this.intake += p;
      this.gP += (p / dt - this.gP) * 0.005;
      if (L > 0.85) this.hurt((L - 0.85) * t[T.CHLORO] * 0.5 * dt, 'light');
    }
    this.gH *= 0.995;

    // локальная теснота: в переполненной ячейке растут затраты (конкуренция за кислород, отходы)
    const lm = env.massAcc[bucketOf(this.x, this.y)];
    let crowd = lm > 700 ? 1 + (lm - 700) / 700 : 1;
    // переполненная чашка: растут затраты на жизнь у всех — слабые гибнут, освобождая место потомкам
    // (без этого при упоре в лимит деления останавливаются и эволюция замирает)
    const pop = sim.cells.length, capP = SETTINGS.popCap;
    if (pop > capP * 0.8) { const q = (pop - capP * 0.8) / (capP * 0.2); crowd *= 1 + 2 * q * q; }
    let cost = (0.016 + this.upK) * m75 * crowd * dt + Math.abs(this.thrust) * this.moveK * m75 * dt;
    if (this.toxOut > 0 && t[T.TOXIN] > 0.05) {
      const a = this.toxOut * t[T.TOXIN] * Math.sqrt(this.mass) * 0.25 * dt;
      env.T.a[ix] = Math.min(env.T.max, env.T.a[ix] + a);
      cost += a * 3;
    }
    if (this.sigOut > 0) {
      env.Q.a[ix] = Math.min(env.Q.max, env.Q.a[ix] + this.sigOut * 0.5 * dt);
      cost += this.sigOut * 0.01 * m75 * dt;
    }
    env.S.a[ix] = Math.min(env.S.max, env.S.a[ix] + Math.sqrt(this.mass) * 0.04 * dt);

    this.energy += gain - cost;
    const capE = this.cap;
    if (this.energy > capE) this.energy = capE;

    // рост
    if (this.mass < this.maxMass && this.energy > 0.3 * capE) {
      let dm = 0.12 * this.maxMass * dt;
      if (this.mass + dm > this.maxMass) dm = this.maxMass - this.mass;
      const spare = this.energy - 0.25 * capE;
      if (dm > spare) dm = spare;
      if (dm > 0) { this.mass += dm; this.energy -= dm; this.r = Math.sqrt(this.mass); this.m75 = Math.pow(this.mass, 0.75); }
    }

    // ── здоровье ──
    const tox = env.T.a[ix];
    if (tox > 0.01) { const res = 1 - t[T.RESIST]; this.hurt(tox * res * res * 0.9 * dt, 'toxin'); }
    if (this.L > 0.9) this.hurt((this.L - 0.9) * 0.15 * dt, 'light');
    if (this.energy <= 0) { this.energy = 0; this.hurt(0.25 * dt, 'starve'); }
    if (this.age > 500) this.hurt(0.02 * (this.age - 500) / 100 * dt, 'age');
    if (this.energy > 0.3 * capE && this.health < 1) {
      this.health = Math.min(1, this.health + 0.05 * dt);
      this.energy -= 0.03 * m75 * dt;
    }
    this.dmg *= 0.92;
    if (this.health <= 0) { this.die(this.cause || 'exhaust'); return; }

    // ── таймеры и визуал ──
    if (this.conjCd > 0) this.conjCd -= dt;
    if (this.digest > 0) this.digest -= dt;
    if (this.conjT > 0) {
      this.conjT -= dt;
      const p = this.conjWith;
      // пара скреплена пилями / цитоплазматическим мостиком: держатся вместе, пока идёт обмен
      if (!p || p.dead || this.conjT <= 0) { this.conjT = 0; this.conjWith = null; }
      else {
        const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1, want = this.r + p.r + 1;
        if (d > want * 3) { this.conjT = 0; this.conjWith = null; }
        else if (d > want) { const f = (d - want) * 0.25 / d; this.x += dx * f; this.y += dy * f; this.vx *= 0.5; this.vy *= 0.5; }
      }
    }
    for (let i = this.vac.length - 1; i >= 0; i--) { this.vac[i].life -= dt / 10; if (this.vac[i].life <= 0) this.vac.splice(i, 1); }

    // ── деление ──
    if (this.divT >= 0) {
      this.divT += dt / DIV_TIME;
      if (this.divT >= 1) divideCell(this);
    } else if (this.wantDiv && this.mass >= this.maxMass * 0.97 && this.energy >= 0.35 * capE && this.age > 2 && divisionAllowedCounted(this)) {
      this.divT = 0;
    }
    // ── спорообразование ──
    if (this.wantSpore && this.age > 3 && this.divT < 0 && this.energy > 0.03 * capE) {
      this.state = 1; this.sporeT = 0; this.energy *= 0.85; this.vx = this.vy = 0;
    }
  }

  updateSpore(dt) {
    this.sporeT += dt;
    this.energy -= 0.0004 * this.m75 * dt;
    const ix = fieldIdx(this.x, this.y);
    const tox = env.T.a[ix];
    if (tox > 0.05) { const res = 1 - this.t[T.RESIST]; this.hurt(tox * res * res * 0.08 * dt, 'toxin'); }
    if (SETTINGS.brownian) {
      const s = Math.sqrt(2 * (30 / this.r) * dt) * 0.7;
      this.x += randn() * s; this.y += randn() * s;
      this.keepInDish();
    }
    if ((sim.tick + this.id) % 10 === 0 && this.sporeT > 4) {
      const wake = 0.05 + this.t[T.WAKE] * 0.8;
      const n = env.N.a[ix];
      const L = lightAt(this.x, this.y);
      if (n > wake || (this.t[T.CHLORO] > 0.3 && L * this.t[T.CHLORO] > wake * 0.5 && L < 0.85)) {
        this.state = 0;
        this.lastV = this.energy + this.mass;
        this.brain.h.fill(0);
      }
    }
    if (this.energy <= 0) { this.energy = 0; this.hurt(0.01 * dt, 'spore'); }
    if (this.health <= 0 || this.sporeT > 900) this.die('spore');
  }

  keepInDish() {
    const dx = this.x - WORLD.cx, dy = this.y - WORLD.cy, d2 = dx * dx + dy * dy, lim = WORLD.dishR - this.r;
    if (d2 > lim * lim) {
      const d = Math.sqrt(d2);
      this.x = WORLD.cx + dx / d * lim; this.y = WORLD.cy + dy / d * lim;
      // механорецепция: упёрлась в стенку — разворачивается
      const na = Math.atan2(-dy, -dx);
      this.ang += wrapAngle(na - this.ang) * 0.3;
      this.wall = 1;
    }
  }

  hurt(v, cause) {
    this.health -= v;
    this.dmg += v;
    if (this.health <= 0 && !this.cause) this.cause = cause;
    else if (v > 0.002) this.cause = cause;
  }

  die(cause, eaten) {
    if (this.dead) return;
    this.dead = true;
    this.cause = cause;
    this.deathT = sim.time;
    onCellDeath(this, eaten);
  }

  addVacuole() {
    if (this.vac.length < 6) this.vac.push({ a: Math.random() * TAU, f: rand(0.2, 0.6), life: 1 });
  }

  // ключ состояния (переводится в интерфейсе: act.*)
  activity() {
    if (this.dead) return 'dead';
    if (this.state === 1) return 'spore';
    if (this.divT >= 0) return 'divide';
    if (this.conjT > 0) return 'conj';
    if (this.attack && this.nb && this.nbGap < 2 && this.nb.sp !== this.sp) return 'attack';
    if (this.para > 0) return 'para';
    if (this.tumble) return 'tumble';
    if (this.toxOut > 0.2 && this.t[T.TOXIN] > 0.1) return 'toxin';
    if (this.thrust > 0.3) return 'swim';
    return 'drift';
  }
}
