"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchDashboard } from "@/lib/api";
import styles from "../page.module.css";

interface DashData {
  carriers: number;
  mvnos: number;
  plans: number;
  applications: {
    total: number;
    today: number;
    week: number;
    byCarrier: { carrier_name: string; cnt: number }[];
    recent: { id: number; subscriber_name: string; carrier_name: string; plan_name: string; created_at: string }[];
  };
  notices: number;
  inquiries: { total: number; pending: number };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(async () => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) { router.push("/admin"); return; }
    setLoading(true);
    const d = await fetchDashboard() as unknown as DashData;
    setData(d);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const handleLogout = () => { sessionStorage.removeItem("admin_token"); router.push("/admin"); };

  const StatCard = ({ label, value, color, href }: { label: string; value: number | string; color: string; href?: string }) => (
    <Link href={href || "#"} style={{ background: "white", borderRadius: 16, padding: "24px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)", textDecoration: "none", transition: "transform 0.15s" }}>
      <div style={{ fontSize: 28, fontWeight: 900, color, fontFamily: "var(--font-mono)", letterSpacing: -1 }}>{value}</div>
      <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4, fontWeight: 500 }}>{label}</div>
    </Link>
  );

  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <a href="/" className={styles.sidebarLogo} style={{textDecoration:"none",color:"inherit"}}><span className={styles.sidebarLogoIcon}>H</span>관리자</a>
        <nav className={styles.sidebarNav}>
          <Link href="/admin/dashboard" className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`}>📊 대시보드</Link>
          <Link href="/admin/carriers" className={styles.sidebarLink}>📱 통신사</Link>
          <Link href="/admin/plans" className={styles.sidebarLink}>💰 요금제</Link>
          <Link href="/admin/applications" className={styles.sidebarLink}>📋 신청서</Link>
          <Link href="/admin/form-settings" className={styles.sidebarLink}>📝 신청서설정</Link>
          <Link href="/admin/notices" className={styles.sidebarLink}>📢 공지사항</Link>
          <Link href="/admin/inquiries" className={styles.sidebarLink}>💬 문의</Link>
          <Link href="/admin/site-settings" className={styles.sidebarLink}>⚙️ 사이트설정</Link>
        </nav>
        <div className={styles.sidebarLogout}><button className={styles.logoutBtn} onClick={handleLogout}>로그아웃</button></div>
      </aside>

      <nav className={styles.bottomTab}>
        <Link href="/admin/dashboard" className={`${styles.tabLink} ${styles.tabLinkActive}`}><span className={styles.tabIcon}>📊</span><span className={styles.tabLabel}>대시보드</span></Link>
        <Link href="/admin/carriers" className={styles.tabLink}><span className={styles.tabIcon}>📱</span><span className={styles.tabLabel}>통신사</span></Link>
        <Link href="/admin/applications" className={styles.tabLink}><span className={styles.tabIcon}>📋</span><span className={styles.tabLabel}>신청서</span></Link>
        <Link href="/admin/form-settings" className={styles.tabLink}><span className={styles.tabIcon}>📝</span><span className={styles.tabLabel}>설정</span></Link>
        <Link href="/admin/notices" className={styles.tabLink}><span className={styles.tabIcon}>📢</span><span className={styles.tabLabel}>공지</span></Link>
        <Link href="/admin/inquiries" className={styles.tabLink}><span className={styles.tabIcon}>💬</span><span className={styles.tabLabel}>문의</span></Link>
      </nav>

      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>대시보드</h1>
        </div>

        {loading || !data ? <div className={styles.empty}>불러오는 중...</div> : (
          <>
            {/* 통계 카드 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 28 }}>
              <StatCard label="오늘 신청" value={data.applications.today} color="var(--brand)" href="/admin/applications" />
              <StatCard label="이번 주 신청" value={data.applications.week} color="#7C3AED" href="/admin/applications" />
              <StatCard label="전체 신청" value={data.applications.total} color="var(--text-0)" href="/admin/applications" />
              <StatCard label="미답변 문의" value={data.inquiries.pending} color={data.inquiries.pending > 0 ? "#DC2626" : "#059669"} href="/admin/inquiries" />
              <StatCard label="알뜰폰" value={data.mvnos} color="var(--text-2)" href="/admin/carriers" />
              <StatCard label="요금제" value={data.plans} color="var(--text-2)" href="/admin/plans" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* 최근 신청서 */}
              <div style={{ background: "white", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-0)" }}>최근 신청서</span>
                  <Link href="/admin/applications" style={{ fontSize: 12, color: "var(--brand)", fontWeight: 600 }}>전체보기 →</Link>
                </div>
                {data.applications.recent.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>신청서가 없습니다.</div>
                ) : data.applications.recent.map((a, i) => (
                  <div key={a.id} style={{ padding: "12px 20px", borderBottom: i < data.applications.recent.length - 1 ? "1px solid #F8FAFC" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)" }}>{a.subscriber_name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-3)" }}>{a.carrier_name} · {a.plan_name}</div>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{a.created_at?.slice(0, 10)}</span>
                  </div>
                ))}
              </div>

              {/* 통신사별 신청 현황 */}
              <div style={{ background: "white", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-0)" }}>통신사별 신청</span>
                </div>
                {data.applications.byCarrier.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>데이터가 없습니다.</div>
                ) : data.applications.byCarrier.map((c, i) => (
                  <div key={i} style={{ padding: "12px 20px", borderBottom: "1px solid #F8FAFC", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-1)" }}>{c.carrier_name || "미지정"}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--brand)", fontFamily: "var(--font-mono)" }}>{c.cnt}건</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
