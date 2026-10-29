import { defenseAdjust, effectiveMoveType } from "../modifiers";
import { TYPES } from "../pokemonTypes";
import * as AB from "./abilities";
import {
  BALL, FLING_POWER, METRONOME_BANNED, MAX_BY_NAME, MAX_MOVES, NORMAL_MAX, TYPE_BOOST_ITEMS, WEATHER_BALL_TYPE,
  Z_CRYSTALS, Z_MOVE_NAMES, isComplexSpec, isContact, isDamaging, isPermanentWeather, isSupported, maxPower,
  specOf, wxBase, zPower, type MoveSpec, GMAX_BY_NAME, GMAX_MOVES, NATURAL_GIFT
} from "./data";
import type {
  Action, BattleMonData, BattleMoveData, BattleState, ChartRow, Mon, MoveAction, Rng, SideIndex,
  SideState, StageKey, StatKey5, Status, Terrain, Volatile, Weather,
} from "./types";

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------
const DYNAMAX_HP = 2;
let CHART = new Map<string, number>();
export function setTypeChart(rows: ChartRow[]): void {
  CHART = new Map<string, number>(rows.map((r) => [`${r.attacker}>${r.defender}`, r.multiplier] as [string, number]));
}
let CATALOG: BattleMoveData[] = [];
/** Lista de todos os golpes (usada por Metronome e Copycat). */
export function setMoveCatalog(list: BattleMoveData[]): void { CATALOG = list; }

export const typeMult = (attacker: string, defenders: string[]): number =>
  defenders.reduce((acc, d) => acc * (CHART.get(`${attacker}>${d}`) ?? 1), 1);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function at<T>(arr: T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`Índice inválido: ${i}`);
  return v;
}
export const otherSide = (s: SideIndex): SideIndex => (s === 0 ? 1 : 0);
export function activeMon(s: BattleState, side: SideIndex): Mon {
  const st = s.sides[side];
  return at(st.team, st.active);
}
const sideOf = (s: BattleState, m: Mon): SideIndex => (s.sides[0].team.includes(m) ? 0 : 1);
export const pretty = (slug: string) => slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
export const monName = (m: Mon) => m.data.nickname ?? pretty(m.species);

const SIDE_LABEL: Record<SideIndex, string> = { 0: "Você", 1: "O bot" };
const STAGE_LABEL: Record<StageKey, string> = {
  atk: "Ataque", def: "Defesa", spa: "Atq. Esp.", spd: "Def. Esp.", spe: "Velocidade", acc: "Precisão", eva: "Esquiva",
};
const STATUS_MSG: Record<Status, string> = {
  brn: "foi queimado!", par: "foi paralisado! Pode ser difícil atacar.", psn: "foi envenenado!",
  tox: "foi gravemente envenenado!", slp: "adormeceu!", frz: "foi congelado!",
};
const WEATHER_MSG: Record<Weather, string> = {
  sun: "O sol ficou forte!", rain: "Começou a chover!", sand: "Uma tempestade de areia se formou!",
  snow: "Começou a nevar!", hail: "Começou a cair granizo!", "harsh-sun": "O sol ficou extremamente forte!",
  "heavy-rain": "Uma chuva torrencial começou!", "strong-winds": "Ventos misteriosos protegem os voadores!",
};
const WEATHER_END: Record<Weather, string> = {
  sun: "O sol voltou ao normal.", rain: "A chuva parou.", sand: "A tempestade de areia acabou.",
  snow: "A neve parou.", hail: "O granizo parou.", "harsh-sun": "O sol extremo se acalmou.",
  "heavy-rain": "A chuva torrencial passou.", "strong-winds": "Os ventos misteriosos cessaram.",
};
const TERRAIN_MSG: Record<Terrain, string> = {
  electric: "O campo ficou carregado de eletricidade!", grassy: "Grama cresceu pelo campo!",
  misty: "Uma névoa cobriu o campo!", psychic: "O campo ficou estranho!",
};
const TERRAIN_END: Record<Terrain, string> = {
  electric: "A eletricidade sumiu.", grassy: "A grama desapareceu.", misty: "A névoa se dissipou.",
  psychic: "A estranheza do campo passou.",
};
const TERRAIN_TYPE: Record<Terrain, string> = { electric: "electric", grassy: "grass", misty: "fairy", psychic: "psychic" };
const WEATHER_ROCK: Record<Weather, string> = {
  sun: "heat-rock", rain: "damp-rock", sand: "smooth-rock", snow: "icy-rock", hail: "icy-rock",
  "harsh-sun": "", "heavy-rain": "", "strong-winds": "",
};
const SCREEN_LABEL = { reflect: "Reflect", lightScreen: "Light Screen", auroraVeil: "Aurora Veil" } as const;
const STAGE_KEYS: StageKey[] = ["atk", "def", "spa", "spd", "spe", "acc", "eva"];

const zeroStages = (): Record<StageKey, number> => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });
const newVolatile = (): Volatile => ({
  confusion: 0, leechSeed: false, substitute: 0, taunt: 0, yawn: 0, trap: 0, ingrain: false, aquaRing: false,
  cursed: false, flinch: false, protect: null, protectCount: 0, endure: false, destinyBond: false,
  focusEnergy: false, charging: null, semi: false, recharge: false, rampage: null, flashFire: false,
  lockedMove: null, roosted: false, hitPhysical: 0, hitSpecial: 0, lastMove: null, lastIndex: -1,
  encore: null, disable: null, torment: false, healBlock: 0, perish: 0, infatuated: false, nightmare: false,
  noSwitch: false, lockOn: false, levitate: 0, smackedDown: false, identified: false, electrified: false,
  powdered: false, magicCoat: false, charged: false, loafing: false, berry: null, dynamax: 0, gasSaved: null,
  bide: null, stockpile: 0, laserFocus: 0, octolock: false, snatch: false, imprisoned: [], grudge: false,
  lastItem: null, embargo: 0, itemSaved: null, gmaxDot: null, glaive: false, hitsTaken: 0, saltCure: false,
});

export const stageMult = (stage: number) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));
const accStageMult = (stage: number) => (stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage));

export function defTypes(m: Mon): string[] {
  if (!m.v.roosted) return m.types;
  const t = m.types.filter((x) => x !== "flying");
  return t.length > 0 ? t : ["normal"];
}
export function isGrounded(s: BattleState, m: Mon): boolean {
  if (s.field.gravity > 0 || m.v.smackedDown) return true;
  if (m.item === "air-balloon" || (m.ability === "levitate" || m.ability === "eelevate") || m.v.levitate > 0) return false;
  return !defTypes(m).includes("flying");
}
export function weatherActive(s: BattleState): Weather | null {
  if (!s.field.weather) return null;
  for (const side of [0, 1] as const) {
    const m = activeMon(s, side);
    if (!m.fainted && (m.ability === "cloud-nine" || m.ability === "air-lock")) return null;
  }
  return s.field.weather;
}
const baseWx = (s: BattleState) => wxBase(weatherActive(s));

export function effSpeedOf(s: BattleState, m: Mon, side: SideIndex): number {
  let v = m.stats.spe * stageMult(m.stages.spe) * AB.speedMult(m, baseWx(s), s.field.terrain);
  if (m.status === "par" && m.ability !== "quick-feet") v *= 0.5;
  if (s.sides[side].tailwind > 0) v *= 2;
  return Math.max(1, Math.floor(v));
}

function statValue(s: BattleState, m: Mon, key: StatKey5, stage: number): number {
  const w = baseWx(s);
  let v = m.stats[key] * stageMult(stage) * AB.statMult(m, key, w, s.field.terrain);
  if (w === "sand" && key === "spd" && defTypes(m).includes("rock")) v *= 1.5;
  if (w === "snow" && key === "def" && defTypes(m).includes("ice")) v *= 1.5;
  return Math.floor(v);
}

export const toStageKey = (name: string): StageKey | null =>
  ({ attack: "atk", defense: "def", "special-attack": "spa", "special-defense": "spd", speed: "spe", accuracy: "acc", evasion: "eva" } as Record<string, StageKey>)[name] ?? null;
export const targetsSelf = (m: BattleMoveData) => m.target === "user" || m.target === "user-or-ally" || m.target === "users-field";
const isChoice = (item: string | null) => item !== null && item.startsWith("choice-");
const weightOf = (m: Mon) => m.data.weight * (m.ability === "heavy-metal" ? 2 : m.ability === "light-metal" ? 0.5 : 1);

export const STRUGGLE: BattleMoveData = {
  id: 0, name: "struggle", type: "typeless", damage_class: "physical", power: 50, accuracy: null, pp: 1,
  priority: 0, category: "damage", ailment: "none", ailment_chance: 0, stat_chance: 0, stat_changes: [],
  target: "selected-pokemon", drain: 0, healing: 0, flinch_chance: 0, crit_rate: 0, min_hits: null, max_hits: null,
};

export function statusFromAilment(m: BattleMoveData): Status | null {
  switch (m.ailment) {
    case "paralysis": return "par";
    case "burn": return "brn";
    case "freeze": return "frz";
    case "sleep": return "slp";
    case "poison": return ["toxic", "poison-fang", "malignant-chain"].includes(m.name) ? "tox" : "psn";
    default: return null;
  }
}

export function avgHits(m: BattleMoveData): number {
  const lo = m.min_hits ?? 1, hi = m.max_hits ?? 1;
  return lo === hi ? lo : lo === 2 && hi === 5 ? 3.1 : (lo + hi) / 2;
}
function rollHits(m: BattleMoveData, att: Mon, rng: Rng): number {
  const lo = m.min_hits ?? 1, hi = m.max_hits ?? 1;
  if (lo === hi) return lo;
  if (lo === 2 && hi === 5) {
    if (att.ability === "skill-link") return 5;
    const r = rng();
    return r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5;
  }
  return lo + Math.floor(rng() * (hi - lo + 1));
}
const CRIT = [1 / 24, 1 / 8, 1 / 2, 1];
const hasSecondary = (m: BattleMoveData) =>
  m.damage_class !== "status" && (m.category === "damage-ailment" || m.category === "damage-lower" || m.flinch_chance > 0);

// ---------------------------------------------------------------
// Golpes transformados (Dynamax)
// ---------------------------------------------------------------
/** O golpe que realmente será usado (Max Move enquanto estiver em Dynamax). */
export function effMove(m: Mon, move: BattleMoveData): BattleMoveData {
  if (m.v.dynamax <= 0) return move;
  if (move.damage_class === "status") return { ...move, name: "max-guard", target: "user", category: "unique", accuracy: null };
  const mx = MAX_MOVES[move.type] ?? NORMAL_MAX;
  const g = m.flags.gmax ? GMAX_MOVES[m.data.species] : undefined;
  const gm = g && g.type === move.type ? g : undefined;
  const power = gm && ["gmax-drum-solo", "gmax-fireball", "gmax-hydrosnipe"].includes(gm.name) ? 160 : maxPower(move.power ?? 90, move.type);
  return {
    ...move, name: gm ? gm.name : mx.name, power, accuracy: null, category: "damage",
    ailment: "none", ailment_chance: 0, stat_chance: 0, stat_changes: [], drain: 0, healing: 0,
    flinch_chance: 0, crit_rate: 0, min_hits: null, max_hits: null, priority: 0,
  };
}

function zVersion(m: BattleMoveData): BattleMoveData {
  if (m.damage_class === "status") return m;
  return {
    ...m, name: Z_MOVE_NAMES[m.type] ?? "z-move", power: zPower(m.power ?? 100), accuracy: null,
    category: "damage", ailment: "none", ailment_chance: 0, stat_chance: 0, stat_changes: [],
    drain: 0, flinch_chance: 0, min_hits: null, max_hits: null, crit_rate: 0,
  };
}

// ---------------------------------------------------------------
// Dano
// ---------------------------------------------------------------
function resolveType(s: BattleState, att: Mon, move: BattleMoveData): string {
  const spec = specOf(move);
  if (att.v.electrified) return "electric";
  if (spec.power === "weatherBall") { const w = weatherActive(s); return w ? WEATHER_BALL_TYPE[w] : "normal"; }
  if (spec.teraBlast && att.tera) return att.tera;
  const ng = spec.power === "naturalGift" && att.item ? NATURAL_GIFT[att.item] : undefined;
  if (ng) return ng[0];
  let t = att.ability === "liquid-voice" && AB_SOUND(move) ? "water" : effectiveMoveType(move.type, att.ability);
  if (s.field.ionDeluge && t === "normal") t = "electric";
  return t;
}

const AB_SOUND = (m: BattleMoveData) => ["boomburst", "hyper-voice", "disarming-voice", "sparkling-aria", "snarl", "bug-buzz", "round", "echoed-voice", "uproar", "relic-song", "chatter", "overdrive", "torch-song", "alluring-voice", "noble-roar", "growl", "screech", "sing", "supersonic", "roar", "metal-sound", "confide", "howl", "eerie-spell", "clanging-scales"].includes(m.name);

function typeEffect(s: BattleState, att: Mon, def: Mon, type: string): number {
  if (type === "stellar") return def.tera ? 2 : 1;
  let types = defTypes(def);
  if ((def.v.identified || att.ability === "scrappy" || att.ability === "minds-eye") && (type === "normal" || type === "fighting")) {
    types = types.filter((t) => t !== "ghost");
  }
  const grounding = type === "ground" && (s.field.gravity > 0 || def.v.smackedDown);
  if (grounding) types = types.filter((t) => t !== "flying");
  const winds = weatherActive(s) === "strong-winds";
  let base = 1;
  for (const t of types) {
    let m = CHART.get(`${type}>${t}`) ?? 1;
    if (winds && t === "flying" && m > 1) m = 1;
    base *= m;
  }
  const ignore = AB.ignoresAbility(att);
  return defenseAdjust(
    {
      ability: ignore || (grounding && (def.ability === "levitate" || def.ability === "eelevate")) ? null : def.ability,
      item: grounding && def.item === "air-balloon" ? null : def.item,
    },
    type, base
  );
}
export const moveEffectiveness = (s: BattleState, att: Mon, def: Mon, move: BattleMoveData) =>
  typeEffect(s, att, def, resolveType(s, att, move));

function stab(att: Mon, type: string): number {
  const has = att.baseTypes.includes(type);
  if (att.tera === "stellar") return !att.stellarUsed.includes(type) ? (has ? 2 : 1.2) : has ? 1.5 : 1;
  if (att.tera === type) return has ? 2 : 1.5;
  return has ? (att.ability === "adaptability" ? 2 : 1.5) : 1;
}

const positiveStages = (m: Mon) => Object.values(m.stages).reduce((n, v) => n + Math.max(0, v), 0);

