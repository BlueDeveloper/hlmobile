import { Env, json, requireAuth } from "./auth";

export async function handleNotices(request: Request, env: Env, path: string): Promise<Response> {
  const id = path.replace("/api/notices", "").replace(/^\//, "") || null;

  if (request.method === "GET") {
    return id ? getNotice(env, id) : listNotices(env, request);
  }

  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;

  if (request.method === "POST" && !id) return createNotice(env, request);
  if (request.method === "PUT" && id) return updateNotice(env, id, request);
  if (request.method === "DELETE" && id) return deleteNotice(env, id);

  return json({ ok: false, error: "Method not allowed" }, 405);
}

async function listNotices(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pinned = url.searchParams.get("pinned");
  const limitRaw = parseInt(url.searchParams.get("limit") || "50");
  const limit = Number.isNaN(limitRaw) || limitRaw <= 0 ? 50 : Math.min(limitRaw, 200);

  let query = "SELECT * FROM notices WHERE is_active = 1";
  if (pinned === "1") query += " AND is_pinned = 1";
  query += " ORDER BY is_pinned DESC, created_at DESC LIMIT ?";

  const result = await env.DB.prepare(query).bind(limit).all();
  return json({ ok: true, data: result.results });
}

async function getNotice(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM notices WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, error: "공지사항을 찾을 수 없습니다" }, 404);
  return json({ ok: true, data: row });
}

async function createNotice(env: Env, request: Request): Promise<Response> {
  const { title, content, isPinned, attachments } = await request.json<{ title: string; content: string; isPinned?: boolean; attachments?: string }>();
  if (!title || !content) return json({ ok: false, error: "제목과 내용은 필수입니다" }, 400);

  const result = await env.DB.prepare(
    "INSERT INTO notices (title, content, is_pinned, attachments) VALUES (?, ?, ?, ?)"
  ).bind(title, content, isPinned ? 1 : 0, attachments || null).run();

  return json({ ok: true, data: { id: result.meta.last_row_id } }, 201);
}

async function updateNotice(env: Env, id: string, request: Request): Promise<Response> {
  const exists = await env.DB.prepare("SELECT id FROM notices WHERE id = ?").bind(id).first();
  if (!exists) return json({ ok: false, error: "공지사항을 찾을 수 없습니다" }, 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
  }
  const fields: string[] = [];
  const values: unknown[] = [];
  const map: Record<string, string> = { title: "title", content: "content", isPinned: "is_pinned", isActive: "is_active", attachments: "attachments" };

  for (const [k, v] of Object.entries(body)) {
    const col = map[k];
    if (col) { fields.push(`${col} = ?`); values.push(v); }
  }
  if (fields.length === 0) return json({ ok: false, error: "수정할 필드가 없습니다" }, 400);

  fields.push("updated_at = datetime('now')");
  values.push(id);
  await env.DB.prepare(`UPDATE notices SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

async function deleteNotice(env: Env, id: string): Promise<Response> {
  const exists = await env.DB.prepare("SELECT id FROM notices WHERE id = ?").bind(id).first();
  if (!exists) return json({ ok: false, error: "공지사항을 찾을 수 없습니다" }, 404);
  await env.DB.prepare("DELETE FROM notices WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
