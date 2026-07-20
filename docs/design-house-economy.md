# CD-47 — Safe-floor economy ("Rear Depot")

Architect design doc, 2026-07-18. Coordinates with CD-41 (safe income after mining rework) and CD-7 (`docs/design-economy-rework.md`). **Status: U1/U2 accepted (user 2026-07-19) → implemented (rear_depot + e1/e2 both levels).**

Player-sayable rule (if approved):
**"Rich ground is still dangerous ground. Near the keep you can still scrape a little — never enough to ignore the map."**

---

## 1. Problem & constraints

### Problem
CD-7 deleted placement-free income (`barracks` / `refinery`) so that **the map is the budget**. That was correct for depth. It also **halved the safe rear income** a defense-first player can reach without holding contested mines (ticket CD-41: ~110₡/dawn → ~56₡/dawn at Outpost `m1` only). Genre-peer feedback (ROADMAP **Genre peer lessons**) highly praises the **cheap-safe vs risky-rich** economy *split*; we currently ship only the risky-rich half.

CD-47 asks for a cheap, low-yield building placeable near the base — the safe-floor half — without undoing CD-7 or reviving CD-35's idle-money snowball.

### Binding constraints

| # | Constraint | Source |
|---|---|---|
| C1 | Map remains the *primary* economy; safe floor must not dominate mining | CD-7 D2 thesis |
| C2 | Marginal value of another depot ≪ buying a new tower | CD-7 C11 |
| C3 | Healthy idle ≤70₡/dawn | CD-35 / CD-7 C4 |
| C4 | Destroyed at night → earns 0 that dawn | Dawn restoration |
| C5 | Set-and-forget; no upkeep / ferrying | CD-7 C10 |
| C6 | ≤4 options per site; keys 1–4; no free placement | UI_PLAN; CD-7 C7 |
| C7 | All defs in `src/data/*.json` | Port contract |
| C8 | No income in global `StatMods` / perk mods | D8 |
| C9 | Balance freeze — ship plausible numbers, name QA metrics; do not ladder-tune waves here | TICKETS freeze |
| C10 | Display name is **CD-16 user sign-off**; no banned third-party product names as display | ROADMAP IP / CD-16 |
| C11 | No unit-command / micromanagement | Genre peer non-goal |

### What this ticket is *not*
- Not a re-balance of enemy waves (CD-41 fix path / freeze).
- Not free placement (CD-9).
- Not plasma revival (plasma_tap removed; wells are set dressing).
- Not mining L2 payback (CD-50, frozen).

---

## 2. Thesis tension (Q1) — recommendation

| Reading | Claim | Verdict |
|---------|--------|---------|
| **(a) Reject** | Any rear placement-free income reopens "map is not the economy" | Coherent, but leaves CD-41's safe-floor hole and ignores peer praise for two-layer economy |
| **(b) Constrained safe floor** | Tiny rear income is allowed *only* if hard-capped and strictly inferior to mining | **Recommended** |

**Recommendation: (b).** CD-7's load-bearing claim is "the *best* income is geographic and contested," not "the *only* income is geographic." A **capped, weak, rear-only** floor restores defense-first viability without making the map irrelevant — *if* the caps below hold.

### Income invariants (replace single-band gate)

| Invariant | Definition | Target (plausible, freeze-untuned) |
|-----------|------------|-------------------------------------|
| **I1 — Best-case total** | Max L1 dawn income if every economy option is taken | Keep **190–230₡/day** (CD-7 §12) *including* depots |
| **I2 — Safe floor** | Max L1 dawn income using **only** rear-safe sites (no contested mine/plasma competition slots) | **≥ 80₡/day** and **≤ 100₡/day** on Outpost |
| **I3 — Dominance** | Cost of N max depots + their total run income vs one gun tower + one contested mine | Depot package must lose both "survive contested field" and "peak DPS board" paths on paper |

I2 is the criterion CD-41's reviewer asked for; I1 prevents inflation; I3 is C11.

---

## 3. Placement model (Q2) — recommendation

| Option | Trade-off |
|--------|-----------|
| **(i) Add depot to existing rear sites** (`s1`, maybe HQ-adjacent `any`) | Zero new sites; risks option-list pressure (≤4); competes with gun/missile already on `s1` after CD-55 |
| **(ii) Dedicated rear economy site(s)** | Clear "safe pocket" read; exact count = hard cap; doesn't steal combat option slots | **Recommended** |
| **(iii) Defer to CD-9 free placement** | Solves "anywhere near keep" but blocked until post-port; leaves CD-41 open for the whole web demo | Reject for v1 |

