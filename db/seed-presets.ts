import type { SQL } from "bun";
import { sql } from "../src/db";
import { BOT_USERNAME } from "../src/shared/api";
import type { StatKey } from "../src/shared/stats";

const force = process.argv.includes("--force");

interface SetData {
  pokemon: string;
  nature: string;
  ability?: string;
  item?: string;
  evs: Partial<Record<StatKey, number>>;
  moves: string[];
}
interface PresetTeam {
  name: string;
  description: string;
  members: SetData[];
}

const PRESETS: PresetTeam[] = [
  {
    name: "Clássicos de Kanto",
    description: "Os favoritos da primeira geração, com builds simples para começar.",
    members: [
      { pokemon: "charizard", nature: "timid", ability: "blaze", item: "life-orb", evs: { hp: 4, spa: 252, spe: 252 }, moves: ["flamethrower", "air-slash", "focus-blast", "dragon-pulse"] },
      { pokemon: "blastoise", nature: "modest", ability: "torrent", item: "sitrus-berry", evs: { hp: 252, spa: 252, spd: 4 }, moves: ["surf", "ice-beam", "dark-pulse", "aura-sphere"] },
      { pokemon: "venusaur", nature: "modest", ability: "overgrow", item: "leftovers", evs: { hp: 252, spa: 252, spd: 4 }, moves: ["giga-drain", "sludge-bomb", "sleep-powder", "earthquake"] },
      { pokemon: "pikachu", nature: "timid", ability: "static", item: "light-ball", evs: { hp: 4, spa: 252, spe: 252 }, moves: ["thunderbolt", "volt-switch", "surf", "focus-blast"] },
      { pokemon: "snorlax", nature: "adamant", ability: "thick-fat", item: "leftovers", evs: { hp: 252, atk: 252, spd: 4 }, moves: ["body-slam", "earthquake", "crunch", "shadow-ball"] },
      { pokemon: "gengar", nature: "timid", ability: "cursed-body", item: "focus-sash", evs: { hp: 4, spa: 252, spe: 252 }, moves: ["shadow-ball", "sludge-bomb", "focus-blast", "will-o-wisp"] },
    ],
  },
  {
    name: "Ofensiva Física",
    description: "Atacantes rápidos que buscam vencer antes que o adversário reaja.",
    members: [
      { pokemon: "garchomp", nature: "jolly", ability: "rough-skin", item: "choice-band", evs: { hp: 4, atk: 252, spe: 252 }, moves: ["earthquake", "dragon-claw", "stone-edge", "crunch"] },
      { pokemon: "dragonite", nature: "adamant", item: "life-orb", evs: { hp: 4, atk: 252, spe: 252 }, moves: ["dragon-dance", "extreme-speed", "earthquake", "fire-punch"] },
      { pokemon: "landorus-therian", nature: "jolly", ability: "intimidate", item: "choice-scarf", evs: { hp: 4, atk: 252, spe: 252 }, moves: ["earthquake", "u-turn", "stone-edge", "knock-off"] },
      { pokemon: "scizor", nature: "adamant", ability: "technician", item: "sitrus-berry", evs: { hp: 252, atk: 252, spd: 4 }, moves: ["swords-dance", "bullet-punch", "u-turn", "knock-off"] },
      { pokemon: "weavile", nature: "jolly", ability: "pressure", item: "focus-sash", evs: { hp: 4, atk: 252, spe: 252 }, moves: ["knock-off", "ice-shard", "icicle-crash", "swords-dance"] },
      { pokemon: "tyranitar", nature: "adamant", ability: "sand-stream", item: "assault-vest", evs: { hp: 252, atk: 252, spd: 4 }, moves: ["crunch", "stone-edge", "earthquake", "fire-blast"] },
    ],
  },
  {
    name: "Muralha Defensiva",
    description: "Time resistente que desgasta com status e se recupera durante a batalha.",
    members: [
      { pokemon: "chansey", nature: "bold", ability: "natural-cure", item: "eviolite", evs: { hp: 252, def: 252, spd: 4 }, moves: ["soft-boiled", "toxic", "thunder-wave", "ice-beam"] },
      { pokemon: "skarmory", nature: "impish", ability: "sturdy", item: "leftovers", evs: { hp: 252, def: 252, spd: 4 }, moves: ["roost", "brave-bird", "iron-head", "toxic"] },
      { pokemon: "ferrothorn", nature: "impish", ability: "iron-barbs", item: "leftovers", evs: { hp: 252, def: 252, spd: 4 }, moves: ["power-whip", "iron-head", "thunder-wave", "knock-off"] },
      { pokemon: "toxapex", nature: "bold", ability: "regenerator", item: "leftovers", evs: { hp: 252, def: 252, spd: 4 }, moves: ["scald", "recover", "toxic", "sludge-bomb"] },
      { pokemon: "clefable", nature: "bold", ability: "unaware", item: "leftovers", evs: { hp: 252, def: 252, spd: 4 }, moves: ["moonblast", "calm-mind", "soft-boiled", "flamethrower"] },
      { pokemon: "hippowdon", nature: "impish", ability: "sand-stream", item: "sitrus-berry", evs: { hp: 252, def: 252, spd: 4 }, moves: ["earthquake", "slack-off", "toxic", "stone-edge"] },
    ],
  },
  {
    name: "Canhões Especiais",
    description: "Atacantes especiais com ampla cobertura de tipos.",
    members: [
      { pokemon: "alakazam", nature: "timid", ability: "magic-guard", item: "focus-sash", evs: { hp: 4, spa: 252, spe: 252 }, moves: ["psychic", "shadow-ball", "focus-blast", "energy-ball"] },
      { pokemon: "starmie", nature: "timid", ability: "analytic", item: "life-orb", evs: { hp: 4, spa: 252, spe: 252 }, moves: ["surf", "ice-beam", "thunderbolt", "psychic"] },
      { pokemon: "rotom-wash", nature: "modest", ability: "levitate", item: "sitrus-berry", evs: { hp: 252, spa: 252, spd: 4 }, moves: ["hydro-pump", "thunderbolt", "volt-switch", "will-o-wisp"] },
      { pokemon: "hydreigon", nature: "timid", ability: "levitate", item: "choice-specs", evs: { hp: 4, spa: 252, spe: 252 }, moves: ["draco-meteor", "dark-pulse", "flamethrower", "earth-power"] },
      { pokemon: "magnezone", nature: "modest", ability: "analytic", item: "leftovers", evs: { hp: 252, spa: 252, spd: 4 }, moves: ["thunderbolt", "flash-cannon", "volt-switch", "thunder-wave"] },
      { pokemon: "latios", nature: "timid", ability: "levitate", item: "life-orb", evs: { hp: 4, spa: 252, spe: 252 }, moves: ["draco-meteor", "psyshock", "surf", "thunderbolt"] },
    ],
  },
  {
    name: "Equilíbrio Competitivo",
    description: "Mistura de pivôs, setup e cobertura, no estilo de times competitivos.",
    members: [
      { pokemon: "corviknight", nature: "impish", ability: "pressure", item: "leftovers", evs: { hp: 252, def: 252, spd: 4 }, moves: ["brave-bird", "roost", "u-turn", "iron-head"] },
      { pokemon: "heatran", nature: "modest", ability: "flash-fire", item: "leftovers", evs: { hp: 252, spa: 252, spd: 4 }, moves: ["lava-plume", "flash-cannon", "earth-power", "toxic"] },
      { pokemon: "gyarados", nature: "adamant", ability: "intimidate", item: "sitrus-berry", evs: { hp: 4, atk: 252, spe: 252 }, moves: ["dragon-dance", "waterfall", "earthquake", "ice-fang"] },
      { pokemon: "excadrill", nature: "jolly", ability: "mold-breaker", item: "focus-sash", evs: { hp: 4, atk: 252, spe: 252 }, moves: ["swords-dance", "earthquake", "iron-head", "rock-slide"] },
      { pokemon: "azumarill", nature: "adamant", ability: "huge-power", item: "sitrus-berry", evs: { hp: 252, atk: 252, def: 4 }, moves: ["aqua-jet", "play-rough", "waterfall", "superpower"] },
      { pokemon: "volcarona", nature: "timid", ability: "flame-body", item: "leftovers", evs: { hp: 4, spa: 252, spe: 252 }, moves: ["quiver-dance", "fire-blast", "bug-buzz", "giga-drain"] },
    ],
  },
];

