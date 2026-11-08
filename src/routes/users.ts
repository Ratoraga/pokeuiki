import type { BunRequest } from "bun";
import { getUserId } from "../auth";
import { error, json, readJson } from "../http";
import { addContact, listContacts, removeContact } from "../repositories/users";
import { findTeamsWithPokemonByUsername } from "../repositories/teams";

export async function listUserTeams(req: BunRequest<"/users/:username/teams">) {
  const teams = await findTeamsWithPokemonByUsername(req.params.username, getUserId(req));
  return json(teams);
}
  export async function listMyContacts(req: Request) {
    const userId = getUserId(req);
    if (!userId) return error("Não autenticado", 401);
    return json(await listContacts(userId));
  }

  export async function addMyContact(req: Request) {
    const userId = getUserId(req);
    if (!userId) return error("Não autenticado", 401);
    const body = await readJson<{ username?: unknown }>(req);
    if (typeof body?.username !== "string" || !body.username.trim()) return error("username é obrigatório", 400);
    const r = await addContact(userId, body.username.trim());
    return r.ok ? json({ username: r.username }, 201) : error(r.error, r.status);
  }

  export async function removeMyContact(req: BunRequest<"/contacts/:username">) {
    const userId = getUserId(req);
    if (!userId) return error("Não autenticado", 401);
    return (await removeContact(userId, req.params.username))
      ? new Response(null, { status: 204 })
      : error("Contato não encontrado", 404);
  }