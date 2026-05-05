import { Env, json, requireAuth } from "./auth";

export async function handleFormVersions(request: Request, env: Env, path: string): Promise<Response> {
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;

  const parts = path.replace("/api/form-versions", "").split("/").filter(Boolean);

  // GET /api/form-versions?carrier=xxx — 해당 MVNO의 버전 목록
  if (request.method === "GET" && parts.length === 0) {
    const url = new URL(request.url);
    const carrierId = url.searchParams.get("carrier");
    if (!carrierId) return json({ ok: false, error: "carrier 파라미터 필수" }, 400);

    const result = await env.DB.prepare(
      "SELECT * FROM form_versions WHERE carrier_id = ? ORDER BY version DESC"
    ).bind(carrierId).all();
    return json({ ok: true, data: result.results });
  }

  // POST /api/form-versions — 새 버전 생성
  if (request.method === "POST" && parts.length === 0) {
    let body: { carrierId: string; label: string; pages?: string[]; pdfUrl?: string };
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
    }
    const { carrierId, label, pages, pdfUrl } = body;
    if (!carrierId) return json({ ok: false, error: "carrierId는 필수입니다" }, 400);
    if (!pdfUrl && (!pages || pages.length === 0)) {
      return json({ ok: false, error: "pdfUrl 또는 pages는 필수입니다" }, 400);
    }

    // 다음 버전 번호
    const last = await env.DB.prepare(
      "SELECT MAX(version) as v FROM form_versions WHERE carrier_id = ?"
    ).bind(carrierId).first<{ v: number | null }>();
    const nextVersion = (last?.v || 0) + 1;

    // pages에 PDF URL을 저장 (PDF이면 단일 URL 배열)
    const pagesData = pdfUrl ? JSON.stringify([pdfUrl]) : JSON.stringify(pages);

    const result = await env.DB.prepare(
      "INSERT INTO form_versions (carrier_id, version, label, pages, is_active) VALUES (?, ?, ?, ?, 0)"
    ).bind(carrierId, nextVersion, label || `v${nextVersion}`, pagesData).run();

    return json({ ok: true, data: { id: result.meta.last_row_id, version: nextVersion } }, 201);
  }

  // PUT /api/form-versions/:id/activate — 활성 버전 변경
  if (request.method === "PUT" && parts.length === 2 && parts[1] === "activate") {
    const id = parts[0];

    // 해당 버전 확인
    const ver = await env.DB.prepare("SELECT * FROM form_versions WHERE id = ?").bind(id).first<{ carrier_id: string; pages: string }>();
    if (!ver) return json({ ok: false, error: "버전을 찾을 수 없습니다" }, 404);

    // 같은 carrier의 모든 버전 비활성
    await env.DB.prepare("UPDATE form_versions SET is_active = 0 WHERE carrier_id = ?").bind(ver.carrier_id).run();

    // 선택한 버전 활성
    await env.DB.prepare("UPDATE form_versions SET is_active = 1 WHERE id = ?").bind(id).run();

    // carriers 테이블에도 반영 (PDF URL만 변경, 좌표(form_fields)는 유지)
    let pages: string[] = [];
    try { pages = JSON.parse(ver.pages) as string[]; } catch { /* malformed pages data */ }
    const templateUrl = pages[0] || null;
    await env.DB.prepare(
      "UPDATE carriers SET form_template = ? WHERE id = ?"
    ).bind(templateUrl, ver.carrier_id).run();

    return json({ ok: true });
  }

  // DELETE /api/form-versions/:id — DB + R2 이미지 전부 삭제
  if (request.method === "DELETE" && parts.length === 1) {
    const ver = await env.DB.prepare("SELECT * FROM form_versions WHERE id = ?").bind(parts[0]).first<{ pages: string; is_active: number; carrier_id: string }>();
    if (!ver) return json({ ok: false, error: "버전을 찾을 수 없습니다" }, 404);

    // R2 이미지 삭제
    try {
      const pages = JSON.parse(ver.pages) as string[];
      for (const url of pages) {
        const key = url.replace(/^https?:\/\/[^/]+\/r2\//, "");
        if (key) await env.R2.delete(key);
      }
    } catch { /* ignore */ }

    // 활성 버전이었으면 carriers 테이블의 template만 초기화 (좌표는 유지)
    if (ver.is_active) {
      await env.DB.prepare(
        "UPDATE carriers SET form_template = NULL WHERE id = ?"
      ).bind(ver.carrier_id).run();
    }

    await env.DB.prepare("DELETE FROM form_versions WHERE id = ?").bind(parts[0]).run();
    return json({ ok: true });
  }

  // DELETE /api/form-versions/all/:carrierId — 해당 MVNO의 전체 버전 삭제
  if (request.method === "DELETE" && parts.length === 2 && parts[0] === "all") {
    const carrierId = parts[1];

    // 모든 버전의 R2 이미지 삭제
    const allVers = await env.DB.prepare("SELECT pages FROM form_versions WHERE carrier_id = ?").bind(carrierId).all();
    for (const row of allVers.results as { pages: string }[]) {
      try {
        const pages = JSON.parse(row.pages) as string[];
        for (const url of pages) {
          const key = url.replace(/^https?:\/\/[^/]+\/r2\//, "");
          if (key) await env.R2.delete(key);
        }
      } catch { /* ignore */ }
    }

    // DB 레코드 전부 삭제
    await env.DB.prepare("DELETE FROM form_versions WHERE carrier_id = ?").bind(carrierId).run();

    // carriers 테이블 template만 초기화 (좌표는 유지)
    await env.DB.prepare(
      "UPDATE carriers SET form_template = NULL WHERE id = ?"
    ).bind(carrierId).run();

    return json({ ok: true });
  }

  return json({ ok: false, error: "Not found" }, 404);
}