async function addMember(tx: SQL, teamId: number, slot: number, set: SetData): Promise<boolean> {
  const [p] = (await tx`SELECT id FROM pokemon WHERE name = ${set.pokemon}`) as { id: number }[];
  if (!p) {
    console.warn(`  ! Pokémon não encontrado: ${set.pokemon}`);
    return false;
  }

  // Habilidade pedida; se o Pokémon não a tem, usa a primeira não oculta
  let abilityId: number | null = null;
  if (set.ability) {
    const [a] = (await tx`
      SELECT a.id FROM abilities a
      JOIN pokemon_abilities pa ON pa.ability_id = a.id
      WHERE pa.pokemon_id = ${p.id} AND a.name = ${set.ability}`) as { id: number }[];
    abilityId = a?.id ?? null;
    if (!a) console.warn(`  ! ${set.pokemon} não tem a habilidade ${set.ability}; usando a padrão`);
  }
  if (abilityId === null) {
    const [d] = (await tx`
      SELECT ability_id AS id FROM pokemon_abilities
      WHERE pokemon_id = ${p.id} ORDER BY is_hidden, ability_id LIMIT 1`) as { id: number }[];
    abilityId = d?.id ?? null;
  }

  let itemId: number | null = null;
  if (set.item) {
    const [i] = (await tx`SELECT id FROM items WHERE name = ${set.item}`) as { id: number }[];
    itemId = i?.id ?? null;
    if (!i) console.warn(`  ! Item não encontrado: ${set.item}`);
  }

  const ev = (k: StatKey) => set.evs[k] ?? 0;
  const [member] = (await tx`
    INSERT INTO team_pokemon (team_id, pokemon_id, slot, level, nature, ability_id, item_id,
                              ev_hp, ev_atk, ev_def, ev_spa, ev_spd, ev_spe)
    VALUES (${teamId}, ${p.id}, ${slot}, 50, ${set.nature}, ${abilityId}, ${itemId},
            ${ev("hp")}, ${ev("atk")}, ${ev("def")}, ${ev("spa")}, ${ev("spd")}, ${ev("spe")})
    RETURNING id`) as { id: number }[];
  if (!member) return false;

  let moveSlot = 1;
  for (const moveName of set.moves) {
    const [m] = (await tx`
      SELECT m.id FROM moves m
      JOIN pokemon_moves pm ON pm.move_id = m.id
      WHERE pm.pokemon_id = ${p.id} AND m.name = ${moveName}`) as { id: number }[];
    if (!m) {
      console.warn(`  ! ${set.pokemon} não aprende ${moveName}`);
      continue;
    }
    await tx`
      INSERT INTO team_pokemon_moves (team_pokemon_id, slot, move_id)
      VALUES (${member.id}, ${moveSlot++}, ${m.id})`;
  }
  return true;
}

