'use strict';
// ───────── Режимы игры: «Сотворение» (цели и очки жизни) и песочница ─────────

// стоимость посева одной колонии в очках жизни
const SEED_COST = { ecoli: 5, cyano: 5, strepto: 8, bdello: 10, euglena: 8, diatom: 8, paramecium: 12, stentor: 12, amoeba: 18, didinium: 16 };

const GOALS = [
  {
    id: 'photo', reward: 20,
    progress: s => [s.c.photo, 100],
  },
  {
    id: 'chain', reward: 20,
    progress: s => [['photo', 'osmo', 'grazer'].filter(k => s.c[k] >= 5).length, 3],
  },
  {
    id: 'pop', reward: 20,
    progress: s => [s.total, 800],
  },
  {
    id: 'predator', reward: 25,
    progress: s => [s.c.predator, 20],
  },
  {
    id: 'species', reward: 30,
    progress: () => {
      let best = 0;
      for (const sp of speciesMap.values()) if (!sp.archetype && sp.parentId && sp.count > best) best = sp.count;
      return [best, 30];
    },
  },
  {
    id: 'five', reward: 30,
    progress: s => [CLASS_KEYS.filter(k => s.c[k] >= 3).length, 5],
  },
  {
    id: 'stable', final: true,
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
  if (preset === 'genesis') simLog('log.genesis', null, 'goal');
  else if (preset === 'sandbox') simLog('log.sandbox', null, 'info');
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
      simLog('log.win', { time: fmtTime(sim.time) }, 'goal');
    } else {
      m.budget = Math.min(m.budgetMax, m.budget + g.reward);
      simLog('log.goal', { goal: { k: 'goal.' + g.id + '.title' }, n: g.reward }, 'goal');
    }
  }
}
