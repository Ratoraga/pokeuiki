import type { BattleMoveData, StageKey, Terrain, Weather } from "./types";

type PowerRule =
  | "weight" | "weightRatio" | "gyro" | "electro" | "hpProp" | "flail" | "return" | "hex" | "venoshock"
  | "facade" | "acrobatics" | "knockoff" | "brine" | "weatherBall" | "stored" | "punish" | "wring"
  | "triple" | "firstMover" | "magnitude" | "fling" | "payback" | "revenge" | "assurance" | "smelling" 
  | "wakeup"| "spitUp" | "trumpCard" | "naturalGift" | "hardPress" | "lastRespects" | "rageFist";

/** Regras especiais de golpes que não dá para ler só dos dados genéricos. */
export interface MoveSpec {
  noop?: boolean;
  protect?: "protect" | "endure" | "spiky" | "kings" | "baneful" | "obstruct" | "silk" | "burning";
  weather?: Weather; terrain?: Terrain; trickRoom?: boolean; tailwind?: boolean;
  screen?: "reflect" | "lightScreen" | "auroraVeil";
  hazard?: "stealthRock" | "spikes" | "toxicSpikes" | "stickyWeb";
  clearHazards?: "self" | "both";
  pivot?: boolean; baton?: boolean; forceSwitch?: boolean;
  fixed?: number | "level" | "half" | "endeavor" | "psywave" | "gambit" | "threeQuarters";
  ohko?: boolean; counter?: "physical" | "special" | "both";
  recharge?: boolean; twoTurn?: "plain" | "semi" | "sun"; rampage?: boolean;
  selfKo?: boolean; healingWish?: boolean;
  heal?: number | "weather" | "sand"; roost?: boolean; rest?: boolean; wish?: boolean;
  cureTeam?: boolean; cureSelf?: boolean; painSplit?: boolean; ingrain?: boolean; aquaRing?: boolean;
  substitute?: boolean; bellyDrum?: boolean; curse?: boolean; focusEnergy?: boolean; haze?: boolean;
  invert?: boolean; trick?: boolean; destinyBond?: boolean;
  leechSeed?: boolean; yawn?: boolean; taunt?: boolean;
  firstTurn?: boolean; sucker?: boolean; focusPunch?: boolean; futureSight?: boolean; removeItem?: boolean;
  power?: PowerRule; defends?: "def"; attacks?: "def" | "foe-atk"; teraBlast?: boolean; alwaysCrit?: boolean;
  encore?: boolean; disable?: boolean; torment?: boolean; healBlock?: boolean; perish?: boolean;
  attract?: boolean; nightmare?: boolean; trapFoe?: boolean; safeguard?: boolean; mist?: boolean;
  luckyChant?: boolean; gravity?: boolean; sport?: "mud" | "water";
  ability?: "skill" | "role" | "entrain" | "gastro" | "simple" | "worry";
  steal?: boolean; eatBerry?: boolean; fling?: boolean;
  swap?: "all" | "atkspa" | "defspd"; psychUp?: boolean; split?: "atkspa" | "defspd";
  powerTrick?: boolean; acupressure?: boolean; stealBoosts?: boolean;
  lockOn?: boolean; floatTurns?: number; identify?: boolean; smackDown?: boolean;
  setType?: string; addType?: string; loseType?: string; copyType?: boolean; camouflage?: boolean;
  conversion?: boolean; electrify?: boolean; powder?: boolean; magicCoat?: boolean;
  metronome?: boolean; copycat?: boolean; mirrorMove?: boolean; sleepTalk?: boolean; mimic?: boolean;
  transform?: boolean; revival?: boolean; tidyUp?: boolean; spite?: boolean;
  needSleep?: boolean; dreamEater?: boolean;
  bp?: number; beatUp?: boolean; present?: boolean; needBerry?: boolean; naturalGift?: boolean; bide?: boolean;
  meFirst?: boolean; assist?: boolean; bestow?: boolean; conversion2?: boolean; courtChange?: boolean;
  grudge?: boolean; imprison?: boolean; laserFocus?: boolean; naturePower?: boolean; octolock?: boolean;
  psychoShift?: boolean; purify?: boolean; recycle?: boolean; snatch?: boolean; speedSwap?: boolean;
  stockpile?: boolean; swallow?: boolean; strengthSap?: boolean; embargo?: boolean; magicRoom?: boolean;
  wonderRoom?: boolean; ionDeluge?: boolean; fairyLock?: boolean; shedTail?: boolean; powerShift?: boolean;
  healCure?: number; selfStats?: [StageKey, number][]; foeStats?: [StageKey, number][];
  hpCost?: number; cureOnUse?: boolean; eatOwnBerry?: boolean; noRetreat?: boolean;
  hazardOnHit?: "spikes" | "stealthRock"; selfDamage?: number; seBoost?: number;   noRepeat?: boolean; fickle?: boolean; breaksProtect?: boolean; clearTerrain?: boolean; needBoosted?: boolean;
  healBlockHit?: number; breakScreens?: boolean; saltCure?: boolean; crash?: boolean;
}

const EMPTY: MoveSpec = {};
const NOOP_SPEC: MoveSpec = { noop: true };

