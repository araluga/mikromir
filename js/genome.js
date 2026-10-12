'use strict';
// ───────── Геном: признаки + веса нейросети ─────────

const I = { BIAS: 0, EN: 1, HP: 2, GROW: 3, N: 4, NF: 5, NL: 6, NT: 7, L: 8, LF: 9, LL: 10, TX: 11, TF: 12, TL: 13, SF: 14, SL: 15, Q: 16, PP: 17, PS: 18, PC: 19, PR: 20, TP: 21, TS: 22, TC: 23, KIN: 24, DP: 25, DS: 26, DC: 27, DMG: 28, CLK: 29, RW: 30 };
const O = { THRUST: 0, TURN: 1, TUMBLE: 2, ATTACK: 3, TOXIN: 4, SIGNAL: 5, DIVIDE: 6, CONJ: 7, SPORE: 8 };

function maxRadiusOf(t) { return 2.5 + 24 * Math.pow(t[T.SIZE], 1.2); }
// «эукариотность»: крупные клетки получают ядро, реснички, фагоцитоз
function eukOf(r) { return smoothstep(5, 8.5, r); }
function mutRateOf(t) { return 0.003 + 0.1 * t[T.MUT] * t[T.MUT]; }

class Genome {
  constructor(t, w) { this.t = t; this.w = w; }
  clone() { return new Genome(Float32Array.from(this.t), Float32Array.from(this.w)); }

  // Копия с мутациями. plastic — выученные за жизнь поправки (только при ламарковском режиме)
  mutated(mul, plastic) {
    const t = Float32Array.from(this.t);
    const w = Float32Array.from(this.w);
    if (plastic) {
      for (let i = 0; i < W1_LEN; i++) w[i] += plastic[i];
      for (let i = 0; i < W2_LEN; i++) w[W2_OFF + i] += plastic[W1_LEN + i];
    }
    const pr = mutRateOf(this.t) * mul;
    if (pr <= 0) return new Genome(t, w);
    for (let i = 0; i < N_TRAITS; i++) {
      if (Math.random() < pr * 2.5) t[i] = clamp(t[i] + randn() * 0.06, 0, 1);
    }
    // редкая крупная мутация признака
    if (Math.random() < pr * 0.4) { const i = randi(0, N_TRAITS); t[i] = clamp(t[i] + randn() * 0.22, 0, 1); }
    // точечные мутации весов
    let n = poisson(pr * N_W);
    while (n-- > 0) {
      const j = randi(0, N_W);
      w[j] = Math.random() < 0.08 ? randn() * 0.5 : clamp(w[j] + randn() * 0.3, -6, 6);
    }
    return new Genome(t, w);
  }
}

function randomWeights(scale) {
  const w = new Float32Array(N_W);
  for (let i = 0; i < N_W; i++) w[i] = randn() * scale;
  return w;
}

function genomeDistance(a, b) {
  let s = 0;
  for (let i = 0; i < N_TRAITS; i++) {
    const d = a.t[i] - b.t[i];
    s += (i >= T.MUT ? 0.3 : 1) * d * d;
  }
  let wd = 0, n = 0;
  for (let i = 0; i < N_W; i += 3, n++) wd += Math.abs(a.w[i] - b.w[i]);
  return Math.sqrt(s) + 0.25 * wd / n;
}

