import { sql } from "../src/db.ts";

const schema = await Bun.file(`${import.meta.dir}/schema.sql`).text();
await sql.unsafe(schema);

console.log("Schema aplicado com sucesso.");
await sql.close();