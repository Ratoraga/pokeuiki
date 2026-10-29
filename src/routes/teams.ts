import type { BunRequest } from "bun";
import { sql } from "../db";
import { getUserId } from "../auth";
import { analyzeTeam } from "../analysis";
import { parseBuild } from "../builds";
import { error, json, readJson } from "../http";
import {
  addMemberToTeam,
  copyTeamToUser,
  createTeamWithPokemon,
  getTeamDetail,
  removeMemberFromTeam,
  updateMemberBuild,
} from "../repositories/teams";

interface CreateTeamBody {
  name?: string;
  description?: string;
  is_public?: boolean;
  pokemon?: number[]; // ids dos Pokémon, na ordem dos slots
}

export async function createTeam(req: Request) {
  const userId = getUserId(req);
  if (!userId) return error("Não autenticado", 401);

  const body = await readJson<CreateTeamBody>(req);
  if (!body?.name) return error("name é obrigatório", 400);

  const { name, description = null, is_public = false, pokemon = [] } = body;
  if (pokemon.length > 6) return error("Um time pode ter no máximo 6 Pokémon", 400);

  try {
    const created = await createTeamWithPokemon({
      userId,
      name,
      description,
      isPublic: is_public,
      pokemonIds: pokemon,
    });
    return json(created, 201);
  } catch {
    return error("Não foi possível criar o time (nome repetido?)", 400);
  }
}

export async function listMyTeams(req: Request) {
  const userId = getUserId(req);
  if (!userId) return error("Não autenticado", 401);

  const teams = await sql`
    SELECT * FROM teams WHERE user_id = ${userId} ORDER BY created_at DESC`;
  return json(teams);
}

export async function getTeam(req: BunRequest<"/teams/:id">) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return error("Time não encontrado", 404);

  const team = await getTeamDetail(id, getUserId(req));
  return team ? json(team) : error("Time não encontrado", 404);
}

export async function getTeamAnalysis(req: BunRequest<"/teams/:id/analysis">) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return error("Time não encontrado", 404);

  const team = await getTeamDetail(id, getUserId(req));
  if (!team) return error("Time não encontrado", 404);

  const analysis = await analyzeTeam(team);
  if (!analysis) {
    return error("Dados da PokeAPI ainda não importados. Rode: bun run db:import", 503);
  }
  return json(analysis);
}

export async function updateMember(req: BunRequest<"/teams/:id/members/:memberId">) {
  const userId = getUserId(req);
  if (!userId) return error("Não autenticado", 401);

  const teamId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  if (!Number.isInteger(teamId) || !Number.isInteger(memberId)) {
    return error("Pokémon do time não encontrado", 404);
  }

  const build = parseBuild(await readJson<unknown>(req));
  if (typeof build === "string") return error(build, 400);

  const result = await updateMemberBuild(teamId, memberId, userId, build);
  if (!result.ok) return error(result.error, result.status);
  return json({ ok: true });
}

export async function addMember(req: BunRequest<"/teams/:id/members">) {
  const userId = getUserId(req);
  if (!userId) return error("Não autenticado", 401);

  const teamId = Number(req.params.id);
  if (!Number.isInteger(teamId)) return error("Time não encontrado", 404);

  const body = await readJson<{ pokemon_id?: unknown }>(req);
  const pokemonId = body?.pokemon_id;
  if (typeof pokemonId !== "number" || !Number.isInteger(pokemonId)) {
    return error("pokemon_id é obrigatório", 400);
  }

  const result = await addMemberToTeam(teamId, userId, pokemonId);
  if (!result.ok) return error(result.error, result.status);
  return json({ id: result.id }, 201);
}

export async function removeMember(req: BunRequest<"/teams/:id/members/:memberId">) {
  const userId = getUserId(req);
  if (!userId) return error("Não autenticado", 401);

  const teamId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  if (!Number.isInteger(teamId) || !Number.isInteger(memberId)) {
    return error("Pokémon do time não encontrado", 404);
  }

  const removed = await removeMemberFromTeam(teamId, memberId, userId);
  if (!removed) return error("Pokémon do time não encontrado", 404);
  return new Response(null, { status: 204 });
}

export async function deleteTeam(req: BunRequest<"/teams/:id">) {
  const userId = getUserId(req);
  if (!userId) return error("Não autenticado", 401);

  const id = Number(req.params.id);
  const deleted = await sql`
    DELETE FROM teams WHERE id = ${id} AND user_id = ${userId} RETURNING id`;

  if (deleted.length === 0) return error("Time não encontrado", 404);
  return new Response(null, { status: 204 });
}
export async function copyTeam(req: BunRequest<"/teams/:id/copy">) {
  const userId = getUserId(req);
  if (!userId) return error("Não autenticado", 401);

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return error("Time não encontrado", 404);

  const result = await copyTeamToUser(id, userId);
  if (!result.ok) return error(result.error, result.status);
  return json({ id: result.id, name: result.name }, 201);
}