function basePower(
  s: BattleState, att: Mon, attSide: SideIndex, def: Mon, defSide: SideIndex, move: BattleMoveData, spec: MoveSpec, hit: number
): number {
  const bp = move.power ?? spec.bp ?? 0;
  switch (spec.power) {
    case "weight": { const kg = weightOf(def); return kg < 10 ? 20 : kg < 25 ? 40 : kg < 50 ? 60 : kg < 100 ? 80 : kg < 200 ? 100 : 120; }
    case "weightRatio": { const r = weightOf(att) / Math.max(0.1, weightOf(def)); return r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40; }
    case "gyro": return Math.min(150, Math.floor((25 * effSpeedOf(s, def, defSide)) / effSpeedOf(s, att, attSide)) + 1);
    case "electro": { const r = effSpeedOf(s, att, attSide) / effSpeedOf(s, def, defSide); return r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40; }
    case "hpProp": return Math.max(1, Math.floor((150 * att.hp) / att.maxHp));
    case "flail": { const p = Math.floor((48 * att.hp) / att.maxHp); return p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20; }
    case "return": return 102;
    case "hex": return def.status ? bp * 2 : bp;
    case "venoshock": return def.status === "psn" || def.status === "tox" ? bp * 2 : bp;
    case "facade": return att.status && att.status !== "frz" && att.status !== "slp" ? bp * 2 : bp;
    case "acrobatics": return att.item ? bp : bp * 2;
    case "knockoff": return def.item ? bp * 1.5 : bp;
    case "brine": return def.hp * 2 <= def.maxHp ? bp * 2 : bp;
    case "weatherBall": return weatherActive(s) ? bp * 2 : bp;
    case "stored": return 20 + 20 * positiveStages(att);
    case "punish": return Math.min(200, 60 + 20 * positiveStages(def));
    case "wring": return Math.max(1, Math.floor((120 * def.hp) / def.maxHp));
    case "triple": return bp * (hit + 1);
    case "firstMover": return s.moved[defSide] ? bp : bp * 2;
    case "magnitude": return 70;
    case "fling": return att.item ? (FLING_POWER[att.item] ?? 30) : 0;
    case "payback": return s.moved[defSide] ? bp * 2 : bp;
    case "revenge": return att.v.hitPhysical + att.v.hitSpecial > 0 ? bp * 2 : bp;
    case "assurance": return def.v.hitPhysical + def.v.hitSpecial > 0 ? bp * 2 : bp;
    case "smelling": return def.status === "par" ? bp * 2 : bp;
    case "wakeup": return def.status === "slp" ? bp * 2 : bp;
    case "spitUp": return 100 * att.v.stockpile;
    case "trumpCard": { const pp = att.ppLeft[att.v.lastIndex] ?? 0; return pp >= 4 ? 40 : pp === 3 ? 50 : pp === 2 ? 60 : pp === 1 ? 80 : 200; }
    case "naturalGift": return att.item ? (NATURAL_GIFT[att.item]?.[1] ?? 0) : 0;
    case "hardPress": return Math.max(1, Math.floor((100 * def.hp) / def.maxHp));
    case "lastRespects": return 50 + 50 * s.sides[attSide].team.filter((m) => m.fainted).length;
    case "rageFist": return 50 + 50 * Math.min(6, att.v.hitsTaken);
    default: return bp;
  }
}

export interface DmgResult { min: number; max: number; eff: number; type: string }

export function calcDamageBetween(
  s: BattleState, att: Mon, attSide: SideIndex, def: Mon, defSide: SideIndex,
  move: BattleMoveData, o: { crit?: boolean; hit?: number; z?: boolean; power?: number } = {}
): DmgResult {
  const spec = specOf(move);
  const type = resolveType(s, att, move);
  const ignore = AB.ignoresAbility(att);
  const eff = typeEffect(s, att, def, type);
  const none = { min: 0, max: 0, eff, type };
  if (eff === 0) return none;

  const w = att.ability === "mega-sol" ? "sun" : baseWx(s);
    let power = o.power ?? (o.z ? zPower(move.power ?? 100) : basePower(s, att, attSide, def, defSide, move, spec, o.hit ?? 0));
  if (power <= 0) return none;

  if (w === "sun") power *= type === "fire" ? 1.5 : type === "water" ? (move.name === "hydro-steam" ? 1.5 : 0.5) : 1; type === "fire" ? 1.5 : type === "water" ? 0.5 : 1;
  if (w === "rain") power *= type === "water" ? 1.5 : type === "fire" ? 0.5 : 1;
  if ((move.name === "solar-beam" || move.name === "solar-blade") && w && w !== "sun") power *= 0.5;
  const t = s.field.terrain;
  if (t && isGrounded(s, att) && TERRAIN_TYPE[t] === type && t !== "misty") power *= 1.3;
  if (t === "misty" && type === "dragon" && isGrounded(s, def)) power *= 0.5;
  if (t === "grassy" && isGrounded(s, def) && ["earthquake", "bulldoze", "magnitude"].includes(move.name)) power *= 0.5;
  if (s.field.mudSport > 0 && type === "electric") power /= 3;
  if (s.field.waterSport > 0 && type === "fire") power /= 3;
  if (att.tera === type && power < 60 && move.priority <= 0) power = 60;
  if (move.name === "psyblade" && s.field.terrain === "electric") power *= 1.5;

  const auras = [att, def];
  if (auras.some((m) => m.ability === "dark-aura") && type === "dark") power *= auras.some((m) => m.ability === "aura-break") ? 0.75 : 1.33;
  if (auras.some((m) => m.ability === "fairy-aura") && type === "fairy") power *= auras.some((m) => m.ability === "aura-break") ? 0.75 : 1.33;

  power *= AB.powerMult(att, move, type, {
    weather: w, movedLast: s.moved[defSide], converted: type !== move.type, hasSecondary: hasSecondary(move), power,
  });
  if (att.item && TYPE_BOOST_ITEMS[att.item] === type) power *= 1.2;
  power = Math.max(1, Math.floor(power));

  let physical = move.damage_class === "physical";
  if (spec.teraBlast && att.tera) physical = att.stats.atk >= att.stats.spa;
  let atkOwner = att;
  let atkKey: StatKey5 = physical ? "atk" : "spa";
  if (spec.attacks === "def") atkKey = "def";
  if (spec.attacks === "foe-atk") { atkOwner = def; atkKey = "atk"; }
  let defKey: StatKey5 = spec.defends === "def" ? "def" : physical ? "def" : "spd";
  if (s.field.wonderRoom > 0) defKey = defKey === "def" ? "spd" : "def";

  let aStage = atkOwner.stages[atkKey];
  let dStage = def.stages[defKey];
  if (!ignore && def.ability === "unaware") aStage = 0;
  if (att.ability === "unaware") dStage = 0;
  if (o.crit) { aStage = Math.max(0, aStage); dStage = Math.min(0, dStage); }

  let A = statValue(s, atkOwner, atkKey, aStage);
  let D = Math.max(1, statValue(s, def, defKey, dStage));
  if (def.ability === "tablets-of-ruin" && atkKey === "atk") A *= 0.75;
  if (def.ability === "vessel-of-ruin" && atkKey === "spa") A *= 0.75;
  if (att.ability === "sword-of-ruin" && defKey === "def") D *= 0.75;
  if (att.ability === "beads-of-ruin" && defKey === "spd") D *= 0.75;

  let base = Math.floor(Math.floor(((Math.floor((2 * att.data.level) / 5) + 2) * power * A) / D) / 50) + 2;
  if (o.crit) base = Math.floor(base * AB.critMult(att));

  let mod = stab(att, type) * eff;
  if (spec.seBoost && eff > 1) mod *= spec.seBoost;
  if (def.v.glaive) mod *= 2;
  if (att.ability === "stakeout" && s.lastWasSwitch[defSide]) mod *= 2;
  if (att.status === "brn" && physical && att.ability !== "guts" && move.name !== "facade") mod *= 0.5;
  const sc = s.sides[defSide].screens;
  if (!o.crit && att.ability !== "infiltrator" && (sc.auroraVeil > 0 || (physical && sc.reflect > 0) || (!physical && sc.lightScreen > 0))) mod *= 0.5;
  mod *= AB.defenderDamageMult(def, att, move, eff, ignore) * AB.attackerDamageMult(att, eff);
  if (att.item === "life-orb") mod *= 1.3;
  if (att.item === "expert-belt" && eff > 1) mod *= 1.2;

  const calc = (roll: number) => Math.max(1, Math.floor(Math.floor(base * roll) * mod));
  return { min: calc(0.85), max: calc(1), eff, type };
}

export function fixedDamage(att: Mon, def: Mon, rule: NonNullable<MoveSpec["fixed"]>, rng: Rng): number {
  switch (rule) {
    case "level": return att.data.level;
    case "half": return Math.max(1, Math.floor(def.hp / 2));
    case "endeavor": return Math.max(0, def.hp - att.hp);
    case "psywave": return Math.max(1, Math.floor(att.data.level * (rng() + 0.5)));
    case "gambit": return att.hp;
    case "threeQuarters": return Math.max(1, Math.floor((def.hp * 3) / 4));
    default: return rule;
  }
}

// ---------------------------------------------------------------
// Criação
// ---------------------------------------------------------------
export function createMon(data: BattleMonData): Mon {
  return {
    data, species: data.species, types: [...data.types], baseTypes: [...data.types],
    ability: data.ability, item: data.item, stats: { ...data.stats },
    hp: data.stats.hp, maxHp: data.stats.hp, baseMaxHp: data.stats.hp, status: null, toxCount: 0, sleepLeft: 0,
    stages: zeroStages(), ppLeft: data.moves.map((m) => m.pp), turnsOut: 0, fainted: false,
    tera: null, stellarUsed: [], mega: false, flags: {}, original: null, v: newVolatile(),
  };
}

const newSide = (mons: BattleMonData[]): SideState => ({
  team: mons.map(createMon), active: 0,
  hazards: { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false },
  screens: { reflect: 0, lightScreen: 0, auroraVeil: 0 }, tailwind: 0, safeguard: 0, mist: 0, luckyChant: 0,
  wish: null, futureSight: null, healingWish: false,
  gimmicks: { mega: false, tera: false, z: false, dynamax: false },
});

export function createBattle(teams: [BattleMonData[], BattleMonData[]]): { state: BattleState; log: string[] } {
  const state: BattleState = {
    turn: 0, sides: [newSide(teams[0]), newSide(teams[1])],
    field: {
      weather: null, weatherTurns: 0, terrain: null, terrainTurns: 0, trickRoom: 0, gravity: 0, mudSport: 0,
      waterSport: 0, magicRoom: 0, wonderRoom: 0, ionDeluge: false, fairyLock: 0,
    },
    pending: [false, false], pivot: null, baton: null, passSub: 0, moved: [false, false],
    lastWasSwitch: [false, false], lastMoveUsed: null, winner: null, ctx: null,
  };
  const log: string[] = [];
  for (const side of [0, 1] as const) log.push(`${SIDE_LABEL[side]} enviou ${monName(activeMon(state, side))}!`);
  for (const side of [0, 1] as const) entryAbility(state, side, new Rng0(), log);
  syncGas(state);
  return { state, log };
}
class Rng0 { }

// ---------------------------------------------------------------
// Ações legais
// ---------------------------------------------------------------
export function usableMoves(m: Mon): number[] {
  if (m.v.charging !== null) return [m.v.charging];
  if (m.v.rampage) return [m.v.rampage.index];
  if (m.v.encore && (m.ppLeft[m.v.encore.index] ?? 0) > 0) return [m.v.encore.index];
  const blockStatus = (m.v.taunt > 0 || m.item === "assault-vest") && m.v.dynamax <= 0;
  const idx: number[] = [];
  m.data.moves.forEach((mv, i) => {
    if (!isSupported(mv) || (m.ppLeft[i] ?? 0) <= 0) return;
    if (blockStatus && mv.damage_class === "status") return;
    if (m.v.disable && m.v.disable.index === i) return;
    if (m.v.torment && m.v.lastIndex === i) return;
    if (m.v.imprisoned.includes(mv.name)) return;
    idx.push(i);
  });
  if (m.v.lockedMove !== null && idx.includes(m.v.lockedMove)) return [m.v.lockedMove];
  return idx;
}

export function canSwitch(s: BattleState, side: SideIndex): boolean {
  const m = activeMon(s, side);
  const foe = activeMon(s, otherSide(side));
  if (s.field.fairyLock > 0) return false;
  if (m.v.charging !== null || m.v.rampage || m.v.ingrain || m.v.recharge) return false;
  if (defTypes(m).includes("ghost") || m.item === "shed-shell") return true;
  if (m.v.trap > 0 || m.v.noSwitch) return false;
  if (!foe.fainted && m.ability !== "shadow-tag") {
    if (foe.ability === "shadow-tag") return false;
    if (foe.ability === "arena-trap" && isGrounded(s, m)) return false;
    if (foe.ability === "magnet-pull" && defTypes(m).includes("steel")) return false;
  }
  return true;
}

export function legalActions(s: BattleState, side: SideIndex): Action[] {
  const me = activeMon(s, side);
  const acts: Action[] = [];
  const usable = usableMoves(me);
  if (usable.length === 0 || me.v.recharge) acts.push({ kind: "move", index: -1 });
  else for (const i of usable) acts.push({ kind: "move", index: i });
  if (canSwitch(s, side)) {
    s.sides[side].team.forEach((m, i) => { if (!m.fainted && i !== s.sides[side].active) acts.push({ kind: "switch", to: i }); });
  }
  return acts;
}

/** Cada Pokémon só pode usar UMA mecânica (Mega, Tera, Dynamax/Gigantamax ou Z) por batalha. */
export const hasGimmick = (m: Mon) =>
  m.mega || m.tera !== null || m.v.dynamax > 0 || !!m.flags.dynamaxed || !!m.flags.zUsed;

export const canMega = (s: BattleState, side: SideIndex) => {
  const m = activeMon(s, side);
  return !m.fainted && !hasGimmick(m) && m.data.mega !== null && !s.sides[side].gimmicks.mega;
};
export const canTera = (s: BattleState, side: SideIndex) => {
  const m = activeMon(s, side);
  return !m.fainted && !hasGimmick(m) && !s.sides[side].gimmicks.tera;
};
export const canDynamax = (s: BattleState, side: SideIndex) => {
  const m = activeMon(s, side);
  return !m.fainted && !hasGimmick(m) && !s.sides[side].gimmicks.dynamax;
};
export const canGigantamax = (s: BattleState, side: SideIndex) => {
  const m = activeMon(s, side);
  return canDynamax(s, side) && m.data.gmax !== null && !!GMAX_MOVES[m.data.species];
};
export const canZ = (s: BattleState, side: SideIndex, index: number) => {
  const m = activeMon(s, side);
  if (m.fainted || hasGimmick(m) || s.sides[side].gimmicks.z || !m.item || index < 0) return false;
  const crystal = Z_CRYSTALS[m.item];
  const mv = m.data.moves[index];
  return !!crystal && !!mv && mv.type === crystal && isSupported(mv);
};

// ---------------------------------------------------------------
// Efeitos básicos
// ---------------------------------------------------------------
function hurt(m: Mon, amount: number): { dealt: number; fainted: boolean } {
  const dealt = Math.min(m.hp, Math.max(0, Math.floor(amount)));
  m.hp -= dealt;
  const fainted = m.hp <= 0 && !m.fainted;
  if (fainted) m.fainted = true;
  return { dealt, fainted };
}
function heal(m: Mon, amount: number): number {
  if (m.v.healBlock > 0) return 0;
  const before = m.hp;
  m.hp = Math.min(m.maxHp, m.hp + Math.max(0, Math.floor(amount)));
  return m.hp - before;
}
function checkWinner(s: BattleState, loserHint: SideIndex): void {
  const d0 = s.sides[0].team.every((m) => m.fainted);
  const d1 = s.sides[1].team.every((m) => m.fainted);
  if (d0 && d1) s.winner = otherSide(loserHint);
  else if (d0) s.winner = 1;
  else if (d1) s.winner = 0;
}
function announceFaint(s: BattleState, side: SideIndex, m: Mon, log: string[]): void {
  log.push(`${monName(m)} desmaiou!`);
  checkWinner(s, side);
  syncGas(s);
  for (const sd of [0, 1] as const) {
    const o = activeMon(s, sd);
    if (o !== m && !o.fainted && o.ability === "soul-heart") changeStage(s, o, "spa", 1, log, null);
  }
}
function eatBerry(m: Mon, log: string[]): void {
  const b = m.item;
  if (!b) return;
  m.item = null;
  m.v.berry = b;
  m.v.lastItem = b;
  m.flags.ateBerry = true;
  if (b === "sitrus-berry") heal(m, m.maxHp * (m.ability === "ripen" ? 0.5 : 0.25));
  else if (b === "lum-berry") m.status = null;
  log.push(`${monName(m)} comeu a ${pretty(b)}!`);
  if (m.ability === "cheek-pouch") heal(m, m.maxHp / 3);
}