const SPECS: Record<string, MoveSpec> = {
  protect: { protect: "protect" }, detect: { protect: "protect" }, endure: { protect: "endure" },
  "max-guard": { protect: "protect" }, "mat-block": { protect: "protect", firstTurn: true },
  "spiky-shield": { protect: "spiky" }, "kings-shield": { protect: "kings" },
  "baneful-bunker": { protect: "baneful" }, obstruct: { protect: "obstruct" },
  "silk-trap": { protect: "silk" }, "burning-bulwark": { protect: "burning" },
  "rain-dance": { weather: "rain" }, "sunny-day": { weather: "sun" }, sandstorm: { weather: "sand" },
  hail: { weather: "hail" }, snowscape: { weather: "snow" }, "chilly-reception": { weather: "snow", pivot: true },
  "electric-terrain": { terrain: "electric" }, "grassy-terrain": { terrain: "grassy" },
  "misty-terrain": { terrain: "misty" }, "psychic-terrain": { terrain: "psychic" },
  "trick-room": { trickRoom: true }, tailwind: { tailwind: true },
  reflect: { screen: "reflect" }, "light-screen": { screen: "lightScreen" }, "aurora-veil": { screen: "auroraVeil" },
  "stealth-rock": { hazard: "stealthRock" }, spikes: { hazard: "spikes" },
  "toxic-spikes": { hazard: "toxicSpikes" }, "sticky-web": { hazard: "stickyWeb" },
  "rapid-spin": { clearHazards: "self" }, "mortal-spin": { clearHazards: "self" }, defog: { clearHazards: "both" },
  "tidy-up": { tidyUp: true },
  "u-turn": { pivot: true }, "volt-switch": { pivot: true }, "flip-turn": { pivot: true },
  "parting-shot": { pivot: true }, teleport: { pivot: true }, "baton-pass": { pivot: true, baton: true },
  roar: { forceSwitch: true }, whirlwind: { forceSwitch: true },
  "dragon-tail": { forceSwitch: true }, "circle-throw": { forceSwitch: true },
  "seismic-toss": { fixed: "level" }, "night-shade": { fixed: "level" }, "dragon-rage": { fixed: 40 },
  "sonic-boom": { fixed: 20 }, "super-fang": { fixed: "half" }, "natures-madness": { fixed: "half" },
  ruination: { fixed: "half" }, endeavor: { fixed: "endeavor" }, psywave: { fixed: "psywave" },
  "final-gambit": { fixed: "gambit", selfKo: true },
  fissure: { ohko: true }, guillotine: { ohko: true }, "horn-drill": { ohko: true }, "sheer-cold": { ohko: true },
  counter: { counter: "physical" }, "mirror-coat": { counter: "special" }, "metal-burst": { counter: "both" },
  "hyper-beam": { recharge: true }, "giga-impact": { recharge: true }, "blast-burn": { recharge: true },
  "hydro-cannon": { recharge: true }, "frenzy-plant": { recharge: true }, "rock-wrecker": { recharge: true },
  "roar-of-time": { recharge: true }, "prismatic-laser": { recharge: true }, eternabeam: { recharge: true },
  "meteor-assault": { recharge: true },
  "solar-beam": { twoTurn: "sun" }, "solar-blade": { twoTurn: "sun" }, "sky-attack": { twoTurn: "plain" },
  "skull-bash": { twoTurn: "plain" }, "razor-wind": { twoTurn: "plain" }, "freeze-shock": { twoTurn: "plain" },
  "ice-burn": { twoTurn: "plain" }, fly: { twoTurn: "semi" }, bounce: { twoTurn: "semi" },
  dig: { twoTurn: "semi" }, dive: { twoTurn: "semi" }, "phantom-force": { twoTurn: "semi" },
  "shadow-force": { twoTurn: "semi" },
  outrage: { rampage: true }, thrash: { rampage: true }, "petal-dance": { rampage: true }, "raging-fury": { rampage: true },
  explosion: { selfKo: true }, "self-destruct": { selfKo: true }, "misty-explosion": { selfKo: true },
  memento: { selfKo: true }, "healing-wish": { selfKo: true, healingWish: true },
  "lunar-dance": { selfKo: true, healingWish: true },
  recover: { heal: 50 }, "soft-boiled": { heal: 50 }, "slack-off": { heal: 50 }, "milk-drink": { heal: 50 },
  "heal-order": { heal: 50 }, "heal-pulse": { heal: 50 }, "floral-healing": { heal: 50 },
  "jungle-healing": { heal: 25 }, roost: { heal: 50, roost: true },
  moonlight: { heal: "weather" }, synthesis: { heal: "weather" }, "morning-sun": { heal: "weather" },
  "shore-up": { heal: "sand" }, wish: { wish: true }, rest: { rest: true },
  "heal-bell": { cureTeam: true }, aromatherapy: { cureTeam: true }, refresh: { cureSelf: true },
  "pain-split": { painSplit: true }, ingrain: { ingrain: true }, "aqua-ring": { aquaRing: true },
  substitute: { substitute: true }, "belly-drum": { bellyDrum: true }, curse: { curse: true },
  "focus-energy": { focusEnergy: true }, haze: { haze: true }, "clear-smog": { haze: true },
  "topsy-turvy": { invert: true }, trick: { trick: true }, switcheroo: { trick: true },
  "destiny-bond": { destinyBond: true },
  "leech-seed": { leechSeed: true }, yawn: { yawn: true }, taunt: { taunt: true },
  "fake-out": { firstTurn: true }, "first-impression": { firstTurn: true },
  "sucker-punch": { sucker: true }, "focus-punch": { focusPunch: true },
  "future-sight": { futureSight: true }, "doom-desire": { futureSight: true },
  "knock-off": { power: "knockoff", removeItem: true }, "corrosive-gas": { removeItem: true },
  "low-kick": { power: "weight" }, "grass-knot": { power: "weight" },
  "heavy-slam": { power: "weightRatio" }, "heat-crash": { power: "weightRatio" },
  "gyro-ball": { power: "gyro" }, "electro-ball": { power: "electro" },
  eruption: { power: "hpProp" }, "water-spout": { power: "hpProp" }, "dragon-energy": { power: "hpProp" },
  flail: { power: "flail" }, reversal: { power: "flail" }, return: { power: "return" },
  hex: { power: "hex" }, venoshock: { power: "venoshock" }, facade: { power: "facade" },
  acrobatics: { power: "acrobatics" }, brine: { power: "brine" }, "weather-ball": { power: "weatherBall" },
  "stored-power": { power: "stored" }, "power-trip": { power: "stored" }, punishment: { power: "punish" },
  "wring-out": { power: "wring" }, "crush-grip": { power: "wring" },
  "triple-kick": { power: "triple" }, "triple-axel": { power: "triple" },
  "bolt-beak": { power: "firstMover" }, "fishious-rend": { power: "firstMover" }, magnitude: { power: "magnitude" },
  payback: { power: "payback" }, revenge: { power: "revenge" }, avalanche: { power: "revenge" },
  assurance: { power: "assurance" }, "smelling-salts": { power: "smelling" }, "wake-up-slap": { power: "wakeup" },
  psyshock: { defends: "def" }, psystrike: { defends: "def" }, "secret-sword": { defends: "def" },
  "body-press": { attacks: "def" }, "foul-play": { attacks: "foe-atk" }, "tera-blast": { teraBlast: true },
  "frost-breath": { alwaysCrit: true }, "storm-throw": { alwaysCrit: true },
  "wicked-blow": { alwaysCrit: true }, "surging-strikes": { alwaysCrit: true },
  encore: { encore: true }, disable: { disable: true }, torment: { torment: true }, "heal-block": { healBlock: true },
  "perish-song": { perish: true }, attract: { attract: true }, nightmare: { nightmare: true },
  "mean-look": { trapFoe: true }, block: { trapFoe: true }, "spider-web": { trapFoe: true },
  safeguard: { safeguard: true }, mist: { mist: true }, "lucky-chant": { luckyChant: true },
  gravity: { gravity: true }, "mud-sport": { sport: "mud" }, "water-sport": { sport: "water" },
  "skill-swap": { ability: "skill" }, "role-play": { ability: "role" }, entrainment: { ability: "entrain" },
  "gastro-acid": { ability: "gastro" }, "core-enforcer": { ability: "gastro" },
  "simple-beam": { ability: "simple" }, "worry-seed": { ability: "worry" },
  thief: { steal: true }, covet: { steal: true },
  "bug-bite": { eatBerry: true }, pluck: { eatBerry: true }, incinerate: { eatBerry: true },
  fling: { fling: true, power: "fling" },
  "heart-swap": { swap: "all" }, "power-swap": { swap: "atkspa" }, "guard-swap": { swap: "defspd" },
  "psych-up": { psychUp: true }, "guard-split": { split: "defspd" }, "power-split": { split: "atkspa" },
  "power-trick": { powerTrick: true }, acupressure: { acupressure: true }, "spectral-thief": { stealBoosts: true },
  "lock-on": { lockOn: true }, "mind-reader": { lockOn: true },
  "magnet-rise": { floatTurns: 5 }, telekinesis: { floatTurns: 3 },
  foresight: { identify: true }, "odor-sleuth": { identify: true }, "miracle-eye": { identify: true },
  "smack-down": { smackDown: true }, "thousand-arrows": { smackDown: true },
  soak: { setType: "water" }, "trick-or-treat": { addType: "ghost" }, "forests-curse": { addType: "grass" },
  camouflage: { camouflage: true }, conversion: { conversion: true }, "reflect-type": { copyType: true },
  "burn-up": { loseType: "fire" }, "double-shock": { loseType: "electric" },
  electrify: { electrify: true }, powder: { powder: true }, "magic-coat": { magicCoat: true },
  metronome: { metronome: true }, copycat: { copycat: true }, "mirror-move": { mirrorMove: true },
  "sleep-talk": { sleepTalk: true }, mimic: { mimic: true }, transform: { transform: true },
  "revival-blessing": { revival: true }, spite: { spite: true },
  snore: { needSleep: true }, "dream-eater": { dreamEater: true },
    "beat-up": { beatUp: true, bp: 5 }, belch: { needBerry: true }, bide: { bide: true, bp: 1 },
  frustration: { power: "return" }, "pika-papow": { power: "return" }, "veevee-volley": { power: "return" },
  "guardian-of-alola": { fixed: "threeQuarters" }, "me-first": { meFirst: true },
  "natural-gift": { power: "naturalGift", naturalGift: true }, present: { present: true, bp: 40 },
  "spit-up": { power: "spitUp" }, "trump-card": { power: "trumpCard" },
  assist: { assist: true }, bestow: { bestow: true }, "conversion-2": { conversion2: true },
  "court-change": { courtChange: true }, grudge: { grudge: true }, imprison: { imprison: true },
  "laser-focus": { laserFocus: true }, "magic-powder": { setType: "psychic" },
  "nature-power": { naturePower: true }, octolock: { octolock: true }, "psycho-shift": { psychoShift: true },
  purify: { purify: true }, recycle: { recycle: true }, sketch: { mimic: true }, snatch: { snatch: true },
  "speed-swap": { speedSwap: true }, stockpile: { stockpile: true }, swallow: { swallow: true },
  "strength-sap": { strengthSap: true },
  "shell-smash": { selfStats: [["def", -1], ["spd", -1], ["atk", 2], ["spa", 2], ["spe", 2]] },
  "no-retreat": { selfStats: [["atk", 1], ["def", 1], ["spa", 1], ["spd", 1], ["spe", 1]], noRetreat: true },
  "stuff-cheeks": { eatOwnBerry: true, selfStats: [["def", 2]] },
  "fillet-away": { hpCost: 0.5, selfStats: [["atk", 2], ["spa", 2], ["spe", 2]] },
  "victory-dance": { selfStats: [["atk", 1], ["def", 1], ["spe", 1]] },
  "take-heart": { selfStats: [["spa", 1], ["spd", 1]], cureOnUse: true },
  "spicy-extract": { foeStats: [["atk", 2], ["def", -2]] },
  "lunar-blessing": { healCure: 25 }, "power-shift": { powerShift: true },
  "shed-tail": { shedTail: true, pivot: true }, "dragon-cheer": { noop: true },
  embargo: { embargo: true }, "fairy-lock": { fairyLock: true }, "ion-deluge": { ionDeluge: true },
  "magic-room": { magicRoom: true }, "wonder-room": { wonderRoom: true },
  "barb-barrage": { power: "venoshock" }, "infernal-parade": { power: "hex" },
  "ceaseless-edge": { hazardOnHit: "spikes" }, "stone-axe": { hazardOnHit: "stealthRock" },
  chloroblast: { selfDamage: 0.5 }, "collision-course": { seBoost: 1.3333 }, "electro-drift": { seBoost: 1.3333 },
  comeuppance: { counter: "both" }, "flower-trick": { alwaysCrit: true }, "hard-press": { power: "hardPress" },
  "last-respects": { power: "lastRespects" }, thunderclap: { sucker: true }, "upper-hand": { sucker: true },
  "electro-shot": { twoTurn: "plain" }, shelter: { selfStats: [["def", 2], ["eva", 1]] },   "alluring-voice": { needBoosted: true }, "blood-moon": { noRepeat: true }, "gigaton-hammer": { noRepeat: true },
  "fickle-beam": { fickle: true }, "glaive-rush": {}, "hyper-drill": { breaksProtect: true },
  "mighty-cleave": { breaksProtect: true }, "ice-spinner": { clearTerrain: true },
  "psychic-noise": { healBlockHit: 2 }, "rage-fist": { power: "rageFist" },
  "raging-bull": { breakScreens: true }, "brick-break": { breakScreens: true }, "psychic-fangs": { breakScreens: true },
  "salt-cure": { saltCure: true }, "supercell-slam": { crash: true }, "axe-kick": { crash: true },
  "high-jump-kick": { crash: true }, "jump-kick": { crash: true },
};

