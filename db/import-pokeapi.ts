import type { SQL } from "bun";
import { sql } from "../src/db";
import { TYPES } from "../src/shared/pokemonTypes";
import { BATTLE_ITEMS, MEGA_STONES, Z_CRYSTALS } from "../src/shared/battle/data";

const API = "https://pokeapi.co/api/v2";
const CONCURRENCY = 8;
const force = process.argv.includes("--force");
const baseOnly = process.argv.includes("--sem-formas");

interface NamedRef {
  name: string;
  url: string;
}
interface NamedList {
  results: NamedRef[];
}

const idFromUrl = (url: string) => Number(url.split("/").filter(Boolean).pop());

async function getJson<T>(url: string, attempt = 1): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status !== 404 && attempt < 4) {
      await Bun.sleep(500 * attempt);
      return getJson<T>(url, attempt + 1);
    }
    throw new Error(`Falha ao buscar ${url}: ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Executa o worker para cada item, com no máximo CONCURRENCY em paralelo. */
async function mapPool<T>(items: T[], label: string, worker: (item: T) => Promise<void>) {
  let next = 0;
  let done = 0;
  async function run() {
    while (next < items.length) {
      const item = items[next++] as T;
      await worker(item);
      done++;
      if (done % 50 === 0 || done === items.length) console.log(`  ${label}: ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, run));
}

// ---------- Tipos ----------
interface TypeResponse {
  damage_relations: {
    double_damage_to: NamedRef[];
    half_damage_to: NamedRef[];
    no_damage_to: NamedRef[];
  };
}

async function importTypes() {
  console.log("Importando tabela de tipos...");
  const known = TYPES as readonly string[];
  const rows: { attacker: string; defender: string; multiplier: number }[] = [];

  for (const type of TYPES) {
    const data = await getJson<TypeResponse>(`${API}/type/${type}`);
    const rel = data.damage_relations;
    const add = (list: NamedRef[], multiplier: number) => {
      for (const t of list) {
        if (known.includes(t.name)) rows.push({ attacker: type, defender: t.name, multiplier });
      }
    };
    add(rel.double_damage_to, 2);
    add(rel.half_damage_to, 0.5);
    add(rel.no_damage_to, 0);
  }

  await sql`DELETE FROM type_effectiveness`;
  await sql`
    INSERT INTO type_effectiveness (attacker, defender, multiplier)
    SELECT x.attacker, x.defender, x.multiplier
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::text::jsonb)
      AS x(attacker text, defender text, multiplier numeric)`;
}

// ---------- Golpes ----------
interface MoveResponse {
  id: number;
  name: string;
  type: { name: string } | null;
  damage_class: { name: string } | null;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number | null;
  target: { name: string } | null;
  effect_chance: number | null;
  effect_entries: { short_effect: string; language: { name: string } }[];
  stat_changes: { change: number; stat: { name: string } }[];
  meta: {
    category: { name: string };
    ailment: { name: string };
    ailment_chance: number;
    crit_rate: number;
    drain: number;
    flinch_chance: number;
    healing: number;
    max_hits: number | null;
    min_hits: number | null;
    stat_chance: number;
  } | null;
}

async function importMoves() {
  console.log("Importando golpes...");
  const list = await getJson<NamedList>(`${API}/move?limit=100000`);
  const have = new Set(
    ((await sql`SELECT id FROM moves WHERE category IS NOT NULL AND effect IS NOT NULL`) as {
      id: number;
    }[]).map((r) => r.id)
  );
  const todo = list.results.filter((m) => force || !have.has(idFromUrl(m.url)));

  await mapPool(todo, "golpes", async (ref) => {
    const m = await getJson<MoveResponse>(ref.url);
    const meta = m.meta;
    const statChanges = JSON.stringify(
      m.stat_changes.map((s) => ({ stat: s.stat.name, change: s.change }))
    );
    const effect = (m.effect_entries.find((e) => e.language.name === "en")?.short_effect ?? "")
      .replaceAll("$effect_chance", String(m.effect_chance ?? ""));

    await sql`
      INSERT INTO moves (id, name, type, damage_class, power, accuracy, pp, priority, target, category,
                         ailment, ailment_chance, stat_chance, stat_changes, drain, healing,
                         flinch_chance, crit_rate, min_hits, max_hits, effect)
      VALUES (${m.id}, ${m.name}, ${m.type?.name ?? "normal"}, ${m.damage_class?.name ?? "status"},
              ${m.power}, ${m.accuracy}, ${m.pp}, ${m.priority ?? 0}, ${m.target?.name ?? null},
              ${meta?.category.name ?? "unknown"}, ${meta?.ailment.name ?? "none"},
              ${meta?.ailment_chance ?? 0}, ${meta?.stat_chance ?? 0}, ${statChanges},
              ${meta?.drain ?? 0}, ${meta?.healing ?? 0}, ${meta?.flinch_chance ?? 0},
              ${meta?.crit_rate ?? 0}, ${meta?.min_hits ?? null}, ${meta?.max_hits ?? null}, ${effect})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, type = EXCLUDED.type, damage_class = EXCLUDED.damage_class,
        power = EXCLUDED.power, accuracy = EXCLUDED.accuracy, pp = EXCLUDED.pp,
        priority = EXCLUDED.priority, target = EXCLUDED.target, category = EXCLUDED.category,
        ailment = EXCLUDED.ailment, ailment_chance = EXCLUDED.ailment_chance,
        stat_chance = EXCLUDED.stat_chance, stat_changes = EXCLUDED.stat_changes,
        drain = EXCLUDED.drain, healing = EXCLUDED.healing, flinch_chance = EXCLUDED.flinch_chance,
        crit_rate = EXCLUDED.crit_rate, min_hits = EXCLUDED.min_hits, max_hits = EXCLUDED.max_hits,
        effect = EXCLUDED.effect`;
  });
}

