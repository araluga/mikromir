'use strict';
// ───────── Нейросеть клетки ─────────
// 28 сенсоров → 14 рекуррентных нейронов (tanh, память о прошлом шаге) → 9 действий.
// Веса из генома (эволюция) + пластичные поправки, которые клетка выучивает сама
// за жизнь методом возмущения нейронов (node perturbation, разновидность REINFORCE):
// к активациям добавляется шум, и если после «пробного» действия награда (прирост энергии)
// оказалась выше ожидаемой — связи сдвигаются так, чтобы повторять это действие чаще.

class Brain {
  constructor(w, eta) {
    this.g = w;                      // генетические веса (общие с геномом)
    this.eta = eta;                  // скорость обучения
    this.d = new Float32Array(PLASTIC_LEN);  // выученные поправки
    this.e = new Float32Array(PLASTIC_LEN);  // следы пригодности (eligibility traces)
    this.inp = new Float32Array(N_IN);
    this.h = new Float32Array(N_HID);
    this.hp = new Float32Array(N_HID);
    this.acc = new Float32Array(N_HID);
    this.out = new Float32Array(N_OUT);
    this.xh = new Float32Array(N_HID);
    this.xo = new Float32Array(N_OUT);
    this.base = 0;                   // ожидаемая награда (скользящее среднее)
    this.dMag = 0;                   // насколько сеть изменилась обучением
  }

  // learnAdv — «преимущество» с прошлого шага: насколько награда оказалась лучше ожидаемой
  step(learnAdv, learning) {
    const g = this.g, d = this.d, inp = this.inp, h = this.h, hp = this.hp, acc = this.acc;
    const xh = this.xh, xo = this.xo, out = this.out, e = this.e;
    // 1) обучение: сдвигаем веса вдоль следов, оставленных прошлыми «пробами»
    if (learning) {
      const k = this.eta * learnAdv;
      let mag = 0;
      for (let i = 0; i < PLASTIC_LEN; i++) {
        let v = d[i] * 0.9995 + k * e[i];
        v = v > 2 ? 2 : v < -2 ? -2 : v;
        d[i] = v;
        mag += v < 0 ? -v : v;
      }
      this.dMag = mag / PLASTIC_LEN;
    }
    // 2) прямой проход
    hp.set(h);
    acc.fill(0);
    for (let i = 0; i < N_IN; i++) {
      const x = inp[i];
      if (x === 0) continue;
      const b = i * N_HID;
      for (let j = 0; j < N_HID; j++) acc[j] += x * (g[b + j] + d[b + j]);
    }
    for (let k = 0; k < N_HID; k++) {
      const x = hp[k];
      const b = R_OFF + k * N_HID;
      for (let j = 0; j < N_HID; j++) acc[j] += x * g[b + j];
    }
    for (let j = 0; j < N_HID; j++) {
      const n = (Math.random() + Math.random() + Math.random() - 1.5) * 0.24;   // ≈ N(0; 0,12)
      xh[j] = n;
      h[j] = Math.tanh(acc[j] + n);
    }
    for (let o = 0; o < N_OUT; o++) out[o] = g[B2_OFF + o];
    for (let j = 0; j < N_HID; j++) {
      const x = h[j];
      const bg = W2_OFF + j * N_OUT, bd = W1_LEN + j * N_OUT;
      for (let o = 0; o < N_OUT; o++) out[o] += x * (g[bg + o] + d[bd + o]);
    }
    for (let o = 0; o < N_OUT; o++) {
      const n = (Math.random() + Math.random() + Math.random() - 1.5) * 0.4;     // ≈ N(0; 0,2)
      xo[o] = n;
      out[o] = Math.tanh(out[o] + n);
    }
    if (!learning) return;
    // 3) следы пригодности: «какой вход совпал с каким случайным отклонением»
    for (let i = 0; i < N_IN; i++) {
      const x = inp[i], b = i * N_HID;
      if (x === 0) { for (let j = 0; j < N_HID; j++) e[b + j] *= 0.85; continue; }
      for (let j = 0; j < N_HID; j++) e[b + j] = e[b + j] * 0.85 + x * xh[j];
    }
    for (let j = 0; j < N_HID; j++) {
      const x = h[j], b = W1_LEN + j * N_OUT;
      for (let o = 0; o < N_OUT; o++) e[b + o] = e[b + o] * 0.85 + x * xo[o];
    }
  }
}
