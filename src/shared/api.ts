import type { StatBlock, StatKey } from "./stats";

export interface PokemonSummary {
  id: number;
  name: string;
  type1: string;
  type2: string | null;
  sprite?: string | null;
}

export interface Move {
  id: number;
  name: string;
  type: string;
  damage_class: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  effect?: string | null;
}

export interface AbilityRef {
  id: number;
  name: string;
  is_hidden: boolean;
  description: string | null;
}

export interface PokemonDetail extends PokemonSummary {
  species_id: number;
  can_evolve: boolean;
  height: number | null; 
  weight: number | null; 
  base: StatBlock;
  abilities: AbilityRef[];
  moves: Move[];
}

export interface Item {
  id: number;
  name: string;
}

export interface Member {
  id: number;
  slot: number;
  pokemon_id: number;
  species_id: number;
  can_evolve: boolean;
  name: string;
  type1: string;
  type2: string | null;
  nickname: string | null;
  level: number;
  nature: string;
  ability: { id: number; name: string } | null;
  item: { id: number; name: string } | null;
  base: StatBlock;
  ivs: StatBlock;
  evs: StatBlock;
  moves: Move[];
}

export interface TeamDetail {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  is_owner: boolean;
  members: Member[];
}

export interface BuildInput {
  nickname: string | null;
  level: number;
  nature: string;
  ability_id: number | null;
  item_id: number | null;
  ivs: StatBlock;
  evs: StatBlock;
  moves: number[];
}

export interface DefenseRow {
  type: string;
  weak: number;
  resist: number;
  immune: number;
}

export interface AnalysisMember {
  id: number;
  species: string;
  nickname: string | null;
  types: string[];
  stats: StatBlock; 
  total: number;
  notes: string[]; 
}

export interface Analysis {
  members: AnalysisMember[];
  highest: Record<StatKey, { member_id: number; value: number } | null>;
  average: StatBlock;
  defense: DefenseRow[];
  offense: {
    attackTypes: string[];
    superEffective: string[]; 
    notCovered: string[]; 
    stabFallback: number[];
    combos: {
      total: number; 
      covered: number;
      uncovered: string[][]; 
    };
  };
}

export const BOT_USERNAME = "pokewiki-bot";