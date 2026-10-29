import type { BunRequest } from "bun";
import { error, json } from "../http";
import { getPokemonDetail, listItems, listPokemon } from "../repositories/pokemon";

export async function listAllPokemon() {
  return json(await listPokemon());
}

export async function getPokemon(req: BunRequest<"/pokemon/:id">) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return error("Pokémon não encontrado", 404);

  const detail = await getPokemonDetail(id);
  return detail ? json(detail) : error("Pokémon não encontrado", 404);
}

export async function listAllItems() {
  return json(await listItems());
}