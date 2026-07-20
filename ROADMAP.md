# City Defense — Roadmap

StarCraft-themed, ThroneFall-style day/night base defense.
This file tracks agreed decisions, planned features, and open questions.
Update it as decisions get made.

## Decisions so far

- **Pathfinding: yes, eventually.** Enemies (and later friendly units) should
  route around terrain organically instead of following fixed waypoints.
  Obstacles become real collision, not set dressing.
- **Hero character: NOT deferred — it is the baseline night-phase avatar
  (reversed 2026-07-16, user decision).** Prior versions of this line deferred
  the hero to Phase 5. That was the mistake behind the "no agency during a
  fight" gap: without a hero, the night is pure set-and-forget with nothing for
  the player to *do*. Adopting Thronefall's model — **the commander is on the
  map from the first second of every night, WASD-controlled, auto-attacking,
  present from the start, not built or unlocked.** The hero IS the agency layer,
  and abilities (Phase 3b / CD-40) are its kit, not a building's.
  Two decisions locked with the reversal:
  1. **Lone fighter, NOT a rally commander.** The hero moves and fights, but it
     does **not** rally troops — garrison squads still auto-anchor to their
     buildings, no unit-command verb. This is the one Thronefall mechanic we
     keep rejecting: press-R-to-gather is their #1 complaint (micromanagement),
     and "no unit command" is our #1 differentiator. The hero is agency; the
     army stays set-and-forget.
  2. **Full night-phase avatar:** WASD movement, auto-attack, death penalty,
     every night. Not a minimal stub. See CD-29 (now the active hero ticket)
     and CD-40 (abilities, now the hero's kit). Single-screen 960×540, so no
     camera work.
- **Units are the next big gameplay feature — as anchored attachments, not
  free squads (revised 2026-07-14).** Units always belong to an anchor: a
  tower garrison (bought as an upgrade) or, later, the hero's escort. There
  is NO unit command verb — no rally points, no repositioning — which
  structurally eliminates ThroneFall's most-criticized micromanagement.
  Everything auto-attacks.
- **Commander abilities (decided 2026-07-14):** targeted active abilities on
  cooldown — Scanner Sweep (area slow, from the Command Center) first, then
  airstrike and a nuke capstone unlocked via the research facility. Ships
  before the hero; hero-centric auras later become the hero's unique layer.
- **Economy rework:** production buildings become mining facilities tied to
  mineral fields; one dedicated research-facility slot per level buffs all
  units/defenses.
- **Input goal:** fully playable without a mouse — WASD to move a site cursor,
  keys to pick build options.
- **Godot port timing (decided 2026-07-14):** iron out the game in the web
  version; port after mechanics lock, before the polish/content phase.
  Gates: (a) cheap 1–2 day Godot spike anytime — load the JSON defs, render
  a level with the sprite PNGs, run one wave — to de-risk data formats;
  (b) full port once Phases 2–3 (economy, garrisons, abilities) are stable
  and fun, because audio/VFX/UI polish and campaign content should be built
  once, in the shipping engine. Until then: keep web-only investment
  shallow (simple sound pass, no web-specific engine tricks). Console note:
  Godot has no public Xbox export button (NDA'd SDKs can't ship in an
  open-source engine), but Godot→Xbox is a well-trodden commercial path —
  hire a porting house (Seaven Studio ported Brotato to Xbox/Game Pass) or
  use W4 Games' tooling. It's a late-stage line item after PC success, not
  a technical wall.
- **Dawn restoration (ThroneFall model, shipped 2026-07-14):** at dawn,
  survivors heal to full and destroyed buildings are rebuilt free at their
  previous level. The penalty: a building destroyed at night earns no income
  that dawn, and wrecks (smoking rubble) don't fight or earn until rebuilt.
- **Backlog hygiene (2026-07-18):** dual code + design review pack filed in
  `TICKETS.md` (CD-54–CD-61 new; areas 1–10 mapped to existing tickets).
  **Re-sequenced 2026-07-18** after genre-peer review feedback (see
  "Genre peer lessons" below): QA-close trust pack → CD-40 → CD-49 → CD-47
  design → CD-30 Slice 4 / CD-16 / juice → eng scale. Does **not** unfreeze
  balance work or level-length Steps 1–3.

---

## Phase 1 — Input & UI polish (small, high value)

**Keyboard-only play — ✅ done (2026-07-14)**
- WASD / arrows: spatial-nav selection between sites (day) / buildings (night).
- 1–4: buy a build option; U/E: upgrade; Space/Enter: start night / confirm
  overlay; R: restart; Esc: deselect.
- Focus brackets on canvas + key badges in the panel + hint line.
- Built on a semantic `GameAction` layer for future gamepad/touch/Godot —
  see UI_PLAN.md for the cross-platform UI architecture and menu refresh plan.

**HUD / UX**
- Wave forecast panel: "Next: 9 Raiders (NW), 2 Brutes (N)" with per-enemy
  icons and counts — complements the on-map spawn markers.
- Range ghost: hovering/focusing a build option shows the range circle at the
  selected site *before* buying.
- Sell/demolish a building (partial refund, day only).
- Game speed controls at night: 1x / 2x, maybe pause-and-look.
- Damage/kill feedback options: floating damage numbers toggle.
- Bestiary tooltip: click an enemy at night (or the forecast icon) to see its
  HP / armor / damage.
- Post-wave summary line: kills, damage taken, credits earned.

**Juice (cheap wins)**
- Tower barrels rotate toward current target; muzzle flash on fire.
- Screen shake on siege impacts and building destruction.
- Sound pass 1 (WebAudio, synthesized or tiny samples): weapon fire per
  building type, enemy death, wave start klaxon, dawn chime, defeat/victory
  stingers. Volume slider + mute.

## Phase 2 — Economy & tech rework

**Mining facilities (replaces generic "production")**
- Mineral fields (the crystal clusters) become functional: mining facilities
  must be built on sites adjacent to a field; income scales with the number of
  crystals in radius. Map design = economy design, like ThroneFall.
- Refinery variant sits on vespene geyser sites (new obstacle kind with green
  gas puffs). Higher income, fewer geysers than mineral fields.
- Visual: SCV/MULE drones shuttling between crystals and the facility (purely
  cosmetic animation).
- Consequence: current `category: "production"` sites get replaced by
  placement-near-resources; update both levels' layouts accordingly.

**Research facility (one slot per level)**
- A single dedicated tech-lab site per map — a real choice, not a stat stick.
- Clarity rule (They Are Billions lesson): every research option shows
  explicit numbers before purchase, and no option may be a trap pick.
- StarCraft-style tracks, one purchase per day (or gated by wave number):
  - Weapons +1/+2/+3: all towers and units deal more damage.
  - Armor/Plating: buildings and units take less damage.
  - Servos: attack speed / unit move speed.
- Optional: mutually exclusive final tier (e.g. Siege Mode range vs. splash)
  for replay variety.
- The existing Sensor Array stays as a local (aura) buff; research is global.

## Phase 3a — Garrisons (units as tower attachments)

**Model — anchor system, no unit commands**
- Units always belong to an anchor. Phase 3a anchor = a tower. A garrison is
  bought as a *second upgrade axis* on the building ("Garrison: +2 Marines,
  60₡" — repeatable to a cap), shown as a second world-anchored chip next to
  the upgrade chip. Data-driven via garrison options in `buildings.json`.
- Garrison units fight in a small radius around their tower: they add DPS
  and body-block enemies that would otherwise chew the structure (radius
  collision + separation steering, boids-lite). They never leave their
  anchor's radius; there is no rally/move command by construction.
- Dead garrison units respawn free at dawn (consistent with dawn
  restoration) — losing them costs the rest of the night, not money.
- Unit archetypes: Marine (cheap, rapid, mid-range), Sniper (long range,
  armor-piercing — the *choice-based* answer to flat armor gutting gun
  towers, see ticket CD-14), later Firebat (melee splash tank), Medic.
- Enemies target: blocking unit > nearby building > HQ.
- Balance discipline: marginal DPS/₡ from garrisoning must trail buying a
  new tower (same decreasing-returns rule QA verified for upgrades) so
  garrisons are depth, not a dominant strategy.
- Flyers ignore body-blocking — ranged garrisons/towers are the answer.

## Phase 3b — Commander abilities

- Targeted actives on cooldown, cast click/tap-on-location; one new input
  verb (select ability → target → confirm) that works identically on
  mouse/keyboard/controller/touch.
- **Scanner Sweep** first: area slow from the Command Center (enemies
  already have `slowTimer` — nearly free). Then **airstrike** (burst damage
  zone) unlocked by the Phase 2 research facility, and a late-game **nuke**
  as a research capstone.
- Sourcing abilities from structures gives the research slot an exciting
  payoff, ships player agency before the hero exists, and reserves
  hero-centered auras as the hero's unique contribution later.
- Anti-spam knobs: long cooldowns, or StarCraft-style caster energy.

## Phase 4 — Pathfinding & real terrain

**Ships post-port, in GDScript (decided 2026-07-15).** The port gate is
Phases 2–3, and this phase sits after it — confirmed deliberately rather than
by default. Godot has native navigation, so the nav grid and flow field are
substantially cheaper there than building them here and porting them. Cost
accepted: the wall system stays unbuilt until after the port, so the
"rigid building nodes" complaint below has no free-form-geometry answer in the
web demo; CD-7's `blocks`/obstacle seams port unused (they cost nothing); and
CD-45's enemy-separation terrain clamp becomes Godot-side work. See CD-9.

- Build a coarse nav grid (e.g. 24px cells) from `obstacles`; rocks become
  impassable, crystals too.
- Flow field toward the HQ (one field per level, recomputed only when
  buildings that block change): every enemy follows the field — cheap for
  hundreds of enemies, produces organic streams that hug the funnels.
- Waypoint "roads" become cost *discounts* in the field, so enemies prefer
  the visible paths but can spill around them — keeps level readability.
- Units reuse the same grid for chase/return pathing.
- Optional later: wall-type building that edits the nav grid (classic
  StarCraft supply-depot walling) — powerful with real pathfinding, pairs
  with body-blocking.

## Phase 5 — Hero & meta (parked)

- ThroneFall-style hero: WASD-controlled commander unit (e.g. a Ghost or a
  Viking). By Phase 5 the hero is mostly glue: their **escort is a garrison
  whose anchor moves** (reuses the entire Phase 3a system — same data, AI,
  visuals), and they add hero-centered auras/abilities on top of the
  structure-sourced ones from 3b. Delivers the "active participant" agency
  that tops ThroneFall's community praise while staying immune to its
  micromanagement complaint (escorts follow automatically; no unit orders).
- Meta progression: per-level stars (win, win-no-HQ-damage, win-with-mutator),
  unlockable loadouts/perks chosen before a level, weekly mutators.
- More levels: island-and-bridges map, a "hold N days with no new sites" siege
  map, a boss-rush finale.

---

## Art direction (decided 2026-07-14)

**Target look: Brotato-quality 2D pixel art** — not 16px retro, not vector.
Chunky, crisp, instantly readable sprites with shadows and animations.

Concretely:
- Sprite resolution ~32–48px per unit/building, drawn at 1:1 into the 960×540
  canvas (already `image-rendering: pixelated`). Round draw positions to
  integers to avoid sub-pixel shimmer.
- Style rules: 1–2px dark outline, big silhouette-first shapes, 3-tone
  shading (base / shadow / highlight) plus a rim light, one saturated accent
  color per faction. Drop-shadow ellipses under everything (already in).
- Animations: 2–4 frame idle bob, walk cycles for enemies, muzzle flash,
  hit-flash (white overlay 1–2 frames), death poof, per-building "alive"
  motion (radar sweep, barracks flag, refinery bubbling — some exist as
  procedural motion and can stay).
- **UI menus: space theme, dark** — shipped for top bar / side panel /
  overlay (starfield letterbox, glow accents, clipped sci-fi corners).
  All future UI (pause menu, forecast panel) follows the same language.

**Pipeline** (in order):
1. ✅ Sprite layer in the Renderer (`src/render/sprites.ts`): atlas canvas +
   frame rects, drawn via `drawImage` nearest-neighbor, per-enemy vector
   fallback. Enemies have 2-frame walk cycles, direction flip, flyer hover
   bob, and pre-baked white hit-flash variants (0.09s on damage).
2. ✅ First sprite pass on all 6 enemies — composed from pixel primitives
   with auto-outline + auto rim-shading (not final art, but real pixel
   sprites). Tweak the builders in sprites.ts to iterate on looks.
3. ✅ Buildings sprited (all 8 shapes, keyed `bld:<shape>:<frame>`, 2-frame
   idle: blinking lights, waving barracks flag, refinery bubbles, exhaust
   glow). Radar sweep + HQ core glow stay as smooth procedural overlays.
4. ✅ Terrain sprited: rocks in 3 sizes (`rock:s|m|l`), crystals in 2
   (`crystal:s|m`) with a procedural pulsing glow, seeded horizontal flips
   for variety. Vector fallbacks remain everywhere.
5. Real art: hand-pixel in Aseprite (export sheet+JSON directly), commission,
   or AI-gen + manual cleanup — whichever, the atlas format stays the same,
   and the same PNGs port to Godot untouched. Replace builders per-sprite.
   Still procedural: paths, spawn markers, sites, projectiles, particles,
   creep (future).

## IP differentiation (decided 2026-07-14 — not legal advice; get an IP
## attorney review before commercial release)

Mechanics are not protectable (day/night loop, tower defense, garrisons —
all safe). Expression and trademarks are. Rules for all future work:

1. **No Blizzard names anywhere in assets or marketing:** Zerg(ling),
   Hydralisk, Protoss, Terran, SCV, Vespene, StarCraft, Scanner Sweep,
   MULE. Rename in-game "Siege Tank" → original name (e.g. Artillery
   Platform). Docs' "vespene geysers" → Plasma Wells; "Scanner Sweep" →
   Sensor Pulse. "Marine" (generic) is fine; **never "Space Marine"**
   (Games Workshop trademark, aggressively enforced).
2. **Original faction identity, not Zerg-lite:** keep the bio-swarm-vs-tech
   archetype (genre, not IP) but own the look — e.g. crystalline
   infestation instead of purple creep (ties into our mineral fields).
   Enemy names already original (Raider/Swarmling/Brute/etc.) — keep it so.
3. **Trade dress:** our pixel-art style already reads distinct from both
   parents; avoid copying the Terran blue/gold UI ensemble, StarCraft logo
   typography, or exact unit silhouettes (marine armor, siege tank).
4. **Marketing:** never name StarCraft or ThroneFall in the title, store
   page, tags, or trailers. Let reviewers make comparisons; we don't.
5. **Audio:** original voice lines and music only — no "Nuclear launch
   detected" soundalikes.
6. ThroneFall risk is low (different medium/theme); just never copy their
   level layouts, perk names, or UI look.

## Theme gaps (flavor backlog — apply IP rules above; "StarCraft-style"
## below means the archetype, renamed and restyled per our own identity)

- **Enemy faction identity — original bio-swarm (see IP rules):** keep our
  original names (Swarmling, Raider, Brute, Siege Walker, Skimmer, Warlord)
  and design their silhouettes as our own species, not Blizzard homages.
- **Infestation:** crystalline corruption spreading from spawn points at
  night, receding at dawn — our-brand answer to creep, visually tied to the
  mineral fields already on the maps.
- **Terran base dressing:** supply depots, comm dishes, floodlights around the
  HQ; vespene geysers with gas plumes; blinking beacon on the tallest
  building.
- **Announcer voice/text:** "Nuclear launch de—" no, but: "Night falls —
  hostiles inbound", "Wave cleared, commander", low-HQ warning klaxon.
- **Night lighting:** floodlight cones from towers, muzzle flashes lighting
  the dark, enemy eyes glowing — sell the day/night contrast harder.

## Known tech debt / small fixes

- Enemies stop 48px from HQ center; the stop ring should be drawn (subtle
  siege ring) so players understand where enemies will stand.
- `computer` screenshot tool can't capture the tab (extension quirk) — use
  DOM/pixel probes for automated testing; human eyes for visuals.
- Renderer is one big class; when units land, split into
  terrain/buildings/units/fx layers.
- No persistence — add localStorage for level unlocks + settings when meta
  progression arrives.

## Community-feedback lessons, second pass (Kingdom Two Crowns,
## They Are Billions, co-op TD genre — researched 2026-07-14)

**Kingdom Two Crowns** (nearest relative alongside ThroneFall):
- Loved: minimalist art + soundtrack + "zen with moments of tension"
  atmosphere; strategic depth hiding behind simplicity; split-screen co-op
  ("powerful, creative enhancement" — validates our couch-co-op-first
  ladder); cross-run progression (removing full-reset-on-death gave
  motivation).
- Hated: micromanagement tedium ("80% of time managing flimsy walls");
  loss of set-and-forget defense; boring attrition phases (winter); fiddly
  upkeep interactions; post-loss rubber-banding making comeback waves
  "pathetically small" (free wins feel hollow).
- Lessons: **set-and-forget automation is sacred** in this genre — our
  auto-attack-everything rule is the moat, never add upkeep chores (manual
  repair, resource ferrying, unit feeding). When difficulty scaling ever
  reacts to player losses, avoid overcorrection in either direction.

**They Are Billions:**
- Loved: swarm spectacle (huge on-screen counts); "mistakes punished much
  later" tension; watching the base take shape and then get tested.
- Hated: unfair difficulty + RNG at high level; no recovery (ironman
  restart-from-zero); maps with zero chokepoints (no geometry = no plan);
  unclear tech tree with trap picks that gimp runs.
- Lessons: swarm spectacle is a cheap emotional lever for our finale waves
  (respect the clutter budget); our dawn-restoration is exactly the
  recovery mechanism their ironman lacks — keep it; maps must always have
  plan-able geometry even after Phase 4 free routing; **the Phase 2
  research tree must show explicit numbers and contain no trap picks**
  (same dead-option rule QA already enforces for buildings).

**Co-op TD genre (Orcs Must Die, Dungeon Defenders, Sanctum):**
- The best co-op changes the defense loop, not just adds a cursor:
  complementary roles (one builds lanes, the other patches breaches /
  handles elites). Our split-lane maps + shared wallet produce this
  naturally (each player owns a lane); the Phase 5 hero adds the "jump
  into the breach" active role.
- Co-op difficulty must ramp fast, and both players should approach
  win/loss together — a shared HQ does this by construction.

## Co-op (future consideration, discussed 2026-07-14)

The action→sim→snapshot architecture is already lockstep-shaped; co-op is a
real option, in this order:
1. **Couch co-op** (cheapest, after CD-5 gamepad): second player = second
   input device + own selection cursor; shared wallet recommended; one
   screen, no networking. World-anchored UI already works per-cursor.
2. **Online co-op** (post-Godot port): lockstep action exchange. Hard
   prerequisite: a deterministic sim — replace `Math.random()` inside
   `Game` with a seeded RNG and move to a fixed-tick update. Cheap now,
   expensive to retrofit; also unlocks replays (useful for QA regression).
   Adopt early even if co-op never ships.
3. **Dual heroes** (Phase 5): second hero is nearly free once the anchor
   system exists — the genre community's most-requested co-op fantasy.
4. **Asymmetric versus** (mutator-tier someday): attacker player composes
   waves live from a budget — wave data is already JSON, so an attacker UI
   is just authoring wave entries at runtime.
- Difficulty scaling for 2P: +enemy count percentage, tune later.

## Genre peer lessons (day/night base defense)

Internal design notes from genre peers (notably the minimalist day-build /
night-defend + commander-on-map family). **Not for player-facing marketing
copy.** Sources: Steam/user review consensus, critic write-ups, community
threads; cross-checked against our backlog 2026-07-14 and refreshed
2026-07-18.

### What peers are loved for (adopt / protect)

| Lesson | Implication for us | Status |
|--------|--------------------|--------|
| Crystal-clear day → night → dawn loop | Keep micro-loops obvious; never bury "what do I do now?" | Shipped core |
| Commander on the map (night agency) | Hero is baseline night avatar, not a late unlock | CD-29 shipped; **CD-40** actives still open |
| Minimalist readability + juice over clutter | Prefer legible threats/counters; music/climax sell later | 2.5D paint shipped; **CD-6 / CD-33** open |
| Geographic economy (safe floor vs contested rich) | Map is the budget; cheap safe income + scary rich nodes | Mining shipped; **CD-47** design open; **CD-50** frozen |
| Pre-run perks / mutators as retention | Loadout remix + stars; kits should feel *earned* | CD-30 S0–3 shipped; **Slice 4 gating** open |
| Long enough runs for a build identity | Branches/L3 only matter if the run funds them | Level-length parked (freeze); **CD-31** campaign later |
| Forgiveness without free wins | Dawn free rebuild; income lost on wrecks that night | Shipped |

### What peers are disliked for (avoid / counter)

| Lesson | Implication for us | Status |
|--------|--------------------|--------|
| Rigid build nodes, same slots every run | Different options per site + per-building branches; free geometry later | **CD-55** site forks shipped; **CD-49** branches open; **CD-9** post-port |
| Unit rally / troop micromanagement | **Never** add unit-command / rally verbs | Locked decision (lone fighter + anchors) |
| No undo / sell of mis-builds | Same-day undo + partial sell | **CD-24** shipped |
| Final-night / boss "lose first time by design" | Climaxes must be legible; competent combined-arms should clear without max-rush | Cliffs filed (**CD-41** etc.); **balance freeze** — file, don't ladder-tune |
| Thin long-term strategy / repetition | Branches, site forks, mutators, campaign maps | CD-38/55 partial; **CD-49**, **CD-30 S4**, **CD-31** |
| Hero-buff loadouts dominate everything else | No income-in-global-mods; keep tower/squad roles meaningful | D8 income ban in `StatMods`; watch CD-30 balance when unfrozen |
| Late-game visual clutter | Particle budget; silhouettes over spectacle at high entity counts | Design constraint; enforce when content scales |

### Plan implications (2026-07-18)

Does **not** rewrite phases or unfreeze balance. It **reorders execution**:

1. Close trust / data / harness work already coded (false wins destroy playtests).
2. **CD-40** night kit next among features (peer praise for commander agency).
3. **CD-49** branch depth (soft counter to rigid nodes without free placement).
4. **CD-47** two-layer economy — designed 2026-07-18 (`docs/design-house-economy.md`); code after
   user U1/U2 (safe floor yes/no + placement model).
5. **CD-30 Slice 4** + **CD-16** + juice (**CD-6 / CD-33**) for retention and demo sell.
6. **CD-31** campaign volume after port-gate decision (answers content/repetition).
7. **CD-9** walls/pathing stays post-port (real free-form answer to rigid nodes).

**Explicit non-goals from peer dislike lists:** unit rally/command; economy-global
must-pick income perks; boss fights designed as free first losses.

### Historical make/break list (ThroneFall player data, 2026-07-14)

Preserved for ticket cross-refs; superseded in priority by the tables above:
1. **Rigid building nodes** — counter with site options, branches, path pressure
   (CD-13 era), eventually nav-grid walls (Phase 4 / CD-9).
2. **Difficulty cliffs** — pressure legible before lethal (CD-12 lineage; freeze).
3. **No undo/sell** — shipped as CD-24.
4. **Micromanagement** — solved by anchors; do not reintroduce.
5. **Perk/mutator system** — CD-30; gating still open.
6. **Late-game visual clutter** — particle budget + readability.

## Open questions

1. ~~Research: one global track tree, or pick-1-of-3 each day (roguelite-ish)?~~
   **ANSWERED 2026-07-15 — neither. Global upgrades live on the Command
   Center as a small set of picks** (`docs/design-wave-legibility.md` §7c,
   option C1): one fork at CC level 2, 1-of-2 (Weapons / Plating), global
   effects, numbers on the chip face, reusing CD-38's shipped `branch`
   mechanism. Rationale: Thronefall has **no in-run research tree at all** —
   its whole global layer is two castle upgrades, and it carries build
   variety in a pre-run perk loadout (CD-30) plus per-building branches
   (CD-49) instead. A 6-node tree was a third variety system stacked on two
   we haven't built. Deletes `research.json`, `ResearchRing`, `ResearchState`,
   `research_facility` and the sell-back exploit class (the HQ can't be sold).
   **Conditional, stated honestly:** this only holds if CD-49 and CD-30 land —
   they carry the variety load. The rejected tree's one real merit was as a
   late-game money sink (CD-7 §6). Roguelite draft stays available later as a
   presentation layer once CD-20 ships a seeded RNG.
2. Map scale: stay one-screen (960×540, ThroneFall-like readability) or grow
   maps + camera pan once WASD exists? (Camera pan pairs naturally with a
   future hero.)
3. Working title: "City Defense" is generic (hard to trademark, hard to
   defend, hard to search) — pick a distinctive name before any public page.
