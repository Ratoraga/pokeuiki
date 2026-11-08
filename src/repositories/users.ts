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

export async function countTeamsPerUser() {
  const rows = await sql`
    SELECT u.id, u.username, COUNT(t.id)::int AS total_times
    FROM users u
    LEFT JOIN teams t ON t.user_id = u.id
    GROUP BY u.id, u.username
    ORDER BY total_times DESC, u.username`;
  return rows as { id: number; username: string; total_times: number }[];
}

export async function addContact(ownerId: number, username: string):
  Promise<{ ok: true; username: string } | { ok: false; status: number; error: string }> {
  const [u] = (await sql`SELECT id, username FROM users WHERE username = ${username}`) as { id: number; username: string }[];
  if (!u) return { ok: false, status: 404, error: "Usuário não encontrado" };
  if (u.id === ownerId) return { ok: false, status: 400, error: "Você não pode adicionar a si mesmo" };
  await sql`INSERT INTO user_contacts (owner_id, contact_id) VALUES (${ownerId}, ${u.id}) ON CONFLICT DO NOTHING`;
  return { ok: true, username: u.username };
}

export async function removeContact(ownerId: number, username: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM user_contacts
    WHERE owner_id = ${ownerId} AND contact_id = (SELECT id FROM users WHERE username = ${username})
    RETURNING contact_id`;
  return rows.length > 0;
}

export async function listContacts(ownerId: number): Promise<{ username: string; public_teams: number; added_at: string }[]> {
  return (await sql`
    SELECT u.username, c.created_at AS added_at,
           (SELECT COUNT(*)::int FROM teams t WHERE t.user_id = u.id AND t.is_public) AS public_teams
    FROM user_contacts c JOIN users u ON u.id = c.contact_id
    WHERE c.owner_id = ${ownerId}
    ORDER BY u.username`) as { username: string; public_teams: number; added_at: string }[];
}