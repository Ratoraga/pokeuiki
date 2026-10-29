import { BALL, BITE, POWDER, PULSE, PUNCH, SLICE, SOUND, isContact } from "./data";
import type { BattleMoveData, Mon, Rng, StageKey, StatKey5, Status, Terrain, Weather } from "./types";

/** Habilidades sem efeito simulado: mudança de forma, só para duplas ou sem efeito em batalha. */
export const NO_EFFECT_ABILITIES = new Set([
  "illuminate", "honey-gather", "pickup", "ball-fetch", "run-away", "telepathy", "friend-guard", "healer",
  "plus", "minus", "flower-veil", "aroma-veil", "symbiosis", "receiver", "power-of-alchemy", "costar",
  "commander", "hospitality", "curious-medicine", "power-spot", "battery", "stalwart", "propeller-tail",
  "anticipation", "forewarn", "frisk", "klutz", "multitype", "rks-system", "forecast", "zen-mode",
  "stance-change", "schooling", "shields-down", "power-construct", "battle-bond", "hunger-switch",
  "zero-to-hero", "tera-shift", "teraform-zero", "poison-puppeteer", "gulp-missile", "opportunist",
  "cud-chew", "illusion", "stall", "mycelium-might", "dancer", "gluttony", "quick-draw", "wind-rider",
  "wind-power", "supreme-overlord", "embody-aspect-teal", "embody-aspect-wellspring",
  "embody-aspect-hearthflame", "embody-aspect-cornerstone", "ability-shield", "as-one-glastrier-no",
]);

const WEATHER_ABILITY: Record<string, Weather> = {
  drizzle: "rain", drought: "sun", "sand-stream": "sand", "snow-warning": "snow", "orichalcum-pulse": "sun",
  "desolate-land": "harsh-sun", "primordial-sea": "heavy-rain", "delta-stream": "strong-winds",
};
const TERRAIN_ABILITY: Record<string, Terrain> = {
  "electric-surge": "electric", "hadron-engine": "electric", "grassy-surge": "grassy",
  "misty-surge": "misty", "psychic-surge": "psychic",
};
export const PERMANENT_ABILITY: Record<string, string> = {
  "harsh-sun": "desolate-land", "heavy-rain": "primordial-sea", "strong-winds": "delta-stream",
};
export const weatherFromAbility = (a: string | null): Weather | null => (a ? (WEATHER_ABILITY[a] ?? null) : null);
export const terrainFromAbility = (a: string | null): Terrain | null => (a ? (TERRAIN_ABILITY[a] ?? null) : null);

export function speedMult(m: Mon, w: Weather | null, t: Terrain | null): number {
  let v = 1;
  switch (m.ability) {
    case "chlorophyll": v = w === "sun" ? 2 : 1; break;
    case "swift-swim": v = w === "rain" ? 2 : 1; break;
    case "sand-rush": v = w === "sand" ? 2 : 1; break;
    case "slush-rush": v = w === "snow" || w === "hail" ? 2 : 1; break;
    case "surge-surfer": v = t === "electric" ? 2 : 1; break;
    case "quick-feet": v = m.status ? 1.5 : 1; break;
    case "unburden": v = m.item === null && m.data.item !== null ? 2 : 1; break;
    case "slow-start": v = m.turnsOut < 5 ? 0.5 : 1; break;
    default: break;
  }
  if (boostedKey(m, w, t) === "spe") v *= 1.5;
  return v;
}

/** Protosynthesis / Quark Drive: o maior status é turbinado. */
function boostedKey(m: Mon, w: Weather | null, t: Terrain | null): StatKey5 | null {
  const on =
    (m.ability === "protosynthesis" && (w === "sun" || m.item === "booster-energy")) ||
    (m.ability === "quark-drive" && (t === "electric" || m.item === "booster-energy"));
  if (!on) return null;
  const keys = ["atk", "def", "spa", "spd", "spe"] as const;
  let best: StatKey5 = "atk";
  for (const k of keys) if (m.stats[k] > m.stats[best]) best = k;
  return best;
}

export function statMult(m: Mon, key: StatKey5, w: Weather | null, t: Terrain | null): number {
  const a = m.ability;
  let v = 1;
  if (a === "guts" && m.status && key === "atk") v *= 1.5;
  if (a === "marvel-scale" && m.status && key === "def") v *= 1.5;
  if (a === "flare-boost" && m.status === "brn" && key === "spa") v *= 1.5;
  if (a === "toxic-boost" && (m.status === "psn" || m.status === "tox") && key === "atk") v *= 1.5;
  if (a === "solar-power" && w === "sun" && key === "spa") v *= 1.5;
  if (a === "flower-gift" && w === "sun" && (key === "atk" || key === "spd")) v *= 1.5;
  if (a === "defeatist" && m.hp * 2 <= m.maxHp && (key === "atk" || key === "spa")) v *= 0.5;
  if (a === "slow-start" && m.turnsOut < 5 && key === "atk") v *= 0.5;
  if (a === "grass-pelt" && t === "grassy" && key === "def") v *= 1.5;
  if (a === "orichalcum-pulse" && w === "sun" && key === "atk") v *= 1.3333;
  if (a === "hadron-engine" && t === "electric" && key === "spa") v *= 1.3333;
  if (boostedKey(m, w, t) === key && key !== "spe") v *= 1.3;
  return v;
}

