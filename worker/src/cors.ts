const ALLOWED_ORIGINS = [
  "https://hlmobile-1ue.pages.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".hlmobile-1ue.pages.dev");

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleOptions(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}
