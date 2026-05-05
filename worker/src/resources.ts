import { Env, json, requireAuth } from "./auth";

export async function handleResources(request: Request, env: Env, path: string): Promise<Response> {
  const id = path.match(/\/api\/resources\/(\d+)/)?.[1];

  if (request.method === "GET") {
    const url = new URL(request.url);
    const carrierId = url.searchParams.get("carrier");
    let sql = "SELECT r.*, c.title as carrier_name, c.icon as carrier_icon FROM resources r LEFT JOIN carriers c ON r.carrier_id = c.id WHERE r.is_active = 1";
    const params: string[] = [];
    if (carrierId) { sql += " AND r.carrier_id = ?"; params.push(carrierId); }
    sql += " ORDER BY r.carrier_id, r.sort_order, r.id";
    const stmt = params.length ? env.DB.prepare(sql).bind(...params) : env.DB.prepare(sql);
    const { results } = await stmt.all();
    return json({ ok: true, data: results });
  }

  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;

  if (request.method === "POST") {
    const body = await request.json<{ carrierId: string; title: string; category: string; fileUrl: string; fileName: string }>();
    const { carrierId, title, category, fileUrl, fileName } = body;
    if (!carrierId || !title || !fileUrl) return json({ ok: false, error: "필수 항목을 입력해주세요" }, 400);
    const res = await env.DB.prepare("INSERT INTO resources (carrier_id, title, category, file_url, file_name) VALUES (?, ?, ?, ?, ?)")
      .bind(carrierId, title, category || "가입신청서", fileUrl, fileName || "").run();
    return json({ ok: true, data: { id: res.meta.last_row_id } }, 201);
  }

  if (request.method === "PUT" && id) {
    const body = await request.json<Record<string, unknown>>();
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (["title", "category", "file_url", "file_name", "sort_order", "is_active", "carrier_id"].includes(k)) {
        sets.push(`${k} = ?`); vals.push(v);
      }
    }
    if (sets.length === 0) return json({ ok: false, error: "변경할 항목이 없습니다" }, 400);
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    await env.DB.prepare(`UPDATE resources SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
    return json({ ok: true });
  }

  if (request.method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM resources WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
}