// Врождённые рефлексы: стартовые связи нейросети, которые эволюция дальше переделывает.
// Скрытые нейроны 0..11 используются как «рефлекторные дуги».
function instinctWeights(inst) {
  const w = randomWeights(0.1);
  for (let i = R_OFF; i < R_OFF + R_LEN; i++) w[i] *= 0.6;
  const W1 = (i, h, v) => { w[i * N_HID + h] = v; };
  const W2 = (h, o, v) => { w[W2_OFF + h * N_OUT + o] = v; };
  const B = (o, v) => { w[B2_OFF + o] = v; };

  B(O.THRUST, inst.thrust ?? 0.9);
  B(O.TUMBLE, -1.3);
  B(O.ATTACK, inst.attack ? 1.2 : -1.2);
  B(O.TOXIN, -1.5);
  B(O.SIGNAL, -0.6);
  B(O.DIVIDE, 1.5);
  B(O.CONJ, inst.conj ? 0.1 : -0.9);
  B(O.SPORE, -2.2);

  if (inst.food) {           // хемотаксис: поворот к еде + «бег и кувырок» по временному градиенту
    W1(I.NL, 0, 5 * inst.food); W2(0, O.TURN, 2.2);
    W1(I.NT, 1, -7 * inst.food); W1(I.NF, 1, -3 * inst.food);
    W2(1, O.TUMBLE, 2.8); W2(1, O.THRUST, -0.4);
  }
  if (inst.light) {          // фототаксис + бегство от слишком яркого света
    W1(I.LL, 2, 5 * inst.light); W2(2, O.TURN, 2.2);
    W1(I.L, 3, 6); W1(I.BIAS, 3, -5.2); W2(3, O.TUMBLE, 2.0);
    W1(I.LF, 1, -4 * inst.light); W2(1, O.TUMBLE, 2.8);
  }
  if (inst.toxinAvoid) {     // отворачивать от яда
    W1(I.TL, 4, -5); W2(4, O.TURN, 2.2);
    W1(I.TF, 5, -5); W2(5, O.TUMBLE, 2.2);
  }
  if (inst.hunt) {           // поворот к добыче и к запаху метаболитов
    W1(I.PS, 6, 4 * inst.hunt); W1(I.SL, 6, 2 * inst.hunt); W2(6, O.TURN, 2.4);
    W1(I.SF, 7, -4 * inst.hunt); W1(I.PC, 7, -2 * inst.hunt); W2(7, O.TUMBLE, 1.6);
  }
  if (inst.debris) { W1(I.DS, 8, 4); W2(8, O.TURN, 1.8); }
  if (inst.spore) {          // голод → спора
    W1(I.EN, 9, -7); W1(I.BIAS, 9, 1.5); W2(9, O.SPORE, 4.5);
  }
  if (inst.quorum) {         // чувство кворума: много своих → залп токсинов
    B(O.SIGNAL, 0.6);
    W1(I.Q, 10, 5); W1(I.BIAS, 10, -1.5); W2(10, O.TOXIN, 3);
  }
  if (inst.flee) {           // бегство от хищника: полный ход и поворот прочь
    W1(I.TP, 11, 4 * inst.flee); W1(I.BIAS, 11, -1);
    W2(11, O.THRUST, 1.2);
    // в покое нейрон ≈ tanh(−1): компенсируем смещением, чтобы рефлекс не гасил тягу
    B(O.THRUST, (inst.thrust ?? 0.9) + Math.tanh(1) * 1.2);
    W1(I.TS, 13, -4 * inst.flee); W2(13, O.TURN, 2.4);
  }
  if (inst.selective) {      // избирательный хищник: атакует только добычу сопоставимого размера
    W1(I.PR, 12, 5); W1(I.BIAS, 12, 1.8);
    W2(12, O.ATTACK, 3); B(O.ATTACK, -0.3);
  }
  return w;
}

function randomGenome() {
  const t = new Float32Array(N_TRAITS);
  for (let i = 0; i < N_TRAITS; i++) t[i] = Math.random();
  t[T.SIZE] = Math.random() * Math.random() * 0.8;
  for (let i = T.FLAG; i <= T.ARMOR; i++) if (Math.random() < 0.55) t[i] *= 0.12;
  t[T.MUT] = 0.25 + Math.random() * 0.3;
  const w = randomWeights(0.5);
  w[B2_OFF + O.DIVIDE] = 1.5;
  w[B2_OFF + O.SPORE] = -1.5;
  w[B2_OFF + O.THRUST] = 0.5;
  return new Genome(t, w);
}

