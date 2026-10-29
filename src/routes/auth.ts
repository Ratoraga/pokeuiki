import { sql } from "../db";
import { signToken } from "../auth";
import { error, json, readJson } from "../http";
import type { User } from "../types/models";

export async function register(req: Request) {
  const body = await readJson<{ username?: string; email?: string; password?: string }>(req);
  if (!body?.username || !body.email || !body.password) {
    return error("username, email e password são obrigatórios", 400);
  }

  const hash = await Bun.password.hash(body.password);
  try {
    const [user] = await sql`
      INSERT INTO users (username, email, password_hash)
      VALUES (${body.username}, ${body.email}, ${hash})
      RETURNING id, username, email`;
    return json(user, 201);
  } catch {
    return error("Usuário ou e-mail já existe", 409);
  }
}

export async function login(req: Request) {
  const body = await readJson<{ email?: string; password?: string }>(req);
  if (!body?.email || !body.password) {
    return error("email e password são obrigatórios", 400);
  }

  const [user] = (await sql`SELECT * FROM users WHERE email = ${body.email}`) as User[];
  if (!user || !(await Bun.password.verify(body.password, user.password_hash))) {
    return error("Credenciais inválidas", 401);
  }

  return json({ token: signToken(user.id), user: { id: user.id, username: user.username } });
}