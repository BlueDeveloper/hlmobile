import { Env, createToken, json, requireAuth } from "./auth";
import { corsHeaders, handleOptions } from "./cors";
import { handleCarriers } from "./carriers";
import { handlePlans } from "./plans";
import { handleUpload, handleR2Get } from "./upload";
import { handleNotices } from "./notices";
import { handleInquiries } from "./inquiries";
import { handleCrawl } from "./crawl";
import { handleApplications } from "./applications";
import { handleDashboard } from "./dashboard";
import { handleFormVersions } from "./formVersions";
import { handlePdfFill } from "./pdfFill";
import { handleSettings } from "./settings";
import { handleResources } from "./resources";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    let response: Response;

    try {
      if (path === "/api/auth/login" && request.method === "POST") {
        response = await handleLogin(request, env);
      } else if (path === "/api/auth/change-password" && request.method === "POST") {
        response = await handleChangePassword(request, env);
      } else if (path === "/api/upload") {
        response = await handleUpload(request, env);
      } else if (path.startsWith("/r2/")) {
        response = await handleR2Get(request, env, path);
      } else if (path.startsWith("/api/carriers")) {
        response = await handleCarriers(request, env, path);
      } else if (path === "/api/admin/dashboard") {
        response = await handleDashboard(request, env);
      } else if (path === "/api/pdf-fill") {
        response = await handlePdfFill(request, env);
      } else if (path.startsWith("/api/form-versions")) {
        response = await handleFormVersions(request, env, path);
      } else if (path === "/api/admin/crawl") {
        response = await handleCrawl(request, env);
      } else if (path.startsWith("/api/plans")) {
        response = await handlePlans(request, env, path);
      } else if (path.startsWith("/api/notices")) {
        response = await handleNotices(request, env, path);
      } else if (path.startsWith("/api/applications")) {
        response = await handleApplications(request, env, path);
      } else if (path.startsWith("/api/resources")) {
        response = await handleResources(request, env, path);
      } else if (path === "/api/settings") {
        response = await handleSettings(request, env);
      } else if (path.startsWith("/api/inquiries")) {
        response = await handleInquiries(request, env, path);
      } else {
        response = json({ ok: false, error: "Not found" }, 404);
      }
    } catch (err) {
      console.error("API Error:", err);
      console.error(err instanceof Error ? err.message : err);
      response = json({ ok: false, error: "서버 오류가 발생했습니다" }, 500);
    }

    const cors = corsHeaders(request);
    for (const [key, val] of Object.entries(cors)) {
      response.headers.set(key, val);
    }

    return response;
  },
};

async function handleLogin(request: Request, env: Env): Promise<Response> {
  let body: { password?: string };
  try {
    body = await request.json<{ password?: string }>();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
  }
  if (!body.password) {
    return json({ ok: false, error: "비밀번호를 입력해주세요" }, 400);
  }
  // D1에 저장된 비밀번호 우선, 없으면 환경변수 fallback
  const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'admin_password'").first<{ value: string }>();
  const correctPassword = row?.value || env.ADMIN_PASSWORD;
  if (body.password !== correctPassword) {
    return json({ ok: false, error: "비밀번호가 올바르지 않습니다" }, 401);
  }
  const token = await createToken(env);
  return json({ ok: true, data: { token } });
}

async function handleChangePassword(request: Request, env: Env): Promise<Response> {
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;
  const body = await request.json<{ currentPassword?: string; newPassword?: string }>();
  if (!body.currentPassword || !body.newPassword) {
    return json({ ok: false, error: "현재 비밀번호와 새 비밀번호를 입력해주세요" }, 400);
  }
  if (body.newPassword.length < 4) {
    return json({ ok: false, error: "비밀번호는 4자 이상이어야 합니다" }, 400);
  }
  const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'admin_password'").first<{ value: string }>();
  const correctPassword = row?.value || env.ADMIN_PASSWORD;
  if (body.currentPassword !== correctPassword) {
    return json({ ok: false, error: "현재 비밀번호가 올바르지 않습니다" }, 401);
  }
  await env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value, updated_at) VALUES ('admin_password', ?, datetime('now'))").bind(body.newPassword).run();
  return json({ ok: true });
}
