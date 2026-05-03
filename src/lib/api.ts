import type { Carrier, Plan, Notice, Inquiry, Application, ApiResponse } from "@/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://hlmobile-api.blueehdwp.workers.dev";

// 간단 메모리 캐시 (GET 요청 30초 TTL)
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000;

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("admin_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken();
  const method = options.method || "GET";

  // GET 캐시 확인
  const cacheKey = `${path}`;
  if (method === "GET") {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return cached.data as ApiResponse<T>;
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = await res.json() as ApiResponse<T>;

  // GET 결과 캐시 저장
  if (method === "GET" && json.ok) {
    cache.set(cacheKey, { data: json, ts: Date.now() });
  }

  // 쓰기 작업 시 관련 캐시 무효화
  if (method !== "GET") {
    cache.clear();
  }

  return json;
}

// Auth
export async function login(password: string): Promise<ApiResponse<{ token: string }>> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

// Carriers
export async function fetchCarriers(activeOnly = true, parent?: string | null): Promise<Carrier[]> {
  const params = new URLSearchParams();
  if (!activeOnly) params.set("active", "0");
  if (parent !== undefined) params.set("parent", parent === null ? "null" : parent);
  const qs = params.toString();
  const res = await request<Carrier[]>(`/api/carriers${qs ? `?${qs}` : ""}`);
  return res.data || [];
}

export async function fetchCarrierTree(activeOnly = true, skipCache = false): Promise<Carrier[]> {
  if (skipCache) cache.clear();
  const params = new URLSearchParams({ tree: "1" });
  if (!activeOnly) params.set("active", "0");
  const res = await request<Carrier[]>(`/api/carriers?${params.toString()}`);
  return res.data || [];
}

export async function createCarrier(data: Partial<Carrier>): Promise<ApiResponse<{ id: string }>> {
  return request("/api/carriers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCarrier(id: string, data: Partial<Carrier>): Promise<ApiResponse<void>> {
  return request(`/api/carriers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteCarrier(id: string): Promise<ApiResponse<void>> {
  return request(`/api/carriers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Plans
export async function fetchPlans(
  carrierId?: string,
  type?: string,
  activeOnly = true
): Promise<Plan[]> {
  const params = new URLSearchParams();
  if (carrierId) params.set("carrier", carrierId);
  if (type) params.set("type", type);
  if (!activeOnly) params.set("active", "0");
  const qs = params.toString();
  const res = await request<Plan[]>(`/api/plans${qs ? `?${qs}` : ""}`);
  return res.data || [];
}

export async function createPlan(data: Partial<Plan> & { carrierId?: string }): Promise<ApiResponse<{ id: number }>> {
  return request("/api/plans", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updatePlan(id: number, data: Partial<Plan>): Promise<ApiResponse<void>> {
  return request(`/api/plans/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deletePlan(id: number): Promise<ApiResponse<void>> {
  return request(`/api/plans/${id}`, { method: "DELETE" });
}

// Upload
export async function uploadImage(file: File): Promise<ApiResponse<{ url: string; key: string }>> {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    headers,
    body: formData,
  });
  return res.json();
}

// Notices
export async function fetchNotices(pinned?: boolean): Promise<Notice[]> {
  const params = pinned ? "?pinned=1" : "";
  const res = await request<Notice[]>(`/api/notices${params}`);
  return res.data || [];
}

export async function fetchNotice(id: number): Promise<Notice | null> {
  const res = await request<Notice>(`/api/notices/${id}`);
  return res.data || null;
}

export async function createNotice(data: { title: string; content: string; isPinned?: boolean; attachments?: string }): Promise<ApiResponse<{ id: number }>> {
  return request("/api/notices", { method: "POST", body: JSON.stringify(data) });
}

export async function updateNotice(id: number, data: Partial<Notice & { isPinned?: boolean; isActive?: boolean }>): Promise<ApiResponse<void>> {
  return request(`/api/notices/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteNotice(id: number): Promise<ApiResponse<void>> {
  return request(`/api/notices/${id}`, { method: "DELETE" });
}

// Inquiries
export async function fetchInquiries(): Promise<Inquiry[]> {
  const res = await request<Inquiry[]>("/api/inquiries");
  return res.data || [];
}

export async function createInquiry(data: { name: string; phone: string; email: string; title: string; content: string }): Promise<ApiResponse<{ id: number }>> {
  return request("/api/inquiries", { method: "POST", body: JSON.stringify(data) });
}

export async function replyInquiry(id: number, reply: string): Promise<ApiResponse<void>> {
  return request(`/api/inquiries/${id}`, { method: "PUT", body: JSON.stringify({ reply }) });
}

export async function deleteInquiry(id: number): Promise<ApiResponse<void>> {
  return request(`/api/inquiries/${id}`, { method: "DELETE" });
}

export async function searchMyInquiries(name: string, email: string): Promise<Inquiry[]> {
  const res = await request<Inquiry[]>("/api/inquiries/search", {
    method: "POST",
    body: JSON.stringify({ name, email }),
  });
  return res.data || [];
}

// Form Versions
export interface FormVersion {
  id: number;
  carrier_id: string;
  version: number;
  label: string;
  pages: string;
  is_active: number;
  created_at: string;
}

export async function fetchFormVersions(carrierId: string): Promise<FormVersion[]> {
  const res = await request<FormVersion[]>(`/api/form-versions?carrier=${carrierId}`);
  return res.data || [];
}

export async function createFormVersion(carrierId: string, label: string, pages?: string[], pdfUrl?: string): Promise<ApiResponse<{ id: number; version: number }>> {
  return request("/api/form-versions", { method: "POST", body: JSON.stringify({ carrierId, label, pages, pdfUrl }) });
}

export async function activateFormVersion(id: number): Promise<ApiResponse<void>> {
  return request(`/api/form-versions/${id}/activate`, { method: "PUT" });
}

export async function deleteFormVersion(id: number): Promise<ApiResponse<void>> {
  return request(`/api/form-versions/${id}`, { method: "DELETE" });
}

export async function deleteAllFormVersions(carrierId: string): Promise<ApiResponse<void>> {
  return request(`/api/form-versions/all/${carrierId}`, { method: "DELETE" });
}

// Dashboard
export async function fetchDashboard(): Promise<Record<string, unknown>> {
  const res = await request<Record<string, unknown>>("/api/admin/dashboard");
  return res.data || {};
}

// Applications
export async function fetchApplications(skipCache = false): Promise<Application[]> {
  if (skipCache) cache.delete("/api/applications");
  const res = await request<Application[]>("/api/applications");
  return res.data || [];
}

export async function createApplication(data: Record<string, unknown>): Promise<ApiResponse<{ id: number }>> {
  return request("/api/applications", { method: "POST", body: JSON.stringify(data) });
}

export async function deleteApplication(id: number): Promise<ApiResponse<void>> {
  return request(`/api/applications/${id}`, { method: "DELETE" });
}

// Site Settings
export async function fetchSettings(): Promise<Record<string, string>> {
  const res = await request<Record<string, string>>("/api/settings");
  return res.data || {};
}

export async function updateSettings(data: Record<string, string>): Promise<ApiResponse<void>> {
  return request("/api/settings", { method: "PUT", body: JSON.stringify(data) });
}

// Crawl
export async function crawlPlans(carrierId: string, pages = 3): Promise<ApiResponse<{ carrier: string; imported: number; skipped: number; errors: string[] }>> {
  return request("/api/admin/crawl", {
    method: "POST",
    body: JSON.stringify({ carrierId, pages }),
  });
}
