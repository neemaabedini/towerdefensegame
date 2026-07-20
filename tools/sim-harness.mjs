#!/usr/bin/env node
/**
 * CD-57: headless Game sim harness (no browser).
 *
 * Loads `Game` via Vite SSR (same pattern as tools/validate-data.mjs) and
 * runs critical-rule cases. Exit 0 on all pass; non-zero on first failure.
 *
 *   node tools/sim-harness.mjs
 *   npm test
 *
 * Cases:
 *   1. CD-54 — HQ dead + wave empty on final night → defeat, never victory
 *   2. CD-54 complement — HQ alive + wave empty on final night → victory
 *   3. Sell lockout — second sellOrUndo within sellLockoutMs is false
 *   4. Swarm mutator — wave entry counts round up by countMul
 */
import { createServer } from "vite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const server = await createServer({
  root,
  logLevel: "error",
  server: { middlewareMode: true },
  appType: "custom",
});

/** @type {{ name: string; pass: boolean; detail?: string }[]} */
const results = [];

function assert(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: cond ? undefined : detail });
  if (!cond) {
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

try {
  const gameMod = await server.ssrLoadModule("/src/game/Game.ts");
  const levelsMod = await server.ssrLoadModule("/src/data/levels.ts");
  const tuningMod = await server.ssrLoadModule("/src/data/tuning.ts");
  const { Game } = gameMod;
  const { LEVELS } = levelsMod;
  const { TUNING } = tuningMod;

  // --- 1. CD-54: dead HQ on final-wave clear → defeat ---
  {
    const phases = [];
    const g = new Game(() => 0);
    g.onChange(() => phases.push(g.getSnapshot().phase));
    g.loadLevel(0);
    g.harnessSetNightEndState({ hqHp: 0 });
    g.update(1 / 60);
    const snap = g.getSnapshot();
    assert(
      "CD-54 dead HQ → defeat",
      snap.phase === "defeat",
      `phase=${snap.phase}`,
    );
    assert(
      "CD-54 dead HQ never emitted victory",
      !phases.includes("victory"),
      `phases=${phases.join(",")}`,
    );
  }

  // --- 2. CD-54 complement: living HQ on final-wave clear → victory ---
  {
    const g = new Game(() => 0);
    g.loadLevel(0);
    g.harnessSetNightEndState({ hqHp: 100 });
    g.update(1 / 60);
    const snap = g.getSnapshot();
    assert(
      "CD-54 living HQ → victory",
      snap.phase === "victory",
      `phase=${snap.phase}`,
    );
  }

  // --- 3. Sell lockout ---
  {
    let t = 0;
    const g = new Game(() => t);
    g.loadLevel(0);
    const built = g.build("d1", "gun_tower");
    assert("sell lockout: build gun_tower on d1", built, "build failed");
    const bId = g.getSnapshot().buildings.find((b) => !b.isHq)?.id;
    assert("sell lockout: building exists", !!bId, "no building id");
    t = 1000;
    const first = g.sellOrUndo(bId);
    assert("sell lockout: first sell/undo succeeds", first === true, `got ${first}`);
    // Rebuild so a second call still has a target (lockout is about time, not
    // missing building). Full undo removes the building — rebuild and try
    // double-sell on a fresh place within the lockout window.
    t = 1000; // still inside lockout from first sell at t=1000 if lastSellAt=1000
    const rebuilt = g.build("d1", "gun_tower");
    assert("sell lockout: rebuild on d1", rebuilt, "rebuild failed");
    const bId2 = g.getSnapshot().buildings.find((b) => !b.isHq)?.id;
    const second = g.sellOrUndo(bId2);
    assert(
      "sell lockout: second call within window fails",
      second === false,
      `got ${second}, lockoutMs=${TUNING.input.sellLockoutMs}`,
    );
    t = 1000 + TUNING.input.sellLockoutMs + 1;
    const third = g.sellOrUndo(bId2);
    assert(
      "sell lockout: after window succeeds",
      third === true,
      `got ${third}`,
    );
  }

  // --- 4. Swarm mutator wave transform ---
  {
    const baseLevel = LEVELS[0];
    const baseW0 = baseLevel.waves[0].entries.reduce((s, e) => s + e.count, 0);

    const g = new Game(() => 0);
    g.setLoadout({ perks: [], mutators: ["swarm"] });
    g.loadLevel(0);
    const runW0 = g.getSnapshot().level.waves[0].entries.reduce(
      (s, e) => s + e.count,
      0,
    );
    // countMul 1.3, counts ceil'd per entry
    const expected = baseLevel.waves[0].entries.reduce(
      (s, e) => s + Math.ceil(e.count * 1.3),
      0,
    );
    assert(
      "Swarm mutator bumps W0 enemy count",
      runW0 === expected && runW0 > baseW0,
      `base=${baseW0} run=${runW0} expected=${expected}`,
    );
  }

  // --- 5. CD-40 ability cast ---
  {
    const g = new Game(() => 0);
    g.loadLevel(0);
    // Day: ability should no-op
    assert("CD-40 castAbility blocked by day", g.castAbility(0) === false);
    g.startNight();
    const ok = g.castAbility(0);
    assert("CD-40 castAbility works at night", ok === true);
    const hero = g.getSnapshot().hero;
    const cdKeys = hero ? Object.keys(hero.abilityCooldowns) : [];
    assert(
      "CD-40 cooldown recorded after cast",
      cdKeys.length === 1 && (hero.abilityCooldowns[cdKeys[0]] ?? 0) > 0,
      `cds=${JSON.stringify(hero?.abilityCooldowns)}`,
    );
    assert(
      "CD-40 second cast blocked while cooling down",
      g.castAbility(0) === false,
    );
  }
} catch (err) {
  console.error("harness crashed:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await server.close();
}

const failed = results.filter((r) => !r.pass).length;
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed} passed, ${failed} failed (${results.length} total)`);
if (failed > 0) process.exitCode = 1;
