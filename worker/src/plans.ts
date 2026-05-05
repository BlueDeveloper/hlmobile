import { Env, json, requireAuth } from "./auth";

export async function handlePlans(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const id = path.replace("/api/plans", "").replace(/^\//, "") || null;

  if (request.method === "GET") {
    return id ? getPlan(env, id) : listPlans(env, request);
  }

  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;

  if (request.method === "POST" && !id) return createPlan(env, request);
  if (request.method === "PUT" && id) return updatePlan(env, id, request);
  if (request.method === "DELETE" && id) return deletePlan(env, id);

  return json({ ok: false, error: "Method not allowed" }, 405);
}

async function listPlans(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const carrier = url.searchParams.get("carrier");
  const type = url.searchParams.get("type");
  const activeOnly = url.searchParams.get("active") !== "0";

  let query = "SELECT * FROM plans WHERE 1=1";
  const binds: unknown[] = [];

  if (carrier) { query += " AND carrier_id = ?"; binds.push(carrier); }
  if (type) { query += " AND type = ?"; binds.push(type); }
  if (activeOnly) { query += " AND is_active = 1"; }

  query += " ORDER BY sort_order ASC, id ASC";

  const stmt = env.DB.prepare(query);
  const result = binds.length > 0 ? await stmt.bind(...binds).all() : await stmt.all();
  return json({ ok: true, data: result.results });
}

async function getPlan(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM plans WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, error: "요금제를 찾을 수 없습니다" }, 404);
  return json({ ok: true, data: row });
}

async function createPlan(env: Env, request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
  }
  const { carrierId, name, monthly, baseFee, discount, voice, sms, data, qos, type, sortOrder, extraFields } = body as {
    carrierId: string; name: string; monthly: number; baseFee: number;
    discount: number; voice: string; sms: string; data: string;
    qos: string; type: string; sortOrder: number; extraFields?: Record<string, string>;
  };

  if (!carrierId || !name || monthly === undefined) {
    return json({ ok: false, error: "carrierId, name, monthly는 필수입니다" }, 400);
  }

  const result = await env.DB.prepare(
    `INSERT INTO plans (carrier_id, name, monthly, base_fee, discount, voice, sms, data, qos, type, sort_order, extra_fields)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    carrierId, name, monthly, baseFee || monthly, discount || 0,
    voice || "", sms || "", data || "", qos || "-", type || "postpaid", sortOrder || 0,
    extraFields ? JSON.stringify(extraFields) : null
  ).run();

  return json({ ok: true, data: { id: result.meta.last_row_id } }, 201);
}

async function updatePlan(env: Env, id: string, request: Request): Promise<Response> {
  const exists = await env.DB.prepare("SELECT id FROM plans WHERE id = ?").bind(id).first();
  if (!exists) return json({ ok: false, error: "요금제를 찾을 수 없습니다" }, 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
  }
  const fieldMap: Record<string, string> = {
    carrierId: "carrier_id", name: "name", monthly: "monthly", baseFee: "base_fee",
    discount: "discount", voice: "voice", sms: "sms", data: "data", qos: "qos",
    type: "type", sortOrder: "sort_order", isActive: "is_active",
  };

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, val] of Object.entries(body)) {
    if (key === "extraFields") {
      fields.push("extra_fields = ?");
      values.push(val ? JSON.stringify(val) : null);
    } else {
      const col = fieldMap[key];
      if (col) { fields.push(`${col} = ?`); values.push(val); }
    }
  }

  if (fields.length === 0) return json({ ok: false, error: "수정할 필드가 없습니다" }, 400);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(`UPDATE plans SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

async function deletePlan(env: Env, id: string): Promise<Response> {
  const exists = await env.DB.prepare("SELECT id FROM plans WHERE id = ?").bind(id).first();
  if (!exists) return json({ ok: false, error: "요금제를 찾을 수 없습니다" }, 404);
  await env.DB.prepare("DELETE FROM plans WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
