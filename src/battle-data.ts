import { sql } from "./db";
import { getTeamDetail } from "./repositories/teams";
import type { Member, Move } from "./shared/api";
import { GMAX_MOVES, MEGA_STONES, applyMoveFix } from "./shared/battle/data";
import type {
  BattleGmaxData, BattleMegaData, BattleMonData, BattleMoveData, BattleTeamData,
} from "./shared/battle/types";
import { applyStatModifiers } from "./shared/modifiers";
import { calcStats } from "./shared/stats";

interface MoveMeta {
  id: number; priority: number; target: string | null; category: string | null; ailment: string | null;
  ailment_chance: number; stat_chance: number; stat_changes: string; drain: number; healing: number;
  flinch_chance: number; crit_rate: number; min_hits: number | null; max_hits: number | null;
}

export type BattleTeamResult =
  | { ok: true; team: BattleTeamData }
  | { ok: false; status: number; error: string };

function parseStatChanges(text: string | undefined): { stat: string; change: number }[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as { stat: string; change: number }[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toBattleMove(mv: Move, meta: MoveMeta | undefined): BattleMoveData {
  return {
    id: mv.id, name: mv.name, type: mv.type, damage_class: mv.damage_class, power: mv.power,
    accuracy: mv.accuracy, pp: Math.floor(((mv.pp ?? 5) * 8) / 5),
    priority: meta?.priority ?? 0, category: meta?.category ?? "unknown", ailment: meta?.ailment ?? "none",
    ailment_chance: meta?.ailment_chance ?? 0, stat_chance: meta?.stat_chance ?? 0,
    stat_changes: parseStatChanges(meta?.stat_changes), target: meta?.target ?? "selected-pokemon",
    drain: meta?.drain ?? 0, healing: meta?.healing ?? 0, flinch_chance: meta?.flinch_chance ?? 0,
    crit_rate: meta?.crit_rate ?? 0, min_hits: meta?.min_hits ?? null, max_hits: meta?.max_hits ?? null,
  };
}

async function megaFor(m: Member, normalHp: number): Promise<BattleMegaData | null> {
  const slug = m.item ? MEGA_STONES[m.item.name] : undefined;
  if (!slug || !slug.startsWith(m.name)) return null;

  const [p] = (await sql`
    SELECT id, name, type1, type2, NULLIF(sprite, '') AS sprite,
           base_hp, base_atk, base_def, base_spa, base_spd, base_spe
    FROM pokemon WHERE name = ${slug}`) as {
    id: number; name: string; type1: string; type2: string | null; sprite: string | null;
    base_hp: number; base_atk: number; base_def: number; base_spa: number; base_spd: number; base_spe: number;
  }[];
  if (!p) return null; // forma Mega não importada

  const [ab] = (await sql`
    SELECT a.name FROM pokemon_abilities pa JOIN abilities a ON a.id = pa.ability_id
    WHERE pa.pokemon_id = ${p.id} ORDER BY pa.is_hidden, pa.ability_id LIMIT 1`) as { name: string }[];
  const ability = ab?.name ?? null;

  const raw = calcStats(
    { hp: p.base_hp, atk: p.base_atk, def: p.base_def, spa: p.base_spa, spd: p.base_spd, spe: p.base_spe },
    m.ivs, m.evs, m.level, m.nature
  );
  const { stats } = applyStatModifiers(raw, { ability, item: null, speciesId: p.id, canEvolve: false });
  return {
    pokemon_id: p.id, sprite: p.sprite, species: p.name,
    types: p.type2 ? [p.type1, p.type2] : [p.type1],
    stats: { ...stats, hp: normalHp }, ability,
  };
}

/** Espécies com Gigantamax recebem a forma (sprite) se ela estiver importada. */
async function gmaxFor(m: Member): Promise<BattleGmaxData | null> {
  if (!GMAX_MOVES[m.name]) return null;
  const form = `${m.name}-gmax`;
  const [p] = (await sql`SELECT id, NULLIF(sprite, '') AS sprite FROM pokemon WHERE name = ${form}`) as {
    id: number; sprite: string | null;
  }[];
  return { pokemon_id: p?.id ?? m.pokemon_id, sprite: p?.sprite ?? null };
}

export async function getBattleTeam(teamId: number, viewerId: number | null): Promise<BattleTeamResult> {
  const team = await getTeamDetail(teamId, viewerId);
  if (!team) return { ok: false, status: 404, error: "Time não encontrado" };
  if (team.members.length === 0) return { ok: false, status: 400, error: "Este time não tem Pokémon" };

  const moveIds = [...new Set(team.members.flatMap((m) => m.moves.map((mv) => mv.id)))];
  const metaRows =
    moveIds.length === 0
      ? []
      : ((await sql`
          SELECT id, priority, target, category, ailment, ailment_chance, stat_chance, stat_changes,
                 drain, healing, flinch_chance, crit_rate, min_hits, max_hits
          FROM moves
          WHERE id IN (
            SELECT t.value::int
            FROM jsonb_array_elements_text(${JSON.stringify(moveIds)}::text::jsonb) AS t(value)
          )`) as MoveMeta[]);

  if (metaRows.some((r) => r.category === null)) {
    return { ok: false, status: 503, error: "Dados de batalha dos golpes ainda não importados. Rode: bun run db:import" };
  }
  const meta = new Map<number, MoveMeta>(metaRows.map((r) => [r.id, r] as [number, MoveMeta]));

  const pokemonIds = team.members.map((m) => m.pokemon_id);
  const infoRows = (await sql`
    SELECT id, weight, NULLIF(sprite, '') AS sprite FROM pokemon
    WHERE id IN (SELECT t.value::int FROM jsonb_array_elements_text(${JSON.stringify(pokemonIds)}::text::jsonb) AS t(value))`) as {
    id: number; weight: number | null; sprite: string | null;
  }[];
  const info = new Map(infoRows.map((r) => [r.id, r] as [number, (typeof infoRows)[number]]));

  const mons: BattleMonData[] = [];
  for (const m of team.members) {
    const ability = m.ability?.name ?? null;
    const item = m.item?.name ?? null;
    const raw = calcStats(m.base, m.ivs, m.evs, m.level, m.nature);
    const { stats } = applyStatModifiers(raw, { ability, item, speciesId: m.species_id, canEvolve: m.can_evolve });
    const row = info.get(m.pokemon_id);

    mons.push({
      pokemon_id: m.pokemon_id, species_id: m.species_id, species: m.name, nickname: m.nickname,
      types: m.type2 ? [m.type1, m.type2] : [m.type1], level: m.level, stats, ability, item,
      weight: (row?.weight ?? 600) / 10, sprite: row?.sprite ?? null,
      moves: m.moves.map((mv) => applyMoveFix(toBattleMove(mv, meta.get(mv.id)))),
      mega: await megaFor(m, stats.hp),
      gmax: await gmaxFor(m),
    });
  }
  return { ok: true, team: { id: team.id, name: team.name, mons } };
}

/** Todos os golpes com dados de batalha (usado por Metronome, Copycat e Mirror Move). */
export async function listAllBattleMoves(): Promise<BattleMoveData[]> {
  const rows = (await sql`
    SELECT id, name, type, damage_class, power, accuracy, pp, priority, target, category, ailment,
           ailment_chance, stat_chance, stat_changes, drain, healing, flinch_chance, crit_rate, min_hits, max_hits
    FROM moves WHERE id < 10000 AND category IS NOT NULL ORDER BY id`) as (Omit<BattleMoveData, "stat_changes" | "pp" | "target"> & {
    stat_changes: string; pp: number | null; target: string | null;
  })[];
  return rows.map((r) => applyMoveFix({
    ...r,
    pp: r.pp ?? 5,
    target: r.target ?? "selected-pokemon",
    stat_changes: parseStatChanges(r.stat_changes),
  }));
}