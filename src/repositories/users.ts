import { sql } from "../db";
import type { User } from "../types/models";

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const [user] = (await sql`SELECT * FROM users WHERE email = ${email}`) as User[];
  return user;
}

export async function findUserByUsername(username: string): Promise<User | undefined> {
  const [user] = (await sql`SELECT * FROM users WHERE username = ${username}`) as User[];
  return user;
}

/** Todos os usuários com a quantidade de times que cada um criou. */
export async function countTeamsPerUser() {
  const rows = await sql`
    SELECT u.id, u.username, COUNT(t.id)::int AS total_times
    FROM users u
    LEFT JOIN teams t ON t.user_id = u.id
    GROUP BY u.id, u.username
    ORDER BY total_times DESC, u.username`;
  return rows as { id: number; username: string; total_times: number }[];
}