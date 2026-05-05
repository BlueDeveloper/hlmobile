// 전화번호 자동 하이픈
export function formatPhone(value: string): string {
  const nums = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (nums.length <= 3) return nums;
  if (nums.length <= 7) return `${nums.slice(0, 3)}-${nums.slice(3)}`;
  return `${nums.slice(0, 3)}-${nums.slice(3, 7)}-${nums.slice(7)}`;
}

// 이메일 유효성
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 생년월일 자동 하이픈
export function formatBirth(value: string): string {
  const nums = value.replace(/[^0-9]/g, "").slice(0, 8);
  if (nums.length <= 4) return nums;
  if (nums.length <= 6) return `${nums.slice(0, 4)}-${nums.slice(4)}`;
  return `${nums.slice(0, 4)}-${nums.slice(4, 6)}-${nums.slice(6)}`;
}

export function formatPrice(n: number | null | undefined): string {
  if (n == null) return "0원";
  return n.toLocaleString() + "원";
}

export function parseJsonSafe<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

export function isValidBirth(birth: string): boolean {
  if (!/^\d{8}$/.test(birth)) return false;
  const y = parseInt(birth.slice(0, 4));
  const m = parseInt(birth.slice(4, 6));
  const d = parseInt(birth.slice(6, 8));
  if (y < 1900 || y > new Date().getFullYear()) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}
