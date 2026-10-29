import type { StatBlock } from "../stats";

export type Rng = () => number;
export type SideIndex = 0 | 1; // 0 = jogador, 1 = bot
export type Status = "brn" | "par" | "psn" | "tox" | "slp" | "frz";
export type StatKey5 = "atk" | "def" | "spa" | "spd" | "spe";
export type StageKey = StatKey5 | "acc" | "eva";
export type Weather = "sun" | "rain" | "sand" | "snow" | "hail" | "harsh-sun" | "heavy-rain" | "strong-winds";
export type Terrain = "electric" | "grassy" | "misty" | "psychic";
export type Gimmick = "mega" | "tera" | "z" | "dynamax";

export interface BattleMoveData {
  id: number;
  name: string;
  type: string;
  damage_class: string; // physical | special | status
  power: number | null;
  accuracy: number | null;
  pp: number;
  priority: number;
  category: string;
  ailment: string;
  ailment_chance: number;
  stat_chance: number;
  stat_changes: { stat: string; change: number }[];
  target: string;
  drain: number;
  healing: number;
  flinch_chance: number;
  crit_rate: number;
  min_hits: number | null;
  max_hits: number | null;
}

export interface BattleMegaData {
  species: string;
  types: string[];
  stats: StatBlock;
  ability: string | null;
  pokemon_id: number;
  sprite: string | null;
}

export interface BattleGmaxData {
  pokemon_id: number;
  sprite: string | null;
}

export interface BattleMonData {
  pokemon_id: number;
  species_id: number;
  species: string;
  nickname: string | null;
  types: string[];
  level: number;
  stats: StatBlock;
  ability: string | null;
  item: string | null;
  weight: number; // kg
  moves: BattleMoveData[];
  mega: BattleMegaData | null;
  sprite: string | null;
  gmax: BattleGmaxData | null;
}

export interface BattleTeamData {
  id: number;
  name: string;
  mons: BattleMonData[];
}

export interface ChartRow {
  attacker: string;
  defender: string;
  multiplier: number;
}

export interface Volatile {
  confusion: number;
  leechSeed: boolean;
  substitute: number;
  taunt: number;
  yawn: number;
  trap: number;
  ingrain: boolean;
  aquaRing: boolean;
  cursed: boolean;
  flinch: boolean;
  protect: string | null;
  protectCount: number;
  endure: boolean;
  destinyBond: boolean;
  focusEnergy: boolean;
  charging: number | null;
  semi: boolean;
  recharge: boolean;
  rampage: { index: number; turns: number } | null;
  flashFire: boolean;
  lockedMove: number | null;
  roosted: boolean;
  hitPhysical: number;
  hitSpecial: number;
  lastMove: string | null;
  lastIndex: number;
  encore: { index: number; turns: number } | null;
  disable: { index: number; turns: number } | null;
  torment: boolean;
  healBlock: number;
  perish: number;
  infatuated: boolean;
  nightmare: boolean;
  noSwitch: boolean;
  lockOn: boolean;
  levitate: number;
  smackedDown: boolean;
  identified: boolean;
  electrified: boolean;
  powdered: boolean;
  magicCoat: boolean;
  charged: boolean;
  loafing: boolean;
  berry: string | null;
  dynamax: number; 
  gasSaved: { ability: string | null } | null;
  bide: { turns: number; dmg: number } | null;
  stockpile: number;
  laserFocus: number;
  octolock: boolean;
  snatch: boolean;
  imprisoned: string[];
  grudge: boolean;
  lastItem: string | null;
  embargo: number;
  itemSaved: { item: string | null } | null;
  gmaxDot: { turns: number; type: string } | null;
  glaive: boolean;
  hitsTaken: number;
  saltCure: boolean;
}

export interface OriginalForm {
  data: BattleMonData;
  species: string;
  types: string[];
  baseTypes: string[];
  ability: string | null;
  stats: StatBlock;
  ppLeft: number[];
}

export interface Mon {
  data: BattleMonData;
  species: string;
  types: string[];
  baseTypes: string[];
  ability: string | null;
  item: string | null;
  stats: StatBlock;
  hp: number;
  maxHp: number;
  baseMaxHp: number;
  status: Status | null;
  toxCount: number;
  sleepLeft: number;
  stages: Record<StageKey, number>;
  ppLeft: number[];
  turnsOut: number;
  fainted: boolean;
  tera: string | null; 
  stellarUsed: string[];
  mega: boolean;
  flags: Record<string, boolean>;
  original: OriginalForm | null; 
  v: Volatile;
}

export interface Hazards {
  stealthRock: boolean;
  spikes: number;
  toxicSpikes: number;
  stickyWeb: boolean;
}

export interface SideState {
  team: Mon[];
  active: number;
  hazards: Hazards;
  screens: { reflect: number; lightScreen: number; auroraVeil: number };
  tailwind: number;
  safeguard: number;
  mist: number;
  luckyChant: number;
  wish: { turns: number; hp: number } | null;
  futureSight: { turns: number; damage: number } | null;
  healingWish: boolean;
  gimmicks: Record<Gimmick, boolean>;
}

export interface FieldState {
  weather: Weather | null;
  weatherTurns: number;
  terrain: Terrain | null;
  terrainTurns: number;
  trickRoom: number;
  gravity: number;
  mudSport: number;
  waterSport: number;
  magicRoom: number;
  wonderRoom: number;
  ionDeluge: boolean;
  fairyLock: number;
}

export type Action =
  | { kind: "move"; index: number; gimmick?: Gimmick; teraType?: string; gmax?: boolean; }
  | { kind: "switch"; to: number };
export type MoveAction = Extract<Action, { kind: "move" }>;

export interface BattleState {
  turn: number;
  sides: [SideState, SideState];
  field: FieldState;
  pending: [boolean, boolean];
  pivot: SideIndex | null;
  baton: Record<StageKey, number> | null;
  moved: [boolean, boolean];
  lastWasSwitch: [boolean, boolean];
  lastMoveUsed: string | null;
  winner: SideIndex | null;
  ctx: { actions: [Action, Action]; queue: SideIndex[] } | null;
  passSub: number;
}