import type {
  Analysis,
  BuildInput,
  Item,
  Pokemon,
  PokemonDetail,
  SessionUser,
  Team,
  TeamDetail,
  BattleTeamData,
  BattleMoveData,
  ChartRow
} from "./types";

const TOKEN_KEY = "pokewiki_token";
const USER_KEY = "pokewiki_user";

export const session = {
  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  get user(): SessionUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  },
  save(token: string, user: SessionUser) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Erro inesperado";
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (session.token) headers.authorization = `Bearer ${session.token}`;

  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && session.token) {
      session.clear();
      window.dispatchEvent(new Event("pokewiki:logout"));
    }
    throw new ApiError(data?.error ?? "Erro inesperado", res.status);
  }
  return data as T;
}

export const api = {
  register: (username: string, email: string, password: string) =>
    request<{ id: number; username: string; email: string }>("/auth/register", {
      method: "POST",
      body: { username, email, password },
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: SessionUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),

  listPokemon: () => request<Pokemon[]>("/pokemon"),
  getPokemon: (id: number) => request<PokemonDetail>(`/pokemon/${id}`),
  listItems: () => request<Item[]>("/items"),

  teamsOfUser: (username: string) =>
    request<Team[]>(`/users/${encodeURIComponent(username)}/teams`),

  createTeam: (input: {
    name: string;
    description?: string;
    is_public: boolean;
    pokemon: number[];
  }) => request<{ id: number; name: string }>("/teams", { method: "POST", body: input }),

  deleteTeam: (id: number) => request<void>(`/teams/${id}`, { method: "DELETE" }),

  getTeam: (id: number) => request<TeamDetail>(`/teams/${id}`),
  getAnalysis: (id: number) => request<Analysis>(`/teams/${id}/analysis`),

  updateMember: (teamId: number, memberId: number, build: BuildInput) =>
    request<{ ok: true }>(`/teams/${teamId}/members/${memberId}`, {
      method: "PUT",
      body: build,
    }),
  addMember: (teamId: number, pokemonId: number) =>
    request<{ id: number }>(`/teams/${teamId}/members`, {
      method: "POST",
      body: { pokemon_id: pokemonId },
    }),

  removeMember: (teamId: number, memberId: number) =>
    request<void>(`/teams/${teamId}/members/${memberId}`, { method: "DELETE" }),

    copyTeam: (id: number) =>
    request<{ id: number; name: string }>(`/teams/${id}/copy`, { method: "POST" }),

  getBattleTeam: (id: number) => request<BattleTeamData>(`/battle/teams/${id}`),
  getMoveCatalog: () => request<BattleMoveData[]>("/battle/moves"),
  getTypeChart: () => request<ChartRow[]>("/battle/chart"),
};