const PINCH: Record<string, string> = { blaze: "fire", torrent: "water", overgrow: "grass", swarm: "bug" };
const ATE = new Set(["pixilate", "refrigerate", "aerilate", "galvanize", "dragonize"]);

export function powerMult(
  att: Mon, move: BattleMoveData, type: string,
  c: { weather: Weather | null; movedLast: boolean; converted: boolean; hasSecondary: boolean; power: number }
): number {
  const a = att.ability ?? "";
  let m = 1;
  if (a === "fire-mane" && type === "fire") m *= 1.5;
  if (a === "technician" && c.power <= 60) m *= 1.5;
  if (a === "iron-fist" && PUNCH.has(move.name)) m *= 1.2;
  if (a === "strong-jaw" && BITE.has(move.name)) m *= 1.5;
  if (a === "mega-launcher" && PULSE.has(move.name)) m *= 1.5;
  if (a === "sharpness" && SLICE.has(move.name)) m *= 1.5;
  if (a === "tough-claws" && isContact(move)) m *= 1.3;
  if (a === "sheer-force" && c.hasSecondary) m *= 1.3;
  if (a === "reckless" && move.drain < 0) m *= 1.2;
  if (a === "sand-force" && c.weather === "sand" && ["rock", "ground", "steel"].includes(type)) m *= 1.3;
  if (a === "analytic" && c.movedLast) m *= 1.3;
  if (a === "dragons-maw" && type === "dragon") m *= 1.5;
  if (a === "transistor" && type === "electric") m *= 1.5;
  if (a === "water-bubble" && type === "water") m *= 2;
  if ((a === "steelworker" || a === "steely-spirit") && type === "steel") m *= 1.5;
  if (a === "rocky-payload" && type === "rock") m *= 1.5;
  if (a === "punk-rock" && SOUND.has(move.name)) m *= 1.3;
  if (a === "rivalry") m *= 1;
  if (PINCH[a] === type && att.hp * 3 <= att.maxHp) m *= 1.5;
  if (c.converted && ATE.has(a)) m *= 1.2;
  if (att.v.flashFire && type === "fire") m *= 1.5;
  if (att.v.charged && type === "electric") m *= 2;
  return m;
}

export function defenderDamageMult(def: Mon, att: Mon, move: BattleMoveData, eff: number, ignore: boolean): number {
  if (ignore) return 1;
  switch (def.ability) {
    case "aura-guard": return isContact(move) ? 0.5 : 1;
    case "multiscale":
    case "shadow-shield": return def.hp === def.maxHp ? 0.5 : 1;
    case "filter":
    case "solid-rock":
    case "prism-armor": return eff > 1 ? 0.75 : 1;
    case "fluffy": return isContact(move) ? 0.5 : 1;
    case "ice-scales": return move.damage_class === "special" ? 0.5 : 1;
    case "punk-rock": return SOUND.has(move.name) ? 0.5 : 1;
    case "tera-shell": return def.hp === def.maxHp && eff >= 1 ? 0.5 / eff : 1;
    default: return att.ability === "unaware" ? 1 : 1;
  }
}

export const attackerDamageMult = (att: Mon, eff: number) =>
  att.ability === "tinted-lens" && eff < 1 ? 2 : att.ability === "neuroforce" && eff > 1 ? 1.25 : 1;

export function blocksStatus(m: Mon, st: Status, terrain: Terrain | null, grounded: boolean, w: Weather | null): boolean {
  const a = m.ability;
  if (a === "purifying-salt" || a === "comatose") return true;
  if (a === "leaf-guard" && w === "sun") return true;
  if (terrain === "misty" && grounded) return true;
  switch (st) {
    case "par": return a === "limber";
    case "slp": return a === "insomnia" || a === "vital-spirit" || a === "sweet-veil" || (terrain === "electric" && grounded);
    case "psn":
    case "tox": return a === "immunity" || a === "pastel-veil";
    case "brn": return a === "water-veil" || a === "water-bubble" || a === "thermal-exchange";
    case "frz": return a === "magma-armor";
    default: return false;
  }
}

export interface Absorb { heal?: number; boost?: [StageKey, number]; flashFire?: boolean; charge?: boolean }

