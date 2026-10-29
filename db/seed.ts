import { sql } from "../src/db.ts";

const pokemon: [number, string, string, string | null][] = [
  [1, "Bulbasaur", "Grass", "Poison"],
  [3, "Venusaur", "Grass", "Poison"],
  [4, "Charmander", "Fire", null],
  [6, "Charizard", "Fire", "Flying"],
  [7, "Squirtle", "Water", null],
  [9, "Blastoise", "Water", null],
  [25, "Pikachu", "Electric", null],
  [94, "Gengar", "Ghost", "Poison"],
  [130, "Gyarados", "Water", "Flying"],
  [143, "Snorlax", "Normal", null],
  [149, "Dragonite", "Dragon", "Flying"],
  [150, "Mewtwo", "Psychic", null],
];

for (const [id, name, type1, type2] of pokemon) {
  await sql`
    INSERT INTO pokemon (id, name, type1, type2)
    VALUES (${id}, ${name}, ${type1}, ${type2})
    ON CONFLICT (id) DO NOTHING`;
}

// Usuário de teste (login: ash@kanto.com / pikachu123)
const hash = await Bun.password.hash("pikachu123");
const [ash] = await sql`
  INSERT INTO users (username, email, password_hash)
  VALUES ('ash', 'ash@kanto.com', ${hash})
  ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
  RETURNING id`;

async function seedTeam(name: string, isPublic: boolean, ids: number[]) {
  const [team] = await sql`
    INSERT INTO teams (user_id, name, description, is_public)
    VALUES (${ash.id}, ${name}, 'Time de exemplo', ${isPublic})
    ON CONFLICT (user_id, name) DO NOTHING
    RETURNING id`;
  if (!team) return;

  for (let i = 0; i < ids.length; i++) {
    await sql`
      INSERT INTO team_pokemon (team_id, pokemon_id, slot)
      VALUES (${team.id}, ${ids[i]}, ${i + 1})`;
  }
}

await seedTeam("Time Kanto", true, [25, 6, 9, 3, 143, 94]);
await seedTeam("Time Secreto", false, [150, 149, 130]);

console.log("Seed concluído.");
await sql.close();