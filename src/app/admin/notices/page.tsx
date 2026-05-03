"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchNotices, createNotice, updateNotice, deleteNotice, uploadImage } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { Notice } from "@/types";
import styles from "../page.module.css";

export default function AdminNoticesPage() {
  const { toast } = useToast();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState({ title: "", content: "", isPinned: false, attachments: [] as string[] });
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) { router.push("/admin"); return; }
    setLoading(true);
    try {
      const data = await fetchNotices();
      setNotices(data);
    } catch {
      toast("데이터를 불러오는데 실패했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm({ title: "", content: "", isPinned: false, attachments: [] }); setEditing(null); setModal("create"); };
  const openEdit = (n: Notice) => { let attachments: string[] = []; try { attachments = n.attachments ? JSON.parse(n.attachments) : []; } catch { attachments = []; } setForm({ title: n.title, content: n.content, isPinned: !!n.is_pinned, attachments }); setEditing(n); setModal("edit"); };

  const handleSave = async () => {
    if (!form.title.trim()) { toast("제목을 입력해주세요.", "error"); return; }
    if (!form.content.trim()) { toast("내용을 입력해주세요.", "error"); return; }
    const payload = { ...form, attachments: form.attachments.length > 0 ? JSON.stringify(form.attachments) : undefined };
    if (modal === "create") {
      const res = await createNotice(payload);
      if (!res.ok) { toast(res.error || "오류가 발생했습니다.", "error"); return; }
    } else if (editing) {
      await updateNotice(editing.id, payload);
    }
    setModal(null);
    load();
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    const res = await uploadImage(file);
    setUploading(false);
    if (res.ok && res.data) {
      setForm(prev => ({ ...prev, attachments: [...prev.attachments, res.data!.url] }));
    } else {
      toast("업로드에 실패했습니다.", "error");
    }
  };

  const handleBulkDelete = async () => {
    if (checkedIds.size === 0) { toast("삭제할 공지를 선택해주세요.", "error"); return; }
    if (!confirm(`${checkedIds.size}건의 공지를 삭제합니다.`)) return;
    for (const id of checkedIds) { await deleteNotice(id); }
    setCheckedIds(new Set());
    load();
  };

  const toggleCheck = (id: number) => {
    setCheckedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleCheckAll = () => {
    checkedIds.size === notices.length ? setCheckedIds(new Set()) : setCheckedIds(new Set(notices.map((n) => n.id)));
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
          <Link href="/admin/notices" className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`}>📢 공지사항</Link>
          <Link href="/admin/inquiries" className={styles.sidebarLink}>💬 문의</Link>
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
        <Link href="/admin/notices" className={`${styles.tabLink} ${styles.tabLinkActive}`}><span className={styles.tabIcon}>📢</span><span className={styles.tabLabel}>공지</span></Link>
        <Link href="/admin/inquiries" className={styles.tabLink}><span className={styles.tabIcon}>💬</span><span className={styles.tabLabel}>문의</span></Link>
      </nav>

      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>공지사항 관리</h1>
          <button className={styles.addBtn} onClick={openCreate}>+ 작성</button>
        </div>

        {loading ? <div className={styles.empty}>불러오는 중...</div> : notices.length === 0 ? <div className={styles.empty}>등록된 공지가 없습니다.</div> : (
          <>
            {checkedIds.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", marginBottom: 12, background: "#FEF2F2", borderRadius: 12, border: "1px solid #FECACA" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#DC2626" }}>{checkedIds.size}건 선택됨</span>
                <button onClick={handleBulkDelete} style={{ padding: "8px 16px", background: "#DC2626", color: "white", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>선택 삭제</button>
              </div>
            )}
            <table className={styles.table}>
              <thead><tr><th style={{ width: 40 }}><input type="checkbox" checked={checkedIds.size === notices.length && notices.length > 0} onChange={toggleCheckAll} /></th><th>제목</th><th>고정</th><th>작성일</th></tr></thead>
              <tbody>
                {notices.map((n) => (
                  <tr key={n.id} onClick={() => openEdit(n)} style={{ cursor: "pointer" }}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checkedIds.has(n.id)} onChange={() => toggleCheck(n.id)} /></td>
                    <td style={{ fontWeight: 600 }}>{n.title}</td>
                    <td>{n.is_pinned ? "📌" : ""}</td>
                    <td style={{ fontSize: 12, color: "var(--text-3)" }}>{n.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.cardList}>
              {notices.map((n) => (
                <div key={n.id} className={styles.card} onClick={() => openEdit(n)} style={{ cursor: "pointer" }}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardTitle} style={{ gap: 8 }}>
                      <input type="checkbox" checked={checkedIds.has(n.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCheck(n.id)} />
                      {n.is_pinned ? "📌 " : ""}{n.title}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>{n.created_at?.slice(0, 10)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {modal && (
          <div className={styles.overlay}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); handleSave(); } }}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>{modal === "create" ? "공지 작성" : "공지 수정"}</h2>
                <button className={styles.modalClose} onClick={() => setModal(null)}>✕</button>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>제목</label>
                <input className={styles.formInput} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="공지 제목" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>내용</label>
                <div style={{ border: "2px solid #E8ECF1", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ display: "flex", gap: 2, padding: "6px 8px", background: "#F8FAFC", borderBottom: "1px solid #E8ECF1", flexWrap: "wrap" }}>
                    {[
                      { cmd: "bold", icon: "B", style: { fontWeight: 800 } },
                      { cmd: "italic", icon: "I", style: { fontStyle: "italic" } },
                      { cmd: "underline", icon: "U", style: { textDecoration: "underline" } },
                      { cmd: "strikeThrough", icon: "S", style: { textDecoration: "line-through" } },
                    ].map((b) => (
                      <button key={b.cmd} type="button" onClick={() => document.execCommand(b.cmd)} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 14, ...b.style }}>{b.icon}</button>
                    ))}
                    <span style={{ width: 1, background: "#E2E8F0", margin: "2px 4px" }} />
                    <button type="button" onClick={() => document.execCommand("insertUnorderedList")} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 13 }}>•</button>
                    <button type="button" onClick={() => document.execCommand("insertOrderedList")} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 13 }}>1.</button>
                  </div>
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    dangerouslySetInnerHTML={{ __html: form.content }}
                    onBlur={(e) => setForm({ ...form, content: e.currentTarget.innerHTML })}
                    style={{ minHeight: 200, padding: "14px 16px", outline: "none", fontSize: 14, lineHeight: 1.7, color: "var(--text-0)" }}
                  />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>첨부파일</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {form.attachments.map((url, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E8ECF1" }}>
                      {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <img src={url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                      ) : (
                        <span style={{ fontSize: 20 }}>📎</span>
                      )}
                      <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 12, color: "var(--brand)", wordBreak: "break-all" }}>{url.split("/").pop()}</a>
                      <button onClick={() => setForm(prev => ({ ...prev, attachments: prev.attachments.filter((_, j) => j !== i) }))} style={{ fontSize: 11, color: "#DC2626", cursor: "pointer", fontWeight: 700 }}>✕</button>
                    </div>
                  ))}
                  <label style={{ padding: "10px", background: "#F1F5F9", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text-2)", border: "2px dashed #D1D5DB", textAlign: "center" }}>
                    {uploading ? "업로드 중..." : "+ 파일/이미지 추가"}
                    <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                  </label>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.isPinned} onChange={(e) => setForm({ ...form, isPinned: e.target.checked })} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>📌 메인 공지로 고정</span>
                </label>
              </div>
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setModal(null)}>취소</button>
                <button className={styles.saveBtn} onClick={handleSave}>저장</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
