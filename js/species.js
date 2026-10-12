'use strict';
// ───────── Виды: классификация, имена, учёт ─────────

const speciesMap = new Map();
let nextSpeciesId = 1;

function classify(t) {
  const r = maxRadiusOf(t);
  if (r < 6.5) {
    if (t[T.HARPOON] > 0.4 && t[T.HARPOON] > t[T.CHLORO]) return { cls: 'predator', label: 'Бактерия-хищник' };
    if (t[T.CHLORO] > 0.4) return { cls: 'photo', label: 'Цианобактерия' };
    if (t[T.TOXIN] > 0.4) return { cls: 'toxic', label: 'Актиномицет' };
    return { cls: 'osmo', label: t[T.FLAG] > 0.4 ? 'Подвижная бактерия' : 'Бактерия' };
  }
  const chl = t[T.CHLORO], ph = t[T.PHAGO];
  if (chl > 0.4) {
    if (ph > 0.35) return { cls: 'photo', label: 'Миксотроф' };
    if (t[T.ARMOR] > 0.45 && t[T.FLAG] < 0.35) return { cls: 'photo', label: 'Диатомея' };
    return { cls: 'photo', label: t[T.FLAG] > 0.3 ? 'Жгутиковая водоросль' : 'Водоросль' };
  }
  if (t[T.HARPOON] > 0.4) return { cls: 'predator', label: t[T.CILIA] >= t[T.PSEUDO] ? 'Хищная инфузория' : 'Хищный протист' };
  if (ph > 0.35) {
    if (t[T.PSEUDO] >= t[T.CILIA] && t[T.PSEUDO] >= t[T.FLAG]) return r > 15 ? { cls: 'predator', label: 'Амёба' } : { cls: 'grazer', label: 'Мелкая амёба' };
    if (t[T.CILIA] >= t[T.FLAG]) return r > 16 ? { cls: 'predator', label: 'Крупная инфузория' } : { cls: 'grazer', label: 'Инфузория' };
    return { cls: 'grazer', label: 'Жгутиконосец' };
  }
  if (t[T.TOXIN] > 0.4) return { cls: 'toxic', label: 'Токсичный протист' };
  return { cls: 'osmo', label: 'Осмотрофный протист' };
}

const GENUS_A = ['Proto', 'Micro', 'Bacillo', 'Chloro', 'Cyano', 'Para', 'Amoe', 'Dini', 'Stento', 'Vorti', 'Eugle', 'Strepto', 'Bdello', 'Myxo', 'Volvo', 'Tricho', 'Litho', 'Spiro', 'Nano', 'Crypto', 'Halo', 'Rhizo', 'Gymno', 'Lepto', 'Acantho', 'Phaeo', 'Pyro', 'Thermo'];
const GENUS_B = ['coccus', 'bacter', 'monas', 'phyta', 'cium', 'ella', 'ium', 'vibrio', 'myces', 'zoon', 'phrys', 'lina', 'nema', 'spora', 'cystis', 'dinium', 'chloris', 'thrix'];
const EPITHETS = ['rubra', 'viridis', 'ferox', 'vulgaris', 'minor', 'major', 'agilis', 'lucida', 'nocturna', 'toxica', 'mirabilis', 'gracilis', 'vorax', 'pallida', 'aurea', 'fusca', 'rapida', 'tenax', 'errans', 'sapiens', 'latens', 'avida', 'parva', 'gigantea', 'sociabilis', 'solitaria', 'callida', 'nova'];
function latinName() {
  return pick(GENUS_A) + pick(GENUS_B) + ' ' + pick(EPITHETS);
}

class Species {
  constructor(genome, parent, opts = {}) {
    this.id = nextSpeciesId++;
    this.rep = genome.clone();
    this.parentId = parent ? parent.id : 0;
    this.parentName = parent ? parent.latin : null;
    const c = classify(genome.t);
    this.cls = c.cls;
    this.label = opts.label || c.label;
    this.latin = opts.latin || latinName();
    this.title = opts.name || this.label;
    const base = parent && parent.cls === this.cls ? parent.hue + randn() * 22 : CLASSES[this.cls].hue + randn() * 14;
    this.hue = ((opts.hue ?? base) % 360 + 360) % 360;
    this.count = 0; this.maxCount = 0; this.total = 0; this.maxGen = 0;
    this.born = sim.time; this.extinct = -1;
    this.established = !!opts.archetype;
    this.archetype = !!opts.archetype;
    this.forks = [];
    this.makeColors();
    speciesMap.set(this.id, this);
  }
  makeColors() {
    const h = Math.round(this.hue);
    this.cBody = `hsla(${h},65%,52%,0.34)`;
    this.cEdge = `hsla(${h},85%,72%,0.95)`;
    this.cSolid = `hsl(${h},72%,62%)`;
    this.cDark = `hsla(${h},50%,28%,0.6)`;
    this.cNuc = `hsla(${(h + 200) % 360},35%,22%,0.75)`;
  }
  get fullName() { return this.title + ' · ' + this.latin; }
}

// Определить вид потомка: тот же, ранее отделившийся «родственный» или новый
function speciesForChild(sp, g) {
  if (genomeDistance(g, sp.rep) <= SPECIES_THRESHOLD) return sp;
  for (const id of sp.forks) {
    const s = speciesMap.get(id);
    if (s && s.count > 0 && genomeDistance(g, s.rep) < SPECIES_THRESHOLD * 0.7) return s;
  }
  const ns = new Species(g, sp);
  sp.forks.push(ns.id);
  if (sp.forks.length > 8) sp.forks.shift();
  return ns;
}

function speciesCleanup() {
  for (const [id, s] of speciesMap) {
    if (s.count <= 0 && !s.established && sim.time - s.born > 30) speciesMap.delete(id);
  }
}
