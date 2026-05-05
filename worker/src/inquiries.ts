import { Env, json, requireAuth } from "./auth";

export async function handleInquiries(request: Request, env: Env, path: string): Promise<Response> {
  const id = path.replace("/api/inquiries", "").replace(/^\//, "") || null;

  // 사용자: 문의 등록 (인증 불필요)
  if (request.method === "POST" && !id) return createInquiry(env, request);

  // 사용자: 내 문의 조회 (이름+연락처로)
  if (request.method === "POST" && id === "search") return searchMyInquiries(env, request);

  // 관리자: 목록 조회, 답변
  if (request.method === "GET") {
    const authErr = await requireAuth(request, env);
    if (authErr) return authErr;
    return id ? getInquiry(env, id) : listInquiries(env);
  }

  if (request.method === "PUT" && id) {
    const authErr = await requireAuth(request, env);
    if (authErr) return authErr;
    return replyInquiry(env, id, request);
  }

  if (request.method === "DELETE" && id) {
    const authErr = await requireAuth(request, env);
    if (authErr) return authErr;
    return deleteInquiry(env, id);
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
}

async function listInquiries(env: Env): Promise<Response> {
  const result = await env.DB.prepare("SELECT * FROM inquiries ORDER BY created_at DESC").all();
  return json({ ok: true, data: result.results });
}

async function getInquiry(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM inquiries WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, error: "문의를 찾을 수 없습니다" }, 404);
  return json({ ok: true, data: row });
}

async function createInquiry(env: Env, request: Request): Promise<Response> {
  let parsed: { name: string; phone: string; email: string; title: string; content: string };
  try {
    parsed = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
  }
  const { name, phone, email, title, content } = parsed;
  if (!name || !title || !content) return json({ ok: false, error: "이름, 제목, 내용은 필수입니다" }, 400);

  const result = await env.DB.prepare(
    "INSERT INTO inquiries (name, phone, email, title, content) VALUES (?, ?, ?, ?, ?)"
  ).bind(name, phone || "", email || "", title, content).run();

  return json({ ok: true, data: { id: result.meta.last_row_id } }, 201);
}

async function replyInquiry(env: Env, id: string, request: Request): Promise<Response> {
  let body: { reply: string };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
  }
  const { reply } = body;
  if (!reply) return json({ ok: false, error: "답변 내용은 필수입니다" }, 400);

  const exists = await env.DB.prepare("SELECT id FROM inquiries WHERE id = ?").bind(id).first();
  if (!exists) return json({ ok: false, error: "문의를 찾을 수 없습니다" }, 404);

  await env.DB.prepare(
    "UPDATE inquiries SET reply = ?, replied_at = datetime('now') WHERE id = ?"
  ).bind(reply, id).run();

  return json({ ok: true });
}

async function deleteInquiry(env: Env, id: string): Promise<Response> {
  const exists = await env.DB.prepare("SELECT id FROM inquiries WHERE id = ?").bind(id).first();
  if (!exists) return json({ ok: false, error: "문의를 찾을 수 없습니다" }, 404);
  await env.DB.prepare("DELETE FROM inquiries WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function searchMyInquiries(env: Env, request: Request): Promise<Response> {
  let parsed: { name: string; email: string };
  try {
    parsed = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
  }
  const { name, email } = parsed;
  if (!name || !email) return json({ ok: false, error: "이름과 이메일을 입력해주세요" }, 400);

  const result = await env.DB.prepare(
    "SELECT id, title, content, reply, replied_at, created_at FROM inquiries WHERE name = ? AND email = ? ORDER BY created_at DESC"
  ).bind(name, email).all();

  return json({ ok: true, data: result.results });
}