for (const n of [
  "breakneck-blitz", "all-out-pummeling", "supersonic-skystrike", "acid-downpour", "tectonic-rage",
  "continental-crush", "savage-spin-out", "never-ending-nightmare", "corkscrew-crash", "inferno-overdrive",
  "hydro-vortex", "bloom-doom", "gigavolt-havoc", "shattered-psyche", "subzero-slammer",
  "devastating-drake", "black-hole-eclipse", "twinkle-tackle",
]) {
  for (const c of ["physical", "special"]) SPECS[`${n}--${c}`] = { bp: 180 };
}

/** Golpes que não fazem nada em batalhas 1 contra 1 (como no jogo). */
const NOOP_SINGLES = new Set([
  "splash", "celebrate", "hold-hands", "happy-hour", "helping-hand", "follow-me", "rage-powder", "spotlight",
  "ally-switch", "after-you", "quash", "instruct", "wide-guard", "quick-guard", "crafty-shield",
  "aromatic-mist", "coaching", "magnetic-flux", "gear-up", "flower-shield", "rototiller", "teatime", "doodle",
]);


const UNMODELED = new Set<string>();

export const isComplexSpec = (s: MoveSpec) =>
  !!(s.twoTurn || s.recharge || s.rampage || s.sucker || s.focusPunch || s.futureSight || s.selfKo || s.protect ||
    s.counter || s.pivot || s.forceSwitch || s.noop || s.firstTurn || s.sleepTalk || s.metronome || s.copycat ||
    s.mirrorMove || s.mimic || s.transform || s.needSleep || s.dreamEater || s.bide || s.meFirst || s.assist ||
    s.snatch || s.shedTail);

