import type { BunRequest } from "bun";
import { getUserId } from "../auth";
import { getBattleTeam, listAllBattleMoves } from "../battle-data";
import { sql } from "../db";
import { error, json } from "../http";


export async function getBattleTeamRoute(req: BunRequest<"/battle/teams/:id">) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return error("Time não encontrado", 404);

  const result = await getBattleTeam(id, getUserId(req));
  if (!result.ok) return error(result.error, result.status);
  return json(result.team);
}

export async function getTypeChartRoute() {
  const rows = (await sql`
    SELECT attacker, defender, multiplier::float8 AS multiplier
    FROM type_effectiveness`) as { attacker: string; defender: string; multiplier: number }[];

  if (rows.length === 0) {
    return error("Tabela de tipos ainda não importada. Rode: bun run db:import", 503);
  }
  return json(rows.map((r) => ({ ...r, multiplier: Number(r.multiplier) })));
}

export async function getMovesRoute() {
  return json(await listAllBattleMoves());
}