function changeStage(s: BattleState, t: Mon, key: StageKey, delta: number, log: string[], source: Mon | null): boolean {
  let d = delta;
  if (t.ability === "contrary") d = -d;
  else if (t.ability === "simple") d *= 2;
  const foeMade = source !== null && source !== t;
  if (d < 0 && foeMade) {
    if (t.ability === "mirror-armor" && source) { log.push(`${monName(t)} refletiu a queda de status!`); return changeStage(s, source, key, d, log, null); }
    if (AB.blocksDrop(t, key) || s.sides[sideOf(s, t)].mist > 0) { log.push(`${monName(t)} não perdeu ${STAGE_LABEL[key]}!`); return false; }
  }
  const before = t.stages[key];
  const after = clamp(before + d, -6, 6);
  if (after === before) { log.push(`${STAGE_LABEL[key]} de ${monName(t)} não pode ${d > 0 ? "subir" : "cair"} mais!`); return false; }
  t.stages[key] = after;
  log.push(`${STAGE_LABEL[key]} de ${monName(t)} ${d > 0 ? "subiu" : "caiu"}${Math.abs(d) >= 2 ? " bastante" : ""}!`);
  if (d < 0 && foeMade) {
    if (t.ability === "defiant") changeStage(s, t, "atk", 2, log, null);
    if (t.ability === "competitive") changeStage(s, t, "spa", 2, log, null);
  }
  return true;
}

export function canInflict(s: BattleState, t: Mon, st: Status, foeMade = false, src?: Mon): boolean {
  if (t.fainted || t.status) return false;
  if (foeMade && s.sides[sideOf(s, t)].safeguard > 0) return false;
  const ty = defTypes(t);
  if (st === "brn" && ty.includes("fire")) return false;
  if (st === "par" && ty.includes("electric")) return false;
  if (st === "frz" && (ty.includes("ice") || baseWx(s) === "sun")) return false;
  if ((st === "psn" || st === "tox") && (ty.includes("poison") || ty.includes("steel")) && src?.ability !== "corrosion") return false;
  return !AB.blocksStatus(t, st, s.field.terrain, isGrounded(s, t), baseWx(s));
}

function inflict(s: BattleState, t: Mon, st: Status, rng: Rng, log: string[], source: Mon | null = null): void {
  t.status = st;
  if (st === "slp") t.sleepLeft = t.ability === "early-bird" ? 0 : 1 + Math.floor(rng() * 3);
  if (st === "tox") t.toxCount = 1;
  log.push(`${monName(t)} ${STATUS_MSG[st]}`);
  if (t.item === "lum-berry") eatBerry(t, log);
  else if (source && t.ability === "synchronize" && ["par", "brn", "psn", "tox"].includes(st) && canInflict(s, source, st)) inflict(s, source, st, rng, log, null);
}

function confuse(s: BattleState, t: Mon, rng: Rng, log: string[]): boolean {
  if (t.fainted || t.v.confusion > 0 || t.ability === "own-tempo" || s.sides[sideOf(s, t)].safeguard > 0) return false;
  if (s.field.terrain === "misty" && isGrounded(s, t)) return false;
  t.v.confusion = 2 + Math.floor(rng() * 4);
  log.push(`${monName(t)} ficou confuso!`);
  return true;
}

function setWeather(s: BattleState, w: Weather, setter: Mon, log: string[]): boolean {
  const cur = s.field.weather;
  if (cur === w || (cur && isPermanentWeather(cur) && !isPermanentWeather(w))) return false;
  s.field.weather = w;
  s.field.weatherTurns = isPermanentWeather(w) ? 9999 : setter.item === WEATHER_ROCK[w] ? 8 : 5;
  log.push(WEATHER_MSG[w]);
  return true;
}
function setTerrain(s: BattleState, t: Terrain, setter: Mon, log: string[]): boolean {
  if (s.field.terrain === t) return false;
  s.field.terrain = t;
  s.field.terrainTurns = setter.item === "terrain-extender" ? 8 : 5;
  log.push(TERRAIN_MSG[t]);
  for (const side of [0, 1] as const) {
    const m = activeMon(s, side);
    if (m.ability === "mimicry" && !m.fainted) { m.types = [TERRAIN_TYPE[t]]; log.push(`${monName(m)} mudou de tipo!`); }
  }
  return true;
}

const PERMA_ABILITY = AB.PERMANENT_ABILITY;
function checkPermanentWeather(s: BattleState, log: string[]): void {
  const w = s.field.weather;
  if (!w || !isPermanentWeather(w)) return;
  const need = PERMA_ABILITY[w];
  const held = ([0, 1] as const).some((side) => { const m = activeMon(s, side); return !m.fainted && m.ability === need; });
  if (!held) { log.push(WEATHER_END[w]); s.field.weather = null; }
}

/** Neutralizing Gas suspende a habilidade do adversário enquanto estiver em campo. */
function syncGas(s: BattleState): void {
  for (const side of [0, 1] as const) {
    const gas = activeMon(s, side);
    const other = activeMon(s, otherSide(side));
    if (!gas.fainted && gas.ability === "neutralizing-gas" && other.ability !== null && other.ability !== "neutralizing-gas" && !other.v.gasSaved) {
      other.v.gasSaved = { ability: other.ability };
      other.ability = null;
    }
  }
  for (const side of [0, 1] as const) {
    const m = activeMon(s, side);
    const foe = activeMon(s, otherSide(side));
    if (m.v.gasSaved && !(!foe.fainted && foe.ability === "neutralizing-gas")) {
      m.ability = m.v.gasSaved.ability;
      m.v.gasSaved = null;
    }
  }
}

function transformInto(me: Mon, foe: Mon, log: string[]): boolean {
  if (me.original || foe.original || me.v.dynamax > 0) return false;
  me.original = { data: me.data, species: me.species, types: [...me.types], baseTypes: [...me.baseTypes], ability: me.ability, stats: { ...me.stats }, ppLeft: [...me.ppLeft] };
  me.species = foe.species;
  me.types = [...foe.types];
  me.baseTypes = [...foe.baseTypes];
  me.ability = foe.ability;
  me.stats = { ...foe.stats, hp: me.stats.hp };
  me.stages = { ...foe.stages };
  me.data = { ...me.data, weight: foe.data.weight, moves: foe.data.moves.map((m) => ({ ...m, pp: 5 })) };
  me.ppLeft = foe.data.moves.map(() => 5);
  log.push(`${monName(me)} se transformou em ${pretty(foe.species)}!`);
  return true;
}

// ---------------------------------------------------------------
// Entrada em campo
// ---------------------------------------------------------------
function entryAbility(s: BattleState, side: SideIndex, rng: Rng | Rng0, log: string[]): void {
  const me = activeMon(s, side);
  const foe = activeMon(s, otherSide(side));
  if (me.fainted) return;
  const w = AB.weatherFromAbility(me.ability);
  if (w) setWeather(s, w, me, log);
  const t = AB.terrainFromAbility(me.ability);
  if (t) setTerrain(s, t, me, log);
  if (me.ability === "mimicry" && s.field.terrain) me.types = [TERRAIN_TYPE[s.field.terrain]];
  if (me.ability === "screen-cleaner") for (const sd of [0, 1] as const) s.sides[sd].screens = { reflect: 0, lightScreen: 0, auroraVeil: 0 };
  if (me.ability === "intrepid-sword" && !me.flags.intrepid) { me.flags.intrepid = true; changeStage(s, me, "atk", 1, log, null); }
  if (me.ability === "dauntless-shield" && !me.flags.dauntless) { me.flags.dauntless = true; changeStage(s, me, "def", 1, log, null); }
  if (foe.fainted) return;
  if (me.ability === "supersweet-syrup" && !me.flags.syrup) { me.flags.syrup = true; changeStage(s, foe, "eva", -1, log, me); }
  if (me.ability === "intimidate") {
    if (foe.ability === "guard-dog") changeStage(s, foe, "atk", 1, log, null);
    else if (!AB.blocksIntimidate(foe)) { log.push(`${monName(me)} intimidou ${monName(foe)}!`); changeStage(s, foe, "atk", -1, log, me); }
  }
  if (me.ability === "download") changeStage(s, me, foe.stats.def < foe.stats.spd ? "atk" : "spa", 1, log, null);
  if (me.ability === "imposter") transformInto(me, foe, log);
  if (me.ability === "trace" && foe.ability && !["trace", "multitype", "illusion", "neutralizing-gas"].includes(foe.ability)) {
    me.ability = foe.ability;
    log.push(`${monName(me)} copiou a habilidade ${pretty(foe.ability)}!`);
    entryAbility(s, side, rng, log);
  }
}

function hazardHurt(s: BattleState, side: SideIndex, m: Mon, amount: number, msg: string, log: string[]): void {
  if (m.ability === "magic-guard") return;
  const r = hurt(m, Math.max(1, amount));
  log.push(`${monName(m)} ${msg}`);
  if (r.fainted) announceFaint(s, side, m, log);
}

function applyHazards(s: BattleState, side: SideIndex, m: Mon, rng: Rng, log: string[]): void {
  const h = s.sides[side].hazards;
  if (m.item === "heavy-duty-boots" || m.fainted) return;
  if (h.stealthRock) {
    hazardHurt(s, side, m, (m.maxHp * typeMult("rock", defTypes(m))) / 8, "foi ferido pelas pedras pontiagudas!", log);
    if (m.fainted) return;
  }
  if (!isGrounded(s, m)) return;
  if (h.spikes > 0) {
    hazardHurt(s, side, m, m.maxHp * ([0, 1 / 8, 1 / 6, 1 / 4][h.spikes] ?? 1 / 4), "foi ferido pelos espinhos!", log);
    if (m.fainted) return;
  }
  if (h.toxicSpikes > 0) {
    if (defTypes(m).includes("poison")) { h.toxicSpikes = 0; log.push(`${monName(m)} absorveu os Toxic Spikes!`); }
    else { const st: Status = h.toxicSpikes >= 2 ? "tox" : "psn"; if (canInflict(s, m, st)) inflict(s, m, st, rng, log); }
  }
  if (h.stickyWeb) changeStage(s, m, "spe", -1, log, null);
}

function endDynamax(m: Mon, log: string[]): void {
  if (m.v.dynamax <= 0 && m.maxHp === m.baseMaxHp) return;
  const ratio = m.hp / m.maxHp;
  m.maxHp = m.baseMaxHp;
  m.hp = m.fainted ? 0 : Math.max(1, Math.ceil(ratio * m.maxHp));
  m.v.dynamax = 0;
  m.flags.gmax = false;
  log.push(`${monName(m)} voltou ao tamanho normal.`);
}

function doSwitch(s: BattleState, side: SideIndex, to: number, rng: Rng, log: string[]): void {
  const st = s.sides[side];
  const out = at(st.team, st.active);
  if (!out.fainted) {
    log.push(`${SIDE_LABEL[side]} chamou ${monName(out)} de volta!`);
    if (out.ability === "natural-cure" || out.v.gasSaved?.ability === "natural-cure") out.status = null;
    if (out.ability === "regenerator" || out.v.gasSaved?.ability === "regenerator") heal(out, out.maxHp / 3);
  }
  if (out.v.dynamax > 0 || out.maxHp !== out.baseMaxHp) endDynamax(out, log);
  activeMon(s, otherSide(side)).v.noSwitch = false;
  activeMon(s, otherSide(side)).v.imprisoned = [];
  if (out.original) {
    const o = out.original;
    out.data = o.data; out.species = o.species; out.types = o.types; out.baseTypes = o.baseTypes;
    out.ability = o.ability; out.stats = o.stats; out.ppLeft = o.ppLeft; out.original = null;
  } else {
    out.ability = out.mega && out.data.mega ? out.data.mega.ability : out.data.ability;
    out.types = out.tera && out.tera !== "stellar" ? [out.tera] : [...out.baseTypes];
    out.stats = { ...(out.mega && out.data.mega ? out.data.mega.stats : out.data.stats) };
  }
  out.v = newVolatile();
  restoreItem(out);
  out.stages = zeroStages();
  out.toxCount = out.status === "tox" ? 1 : 0;

  st.active = to;
  const inc = at(st.team, to);
  inc.turnsOut = 0;
  inc.toxCount = inc.status === "tox" ? 1 : 0;
  log.push(`${SIDE_LABEL[side]} enviou ${monName(inc)}!`);
  if (s.field.magicRoom > 0) suppressItem(inc);
  if (st.healingWish) {
    st.healingWish = false;
    inc.hp = inc.maxHp;
    inc.status = null;
    log.push(`${monName(inc)} foi curado pelo desejo!`);
  }
  applyHazards(s, side, inc, rng, log);
  if (!inc.fainted) entryAbility(s, side, rng, log);
  syncGas(s);
  checkPermanentWeather(s, log);
}

function benchCount(s: BattleState, side: SideIndex): number {
  const st = s.sides[side];
  return st.team.filter((m, i) => !m.fainted && i !== st.active).length;
}

function suppressItem(m: Mon): void {
  if (!m.v.itemSaved) { m.v.itemSaved = { item: m.item }; m.item = null; }
}
function restoreItem(m: Mon): void {
  if (m.v.itemSaved) { if (m.item === null) m.item = m.v.itemSaved.item; m.v.itemSaved = null; }
}

/** Efeito extra dos golpes Gigantamax exclusivos. */
function applyGmax(s: BattleState, side: SideIndex, me: Mon, foe: Mon, effect: string, rng: Rng, log: string[]): void {
  const foeSide = otherSide(side);
  const status = (st: Status) => { if (!foe.fainted && canInflict(s, foe, st, true)) inflict(s, foe, st, rng, log, me); };
  if (effect.startsWith("dot-")) {
    const t = effect.slice(4);
    if (!foe.fainted && !foe.types.includes(t)) { foe.v.gmaxDot = { turns: 4, type: t }; log.push(`${monName(foe)} foi cercado por energia Gigantamax!`); }
    return;
  }
  switch (effect) {
    case "random-status": status((["slp", "psn", "par"] as const)[Math.floor(rng() * 3)] ?? "par"); break;
    case "par": status("par"); break;
    case "par-psn": status(rng() < 0.5 ? "par" : "psn"); break;
    case "psn": status("psn"); break;
    case "confuse": if (!foe.fainted) confuse(s, foe, rng, log); break;
    case "crit": me.v.focusEnergy = true; log.push(`${monName(me)} aumentou a chance de crítico!`); break;
    case "trap": if (!foe.fainted) { foe.v.noSwitch = true; log.push(`${monName(foe)} não pode mais fugir!`); } break;
    case "trapdmg": if (!foe.fainted && foe.v.trap === 0) { foe.v.trap = 4 + Math.floor(rng() * 2); log.push(`${monName(foe)} foi preso!`); } break;
    case "spe-2": if (!foe.fainted) changeStage(s, foe, "spe", -2, log, me); break;
    case "veil": s.sides[side].screens.auroraVeil = 5; log.push("Aurora Veil protege o time!"); break;
    case "attract": if (!foe.fainted) { foe.v.infatuated = true; log.push(`${monName(foe)} se apaixonou!`); } break;
    case "berry": if (!me.item && me.v.berry && rng() < 0.5) { me.item = me.v.berry; log.push(`${monName(me)} recuperou a berry!`); } break;
    case "torment": if (!foe.fainted) { foe.v.torment = true; log.push(`${monName(foe)} foi atormentado!`); } break;
    case "wind": {
      const st = s.sides[foeSide];
      st.hazards = { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false };
      st.screens = { reflect: 0, lightScreen: 0, auroraVeil: 0 };
      st.safeguard = 0; st.mist = 0; s.field.terrain = null;
      log.push("Barreiras, armadilhas e terreno foram varridos!");
      break;
    }
    case "gravity": s.field.gravity = 5; log.push("A gravidade aumentou!"); break;
    case "rocks": s.sides[foeSide].hazards.stealthRock = true; log.push("Pedras pontiagudas foram espalhadas!"); break;
    case "eva-1": if (!foe.fainted) changeStage(s, foe, "eva", -1, log, me); break;
    case "cure": me.status = null; break;
    case "yawn": if (!foe.fainted && foe.v.yawn === 0 && canInflict(s, foe, "slp", true)) { foe.v.yawn = 2; log.push(`${monName(foe)} ficou com sono!`); } break;
    case "heal": heal(me, me.maxHp / 6); break;
    case "pp": { const i = foe.v.lastIndex; if (i >= 0) foe.ppLeft[i] = Math.max(0, (foe.ppLeft[i] ?? 0) - 2); break; }
    default: break;
  }
}