export const specOf = (m: BattleMoveData): MoveSpec => SPECS[m.name] ?? (NOOP_SINGLES.has(m.name) ? NOOP_SPEC : EMPTY);

export const METRONOME_BANNED = new Set([
  "metronome", "copycat", "mirror-move", "sleep-talk", "transform", "struggle", "mimic", "counter",
  "mirror-coat", "destiny-bond", "protect", "detect", "endure", "focus-punch", "snore", "dream-eater",
]);

export const PUNCH = new Set(["bullet-punch", "comet-punch", "dizzy-punch", "drain-punch", "dynamic-punch", "fire-punch", "focus-punch", "hammer-arm", "ice-hammer", "ice-punch", "mach-punch", "mega-punch", "meteor-mash", "plasma-fists", "power-up-punch", "shadow-punch", "sky-uppercut", "thunder-punch", "wicked-blow", "surging-strikes", "jet-punch", "double-iron-bash", "rage-fist"]);
export const BITE = new Set(["bite", "crunch", "fire-fang", "ice-fang", "thunder-fang", "poison-fang", "psychic-fang", "hyper-fang", "jaw-lock", "fishious-rend"]);
export const PULSE = new Set(["aura-sphere", "dark-pulse", "dragon-pulse", "heal-pulse", "origin-pulse", "terrain-pulse", "water-pulse"]);
export const SLICE = new Set(["aerial-ace", "air-cutter", "air-slash", "aqua-cutter", "behemoth-blade", "bitter-blade", "ceaseless-edge", "cross-poison", "cut", "fury-cutter", "kowtow-cleave", "leaf-blade", "mighty-cleave", "night-slash", "population-bomb", "psyblade", "psycho-cut", "razor-leaf", "razor-shell", "sacred-sword", "secret-sword", "slash", "solar-blade", "stone-axe", "tachyon-cutter", "x-scissor"]);
export const SOUND = new Set(["boomburst", "bug-buzz", "chatter", "clanging-scales", "clangorous-soul", "confide", "disarming-voice", "echoed-voice", "eerie-spell", "grass-whistle", "growl", "heal-bell", "howl", "hyper-voice", "metal-sound", "noble-roar", "overdrive", "parting-shot", "perish-song", "relic-song", "roar", "round", "screech", "sing", "snarl", "snore", "sparkling-aria", "supersonic", "uproar", "torch-song", "alluring-voice", "psychic-noise"]);
export const BALL = new Set(["acid-spray", "aura-sphere", "barrage", "beak-blast", "bullet-seed", "egg-bomb", "electro-ball", "energy-ball", "focus-blast", "gyro-ball", "ice-ball", "magnet-bomb", "mist-ball", "mud-bomb", "octazooka", "pollen-puff", "pyro-ball", "rock-blast", "rock-wrecker", "searing-shot", "seed-bomb", "shadow-ball", "sludge-bomb", "weather-ball", "zap-cannon", "syrup-bomb"]);
export const POWDER = new Set(["cotton-spore", "magic-powder", "poison-powder", "powder", "rage-powder", "sleep-powder", "spore", "stun-powder", "stun-spore"]);
const NON_CONTACT = new Set(["earthquake", "bulldoze", "rock-slide", "rock-blast", "stone-edge", "bullet-seed", "icicle-spear", "pin-missile", "razor-leaf", "magnitude", "spikes", "poison-sting", "twineedle", "bonemerang", "bone-rush", "bone-club", "fissure", "explosion", "self-destruct", "thousand-arrows", "thousand-waves", "smack-down", "ice-shard", "feint", "barrage", "egg-bomb", "fling", "gunk-shot", "attack-order", "diamond-storm", "precipice-blades", "poltergeist", "shadow-bone", "dragon-darts", "tera-blast"]);

