import type { SQL } from "bun";
import { sql } from "../db";
import type { BuildInput, Member, Move, TeamDetail } from "../shared/api";
import type { Team } from "../types/models";

export interface TeamSlotDetail {
  slot: number;
  pokemon_id: number;
  name: string;
  nickname: string | null;
}

export interface TeamWithPokemon
  extends Pick<Team, "id" | "name" | "description" | "is_public" | "created_at"> {
  pokemon: TeamSlotDetail[];
}

/** Times de um usuário (por id). Visitantes só veem os públicos. */
export async function findTeamsByUserId(userId: number, viewerId: number | null) {
  const rows = await sql`
    SELECT id, name, description, is_public, created_at
    FROM teams
    WHERE user_id = ${userId}
      AND (is_public OR user_id = ${viewerId})
    ORDER BY created_at DESC`;
  return rows as Pick<Team, "id" | "name" | "description" | "is_public" | "created_at">[];
}

/** Times de um usuário (por username), já com os Pokémon de cada um. */
export async function findTeamsWithPokemonByUsername(
  username: string,
  viewerId: number | null
): Promise<TeamWithPokemon[]> {
  const rows = (await sql`
    SELECT t.id AS team_id, t.name AS team_name, t.description, t.is_public, t.created_at,
           tp.slot, p.id AS pokemon_id, p.name AS pokemon_name, tp.nickname
    FROM users u
    JOIN teams t              ON t.user_id = u.id
    LEFT JOIN team_pokemon tp ON tp.team_id = t.id
    LEFT JOIN pokemon p       ON p.id = tp.pokemon_id
    WHERE u.username = ${username}
      AND (t.is_public OR u.id = ${viewerId})
    ORDER BY t.created_at DESC, t.id, tp.slot`) as {
    team_id: number;
    team_name: string;
    description: string | null;
    is_public: boolean;
    created_at: Date;
    slot: number | null;
    pokemon_id: number | null;
    pokemon_name: string | null;
    nickname: string | null;
  }[];

  const byTeam = new Map<number, TeamWithPokemon>();
  for (const r of rows) {
    let team = byTeam.get(r.team_id);
    if (!team) {
      team = {
        id: r.team_id,
        name: r.team_name,
        description: r.description,
        is_public: r.is_public,
        created_at: r.created_at,
        pokemon: [],
      };
      byTeam.set(r.team_id, team);
    }
    if (r.slot !== null && r.pokemon_id !== null && r.pokemon_name !== null) {
      team.pokemon.push({
        slot: r.slot,
        pokemon_id: r.pokemon_id,
        name: r.pokemon_name,
        nickname: r.nickname,
      });
    }
  }
  return [...byTeam.values()];
}

/** Cria o time e seus Pokémon numa transação. */
export async function createTeamWithPokemon(input: {
  userId: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  pokemonIds: number[];
}): Promise<Team> {
  return sql.begin(async (tx: SQL) => {
    const [team] = (await tx`
      INSERT INTO teams (user_id, name, description, is_public)
      VALUES (${input.userId}, ${input.name}, ${input.description}, ${input.isPublic})
      RETURNING *`) as Team[];

    if (!team) throw new Error("Falha ao criar o time");

    for (const [i, pokemonId] of input.pokemonIds.entries()) {
      await tx`
        INSERT INTO team_pokemon (team_id, pokemon_id, slot, ability_id)
        VALUES (${team.id}, ${pokemonId}, ${i + 1},
          (SELECT ability_id FROM pokemon_abilities
           WHERE pokemon_id = ${pokemonId} ORDER BY is_hidden, ability_id LIMIT 1))`;
    }
    return team;
  });
}

// ---------------------------------------------------------------
// Time completo com builds
// ---------------------------------------------------------------
interface MemberRow {
  id: number; slot: number; pokemon_id: number; nickname: string | null;
  level: number; nature: string;
  ability_id: number | null; ability_name: string | null;
  item_id: number | null; item_name: string | null;
  iv_hp: number; iv_atk: number; iv_def: number; iv_spa: number; iv_spd: number; iv_spe: number;
  ev_hp: number; ev_atk: number; ev_def: number; ev_spa: number; ev_spd: number; ev_spe: number;
  name: string; type1: string; type2: string | null;
  species_id: number | null; can_evolve: boolean;
  base_hp: number; base_atk: number; base_def: number; base_spa: number; base_spd: number; base_spe: number;
}

