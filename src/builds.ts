import type { BuildInput } from "./shared/api";
import { NATURES, STAT_KEYS, type StatBlock } from "./shared/stats";

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function parseBlock(raw: unknown, max: number): StatBlock | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const out = {} as StatBlock;
  for (const key of STAT_KEYS) {
    const value = obj[key];
    if (!isInt(value, 0, max)) return null;
    out[key] = value;
  }
  return out;
}

/** Devolve a build validada ou uma mensagem de erro. */
export function parseBuild(body: unknown): BuildInput | string {
  if (typeof body !== "object" || body === null) return "Corpo da requisição inválido";
  const b = body as Record<string, unknown>;

  const level = b.level;
  if (!isInt(level, 1, 100)) return "O nível deve ser um inteiro entre 1 e 100";

  const nature = b.nature;
  if (typeof nature !== "string" || !Object.hasOwn(NATURES, nature)) return "Natureza inválida";

  const ivs = parseBlock(b.ivs, 31);
  if (!ivs) return "Os IVs devem ser inteiros de 0 a 31";

  const evs = parseBlock(b.evs, 252);
  if (!evs) return "Os EVs devem ser inteiros de 0 a 252";
  if (STAT_KEYS.reduce((sum, k) => sum + evs[k], 0) > 510) {
    return "O total de EVs não pode passar de 510";
  }

  const abilityId = b.ability_id ?? null;
  if (abilityId !== null && !isInt(abilityId, 1, 1_000_000)) return "Habilidade inválida";

  const itemId = b.item_id ?? null;
  if (itemId !== null && !isInt(itemId, 1, 1_000_000)) return "Item inválido";

  const moves = b.moves ?? [];
  if (!Array.isArray(moves) || moves.length > 4) return "Um Pokémon pode ter no máximo 4 golpes";
  if (!moves.every((m) => isInt(m, 1, 1_000_000))) return "Golpe inválido";
  if (new Set(moves).size !== moves.length) return "Há golpes repetidos";

  const rawNickname = b.nickname;
  let nickname: string | null = null;
  if (typeof rawNickname === "string" && rawNickname.trim()) {
    nickname = rawNickname.trim();
    if (nickname.length > 50) return "O apelido pode ter no máximo 50 caracteres";
  }

  return { nickname, level, nature, ability_id: abilityId, item_id: itemId, ivs, evs, moves: moves as number[] };
}