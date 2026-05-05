import { Env, json, requireAuth } from "./auth";

export async function handleCarriers(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const rawId = path.replace("/api/carriers", "").replace(/^\//, "") || null;
  const id = rawId ? decodeURIComponent(rawId) : null;

  if (request.method === "GET") {
    return id ? getCarrier(env, id) : listCarriers(env, request);
  }

  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;

  if (request.method === "POST" && !id) return createCarrier(env, request);
  if (request.method === "PUT" && id) return updateCarrier(env, id, request);
  if (request.method === "DELETE" && id) return deleteCarrier(env, id);

  return json({ ok: false, error: "Method not allowed" }, 405);
}

async function listCarriers(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("active") !== "0";
  const parent = url.searchParams.get("parent"); // "null" → 대분류, "skt" → SKT 소속
  const tree = url.searchParams.get("tree") === "1";

  // 트리 구조 반환
  if (tree) {
    // 대분류 3개가 항상 존재하도록 보장
    await ensureDefaultMnos(env);

    const activeClause = activeOnly ? " WHERE is_active = 1" : "";
    const all = await env.DB.prepare(`SELECT * FROM carriers${activeClause} ORDER BY sort_order ASC`).all();
    const items = all.results as Record<string, unknown>[];

    const roots = items.filter((c) => !c.parent_id);
    const result = roots.map((root) => ({
      ...root,
      children: items.filter((c) => c.parent_id === root.id),
    }));
    return json({ ok: true, data: result });
  }

  // parent 필터
  let query = "SELECT * FROM carriers WHERE 1=1";
  const binds: unknown[] = [];

  if (parent === "null" || parent === "") {
    query += " AND parent_id IS NULL";
  } else if (parent) {
    query += " AND parent_id = ?";
    binds.push(parent);
  }
  // parent 미지정이면 전체 반환

  if (activeOnly) query += " AND is_active = 1";
  query += " ORDER BY sort_order ASC";

  const stmt = env.DB.prepare(query);
  const result = binds.length > 0 ? await stmt.bind(...binds).all() : await stmt.all();
  return json({ ok: true, data: result.results });
}

async function getCarrier(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM carriers WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, error: "통신사를 찾을 수 없습니다" }, 404);
  return json({ ok: true, data: row });
}

async function createCarrier(env: Env, request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
  }
  const { id, icon, iconStyle, title, description, forms, sortOrder, parentId, paymentType } = body as {
    id: string; icon: string; iconStyle: string; title: string;
    description: string; forms: string; sortOrder: number; parentId: string | null; paymentType: string;
  };

  if (!id || !title) return json({ ok: false, error: "id와 title은 필수입니다" }, 400);

  await env.DB.prepare(
    `INSERT INTO carriers (id, icon, icon_style, title, description, forms, sort_order, parent_id, payment_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, icon || "📱", iconStyle || "serviceIconBlue", title, description || "", forms || "", sortOrder || 0, parentId || null, paymentType || "both").run();

  return json({ ok: true, data: { id } }, 201);
}

async function updateCarrier(env: Env, id: string, request: Request): Promise<Response> {
  const exists = await env.DB.prepare("SELECT id FROM carriers WHERE id = ?").bind(id).first();
  if (!exists) return json({ ok: false, error: "통신사를 찾을 수 없습니다" }, 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
  }
  const fields: string[] = [];
  const values: unknown[] = [];

  const fieldMap: Record<string, string> = {
    icon: "icon", iconStyle: "icon_style", title: "title",
    description: "description", forms: "forms", sortOrder: "sort_order",
    isActive: "is_active", parentId: "parent_id", paymentType: "payment_type",
    icon_style: "icon_style", sort_order: "sort_order",
    is_active: "is_active", parent_id: "parent_id", payment_type: "payment_type",
    form_config: "form_config", form_version: "form_version", form_template: "form_template", form_fields: "form_fields", excluded_pages: "excluded_pages",
    formConfig: "form_config", formVersion: "form_version", formTemplate: "form_template", formFields: "form_fields", excludedPages: "excluded_pages",
  };

  for (const [key, val] of Object.entries(body)) {
    const col = fieldMap[key];
    if (col) { fields.push(`${col} = ?`); values.push(val); }
  }

  if (fields.length === 0) return json({ ok: false, error: "수정할 필드가 없습니다" }, 400);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(`UPDATE carriers SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

const DEFAULT_MNOS = ["skt", "kt", "lgu"];

async function deleteCarrier(env: Env, id: string): Promise<Response> {
  const exists = await env.DB.prepare("SELECT id FROM carriers WHERE id = ?").bind(id).first();
  if (!exists) return json({ ok: false, error: "통신사를 찾을 수 없습니다" }, 404);

  // 대분류(MNO)는 삭제 불가
  if (DEFAULT_MNOS.includes(id)) {
    return json({ ok: false, error: "대분류 통신사는 삭제할 수 없습니다" }, 400);
  }

  // 하위 통신사 + 요금제 일괄 삭제
  const childIds = await env.DB.prepare("SELECT id FROM carriers WHERE parent_id = ?").bind(id).all();
  const idsToDelete = [id, ...(childIds.results as { id: string }[]).map(c => c.id)];
  for (const cid of idsToDelete) {
    await env.DB.prepare("DELETE FROM plans WHERE carrier_id = ?").bind(cid).run();
  }
  await env.DB.prepare("DELETE FROM carriers WHERE parent_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM carriers WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function ensureDefaultMnos(env: Env): Promise<void> {
  const defaults = [
    { id: "skt", icon: "🔴", title: "SK텔레콤", description: "SKT 망", sort_order: 1 },
    { id: "kt", icon: "🔵", title: "KT", description: "KT 망", sort_order: 2 },
    { id: "lgu", icon: "🟣", title: "LG U+", description: "LGU+ 망", sort_order: 3 },
  ];

  for (const d of defaults) {
    const exists = await env.DB.prepare("SELECT id FROM carriers WHERE id = ?").bind(d.id).first();
    if (!exists) {
      await env.DB.prepare(
        "INSERT INTO carriers (id, icon, icon_style, title, description, forms, sort_order, parent_id) VALUES (?, ?, 'serviceIconBlue', ?, ?, '', ?, NULL)"
      ).bind(d.id, d.icon, d.title, d.description, d.sort_order).run();
    }
  }
}
