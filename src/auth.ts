import jwt from "jsonwebtoken";
import { config } from "./config";

export function signToken(userId: number): string {
  return jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: "7d" });
}

/** Retorna o id do usuário logado, ou null se for visitante / token inválido. */
export function getUserId(req: Request): number | null {
  const token = req.headers.get("authorization")?.split(" ")[1];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { id: number };
    return payload.id;
  } catch {
    return null;
  }
}