// ---------------------------------------------------------------
// Mega, Tera, Dynamax e Z
// ---------------------------------------------------------------
function activateGimmick(s: BattleState, side: SideIndex, a: MoveAction, log: string[]): void {
  const me = activeMon(s, side);
  const st = s.sides[side];
  if (a.gimmick === "mega" && canMega(s, side) && me.data.mega) {
    const mg = me.data.mega;
    st.gimmicks.mega = true;
    me.mega = true;
    me.species = mg.species;
    me.types = [...mg.types];
    me.baseTypes = [...mg.types];
    me.stats = { ...mg.stats, hp: me.stats.hp };
    me.ability = mg.ability;
    log.push(`${monName(me)} sofreu Mega Evolução!`);
    entryAbility(s, side, Math.random, log);
    syncGas(s);
  }
  if (a.gimmick === "tera" && canTera(s, side) && a.teraType && (a.teraType === "stellar" || (TYPES as readonly string[]).includes(a.teraType))) {
    st.gimmicks.tera = true;
    me.tera = a.teraType;
    if (a.teraType !== "stellar") me.types = [a.teraType];
    log.push(`${monName(me)} terastalizou no tipo ${a.teraType === "stellar" ? "Estelar" : pretty(a.teraType)}!`);
  }
  if (a.gimmick === "dynamax" && canDynamax(s, side)) {
    const gmax = !!a.gmax && canGigantamax(s, side);
    st.gimmicks.dynamax = true;
    me.flags.dynamaxed = true;
    if (gmax) me.flags.gmax = true;
    me.baseMaxHp = me.maxHp;
    me.maxHp = Math.floor(me.maxHp * DYNAMAX_HP);
    me.hp = Math.floor(me.hp * DYNAMAX_HP);
    me.v.dynamax = 3;
    log.push(`${monName(me)} sofreu ${gmax ? "Gigantamax" : "Dynamax"} e ficou gigante!`);
  }
}

// ---------------------------------------------------------------
// Golpes de status
// ---------------------------------------------------------------
const AIMS_FOE = ["selected-pokemon", "all-opponents", "random-opponent", "all-other-pokemon", "specific-move"];
const FIELD_SPEC = (sp: MoveSpec) => !!(sp.weather || sp.terrain || sp.hazard || sp.screen || sp.haze || sp.gravity || sp.sport || sp.trickRoom || sp.tailwind || sp.safeguard || sp.mist || sp.luckyChant);

function callMove(s: BattleState, side: SideIndex, called: BattleMoveData, rng: Rng, log: string[], depth: number): boolean {
  if (depth > 2) return false;
  const me = activeMon(s, side);
  const spec = specOf(called);
  log.push(`${monName(me)} usou ${pretty(called.name)}!`);
  if (!isDamaging(called)) return runStatus(s, side, me, called, spec, false, rng, log, depth);
  return runAttack(s, side, me, called, spec, false, rng, log) > 0;
}

