"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApplications, deleteApplication, fetchCarrierTree } from "@/lib/api";
import { fillAndOpenPdf } from "@/lib/pdfClient";
import { useToast } from "@/components/Toast";
import { formatPrice, parseJsonSafe } from "@/lib/utils";
import type { Application, Carrier } from "@/types";
import styles from "../page.module.css";

export default function AdminApplicationsPage() {
  const { toast } = useToast();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<Application | null>(null);
  const [printing, setPrinting] = useState(false);
  const [tree, setTree] = useState<Carrier[]>([]);
  const router = useRouter();

  const load = useCallback(async () => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) { router.push("/admin"); return; }
    setLoading(true);
    try {
      const [appData, treeData] = await Promise.all([fetchApplications(true), fetchCarrierTree()]);
      setApps(appData);
      setTree(treeData);
    } catch { toast("데이터를 불러오는데 실패했습니다.", "error"); }
    setLoading(false);
  }, [router, toast]);

  useEffect(() => { load(); }, [load]);

  const handleBulkDelete = async () => {
    if (checkedIds.size === 0) { toast("삭제할 신청서를 선택해주세요.", "error"); return; }
    if (!confirm(`${checkedIds.size}건의 신청서를 삭제합니다.`)) return;
    for (const id of checkedIds) { await deleteApplication(id); }
    setCheckedIds(new Set());
    load();
  };

  const toggleCheck = (id: number) => { setCheckedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); };
  const toggleCheckAll = () => { checkedIds.size === apps.length ? setCheckedIds(new Set()) : setCheckedIds(new Set(apps.map((a) => a.id))); };
  const handleLogout = () => { sessionStorage.removeItem("admin_token"); router.push("/admin"); };

  const handlePrint = async (app: Application) => {
    const freshTree = await fetchCarrierTree(false, true);
    const allMvnos = freshTree.flatMap((m: Carrier) => m.children || []);
    const mvno = allMvnos.find((c: Carrier) => c.id === app.carrier_id);
    if (!mvno?.form_template?.endsWith(".pdf")) {
      toast("해당 통신사에 PDF 양식이 없습니다.", "error");
      return;
    }

    const positions = parseJsonSafe<{ key: string; xPt?: number; yPt?: number; fontSize: number; page: number }[]>(mvno.form_fields, []);
    const excludedPages = parseJsonSafe<number[]>(mvno.excluded_pages, []);
    const API = process.env.NEXT_PUBLIC_API_URL || "https://hlmobile-api.hlgroupmobile.workers.dev";
    const templateUrl = mvno.form_template.startsWith("http") ? mvno.form_template : `${API}${mvno.form_template}`;

    // 커스텀 사용자 필드 (extra_data)
    const extraData: Record<string, string> = app.extra_data ? (() => { try { return JSON.parse(app.extra_data); } catch { return {}; } })() : {};

    setPrinting(true);
    try {
      await fillAndOpenPdf(templateUrl, positions, {
        subscriberName: app.subscriber_name,
        birthDate: app.birth_date,
        contactNumber: app.contact_number,
        customerType: app.customer_type,
        idNumber: app.id_number,
        nationality: app.nationality,
        address: `${app.address} ${app.address_detail}`.trim(),
        addressDetail: app.address_detail,
        activationType: app.activation_type,
        usimSerial: app.usim_serial,
        desiredNumber: app.desired_number,
        storeName: app.store_name,
        planName: app.plan_name,
        planMonthly: formatPrice(app.plan_monthly),
        planType: app.payment_type === "postpaid" ? "후불" : "선불",
        carrierName: app.carrier_name,
        // 커스텀 사용자 필드
        ...extraData,
      }, { excludedPages });
      toast("PDF가 새 탭에서 열렸습니다.", "success");
    } catch {
      toast("PDF 생성 실패", "error");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <a href="/" className={styles.sidebarLogo} style={{textDecoration:"none",color:"inherit"}}><span className={styles.sidebarLogoIcon}>H</span>관리자</a>
        <nav className={styles.sidebarNav}>
          <Link href="/admin/dashboard" className={styles.sidebarLink}>📊 대시보드</Link>
          <Link href="/admin/carriers" className={styles.sidebarLink}>📱 통신사</Link>
          <Link href="/admin/plans" className={styles.sidebarLink}>💰 요금제</Link>
          <Link href="/admin/applications" className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`}>📋 신청서</Link>
          <Link href="/admin/form-settings" className={styles.sidebarLink}>📝 신청서설정</Link>
          <Link href="/admin/notices" className={styles.sidebarLink}>📢 공지사항</Link>
          <Link href="/admin/inquiries" className={styles.sidebarLink}>💬 문의</Link>
          <Link href="/admin/site-settings" className={styles.sidebarLink}>⚙️ 사이트설정</Link>
        </nav>
        <div className={styles.sidebarLogout}><button className={styles.logoutBtn} onClick={handleLogout}>로그아웃</button></div>
      </aside>

      <nav className={styles.bottomTab}>
          <Link href="/admin/dashboard" className={styles.tabLink}><span className={styles.tabIcon}>📊</span><span className={styles.tabLabel}>대시보드</span></Link>
        <Link href="/admin/carriers" className={styles.tabLink}><span className={styles.tabIcon}>📱</span><span className={styles.tabLabel}>통신사</span></Link>
        <Link href="/admin/plans" className={styles.tabLink}><span className={styles.tabIcon}>💰</span><span className={styles.tabLabel}>요금제</span></Link>
        <Link href="/admin/applications" className={`${styles.tabLink} ${styles.tabLinkActive}`}><span className={styles.tabIcon}>📋</span><span className={styles.tabLabel}>신청서</span></Link>
        <Link href="/admin/form-settings" className={styles.tabLink}><span className={styles.tabIcon}>📝</span><span className={styles.tabLabel}>설정</span></Link>
        <Link href="/admin/notices" className={styles.tabLink}><span className={styles.tabIcon}>📢</span><span className={styles.tabLabel}>공지</span></Link>
        <Link href="/admin/inquiries" className={styles.tabLink}><span className={styles.tabIcon}>💬</span><span className={styles.tabLabel}>문의</span></Link>
      </nav>

      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>신청서 관리</h1>
          <span style={{ fontSize: 13, color: "var(--text-3)" }}>{apps.length}건</span>
        </div>

        {loading ? <div className={styles.empty}>불러오는 중...</div> : apps.length === 0 ? <div className={styles.empty}>신청서가 없습니다.</div> : (
          <>
            {checkedIds.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", marginBottom: 12, background: "#FEF2F2", borderRadius: 12, border: "1px solid #FECACA" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#DC2626" }}>{checkedIds.size}건 선택됨</span>
                <button onClick={handleBulkDelete} style={{ padding: "8px 16px", background: "#DC2626", color: "white", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>선택 삭제</button>
              </div>
            )}
            <table className={styles.table}>
              <thead><tr>
                <th style={{ width: 40 }}><input type="checkbox" checked={checkedIds.size === apps.length && apps.length > 0} onChange={toggleCheckAll} /></th>
                <th>가입자</th><th>통신사</th><th>요금제</th><th>고객유형</th><th>개통구분</th><th>연락처</th><th>신청일</th><th style={{ width: 70 }}>출력</th>
              </tr></thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.id} onClick={() => setDetail(a)} style={{ cursor: "pointer" }}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checkedIds.has(a.id)} onChange={() => toggleCheck(a.id)} /></td>
                    <td style={{ fontWeight: 600 }}>{a.subscriber_name}</td>
                    <td>{a.carrier_name}</td>
                    <td>{a.plan_name}</td>
                    <td>{a.customer_type}</td>
                    <td>{a.activation_type}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{a.contact_number}</td>
                    <td style={{ fontSize: 12, color: "var(--text-3)" }}>{a.created_at?.slice(0, 10)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handlePrint(a)} disabled={printing}
                        style={{ padding: "4px 12px", background: "var(--brand)", color: "white", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        🖨️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.cardList}>
              {apps.map((a) => (
                <div key={a.id} className={styles.card} onClick={() => setDetail(a)} style={{ cursor: "pointer" }}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardTitle} style={{ gap: 8 }}>
                      <input type="checkbox" checked={checkedIds.has(a.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCheck(a.id)} />
                      {a.subscriber_name}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>{a.created_at?.slice(0, 10)}</span>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardField}><span className={styles.cardFieldLabel}>통신사</span><span className={styles.cardFieldValue}>{a.carrier_name}</span></div>
                    <div className={styles.cardField}><span className={styles.cardFieldLabel}>요금제</span><span className={styles.cardFieldValue}>{a.plan_name}</span></div>
                    <div className={styles.cardField}><span className={styles.cardFieldLabel}>연락처</span><span className={styles.cardFieldValue}>{a.contact_number}</span></div>
                    <div className={styles.cardField}><span className={styles.cardFieldLabel}>개통구분</span><span className={styles.cardFieldValue}>{a.activation_type}</span></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 12px 4px", borderTop: "1px solid var(--border-light)" }}>
                    <button onClick={(e) => { e.stopPropagation(); handlePrint(a); }} disabled={printing}
                      style={{ padding: "6px 16px", background: "var(--brand)", color: "white", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      🖨️ 출력
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 상세 모달 */}
        {detail && (
          <div className={styles.overlay}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>신청서 상세</h2>
                <button className={styles.modalClose} onClick={() => setDetail(null)}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "var(--surface-1)", borderRadius: 12, overflow: "hidden" }}>
                {(() => {
                  // carrier의 form_config에서 필드 라벨 가져오기
                  const mvno = apps.length > 0 ? tree.flatMap(m => m.children || []).find(c => c.id === detail.carrier_id) : null;
                  let allFields: { key: string; label: string }[] = [];
                  const fieldLabels: Record<string, string> = {};
                  const autoKeys = new Set(["todayYear", "todayMonth", "todayDay", "separator"]);
                  if (mvno?.form_config) {
                    try {
                      const parsed = JSON.parse(mvno.form_config);
                      const fields = Array.isArray(parsed) ? parsed : parsed.fields || [];
                      allFields = fields.filter((f: { key: string }) => !autoKeys.has(f.key));
                      allFields.forEach((f: { key: string; label: string }) => { fieldLabels[f.key] = f.label; });
                    } catch {}
                  }
                  // extra_data 파싱
                  const extraData: Record<string, string> = detail.extra_data ? (() => { try { return JSON.parse(detail.extra_data); } catch { return {}; } })() : {};
                  // 기본 컬럼 매핑
                  const knownMap: Record<string, string> = {
                    subscriberName: detail.subscriber_name, customerType: detail.customer_type,
                    activationType: detail.activation_type, contactNumber: detail.contact_number,
                    birthDate: detail.birth_date, usimSerial: detail.usim_serial,
                    idNumber: detail.id_number, nationality: detail.nationality,
                    address: `${detail.address} ${detail.address_detail}`.trim(),
                    addressDetail: detail.address_detail, desiredNumber: detail.desired_number,
                    storeName: detail.store_name,
                  };
                  // form_config 순서대로 모든 필드 표시
                  const rows: [string, string][] = [
                    ["통신사", detail.carrier_name],
                    ["요금제", `${detail.plan_name} (${formatPrice(detail.plan_monthly)}/월)`],
                    ["결제방식", detail.payment_type === "postpaid" ? "후불" : "선불"],
                    ...allFields.map(f => [
                      f.label,
                      knownMap[f.key] || extraData[f.key] || "-"
                    ] as [string, string]),
                    ["신청일", detail.created_at?.slice(0, 19)],
                  ];
                  return rows.filter(([, v]) => v && v.trim()).map(([label, value], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border-light)", fontSize: 14 }}>
                      <span style={{ color: "var(--text-3)" }}>{label}</span>
                      <span style={{ color: "var(--text-0)", fontWeight: 600 }}>{value}</span>
                    </div>
                  ));
                })()}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button onClick={() => setDetail(null)} style={{ padding: "10px 20px", background: "#F1F5F9", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-2)" }}>닫기</button>
                <button onClick={() => handlePrint(detail)} disabled={printing}
                  style={{ padding: "10px 24px", background: "var(--brand)", color: "white", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {printing ? "생성 중..." : "신청서 출력"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