const hash = await Bun.password.hash(crypto.randomUUID()); // ninguém consegue logar como o bot
const [bot] = (await sql`
  INSERT INTO users (username, email, password_hash)
  VALUES (${BOT_USERNAME}, 'bot@pokewiki.local', ${hash})
  ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
  RETURNING id`) as { id: number }[];
if (!bot) throw new Error("Não foi possível criar o usuário bot");

for (const preset of PRESETS) {
  const [existing] = (await sql`
    SELECT id FROM teams WHERE user_id = ${bot.id} AND name = ${preset.name}`) as { id: number }[];

  if (existing && !force) {
    console.log(`Já existe: ${preset.name} (use --force para recriar)`);
    continue;
  }
  if (existing) await sql`DELETE FROM teams WHERE id = ${existing.id}`;

  console.log(`Criando: ${preset.name}`);
  await sql.begin(async (tx: SQL) => {
    const [team] = (await tx`
      INSERT INTO teams (user_id, name, description, is_public)
      VALUES (${bot.id}, ${preset.name}, ${preset.description}, TRUE)
      RETURNING id`) as { id: number }[];
    if (!team) throw new Error("Falha ao criar o time");

    let slot = 1;
    for (const set of preset.members) {
      if (await addMember(tx, team.id, slot, set)) slot++;
    }
  });
}

console.log("Times prontos criados.");
await sql.close();