**Recommendation: (ii) — two dedicated sites per level, category `resource` (or new `support` economy), options `["rear_depot"]` only.**

| Level | Site ids (proposed) | Placement intent |
|-------|---------------------|------------------|
| Outpost | `e1`, `e2` | SE pocket near HQ / away from west+north lanes |
| Ridge | `e1`, `e2` | NE high ground near HQ, not on approach legs |

**Hard cap = number of sites that offer the def** (exactly 2). No `unique` sim flag required if options lists never appear on other sites; still set `BuildingDef.unique: true` so a future author cannot paste the option onto six slots by mistake (enforce in `canBuild` when `unique` is set — small eng follow-through, typed field already exists).

Why not put depot on `s1` only? One site → floor ~18₡, still thin; two sites → ~36₡ added safe — enough to matter without matching a 4–5 node mine.

---

## 4. Data model

### New def — `rear_depot` (id is the contract)

```json
{
  "id": "rear_depot",
  "name": "Rear Depot",
  "category": "production",
  "description": "Low-yield stockpile. Safe only because it sits behind the line — never a substitute for mining the field.",
  "cost": 55,
  "maxHp": 70,
  "damage": 0,
  "range": 0,
  "fireRate": 0,
  "splashRadius": 0,
  "incomePerDay": 18,
  "maxLevel": 1,
  "upgradeCostMult": 0,
  "color": "#6d4c41",
  "accent": "#bcaaa4",
  "size": 20,
  "shape": "silo",
  "unique": true
}
```

| Field | Choice | Why |
|-------|--------|-----|
| `incomePerDay: 18` | Flat (no `mining` block) | Not crystal-scaled — deliberately *not* map-read income |
| `cost: 55` | < gun tower (80) | Affordable day 1 as a floor, not a board-fill |
| `maxLevel: 1` | No upgrade | Avoids CD-50 dead production upgrades on this archetype |
| `unique: true` | At most one **instance type** wait — unique means one *of this def* per level | **Yes:** one `rear_depot` total OR one per site? |

**Clarify unique:** Existing type says "at most one built per level." With two sites offering only this def, **unique would block the second site**. Conflict.

**Fix:** Do **not** use global `unique` for a 2-site cap. Cap is **options-list authorship only** (only `e1`/`e2` offer it; each site holds one building). Document in validator optional: count of sites offering `rear_depot` ≤ 2 per level (soft assert).

### Levels.json
- Add `e1`, `e2` coordinates (hand-placed; validator rock clearance applies).
- Do **not** add `rear_depot` to combat/resource mine sites.

### Collect income
Existing `collectDawnIncome` already pays non-mining `incomePerDay` as flat ×1 (nodes=1 path). **Zero new income math** if we omit `mining`.

### Art
Reuse `shape: "silo"` vector/atlas for v1 (mining already uses silo). Optional later: `shape: "depot"` builder. No CD-32 block.

---

## 5. Balance sketch (Q3) — freeze-untuned starting values

**Outpost L1 safe floor (I2):**  
`m1` mining ~56₡ (4×14) + `e1`+`e2` depots 36₡ = **~92₡** if player takes rear only + safe mine.  
Without any mine: **36₡** — still weak (encourages at least `m1`).

**Best-case total (I1):** recompute after authoring; if over 230, lower depot yield first (18→15), not crystal rates (CD-50/freeze).

**Dominance (I3) paper check (order of magnitude):**
- 2× depot = 110₡ invest, 36₡/dawn × ~5 dawns ≈ 180₡ return + residual HP sinks.
- 1× gun tower = 80₡ + combat value every night.
- Contested `m2` 5-node = 70₡/dawn if held — still the jackpot.

Depots win only as **insurance / day-1 float**, not as the win condition. **QA metric:** a depot-only + HQ gun run still fails mid-game; a full mine run without depots remains viable; depots + one safe mine clears early waves more often than mine-starved defense-first (addresses CD-41 *shape*, not wave retune).

**Do not** re-open mining upgrade payback (CD-50) in this ticket.

---

## 6. Anti-upkeep (Q4)

