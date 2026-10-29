export type {
  AbilityRef,
  Analysis,
  BuildInput,
  Item,
  Member,
  Move,
  PokemonDetail,
  PokemonSummary as Pokemon,
  TeamDetail,
} from "../shared/api";
export type { StatBlock, StatKey } from "../shared/stats";

export interface TeamSlot {
  slot: number;
  pokemon_id: number;
  name: string;
  nickname: string | null;
}

export interface Team {
  id: number;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  pokemon: TeamSlot[];
}

export interface SessionUser {
  id: number;
  username: string;
}

const SPRITES = new Map<number, string>();

export function registerSprites(list: { id: number; sprite?: string | null }[]): void {
  for (const p of list) if (p.sprite) SPRITES.set(p.id, p.sprite);
}

export const spriteUrl = (pokemonId: number) =>
  SPRITES.get(pokemonId) ??
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonId}.png`;

export const itemSpriteUrl = (name: string) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${name}.png`;

export type { BattleTeamData, ChartRow } from "../shared/battle/types";

export type { Gimmick } from "../shared/battle/types";

export type { BattleMoveData } from "../shared/battle/types";