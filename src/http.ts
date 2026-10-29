export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}