// ---------- Itens ----------
async function importItems() {
  console.log("Importando itens...");
  const data = await getJson<{ items: NamedRef[] }>(`${API}/item-attribute/holdable`);
  const rows = data.items.map((i) => ({ id: idFromUrl(i.url), name: i.name }));
  const have = new Set(rows.map((r) => r.name));

  const extra = [
    ...Object.keys(MEGA_STONES),
    ...Object.keys(Z_CRYSTALS),
    ...BATTLE_ITEMS,
  ].filter((n) => !have.has(n));

  await mapPool(extra, "itens extras", async (name) => {
    try {
      const it = await getJson<{ id: number; name: string }>(`${API}/item/${name}`);
      rows.push({ id: it.id, name: it.name });
    } catch {
      console.warn(`  ! item não encontrado: ${name}`);
    }
  });

  await sql`
    INSERT INTO items (id, name)
    SELECT x.id, x.name
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::text::jsonb) AS x(id int, name text)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`;
  console.log(`  itens: ${rows.length}`);
}

// ---------- Pokémon ----------
interface PokemonResponse {
  id: number;
  name: string;
  height: number;
  weight: number;
  species: NamedRef;
  sprites: {
    front_default: string | null;
    other?: {
      home?: { front_default: string | null };
      "official-artwork"?: { front_default: string | null };
    };
  };
  types: { slot: number; type: NamedRef }[];
  stats: { base_stat: number; stat: NamedRef }[];
  abilities: { is_hidden: boolean; ability: NamedRef }[];
  moves: { move: NamedRef }[];
}