interface MemberMoveRow extends Move {
  team_pokemon_id: number;
}

/** Null se o time não existir ou for privado de outro usuário. */
export async function getTeamDetail(teamId: number, viewerId: number | null): Promise<TeamDetail | null> {
  const [team] = (await sql`SELECT * FROM teams WHERE id = ${teamId}`) as Team[];
  if (!team || (!team.is_public && team.user_id !== viewerId)) return null;

  const rows = (await sql`
    SELECT tp.id, tp.slot, tp.pokemon_id, tp.nickname, tp.level, tp.nature,
           tp.ability_id, a.name AS ability_name, tp.item_id, i.name AS item_name,
           tp.iv_hp, tp.iv_atk, tp.iv_def, tp.iv_spa, tp.iv_spd, tp.iv_spe,
           tp.ev_hp, tp.ev_atk, tp.ev_def, tp.ev_spa, tp.ev_spd, tp.ev_spe,
           p.name, p.type1, p.type2, p.species_id, p.can_evolve,
           p.base_hp, p.base_atk, p.base_def, p.base_spa, p.base_spd, p.base_spe
    FROM team_pokemon tp
    JOIN pokemon p ON p.id = tp.pokemon_id
    LEFT JOIN abilities a ON a.id = tp.ability_id
    LEFT JOIN items i ON i.id = tp.item_id
    WHERE tp.team_id = ${teamId}
    ORDER BY tp.slot`) as MemberRow[];

  const moveRows = (await sql`
    SELECT tm.team_pokemon_id, m.id, m.name, m.type, m.damage_class, m.power, m.accuracy, m.pp
    FROM team_pokemon_moves tm
    JOIN moves m ON m.id = tm.move_id
    JOIN team_pokemon tp ON tp.id = tm.team_pokemon_id
    WHERE tp.team_id = ${teamId}
    ORDER BY tm.team_pokemon_id, tm.slot`) as MemberMoveRow[];

  const movesByMember = new Map<number, Move[]>();
  for (const { team_pokemon_id, ...move } of moveRows) {
    const list = movesByMember.get(team_pokemon_id) ?? [];
    list.push(move);
    movesByMember.set(team_pokemon_id, list);
  }

  const members: Member[] = rows.map((r) => ({
    id: r.id,
    slot: r.slot,
    pokemon_id: r.pokemon_id,
    species_id: r.species_id ?? r.pokemon_id,
    can_evolve: r.can_evolve,
    name: r.name,
    type1: r.type1,
    type2: r.type2,
    nickname: r.nickname,
    level: r.level,
    nature: r.nature,
    ability: r.ability_id !== null && r.ability_name !== null ? { id: r.ability_id, name: r.ability_name } : null,
    item: r.item_id !== null && r.item_name !== null ? { id: r.item_id, name: r.item_name } : null,
    base: { hp: r.base_hp, atk: r.base_atk, def: r.base_def, spa: r.base_spa, spd: r.base_spd, spe: r.base_spe },
    ivs: { hp: r.iv_hp, atk: r.iv_atk, def: r.iv_def, spa: r.iv_spa, spd: r.iv_spd, spe: r.iv_spe },
    evs: { hp: r.ev_hp, atk: r.ev_atk, def: r.ev_def, spa: r.ev_spa, spd: r.ev_spd, spe: r.ev_spe },
    moves: movesByMember.get(r.id) ?? [],
  }));

  return {
    id: team.id,
    user_id: team.user_id,
    name: team.name,
    description: team.description,
    is_public: team.is_public,
    created_at: new Date(team.created_at).toISOString(),
    is_owner: viewerId !== null && viewerId === team.user_id,
    members,
  };
}

// ---------------------------------------------------------------
// Editar a build de um Pokémon do time
// ---------------------------------------------------------------
export type UpdateResult = { ok: true } | { ok: false; status: number; error: string };

