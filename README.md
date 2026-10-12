# Microworld — cell neuroevolution

**English** · [Русский](README.ru.md)

A living Petri dish in your browser. Every cell has its own neural network that **learns during its life** and **evolves** across generations. Nobody programs the behavior — chemotaxis, hunting, fleeing predators and chemical warfare emerge on their own.

**▶ Play: https://araluga.github.io/mikromir/**

Or download the repository and open `index.html` — no server or build step needed. The interface is available in English and Russian (switch in the main menu or the settings panel).

## Modes

| Mode | What happens |
|---|---|
| **Genesis** | The dish is empty. Spend life points on seeding and complete goals: from the first algae to a stable ecosystem of five ecological groups. |
| **Empty dish** | A sandbox with no cells and no limits — seed anything you like. |
| **Balanced ecosystem** | All organisms at once: watch and intervene. |
| **Protist pond / Bacterial world** | Themed worlds. |
| **Primordial soup** | Hundreds of random genomes with no innate reflexes — evolution has to invent all behavior. |

## The cell's brain

- **31 sensors → 14 recurrent neurons → 9 actions.** A cell senses its energy and health, the concentration of organic matter and its gradients (front/back, left/right and over time — like a real *E. coli*), light, toxins, the scent of neighbors, quorum signals, the nearest prey, threat and kin, detritus particles, pain and reward.
- **Actions:** thrust, turn, tumble, attack (phagocytosis or harpoon), release toxin, quorum signal, divide, conjugate, turn into a spore.
- **Evolution:** when a cell divides, the offspring inherits 14 traits (size, flagellum, cilia, pseudopods, chloroplasts, armor…) and 765 network weights, with mutations. When descendants drift far enough from their ancestors, a new species is born with its own color and Latin name.
- **Lifetime learning:** reinforcement learning via node perturbation. Reward is energy gain, punishment is pain (toxin, harpoon, burns). The learning rate is itself inherited. By default, learned changes are not passed to offspring (Darwinian), but you can switch on Lamarckian inheritance.

## Biology

Low Reynolds numbers (no inertia), Brownian motion, diffusion of chemicals, Kleiber's law for metabolism, photosynthesis with self-shading and light damage, osmotrophy, phagocytosis with digestion time, harpoons and toxicysts, antibiotics, quorum sensing, conjugation with gene exchange, spores, detritus, bacteriophage epidemics (“kill the winner”), day/night cycle.

Organisms: *E. coli*, cyanobacterium, *Streptomyces*, *Bdellovibrio*, green euglena, diatom, *Paramecium*, *Stentor*, *Amoeba proteus*, *Didinium*.

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

Plain JavaScript + Canvas 2D, no dependencies. Code lives in `js/`: `sim.js` — world step, `cell.js` — the cell, `brain.js` — neural network and learning, `genome.js` — genome and real-organism prototypes, `env.js` — chemical fields and light, `modes.js` — modes and goals, `i18n.js` — translations, `render.js` — rendering, `ui.js` — interface.
