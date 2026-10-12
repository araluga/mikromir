'use strict';
// ───────── Режимы игры: «Сотворение» (цели и очки жизни) и песочница ─────────

// стоимость посева одной колонии в очках жизни
const SEED_COST = { ecoli: 5, cyano: 5, strepto: 8, bdello: 10, euglena: 8, diatom: 8, paramecium: 12, stentor: 12, amoeba: 18, didinium: 16 };

const GOALS = [
  {
    id: 'photo', title: 'Да будет свет', reward: 20,
    desc: 'Вырастите 100 фотосинтетиков одновременно',
    progress: s => [s.c.photo, 100],
  },
  {
    id: 'chain', title: 'Пищевая цепь', reward: 20,
    desc: 'Одновременно живут фотосинтетики, осмотрофы и пастбищные (по 5+)',
    progress: s => [['photo', 'osmo', 'grazer'].filter(k => s.c[k] >= 5).length, 3],
  },
  {
    id: 'pop', title: 'Мегаполис', reward: 20,
    desc: 'Население чашки достигает 800 клеток',
    progress: s => [s.total, 800],
  },
  {
    id: 'predator', title: 'Высший хищник', reward: 25,
    desc: 'Прокормите 20 хищников одновременно',
    progress: s => [s.c.predator, 20],
  },
  {
    id: 'species', title: 'Происхождение видов', reward: 30,
    desc: 'Эволюция создаёт новый вид, и он разрастается до 30 особей',
    progress: () => {
      let best = 0;
      for (const sp of speciesMap.values()) if (!sp.archetype && sp.parentId && sp.count > best) best = sp.count;
      return [best, 30];
    },
  },
  {
    id: 'five', title: 'Полный круговорот', reward: 30,
    desc: 'Живут все пять экогрупп (по 3+ клетки)',
    progress: s => [CLASS_KEYS.filter(k => s.c[k] >= 3).length, 5],
  },
  {
    id: 'stable', title: 'Устойчивая экосистема', final: true,
    desc: 'После всех остальных целей: пять групп (по 3+) живут 2 минуты без перерыва',
    progress: () => [Math.floor(sim.mode.streak), 120],
  },
];

function initMode(preset) {
  sim.mode = {
    kind: preset,
    budget: preset === 'genesis' ? 30 : Infinity,
    budgetMax: 120,
    done: new Set(),
    progress: {},
    streak: 0,
    won: false, wonAt: 0, justWon: false,
  };
  if (preset === 'genesis') simLog('Чашка пуста. Кликайте по ней, чтобы сеять. Начните с цианобактерий поближе к лампе.', 'goal');
  else if (preset === 'sandbox') simLog('Песочница: кликайте по чашке, чтобы сеять. Кого — выберите в панели инструментов.', 'info');
}

function isGenesis() { return sim.mode && sim.mode.kind === 'genesis'; }

function seedCost(v) {
  if (!isGenesis()) return 0;
  if (v.startsWith('arc:')) return SEED_COST[v.slice(4)] ?? 10;
  if (v === 'random') return 6;
  return 14;
}

function trySpend(cost) {
  if (!isGenesis()) return true;
  if (sim.mode.budget < cost) return false;
  sim.mode.budget -= cost;
  return true;
}

// вызывается раз в секунду модельного времени
function modeTick() {
  const m = sim.mode;
  if (!m || m.kind !== 'genesis') return;
  m.budget = Math.min(m.budgetMax, m.budget + 0.25);   // +1 очко за 4 секунды
  const s = { c: classCounts(), total: sim.cells.length };
  const all5 = CLASS_KEYS.every(k => s.c[k] >= 3);
  const ready = GOALS.every(g => g.final || m.done.has(g.id));
  m.streak = all5 && ready ? m.streak + 1 : 0;
  for (const g of GOALS) {
    const [v, max] = g.progress(s);
    m.progress[g.id] = [Math.min(v, max), max];
    if (m.done.has(g.id) || v < max) continue;
    m.done.add(g.id);
    if (g.final) {
      m.won = true; m.wonAt = sim.time; m.justWon = true;
      simLog(`Победа! Устойчивая экосистема создана за ${fmtTime(sim.time)}`, 'goal');
    } else {
      m.budget = Math.min(m.budgetMax, m.budget + g.reward);
      simLog(`Цель выполнена: «${g.title}» (+${g.reward} очков жизни)`, 'goal');
    }
  }
}