export const isContact = (m: BattleMoveData) => m.damage_class === "physical" && !NON_CONTACT.has(m.name);

export const TYPE_BOOST_ITEMS: Record<string, string> = {
  charcoal: "fire", "mystic-water": "water", "miracle-seed": "grass", magnet: "electric",
  "never-melt-ice": "ice", "black-belt": "fighting", "poison-barb": "poison", "soft-sand": "ground",
  "sharp-beak": "flying", "twisted-spoon": "psychic", "silver-powder": "bug", "hard-stone": "rock",
  "spell-tag": "ghost", "dragon-fang": "dragon", "black-glasses": "dark", "metal-coat": "steel",
  "silk-scarf": "normal", "fairy-feather": "fairy",
};

export const FLING_POWER: Record<string, number> = {
  "iron-ball": 130, "hard-stone": 100, "life-orb": 30, leftovers: 10, "choice-band": 10, "choice-specs": 10,
  "choice-scarf": 10, "assault-vest": 80, "rocky-helmet": 60, "black-sludge": 30, "toxic-orb": 30, "flame-orb": 30,
};

export const WEATHER_BALL_TYPE: Record<Weather, string> = {
  sun: "fire", rain: "water", sand: "rock", snow: "ice", hail: "ice",
  "harsh-sun": "fire", "heavy-rain": "water", "strong-winds": "normal",
};

export const isPermanentWeather = (w: Weather | null) => w === "harsh-sun" || w === "heavy-rain" || w === "strong-winds";
/** Converte climas permanentes no clima comum equivalente (Strong Winds não tem equivalente). */
export const wxBase = (w: Weather | null): Weather | null =>
  w === "harsh-sun" ? "sun" : w === "heavy-rain" ? "rain" : w === "strong-winds" ? null : w;

