import { wxBase } from "../shared/battle/data";
import { defTypes, isGrounded, typeMult, weatherActive } from "../shared/battle/engine";
import type { BattleState, SideIndex } from "../shared/battle/types";

export interface Ko { n: number; chance: number }

/**
 * Menor número de golpes que nocauteia com alguma chance (até maxHits).
 * Soma os 16 valores possíveis de cada golpe e considera a recuperação ou o dano por turno (perTurn).
 */
export function koChance(rolls: number[], hp: number, perTurn: number, maxHits = 4): Ko | null {
  let dist = new Map<number, number>([[0, 1]]);
  for (let k = 1; k <= maxHits; k++) {
    const next = new Map<number, number>();
    for (const [sum, p] of dist) {
      for (const r of rolls) next.set(sum + r, (next.get(sum + r) ?? 0) + p / rolls.length);
    }
    dist = next;
    const need = Math.max(1, hp + perTurn * (k - 1));
    let chance = 0;
    for (const [sum, p] of dist) if (sum >= need) chance += p;
    if (chance > 0.0000001) return { n: k, chance: Math.min(1, chance) };
  }
  return null;
}

export interface Residual { chip: number; perTurn: number; notes: string[] }

/** Dano de armadilhas na entrada e cura (+) ou dano (−) por turno do Pokémon do lado `side`. */
export function residualInfo(s: BattleState, side: SideIndex): Residual {
  const m = s.sides[side].team[0];
  if (!m) return { chip: 0, perTurn: 0, notes: [] };
  const notes: string[] = [];
  let chip = 0;
  let perTurn = 0;
  const types = defTypes(m);
  const ab = m.ability ?? "";
  const guard = ab === "magic-guard";
  const frac = (f: number) => Math.max(1, Math.floor(m.maxHp * f));
  const turn = (f: number, label: string) => { perTurn += f > 0 ? frac(f) : -frac(-f); notes.push(label); };

  const h = s.sides[side].hazards;
  if (m.item !== "heavy-duty-boots" && !guard) {
    if (h.stealthRock) { chip += frac(typeMult("rock", types) / 8); notes.push("Stealth Rock"); }
    if (h.spikes > 0 && isGrounded(s, m)) { chip += frac([0, 1 / 8, 1 / 6, 1 / 4][h.spikes] ?? 1 / 4); notes.push(`Spikes ×${h.spikes}`); }
  }

  const w = wxBase(weatherActive(s));
  if (!guard) {
    if (w === "sand" && !types.some((t) => ["rock", "ground", "steel"].includes(t)) && !["sand-veil", "sand-rush", "sand-force", "overcoat"].includes(ab)) turn(-1 / 16, "tempestade de areia");
    if (w === "hail" && !types.includes("ice") && !["ice-body", "snow-cloak", "overcoat", "slush-rush"].includes(ab)) turn(-1 / 16, "granizo");
    if (w === "sun" && (ab === "dry-skin" || ab === "solar-power")) turn(-1 / 8, "sol forte");
    if (m.status === "brn") turn(ab === "heatproof" ? -1 / 32 : -1 / 16, "queimadura");
    if ((m.status === "psn" || m.status === "tox") && ab !== "poison-heal") turn(m.status === "psn" ? -1 / 8 : -1 / 16, "veneno");
    if (m.item === "black-sludge" && !types.includes("poison")) turn(-1 / 8, "Black Sludge");
  }
  if (ab === "poison-heal" && (m.status === "psn" || m.status === "tox")) turn(1 / 8, "Poison Heal");
  if (w === "rain" && ab === "rain-dish") turn(1 / 16, "Rain Dish");
  if (w === "rain" && ab === "dry-skin") turn(1 / 8, "Dry Skin");
  if ((w === "snow" || w === "hail") && ab === "ice-body") turn(1 / 16, "Ice Body");
  if (s.field.terrain === "grassy" && isGrounded(s, m)) turn(1 / 16, "Terreno de Grama");
  if (m.item === "leftovers") turn(1 / 16, "Leftovers");
  if (m.item === "black-sludge" && types.includes("poison")) turn(1 / 16, "Black Sludge");
  return { chip, perTurn, notes };
}