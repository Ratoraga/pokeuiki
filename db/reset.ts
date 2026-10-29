import { sql } from "../src/db.ts";

if (process.env.NODE_ENV === "production") {
  console.error("Reset bloqueado em produção.");
  process.exit(1);
}

await sql`DROP TABLE IF EXISTS team_pokemon, teams, pokemon, users CASCADE`;
console.log("Tabelas removidas.");
await sql.close();

await import("./migrate");