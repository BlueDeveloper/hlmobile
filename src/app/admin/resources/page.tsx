"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchResources, createResource, updateResource, deleteResource, fetchCarrierTree, uploadImage, type Resource } from "@/lib/api";
import type { Carrier } from "@/types";
import styles from "../page.module.css";

const CATEGORIES = ["가입신청서", "변경신청서", "해지신청서", "기타"];

export default function AdminResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Resource | null>(null);
  const [form, setForm] = useState({ carrierId: "", title: "", category: "가입신청서", fileUrl: "", fileName: "" });
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) { router.push("/admin"); return; }
    setLoading(true);
    const [res, tree] = await Promise.all([fetchResources(), fetchCarrierTree(false)]);
    setResources(res);
    // Flatten tree to get all carriers (parents + children)
    const all: Carrier[] = [];
    for (const m of tree) { all.push(m); for (const c of m.children || []) all.push(c); }
    setCarriers(all);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEdit(null);
    setForm({ carrierId: carriers[0]?.id || "", title: "", category: "가입신청서", fileUrl: "", fileName: "" });
    setModal(true);
  };

  const openEdit = (r: Resource) => {
    setEdit(r);
    setForm({ carrierId: r.carrier_id, title: r.title, category: r.category, fileUrl: r.file_url, fileName: r.file_name });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.carrierId || !form.title || !form.fileUrl) return;
    if (edit) {
      await updateResource(edit.id, { carrier_id: form.carrierId, title: form.title, category: form.category, file_url: form.fileUrl, file_name: form.fileName });
    } else {
      await createResource({ carrierId: form.carrierId, title: form.title, category: form.category, fileUrl: form.fileUrl, fileName: form.fileName });
    }
    setModal(false);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await deleteResource(id);
    load();
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    const res = await uploadImage(file);
    if (res.ok && res.data) {
      setForm(f => ({ ...f, fileUrl: res.data!.url, fileName: file.name }));
    }
    setUploading(false);
  };

  const handleLogout = () => { sessionStorage.removeItem("admin_token"); router.push("/admin"); };

  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <a href="/" className={styles.sidebarLogo} style={{ textDecoration: "none", color: "inherit" }}><span className={styles.sidebarLogoIcon}>H</span>관리자</a>
        <nav className={styles.sidebarNav}>
          <Link href="/admin/dashboard" className={styles.sidebarLink}>📊 대시보드</Link>
          <Link href="/admin/carriers" className={styles.sidebarLink}>📱 통신사</Link>
          <Link href="/admin/plans" className={styles.sidebarLink}>💰 요금제</Link>
          <Link href="/admin/applications" className={styles.sidebarLink}>📋 신청서</Link>
          <Link href="/admin/form-settings" className={styles.sidebarLink}>📝 신청서설정</Link>
          <Link href="/admin/notices" className={styles.sidebarLink}>📢 공지사항</Link>
          <Link href="/admin/resources" className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`}>📁 자료실</Link>
          <Link href="/admin/inquiries" className={styles.sidebarLink}>💬 문의</Link>
          <Link href="/admin/site-settings" className={styles.sidebarLink}>⚙️ 사이트설정</Link>
        </nav>
        <div className={styles.sidebarLogout}><button className={styles.logoutBtn} onClick={handleLogout}>로그아웃</button></div>
      </aside>

      <nav className={styles.bottomTab}>
        <Link href="/admin/dashboard" className={styles.tabLink}><span className={styles.tabIcon}>📊</span><span className={styles.tabLabel}>대시보드</span></Link>
        <Link href="/admin/carriers" className={styles.tabLink}><span className={styles.tabIcon}>📱</span><span className={styles.tabLabel}>통신사</span></Link>
        <Link href="/admin/resources" className={`${styles.tabLink} ${styles.tabLinkActive}`}><span className={styles.tabIcon}>📁</span><span className={styles.tabLabel}>자료실</span></Link>
        <Link href="/admin/notices" className={styles.tabLink}><span className={styles.tabIcon}>📢</span><span className={styles.tabLabel}>공지</span></Link>
        <Link href="/admin/site-settings" className={styles.tabLink}><span className={styles.tabIcon}>⚙️</span><span className={styles.tabLabel}>설정</span></Link>
      </nav>

      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>자료실 관리</h1>
          <button className={styles.addBtn} onClick={openAdd}>+ 자료 추가</button>
        </div>

        {loading ? <div className={styles.empty}>불러오는 중...</div> : resources.length === 0 ? (
          <div className={styles.empty}>등록된 자료가 없습니다. 자료를 추가해주세요.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>통신사</th>
                <th>제목</th>
                <th>분류</th>
                <th>파일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.carrier_name || r.carrier_id}</td>
                  <td>{r.title}</td>
                  <td><span style={{ background: "var(--brand-light)", color: "var(--brand)", padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600 }}>{r.category}</span></td>
                  <td><a href={r.file_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)", fontSize: 13, fontWeight: 600 }}>{r.file_name || "파일 보기"}</a></td>
                  <td className={styles.tableActions}>
                    <button className={styles.editBtn} onClick={() => openEdit(r)}>수정</button>
                    <button className={styles.deleteBtn} onClick={() => handleDelete(r.id)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {modal && (
          <div className={styles.overlay} onClick={() => setModal(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>{edit ? "자료 수정" : "자료 추가"}</h2>
                <button className={styles.modalClose} onClick={() => setModal(false)}>×</button>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>통신사</label>
                <select className={styles.formSelect} value={form.carrierId} onChange={(e) => setForm(f => ({ ...f, carrierId: e.target.value }))}>
                  {carriers.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>제목</label>
                <input className={styles.formInput} value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="예: SKT 가입신청서 2026년 5월" />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>분류</label>
                <select className={styles.formSelect} value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>파일</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input className={styles.formInput} value={form.fileUrl} onChange={(e) => setForm(f => ({ ...f, fileUrl: e.target.value }))} placeholder="파일 URL 직접 입력 또는 업로드" style={{ flex: 1 }} />
                  <label style={{ padding: "10px 16px", background: "var(--brand-light)", color: "var(--brand)", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {uploading ? "업로드중..." : "파일 업로드"}
                    <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.hwp,.png,.jpg,.jpeg" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                  </label>
                </div>
                {form.fileName && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>파일명: {form.fileName}</div>}
              </div>

              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setModal(false)}>취소</button>
                <button className={styles.saveBtn} onClick={handleSave}>{edit ? "수정" : "추가"}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
