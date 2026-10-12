'use strict';
// ───────── Константы мира ─────────

const TAU = Math.PI * 2;
const WORLD = { size: 2000, cx: 1000, cy: 1000, dishR: 980 };   // 1 единица ≈ 1 мкм (условно)
const DT = 0.04;              // секунд модельного времени за тик
const BRAIN_EVERY = 3;        // нейросеть «думает» раз в N тиков (0,12 с)
const FIELD_N = 160;          // разрешение химических полей
const FIELD_DX = WORLD.size / FIELD_N;
const FIELD_AMT = 4;          // сколько энергии содержит единица концентрации в ячейке поля
const BUCKET = 50;            // ячейка пространственной сетки
const BN = Math.ceil(WORLD.size / BUCKET);
const DIV_TIME = 1.2;         // длительность деления, с
const SPECIES_THRESHOLD = 0.3;
const SENSE_RANGE = 45;       // дальность ощущения соседей (от мембраны)

// ───────── Нейросеть ─────────
const N_IN = 31, N_HID = 14, N_OUT = 9;
const W1_LEN = N_IN * N_HID;
const R_OFF = W1_LEN, R_LEN = N_HID * N_HID;
const W2_OFF = R_OFF + R_LEN, W2_LEN = N_HID * N_OUT;
const B2_OFF = W2_OFF + W2_LEN;
const N_W = B2_OFF + N_OUT;
const PLASTIC_LEN = W1_LEN + W2_LEN;  // веса, которые меняются при обучении за жизнь

// подписи сенсоров и действий — в i18n.js (ключи in / out)

// ───────── Гены (признаки) ─────────
const T = { SIZE: 0, FLAG: 1, CILIA: 2, PSEUDO: 3, CHLORO: 4, OSMO: 5, PHAGO: 6, HARPOON: 7, TOXIN: 8, RESIST: 9, ARMOR: 10, MUT: 11, LEARN: 12, WAKE: 13 };
const N_TRAITS = 14;
// названия и описания признаков — в i18n.js (ключ traits)
// стоимость содержания признака (энергия/с на массу^0.75)
const TRAIT_COST = [0, 0.02, 0.014, 0.016, 0.01, 0.011, 0.014, 0.02, 0.03, 0.02, 0.02, 0, 0.003, 0];

// ───────── Экологические группы ─────────
const CLASSES = {   // порядок и цвета проверены на различимость (в т.ч. для дальтоников) на тёмном фоне
  photo:    { color: '#3fa64e', hue: 112 },
  osmo:     { color: '#2f95cc', hue: 196 },
  grazer:   { color: '#b4880f', hue: 46 },
  toxic:    { color: '#a35ee0', hue: 284 },
  predator: { color: '#e2533f', hue: 4 },
};
const CLASS_KEYS = Object.keys(CLASSES);

// ───────── Настройки (меняются из интерфейса) ─────────
const SETTINGS = {
  light: 1.0,         // яркость лампы
  dayCycle: true,
  dayLength: 200,     // длительность суток, с
  nutrient: 1.0,      // приток питательных веществ
  mutMul: 1.0,        // множитель мутаций
  brownian: true,
  lamarck: false,     // наследование выученного
  learning: true,     // обучение за жизнь
  panspermia: true,   // занос клеток извне при вымирании группы
  phages: true,       // бактериофаги атакуют слишком многочисленный вид
  popCap: 2000,
};
