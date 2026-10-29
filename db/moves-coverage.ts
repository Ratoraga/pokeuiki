import { readFileSync } from "node:fs";
import { sql } from "../src/db";
import { NO_EFFECT_ABILITIES } from "../src/shared/battle/abilities";
import { applyMoveFix, moveSupport } from "../src/shared/battle/data";
import type { BattleMoveData } from "../src/shared/battle/types";

const rows = (await sql`
  SELECT id, name, type, damage_class, power, accuracy, pp, priority, target, category, ailment,
         ailment_chance, stat_chance, stat_changes, drain, healing, flinch_chance, crit_rate,
         min_hits, max_hits, effect
  FROM moves WHERE id < 10000 ORDER BY name`) as (Omit<BattleMoveData, "stat_changes"> & { stat_changes: string; effect: string | null })[];

const moves: BattleMoveData[] = rows.map((r) =>
  applyMoveFix({
    ...r,
    pp: r.pp ?? 5,
    category: r.category ?? "unknown",
    ailment: r.ailment ?? "none",
    target: r.target ?? "selected-pokemon",
    stat_changes: JSON.parse(r.stat_changes || "[]"),
  })
);
const effects = new Map(rows.map((r) => [r.name, r.effect ?? ""]));

const groups: Record<"full" | "partial" | "none", BattleMoveData[]> = { full: [], partial: [], none: [] };
for (const m of moves) groups[moveSupport(m)].push(m);
console.log(`Golpes: ${groups.full.length} completos, ${groups.partial.length} parciais (dano simples), ${groups.none.length} sem suporte (de ${moves.length})`);

for (const key of ["partial", "none"] as const) {
  const byCategory = new Map<string, string[]>();
  for (const m of groups[key]) byCategory.set(m.category, [...(byCategory.get(m.category) ?? []), m.name]);
  for (const [category, names] of byCategory) console.log(`\n[${key}/${category}] ${names.length}:\n  ${names.join(", ")}`);
}
for (const m of groups.none) console.log(`\nSem suporte: ${m.name} — ${effects.get(m.name) || "(sem descrição)"}`);

// ---- habilidades ----
const dir = `${import.meta.dir}/../src/shared`;
const source = ["battle/abilities.ts", "battle/engine.ts", "battle/data.ts", "modifiers.ts"]
  .map((f) => readFileSync(`${dir}/${f}`, "utf8"))
  .join("\n");
// vale o nome entre aspas ("blaze") ou como chave de objeto (blaze:)
const mentioned = (n: string) => source.includes(`"${n}"`) || new RegExp(`(^|[^\\w-])${n}\\s*:`).test(source);

const abilities = (await sql`SELECT name, description FROM abilities ORDER BY name`) as { name: string; description: string | null }[];
const noEffect = abilities.filter((a) => NO_EFFECT_ABILITIES.has(a.name)).map((a) => a.name);
const unhandled = abilities.filter((a) => !NO_EFFECT_ABILITIES.has(a.name) && !mentioned(a.name));

console.log(`\nHabilidades: ${abilities.length - noEffect.length - unhandled.length} implementadas, ${noEffect.length} sem efeito simulado, ${unhandled.length} não tratadas`);
console.log(`\nSem efeito simulado: ${noEffect.join(", ")}`);
for (const a of unhandled) console.log(`\nNão tratada: ${a.name} — ${a.description || "(sem descrição)"}`);

await sql.close();