export const BATTLE_ITEMS = [
  "heavy-duty-boots", "rocky-helmet", "lum-berry", "black-sludge", "flame-orb", "toxic-orb",
  "weakness-policy", "air-balloon", "light-clay", "damp-rock", "heat-rock", "smooth-rock", "icy-rock",
  "terrain-extender", "scope-lens", "safety-goggles", "expert-belt", "choice-band", "choice-specs",
  "choice-scarf", "assault-vest", "focus-sash", "life-orb", "leftovers", "eviolite", "sitrus-berry",
  "booster-energy", "iron-ball",
];

// ---- Mega, Z, Dynamax ----
export const MEGA_STONES: Record<string, string> = {
  venusaurite: "venusaur-mega", "charizardite-x": "charizard-mega-x", "charizardite-y": "charizard-mega-y",
  blastoisinite: "blastoise-mega", alakazite: "alakazam-mega", gengarite: "gengar-mega",
  kangaskhanite: "kangaskhan-mega", pinsirite: "pinsir-mega", gyaradosite: "gyarados-mega",
  aerodactylite: "aerodactyl-mega", "mewtwonite-x": "mewtwo-mega-x", "mewtwonite-y": "mewtwo-mega-y",
  ampharosite: "ampharos-mega", scizorite: "scizor-mega", heracronite: "heracross-mega",
  houndoominite: "houndoom-mega", tyranitarite: "tyranitar-mega", blazikenite: "blaziken-mega",
  gardevoirite: "gardevoir-mega", mawilite: "mawile-mega", aggronite: "aggron-mega",
  medichamite: "medicham-mega", manectite: "manectric-mega", banettite: "banette-mega",
  absolite: "absol-mega", garchompite: "garchomp-mega", lucarionite: "lucario-mega",
  abomasite: "abomasnow-mega", beedrillite: "beedrill-mega", pidgeotite: "pidgeot-mega",
  slowbronite: "slowbro-mega", steelixite: "steelix-mega", sceptilite: "sceptile-mega",
  swampertite: "swampert-mega", sablenite: "sableye-mega", sharpedonite: "sharpedo-mega",
  cameruptite: "camerupt-mega", altarianite: "altaria-mega", glalitite: "glalie-mega",
  salamencite: "salamence-mega", metagrossite: "metagross-mega", latiasite: "latias-mega",
  latiosite: "latios-mega", lopunnite: "lopunny-mega", galladite: "gallade-mega",
  audinite: "audino-mega", diancite: "diancie-mega",
};

export const Z_CRYSTALS: Record<string, string> = {
  "normalium-z": "normal", "firium-z": "fire", "waterium-z": "water", "electrium-z": "electric",
  "grassium-z": "grass", "icium-z": "ice", "fightinium-z": "fighting", "poisonium-z": "poison",
  "groundium-z": "ground", "flyinium-z": "flying", "psychium-z": "psychic", "buginium-z": "bug",
  "rockium-z": "rock", "ghostium-z": "ghost", "dragonium-z": "dragon", "darkinium-z": "dark",
  "steelium-z": "steel", "fairium-z": "fairy",
};

export const Z_MOVE_NAMES: Record<string, string> = {
  normal: "breakneck-blitz", fire: "inferno-overdrive", water: "hydro-vortex", electric: "gigavolt-havoc",
  grass: "bloom-doom", ice: "subzero-slammer", fighting: "all-out-pummeling", poison: "acid-downpour",
  ground: "tectonic-rage", flying: "supersonic-skystrike", psychic: "shattered-psyche", bug: "savage-spin-out",
  rock: "continental-crush", ghost: "never-ending-nightmare", dragon: "devastating-drake",
  dark: "black-hole-eclipse", steel: "corkscrew-crash", fairy: "twinkle-tackle",
};

export function zPower(bp: number): number {
  if (bp <= 55) return 100;
  if (bp <= 65) return 120;
  if (bp <= 75) return 140;
  if (bp <= 85) return 160;
  if (bp <= 95) return 175;
  if (bp <= 100) return 180;
  if (bp <= 110) return 185;
  if (bp <= 125) return 190;
  if (bp <= 130) return 195;
  return 200;
}

export interface MaxMove {
  name: string;
  weather?: Weather;
  terrain?: Terrain;
  self?: [StageKey, number];
  foe?: [StageKey, number];
}
export const NORMAL_MAX: MaxMove = { name: "max-strike", foe: ["spe", -1] };
export const MAX_MOVES: Record<string, MaxMove> = {
  normal: NORMAL_MAX, fire: { name: "max-flare", weather: "sun" }, water: { name: "max-geyser", weather: "rain" },
  electric: { name: "max-lightning", terrain: "electric" }, grass: { name: "max-overgrowth", terrain: "grassy" },
  ice: { name: "max-hailstorm", weather: "hail" }, fighting: { name: "max-knuckle", self: ["atk", 1] },
  poison: { name: "max-ooze", self: ["spa", 1] }, ground: { name: "max-quake", self: ["spd", 1] },
  flying: { name: "max-airstream", self: ["spe", 1] }, psychic: { name: "max-mindstorm", terrain: "psychic" },
  bug: { name: "max-flutterby", foe: ["spa", -1] }, rock: { name: "max-rockfall", weather: "sand" },
  ghost: { name: "max-phantasm", foe: ["def", -1] }, dragon: { name: "max-wyrmwind", foe: ["atk", -1] },
  dark: { name: "max-darkness", foe: ["spd", -1] }, steel: { name: "max-steelspike", self: ["def", 1] },
  fairy: { name: "max-starfall", terrain: "misty" },
};
export const MAX_BY_NAME: Record<string, MaxMove> = Object.fromEntries(Object.values(MAX_MOVES).map((m) => [m.name, m]));