function runStatus(
  s: BattleState, side: SideIndex, me: Mon, move: BattleMoveData, spec: MoveSpec,
  z: boolean, rng: Rng, log: string[], depth = 0
): boolean {
  const foeSide = otherSide(side);
  const foe = activeMon(s, foeSide);
  const fail = (): false => { log.push("Mas falhou!"); return false; };
  const aimsFoe = AIMS_FOE.includes(move.target) && !FIELD_SPEC(spec);

  if (spec.noop) { log.push("Mas nada aconteceu!"); return true; }
  if (spec.protect) {
    if (spec.firstTurn && me.turnsOut > 0) return fail();
    if (rng() >= 1 / 3 ** me.v.protectCount) { me.v.protectCount = 0; return fail(); }
    me.v.protectCount++;
    if (spec.protect === "endure") me.v.endure = true; else me.v.protect = spec.protect;
    log.push(`${monName(me)} se protegeu!`);
    return true;
  }

  if (aimsFoe) {
    if (foe.ability === "good-as-gold" && !AB.ignoresAbility(me)) { log.push(`${monName(foe)} é imune a golpes de status!`); return false; }
    if ((foe.ability === "magic-bounce" && !AB.ignoresAbility(me)) || foe.v.magicCoat) { log.push(`${monName(foe)} refletiu o golpe!`); return false; }
    if (foe.v.protect) { log.push(`${monName(foe)} se protegeu!`); return false; }
    if (foe.v.substitute > 0 && !spec.forceSwitch) return fail();
    if (AB.immuneToMove(foe, move)) { log.push(`Não afeta ${monName(foe)}...`); return false; }
    if (move.accuracy !== null && !z && !me.v.lockOn && !AB.alwaysHits(me, foe)) {
      const acc = move.accuracy * AB.accuracyMult(me, foe, move, baseWx(s)) * accStageMult(me.stages.acc - foe.stages.eva);
      if (rng() * 100 >= acc) { log.push(`O golpe de ${monName(me)} errou!`); return false; }
    }
    me.v.lockOn = false;
  }

  // ---- campo ----
  if (spec.weather) return setWeather(s, spec.weather, me, log) || fail();
  if (spec.terrain) return setTerrain(s, spec.terrain, me, log) || fail();
  if (spec.trickRoom) { s.field.trickRoom = s.field.trickRoom > 0 ? 0 : 5; log.push(s.field.trickRoom > 0 ? "A dimensão ficou distorcida!" : "A dimensão voltou ao normal."); return true; }
  if (spec.gravity) { if (s.field.gravity > 0) return fail(); s.field.gravity = 5; log.push("A gravidade aumentou!"); return true; }
  if (spec.sport) { if (spec.sport === "mud") s.field.mudSport = 5; else s.field.waterSport = 5; log.push("O campo foi coberto!"); return true; }
  if (spec.tailwind) { const st = s.sides[side]; if (st.tailwind > 0) return fail(); st.tailwind = 4; log.push(`${SIDE_LABEL[side]} ganhou um vento favorável!`); return true; }
  if (spec.safeguard) { const st = s.sides[side]; if (st.safeguard > 0) return fail(); st.safeguard = 5; log.push("O time ficou protegido contra status!"); return true; }
  if (spec.mist) { const st = s.sides[side]; if (st.mist > 0) return fail(); st.mist = 5; log.push("Uma névoa protege o time!"); return true; }
  if (spec.luckyChant) { const st = s.sides[side]; if (st.luckyChant > 0) return fail(); st.luckyChant = 5; log.push("O time está protegido contra críticos!"); return true; }
  if (spec.screen) {
    const st = s.sides[side];
    if (st.screens[spec.screen] > 0) return fail();
    if (spec.screen === "auroraVeil" && !["snow", "hail"].includes(baseWx(s) ?? "")) return fail();
    st.screens[spec.screen] = me.item === "light-clay" ? 8 : 5;
    log.push(`${SCREEN_LABEL[spec.screen]} protege o time!`);
    return true;
  }
  if (spec.hazard) {
    const h = s.sides[foeSide].hazards;
    const key = spec.hazard;
    if (key === "stealthRock" || key === "stickyWeb") { if (h[key]) return fail(); h[key] = true; }
    else { if (h[key] >= (key === "spikes" ? 3 : 2)) return fail(); h[key]++; }
    log.push(`Armadilhas foram espalhadas pelo lado de ${SIDE_LABEL[foeSide]}!`);
    return true;
  }
  if (spec.clearHazards || spec.tidyUp) {
    for (const sd of spec.clearHazards === "both" || spec.tidyUp ? ([0, 1] as const) : [side]) s.sides[sd].hazards = { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false };
    log.push("As armadilhas foram removidas!");
    if (spec.tidyUp) { changeStage(s, me, "atk", 1, log, null); changeStage(s, me, "spe", 1, log, null); }
    return true;
  }
  if (spec.haze) { me.stages = zeroStages(); foe.stages = zeroStages(); log.push("Todas as mudanças de status foram eliminadas!"); return true; }
  if (spec.invert) { for (const k of STAGE_KEYS) foe.stages[k] = -foe.stages[k]; log.push("Os status do adversário foram invertidos!"); return true; }
  if (spec.revival) {
    const dead = s.sides[side].team.find((m) => m.fainted);
    if (!dead) return fail();
    dead.fainted = false; dead.hp = Math.floor(dead.maxHp / 2); dead.status = null;
    log.push(`${monName(dead)} foi revivido!`);
    return true;
  }

  // ---- si mesmo ----
  if (spec.substitute) {
    const cost = Math.floor(me.maxHp / 4);
    if (me.v.substitute > 0 || me.hp <= cost) return fail();
    hurt(me, cost); me.v.substitute = cost;
    log.push(`${monName(me)} criou um substituto!`);
    return true;
  }
  if (spec.bellyDrum) {
    if (me.hp <= me.maxHp / 2) return fail();
    hurt(me, Math.floor(me.maxHp / 2)); me.stages.atk = 6;
    log.push(`${monName(me)} cortou o próprio HP e maximizou o Ataque!`);
    return true;
  }
  if (spec.curse) {
    if (me.types.includes("ghost")) {
      if (foe.v.cursed) return fail();
      hurt(me, Math.floor(me.maxHp / 2)); foe.v.cursed = true;
      log.push(`${monName(me)} amaldiçoou ${monName(foe)}!`);
      if (me.hp <= 0) announceFaint(s, side, me, log);
    } else { changeStage(s, me, "spe", -1, log, null); changeStage(s, me, "atk", 1, log, null); changeStage(s, me, "def", 1, log, null); }
    return true;
  }
  if (spec.focusEnergy) { me.v.focusEnergy = true; log.push(`${monName(me)} se concentrou!`); return true; }
  if (spec.destinyBond) { me.v.destinyBond = true; log.push(`${monName(me)} quer levar o adversário junto!`); return true; }
  if (spec.ingrain) { if (me.v.ingrain) return fail(); me.v.ingrain = true; log.push(`${monName(me)} criou raízes!`); return true; }
  if (spec.aquaRing) { if (me.v.aquaRing) return fail(); me.v.aquaRing = true; log.push(`${monName(me)} se envolveu em água!`); return true; }
  if (spec.magicCoat) { me.v.magicCoat = true; log.push(`${monName(me)} preparou um escudo refletor!`); return true; }
  if (spec.lockOn) { me.v.lockOn = true; log.push(`${monName(me)} mirou no alvo!`); return true; }
  if (spec.floatTurns) { me.v.levitate = spec.floatTurns; log.push(`${monName(me)} está flutuando!`); return true; }
  if (spec.powerTrick) { [me.stats.atk, me.stats.def] = [me.stats.def, me.stats.atk]; log.push(`${monName(me)} trocou Ataque e Defesa!`); return true; }
  if (spec.acupressure) { const k = at(STAGE_KEYS, Math.floor(rng() * STAGE_KEYS.length)); changeStage(s, me, k, 2, log, null); return true; }
  if (spec.camouflage) { me.types = [s.field.terrain ? TERRAIN_TYPE[s.field.terrain] : "normal"]; log.push(`${monName(me)} mudou de tipo!`); return true; }
  if (spec.conversion) { const t = me.data.moves[0]?.type; if (!t) return fail(); me.types = [t]; log.push(`${monName(me)} virou do tipo ${pretty(t)}!`); return true; }
  if (spec.copyType) { me.types = [...foe.types]; log.push(`${monName(me)} copiou os tipos de ${monName(foe)}!`); return true; }
  if (spec.painSplit) { const avg = Math.floor((me.hp + foe.hp) / 2); me.hp = Math.min(me.maxHp, avg); foe.hp = Math.min(foe.maxHp, avg); log.push("Os dois Pokémon dividiram o HP!"); return true; }
  if (spec.cureTeam) { for (const m of s.sides[side].team) if (!m.fainted) m.status = null; log.push("Os status do time foram curados!"); return true; }
  if (spec.cureSelf) { if (!me.status) return fail(); me.status = null; log.push(`${monName(me)} se curou!`); return true; }
  if (spec.wish) { const st = s.sides[side]; if (st.wish) return fail(); st.wish = { turns: 2, hp: Math.floor(me.maxHp / 2) }; log.push(`${monName(me)} fez um desejo!`); return true; }
  if (spec.rest) {
    if (me.hp >= me.maxHp || me.status === "slp" || AB.blocksStatus(me, "slp", s.field.terrain, isGrounded(s, me), baseWx(s))) return fail();
    me.status = "slp"; me.sleepLeft = 2; me.hp = me.maxHp;
    log.push(`${monName(me)} dormiu e recuperou todo o HP!`);
    return true;
  }
  if (spec.heal !== undefined) {
    if (me.hp >= me.maxHp || me.v.healBlock > 0) return fail();
    const w = baseWx(s);
    let frac: number;
    if (spec.heal === "weather") frac = w === "sun" ? 2 / 3 : w ? 0.25 : 0.5;
    else if (spec.heal === "sand") frac = w === "sand" ? 2 / 3 : 0.5;
    else frac = spec.heal / 100;
    heal(me, me.maxHp * frac);
    if (spec.roost) me.v.roosted = true;
    log.push(`${monName(me)} recuperou HP!`);
    return true;
  }
  if (spec.sleepTalk) {
    if (me.status !== "slp") return fail();
    const opts = me.data.moves.filter((m) => m.name !== "sleep-talk" && isSupported(m) && !isComplexSpec(specOf(m)));
    const pick = opts[Math.floor(rng() * opts.length)];
    return pick ? callMove(s, side, pick, rng, log, depth + 1) : fail();
  }
  if (spec.metronome) {
    const pool = CATALOG.filter((m) => isSupported(m) && !METRONOME_BANNED.has(m.name) && !isComplexSpec(specOf(m)) && m.id < 10000 && !m.name.includes("--") && !m.name.startsWith("max-"));
    const pick = pool[Math.floor(rng() * pool.length)];
    return pick ? callMove(s, side, pick, rng, log, depth + 1) : fail();
  }
  if (spec.copycat || spec.mirrorMove) {
    const name = spec.copycat ? s.lastMoveUsed : foe.v.lastMove;
    const pick = name ? CATALOG.find((m) => m.name === name) : undefined;
    if (!pick || METRONOME_BANNED.has(pick.name) || isComplexSpec(specOf(pick))) return fail();
    return callMove(s, side, pick, rng, log, depth + 1);
  }
  if (spec.mimic) {
    const last = CATALOG.find((m) => m.name === foe.v.lastMove);
    if (!last || me.v.lastIndex < 0) return fail();
    me.data.moves[me.v.lastIndex] = { ...last, pp: 5 };
    me.ppLeft[me.v.lastIndex] = 5;
    log.push(`${monName(me)} copiou ${pretty(last.name)}!`);
    return true;
  }
  if (spec.transform) return transformInto(me, foe, log) || fail();

  // ---- adversário ----
  const dyn = foe.v.dynamax > 0;
  if (spec.leechSeed) { if (foe.v.leechSeed || foe.types.includes("grass")) return fail(); foe.v.leechSeed = true; log.push(`${monName(foe)} foi semeado!`); return true; }
  if (spec.yawn) { if (foe.v.yawn > 0 || !canInflict(s, foe, "slp", true)) return fail(); foe.v.yawn = 2; log.push(`${monName(foe)} ficou com sono!`); return true; }
  if (spec.taunt) { if (foe.v.taunt > 0 || dyn || foe.ability === "oblivious") return fail(); foe.v.taunt = 3; log.push(`${monName(foe)} foi provocado!`); return true; }
  if (spec.trick) { [me.item, foe.item] = [foe.item, me.item]; log.push(`${monName(me)} trocou de item com ${monName(foe)}!`); return true; }
  if (spec.encore) {
    const idx = foe.v.lastIndex;
    if (dyn || foe.v.encore || idx < 0) return fail();
    foe.v.encore = { index: idx, turns: 3 };
    log.push(`${monName(foe)} foi forçado a repetir o golpe!`);
    return true;
  }
  if (spec.disable) {
    const idx = foe.v.lastIndex;
    if (dyn || foe.v.disable || idx < 0) return fail();
    foe.v.disable = { index: idx, turns: 4 };
    log.push(`O golpe de ${monName(foe)} foi desativado!`);
    return true;
  }
  if (spec.torment) { if (dyn || foe.v.torment) return fail(); foe.v.torment = true; log.push(`${monName(foe)} foi atormentado!`); return true; }
  if (spec.healBlock) { if (foe.v.healBlock > 0) return fail(); foe.v.healBlock = 5; log.push(`${monName(foe)} não pode mais se curar!`); return true; }
  if (spec.perish) {
    if (me.v.perish > 0 && foe.v.perish > 0) return fail();
    if (me.v.perish === 0) me.v.perish = 4;
    if (foe.v.perish === 0) foe.v.perish = 4;
    log.push("Os dois Pokémon vão desmaiar em três turnos!");
    return true;
  }
  if (spec.attract) { if (foe.v.infatuated || dyn || ["oblivious", "aroma-veil"].includes(foe.ability ?? "")) return fail(); foe.v.infatuated = true; log.push(`${monName(foe)} se apaixonou!`); return true; }
  if (spec.nightmare) { if (foe.status !== "slp" || foe.v.nightmare) return fail(); foe.v.nightmare = true; log.push(`${monName(foe)} começou a ter pesadelos!`); return true; }
  if (spec.trapFoe) { if (foe.v.noSwitch) return fail(); foe.v.noSwitch = true; log.push(`${monName(foe)} não pode mais fugir!`); return true; }
  if (spec.spite) { const i = foe.v.lastIndex; if (i < 0) return fail(); foe.ppLeft[i] = Math.max(0, (foe.ppLeft[i] ?? 0) - 4); log.push("O PP do último golpe foi reduzido!"); return true; }
  if (spec.identify) { foe.v.identified = true; log.push(`${monName(foe)} foi identificado!`); return true; }
  if (spec.electrify) { foe.v.electrified = true; log.push(`O próximo golpe de ${monName(foe)} virou Elétrico!`); return true; }
  if (spec.powder) { foe.v.powdered = true; log.push(`${monName(foe)} foi coberto de pó!`); return true; }
  if (spec.setType) { if (foe.tera) return fail(); foe.types = [spec.setType]; log.push(`${monName(foe)} virou do tipo ${pretty(spec.setType)}!`); return true; }
  if (spec.addType) { if (foe.tera || foe.types.includes(spec.addType)) return fail(); foe.types = [...foe.types, spec.addType]; log.push(`${monName(foe)} ganhou o tipo ${pretty(spec.addType)}!`); return true; }
  if (spec.swap) {
    const keys: StageKey[] = spec.swap === "all" ? STAGE_KEYS : spec.swap === "atkspa" ? ["atk", "spa"] : ["def", "spd"];
    for (const k of keys) { const t = me.stages[k]; me.stages[k] = foe.stages[k]; foe.stages[k] = t; }
    log.push("Os status foram trocados!");
    return true;
  }
  if (spec.psychUp) { me.stages = { ...foe.stages }; log.push(`${monName(me)} copiou as mudanças de status de ${monName(foe)}!`); return true; }
  if (spec.split) {
    const [a, b] = spec.split === "atkspa" ? (["atk", "spa"] as const) : (["def", "spd"] as const);
    for (const k of [a, b]) { const avg = Math.floor((me.stats[k] + foe.stats[k]) / 2); me.stats[k] = avg; foe.stats[k] = avg; }
    log.push("Os status foram divididos!");
    return true;
  }
  if (spec.ability) {
    const mine = me.ability, theirs = foe.ability;
    if (spec.ability === "skill") { if (!theirs) return fail(); me.ability = theirs; foe.ability = mine; }
    else if (spec.ability === "role") { if (!theirs) return fail(); me.ability = theirs; }
    else if (spec.ability === "entrain") { if (!mine) return fail(); foe.ability = mine; }
    else if (spec.ability === "gastro") { if (!theirs) return fail(); foe.ability = null; }
    else if (spec.ability === "simple") foe.ability = "simple";
    else foe.ability = "insomnia";
    log.push(`A habilidade de ${monName(foe)} mudou!`);
    return true;
  }
  if (spec.removeItem) { if (!foe.item || foe.ability === "sticky-hold") return fail(); log.push(`${monName(foe)} perdeu o item ${pretty(foe.item)}!`); foe.item = null; return true; }
  if (spec.dreamEater) return fail();

    // ---- lote 3 ----
  if (spec.stockpile) {
    if (me.v.stockpile >= 3) return fail();
    me.v.stockpile++;
    log.push(`${monName(me)} acumulou energia (${me.v.stockpile})!`);
    changeStage(s, me, "def", 1, log, null);
    changeStage(s, me, "spd", 1, log, null);
    return true;
  }
  if (spec.swallow) {
    if (me.v.stockpile <= 0 || me.hp >= me.maxHp) return fail();
    heal(me, me.maxHp * ([0, 0.25, 0.5, 1][me.v.stockpile] ?? 1));
    me.stages.def = clamp(me.stages.def - me.v.stockpile, -6, 6);
    me.stages.spd = clamp(me.stages.spd - me.v.stockpile, -6, 6);
    me.v.stockpile = 0;
    log.push(`${monName(me)} engoliu a energia e recuperou HP!`);
    return true;
  }
  if (spec.selfStats || spec.hpCost || spec.eatOwnBerry || spec.cureOnUse) {
    if (spec.eatOwnBerry && !me.item?.endsWith("-berry")) return fail();
    if (spec.hpCost) {
      const cost = Math.floor(me.maxHp * spec.hpCost);
      if (me.hp <= cost) return fail();
      hurt(me, cost);
    }
    if (spec.eatOwnBerry) eatBerry(me, log);
    for (const [k, n] of spec.selfStats ?? []) changeStage(s, me, k, n, log, null);
    if (spec.cureOnUse) me.status = null;
    if (spec.noRetreat) me.v.noSwitch = true;
    return true;
  }
  if (spec.healCure) {
    if (me.hp >= me.maxHp && !me.status) return fail();
    heal(me, (me.maxHp * spec.healCure) / 100);
    me.status = null;
    log.push(`${monName(me)} recuperou HP e se curou!`);
    return true;
  }
  if (spec.foeStats) { for (const [k, n] of spec.foeStats) changeStage(s, foe, k, n, log, me); return true; }
  if (spec.embargo) {
    if (foe.v.embargo > 0 || !foe.item) return fail();
    suppressItem(foe);
    foe.v.embargo = 5;
    log.push(`${monName(foe)} não pode mais usar itens!`);
    return true;
  }
  if (spec.magicRoom) {
    if (s.field.magicRoom > 0) {
      s.field.magicRoom = 0;
      for (const sd of [0, 1] as const) { const m = activeMon(s, sd); if (m.v.embargo === 0) restoreItem(m); }
      log.push("Os itens voltaram a funcionar.");
    } else {
      s.field.magicRoom = 5;
      for (const sd of [0, 1] as const) suppressItem(activeMon(s, sd));
      log.push("Os itens perderam o efeito!");
    }
    return true;
  }
  if (spec.wonderRoom) { s.field.wonderRoom = s.field.wonderRoom > 0 ? 0 : 5; log.push("Defesa e Def. Esp. foram trocadas!"); return true; }
  if (spec.ionDeluge) { s.field.ionDeluge = true; log.push("Cargas elétricas se espalharam!"); return true; }
  if (spec.fairyLock) { s.field.fairyLock = 2; log.push("Ninguém pode fugir no próximo turno!"); return true; }
  if (spec.courtChange) {
    const a = s.sides[0], b = s.sides[1];
    [a.hazards, b.hazards] = [b.hazards, a.hazards];
    [a.screens, b.screens] = [b.screens, a.screens];
    [a.tailwind, b.tailwind] = [b.tailwind, a.tailwind];
    [a.safeguard, b.safeguard] = [b.safeguard, a.safeguard];
    log.push("Os efeitos de cada lado foram trocados!");
    return true;
  }
  if (spec.grudge) { me.v.grudge = true; log.push(`${monName(me)} guarda rancor!`); return true; }
  if (spec.imprison) { foe.v.imprisoned = me.data.moves.map((m) => m.name); log.push(`${monName(foe)} não pode usar golpes que ${monName(me)} conhece!`); return true; }
  if (spec.laserFocus) { me.v.laserFocus = 2; log.push(`${monName(me)} se concentrou com um laser!`); return true; }
  if (spec.octolock) {
    if (foe.v.noSwitch) return fail();
    foe.v.noSwitch = true; foe.v.octolock = true;
    log.push(`${monName(foe)} foi preso e não pode fugir!`);
    return true;
  }
  if (spec.snatch) { me.v.snatch = true; log.push(`${monName(me)} espera para roubar um golpe!`); return true; }
  if (spec.speedSwap) { [me.stats.spe, foe.stats.spe] = [foe.stats.spe, me.stats.spe]; log.push("As Velocidades foram trocadas!"); return true; }
  if (spec.powerShift) {
    [me.stats.atk, me.stats.def] = [me.stats.def, me.stats.atk];
    [me.stats.spa, me.stats.spd] = [me.stats.spd, me.stats.spa];
    log.push(`${monName(me)} trocou seus status ofensivos e defensivos!`);
    return true;
  }
  if (spec.psychoShift) {
    if (!me.status || !canInflict(s, foe, me.status, true)) return fail();
    inflict(s, foe, me.status, rng, log, null);
    me.status = null;
    return true;
  }
  if (spec.purify) {
    if (!foe.status) return fail();
    foe.status = null;
    heal(me, me.maxHp / 2);
    log.push(`${monName(foe)} foi purificado e ${monName(me)} recuperou HP!`);
    return true;
  }
  if (spec.strengthSap) {
    if (foe.stages.atk <= -6) return fail();
    heal(me, Math.floor(foe.stats.atk * stageMult(foe.stages.atk)));
    changeStage(s, foe, "atk", -1, log, me);
    return true;
  }
  if (spec.recycle) {
    if (me.item || !me.v.lastItem) return fail();
    me.item = me.v.lastItem; me.v.lastItem = null;
    log.push(`${monName(me)} reciclou ${pretty(me.item)}!`);
    return true;
  }
  if (spec.bestow) {
    if (!me.item || foe.item) return fail();
    foe.item = me.item; me.item = null;
    log.push(`${monName(me)} deu um item a ${monName(foe)}!`);
    return true;
  }
  if (spec.conversion2) {
    const last = CATALOG.find((m) => m.name === foe.v.lastMove);
    if (!last) return fail();
    const opts = (TYPES as readonly string[]).filter((t) => typeMult(last.type, [t]) < 1);
    if (opts.length === 0) return fail();
    me.types = [at([...opts], Math.floor(rng() * opts.length))];
    log.push(`${monName(me)} mudou de tipo!`);
    return true;
  }
  if (spec.assist) {
    const st = s.sides[side];
    const pool = st.team
      .flatMap((m, i) => (i === st.active || m.fainted ? [] : m.data.moves))
      .filter((m) => isSupported(m) && !METRONOME_BANNED.has(m.name) && !isComplexSpec(specOf(m)) && !m.name.includes("--"));
    const pick = pool[Math.floor(rng() * pool.length)];
    return pick ? callMove(s, side, pick, rng, log, depth + 1) : fail();
  }
  if (spec.naturePower) {
    const name = ({ electric: "thunderbolt", grassy: "energy-ball", misty: "moonblast", psychic: "psychic" } as Record<string, string>)[s.field.terrain ?? ""] ?? "tri-attack";
    const pick = CATALOG.find((m) => m.name === name);
    return pick ? callMove(s, side, pick, rng, log, depth + 1) : fail();
  }
  if (spec.meFirst) {
    const fa = s.ctx?.actions[foeSide];
    if (!fa || fa.kind !== "move" || s.moved[foeSide]) return fail();
    const fm = chosenMove(s, foeSide, fa);
    if (!isDamaging(fm) || isComplexSpec(specOf(fm))) return fail();
    return callMove(s, side, { ...fm, power: Math.ceil((fm.power ?? 60) * 1.5) }, rng, log, depth + 1);
  }
  if (spec.shedTail) {
    const cost = Math.floor(me.maxHp / 2);
    if (me.hp <= cost || benchCount(s, side) === 0) return fail();
    hurt(me, cost);
    s.passSub = Math.floor(me.maxHp / 4);
    log.push(`${monName(me)} criou um substituto para o próximo Pokémon!`);
    return true;
  }

  // ---- genérico, pela categoria da PokeAPI ----
  const applyChanges = (target: Mon) => {
    for (const c of move.stat_changes) { const k = toStageKey(c.stat); if (k) changeStage(s, target, k, c.change, log, me); }
  };
  switch (move.category) {
    case "ailment": {
      const st = statusFromAilment(move);
      if (st) { if (!canInflict(s, foe, st, true, me)) return fail(); inflict(s, foe, st, rng, log, me); return true; }
      if (move.ailment === "confusion") return confuse(s, foe, rng, log) || fail();
      if (move.ailment === "trap") { if (foe.v.trap > 0) return fail(); foe.v.trap = 4 + Math.floor(rng() * 2); log.push(`${monName(foe)} foi preso!`); return true; }
      return fail();
    }
    case "swagger": applyChanges(foe); confuse(s, foe, rng, log); return true;
    case "net-good-stats": {
      applyChanges(targetsSelf(move) ? me : foe);
      if (z) changeStage(s, me, me.stats.atk >= me.stats.spa ? "atk" : "spa", 1, log, null);
      return true;
    }
    case "heal": { if (me.hp >= me.maxHp) return fail(); heal(me, (me.maxHp * move.healing) / 100); log.push(`${monName(me)} recuperou HP!`); return true; }
    default:
      if (move.stat_changes.length > 0) { applyChanges(targetsSelf(move) ? me : foe); return true; }
      return fail();
  }
}

