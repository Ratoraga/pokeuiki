export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type StatBlock = Record<StatKey, number>;

export const STAT_LABELS: Record<StatKey, string> = {
  hp: "HP",
  atk: "Ataque",
  def: "Defesa",
  spa: "Atq. Esp.",
  spd: "Def. Esp.",
  spe: "Velocidade",
};

type Nature = { plus: StatKey | null; minus: StatKey | null };
const neutral: Nature = { plus: null, minus: null };

export const NATURES: Record<string, Nature> = {
  hardy: neutral,
  lonely: { plus: "atk", minus: "def" },
  brave: { plus: "atk", minus: "spe" },
  adamant: { plus: "atk", minus: "spa" },
  naughty: { plus: "atk", minus: "spd" },
  bold: { plus: "def", minus: "atk" },
  docile: neutral,
  relaxed: { plus: "def", minus: "spe" },
  impish: { plus: "def", minus: "spa" },
  lax: { plus: "def", minus: "spd" },
  timid: { plus: "spe", minus: "atk" },
  hasty: { plus: "spe", minus: "def" },
  serious: neutral,
  jolly: { plus: "spe", minus: "spa" },
  naive: { plus: "spe", minus: "spd" },
  modest: { plus: "spa", minus: "atk" },
  mild: { plus: "spa", minus: "def" },
  quiet: { plus: "spa", minus: "spe" },
  bashful: neutral,
  rash: { plus: "spa", minus: "spd" },
  calm: { plus: "spd", minus: "atk" },
  gentle: { plus: "spd", minus: "def" },
  sassy: { plus: "spd", minus: "spe" },
  careful: { plus: "spd", minus: "spa" },
  quirky: neutral,
};

export const NATURE_NAMES = Object.keys(NATURES);

export function natureLabel(name: string): string {
  const n = NATURES[name];
  if (!n || !n.plus || !n.minus) return "neutra";
  return `+${STAT_LABELS[n.plus]} / -${STAT_LABELS[n.minus]}`;
}

export function calcStats(
  base: StatBlock,
  ivs: StatBlock,
  evs: StatBlock,
  level: number,
  nature: string
): StatBlock {
  const n = NATURES[nature] ?? neutral;
  const out = {} as StatBlock;

  for (const key of STAT_KEYS) {
    const core = Math.floor(((2 * base[key] + ivs[key] + Math.floor(evs[key] / 4)) * level) / 100);
    if (key === "hp") {
      out.hp = base.hp === 1 ? 1 : core + level + 10; // Shedinja
    } else {
      const mult = n.plus === key ? 1.1 : n.minus === key ? 0.9 : 1;
      out[key] = Math.floor((core + 5) * mult);
    }
  }
  return out;
}