export function maxPower(bp: number, type: string): number {
  const low = type === "fighting" || type === "poison";
  const tiers = [40, 50, 60, 70, 110, 140];
  const normal = [90, 100, 110, 120, 130, 140, 150];
  const weak = [70, 75, 80, 85, 90, 95, 100];
  const i = tiers.findIndex((t) => bp <= t);
  return (low ? weak : normal)[i === -1 ? 6 : i] ?? 130;
}


export function isDamaging(m: BattleMoveData): boolean {
  if (m.damage_class === "status") return false;
  const s = specOf(m);  
  return m.power !== null || s.fixed !== undefined || !!s.ohko || !!s.counter || s.power !== undefined || !!s.fling || s.bp !== undefined;
}

const SUPPORTED_AILMENTS = new Set(["paralysis", "burn", "poison", "sleep", "freeze", "confusion"]);
const GENERIC_DAMAGE = new Set(["damage", "damage-ailment", "damage-lower", "damage-raise", "damage-heal"]);
const STAT_NAMES = new Set(["attack", "defense", "special-attack", "special-defense", "speed", "accuracy", "evasion"]);

export type Support = "full" | "partial" | "none";

export function moveSupport(m: BattleMoveData): Support {
  if (m.id === 0 || m.name.startsWith("max-")) return "full";
  if (UNMODELED.has(m.name)) return "none";
  if (SPECS[m.name] || NOOP_SINGLES.has(m.name)) return "full";
  if (MOVE_FIXES[m.name] !== undefined) return "full";
  if (m.damage_class !== "status") {
    if (m.power === null) return "none";
    return GENERIC_DAMAGE.has(m.category) ? "full" : "partial";
  }
  switch (m.category) {
    case "ailment": return SUPPORTED_AILMENTS.has(m.ailment) || m.ailment === "trap" ? "full" : "none";
    case "swagger": return "full";
    case "net-good-stats": return m.stat_changes.some((c) => STAT_NAMES.has(c.stat)) ? "full" : "none";
    case "heal": return m.healing > 0 ? "full" : "none";
    default: return m.category === "unknown" && m.stat_changes.length > 0 ? "full" : "none";
  }
}
export const isSupported = (m: BattleMoveData) => moveSupport(m) !== "none";

export const NATURAL_GIFT: Record<string, [string, number]> = {
  "cheri-berry": ["fire", 80], "chesto-berry": ["water", 80], "pecha-berry": ["electric", 80],
  "rawst-berry": ["grass", 80], "aspear-berry": ["ice", 80], "leppa-berry": ["fighting", 80],
  "oran-berry": ["poison", 80], "persim-berry": ["ground", 80], "lum-berry": ["flying", 80],
  "sitrus-berry": ["psychic", 80], "figy-berry": ["bug", 80], "wiki-berry": ["rock", 80],
  "mago-berry": ["ghost", 80], "aguav-berry": ["dragon", 80], "iapapa-berry": ["dark", 80],
};

