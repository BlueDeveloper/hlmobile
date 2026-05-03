"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchSettings, updateSettings, uploadImage } from "@/lib/api";
import styles from "../page.module.css";

interface SettingField {
  key: string;
  label: string;
  desc: string;
  maxLength?: number;
  type?: "image";
}

const SETTING_FIELDS: SettingField[] = [
  { key: "logo_icon", label: "로고 아이콘 글자", desc: "헤더 파란 박스 안에 표시되는 글자 (예: H)", maxLength: 4 },
  { key: "logo_text", label: "로고 텍스트 (앞부분)", desc: "아이콘 옆 일반 텍스트 (예: hl)", maxLength: 20 },
  { key: "logo_accent", label: "로고 텍스트 (강조)", desc: "파란색으로 표시되는 부분 (예: mobile)", maxLength: 20 },
  { key: "logo_image", label: "로고 이미지 URL", desc: "이미지 로고 사용 시 URL 입력 (텍스트 로고 대신 표시)", type: "image" },
  { key: "company_name", label: "회사명", desc: "푸터 회사 정보에 표시" },
  { key: "company_ceo", label: "대표자명", desc: "" },
  { key: "business_number", label: "사업자등록번호", desc: "" },
  { key: "address", label: "주소", desc: "" },
  { key: "commerce_number", label: "통신판매번호", desc: "" },
  { key: "footer_desc", label: "푸터 설명", desc: "푸터 로고 아래 설명 텍스트" },
  { key: "copyright", label: "저작권 표시", desc: "푸터 최하단 문구" },
];

export default function SiteSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) { router.push("/admin"); return; }
    setLoading(true);
    const data = await fetchSettings();
    setSettings(data);
    setOriginal(data);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const changed: Record<string, string> = {};
    for (const [k, v] of Object.entries(settings)) {
      if (v !== original[k]) changed[k] = v;
    }
    if (Object.keys(changed).length > 0) {
      await updateSettings(changed);
      setOriginal({ ...settings });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleImageUpload = async (key: string, file: File) => {
    setUploading(true);
    const res = await uploadImage(file);
    if (res.ok && res.data) {
      handleChange(key, res.data.url);
    }
    setUploading(false);
  };

  const hasChanges = Object.keys(settings).some((k) => settings[k] !== original[k]);

  const handleLogout = () => { sessionStorage.removeItem("admin_token"); router.push("/admin"); };

  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <a href="/" className={styles.sidebarLogo} style={{ textDecoration: "none", color: "inherit" }}>
          <span className={styles.sidebarLogoIcon}>{settings.logo_icon || "H"}</span>관리자
        </a>
        <nav className={styles.sidebarNav}>
          <Link href="/admin/dashboard" className={styles.sidebarLink}>📊 대시보드</Link>
          <Link href="/admin/carriers" className={styles.sidebarLink}>📱 통신사</Link>
          <Link href="/admin/plans" className={styles.sidebarLink}>💰 요금제</Link>
          <Link href="/admin/applications" className={styles.sidebarLink}>📋 신청서</Link>
          <Link href="/admin/form-settings" className={styles.sidebarLink}>📝 신청서설정</Link>
          <Link href="/admin/notices" className={styles.sidebarLink}>📢 공지사항</Link>
          <Link href="/admin/inquiries" className={styles.sidebarLink}>💬 문의</Link>
          <Link href="/admin/site-settings" className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`}>⚙️ 사이트설정</Link>
        </nav>
        <div className={styles.sidebarLogout}><button className={styles.logoutBtn} onClick={handleLogout}>로그아웃</button></div>
      </aside>

      <nav className={styles.bottomTab}>
        <Link href="/admin/dashboard" className={styles.tabLink}><span className={styles.tabIcon}>📊</span><span className={styles.tabLabel}>대시보드</span></Link>
        <Link href="/admin/carriers" className={styles.tabLink}><span className={styles.tabIcon}>📱</span><span className={styles.tabLabel}>통신사</span></Link>
        <Link href="/admin/applications" className={styles.tabLink}><span className={styles.tabIcon}>📋</span><span className={styles.tabLabel}>신청서</span></Link>
        <Link href="/admin/notices" className={styles.tabLink}><span className={styles.tabIcon}>📢</span><span className={styles.tabLabel}>공지</span></Link>
        <Link href="/admin/site-settings" className={`${styles.tabLink} ${styles.tabLinkActive}`}><span className={styles.tabIcon}>⚙️</span><span className={styles.tabLabel}>설정</span></Link>
      </nav>

      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>사이트 설정</h1>
          <button
            className={styles.addBtn}
            onClick={handleSave}
            disabled={saving || !hasChanges}
            style={{ opacity: hasChanges ? 1 : 0.5, cursor: hasChanges ? "pointer" : "default" }}
          >
            {saving ? "저장 중..." : saved ? "저장 완료 ✓" : "저장"}
          </button>
        </div>

        {loading ? (
          <div className={styles.empty}>불러오는 중...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "white", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden" }}>
            {/* 로고 미리보기 */}
            <div style={{ padding: "24px 28px", borderBottom: "1px solid #F1F5F9", background: "#F8FAFC" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>로고 미리보기</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 20px", background: "white", borderRadius: 12, border: "1px solid #E8ECF1" }}>
                  {settings.logo_image ? (
                    <img src={settings.logo_image} alt="logo" style={{ height: 32, objectFit: "contain" }} />
                  ) : (
                    <>
                      <span style={{ width: 32, height: 32, background: "var(--brand)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700 }}>
                        {settings.logo_icon || "H"}
                      </span>
                      <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.5 }}>
                        {settings.logo_text || "hl"}<span style={{ color: "var(--brand)" }}>{settings.logo_accent || "mobile"}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {SETTING_FIELDS.map((field, i) => (
              <div key={field.key} style={{ padding: "18px 28px", borderBottom: i < SETTING_FIELDS.length - 1 ? "1px solid #F1F5F9" : "none", display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ flex: "0 0 180px" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-0)" }}>{field.label}</div>
                  {field.desc && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{field.desc}</div>}
                </div>
                <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={settings[field.key] || ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    maxLength={"maxLength" in field ? field.maxLength : undefined}
                    style={{ margin: 0 }}
                  />
                  {field.type === "image" && (
                    <>
                      <label style={{ padding: "10px 16px", background: "var(--brand-light)", color: "var(--brand)", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {uploading ? "업로드중..." : "이미지 업로드"}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(field.key, file);
                          }}
                        />
                      </label>
                      {settings[field.key] && (
                        <button
                          onClick={() => handleChange(field.key, "")}
                          style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          삭제
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
