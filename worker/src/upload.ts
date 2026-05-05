import { Env, json, requireAuth } from "./auth";

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;

  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return json({ ok: false, error: "파일이 없습니다" }, 400);

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const allowed = ["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf"];
  if (!allowed.includes(ext)) return json({ ok: false, error: "지원하지 않는 파일 형식입니다" }, 400);

  // 파일 크기 제한: PDF 20MB, 이미지 5MB
  const maxSize = ext === "pdf" ? 20 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return json({ ok: false, error: ext === "pdf" ? "PDF 파일은 20MB 이하만 가능합니다" : "이미지 파일은 5MB 이하만 가능합니다" }, 400);
  }

  const folder = ext === "pdf" ? "forms" : "icons";
  const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await env.R2.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const url = `https://api.hlmobile.kr/r2/${key}`;
  return json({ ok: true, data: { url, key } }, 201);
}

export async function handleR2Get(request: Request, env: Env, path: string): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);

  const key = path.replace("/r2/", "");
  // 경로 순회 방지
  if (!key || key.includes("..") || key.startsWith("/")) {
    return json({ ok: false, error: "잘못된 경로입니다" }, 400);
  }
  const obj = await env.R2.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