| Rule | Mechanism |
|------|-----------|
| No daily chores | Dawn free rebuild (existing) |
| No ferrying | Flat dawn credit payout (existing) |
| Cap count | Exactly two offering sites |
| No click tax | Same build ring as any other option; no new verb |
| No mid-night manage | No garrison, no abilities |

---

## 7. Naming (Q5) — user decision required

| Layer | Value | Who decides |
|-------|-------|-------------|
| **id** | `rear_depot` | Architect (stable contract) |
| **display `name`** | Placeholder **"Rear Depot"** | **CD-16 user session** may rename; never ship a banned third-party product name |
| **description** | As in §4 | CD-16 may rewrite flavor |

---

## 8. Coordination with CD-41 / freeze

| Item | Relationship |
|------|----------------|
| CD-41 W4 cliff | Safe floor is a *structural* answer to "defense-first arrives poor"; does **not** replace legibility fixes already shipped (air telegraph). Under freeze: **do not** retune W4 counts in this ticket. |
| CD-50 production upgrades | Depots ship `maxLevel: 1` so they don't join the dead-upgrade set. |
| Balance freeze | Starting numbers are plausible; measure I1–I3 once, file deviations, no knob ladder. |

---

## 9. Module / file impact

| File | Change |
|------|--------|
| `src/data/buildings.json` | Add `rear_depot` |
| `src/data/levels.json` | Add `e1`/`e2` on both levels |
| `src/data/validate.ts` | Optional: ≤2 sites offer `rear_depot`; positive income flat defs |
| `src/game/Game.ts` | Prefer enforce `unique` only if we use it; default **no code** if options-only cap |
| `src/render/*` | None required (silo shape) |
| `src/ui/*` | BuildRing already shows `₡/dawn` for mining only — **extend** income face to flat `incomePerDay > 0` without mining (one-line) |

---

## 10. Platform impact

| Concern | Browser | Godot | Controller | Mobile |
|---------|---------|-------|------------|--------|
| Build | Same site + option(n) | Same JSON | Same | Same |
| Income | Existing dawn path | Same | — | — |
| Cap | Authored sites | Same data | — | — |

---

## 11. Implementation slices (after user decisions)

**Slice 0 — User sign-off** (blocking)
1. Approve thesis **(b)** vs reject **(a)**.
2. Approve placement **(ii)** vs (i)/(iii).
3. Accept id `rear_depot` + placeholder name, or supply CD-16 final name early.

**Slice 1 — Def + Outpost sites only**  
`rear_depot` + Outpost `e1`/`e2`; BuildRing flat income face; validator.  
*Playable: Outpost only.* QA: I2/I3 probes; idle ≤70; no tsc break.

**Slice 2 — Ridge sites**  
Mirror `e1`/`e2`. QA: both levels I1 band; clear with mixed build.

**Slice 3 — QA metrics writeup**  
Record measured safe-floor and best-case numbers on CD-47 / CD-41; no wave retunes.

---

## 12. Risks

| Risk | Mitigation |
|------|------------|
| Depots become must-buy spam | Hard site cap = 2; low yield; maxLevel 1 |
| I1 band breaks | Lower yield before touching crystals |
| Players ignore mines | Floor without mine still weak (36₡); contested fields stay jackpot |
| Scope creep into free placement | Explicitly out; CD-9 later |
| Name / IP | id only; display via CD-16 |

---

## 13. Decisions for the user (stop here)

| # | Question | Architect recommendation |
|---|----------|---------------------------|
| **U1** | Accept constrained safe floor **(b)** or reject house economy **(a)**? | **(b)** |
| **U2** | Placement: dedicated rear sites **(ii)**, bolt onto existing **(i)**, or defer **(iii)**? | **(ii)** two sites/level |
| **U3** | Starting numbers (55₡ / 18₡/dawn / 2 sites / maxLevel 1) acceptable as freeze-untuned? | **Yes** |
| **U4** | Display name: keep placeholder "Rear Depot" until CD-16, or supply a final name now? | Placeholder until CD-16 |

**U1–U2 answered 2026-07-19 (accept architect recommendations).** U3–U4 defaulted to recommendations (freeze-untuned numbers; placeholder name until CD-16).

---

## 14. Explicit non-goals

- Free placement houses
- Upkeep / workers
- Income perks or global income mods
- Wave retunes under this ticket
- Mining upgrade payback (CD-50)
- Using banned product names as display strings
