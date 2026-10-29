import { STAT_KEYS, type StatBlock, type StatKey } from "./stats";

export interface ModifierContext {
  ability: string | null; 
  item: string | null; 
  speciesId: number;
  canEvolve: boolean;
}

interface StatRule {
  stats: Partial<Record<StatKey, number>>;
  label: string;
  when?: (ctx: ModifierContext) => boolean;
  inactive?: string; 
}

const ITEM_STAT_RULES: Record<string, StatRule> = {
  "choice-band": { stats: { atk: 1.5 }, label: "Choice Band: +50% Ataque" },
  "choice-specs": { stats: { spa: 1.5 }, label: "Choice Specs: +50% Atq. Esp." },
  "choice-scarf": { stats: { spe: 1.5 }, label: "Choice Scarf: +50% Velocidade" },
  "assault-vest": { stats: { spd: 1.5 }, label: "Assault Vest: +50% Def. Esp. (sem golpes de status)" },
  eviolite: {
    stats: { def: 1.5, spd: 1.5 },
    label: "Eviolite: +50% Defesa e Def. Esp.",
    when: (c) => c.canEvolve,
    inactive: "Eviolite sem efeito: este Pokémon já está na forma final",
  },
  "light-ball": {
    stats: { atk: 2, spa: 2 },
    label: "Light Ball: x2 Ataque e Atq. Esp.",
    when: (c) => c.speciesId === 25,
    inactive: "Light Ball só funciona em Pikachu",
  },
  "thick-club": {
    stats: { atk: 2 },
    label: "Thick Club: x2 Ataque",
    when: (c) => c.speciesId === 104 || c.speciesId === 105,
    inactive: "Thick Club só funciona em Cubone e Marowak",
  },
  "iron-ball": { stats: { spe: 0.5 }, label: "Iron Ball: -50% Velocidade" },
};

const ABILITY_STAT_RULES: Record<string, StatRule> = {
  "huge-power": { stats: { atk: 2 }, label: "Huge Power: x2 Ataque" },
  "pure-power": { stats: { atk: 2 }, label: "Pure Power: x2 Ataque" },
  hustle: { stats: { atk: 1.5 }, label: "Hustle: +50% Ataque (menos precisão)" },
  "gorilla-tactics": { stats: { atk: 1.5 }, label: "Gorilla Tactics: +50% Ataque (preso a um golpe)" },
  "fur-coat": { stats: { def: 2 }, label: "Fur Coat: x2 Defesa" },
};