async function importPokemon() {
  console.log("Importando Pokémon e formas (isso demora alguns minutos)...");
  const list = await getJson<NamedList>(`${API}/pokemon?limit=100000`);

  const have = new Set(
    ((await sql`
      SELECT id FROM pokemon
      WHERE base_hp > 0 AND species_id IS NOT NULL AND weight IS NOT NULL AND sprite IS NOT NULL`) as {
      id: number;
    }[]).map((r) => r.id)
  );
  const todo = list.results.filter((p) => {
    const id = idFromUrl(p.url);
    if (baseOnly && id >= 10000) return false;
    return force || !have.has(id);
  });

  await mapPool(todo, "pokémon", async (ref) => {
    const p = await getJson<PokemonResponse>(ref.url);

    const stat = (name: string) => p.stats.find((s) => s.stat.name === name)?.base_stat ?? 0;
    const type1 = p.types.find((t) => t.slot === 1)?.type.name;
    if (!type1) return;
    const type2 = p.types.find((t) => t.slot === 2)?.type.name ?? null;
    const speciesId = idFromUrl(p.species.url);
    const sprite =
      p.sprites.front_default ??
      p.sprites.other?.home?.front_default ??
      p.sprites.other?.["official-artwork"]?.front_default ??
      "";

    const abilities = p.abilities.map((a) => ({
      id: idFromUrl(a.ability.url),
      name: a.ability.name,
      is_hidden: a.is_hidden,
    }));
    const moveIds = [...new Set(p.moves.map((m) => idFromUrl(m.move.url)))];

    await sql.begin(async (tx: SQL) => {
      await tx`
        INSERT INTO pokemon (id, name, type1, type2, species_id, height, weight, sprite,
                             base_hp, base_atk, base_def, base_spa, base_spd, base_spe)
        VALUES (${p.id}, ${p.name}, ${type1}, ${type2}, ${speciesId}, ${p.height}, ${p.weight}, ${sprite},
                ${stat("hp")}, ${stat("attack")}, ${stat("defense")},
                ${stat("special-attack")}, ${stat("special-defense")}, ${stat("speed")})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, type1 = EXCLUDED.type1, type2 = EXCLUDED.type2,
          species_id = EXCLUDED.species_id, height = EXCLUDED.height, weight = EXCLUDED.weight,
          sprite = EXCLUDED.sprite,
          base_hp = EXCLUDED.base_hp, base_atk = EXCLUDED.base_atk, base_def = EXCLUDED.base_def,
          base_spa = EXCLUDED.base_spa, base_spd = EXCLUDED.base_spd, base_spe = EXCLUDED.base_spe`;

      const abilitiesJson = JSON.stringify(abilities);
      await tx`
        INSERT INTO abilities (id, name)
        SELECT x.id, x.name
        FROM jsonb_to_recordset(${abilitiesJson}::text::jsonb) AS x(id int, name text, is_hidden boolean)
        ON CONFLICT (id) DO NOTHING`;

      await tx`DELETE FROM pokemon_abilities WHERE pokemon_id = ${p.id}`;
      await tx`
        INSERT INTO pokemon_abilities (pokemon_id, ability_id, is_hidden)
        SELECT ${p.id}::int, x.id, x.is_hidden
        FROM jsonb_to_recordset(${abilitiesJson}::text::jsonb) AS x(id int, name text, is_hidden boolean)
        ON CONFLICT DO NOTHING`;

      await tx`DELETE FROM pokemon_moves WHERE pokemon_id = ${p.id}`;
      await tx`
        INSERT INTO pokemon_moves (pokemon_id, move_id)
        SELECT ${p.id}::int, m.id
        FROM jsonb_array_elements_text(${JSON.stringify(moveIds)}::text::jsonb) AS t(value)
        JOIN moves m ON m.id = t.value::int
        ON CONFLICT DO NOTHING`;
    });
  });
}

async function inheritFormMoves() {
  console.log("Copiando golpes para formas sem lista própria...");
  await sql`
    INSERT INTO pokemon_moves (pokemon_id, move_id)
    SELECT p.id, pm.move_id
    FROM pokemon p
    JOIN pokemon_moves pm ON pm.pokemon_id = p.species_id
    WHERE p.id >= 10000
      AND NOT EXISTS (SELECT 1 FROM pokemon_moves x WHERE x.pokemon_id = p.id)
    ON CONFLICT DO NOTHING`;
}

// ---------- Evoluções (quem ainda pode evoluir) ----------
interface ChainLink {
  species: NamedRef;
  evolves_to: ChainLink[];
}

async function importEvolutions() {
  console.log("Importando cadeias de evolução...");
  const list = await getJson<{ results: { url: string }[] }>(`${API}/evolution-chain?limit=100000`);
  const canEvolve = new Set<number>();

  await mapPool(list.results, "evoluções", async (ref) => {
    const data = await getJson<{ chain: ChainLink }>(ref.url);
    const walk = (link: ChainLink) => {
      if (link.evolves_to.length > 0) canEvolve.add(idFromUrl(link.species.url));
      link.evolves_to.forEach(walk);
    };
    walk(data.chain);
  });

  await sql`UPDATE pokemon SET can_evolve = FALSE`;
  await sql`
    UPDATE pokemon SET can_evolve = TRUE
    WHERE species_id IN (
      SELECT t.value::int
      FROM jsonb_array_elements_text(${JSON.stringify([...canEvolve])}::text::jsonb) AS t(value)
    )`;
}
async function importAbilities() {
  console.log("Importando descrições das habilidades...");
  const list = await getJson<NamedList>(`${API}/ability?limit=100000`);
  const done = new Set(
    ((await sql`SELECT id FROM abilities WHERE description IS NOT NULL`) as { id: number }[]).map(
      (r) => r.id
    )
  );
  const todo = list.results.filter((a) => force || !done.has(idFromUrl(a.url)));

  await mapPool(todo, "habilidades", async (ref) => {
    const a = await getJson<{
      id: number;
      effect_entries: { short_effect: string; language: { name: string } }[];
    }>(ref.url);
    const text = a.effect_entries.find((e) => e.language.name === "en")?.short_effect ?? "";
    await sql`UPDATE abilities SET description = ${text} WHERE id = ${a.id}`;
  });
}

await importTypes();
await importMoves();
await importItems();
await importPokemon();
await importAbilities();
await importEvolutions();

console.log("Importação concluída.");
await sql.close();