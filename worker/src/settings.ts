import { Env, json, requireAuth } from "./auth";

export async function handleSettings(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const rows = await env.DB.prepare("SELECT key, value FROM site_settings").all<{ key: string; value: string }>();
    const settings: Record<string, string> = {};
    for (const row of rows.results || []) {
      settings[row.key] = row.value;
    }
    return json({ ok: true, data: settings });
  }

  if (request.method === "PUT") {
    const authErr = await requireAuth(request, env);
    if (authErr) return authErr;

    const body = await request.json<Record<string, string>>();
    const stmt = env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))");
    const batch = Object.entries(body).map(([key, value]) => stmt.bind(key, value));
    if (batch.length > 0) {
      await env.DB.batch(batch);
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
}
