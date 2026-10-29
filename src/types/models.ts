export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

export interface Team {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TeamPokemon {
  id: number;
  team_id: number;
  pokemon_id: number;
  slot: number;
  nickname: string | null;
}

export type TeamSlot = Pick<TeamPokemon, "slot" | "pokemon_id" | "nickname">;