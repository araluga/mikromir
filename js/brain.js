'use strict';
// ───────── Нейросеть клетки ─────────
// 31 сенсор → от 4 до 24 рекуррентных нейронов (число задаёт ген «Мозг») → 9 действий.
// Веса из генома (эволюция) + пластичные поправки, которые клетка выучивает сама.
//
// Обучение за жизнь — «актор–критик»:
//  • критик — линейный прогноз будущей награды V(h) по состоянию скрытых нейронов;
//  • ошибка прогноза δ = r + γ·V(сейчас) − V(раньше) работает как дофамин:
//    «вышло лучше, чем ожидалось» или «хуже»;
//  • актор (сама сеть) учится методом возмущения нейронов: в активность подмешан шум,
//    и связи сдвигаются туда, куда «толкнул» шум, если после этого δ > 0.
// Благодаря критику подкрепляются и действия, которые окупаются не сразу
// (например, поворот к еде за пару секунд до того, как её удастся съесть).

const GAMMA = 0.9;          // дисконт будущей награды за шаг обучения (~0,24 с) → горизонт ≈ 2–3 с
const CRITIC_LR = 0.02;     // скорость обучения критика
const TRACE = 0.85;         // затухание следов пригодности

class Brain {
  constructor(w, eta, nh) {
    this.g = w;                      // генетические веса (общие с геномом)
    this.eta = eta;                  // скорость обучения актора
    this.nh = nh;                    // число активных скрытых нейронов
    this.d = new Float32Array(PLASTIC_LEN);  // выученные поправки
    this.e = new Float32Array(PLASTIC_LEN);  // следы пригодности (eligibility traces)
    this.inp = new Float32Array(N_IN);
    this.h = new Float32Array(N_HID);
    this.hp = new Float32Array(N_HID);
    this.acc = new Float32Array(N_HID);
    this.out = new Float32Array(N_OUT);
    this.xh = new Float32Array(N_HID);
    this.xo = new Float32Array(N_OUT);
    // критик
    this.vw = new Float32Array(N_HID);
    this.vb = 0;
    this.hOld = new Float32Array(N_HID);
    this.vOld = 0;
    this.hasOld = false;
    this.value = 0;                  // текущий прогноз будущей награды
    this.delta = 0;                  // последний «дофаминовый» сигнал
    this.dMag = 0;                   // насколько сеть изменилась обучением
    this.steps = 0;
  }

  // R — награда за прошедший интервал; learning — шаг обучения (иначе только прямой проход)
  step(R, learning) {
    const g = this.g, d = this.d, inp = this.inp, h = this.h, hp = this.hp, acc = this.acc;
    const xh = this.xh, xo = this.xo, out = this.out, e = this.e;
    const nh = this.nh;

    // 1) прямой проход
    hp.set(h);
    acc.fill(0);
    for (let i = 0; i < N_IN; i++) {
      const x = inp[i];
      if (x === 0) continue;
      const b = i * N_HID;
      for (let j = 0; j < nh; j++) acc[j] += x * (g[b + j] + d[b + j]);
    }
    for (let k = 0; k < nh; k++) {
      const x = hp[k];
      const b = R_OFF + k * N_HID;
      for (let j = 0; j < nh; j++) acc[j] += x * g[b + j];
    }
    for (let j = 0; j < nh; j++) {
      const n = (Math.random() + Math.random() + Math.random() - 1.5) * 0.24;   // ≈ N(0; 0,12)
      xh[j] = n;
      h[j] = Math.tanh(acc[j] + n);
    }
    for (let o = 0; o < N_OUT; o++) out[o] = g[B2_OFF + o];
    for (let j = 0; j < nh; j++) {
      const x = h[j];
      const bg = W2_OFF + j * N_OUT, bd = W1_LEN + j * N_OUT;
      for (let o = 0; o < N_OUT; o++) out[o] += x * (g[bg + o] + d[bd + o]);
    }
    for (let o = 0; o < N_OUT; o++) {
      const n = (Math.random() + Math.random() + Math.random() - 1.5) * 2 * SETTINGS.explore;   // ≈ N(0; explore)
      xo[o] = n;
      out[o] = Math.tanh(out[o] + n);
    }
    if (!learning) return;

    // 2) критик: прогноз будущей награды из нового состояния
    let v = this.vb;
    for (let j = 0; j < nh; j++) v += this.vw[j] * h[j];

    let k = 0;
    if (this.hasOld) {
      // 3) дофамин: насколько стало лучше, чем ожидалось
      let delta = R + GAMMA * v - this.vOld;
      delta = delta > 2 ? 2 : delta < -2 ? -2 : delta;
      this.delta = delta;
      k = this.eta * delta;
      // 4) критик учится предсказывать точнее
      const ck = CRITIC_LR * delta, ho = this.hOld;
      for (let j = 0; j < nh; j++) this.vw[j] += ck * ho[j];
      this.vb += ck;
      v = this.vb;
      for (let j = 0; j < nh; j++) v += this.vw[j] * h[j];
    }
    this.value = v;
    this.vOld = v;
    this.hOld.set(h);
    this.hasOld = true;

    // 5) актор (за один проход): сдвиг весов вдоль следов прошлых «проб»,
    //    затем новые следы — «какой вход совпал с каким случайным отклонением»
    const stat = (++this.steps & 7) === 0;
    let mag = 0;
    for (let i = 0; i < N_IN; i++) {
      const x = inp[i], b = i * N_HID;
      for (let j = 0; j < nh; j++) {
        const idx = b + j;
        let w = d[idx] * 0.9995 + k * e[idx];
        w = w > 2 ? 2 : w < -2 ? -2 : w;
        d[idx] = w;
        e[idx] = e[idx] * TRACE + x * xh[j];
        if (stat) mag += w < 0 ? -w : w;
      }
    }
    for (let j = 0; j < nh; j++) {
      const x = h[j], b = W1_LEN + j * N_OUT;
      for (let o = 0; o < N_OUT; o++) {
        const idx = b + o;
        let w = d[idx] * 0.9995 + k * e[idx];
        w = w > 2 ? 2 : w < -2 ? -2 : w;
        d[idx] = w;
        e[idx] = e[idx] * TRACE + x * xo[o];
        if (stat) mag += w < 0 ? -w : w;
      }
    }
    if (stat) this.dMag = mag / (nh * (N_IN + N_OUT));
  }

  // ламарковский режим: потомок получает и выученного критика
  copyCriticFrom(p) {
    this.vw.set(p.vw);
    this.vb = p.vb;
  }
}
