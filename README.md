# Microworld — cell neuroevolution

**English** · [Русский](README.ru.md)

A living Petri dish in your browser. Every cell has its own neural network that **learns during its life** and **evolves** across generations. Nobody programs the behavior — chemotaxis, hunting, fleeing predators and chemical warfare emerge on their own.

**▶ Play: https://araluga.github.io/mikromir/**

Or download the repository and open `index.html` — no server or build step needed. The interface is available in English and Russian (switch in the main menu or the settings panel).

## Modes

| Mode | What happens |
|---|---|
| **Genesis** | The dish is empty. Spend life points on seeding and complete goals: from the first algae to a stable ecosystem of five ecological groups. |
| **Origin of multicellularity** | Solitary *Chlorella* algae and a predator that can only swallow single cells. Watch colonies, mutual aid and division of labor evolve — up to a multicellular “organism”. |
| **Empty dish** | A sandbox with no cells and no limits — seed anything you like. |
| **Balanced ecosystem** | All organisms at once: watch and intervene. |
| **Protist pond / Bacterial world** | Themed worlds. |
| **Primordial soup** | Hundreds of random genomes with no innate reflexes — evolution has to invent all behavior. |

## The cell's brain

- **39 sensors → 4 to 24 recurrent neurons → 14 actions.** Brain size is itself a gene: more neurons cost energy, and selection decides whether they pay off. A cell senses its energy and health, the concentration of organic matter and its gradients (front/back, left/right and over time — like a real *E. coli*), light, toxins, the scent of neighbors, quorum signals, the nearest prey, threat and kin, detritus particles, pain and reward.
- **Actions:** thrust, turn, tumble, attack (phagocytosis or harpoon), release toxin, quorum signal, divide, conjugate, turn into a spore.
- **Evolution:** when a cell divides, the offspring inherits 16 traits (size, flagellum, cilia, pseudopods, chloroplasts, armor, brain size, adhesion…) and up to 1862 network weights, with mutations. When descendants drift far enough from their ancestors, a new species is born with its own color and Latin name.
- **Lifetime learning:** actor–critic reinforcement learning. A critic predicts upcoming reward; its prediction error acts like dopamine and drives node-perturbation updates of the network. Reward is the taste of food plus potential-based shaping for improving conditions (more food, better light, less toxin); punishment is pain. In controlled tests the network learns a simple “turn toward the signal” task within a few hundred steps; in the full ecosystem it gives naive cells a modest (~5–10%) foraging boost — evolution remains the main source of intelligence. Learned changes are not inherited by default (Darwinian), but Lamarckian inheritance can be switched on.

## Colonies and multicellularity

- After dividing, cells can stay bonded (an **adhesion** gene sets whether they can and how many bonds they hold — filaments vs. clumps; the network decides whether they want to).
- A predator can only engulf a cell if it can swallow the **whole colony** — the selective pressure that drove the origin of multicellularity in Boraas’ *Chlorella* experiments.
- Energy flows along bonds from well-fed to hungry cells; each cell senses its position in the colony and two signals from bonded neighbors (Notch–Delta-style).
- Each cell picks a role: **soma** feeds and swims better but cannot divide, **germ cells** grow and reproduce fast — Volvox-style division of labor.
- A colony is wrapped in a shared soft envelope that hugs its cells; other cells and colonies can dent it but not pass through, and colonies push as one heavy body.
- Predators persist the way real ones do: Ochromonas also eats bacteria, photosynthesizes a little, nibbles weakly attached cells off filament ends and survives famine as a dormant cyst.
- A colony’s mucous matrix also shields its cells from bacteriophages, like a biofilm.
- In tests (4 independent worlds), multicellularity evolved in all 4 — 40–75% of cells living in colonies of up to ~85 cells, often as filaments — and a colony “organism” with division of labor appeared in all 4 within ~6–26 minutes of simulated time, with predators and prey coexisting throughout. A control dish without the predator stays unicellular.

## Biology

Low Reynolds numbers (no inertia), Brownian motion, diffusion of chemicals, Kleiber's law for metabolism, photosynthesis with self-shading and light damage, osmotrophy, phagocytosis with digestion time, harpoons and toxicysts, antibiotics, quorum sensing, conjugation with gene exchange, spores, detritus, bacteriophage epidemics (“kill the winner”), day/night cycle.

Organisms: *E. coli*, cyanobacterium, *Streptomyces*, *Bdellovibrio*, green euglena, diatom, *Paramecium*, *Stentor*, *Amoeba proteus*, *Didinium*, *Volvox*, *Chlorella*, *Ochromonas*.

## Controls

| Key | Action |
|---|---|
| Space | pause |
| 1–5 | speed ×1, ×3, ×10, ×40, MAX |
| Q W E R T Y | inspect, nutrients, antibiotic, lamp, seed, laser |
| Wheel / pinch | zoom |
| F | whole dish |
| C | follow the selected cell |
| M | main menu |
| H | help |

Click a cell to see its neural network live and its genome. A genome you like can be saved as a strain and seeded later.

## Under the hood

Plain JavaScript + Canvas 2D, no dependencies. Code lives in `js/`: `sim.js` — world step, `cell.js` — the cell, `brain.js` — neural network and learning, `genome.js` — genome and real-organism prototypes, `env.js` — chemical fields and light, `colony.js` — colonies and multicellularity, `modes.js` — modes and goals, `i18n.js` — translations, `render.js` — rendering, `ui.js` — interface.