export function absorbEffect(a: string | null, type: string): Absorb | null {
  switch (a) {
    case "water-absorb":
    case "dry-skin": return type === "water" ? { heal: 0.25 } : null;
    case "volt-absorb": return type === "electric" ? { heal: 0.25 } : null;
    case "earth-eater": return type === "ground" ? { heal: 0.25 } : null;
    case "flash-fire": return type === "fire" ? { flashFire: true } : null;
    case "sap-sipper": return type === "grass" ? { boost: ["atk", 1] } : null;
    case "lightning-rod": return type === "electric" ? { boost: ["spa", 1] } : null;
    case "storm-drain": return type === "water" ? { boost: ["spa", 1] } : null;
    case "motor-drive": return type === "electric" ? { boost: ["spe", 1] } : null;
    case "well-baked-body": return type === "fire" ? { boost: ["def", 2] } : null;
    case "electromorphosis": return null;
    default: return null;
  }
}

export function immuneToMove(def: Mon, move: BattleMoveData): boolean {
  if (def.ability === "soundproof" && SOUND.has(move.name)) return true;
  if (def.ability === "bulletproof" && BALL.has(move.name)) return true;
  if (def.ability === "overcoat" && POWDER.has(move.name)) return true;
  return false;
}
export const blocksPriority = (def: Mon) => ["dazzling", "queenly-majesty", "armor-tail"].includes(def.ability ?? "");

export function onKoBoost(att: Mon): [StageKey, number] | null {
  switch (att.ability) {
    case "moxie":
    case "chilling-neigh":
    case "as-one-glastrier": return ["atk", 1];
    case "grim-neigh":
    case "as-one-spectrier": return ["spa", 1];
    case "beast-boost": case "eelevate":  {
      const keys = ["atk", "def", "spa", "spd", "spe"] as const;
      let best: StatKey5 = "atk";
      for (const k of keys) if (att.stats[k] > att.stats[best]) best = k;
      return [best, 1];
    }
    default: return null;
  }
}

export function blocksDrop(t: Mon, key: StageKey): boolean {
  const a = t.ability;
  if (a === "clear-body" || a === "white-smoke" || a === "full-metal-body") return true;
  return (a === "hyper-cutter" && key === "atk") || (a === "keen-eye" && key === "acc") || (a === "big-pecks" && key === "def") || (a === "minds-eye" && key === "acc");
}
export const blocksIntimidate = (t: Mon) => ["inner-focus", "oblivious", "own-tempo", "scrappy", "guard-dog"].includes(t.ability ?? "");

export function priorityBonus(m: Mon, move: BattleMoveData): number {
  if (m.ability === "prankster" && move.damage_class === "status") return 1;
  if (m.ability === "gale-wings" && move.type === "flying" && m.hp === m.maxHp) return 1;
  if (m.ability === "triage" && (move.healing > 0 || move.drain > 0)) return 3;
  return 0;
}

export function accuracyMult(att: Mon, def: Mon, move: BattleMoveData, w: Weather | null): number {
  let m = 1;
  if (att.ability === "compound-eyes") m *= 1.3;
  if (att.ability === "victory-star") m *= 1.1;
  if (att.ability === "hustle" && move.damage_class === "physical") m *= 0.8;
  if (def.ability === "sand-veil" && w === "sand") m *= 0.8;
  if (def.ability === "snow-cloak" && (w === "snow" || w === "hail")) m *= 0.8;
  if (def.ability === "tangled-feet" && def.v.confusion > 0) m *= 0.5;
  if (def.ability === "wonder-skin" && move.damage_class === "status") m = Math.min(m, 0.5);
  return m;
}

export const ignoresAbility = (att: Mon) => ["mold-breaker", "teravolt", "turboblaze"].includes(att.ability ?? "");
export const critImmune = (def: Mon) => def.ability === "battle-armor" || def.ability === "shell-armor";
export const secondaryMult = (att: Mon) => (att.ability === "serene-grace" ? 2 : 1);
export const alwaysHits = (att: Mon, def: Mon) => att.ability === "no-guard" || def.ability === "no-guard";
export const shieldDust = (def: Mon) => def.ability === "shield-dust";
export const blocksFlinch = (def: Mon) => def.ability === "inner-focus" || def.ability === "shield-dust";
export const critMult = (att: Mon) => (att.ability === "sniper" ? 2.25 : 1.5);

export function contactEffect(def: Mon, rng: Rng): { damageFrac?: number; status?: Status } | null {
  switch (def.ability) {
    case "rough-skin":
    case "iron-barbs": return { damageFrac: 1 / 8 };
    case "static": return rng() < 0.3 ? { status: "par" } : null;
    case "flame-body": return rng() < 0.3 ? { status: "brn" } : null;
    case "poison-point": return rng() < 0.3 ? { status: "psn" } : null;
    case "effect-spore": {
      if (rng() >= 0.3) return null;
      const r = rng();
      return { status: r < 0.33 ? "slp" : r < 0.66 ? "par" : "psn" };
    }
    default: return null;
  }
}