import { Env, json, requireAuth } from "./auth";

export async function handleApplications(request: Request, env: Env, path: string): Promise<Response> {
  const id = path.replace("/api/applications", "").replace(/^\//, "") || null;

  // 사용자: 신청서 등록 (인증 불필요)
  if (request.method === "POST" && !id) return createApplication(env, request);

  // 관리자: 목록/상세 조회, 삭제
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;

  if (request.method === "GET") return id ? getApplication(env, id) : listApplications(env);
  if (request.method === "DELETE" && id) return deleteApplication(env, id);

  return json({ ok: false, error: "Method not allowed" }, 405);
}

async function listApplications(env: Env): Promise<Response> {
  const result = await env.DB.prepare("SELECT * FROM applications ORDER BY created_at DESC").all();
  return json({ ok: true, data: result.results });
}

async function getApplication(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, error: "신청서를 찾을 수 없습니다" }, 404);
  return json({ ok: true, data: row });
}

async function createApplication(env: Env, request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json<Record<string, unknown>>();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
  }
  const { carrierId, carrierName, planName, planMonthly, usimSerial, customerType, contactNumber, subscriberName, birthDate, idNumber, nationality, address, addressDetail, activationType, desiredNumber, storeName, paymentType, ...rest } = body as Record<string, string>;

  if (!subscriberName || !contactNumber) return json({ ok: false, error: "가입자명과 연락처는 필수입니다" }, 400);

  // 기본 컬럼 외 나머지는 extra_data에 JSON으로 저장
  const knownKeys = new Set(["carrierId","carrierName","planName","planMonthly","usimSerial","customerType","contactNumber","subscriberName","birthDate","idNumber","nationality","address","addressDetail","activationType","desiredNumber","storeName","paymentType"]);
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(rest)) { if (v && !knownKeys.has(k)) extra[k] = String(v); }
  const extraData = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;

  const result = await env.DB.prepare(
    `INSERT INTO applications (carrier_id, carrier_name, plan_name, plan_monthly, usim_serial, customer_type, contact_number, subscriber_name, birth_date, id_number, nationality, address, address_detail, activation_type, desired_number, store_name, payment_type, extra_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    carrierId || "", carrierName || "", planName || "", planMonthly || 0,
    usimSerial || "", customerType || "", contactNumber || "", subscriberName || "",
    birthDate || "", idNumber || "", nationality || "", address || "",
    addressDetail || "", activationType || "", desiredNumber || "", storeName || "",
    paymentType || "postpaid", extraData
  ).run();

  return json({ ok: true, data: { id: result.meta.last_row_id } }, 201);
}

async function deleteApplication(env: Env, id: string): Promise<Response> {
  const exists = await env.DB.prepare("SELECT id FROM applications WHERE id = ?").bind(id).first();
  if (!exists) return json({ ok: false, error: "신청서를 찾을 수 없습니다" }, 404);
  await env.DB.prepare("DELETE FROM applications WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
