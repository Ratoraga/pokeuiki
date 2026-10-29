import { sql } from "../db";
import type { AbilityRef, Item, Move, PokemonDetail, PokemonSummary } from "../shared/api";

export async function listPokemon(): Promise<PokemonSummary[]> {
  return (await sql`
    SELECT id, name, type1, type2, NULLIF(sprite, '') AS sprite
    FROM pokemon ORDER BY id`) as PokemonSummary[];
}

export async function getPokemonDetail(id: number): Promise<PokemonDetail | null> {
  const [p] = (await sql`
    SELECT id, name, type1, type2, species_id, can_evolve, height, weight,
           base_hp, base_atk, base_def, base_spa, base_spd, base_spe
    FROM pokemon WHERE id = ${id}`) as (PokemonSummary & {
    species_id: number | null;
    can_evolve: boolean;
    height: number | null;
    weight: number | null;
    base_hp: number; base_atk: number; base_def: number;
    base_spa: number; base_spd: number; base_spe: number;
  })[];
  if (!p) return null;

  const abilities = (await sql`
    SELECT a.id, a.name, pa.is_hidden, a.description
    FROM pokemon_abilities pa
    JOIN abilities a ON a.id = pa.ability_id
    WHERE pa.pokemon_id = ${id}
    ORDER BY pa.is_hidden, a.name`) as AbilityRef[];

  const moves = (await sql`
    SELECT m.id, m.name, m.type, m.damage_class, m.power, m.accuracy, m.pp, m.effect
    FROM pokemon_moves pm
    JOIN moves m ON m.id = pm.move_id
    WHERE pm.pokemon_id = ${id}
    ORDER BY m.name`) as Move[];

  return {
    id: p.id,
    name: p.name,
    type1: p.type1,
    type2: p.type2,
    species_id: p.species_id ?? p.id,
    can_evolve: p.can_evolve,
    height: p.height,
    weight: p.weight,
    base: { hp: p.base_hp, atk: p.base_atk, def: p.base_def, spa: p.base_spa, spd: p.base_spd, spe: p.base_spe },
    abilities,
    moves,
  };
}

export async function listItems(): Promise<Item[]> {
  return (await sql`SELECT id, name FROM items ORDER BY name`) as Item[];
}