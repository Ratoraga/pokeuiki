import { sql } from "./db";
import {
  applyStatModifiers,
  defenseAdjust,
  defenseNotes,
  effectiveMoveType,
  offenseNotes,
} from "./shared/modifiers";
import { TYPES } from "./shared/pokemonTypes";
import { STAT_KEYS, calcStats, type StatBlock } from "./shared/stats";
import type { Analysis, AnalysisMember, TeamDetail } from "./shared/api";

export async function analyzeTeam(team: TeamDetail): Promise<Analysis | null> {
  const rows = (await sql`
    SELECT attacker, defender, multiplier::float8 AS multiplier
    FROM type_effectiveness`) as { attacker: string; defender: string; multiplier: number }[];

  if (rows.length === 0) return null; // PokeAPI ainda não importada

  const chart = new Map<string, number>();
  for (const r of rows) chart.set(`${r.attacker}>${r.defender}`, Number(r.multiplier));
  const mult = (attacker: string, defender: string) => chart.get(`${attacker}>${defender}`) ?? 1;

  /** Multiplicador de um tipo atacante contra um Pokémon de 1 ou 2 tipos. */
  const against = (attacker: string, defenders: string[]) =>
    defenders.reduce((acc, def) => acc * mult(attacker, def), 1);
  const typesOf = (m: { type1: string; type2: string | null }) =>
    m.type2 ? [m.type1, m.type2] : [m.type1];

  // ---- Defesa (com habilidades e itens) ----
  const defense = TYPES.map((attacker) => {
    let weak = 0;
    let resist = 0;
    let immune = 0;
    for (const m of team.members) {
      const base = against(attacker, typesOf(m));
      const value = defenseAdjust(
        { ability: m.ability?.name ?? null, item: m.item?.name ?? null },
        attacker,
        base
      );
      if (value === 0) immune++;
      else if (value > 1) weak++;
      else if (value < 1) resist++;
    }
    return { type: attacker as string, weak, resist, immune };
  });

  // ---- Ataque: tipos dos golpes (considerando Pixilate, Normalize etc.) ----
  const attackTypes = new Set<string>();
  const stabFallback: number[] = [];
  for (const m of team.members) {
    const ability = m.ability?.name ?? null;
    const damaging = m.moves.filter((mv) => mv.damage_class !== "status" && mv.power !== null);
    if (damaging.length > 0) {
      for (const mv of damaging) attackTypes.add(effectiveMoveType(mv.type, ability));
    } else {
      stabFallback.push(m.id);
      for (const t of typesOf(m)) attackTypes.add(t);
    }
  }

  const bestAgainst = (defenders: string[]) =>
    Math.max(0, ...[...attackTypes].map((a) => against(a, defenders)));

  // Cobertura contra tipos únicos
  const superEffective: string[] = [];
  const notCovered: string[] = [];
  for (const t of TYPES) (bestAgainst([t]) > 1 ? superEffective : notCovered).push(t);

  // Cobertura contra as combinações de tipos que existem de verdade (incluindo tipos duplos)
  const comboRows = (await sql`
    SELECT DISTINCT type1, type2 FROM pokemon
    WHERE base_hp > 0
    ORDER BY type1, type2`) as { type1: string; type2: string | null }[];

  const combos: string[][] =
    comboRows.length > 0
      ? comboRows.map((r) => (r.type2 ? [r.type1, r.type2] : [r.type1]))
      : TYPES.map((t) => [t as string]);
  const uncovered = combos.filter((c) => bestAgainst(c) <= 1);

  // ---- Status finais: fórmula + bônus de itens e habilidades ----
  const members: AnalysisMember[] = team.members.map((m) => {
    const ability = m.ability?.name ?? null;
    const item = m.item?.name ?? null;

    const raw = calcStats(m.base, m.ivs, m.evs, m.level, m.nature);
    const { stats, notes: statNotes } = applyStatModifiers(raw, {
      ability,
      item,
      speciesId: m.species_id,
      canEvolve: m.can_evolve,
    });

    return {
      id: m.id,
      species: m.name,
      nickname: m.nickname,
      types: typesOf(m),
      stats,
      total: STAT_KEYS.reduce((sum, k) => sum + stats[k], 0),
      notes: [...statNotes, ...defenseNotes({ ability, item }), ...offenseNotes(ability)],
    };
  });

  const highest = {} as Analysis["highest"];
  const average = {} as StatBlock;
  for (const key of STAT_KEYS) {
    let top: AnalysisMember | null = null;
    for (const m of members) {
      if (top === null || m.stats[key] > top.stats[key]) top = m;
    }
    highest[key] = top ? { member_id: top.id, value: top.stats[key] } : null;
    average[key] = members.length
      ? Math.round(members.reduce((sum, m) => sum + m.stats[key], 0) / members.length)
      : 0;
  }

  return {
    members,
    highest,
    average,
    defense,
    offense: {
      attackTypes: [...attackTypes],
      superEffective,
      notCovered,
      stabFallback,
      combos: { total: combos.length, covered: combos.length - uncovered.length, uncovered },
    },
  };
}