// ───────── Прототипы реальных микроорганизмов ─────────
const ARCHETYPES = [
  {
    key: 'ecoli', name: 'Кишечная палочка', latin: 'Escherichia coli', count: 230,
    traits: { size: 0.07, flag: 0.75, osmo: 0.85, resist: 0.1 },
    inst: { food: 1, toxinAvoid: 1, spore: 1, conj: 1, flee: 0.5 },
    info: 'Палочковидная бактерия с жгутиками-роторами. Плывёт по прямой, а если еды становится меньше — кувыркается и выбирает новое направление (хемотаксис «бег и кувырок»). Питается растворённой органикой, обменивается плазмидами при конъюгации.',
  },
  {
    key: 'cyano', name: 'Цианобактерия', latin: 'Synechococcus elongatus', count: 160,
    traits: { size: 0.09, flag: 0.22, chloro: 0.85, osmo: 0.15, armor: 0.2 },
    inst: { light: 1, toxinAvoid: 0.7, spore: 1 },
    info: 'Древнейший фотосинтетик: тилакоиды прямо в цитоплазме, ядра нет. Основа пищевой цепи — превращает свет в энергию, которую затем съедают все остальные. Слишком яркий свет её повреждает.',
  },
  {
    key: 'strepto', name: 'Стрептомицет', latin: 'Streptomyces griseus', count: 35,
    traits: { size: 0.1, flag: 0.2, osmo: 0.75, toxin: 0.75, resist: 0.9 },
    inst: { food: 0.8, quorum: 1, spore: 1 },
    info: 'Почвенная бактерия-химик, источник природных антибиотиков. Использует чувство кворума: пока их мало — молчат, а собравшись толпой, синхронно отравляют всё вокруг. Сама устойчива к своему яду.',
  },
  {
    key: 'bdello', name: 'Бделловибрион', latin: 'Bdellovibrio bacteriovorus', count: 18,
    traits: { size: 0.02, flag: 1.0, harpoon: 0.8, osmo: 0.1 },
    inst: { hunt: 1, attack: 1, food: 0.3 },
    info: 'Крошечная бактерия-хищник, «Чужой» микромира. Несётся со скоростью до 100 длин тела в секунду, врезается в другую бактерию и высасывает её изнутри.',
  },
  {
    key: 'euglena', name: 'Эвглена зелёная', latin: 'Euglena viridis', count: 45,
    traits: { size: 0.34, flag: 0.7, chloro: 0.65, osmo: 0.25, phago: 0.15 },
    inst: { light: 1, food: 0.3, toxinAvoid: 0.8, flee: 0.8 },
    info: 'Миксотроф: и фотосинтезирует, и всасывает органику. Жгутик тянет её вперёд, светочувствительный глазок-стигма направляет к свету, но от слепящего света она уплывает в полутень.',
  },
  {
    key: 'diatom', name: 'Диатомея', latin: 'Navicula radiosa', count: 35,
    traits: { size: 0.3, flag: 0.12, chloro: 0.9, armor: 0.7 },
    inst: { light: 0.6, thrust: 0.4 },
    info: 'Водоросль в кремниевом панцире-«шкатулке». Медленно скользит по слизи, зато панцирь защищает от пожирателей.',
  },
  {
    key: 'paramecium', name: 'Инфузория-туфелька', latin: 'Paramecium caudatum', count: 32,
    traits: { size: 0.42, cilia: 0.8, phago: 0.6, armor: 0.15, resist: 0.15 },
    inst: { food: 0.4, hunt: 0.6, debris: 1, attack: 1, toxinAvoid: 1, flee: 0.8, conj: 1 },
    info: '«Корова» микромира. Тысячи ресничек гребут волнами, загоняя бактерий в клеточный рот. Внутри видны пищеварительные вакуоли и пульсирующая сократительная вакуоль.',
  },
  {
    key: 'stentor', name: 'Трубач', latin: 'Stentor coeruleus', count: 8,
    traits: { size: 0.62, cilia: 0.5, phago: 0.55, osmo: 0.1 },
    inst: { food: 0.3, hunt: 0.3, debris: 1, attack: 1, thrust: 0.4 },
    info: 'Гигантская клетка-воронка. Венчик ресничек создаёт водоворот, засасывающий водоросли и бактерий. Плавает медленно, предпочитает «пастись» на месте.',
  },
  {
    key: 'amoeba', name: 'Амёба протей', latin: 'Amoeba proteus', count: 8,
    traits: { size: 0.85, pseudo: 0.9, phago: 0.9, armor: 0.1 },
    inst: { hunt: 0.8, debris: 1, attack: 1, thrust: 0.6 },
    info: 'Медленный «удав». Перетекает с помощью ложноножек, окружает добычу и замыкает её в пищеварительную вакуоль. Может проглотить даже инфузорию.',
  },
  {
    key: 'didinium', name: 'Дидиниум', latin: 'Didinium nasutum', count: 8,
    traits: { size: 0.45, cilia: 0.85, harpoon: 0.6, phago: 0.75 },
    inst: { hunt: 1.2, attack: 1, selective: 1 },
    info: '«Лев» микромира — охотник на туфелек. Вонзает хоботок с токсицистами, парализует жертву и заглатывает её целиком, даже если она крупнее самого дидиниума.',
  },
];

function archetypeGenome(arc, jitter = 0.03) {
  const t = new Float32Array(N_TRAITS);
  t[T.MUT] = 0.3; t[T.LEARN] = 0.35; t[T.WAKE] = 0.3;
  for (const k in arc.traits) t[T[k.toUpperCase()]] = arc.traits[k];
  for (let i = 0; i < N_TRAITS; i++) t[i] = clamp(t[i] + randn() * jitter, 0, 1);
  const w = instinctWeights(arc.inst);
  return new Genome(t, w);
}
