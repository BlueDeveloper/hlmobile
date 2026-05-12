"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchInquiries, replyInquiry, deleteInquiry } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { Inquiry } from "@/types";
import styles from "../page.module.css";

export default function AdminInquiriesPage() {
  const { toast } = useToast();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<Inquiry | null>(null);
  const [reply, setReply] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) { router.push("/admin"); return; }
    setLoading(true);
    const data = await fetchInquiries();
    setInquiries(data);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const openReply = (inq: Inquiry) => { setModal(inq); setReply(inq.reply || ""); };

  const handleReply = async () => {
    if (!modal) return;
    if (!reply.trim()) { toast("답변 내용을 입력해주세요.", "error"); return; }
    try {
      await replyInquiry(modal.id, reply);
      toast("답변이 저장되었습니다.", "success");
    } catch { toast("답변 저장에 실패했습니다.", "error"); return; }
    setModal(null);
    load();
  };

  const handleBulkDelete = async () => {
    if (checkedIds.size === 0) { toast("삭제할 문의를 선택해주세요.", "error"); return; }
    if (!confirm(`${checkedIds.size}건의 문의를 삭제합니다.`)) return;
    setLoading(true);
    let fail = 0;
    for (const id of checkedIds) {
      try { await deleteInquiry(id); } catch { fail++; }
    }
    setCheckedIds(new Set());
    if (fail > 0) toast(`${fail}건 삭제 실패`, "error");
    load();
  };

  const toggleCheck = (id: number) => {
    setCheckedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleCheckAll = () => {
    checkedIds.size === inquiries.length ? setCheckedIds(new Set()) : setCheckedIds(new Set(inquiries.map((i) => i.id)));
  };

  const handleLogout = () => { sessionStorage.removeItem("admin_token"); router.push("/admin"); };

  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <a href="/" className={styles.sidebarLogo} style={{textDecoration:"none",color:"inherit"}}><span className={styles.sidebarLogoIcon}>H</span>관리자</a>
        <nav className={styles.sidebarNav}>
          <Link href="/admin/dashboard" className={styles.sidebarLink}>📊 대시보드</Link>
          <Link href="/admin/carriers" className={styles.sidebarLink}>📱 통신사</Link>
          <Link href="/admin/plans" className={styles.sidebarLink}>💰 요금제</Link>
          <Link href="/admin/applications" className={styles.sidebarLink}>📋 신청서</Link>
          <Link href="/admin/form-settings" className={styles.sidebarLink}>📝 신청서설정</Link>
          <Link href="/admin/notices" className={styles.sidebarLink}>📢 공지사항</Link>
          <Link href="/admin/resources" className={styles.sidebarLink}>📁 자료실</Link>
          <Link href="/admin/inquiries" className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`}>💬 문의</Link>
          <Link href="/admin/site-settings" className={styles.sidebarLink}>⚙️ 사이트설정</Link>
        </nav>
        <div className={styles.sidebarLogout}><button className={styles.logoutBtn} onClick={handleLogout}>로그아웃</button></div>
      </aside>

      <nav className={styles.bottomTab}>
          <Link href="/admin/dashboard" className={styles.tabLink}><span className={styles.tabIcon}>📊</span><span className={styles.tabLabel}>대시보드</span></Link>
        <Link href="/admin/carriers" className={styles.tabLink}><span className={styles.tabIcon}>📱</span><span className={styles.tabLabel}>통신사</span></Link>
        <Link href="/admin/plans" className={styles.tabLink}><span className={styles.tabIcon}>💰</span><span className={styles.tabLabel}>요금제</span></Link>
        <Link href="/admin/applications" className={styles.tabLink}><span className={styles.tabIcon}>📋</span><span className={styles.tabLabel}>신청서</span></Link>
        <Link href="/admin/form-settings" className={styles.tabLink}><span className={styles.tabIcon}>📝</span><span className={styles.tabLabel}>설정</span></Link>
        <Link href="/admin/notices" className={styles.tabLink}><span className={styles.tabIcon}>📢</span><span className={styles.tabLabel}>공지</span></Link>
        <Link href="/admin/inquiries" className={`${styles.tabLink} ${styles.tabLinkActive}`}><span className={styles.tabIcon}>💬</span><span className={styles.tabLabel}>문의</span></Link>
      </nav>

      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>문의 관리</h1>
          <span style={{ fontSize: 13, color: "var(--text-3)" }}>{inquiries.length}건</span>
        </div>

        {loading ? <div className={styles.empty}>불러오는 중...</div> : inquiries.length === 0 ? <div className={styles.empty}>문의가 없습니다.</div> : (
          <>
            {checkedIds.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", marginBottom: 12, background: "#FEF2F2", borderRadius: 12, border: "1px solid #FECACA" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#DC2626" }}>{checkedIds.size}건 선택됨</span>
                <button onClick={handleBulkDelete} style={{ padding: "8px 16px", background: "#DC2626", color: "white", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>선택 삭제</button>
              </div>
            )}
            <table className={styles.table}>
              <thead><tr><th style={{ width: 40 }}><input type="checkbox" checked={checkedIds.size === inquiries.length && inquiries.length > 0} onChange={toggleCheckAll} /></th><th>이름</th><th>제목</th><th>상태</th><th>등록일</th></tr></thead>
              <tbody>
                {inquiries.map((inq) => (
                  <tr key={inq.id} onClick={() => openReply(inq)} style={{ cursor: "pointer" }}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checkedIds.has(inq.id)} onChange={() => toggleCheck(inq.id)} /></td>
                    <td>{inq.name}</td>
                    <td style={{ fontWeight: 600 }}>{inq.title}</td>
                    <td>{inq.reply ? <span style={{ color: "#059669", fontWeight: 600 }}>답변완료</span> : <span style={{ color: "#D97706", fontWeight: 600 }}>대기</span>}</td>
                    <td style={{ fontSize: 12, color: "var(--text-3)" }}>{inq.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.cardList}>
              {inquiries.map((inq) => (
                <div key={inq.id} className={styles.card} onClick={() => openReply(inq)} style={{ cursor: "pointer" }}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardTitle} style={{ gap: 8 }}>
                      <input type="checkbox" checked={checkedIds.has(inq.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCheck(inq.id)} />
                      {inq.title}
                    </div>
                    {inq.reply ? <span className={styles.cardBadge} style={{ background: "#ECFDF5", color: "#059669" }}>답변완료</span> : <span className={styles.cardBadge} style={{ background: "#FFFBEB", color: "#D97706" }}>대기</span>}
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardField}><span className={styles.cardFieldLabel}>이름</span><span className={styles.cardFieldValue}>{inq.name}</span></div>
                    <div className={styles.cardField}><span className={styles.cardFieldLabel}>등록일</span><span className={styles.cardFieldValue}>{inq.created_at?.slice(0, 10)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {modal && (
          <div className={styles.overlay}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); handleReply(); } }}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>문의 상세 / 답변</h2>
                <button className={styles.modalClose} onClick={() => setModal(null)}>✕</button>
              </div>
              <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>{modal.name} · {modal.phone} · {modal.created_at?.slice(0, 10)}</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "var(--text-0)" }}>{modal.title}</div>
                <div style={{ fontSize: 14, color: "var(--text-1)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{modal.content}</div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>답변</label>
                <textarea className={styles.formInput} rows={5} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="답변을 입력하세요" style={{ resize: "vertical", minHeight: 120 }} />
              </div>
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setModal(null)}>취소</button>
                <button className={styles.saveBtn} onClick={handleReply}>답변 저장</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