export function applyStatModifiers(
  stats: StatBlock,
  ctx: ModifierContext
): { stats: StatBlock; notes: string[] } {
  const mult: Record<StatKey, number> = { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
  const notes: string[] = [];

  const rules = [
    ctx.item ? ITEM_STAT_RULES[ctx.item] : undefined,
    ctx.ability ? ABILITY_STAT_RULES[ctx.ability] : undefined,
  ];

  for (const rule of rules) {
    if (!rule) continue;
    if (rule.when && !rule.when(ctx)) {
      if (rule.inactive) notes.push(rule.inactive);
      continue;
    }
    for (const key of STAT_KEYS) {
      const m = rule.stats[key];
      if (m !== undefined) mult[key] *= m;
    }
    notes.push(rule.label);
  }

  const out = {} as StatBlock;
  for (const key of STAT_KEYS) out[key] = Math.floor(stats[key] * mult[key]);
  return { stats: out, notes };
}


interface TypeRule {
  types: Record<string, number>;
  label: string;
}

const ABILITY_DEFENSE: Record<string, TypeRule> = {
  levitate: { types: { ground: 0 }, label: "Levitate: imune a Terra" },
  "earth-eater": { types: { ground: 0 }, label: "Earth Eater: imune a Terra" },
  "flash-fire": { types: { fire: 0 }, label: "Flash Fire: imune a Fogo" },
  "well-baked-body": { types: { fire: 0 }, label: "Well-Baked Body: imune a Fogo" },
  "water-absorb": { types: { water: 0 }, label: "Water Absorb: imune a Água" },
  "storm-drain": { types: { water: 0 }, label: "Storm Drain: imune a Água" },
  "dry-skin": { types: { water: 0, fire: 1.25 }, label: "Dry Skin: imune a Água, +25% de dano de Fogo" },
  "volt-absorb": { types: { electric: 0 }, label: "Volt Absorb: imune a Elétrico" },
  "lightning-rod": { types: { electric: 0 }, label: "Lightning Rod: imune a Elétrico" },
  "motor-drive": { types: { electric: 0 }, label: "Motor Drive: imune a Elétrico" },
  "sap-sipper": { types: { grass: 0 }, label: "Sap Sipper: imune a Planta" },
  "thick-fat": { types: { fire: 0.5, ice: 0.5 }, label: "Thick Fat: resiste a Fogo e Gelo" },
  heatproof: { types: { fire: 0.5 }, label: "Heatproof: resiste a Fogo" },
  "water-bubble": { types: { fire: 0.5 }, label: "Water Bubble: resiste a Fogo" },
  fluffy: { types: { fire: 2 }, label: "Fluffy: dano de Fogo dobrado" },
  "purifying-salt": { types: { ghost: 0.5 }, label: "Purifying Salt: resiste a Fantasma" },
  eelevate: { types: { ground: 0 }, label: "Eelevate: flutua, imune a Terra" },
};

const ITEM_DEFENSE: Record<string, TypeRule> = {
  "air-balloon": { types: { ground: 0 }, label: "Air Balloon: imune a Terra (até ser atingido)" },
};

type DefenseCtx = Pick<ModifierContext, "ability" | "item">;

/** Aplica habilidade/item ao multiplicador base de um tipo atacante. 0 = imune. */
export function defenseAdjust(ctx: DefenseCtx, attackType: string, baseValue: number): number {
  if (ctx.ability === "wonder-guard") return baseValue > 1 ? baseValue : 0;

  let value = baseValue;
  const rules = [
    ctx.ability ? ABILITY_DEFENSE[ctx.ability] : undefined,
    ctx.item ? ITEM_DEFENSE[ctx.item] : undefined,
  ];
  for (const rule of rules) {
    const m = rule?.types[attackType];
    if (m !== undefined) value *= m;
  }
  return value;
}

export function defenseNotes(ctx: DefenseCtx): string[] {
  const notes: string[] = [];
  if (ctx.ability === "wonder-guard") {
    notes.push("Wonder Guard: só sofre dano de golpes super efetivos");
  }
  const ability = ctx.ability ? ABILITY_DEFENSE[ctx.ability] : undefined;
  const item = ctx.item ? ITEM_DEFENSE[ctx.item] : undefined;
  if (ability) notes.push(ability.label);
  if (item) notes.push(item.label);
  return notes;
}

const TYPE_CONVERTERS: Record<string, { to: string; label: string }> = {
  pixilate: { to: "fairy", label: "Pixilate: golpes Normal viram Fada" },
  refrigerate: { to: "ice", label: "Refrigerate: golpes Normal viram Gelo" },
  aerilate: { to: "flying", label: "Aerilate: golpes Normal viram Voador" },
  galvanize: { to: "electric", label: "Galvanize: golpes Normal viram Elétrico" },
  dragonize: { to: "dragon", label: "Dragonize: golpes Normal viram Dragão" },
};

export function effectiveMoveType(moveType: string, ability: string | null): string {
  if (!ability) return moveType;
  if (ability === "normalize") return "normal";
  const conv = TYPE_CONVERTERS[ability];
  return conv && moveType === "normal" ? conv.to : moveType;
}

export function offenseNotes(ability: string | null): string[] {
  if (!ability) return [];
  if (ability === "normalize") return ["Normalize: todos os golpes viram Normal"];
  const conv = TYPE_CONVERTERS[ability];
  return conv ? [conv.label] : [];
}