export interface GmaxMove { name: string; type: string; effect: string }
/** Espécies com forma Gigantamax e seu golpe exclusivo (substitui o Max Move daquele tipo). */
export const GMAX_MOVES: Record<string, GmaxMove> = {
  venusaur: { name: "gmax-vine-lash", type: "grass", effect: "dot-grass" },
  charizard: { name: "gmax-wildfire", type: "fire", effect: "dot-fire" },
  blastoise: { name: "gmax-cannonade", type: "water", effect: "dot-water" },
  butterfree: { name: "gmax-befuddle", type: "bug", effect: "random-status" },
  pikachu: { name: "gmax-volt-crash", type: "electric", effect: "par" },
  meowth: { name: "gmax-gold-rush", type: "normal", effect: "confuse" },
  machamp: { name: "gmax-chi-strike", type: "fighting", effect: "crit" },
  gengar: { name: "gmax-terror", type: "ghost", effect: "trap" },
  kingler: { name: "gmax-foam-burst", type: "water", effect: "spe-2" },
  lapras: { name: "gmax-resonance", type: "ice", effect: "veil" },
  eevee: { name: "gmax-cuddle", type: "normal", effect: "attract" },
  snorlax: { name: "gmax-replenish", type: "normal", effect: "berry" },
  garbodor: { name: "gmax-malodor", type: "poison", effect: "psn" },
  melmetal: { name: "gmax-meltdown", type: "steel", effect: "torment" },
  rillaboom: { name: "gmax-drum-solo", type: "grass", effect: "none" },
  cinderace: { name: "gmax-fireball", type: "fire", effect: "none" },
  inteleon: { name: "gmax-hydrosnipe", type: "water", effect: "none" },
  corviknight: { name: "gmax-wind-rage", type: "flying", effect: "wind" },
  orbeetle: { name: "gmax-gravitas", type: "psychic", effect: "gravity" },
  drednaw: { name: "gmax-stonesurge", type: "water", effect: "rocks" },
  coalossal: { name: "gmax-volcalith", type: "rock", effect: "dot-rock" },
  flapple: { name: "gmax-tartness", type: "grass", effect: "eva-1" },
  appletun: { name: "gmax-sweetness", type: "grass", effect: "cure" },
  sandaconda: { name: "gmax-sandblast", type: "ground", effect: "trapdmg" },
  "toxtricity-amped": { name: "gmax-stun-shock", type: "electric", effect: "par-psn" },
  "toxtricity-low-key": { name: "gmax-stun-shock", type: "electric", effect: "par-psn" },
  centiskorch: { name: "gmax-centiferno", type: "fire", effect: "trapdmg" },
  hatterene: { name: "gmax-smite", type: "fairy", effect: "confuse" },
  grimmsnarl: { name: "gmax-snooze", type: "dark", effect: "yawn" },
  alcremie: { name: "gmax-finale", type: "fairy", effect: "heal" },
  copperajah: { name: "gmax-steelsurge", type: "steel", effect: "rocks" },
  duraludon: { name: "gmax-depletion", type: "dragon", effect: "pp" },
  "urshifu-single-strike": { name: "gmax-one-blow", type: "dark", effect: "none" },
  "urshifu-rapid-strike": { name: "gmax-rapid-flow", type: "water", effect: "none" },
};
export const GMAX_BY_NAME: Record<string, GmaxMove> = Object.fromEntries(
  Object.values(GMAX_MOVES).map((g) => [g.name, g])
);
type Fix = Partial<Omit<BattleMoveData, "id" | "name">>;
const dl = (stat: string, change: number, chance = 100): Fix => ({ category: "damage-lower", stat_changes: [{ stat, change }], stat_chance: chance });
const dr = (changes: [string, number][], chance = 100): Fix => ({ category: "damage-raise", stat_changes: changes.map(([stat, change]) => ({ stat, change })), stat_chance: chance });
const da = (ailment: string, chance: number): Fix => ({ category: "damage-ailment", ailment, ailment_chance: chance });

/** Efeitos de golpes das gerações 8 e 9 que a PokeAPI deixa sem dados de batalha. */
export const MOVE_FIXES: Record<string, Fix> = {
  "aqua-cutter": { crit_rate: 1 }, "aqua-step": dr([["speed", 1]]),
  "armor-cannon": dr([["defense", -1], ["special-defense", -1]]), "axe-kick": da("confusion", 30),
  "barb-barrage": da("poison", 50), "bitter-blade": { category: "damage-heal", drain: 50 },
  "bitter-malice": dl("attack", -1), "blazing-torque": da("burn", 30), "bleakwind-storm": dl("speed", -1, 30),
  "ceaseless-edge": { crit_rate: 1 }, "chilling-water": dl("attack", -1), "combat-torque": da("paralysis", 30),
  "dire-claw": da("poison", 50), "esper-wing": { crit_rate: 1, ...dr([["speed", 1]]) },
  "flower-trick": { accuracy: null }, "headlong-rush": dr([["defense", -1], ["special-defense", -1]]),
  "infernal-parade": da("burn", 30), "ivy-cudgel": { crit_rate: 1 }, "jet-punch": { priority: 1 },
  "kowtow-cleave": { accuracy: null }, "lumina-crash": dl("special-defense", -2),
  "magical-torque": da("confusion", 30), "make-it-rain": dr([["special-attack", -1]]),
  "malignant-chain": da("poison", 50),
  "matcha-gotcha": { category: "damage-ailment", drain: 50, ailment: "burn", ailment_chance: 20 },
  "mountain-gale": { flinch_chance: 30 }, "mystical-power": dr([["special-attack", 1]]),
  "noxious-torque": da("poison", 30), "population-bomb": { min_hits: 1, max_hits: 10 },
  pounce: dl("speed", -1), "psyshield-bash": dr([["defense", 1]]), "sandsear-storm": da("burn", 20),
  "spin-out": dr([["speed", -2]]), "springtide-storm": dl("attack", -1, 30), "stone-axe": { crit_rate: 1 },
  "syrup-bomb": dl("speed", -1), "tachyon-cutter": { accuracy: null, min_hits: 2, max_hits: 2 },
  thunderclap: { priority: 1 }, "torch-song": dr([["special-attack", 1]]), trailblaze: dr([["speed", 1]]),
  "triple-arrows": { ...dl("defense", -1, 50), flinch_chance: 30, crit_rate: 1 },
  "triple-dive": { min_hits: 3, max_hits: 3 }, "twin-beam": { min_hits: 2, max_hits: 2 },
  "upper-hand": { priority: 3, flinch_chance: 100 }, "wave-crash": { drain: -33 },
  "wicked-torque": da("sleep", 10), "wildbolt-storm": da("paralysis", 20),   "order-up": {},
  "tera-starstorm": {}, "temper-flare": {}, "hydro-steam": {}, psyblade: {},
};

export function applyMoveFix(m: BattleMoveData): BattleMoveData {
  const fix = MOVE_FIXES[m.name];
  return fix ? { ...m, ...fix } : m;
}