// ---------------------------------------------------------------
// Ataques
// ---------------------------------------------------------------
const HITS_SEMI: Record<string, string[]> = {
  fly: ["thunder", "hurricane", "gust", "twister", "sky-uppercut", "smack-down", "thousand-arrows"],
  bounce: ["thunder", "hurricane", "gust", "twister", "sky-uppercut", "smack-down", "thousand-arrows"],
  dig: ["earthquake", "magnitude", "fissure", "bulldoze"],
  dive: ["surf", "whirlpool"],
};

function survive(foe: Mon, dmg: number, log: string[]): number {
  if (dmg < foe.hp) return dmg;
  if (foe.v.endure) { log.push(`${monName(foe)} aguentou o golpe!`); return foe.hp - 1; }
  if (foe.hp === foe.maxHp) {
    if (foe.item === "focus-sash") { foe.item = null; log.push(`${monName(foe)} aguentou o golpe com a Focus Sash!`); return foe.hp - 1; }
    if (foe.ability === "sturdy") { log.push(`${monName(foe)} aguentou o golpe com Sturdy!`); return foe.hp - 1; }
  }
  return dmg;
}

/** Reações de habilidades de quem foi atingido. */
function afterHit(
  s: BattleState, side: SideIndex, me: Mon, foe: Mon, move: BattleMoveData, type: string,
  total: number, hpBefore: number, crit: boolean, rng: Rng, log: string[]
): void {
  if (total <= 0 || foe.v.gasSaved) return;
  const contact = isContact(move) && me.ability !== "long-reach";
  const physical = move.damage_class === "physical";
  const foeSide = otherSide(side);
  if (!foe.fainted) {
    switch (foe.ability) {
      case "weak-armor": if (physical) { changeStage(s, foe, "def", -1, log, null); changeStage(s, foe, "spe", 2, log, null); } break;
      case "stamina": changeStage(s, foe, "def", 1, log, null); break;
      case "justified": if (type === "dark") changeStage(s, foe, "atk", 1, log, null); break;
      case "rattled": if (["bug", "ghost", "dark"].includes(type)) changeStage(s, foe, "spe", 1, log, null); break;
      case "water-compaction": if (type === "water") changeStage(s, foe, "def", 2, log, null); break;
      case "steam-engine": if (type === "water" || type === "fire") changeStage(s, foe, "spe", 6, log, null); break;
      case "anger-point": if (crit) foe.stages.atk = 6; break;
      case "color-change": if (!foe.tera) foe.types = [type]; break;
      case "electromorphosis": foe.v.charged = true; break;
      case "sand-spit": setWeather(s, "sand", foe, log); break;
      case "seed-sower": setTerrain(s, "grassy", foe, log); break;
      case "cotton-down": changeStage(s, me, "spe", -1, log, foe); break;
      case "gooey": case "tangling-hair": if (contact) changeStage(s, me, "spe", -1, log, foe); break;
      case "mummy": case "lingering-aroma": if (contact && me.ability !== foe.ability) { me.ability = foe.ability; log.push(`${monName(me)} ficou com a habilidade ${pretty(foe.ability ?? "")}!`); } break;
      case "wandering-spirit": if (contact) { [me.ability, foe.ability] = [foe.ability, me.ability]; log.push("As habilidades foram trocadas!"); } break;
      case "cute-charm": if (contact && rng() < 0.3 && !me.v.infatuated) { me.v.infatuated = true; log.push(`${monName(me)} se apaixonou!`); } break;
      case "perish-body": if (contact && me.v.perish === 0 && foe.v.perish === 0) { me.v.perish = 4; foe.v.perish = 4; log.push("Os dois Pokémon vão desmaiar em três turnos!"); } break;
      case "toxic-debris": if (physical && s.sides[side].hazards.toxicSpikes < 2) { s.sides[side].hazards.toxicSpikes++; log.push("Toxic Spikes foram espalhados!"); } break;
      case "pickpocket": if (contact && foe.item === null && me.item && me.ability !== "sticky-hold") { foe.item = me.item; me.item = null; log.push(`${monName(foe)} roubou o item de ${monName(me)}!`); } break;
      case "berserk": if (hpBefore * 2 > foe.maxHp && foe.hp * 2 <= foe.maxHp) changeStage(s, foe, "spa", 1, log, null); break;
      case "anger-shell":
        if (hpBefore * 2 > foe.maxHp && foe.hp * 2 <= foe.maxHp) {
          for (const k of ["atk", "spa", "spe"] as const) changeStage(s, foe, k, 1, log, null);
          for (const k of ["def", "spd"] as const) changeStage(s, foe, k, -1, log, null);
        }
        break;
      case "cursed-body": if (rng() < 0.3 && !me.v.disable && me.v.lastIndex >= 0 && foe.v.dynamax <= 0) me.v.disable = { index: me.v.lastIndex, turns: 4 }; break;
      case "spicy-spray": if (canInflict(s, me, "brn", false, me)) inflict(s, me, "brn", rng, log, me); break;
      default: break;
    }
  } else if (contact) {
    if (foe.ability === "aftermath") hazardHurt(s, side, me, me.maxHp / 4, "foi ferido pela explosão!", log);
    if (foe.ability === "innards-out") hazardHurt(s, side, me, total, "foi ferido por dentro!", log);
  }
  // reações do atacante
  if (!me.fainted && !foe.fainted && !AB.shieldDust(foe)) {
    if (me.ability === "stench" && rng() < 0.1 && !AB.blocksFlinch(foe) && !s.moved[foeSide]) foe.v.flinch = true;
    if (me.ability === "poison-touch" && contact && rng() < 0.3 && canInflict(s, foe, "psn", true)) inflict(s, foe, "psn", rng, log, me);
    if (me.ability === "toxic-chain" && rng() < 0.3 && canInflict(s, foe, "tox", true)) inflict(s, foe, "tox", rng, log, me);
  }
  if (me.ability === "magician" && !me.item && foe.item && !me.fainted && foe.ability !== "sticky-hold") { me.item = foe.item; foe.item = null; log.push(`${monName(me)} pegou o item de ${monName(foe)}!`); }
}

function runAttack(
  s: BattleState, side: SideIndex, me: Mon, move: BattleMoveData, spec: MoveSpec,
  z: boolean, rng: Rng, log: string[]
): number {
  const foeSide = otherSide(side);
  const foe = activeMon(s, foeSide);
  const raw = weatherActive(s);
  const w = wxBase(raw);
  const type = resolveType(s, me, move);
  const ignore = AB.ignoresAbility(me);
  const mx = MAX_BY_NAME[move.name];
  const gm = GMAX_BY_NAME[move.name];

  if (raw === "harsh-sun" && type === "water") { log.push("O golpe de água evaporou com o sol extremo!"); return 0; }
  if (raw === "heavy-rain" && type === "fire") { log.push("O golpe de fogo foi apagado pela chuva torrencial!"); return 0; }
  if (spec.fling && !me.item) { log.push("Mas falhou!"); return 0; }
  if (spec.dreamEater && foe.status !== "slp") { log.push("Mas falhou!"); return 0; }
  if (spec.needSleep && me.status !== "slp") { log.push("Mas falhou!"); return 0; }
  if (spec.needBerry && !me.flags.ateBerry) { log.push("Mas falhou!"); return 0; }
  if (spec.naturalGift && !(me.item && NATURAL_GIFT[me.item])) { log.push("Mas falhou!"); return 0; }
  if (spec.power === "spitUp" && me.v.stockpile <= 0) { log.push("Mas falhou!"); return 0; }

    const pierce = me.ability === "piercing-drill" && isContact(move);
  if (foe.v.protect && !z && !pierce && !(me.ability === "unseen-fist" && isContact(move)) && !spec.breaksProtect) {
    log.push(`${monName(foe)} se protegeu!`);
    if (isContact(move)) {
      if (foe.v.protect === "spiky") hazardHurt(s, side, me, me.maxHp / 8, "foi ferido pelos espinhos!", log);
      if (foe.v.protect === "kings") changeStage(s, me, "atk", -1, log, foe);
      if (foe.v.protect === "baneful" && canInflict(s, me, "psn")) inflict(s, me, "psn", rng, log);
      if (foe.v.protect === "burning" && canInflict(s, me, "brn")) inflict(s, me, "brn", rng, log);
      if (foe.v.protect === "obstruct") changeStage(s, me, "def", -2, log, foe);
      if (foe.v.protect === "silk") changeStage(s, me, "spe", -1, log, foe);
    }
    return 0;
  }
  if (foe.v.semi && !z && !spec.ohko && !HITS_SEMI[foe.v.lastMove ?? ""]?.includes(move.name)) { log.push(`O ataque de ${monName(me)} errou!`); return 0; }
  if (!ignore && AB.immuneToMove(foe, move)) { log.push(`${monName(foe)} é imune ao golpe!`); return 0; }
  if (!ignore && AB.blocksPriority(foe) && move.priority + AB.priorityBonus(me, move) > 0) { log.push(`${monName(foe)} bloqueou o golpe prioritário!`); return 0; }

  const absorbed = ignore ? null : AB.absorbEffect(foe.ability, type);
  if (absorbed) {
    if (absorbed.heal) heal(foe, foe.maxHp * absorbed.heal);
    if (absorbed.boost) changeStage(s, foe, absorbed.boost[0], absorbed.boost[1], log, null);
    if (absorbed.flashFire) foe.v.flashFire = true;
    log.push(`${monName(foe)} absorveu o golpe com ${pretty(foe.ability ?? "")}!`);
    return 0;
  }

  if ((!z && move.accuracy !== null) || spec.ohko) {
    let acc = (move.accuracy ?? 100) * AB.accuracyMult(me, foe, move, w) * accStageMult(me.stages.acc - foe.stages.eva);
    if (spec.ohko) {
      if (me.data.level < foe.data.level || foe.v.dynamax > 0) { log.push("Mas falhou!"); return 0; }
      acc = 30 + me.data.level - foe.data.level;
    }
    if (["thunder", "hurricane"].includes(move.name)) { if (w === "rain") acc = 100; else if (w === "sun") acc = 50; }
    if (move.name === "blizzard" && (w === "snow" || w === "hail")) acc = 100;
    if (s.field.gravity > 0) acc *= 5 / 3;
    const sure = me.v.lockOn || AB.alwaysHits(me, foe) || foe.v.glaive;
    if (!sure && rng() * 100 >= acc) {
      log.push(`O ataque de ${monName(me)} errou!`);
      if (spec.crash) hazardHurt(s, side, me, me.maxHp / 2, "se machucou ao errar o golpe!", log);
      return 0;
    }
    me.v.lockOn = false;
  }

  const eff = moveEffectiveness(s, me, foe, move);
  if (eff === 0) { log.push(`Não afeta ${monName(foe)}...`); return 0; }
  if (s.field.terrain === "psychic" && isGrounded(s, foe) && move.priority + AB.priorityBonus(me, move) > 0) { log.push(`${monName(foe)} está protegido pelo campo!`); return 0; }

  const pbond = me.ability === "parental-bond" && !spec.ohko && spec.fixed === undefined && !spec.counter && (move.max_hits ?? 1) === 1;
  let presetPower: number | undefined;
  if (spec.fickle) presetPower = rng() < 0.3 ? 160 : undefined;
  if (spec.present) {
    const r = rng();
    if (r < 0.2) { heal(foe, foe.maxHp / 4); log.push(`${monName(foe)} recebeu um presente e recuperou HP!`); return 0; }
    presetPower = r < 0.6 ? 40 : r < 0.9 ? 80 : 120;
  }
  const beat = spec.beatUp ? s.sides[side].team.filter((m) => !m.fainted && !m.status) : null;
  const hits = beat ? beat.length : spec.ohko || spec.fixed !== undefined || spec.counter ? 1 : pbond ? 2 : rollHits(move, me, rng);
  let landed = 0, total = 0, crited = false, hitSub = false;
  const hpBefore = foe.hp;

  for (let h = 0; h < hits && !foe.fainted; h++) {
    let dmg: number;
    let crit = false;
    if (!ignore && foe.ability === "ice-face" && !foe.flags.iceface && move.damage_class === "physical") {
      foe.flags.iceface = true;
      log.push(`A cobertura de gelo de ${monName(foe)} absorveu o golpe!`);
      landed = 0; break;
    }
    if (!ignore && foe.ability === "disguise" && !foe.flags.disguise && move.damage_class !== "status") {
      foe.flags.disguise = true;
      hurt(foe, Math.floor(foe.maxHp / 8));
      log.push(`O disfarce de ${monName(foe)} foi desfeito!`);
      landed = 0; break;
    }
    if (spec.ohko) dmg = foe.hp;
    else if (spec.counter) {
      const taken = spec.counter === "physical" ? me.v.hitPhysical : spec.counter === "special" ? me.v.hitSpecial : me.v.hitPhysical + me.v.hitSpecial;
      if (taken <= 0) { log.push("Mas falhou!"); return 0; }
      dmg = Math.floor(taken * (spec.counter === "both" ? 1.5 : 2));
    } else if (spec.fixed !== undefined) dmg = fixedDamage(me, foe, spec.fixed, rng);
    else {
      const stage = move.crit_rate + (me.v.focusEnergy ? 2 : 0) + (me.item === "scope-lens" ? 1 : 0) + (me.ability === "super-luck" ? 1 : 0);
      const canCrit = !AB.critImmune(foe) && s.sides[foeSide].luckyChant === 0;
      crit = canCrit && (me.v.laserFocus > 0 || !!spec.alwaysCrit || (me.ability === "merciless" && (foe.status === "psn" || foe.status === "tox")) || rng() < (CRIT[Math.min(stage, 3)] ?? 1 / 24));
      const power = beat ? Math.floor((beat[h]?.stats.atk ?? 50) / 10) + 5 : presetPower;
      const r = calcDamageBetween(s, me, side, foe, foeSide, move, { crit, hit: h, z, power });
      dmg = r.min + Math.floor(rng() * (r.max - r.min + 1));
      if (pbond && h === 1) dmg = Math.max(1, Math.floor(dmg * 0.25));
    }
    if (pierce && foe.v.protect) dmg = Math.max(1, Math.floor(dmg / 4));
    if (foe.v.substitute > 0) {
      foe.v.substitute -= Math.min(foe.v.substitute, dmg);
      log.push(foe.v.substitute <= 0 ? `O substituto de ${monName(foe)} desapareceu!` : `O substituto de ${monName(foe)} absorveu o golpe!`);
      hitSub = true;
      continue;
    }
    dmg = survive(foe, dmg, log);
    total += hurt(foe, dmg).dealt;
    landed++;
    crited = crited || crit;
    if (crit && foe.ability === "anger-point") foe.stages.atk = 6;
  }
  if (landed === 0) return hitSub ? 0 : 0;

  if (landed > 1) log.push(`Acertou ${landed} vezes!`);
  if (crited) log.push("Acerto crítico!");
  if (eff > 1) log.push("Foi super efetivo!"); else if (eff < 1) log.push("Não foi muito efetivo...");
  log.push(`${monName(foe)} perdeu ${Math.round((total / foe.maxHp) * 100)}% do HP.`);

  if (move.damage_class === "physical") foe.v.hitPhysical += total; else foe.v.hitSpecial += total;
  foe.v.hitsTaken += landed;
  if (me.v.charged && type === "electric") me.v.charged = false;
  if (me.tera === "stellar" && !me.stellarUsed.includes(type)) me.stellarUsed.push(type);

  if (foe.fainted) {
    announceFaint(s, foeSide, foe, log);
    const boost = AB.onKoBoost(me);
    if (boost && !me.fainted) changeStage(s, me, boost[0], boost[1], log, null);
    if (foe.v.destinyBond && !me.fainted) { hurt(me, me.hp); announceFaint(s, side, me, log);
    if (foe.v.grudge && me.v.lastIndex >= 0) me.ppLeft[me.v.lastIndex] = 0;
     }
  }

  const selfHurt = (amount: number, msg: string) => {
    if (me.fainted || amount < 1 || me.ability === "magic-guard") return;
    const r = hurt(me, amount);
    log.push(`${monName(me)} ${msg}`);
    if (r.fainted) announceFaint(s, side, me, log);
  };

  if (isContact(move) && me.ability !== "long-reach" && !foe.fainted) {
    const c = ignore ? null : AB.contactEffect(foe, rng);
    if (c?.damageFrac) selfHurt(me.maxHp * c.damageFrac, "foi ferido ao tocar no adversário!");
    if (c?.status && !me.fainted && canInflict(s, me, c.status)) inflict(s, me, c.status, rng, log, foe);
    if (foe.item === "rocky-helmet") selfHurt(me.maxHp / 6, "foi ferido pelo Rocky Helmet!");
  }  if (!foe.fainted && (foe.ability === "wimp-out" || foe.ability === "emergency-exit") && hpBefore * 2 > foe.maxHp && foe.hp * 2 <= foe.maxHp && benchCount(s, foeSide) > 0 && s.pivot === null) {
    log.push(`${monName(foe)} saiu de campo para se proteger!`);
    s.pivot = foeSide;
  }
  if (spec.hazardOnHit && total > 0) {
    const h = s.sides[foeSide].hazards;
    if (spec.hazardOnHit === "stealthRock") h.stealthRock = true; else h.spikes = Math.min(3, h.spikes + 1);
    log.push("Armadilhas foram espalhadas pelo lado adversário!");
  }
  if (spec.selfDamage && total > 0) selfHurt(me.maxHp * spec.selfDamage, "perdeu HP pelo esforço!");
  if (total > 0 && !foe.fainted) {
    if (spec.healBlockHit) foe.v.healBlock = Math.max(foe.v.healBlock, spec.healBlockHit);
    if (spec.saltCure) foe.v.saltCure = true;
  }
  if (spec.breakScreens && total > 0) s.sides[foeSide].screens = { reflect: 0, lightScreen: 0, auroraVeil: 0 };
  if (spec.clearTerrain && total > 0) s.field.terrain = null;
  if (!ignore) afterHit(s, side, me, foe, move, type, total, hpBefore, crited, rng, log);

  if (eff > 1 && foe.item === "weakness-policy" && !foe.fainted) { foe.item = null; changeStage(s, foe, "atk", 2, log, null); changeStage(s, foe, "spa", 2, log, null); }

  if (move.drain > 0) {
    const gain = (total * move.drain) / 100;
    if (foe.ability === "liquid-ooze") selfHurt(gain, "sugou um líquido tóxico!");
    else if (heal(me, gain) > 0) log.push(`${monName(me)} recuperou HP!`);
  }
  if (move.drain < 0 && me.ability !== "rock-head") selfHurt((total * -move.drain) / 100, "sofreu dano de recuo!");
  if (move.id === 0) selfHurt(me.maxHp / 4, "sofreu dano de recuo!");
  if (me.item === "life-orb" && me.ability !== "sheer-force") selfHurt(me.maxHp / 10, "perdeu HP por causa da Life Orb!");

  const mult = AB.secondaryMult(me);
  const roll = (pct: number) => rng() * 100 < (pct > 0 ? pct : 100) * mult;
  const noSecondary = me.ability === "sheer-force" && hasSecondary(move);
  const apply = (target: Mon) => { for (const c of move.stat_changes) { const k = toStageKey(c.stat); if (k) changeStage(s, target, k, c.change, log, me); } };

  if (move.category === "damage-raise" && !me.fainted && roll(move.stat_chance)) apply(me);
  if (!foe.fainted && !noSecondary && !AB.shieldDust(foe)) {
    if (move.category === "damage-lower" && roll(move.stat_chance)) apply(foe);
        if (move.category === "damage-ailment" && (!spec.needBoosted || Object.values(foe.stages).some((v) => v > 0)) && roll(move.ailment_chance)) {
      const st = statusFromAilment(move);
      if (st && canInflict(s, foe, st, true, me)) inflict(s, foe, st, rng, log, me);
      else if (move.ailment === "confusion") confuse(s, foe, rng, log);
      else if (move.ailment === "trap" && foe.v.trap === 0) { foe.v.trap = 4 + Math.floor(rng() * 2); log.push(`${monName(foe)} foi preso!`); }
    }
    if (move.flinch_chance > 0 && !s.moved[foeSide] && foe.v.dynamax <= 0 && !AB.blocksFlinch(foe) && rng() * 100 < move.flinch_chance * mult) foe.v.flinch = true;
  }

  if (spec.removeItem && !foe.fainted && foe.item && foe.ability !== "sticky-hold") { log.push(`${monName(foe)} perdeu o item ${pretty(foe.item)}!`); foe.item = null; }
  if (spec.steal && !me.item && foe.item && !foe.fainted && foe.ability !== "sticky-hold") { me.item = foe.item; foe.item = null; log.push(`${monName(me)} roubou o item de ${monName(foe)}!`); }
  if (spec.eatBerry && foe.item?.endsWith("-berry")) {
    const b = foe.item; foe.item = null;
    if (move.name !== "incinerate") { me.item = b; eatBerry(me, log); } else log.push(`${monName(foe)} teve a berry queimada!`);
  }
  if (spec.fling) { log.push(`${monName(me)} arremessou ${pretty(me.item ?? "")}!`); me.item = null; }
  if (spec.naturalGift && me.item) { me.v.lastItem = me.item; me.item = null; }
  if (spec.power === "spitUp") {
    me.stages.def = clamp(me.stages.def - me.v.stockpile, -6, 6);
    me.stages.spd = clamp(me.stages.spd - me.v.stockpile, -6, 6);
    me.v.stockpile = 0;
  }
  if (spec.ability === "gastro" && !foe.fainted && foe.ability) { foe.ability = null; log.push(`A habilidade de ${monName(foe)} foi suprimida!`); }
  if (spec.smackDown && !foe.fainted) { foe.v.smackedDown = true; foe.v.levitate = 0; foe.v.semi = false; log.push(`${monName(foe)} foi derrubado no chão!`); }
  if (spec.stealBoosts) { for (const k of STAGE_KEYS) if (foe.stages[k] > 0) { me.stages[k] = clamp(me.stages[k] + foe.stages[k], -6, 6); foe.stages[k] = 0; } }
  if (spec.power === "smelling" && foe.status === "par") foe.status = null;
  if (spec.power === "wakeup" && foe.status === "slp") foe.status = null;
  if (spec.dreamEater) heal(me, total / 2);
  if (spec.loseType && !me.fainted) me.types = me.types.filter((t) => t !== spec.loseType);
  if (spec.teraBlast && me.tera === "stellar") { changeStage(s, me, "atk", -1, log, null); changeStage(s, me, "spa", -1, log, null); }
  if (spec.clearHazards && total > 0) { s.sides[side].hazards = { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false }; me.v.trap = 0; me.v.leechSeed = false; }
  if (spec.haze && !foe.fainted) { me.stages = zeroStages(); foe.stages = zeroStages(); }
  if (spec.recharge && total > 0) me.v.recharge = true;

  if (mx) {
    if (mx.weather) setWeather(s, mx.weather, me, log);
    if (mx.terrain) setTerrain(s, mx.terrain, me, log);
    if (mx.self && !me.fainted) changeStage(s, me, mx.self[0], mx.self[1], log, null);
    if (mx.foe && !foe.fainted) changeStage(s, foe, mx.foe[0], mx.foe[1], log, me);
  }

  if (gm) applyGmax(s, side, me, foe, gm.effect, rng, log);

  if (spec.forceSwitch && !foe.fainted && !foe.v.ingrain && foe.v.dynamax <= 0 && foe.ability !== "suction-cups") {
    const bench = s.sides[foeSide].team.map((m, i) => ({ m, i })).filter(({ m, i }) => !m.fainted && i !== s.sides[foeSide].active);
    if (bench.length > 0) {
      const pick = at(bench, Math.floor(rng() * bench.length));
      log.push(`${monName(foe)} foi arrastado para longe!`);
      doSwitch(s, foeSide, pick.i, rng, log);
    }
  }
  return total;
}

