import { sql } from "../src/db";
import { createBattle as _unused, setTypeChart } from "../src/shared/battle/engine";
import {
  benchIdxs, chooseDoubles, createDoublesBattle, key, legalDoubles, playTurnDoubles, replaceSlot, settleDoubles, SLOTS,
  type DAction,
} from "../src/shared/battle/doubles";
import type { BattleMonData, BattleMoveData, BattleState } from "../src/shared/battle/types";

void _unused;
const chart = (await sql`SELECT attacker, defender, multiplier::float8 AS multiplier FROM type_effectiveness`) as { attacker: string; defender: string; multiplier: number }[];
setTypeChart(chart.map((r) => ({ ...r, multiplier: Number(r.multiplier) })));

const mv = (o: Partial<BattleMoveData>): BattleMoveData => ({
  id: 1, name: "tackle", type: "normal", damage_class: "physical", power: 40, accuracy: 100, pp: 20, priority: 0,
  category: "damage", ailment: "none", ailment_chance: 0, stat_chance: 0, stat_changes: [], target: "selected-pokemon",
  drain: 0, healing: 0, flinch_chance: 0, crit_rate: 0, min_hits: null, max_hits: null, ...o,
});
const MOVES = [
  mv({}),
  mv({ id: 2, name: "surf", type: "water", damage_class: "special", power: 90, target: "all-other-pokemon" }),
  mv({ id: 3, name: "rock-slide", type: "rock", power: 75, target: "all-opponents" }),
  mv({ id: 4, name: "helping-hand", damage_class: "status", power: null, category: "unique", target: "ally", priority: 5 }),
  mv({ id: 5, name: "follow-me", damage_class: "status", power: null, category: "unique", target: "user", priority: 2 }),
  mv({ id: 6, name: "protect", damage_class: "status", power: null, category: "unique", target: "user", priority: 4 }),
  mv({ id: 7, name: "u-turn", type: "bug", power: 70 }),
  mv({ id: 8, name: "thunder-wave", type: "electric", damage_class: "status", power: null, category: "ailment", ailment: "paralysis" }),
];
const mon = (ability: string | null, types: string[]): BattleMonData => ({
  pokemon_id: 1, species_id: 1, species: "teste", nickname: null, types, level: 50, ability, item: null, weight: 50,
  stats: { hp: 180, atk: 100, def: 90, spa: 100, spd: 90, spe: 100 }, sprite: null, gmax: null, forms: null, mega: null,
  moves: MOVES.slice(0, 4).concat(MOVES.slice(4)).sort(() => Math.random() - 0.5).slice(0, 4),
});
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)] as T;

function randomActs(s: BattleState, side: 0 | 1): (DAction | null)[] {
  return SLOTS.map((sl) => { const l = legalDoubles(s, side, sl); return l.length ? pick(l) : null; });
}
function settle(s0: BattleState): BattleState {
  let s = s0;
  const log: string[] = [];
  settleDoubles(s, Math.random, log);
  for (const sl of SLOTS) {
    if (s.winner === null && s.dpend?.[key(0, sl)]) s = replaceSlot(s, 0, sl, pick(benchIdxs(s, 0)), Math.random).state;
  }
  return s;
}

const abilities = (await sql`SELECT name FROM abilities ORDER BY name`) as { name: string }[];
const failures: string[] = [];
for (const { name } of abilities) {
  for (const holder of [0, 1] as const) {
    try {
      const mine = () => [mon(name, ["normal"]), mon(name, ["fire"]), mon(null, ["grass"]), mon(null, ["water"])];
      const other = () => [mon(null, ["water"]), mon(null, ["electric"]), mon(null, ["ground"]), mon(null, ["flying"])];
      let s = createDoublesBattle(holder === 0 ? [mine(), other()] : [other(), mine()]).state;
      for (let t = 0; t < 14 && s.winner === null; t++) {
        const a = randomActs(s, 0);
        const b = t % 2 ? chooseDoubles(s, 1, Math.random) : randomActs(s, 1);
        s = settle(playTurnDoubles(s, [a[0] ?? null, a[1] ?? null, b[0] ?? null, b[1] ?? null], Math.random).state);
      }
    } catch (e) {
      failures.push(`${name} (${holder === 0 ? "você" : "bot"}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
console.log(`${abilities.length} habilidades testadas em duplas, ${failures.length} falhas.`);
for (const f of failures) console.log(" -", f);
await sql.close();