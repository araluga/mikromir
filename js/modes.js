'use strict';
// ───────── Режимы игры: цели «Сотворения» и «Происхождения многоклеточности», песочница ─────────

// стоимость посева одной колонии в очках жизни
const SEED_COST = {
  ecoli: 5, cyano: 5, strepto: 8, bdello: 10, euglena: 8, diatom: 8, paramecium: 12, stentor: 12, amoeba: 18, didinium: 16,
  volvox: 14, chlorella: 5, ochromonas: 10,
};

const GOALS_BY_MODE = {
  genesis: [
    { id: 'photo', reward: 20, progress: s => [s.c.photo, 100] },
    { id: 'chain', reward: 20, progress: s => [['photo', 'osmo', 'grazer'].filter(k => s.c[k] >= 5).length, 3] },
    { id: 'pop', reward: 20, progress: s => [s.total, 800] },
    { id: 'predator', reward: 25, progress: s => [s.c.predator, 20] },
    {
      id: 'species', reward: 30,
      progress: () => {
        let best = 0;
        for (const sp of speciesMap.values()) if (!sp.archetype && sp.parentId && sp.count > best) best = sp.count;
        return [best, 30];
      },
    },
    { id: 'five', reward: 30, progress: s => [CLASS_KEYS.filter(k => s.c[k] >= 3).length, 5] },
    { id: 'stable', final: true, progress: () => [Math.floor(sim.mode.streak), 120] },
  ],
  // Путь к организму: от первой пары клеток до колонии с разделением труда
  multicell: [
    { id: 'pair', progress: s => [Math.min(s.col.maxCol, 2) - 1, 1] },
    { id: 'col8', progress: s => [Math.min(s.col.maxCol, 8), 8] },
    { id: 'colonial', progress: () => [Math.round(bestColonialShare() * 100), 60] },
    { id: 'sharing', progress: () => [Math.floor(sim.shared), 3000] },
    { id: 'labor', progress: s => [Math.min(s.col.laborCols, 1), 1] },
    { id: 'organism', final: true, progress: () => [Math.floor(sim.mode.streak), 120] },
  ],
};

function modeGoals() { return (sim.mode && GOALS_BY_MODE[sim.mode.kind]) || null; }
function isGoalMode() { return !!modeGoals(); }

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
  else if (preset === 'multicell') simLog('log.multicell', null, 'goal');
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
  const m = sim.mode, goals = modeGoals();
  if (!m || !goals) return;
  const s = { c: classCounts(), total: sim.cells.length, col: colonyStats(m.kind === 'multicell') };
  const ready = goals.every(g => g.final || m.done.has(g.id));
  if (m.kind === 'genesis') {
    m.budget = Math.min(m.budgetMax, m.budget + 0.25);   // +1 очко за 4 секунды
    const all5 = CLASS_KEYS.every(k => s.c[k] >= 3);
    m.streak = all5 && ready ? m.streak + 1 : 0;
  } else if (m.kind === 'multicell') {
    // «организм»: колония из 10+ клеток с разделением труда (по 2+ клетки каждой роли);
    // колонии рождаются и распадаются, поэтому короткий перерыв лишь отматывает счётчик назад
    m.streak = !ready ? 0 : s.col.organism > 0 ? m.streak + 1 : Math.max(0, m.streak - 2);
  }
  for (const g of goals) {
    const [v, max] = g.progress(s);
    m.progress[g.id] = [Math.max(0, Math.min(v, max)), max];
    if (m.done.has(g.id) || v < max) continue;
    m.done.add(g.id);
    if (g.final) {
      m.won = true; m.wonAt = sim.time; m.justWon = true;
      simLog(m.kind === 'multicell' ? 'log.winMulti' : 'log.win', { time: fmtTime(sim.time) }, 'goal');
    } else if (g.reward) {
      m.budget = Math.min(m.budgetMax, m.budget + g.reward);
      simLog('log.goal', { goal: { k: 'goal.' + g.id + '.title' }, n: g.reward }, 'goal');
    } else {
      simLog('log.goalDone', { goal: { k: 'goal.' + g.id + '.title' } }, 'goal');
    }
  }
}