// ---------------------------------------------------------------
// Execução de uma ação de golpe
// ---------------------------------------------------------------
function confusionHit(s: BattleState, side: SideIndex, me: Mon, rng: Rng, log: string[]): void {
  const A = statValue(s, me, "atk", me.stages.atk);
  const D = Math.max(1, statValue(s, me, "def", me.stages.def));
  const base = Math.floor(Math.floor(((Math.floor((2 * me.data.level) / 5) + 2) * 40 * A) / D) / 50) + 2;
  const r = hurt(me, Math.max(1, Math.floor(base * (0.85 + rng() * 0.15))));
  log.push(`${monName(me)} se machucou na confusão!`);
  if (r.fainted) announceFaint(s, side, me, log);
}

function chosenMove(s: BattleState, side: SideIndex, a: MoveAction): BattleMoveData {
  const me = activeMon(s, side);
  const idx = me.v.charging ?? me.v.rampage?.index ?? (me.v.encore?.index ?? a.index);
  return effMove(me, idx < 0 ? STRUGGLE : at(me.data.moves, idx));
}
function movePriority(s: BattleState, side: SideIndex, a: MoveAction): number {
  const me = activeMon(s, side);
  if (me.v.recharge) return 0;
  const mv = chosenMove(s, side, a);
  return mv.priority + AB.priorityBonus(me, mv);
}

function executeMove(s: BattleState, side: SideIndex, a: MoveAction, rng: Rng, log: string[]): void {
  const me = activeMon(s, side);
  const foeSide = otherSide(side);
  s.moved[side] = true;
  me.v.destinyBond = false;
  me.v.glaive = false;

  if (me.v.recharge) { me.v.recharge = false; log.push(`${monName(me)} precisa recarregar!`); return; }

  const forced = me.v.charging !== null || me.v.rampage !== null;
  const index = me.v.charging ?? me.v.rampage?.index ?? (me.v.encore && (me.ppLeft[me.v.encore.index] ?? 0) > 0 ? me.v.encore.index : a.index);
  const base = index < 0 ? STRUGGLE : at(me.data.moves, index);
  const baseSpec = specOf(base);
  const usableAsleep = baseSpec.sleepTalk || baseSpec.needSleep;

  if (me.status === "slp") {
    if (me.sleepLeft > 0) {
      me.sleepLeft--;
      if (!usableAsleep) { log.push(`${monName(me)} está dormindo...`); return; }
    } else { me.status = null; me.v.nightmare = false; log.push(`${monName(me)} acordou!`); }
  }
  if (me.status === "frz") {
    if (rng() < 0.2) { me.status = null; log.push(`${monName(me)} descongelou!`); }
    else { log.push(`${monName(me)} está congelado e não consegue se mexer!`); return; }
  }
  if (me.v.flinch) { log.push(`${monName(me)} se encolheu e não conseguiu atacar!`); if (me.ability === "steadfast") changeStage(s, me, "spe", 1, log, null); return; }
  if (me.v.confusion > 0) {
    me.v.confusion--;
    if (me.v.confusion === 0) log.push(`${monName(me)} saiu da confusão!`);
    else { log.push(`${monName(me)} está confuso!`); if (rng() < 1 / 3) { confusionHit(s, side, me, rng, log); return; } }
  }
  if (me.v.infatuated && rng() < 0.5) { log.push(`${monName(me)} está apaixonado e não conseguiu atacar!`); return; }
  if (me.status === "par" && rng() < 0.25) { log.push(`${monName(me)} está paralisado e não conseguiu se mexer!`); return; }
  if (me.ability === "truant") {
    if (me.v.loafing) { me.v.loafing = false; log.push(`${monName(me)} está relaxando.`); return; }
    me.v.loafing = true;
  }

  const useZ = a.gimmick === "z" && canZ(s, side, index);
  const move = me.v.dynamax > 0 ? effMove(me, base) : useZ ? zVersion(base) : base;
  const spec = specOf(move);

  if (!spec.protect) me.v.protectCount = 0;
  if (!forced && index >= 0) {
    me.ppLeft[index] = (me.ppLeft[index] ?? 1) - (activeMon(s, foeSide).ability === "pressure" ? 2 : 1);
    if (isChoice(me.item) && me.v.dynamax <= 0) me.v.lockedMove = index;
    me.v.lastIndex = index;
  }
  if (useZ) { s.sides[side].gimmicks.z = true; me.flags.zUsed = true; log.push(`${monName(me)} liberou todo o seu poder Z!`); }

  const type = resolveType(s, me, move);
  if ((me.ability === "protean" || me.ability === "libero") && type !== "typeless" && move.damage_class !== "status" && !me.tera && (me.types.length !== 1 || me.types[0] !== type)) {
    me.types = [type]; me.baseTypes = [type];
    log.push(`${monName(me)} mudou para o tipo ${pretty(type)}!`);
  }
  if (me.v.powdered && type === "fire") { hazardHurt(s, side, me, me.maxHp / 4, "explodiu com o pó!", log); return; }

  log.push(`${monName(me)} usou ${pretty(move.name)}!`);
  const repeated = !!spec.noRepeat && me.v.lastMove === base.name;
  me.v.lastMove = base.name;
  s.lastMoveUsed = base.name;
  if (repeated) { log.push("Mas falhou!"); return; }

  if (spec.firstTurn && !spec.protect && me.turnsOut > 0) { log.push("Mas falhou!"); return; }
  if (spec.focusPunch && me.v.hitPhysical + me.v.hitSpecial > 0) { log.push(`${monName(me)} perdeu a concentração!`); return; }
  if (spec.sucker) {
    const fa = s.ctx?.actions[foeSide];
    if (!(fa && fa.kind === "move" && !s.moved[foeSide] && isDamaging(chosenMove(s, foeSide, fa)))) { log.push("Mas falhou!"); return; }
  }
  if (spec.selfKo && (activeMon(s, foeSide).ability === "damp" || me.ability === "damp")) { log.push("O golpe foi impedido pela umidade!"); return; }

  if (spec.bide) {
    const b = me.v.bide;
    if (!b) { me.v.bide = { turns: 2, dmg: 0 }; me.v.charging = index; log.push(`${monName(me)} está acumulando energia!`); return; }
    b.dmg += me.v.hitPhysical + me.v.hitSpecial;
    if (--b.turns > 0) { me.v.charging = index; log.push(`${monName(me)} continua acumulando energia!`); return; }
    me.v.bide = null; me.v.charging = null;
    const target = activeMon(s, foeSide);
    if (b.dmg <= 0 || typeMult("normal", defTypes(target)) === 0) { log.push("Mas falhou!"); return; }
    const r = hurt(target, b.dmg * 2);
    log.push(`${monName(me)} liberou a energia! ${monName(target)} perdeu ${Math.round((r.dealt / target.maxHp) * 100)}% do HP.`);
    if (r.fainted) announceFaint(s, foeSide, target, log);
    return;
  }
  if (!isDamaging(move) && targetsSelf(move) && !spec.snatch) {
    const thief = activeMon(s, foeSide);
    if (thief.v.snatch && !thief.fainted) {
      thief.v.snatch = false;
      log.push(`${monName(thief)} roubou o golpe!`);
      callMove(s, foeSide, move, rng, log, 1);
      return;
    }
  }

  if (spec.twoTurn && me.v.charging === null && !(spec.twoTurn === "sun" && (baseWx(s) === "sun" || me.ability === "mega-sol"))) {
    me.v.charging = index;
    me.v.semi = spec.twoTurn === "semi";
    log.push(`${monName(me)} está se preparando!`);
    return;
  }
  me.v.charging = null;
  me.v.semi = false;

  let ok: boolean;
  if (isDamaging(move)) {
    const total = runAttack(s, side, me, move, spec, useZ, rng, log);
    ok = total > 0 || spec.fixed !== undefined || !!spec.ohko;
  } else ok = runStatus(s, side, me, move, spec, useZ, rng, log);

  if (spec.futureSight) {
    const foe = activeMon(s, foeSide);
    const r = calcDamageBetween(s, me, side, foe, foeSide, move);
    s.sides[foeSide].futureSight = { turns: 3, damage: Math.floor((r.min + r.max) / 2) };
    log.push(`${monName(me)} previu um ataque para o futuro!`);
  }
  if (spec.rampage) {
    if (!me.v.rampage) me.v.rampage = { index, turns: 2 + Math.floor(rng() * 2) };
    me.v.rampage.turns--;
    if (me.v.rampage.turns <= 0 || !ok) { me.v.rampage = null; if (!me.fainted) confuse(s, me, rng, log); }
  }
  if (spec.selfKo && !me.fainted) {
    if (spec.healingWish) s.sides[side].healingWish = true;
    hurt(me, me.hp);
    announceFaint(s, side, me, log);
  }
  if (spec.baton) s.baton = { ...me.stages };
  if (move.name === "glaive-rush") me.v.glaive = true;
  if (spec.pivot && ok && !me.fainted && s.winner === null && benchCount(s, side) > 0 && canSwitch(s, side)) s.pivot = side;
}

