import type { BunRequest } from "bun";
import { getUserId } from "../auth";
import { json } from "../http";
import { findTeamsWithPokemonByUsername } from "../repositories/teams";

export async function listUserTeams(req: BunRequest<"/users/:username/teams">) {
  const teams = await findTeamsWithPokemonByUsername(req.params.username, getUserId(req));
  return json(teams);
}