export async function updateMemberBuild(
  teamId: number,
  memberId: number,
  userId: number,
  build: BuildInput
): Promise<UpdateResult> {
  const [member] = (await sql`
    SELECT tp.pokemon_id
    FROM team_pokemon tp
    JOIN teams t ON t.id = tp.team_id
    WHERE tp.id = ${memberId} AND tp.team_id = ${teamId} AND t.user_id = ${userId}`) as {
    pokemon_id: number;
  }[];
  if (!member) return { ok: false, status: 404, error: "Pokémon do time não encontrado" };

  if (build.ability_id !== null) {
    const found = await sql`
      SELECT 1 FROM pokemon_abilities
      WHERE pokemon_id = ${member.pokemon_id} AND ability_id = ${build.ability_id}`;
    if (found.length === 0) return { ok: false, status: 400, error: "Habilidade inválida para este Pokémon" };
  }

  if (build.item_id !== null) {
    const found = await sql`SELECT 1 FROM items WHERE id = ${build.item_id}`;
    if (found.length === 0) return { ok: false, status: 400, error: "Item inválido" };
  }

  if (build.moves.length > 0) {
    const learnable = await sql`
      SELECT move_id FROM pokemon_moves
      WHERE pokemon_id = ${member.pokemon_id}
        AND move_id IN (
          SELECT t.value::int
          FROM jsonb_array_elements_text(${JSON.stringify(build.moves)}::text::jsonb) AS t(value)
        )`;
    if (learnable.length !== build.moves.length) {
      return { ok: false, status: 400, error: "Algum golpe não pode ser aprendido por este Pokémon" };
    }
  }

  const { ivs, evs } = build;
  await sql.begin(async (tx: SQL) => {
    await tx`
      UPDATE team_pokemon SET
        nickname = ${build.nickname}, level = ${build.level}, nature = ${build.nature},
        ability_id = ${build.ability_id}, item_id = ${build.item_id},
        iv_hp = ${ivs.hp}, iv_atk = ${ivs.atk}, iv_def = ${ivs.def},
        iv_spa = ${ivs.spa}, iv_spd = ${ivs.spd}, iv_spe = ${ivs.spe},
        ev_hp = ${evs.hp}, ev_atk = ${evs.atk}, ev_def = ${evs.def},
        ev_spa = ${evs.spa}, ev_spd = ${evs.spd}, ev_spe = ${evs.spe}
      WHERE id = ${memberId}`;

    await tx`DELETE FROM team_pokemon_moves WHERE team_pokemon_id = ${memberId}`;
    for (const [i, moveId] of build.moves.entries()) {
      await tx`
        INSERT INTO team_pokemon_moves (team_pokemon_id, slot, move_id)
        VALUES (${memberId}, ${i + 1}, ${moveId})`;
    }

    await tx`UPDATE teams SET updated_at = now() WHERE id = ${teamId}`;
  });

  return { ok: true };
}

// ---------------------------------------------------------------
// Adicionar e remover Pokémon de um time existente
// ---------------------------------------------------------------
export type AddResult = { ok: true; id: number } | { ok: false; status: number; error: string };

export async function addMemberToTeam(
  teamId: number,
  userId: number,
  pokemonId: number
): Promise<AddResult> {
  try {
    return await sql.begin(async (tx: SQL): Promise<AddResult> => {
      // FOR UPDATE trava o time: dois "adicionar" simultâneos não pegam o mesmo slot
      const [team] = (await tx`
        SELECT id FROM teams WHERE id = ${teamId} AND user_id = ${userId} FOR UPDATE`) as {
        id: number;
      }[];
      if (!team) return { ok: false, status: 404, error: "Time não encontrado" };

      const pokemon = await tx`SELECT 1 FROM pokemon WHERE id = ${pokemonId}`;
      if (pokemon.length === 0) return { ok: false, status: 404, error: "Pokémon não encontrado" };

      const duplicate = await tx`
        SELECT 1 FROM team_pokemon WHERE team_id = ${teamId} AND pokemon_id = ${pokemonId}`;
      if (duplicate.length > 0) return { ok: false, status: 400, error: "Este Pokémon já está no time" };

      // Primeiro slot livre entre 1 e 6
      const [free] = (await tx`
        SELECT s.slot
        FROM generate_series(1, 6) AS s(slot)
        WHERE NOT EXISTS (
          SELECT 1 FROM team_pokemon tp WHERE tp.team_id = ${teamId} AND tp.slot = s.slot
        )
        ORDER BY s.slot
        LIMIT 1`) as { slot: number }[];
      if (!free) return { ok: false, status: 400, error: "O time já tem 6 Pokémon" };

      const [created] = (await tx`
        INSERT INTO team_pokemon (team_id, pokemon_id, slot, ability_id)
        VALUES (${teamId}, ${pokemonId}, ${free.slot},
          (SELECT ability_id FROM pokemon_abilities
           WHERE pokemon_id = ${pokemonId} ORDER BY is_hidden, ability_id LIMIT 1))
        RETURNING id`) as { id: number }[];
      if (!created) throw new Error("Falha ao adicionar o Pokémon");

      await tx`UPDATE teams SET updated_at = now() WHERE id = ${teamId}`;
      return { ok: true, id: created.id };
    });
  } catch {
    return { ok: false, status: 409, error: "Não foi possível adicionar o Pokémon. Tente novamente." };
  }
}