// ---------------------------------------------------------------
// Fim do turno
// ---------------------------------------------------------------
const sandImmune = (m: Mon) => defTypes(m).some((t) => ["rock", "ground", "steel"].includes(t)) || ["sand-veil", "sand-rush", "sand-force", "magic-guard", "overcoat"].includes(m.ability ?? "");
const hailImmune = (m: Mon) => defTypes(m).includes("ice") || ["ice-body", "snow-cloak", "magic-guard", "overcoat", "slush-rush"].includes(m.ability ?? "");

function endOfTurn(s: BattleState, rng: Rng, log: string[]): void {
  const w = baseWx(s);
  const order = ([0, 1] as const).slice().sort((a, b) => effSpeedOf(s, activeMon(s, b), b) - effSpeedOf(s, activeMon(s, a), a));

  for (const side of order) {
    if (s.winner !== null) break;
    const m = activeMon(s, side);
    if (m.fainted) continue;
    const foe = activeMon(s, otherSide(side));
    const amt = (frac: number) => Math.max(1, Math.floor(m.maxHp * frac));
    const dmg = (frac: number, msg: string) => {
      if (m.fainted || m.ability === "magic-guard") return;
      const r = hurt(m, amt(frac));
      log.push(`${monName(m)} ${msg}`);
      if (r.fainted) announceFaint(s, side, m, log);
    };
    const mend = (frac: number, msg: string) => { if (!m.fainted && m.hp < m.maxHp && heal(m, amt(frac)) > 0) log.push(`${monName(m)} ${msg}`); };

    if (w === "sand" && !sandImmune(m)) dmg(1 / 16, "sofreu com a tempestade de areia!");
    if (w === "hail" && !hailImmune(m)) dmg(1 / 16, "sofreu com o granizo!");
    if (w === "rain") { if (m.ability === "rain-dish") mend(1 / 16, "recuperou HP com a chuva."); if (m.ability === "dry-skin") mend(1 / 8, "recuperou HP com a chuva."); }
    if (w === "sun" && (m.ability === "dry-skin" || m.ability === "solar-power")) dmg(1 / 8, "sofreu com o sol forte!");
    if ((w === "snow" || w === "hail") && m.ability === "ice-body") mend(1 / 16, "recuperou HP com a neve.");
    if (s.field.terrain === "grassy" && isGrounded(s, m)) mend(1 / 16, "recuperou HP com a grama.");
    if (m.item === "leftovers") mend(1 / 16, "recuperou HP com a Leftovers.");
    if (m.item === "black-sludge") { if (defTypes(m).includes("poison")) mend(1 / 16, "recuperou HP com a Black Sludge."); else dmg(1 / 8, "foi ferido pela Black Sludge!"); }

    if (m.v.leechSeed && !m.fainted && m.ability !== "magic-guard") {
      const r = hurt(m, amt(1 / 8));
      log.push(`${monName(m)} teve o HP sugado pelas sementes!`);
      if (!foe.fainted) heal(foe, r.dealt);
      if (r.fainted) announceFaint(s, side, m, log);
    }
    if (m.status === "brn") dmg(1 / 16, "sofreu com a queimadura!");
    else if (m.status === "psn") { if (m.ability === "poison-heal") mend(1 / 8, "recuperou HP com o veneno."); else dmg(1 / 8, "sofreu com o veneno!"); }
    else if (m.status === "tox") {
      if (m.ability === "poison-heal") mend(1 / 8, "recuperou HP com o veneno.");
      else { dmg(m.toxCount / 16, "sofreu com o veneno!"); m.toxCount = Math.min(15, m.toxCount + 1); }
    }
    if (m.v.nightmare && !m.fainted) { if (m.status === "slp") dmg(1 / 4, "está tendo pesadelos!"); else m.v.nightmare = false; }
    if (m.status === "slp" && foe.ability === "bad-dreams") dmg(1 / 8, "sofreu com pesadelos!");
    if (m.v.trap > 0 && !m.fainted) { m.v.trap--; dmg(1 / 8, "sofreu por estar preso!"); }
    if (m.v.cursed && !m.fainted) dmg(1 / 4, "sofreu com a maldição!");
    if (m.v.ingrain) mend(1 / 16, "absorveu nutrientes com as raízes.");
    if (m.v.aquaRing) mend(1 / 16, "recuperou HP com o Aqua Ring.");

    if (m.v.perish > 0 && !m.fainted) {
      m.v.perish--;
      log.push(`A contagem de ${monName(m)} é ${m.v.perish}!`);
      if (m.v.perish === 0) { hurt(m, m.hp); announceFaint(s, side, m, log); }
    }

    if (!m.fainted) {
      if (m.ability === "speed-boost" && m.turnsOut > 0) changeStage(s, m, "spe", 1, log, null);
      if (m.ability === "moody") {
        const up = at(STAGE_KEYS, Math.floor(rng() * STAGE_KEYS.length));
        changeStage(s, m, up, 2, log, null);
        const down = at(STAGE_KEYS.filter((k) => k !== up), Math.floor(rng() * 6));
        changeStage(s, m, down, -1, log, null);
      }
      if (m.status && ((m.ability === "hydration" && w === "rain") || (m.ability === "shed-skin" && rng() < 1 / 3))) { m.status = null; log.push(`${monName(m)} curou o próprio status!`); }
      if (m.item === "flame-orb" && canInflict(s, m, "brn")) inflict(s, m, "brn", rng, log);
      if (m.item === "toxic-orb" && canInflict(s, m, "tox")) inflict(s, m, "tox", rng, log);
      if (m.ability === "harvest" && !m.item && m.v.berry && (w === "sun" || rng() < 0.5)) { m.item = m.v.berry; log.push(`${monName(m)} colheu a berry de volta!`); }
      if (m.v.yawn > 0 && --m.v.yawn === 0 && canInflict(s, m, "slp")) inflict(s, m, "slp", rng, log);
      if (m.v.taunt > 0 && --m.v.taunt === 0) log.push(`${monName(m)} não está mais provocado.`);
      if (m.v.healBlock > 0) m.v.healBlock--;
      if (m.v.levitate > 0) m.v.levitate--;
      if (m.v.encore && --m.v.encore.turns <= 0) m.v.encore = null;
      if (m.v.disable && --m.v.disable.turns <= 0) m.v.disable = null;
      if (foe.ability !== "unnerve") {
        if (m.item === "sitrus-berry" && m.hp <= m.maxHp / 2) eatBerry(m, log);
        if (m.item === "lum-berry" && m.status) eatBerry(m, log);
      }
      if (m.v.dynamax > 0 && --m.v.dynamax === 0) endDynamax(m, log);
    }
    if (m.v.octolock && !m.fainted) { changeStage(s, m, "def", -1, log, foe); changeStage(s, m, "spd", -1, log, foe); }
    if (m.v.gmaxDot && !m.fainted) {
      const d = m.v.gmaxDot;
      if (d.turns-- > 0 && !m.types.includes(d.type)) dmg(1 / 6, "sofreu com a energia Gigantamax!");
      if (d.turns <= 0) m.v.gmaxDot = null;
    }
    if (m.v.laserFocus > 0) m.v.laserFocus--;
    if (m.v.embargo > 0 && --m.v.embargo === 0 && s.field.magicRoom === 0) restoreItem(m);
    if (m.flags.iceface && (w === "snow" || w === "hail")) { m.flags.iceface = false; log.push(`${monName(m)} recuperou a cobertura de gelo!`); }
    if (m.v.saltCure && !m.fainted) dmg(defTypes(m).some((t) => t === "water" || t === "steel") ? 1 / 4 : 1 / 8, "sofreu com o sal!");
    m.v.flinch = false;
    m.v.roosted= false;
    m.turnsOut++;
  }

  for (const side of [0, 1] as const) {
    const st = s.sides[side];
    const m = activeMon(s, side);
    if (st.wish && --st.wish.turns <= 0) {
      if (!m.fainted && heal(m, st.wish.hp) > 0) log.push(`O desejo de ${monName(m)} se realizou!`);
      st.wish = null;
    }
    if (st.futureSight && --st.futureSight.turns <= 0) {
      if (!m.fainted) {
        const r = hurt(m, st.futureSight.damage);
        log.push(`${monName(m)} foi atingido pelo ataque do futuro!`);
        if (r.fainted) announceFaint(s, side, m, log);
      }
      st.futureSight = null;
    }
    for (const k of ["reflect", "lightScreen", "auroraVeil"] as const) {
      if (st.screens[k] > 0 && --st.screens[k] === 0) log.push(`${SCREEN_LABEL[k]} de ${SIDE_LABEL[side]} acabou.`);
    }
    if (st.tailwind > 0 && --st.tailwind === 0) log.push(`O vento favorável de ${SIDE_LABEL[side]} acabou.`);
    if (st.safeguard > 0) st.safeguard--;
    if (st.mist > 0) st.mist--;
    if (st.luckyChant > 0) st.luckyChant--;
  }
  if (s.field.weather && !isPermanentWeather(s.field.weather) && --s.field.weatherTurns <= 0) { log.push(WEATHER_END[s.field.weather]); s.field.weather = null; }
  if (s.field.terrain && --s.field.terrainTurns <= 0) { log.push(TERRAIN_END[s.field.terrain]); s.field.terrain = null; }
  if (s.field.trickRoom > 0 && --s.field.trickRoom === 0) log.push("A dimensão voltou ao normal.");
  if (s.field.gravity > 0) s.field.gravity--;
  if (s.field.mudSport > 0) s.field.mudSport--;
  if (s.field.waterSport > 0) s.field.waterSport--;
  if (s.field.wonderRoom > 0) s.field.wonderRoom--;
  if (s.field.fairyLock > 0) s.field.fairyLock--;
  s.field.ionDeluge = false;
  if (s.field.magicRoom > 0 && --s.field.magicRoom === 0) {
    for (const sd of [0, 1] as const) { const m = activeMon(s, sd); if (m.v.embargo === 0) restoreItem(m); }
    log.push("Os itens voltaram a funcionar.");
  }
  checkPermanentWeather(s, log);
}

function finishTurn(s: BattleState): void {
  for (const side of [0, 1] as const) {
    s.pending[side] = s.winner === null && activeMon(s, side).fainted && benchCount(s, side) > 0;
  }
}

function advance(s: BattleState, rng: Rng, log: string[]): void {
  const ctx = s.ctx;
  if (!ctx) return;
  while (ctx.queue.length > 0 && s.winner === null && s.pivot === null) {
    const side = ctx.queue.shift() as SideIndex;
    const a = ctx.actions[side];
    if (a.kind !== "move" || activeMon(s, side).fainted) continue;
    executeMove(s, side, a, rng, log);
  }
  if (s.pivot !== null) return;
  if (s.winner === null) endOfTurn(s, rng, log);
  finishTurn(s);
  s.ctx = null;
}

export function playTurn(prev: BattleState, actions: [Action, Action], rng: Rng): { state: BattleState; log: string[] } {
  const s = structuredClone(prev);
  const log: string[] = [];
  s.turn++;
  s.moved = [false, false];
  s.lastWasSwitch = [false, false];
  for (const side of [0, 1] as const) {
    const m = activeMon(s, side);
    m.v.protect = null; m.v.endure = false; m.v.hitPhysical = 0; m.v.hitSpecial = 0;
    m.v.magicCoat = false; m.v.electrified = false; m.v.powdered = false; m.v.snatch = false;
  }
  log.push(`— Turno ${s.turn} —`);

  for (const side of [0, 1] as const) {
    const a = actions[side];
    if (a.kind === "move" && a.gimmick && a.gimmick !== "z") activateGimmick(s, side, a, log);
  }
  for (const side of [0, 1] as const) {
    const a = actions[side];
    if (a.kind === "switch") { doSwitch(s, side, a.to, rng, log); s.lastWasSwitch[side] = true; }
  }

  const priority = (side: SideIndex) => { const a = actions[side]; return a.kind === "move" ? movePriority(s, side, a) : 0; };
  const movers = ([0, 1] as const).filter((side) => actions[side].kind === "move");
  movers.sort((x, y) => {
    const dp = priority(y) - priority(x);
    if (dp !== 0) return dp;
    const sx = effSpeedOf(s, activeMon(s, x), x), sy = effSpeedOf(s, activeMon(s, y), y);
    if (sx !== sy) return s.field.trickRoom > 0 ? sx - sy : sy - sx;
    return rng() < 0.5 ? -1 : 1;
  });

  s.ctx = { actions, queue: movers };
  advance(s, rng, log);
  return { state: s, log };
}

export function resumePivot(prev: BattleState, side: SideIndex, to: number, rng: Rng): { state: BattleState; log: string[] } {
  const s = structuredClone(prev);
  const log: string[] = [];
  const baton = s.baton;
  const sub = s.passSub;
  s.baton = null;
  s.passSub = 0;
  doSwitch(s, side, to, rng, log);
  if (baton) activeMon(s, side).stages = baton;
  if (sub > 0) activeMon(s, side).v.substitute = sub;
  s.pivot = null;
  advance(s, rng, log);
  return { state: s, log };
}

export function replaceFainted(prev: BattleState, side: SideIndex, to: number, rng: Rng): { state: BattleState; log: string[] } {
  const s = structuredClone(prev);
  const log: string[] = [];
  if (at(s.sides[side].team, to).fainted) throw new Error("Esse Pokémon já desmaiou");
  doSwitch(s, side, to, rng, log);
  s.pending[side] = false;
  return { state: s, log };
}