/** Remove o Pokémon (e seus golpes, por cascata). Só o dono do time pode. */
export async function removeMemberFromTeam(
  teamId: number,
  memberId: number,
  userId: number
): Promise<boolean> {
  const deleted = await sql`
    DELETE FROM team_pokemon tp
    USING teams t
    WHERE tp.id = ${memberId}
      AND tp.team_id = ${teamId}
      AND t.id = tp.team_id
      AND t.user_id = ${userId}
    RETURNING tp.id`;
  if (deleted.length === 0) return false;

  await sql`UPDATE teams SET updated_at = now() WHERE id = ${teamId}`;
  return true;
}
export type CopyResult =
  | { ok: true; id: number; name: string }
  | { ok: false; status: number; error: string };

/** Copia um time (público, ou do próprio usuário) com todas as builds e golpes. */
export async function copyTeamToUser(sourceId: number, userId: number): Promise<CopyResult> {
  try {
    return await sql.begin(async (tx: SQL): Promise<CopyResult> => {
      const [source] = (await tx`
        SELECT t.name, t.description, t.is_public, t.user_id, u.username
        FROM teams t
        JOIN users u ON u.id = t.user_id
        WHERE t.id = ${sourceId}`) as {
        name: string;
        description: string | null;
        is_public: boolean;
        user_id: number;
        username: string;
      }[];
      if (!source || (!source.is_public && source.user_id !== userId)) {
        return { ok: false, status: 404, error: "Time não encontrado" };
      }

      // Nome livre: "Nome (cópia)", "Nome (cópia) 2"...
      const existing = new Set(
        ((await tx`SELECT name FROM teams WHERE user_id = ${userId}`) as { name: string }[]).map(
          (r) => r.name
        )
      );
      const base = `${source.name.slice(0, 80)} (cópia)`;
      let name = base;
      for (let n = 2; existing.has(name); n++) name = `${base} ${n}`;

      const description =
        source.user_id === userId
          ? source.description
          : `Copiado de @${source.username}${source.description ? `. ${source.description}` : ""}`;

      const [created] = (await tx`
        INSERT INTO teams (user_id, name, description, is_public)
        VALUES (${userId}, ${name}, ${description}, FALSE)
        RETURNING id`) as { id: number }[];
      if (!created) throw new Error("Falha ao copiar o time");

      await tx`
        INSERT INTO team_pokemon (team_id, pokemon_id, slot, nickname, level, nature, ability_id, item_id,
                                  iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
                                  ev_hp, ev_atk, ev_def, ev_spa, ev_spd, ev_spe)
        SELECT ${created.id}::int, pokemon_id, slot, nickname, level, nature, ability_id, item_id,
               iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
               ev_hp, ev_atk, ev_def, ev_spa, ev_spd, ev_spe
        FROM team_pokemon
        WHERE team_id = ${sourceId}`;

      // Os golpes são ligados ao novo Pokémon pelo slot
      await tx`
        INSERT INTO team_pokemon_moves (team_pokemon_id, slot, move_id)
        SELECT ntp.id, tm.slot, tm.move_id
        FROM team_pokemon otp
        JOIN team_pokemon ntp ON ntp.team_id = ${created.id} AND ntp.slot = otp.slot
        JOIN team_pokemon_moves tm ON tm.team_pokemon_id = otp.id
        WHERE otp.team_id = ${sourceId}`;

      return { ok: true, id: created.id, name };
    });
  } catch {
    return { ok: false, status: 400, error: "Não foi possível copiar o time" };
  }
}