"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchCarrierTree, updateCarrier, fetchFormVersions, createFormVersion, activateFormVersion, deleteFormVersion, deleteAllFormVersions } from "@/lib/api";
import type { FormVersion } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { parseJsonSafe } from "@/lib/utils";
import { DEFAULT_PLAN_FIELDS } from "@/lib/constants";
import type { Carrier } from "@/types";
import styles from "../page.module.css";

// PDF.js
async function loadPdfJs(): Promise<unknown> {
  if ((window as unknown as Record<string, unknown>).pdfjsLib) return (window as unknown as Record<string, unknown>).pdfjsLib;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.type = "module";
    s.textContent = `import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs').then(m=>{m.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';window.pdfjsLib=m;window.dispatchEvent(new Event('pdfjsReady'));});`;
    document.head.appendChild(s);
    const h = () => { window.removeEventListener("pdfjsReady", h); resolve((window as unknown as Record<string, unknown>).pdfjsLib); };
    window.addEventListener("pdfjsReady", h);
    setTimeout(reject, 15000);
  });
}

interface FormField { key: string; label: string; type: "text" | "phone" | "date" | "select" | "address" | "composite"; required: boolean; options?: string[]; subFields?: { key: string; label: string }[]; separator?: string; showWhen?: { field: string; value: string }; }
interface FieldPos { id: string; key: string; label: string; xPt: number; yPt: number; fontSize: number; page: number; compositeKeys?: string[]; compositeSeparator?: string; checkValue?: string; }

const DEFAULT_FIELDS: FormField[] = [
  { key: "usimSerial", label: "USIM 일련번호", type: "text", required: false },
  { key: "customerType", label: "고객유형", type: "select", required: true, options: ["개인","외국인","청소년","개인사업자","법인사업자"] },
  { key: "subscriberName", label: "가입자명", type: "text", required: true },
  { key: "contactNumber", label: "개통번호/연락번호", type: "phone", required: true },
  { key: "birthDate", label: "생년월일", type: "date", required: true },
  { key: "idNumber", label: "신분증번호/여권번호", type: "text", required: false },
  { key: "nationality", label: "국적", type: "text", required: false },
  { key: "address", label: "주소", type: "address", required: false },
  { key: "addressDetail", label: "상세주소", type: "text", required: false },
  { key: "activationType", label: "개통구분", type: "select", required: true, options: ["신규가입","번호이동","기기변경"] },
  { key: "desiredNumber", label: "희망번호", type: "text", required: false, showWhen: { field: "activationType", value: "신규가입" } },
  { key: "transferType", label: "이동 유형", type: "select", required: true, options: ["선불", "후불"], showWhen: { field: "activationType", value: "번호이동" } },
  { key: "transferNumber", label: "이동할 번호", type: "phone", required: true, showWhen: { field: "activationType", value: "번호이동" } },
  { key: "previousCarrier", label: "이전 통신사", type: "text", required: false, showWhen: { field: "activationType", value: "번호이동" } },
  { key: "storeName", label: "판매점명", type: "text", required: false },
];

const COMMON_FIELDS = [
  { key: "todayYear", label: "년" },
  { key: "todayMonth", label: "월" },
  { key: "todayDay", label: "일" },
  { key: "separator", label: "/" },
];

const STORAGE_KEY = "admin_form_settings_mvno";

export default function FormSettingsPage() {
  const { toast, showLoading, hideLoading } = useToast();
  const [tab, setTab] = useState<"settings" | "editor">("settings");
  const [tree, setTree] = useState<Carrier[]>([]);
  const [selectedMvno, setSelectedMvno] = useState("");
  const [fields, setFields] = useState<FormField[]>(DEFAULT_FIELDS);
  const [planFields, setPlanFields] = useState<{ key: string; label: string }[]>(DEFAULT_PLAN_FIELDS);
  const [versions, setVersions] = useState<FormVersion[]>([]);
  const [upgradeModal, setUpgradeModal] = useState(false);
  const [upgradeLabel, setUpgradeLabel] = useState("");
  const [upgradePages, setUpgradePages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [excludedPages, setExcludedPages] = useState<number[]>([]);

  // 양식 미리보기 (설정탭 좌우 이동)
  const [previewPage, setPreviewPage] = useState(1);
  const [previewTotal, setPreviewTotal] = useState(0);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewPdfRef = useRef<unknown>(null);

  // 좌표 에디터 상태
  const [positions, setPositions] = useState<FieldPos[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [placingField, setPlacingField] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // 섹션 접기/펼치기
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ user: true, plan: true, composite: true, common: true });
  const toggleSection = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  // 합성 필드 만들기
  const [compositeMode, setCompositeMode] = useState(false);
  const [compositeSelected, setCompositeSelected] = useState<string[]>([]);
  const [compositeSep, setCompositeSep] = useState("/");
  // 체크 배치: placingField에 "CHECK:fieldKey:idx:opt1,opt2,..." 형태로 인코딩
  const parseCheckField = (pf: string | null) => {
    if (!pf?.startsWith("CHECK:")) return null;
    const parts = pf.split(":");
    const fieldKey = parts[1]; const idx = Number(parts[2]); const options = parts[3].split(",");
    return { fieldKey, currentIdx: idx, options };
  };
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<unknown>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const router = useRouter();
  const allMvnos = useMemo(() => tree.flatMap(m => m.children || []), [tree]);
  const pdfUrl = useMemo(() => allMvnos.find(m => m.id === selectedMvno)?.form_template || "", [allMvnos, selectedMvno]);

  // 선택 통신사 기억 (sessionStorage)
  const selectMvno = useCallback((id: string) => {
    setSelectedMvno(id);
    pdfDocRef.current = null;
    previewPdfRef.current = null;
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
  }, []);

  const load = useCallback(async () => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) { router.push("/admin"); return; }
    setLoading(true);
    const data = await fetchCarrierTree(false);
    setTree(data);
    // 이전 선택 복원
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const exists = data.flatMap((m: Carrier) => m.children || []).some((c: Carrier) => c.id === saved);
      if (exists) setSelectedMvno(saved);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setPlacingField(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // autoSave 타이머 언마운트 정리
  useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); }, []);

  // positions ref (handleDragEnd에서 최신 값 접근용)
  const positionsRef = useRef(positions);
  // placingField ref (handleCanvasClick에서 최신 값 접근용)
  const placingFieldRef = useRef(placingField);
  placingFieldRef.current = placingField;
  positionsRef.current = positions;

  // MVNO 선택 시
  useEffect(() => {
    if (!selectedMvno || tree.length === 0) return;
    const mvno = tree.flatMap(m => m.children || []).find(m => m.id === selectedMvno);
    if (!mvno) return;

    try {
      if (mvno.form_config) {
        const parsed = JSON.parse(mvno.form_config);
        // DB 필드에 없는 DEFAULT_FIELDS 항목 자동 병합
        const mergeDefaults = (saved: FormField[]) => {
          const keys = new Set(saved.map(f => f.key));
          const missing = DEFAULT_FIELDS.filter(d => !keys.has(d.key));
          return missing.length > 0 ? [...saved, ...missing] : saved;
        };
        if (Array.isArray(parsed)) {
          // 레거시: 배열 = 사용자 항목만
          setFields(mergeDefaults(parsed));
          setPlanFields(DEFAULT_PLAN_FIELDS);
        } else if (parsed.fields) {
          // 새 구조: { fields, planFields }
          setFields(mergeDefaults(parsed.fields));
          setPlanFields(parsed.planFields || DEFAULT_PLAN_FIELDS);
        } else {
          setFields(DEFAULT_FIELDS);
          setPlanFields(DEFAULT_PLAN_FIELDS);
        }
      } else {
        setFields(DEFAULT_FIELDS);
        setPlanFields(DEFAULT_PLAN_FIELDS);
      }
    } catch { setFields(DEFAULT_FIELDS); setPlanFields(DEFAULT_PLAN_FIELDS); }
    fetchFormVersions(selectedMvno).then(setVersions);

    // 좌표 데이터 (id 없는 레거시 호환)
    setPositions([]);
    if (mvno.form_fields) {
      try {
        const parsed = JSON.parse(mvno.form_fields);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.key && parsed[0]?.xPt !== undefined) {
          setPositions(parsed.map((p: FieldPos & { id?: string }) => ({
            ...p,
            id: p.id || `${p.key}_${p.page}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          })));
        }
      } catch {}
    }

    setExcludedPages(parseJsonSafe<number[]>(mvno.excluded_pages, []));

    pdfDocRef.current = null;
    previewPdfRef.current = null;
    setTotalPages(0);
    setPageSizes([]);
    setPreviewPage(1);
    setPreviewTotal(0);
  }, [selectedMvno, tree]);

  // 설정탭: PDF 미리보기 (좌우 이동, 한 페이지씩)
  useEffect(() => {
    if (tab !== "settings" || !pdfUrl || !pdfUrl.endsWith(".pdf") || !previewCanvasRef.current) return;
    const renderPage = async () => {
      try {
        const lib = await loadPdfJs() as { getDocument: Function };
        if (!previewPdfRef.current) previewPdfRef.current = await lib.getDocument({ url: pdfUrl }).promise;
        const doc = previewPdfRef.current as { numPages: number; getPage: (n: number) => Promise<Record<string, Function>> };
        setPreviewTotal(doc.numPages);
        const page = await doc.getPage(previewPage);
        const baseVp = page.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;
        const containerWidth = 400;
        const scale = (containerWidth / baseVp.width) * dpr;
        const vp = page.getViewport({ scale });
        const canvas = previewCanvasRef.current!;
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      } catch {}
    };
    renderPage();
  }, [tab, pdfUrl, previewPage]);

  // 좌표 에디터: 전체 페이지 PDF canvas 렌더링 (제외 페이지 빼고, 고해상도)
  useEffect(() => {
    if (tab !== "editor" || !pdfUrl || !pdfUrl.endsWith(".pdf")) return;
    const renderAll = async () => {
      showLoading("PDF 렌더링 중...");
      try {
        const lib = await loadPdfJs() as { getDocument: Function };
        if (!pdfDocRef.current) pdfDocRef.current = await lib.getDocument({ url: pdfUrl }).promise;
        const doc = pdfDocRef.current as { numPages: number; getPage: (n: number) => Promise<Record<string, Function>> };
        setTotalPages(doc.numPages);

        const sizes: { width: number; height: number }[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const baseVp = page.getViewport({ scale: 1 });
          sizes.push({ width: baseVp.width, height: baseVp.height });
        }
        setPageSizes(sizes);
        canvasRefs.current = new Array(doc.numPages).fill(null);

        await new Promise(r => setTimeout(r, 150));

        const dpr = window.devicePixelRatio || 1;
        for (let i = 1; i <= doc.numPages; i++) {
          if (excludedPages.includes(i)) continue; // 제외 페이지 스킵
          const canvas = canvasRefs.current[i - 1];
          if (!canvas) continue;
          const page = await doc.getPage(i);
          const baseVp = page.getViewport({ scale: 1 });
          const containerWidth = scrollContainerRef.current?.clientWidth || 700;
          const scale = (containerWidth / baseVp.width) * dpr;
          const vp = page.getViewport({ scale });
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.width = `${vp.width / dpr}px`;
          canvas.style.height = `${vp.height / dpr}px`;
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        }
      } catch (e) { console.error(e); }
      hideLoading();
    };
    renderAll();
  }, [tab, pdfUrl, excludedPages, showLoading, hideLoading]);

  const handleSaveFields = async () => {
    if (!selectedMvno) return;
    setSaving(true);
    await updateCarrier(selectedMvno, { form_config: JSON.stringify({ fields, planFields }) } as unknown as Partial<Carrier>);
    setSaving(false);
    toast("항목 설정 저장 완료", "success");
  };

  const handleUploadFile = async (file: File) => {
    showLoading("업로드 중...");
    try {
      const fd = new FormData(); fd.append("file", file);
      const token = sessionStorage.getItem("admin_token");
      const API = process.env.NEXT_PUBLIC_API_URL || "https://api.hlmobile.kr";
      const res = await fetch(`${API}/api/upload`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
      const j = await res.json() as { ok: boolean; data?: { url: string }; error?: string };
      if (j.ok && j.data) { setUpgradePages([j.data.url]); toast("업로드 완료", "success"); }
      else toast(j.error || "업로드 실패", "error");
    } catch { toast("업로드 실패", "error"); }
    hideLoading();
  };

  const handleCreateVersion = async () => {
    if (upgradePages.length === 0) { toast("양식을 업로드해주세요.", "error"); return; }
    setSaving(true);
    const url = upgradePages[0];
    const isPdf = url.endsWith(".pdf");
    const res = await createFormVersion(selectedMvno, upgradeLabel || "", isPdf ? undefined : upgradePages, isPdf ? url : undefined);
    if (res.ok && res.data) {
      await activateFormVersion(res.data.id);
      toast(`v${res.data.version} 생성 및 활성화`, "success");
      fetchFormVersions(selectedMvno).then(setVersions);
      load();
    }
    setSaving(false);
    setUpgradeModal(false);
    setUpgradePages([]);
    setUpgradeLabel("");
  };

  const handleActivate = async (id: number, ver: number) => { await activateFormVersion(id); toast(`v${ver} 활성화`, "success"); fetchFormVersions(selectedMvno).then(setVersions); load(); };
  const handleDeleteVersion = async (id: number, ver: number) => { if (!confirm(`v${ver} 삭제?`)) return; showLoading("삭제 중..."); await deleteFormVersion(id); hideLoading(); toast(`v${ver} 삭제`, "success"); fetchFormVersions(selectedMvno).then(setVersions); load(); };
  const handleDeleteAll = async () => { if (!confirm("전체 양식 삭제?")) return; showLoading("삭제 중..."); await deleteAllFormVersions(selectedMvno); setVersions([]); hideLoading(); toast("전체 삭제 완료", "success"); load(); };

  // 제외 페이지 토글
  const toggleExcludePage = async (pageNum: number) => {
    const isExcluded = excludedPages.includes(pageNum);
    const updated = isExcluded
      ? excludedPages.filter(p => p !== pageNum)
      : [...excludedPages, pageNum].sort((a, b) => a - b);
    setExcludedPages(updated);
    await updateCarrier(selectedMvno, { excluded_pages: JSON.stringify(updated) } as unknown as Partial<Carrier>);
    toast(isExcluded ? `${pageNum}페이지 포함` : `${pageNum}페이지 제외`, "success");
  };

  // 자동 저장 (디바운스 300ms)
  const autoSave = useCallback((newPositions: FieldPos[]) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      if (!selectedMvno) return;
      await updateCarrier(selectedMvno, { form_fields: JSON.stringify(newPositions) } as unknown as Partial<Carrier>);
      toast("자동 저장", "success");
    }, 300);
  }, [selectedMvno, toast]);

  // 배치 삭제 + 자동 저장
  const removePosition = (posId: string) => {
    const updated = positions.filter(p => p.id !== posId);
    setPositions(updated);
    autoSave(updated);
  };

  // 합성 필드 배치 확정
  const confirmComposite = () => {
    if (compositeSelected.length < 2) { toast("2개 이상 선택하세요.", "error"); return; }
    const allF = [...fields, ...planFields];
    const label = compositeSelected.map(k => allF.find(f => f.key === k)?.label || k).join(compositeSep);
    const compositeKey = `composite_${Date.now()}`;
    setPlacingField(compositeKey);
    // 임시로 compositeInfo 저장
    compositeInfoRef.current = { keys: compositeSelected, separator: compositeSep, label };
    setCompositeMode(false);
    toast(`"${label}" — 원하는 위치를 클릭`, "info");
  };
  const compositeInfoRef = useRef<{ keys: string[]; separator: string; label: string } | null>(null);

  // 체크 배치 시작 (select 필드)
  const startCheckPlacing = (fieldKey: string, options: string[]) => {
    const cleaned = positions.filter(p => !(p.key === fieldKey && p.checkValue));
    setPositions(cleaned);
    setPlacingField(`CHECK:${fieldKey}:0:${options.join(",")}`);
    toast(`"${options[0]}" 위치(○)를 클릭하세요 (1/${options.length})`, "info");
  };

  // 좌표 에디터: 캔버스 클릭 (고해상도 보정)
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>, pageNum: number) => {
    const pf = placingFieldRef.current;
    if (!pf) return;
    const canvas = canvasRefs.current[pageNum - 1];
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const size = pageSizes[pageNum - 1];
    if (!size) return;
    const xPt = ((e.clientX - rect.left) / rect.width) * size.width;
    const yPt = size.height - ((e.clientY - rect.top) / rect.height) * size.height;

    const newId = `${pf}_${pageNum}_${Date.now()}`;
    let newPos: FieldPos;

    // 체크 배치: placingField가 "CHECK:key:idx:opt1,opt2,..." 형태인지 확인
    const checkInfo = pf.startsWith("CHECK:") ? (() => { const p = pf.split(":"); return { fieldKey: p[1], currentIdx: Number(p[2]), options: p[3].split(",") }; })() : null;
    if (checkInfo) {
      // 체크 배치 모드
      const opt = checkInfo.options[checkInfo.currentIdx];
      newPos = { id: newId, key: checkInfo.fieldKey, label: opt, xPt, yPt, fontSize: 8, page: pageNum, checkValue: opt };
      const nextIdx = checkInfo.currentIdx + 1;
      const updated = [...positions, newPos];
      setPositions(updated);
      if (nextIdx < checkInfo.options.length) {
        setPlacingField(`CHECK:${checkInfo.fieldKey}:${nextIdx}:${checkInfo.options.join(",")}`);
        toast(`"${checkInfo.options[nextIdx]}" 위치(○)를 클릭하세요 (${nextIdx + 1}/${checkInfo.options.length})`, "info");
      } else {
        setPlacingField(null);
        autoSave(updated);
        toast("체크 배치 완료!", "success");
      }
      return;
    } else if (compositeInfoRef.current) {
      // 합성 필드
      const info = compositeInfoRef.current;
      newPos = { id: newId, key: pf, label: info.label, xPt, yPt, fontSize: 8, page: pageNum, compositeKeys: info.keys, compositeSeparator: info.separator };
      compositeInfoRef.current = null;
      setPlacingField(null);
    } else {
      // 일반 필드
      const field = fields.find(f => f.key === pf) || planFields.find(f => f.key === pf);
      newPos = { id: newId, key: pf, label: field?.label || pf, xPt, yPt, fontSize: 8, page: pageNum };
    }

    const updated = [...positions, newPos];
    setPositions(updated);
    toast(`"${newPos.label}" 배치 (p${pageNum})`, "success");
    autoSave(updated);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, pageNum: number) => {
    if (!dragging) return;
    const canvas = canvasRefs.current[pageNum - 1];
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const size = pageSizes[pageNum - 1];
    if (!size) return;
    const xPt = Math.max(0, Math.min(size.width, ((e.clientX - rect.left) / rect.width) * size.width));
    const yPt = Math.max(0, Math.min(size.height, size.height - ((e.clientY - rect.top) / rect.height) * size.height));
    setPositions(prev => prev.map(p => p.id === dragging ? { ...p, xPt, yPt } : p));
  };

  const handleDragEnd = () => {
    if (dragging) {
      autoSave(positionsRef.current);
      setDragging(null);
    }
  };

  const ptToPercent = (xPt: number, yPt: number, pageIdx: number) => {
    const size = pageSizes[pageIdx] || { width: 595, height: 842 };
    return { left: `${(xPt / size.width) * 100}%`, top: `${((size.height - yPt) / size.height) * 100}%` };
  };

  const activeVersion = versions.find(v => v.is_active);
  // 좌표 에디터에서 보여줄 페이지 (제외 페이지 빼기)
  const visiblePageIndices = useMemo(() => pageSizes.map((_, idx) => idx).filter(idx => !excludedPages.includes(idx + 1)), [pageSizes, excludedPages]);

  const toggleRequired = (i: number) => setFields(p => p.map((f, idx) => idx === i ? { ...f, required: !f.required } : f));
  const removeField = (i: number) => setFields(p => p.filter((_, idx) => idx !== i));
  const addField = () => setFields(p => [{ key: `custom_${Date.now()}`, label: "새 항목", type: "text", required: false }, ...p]);
  const updateField = (i: number, u: Partial<FormField>) => setFields(p => p.map((f, idx) => idx === i ? { ...f, ...u } : f));
  const moveField = (i: number, d: -1 | 1) => { const ni = i + d; if (ni < 0 || ni >= fields.length) return; setFields(p => { const a = [...p]; [a[i], a[ni]] = [a[ni], a[i]]; return a; }); };

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
          <Link href="/admin/form-settings" className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`}>📝 신청서설정</Link>
          <Link href="/admin/notices" className={styles.sidebarLink}>📢 공지사항</Link>
          <Link href="/admin/resources" className={styles.sidebarLink}>📁 자료실</Link>
          <Link href="/admin/inquiries" className={styles.sidebarLink}>💬 문의</Link>
          <Link href="/admin/site-settings" className={styles.sidebarLink}>⚙️ 사이트설정</Link>
        </nav>
        <div className={styles.sidebarLogout}><button className={styles.logoutBtn} onClick={handleLogout}>로그아웃</button></div>
      </aside>

      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>신청서 설정</h1>
        </div>

        {/* MVNO 선택 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 240px" }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>통신사</label>
            <select style={{ width: "100%", padding: "10px 14px", border: "2px solid #E8ECF1", borderRadius: 12, fontSize: 14, fontFamily: "inherit", background: "white" }}
              value={selectedMvno} onChange={e => selectMvno(e.target.value)}>
              <option value="" disabled>선택하세요</option>
              {allMvnos.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
        </div>

        {loading ? <div className={styles.empty}>불러오는 중...</div> : selectedMvno && (
          <>
            {/* 탭 */}
            <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "white", borderRadius: 12, border: "1px solid #E8ECF1", overflow: "hidden" }}>
              {[
                { key: "settings" as const, label: "📋 양식 버전 & 항목" },
                { key: "editor" as const, label: "🎯 좌표 에디터" },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ flex: 1, padding: "14px", fontSize: 14, fontWeight: tab === t.key ? 800 : 500, color: tab === t.key ? "white" : "var(--text-3)", background: tab === t.key ? "var(--brand)" : "white", border: "none", cursor: "pointer", borderRight: "1px solid #E8ECF1", transition: "all 0.15s" }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* 설정 탭 */}
            {tab === "settings" && (
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                {/* 좌측: 양식 버전 + 페이지 미리보기/제외 */}
                <div style={{ flex: "1 1 400px", minWidth: 0 }}>
                  {/* 양식 버전 */}
                  <div style={{ background: "white", borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 800 }}>양식 버전</h3>
                      <div style={{ display: "flex", gap: 8 }}>
                        {versions.length > 0 && <button onClick={handleDeleteAll} style={{ padding: "8px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid #FECACA" }}>전체 삭제</button>}
                        <button onClick={() => { setUpgradeModal(true); setUpgradePages([]); setUpgradeLabel(""); }} style={{ padding: "8px 16px", background: "var(--brand)", color: "white", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>업그레이드</button>
                      </div>
                    </div>
                    {activeVersion ? (
                      <div style={{ padding: 14, background: "#EFF6FF", borderRadius: 10, border: "1px solid #BFDBFE", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div><span style={{ fontSize: 16, fontWeight: 900, color: "var(--brand)" }}>v{activeVersion.version}</span>{activeVersion.label && <span style={{ marginLeft: 8, fontSize: 13, color: "var(--text-2)" }}>{activeVersion.label}</span>}<span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#DBEAFE", color: "#1D4ED8" }}>활성</span></div>
                        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{activeVersion.created_at?.slice(0, 10)}</span>
                      </div>
                    ) : <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>양식을 업로드하세요.</div>}
                    {versions.map(v => (
                      <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderBottom: "1px solid #F1F5F9", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: v.is_active ? "var(--brand)" : "var(--text-2)" }}>v{v.version} {v.label && <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 400 }}>{v.label}</span>}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          {!v.is_active && <button onClick={() => handleActivate(v.id, v.version)} style={{ padding: "3px 8px", background: "#EFF6FF", color: "var(--brand)", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>사용</button>}
                          {!v.is_active && <button onClick={() => handleDeleteVersion(v.id, v.version)} style={{ padding: "3px 8px", background: "#FEF2F2", color: "#DC2626", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>삭제</button>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 페이지 미리보기 + 제외 설정 */}
                  {pdfUrl && pdfUrl.endsWith(".pdf") && (
                    <div style={{ background: "white", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)" }}>
                      <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>페이지 관리</h3>
                      {/* 좌우 이동 */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12 }}>
                        <button onClick={() => setPreviewPage(p => Math.max(1, p - 1))} disabled={previewPage <= 1}
                          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #E8ECF1", background: previewPage <= 1 ? "#F8FAFC" : "white", cursor: previewPage <= 1 ? "default" : "pointer", fontSize: 16, fontWeight: 700, color: "var(--text-2)" }}>
                          ◀
                        </button>
                        <span style={{ fontSize: 14, fontWeight: 800, minWidth: 60, textAlign: "center" }}>
                          {previewPage} / {previewTotal || "?"}
                        </span>
                        <button onClick={() => setPreviewPage(p => Math.min(previewTotal, p + 1))} disabled={previewPage >= previewTotal}
                          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #E8ECF1", background: previewPage >= previewTotal ? "#F8FAFC" : "white", cursor: previewPage >= previewTotal ? "default" : "pointer", fontSize: 16, fontWeight: 700, color: "var(--text-2)" }}>
                          ▶
                        </button>
                      </div>

                      {/* 제외 토글 버튼 */}
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                        {excludedPages.includes(previewPage) ? (
                          <button onClick={() => toggleExcludePage(previewPage)}
                            style={{ padding: "10px 28px", background: "#059669", color: "white", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 8px rgba(5,150,105,0.3)" }}>
                            이 페이지 포함하기
                          </button>
                        ) : (
                          <button onClick={() => toggleExcludePage(previewPage)}
                            style={{ padding: "10px 28px", background: "#DC2626", color: "white", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 8px rgba(220,38,38,0.3)" }}>
                            이 페이지 제외하기
                          </button>
                        )}
                      </div>

                      {/* 제외 현황 */}
                      {excludedPages.length > 0 && (
                        <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, fontSize: 12, color: "#991B1B", fontWeight: 600, textAlign: "center", marginBottom: 12 }}>
                          제외된 페이지: {excludedPages.join(", ")} ({excludedPages.length}장 제외 / 총 {previewTotal}장)
                        </div>
                      )}

                      {/* 미리보기 캔버스 */}
                      <div style={{ position: "relative", background: "#F1F5F9", borderRadius: 10, overflow: "hidden", border: "1px solid #E8ECF1" }}>
                        <canvas ref={previewCanvasRef} style={{ width: "100%", display: "block" }} />
                        {excludedPages.includes(previewPage) && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(220,38,38,0.12)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                            <span style={{ fontSize: 36, fontWeight: 900, color: "rgba(220,38,38,0.4)", transform: "rotate(-20deg)", letterSpacing: 8 }}>제외됨</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 우측: 항목 설정 */}
                <div style={{ flex: "1 1 320px" }}>
                  {/* 사용자 항목 */}
                  <div style={{ background: "white", borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--brand)" }}>사용자 항목</h3>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={addField} style={{ padding: "8px 12px", background: "#F1F5F9", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ 추가</button>
                        <button onClick={handleSaveFields} disabled={saving} style={{ padding: "8px 12px", background: "var(--brand)", color: "white", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{saving ? "저장 중..." : "저장"}</button>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", fontSize: 11, fontWeight: 800, color: "var(--text-1)", background: "#F1F5F9", borderRadius: 6, marginBottom: 6, textAlign: "center" }}>
                      <span style={{ width: 20 }}></span>
                      <span style={{ width: 32 }}>필수</span>
                      <span style={{ width: 150 }}>라벨</span>
                      <span style={{ width: 60 }}>유형</span>
                      <span style={{ width: 150 }}>옵션</span>
                      <span style={{ width: 140 }}>표시조건</span>
                      <span style={{ width: 12 }}></span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flex: 1 }}>
                      {fields.map((f, i) => (
                        <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "#FAFBFD", borderRadius: 8, border: "1px solid #E8ECF1", fontSize: 13 }}>
                          <div style={{ width: 20, display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}><button onClick={() => moveField(i, -1)} style={{ fontSize: 9, cursor: "pointer", color: "var(--text-3)" }}>▲</button><button onClick={() => moveField(i, 1)} style={{ fontSize: 9, cursor: "pointer", color: "var(--text-3)" }}>▼</button></div>
                          <button onClick={() => toggleRequired(i)} style={{ width: 32, height: 20, flexShrink: 0, borderRadius: 4, fontSize: 10, fontWeight: 800, cursor: "pointer", background: f.required ? "var(--brand)" : "#E2E8F0", color: f.required ? "white" : "var(--text-3)" }}>{f.required ? "✓" : ""}</button>
                          <input value={f.label} onChange={e => updateField(i, { label: e.target.value })} style={{ width: 150, flexShrink: 0, padding: "5px 8px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13, outline: "none" }} />
                          <select value={f.type} onChange={e => updateField(i, { type: e.target.value as FormField["type"] })} style={{ width: 60, flexShrink: 0, padding: "5px 4px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 11, color: "#000" }}><option value="text">텍스트</option><option value="phone">전화</option><option value="date">날짜</option><option value="select">선택</option><option value="address">주소</option></select>
                          {f.type === "select" ? <input value={f.options?.join(",") || ""} onChange={e => updateField(i, { options: e.target.value.split(",").map(s => s.trim()) })} onBlur={e => updateField(i, { options: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} placeholder="옵션(콤마구분)" style={{ width: 150, flexShrink: 0, padding: "5px 6px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 11 }} /> : <span style={{ width: 150, flexShrink: 0 }}></span>}
                          <select value={f.showWhen ? `${f.showWhen.field}=${f.showWhen.value}` : ""} onChange={e => { const v = e.target.value; updateField(i, { showWhen: v ? { field: v.split("=")[0], value: v.split("=")[1] } : undefined }); }}
                            style={{ width: 140, flexShrink: 0, padding: "5px 4px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 11, color: f.showWhen ? "#EA580C" : "#000" }}>
                            <option value="">항상</option>
                            {fields.filter(sf => sf.type === "select" && sf.options && sf.key !== f.key).flatMap(sf => sf.options!.map(o => (
                              <option key={`${sf.key}=${o}`} value={`${sf.key}=${o}`}>{sf.label}={o}</option>
                            )))}
                          </select>
                          <button onClick={() => removeField(i)} style={{ fontSize: 12, color: "#DC2626", cursor: "pointer", fontWeight: 700 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* 좌표 에디터 탭 */}
            {tab === "editor" && (
              <>
                {!pdfUrl ? <div className={styles.empty}>양식 PDF를 먼저 업로드하세요.</div> : (
                  <>
                    <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                        배치: {positions.length}개 · {visiblePageIndices.length}/{totalPages}페이지 표시
                        {excludedPages.length > 0 && <span style={{ color: "#DC2626", fontWeight: 700 }}> · {excludedPages.length}장 제외</span>}
                        {" · "}자동 저장
                      </span>
                    </div>

                    {placingField && (() => { const ci = placingField.startsWith("CHECK:") ? (() => { const p = placingField.split(":"); return { fieldKey: p[1], currentIdx: Number(p[2]), options: p[3].split(",") }; })() : null; return (
                      <div style={{ padding: "10px 16px", marginBottom: 10, background: ci ? "#7C3AED" : "#DC2626", color: "white", borderRadius: 10, fontSize: 13, fontWeight: 700, textAlign: "center", position: "sticky", top: 0, zIndex: 20 }}>
                        {ci ? (
                          <>✓ 체크 배치: &quot;{ci.options[ci.currentIdx]}&quot; 위치(○)를 클릭 ({ci.currentIdx + 1}/{ci.options.length})</>
                        ) : (
                          <>&quot;{(fields.find(f => f.key === placingField) || planFields.find(f => f.key === placingField))?.label}&quot; — 원하는 위치를 클릭 (연속 배치, ESC로 완료)</>
                        )}
                        <button onClick={() => setPlacingField(null)} style={{ marginLeft: 10, padding: "3px 10px", background: "rgba(255,255,255,0.25)", color: "white", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>
                          {ci ? "중단" : "완료"}
                        </button>
                      </div>
                    ); })()}

                    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                      {/* PDF 페이지 스크롤 (제외 페이지 빼고) */}
                      <div ref={scrollContainerRef} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        {visiblePageIndices.map(idx => {
                          const pageNum = idx + 1;
                          const pagePos = positions.filter(p => p.page === pageNum);
                          return (
                            <div key={pageNum} style={{ position: "relative", background: "#F1F5F9", borderRadius: 10, overflow: "visible", border: "1px solid #E8ECF1" }}
                              onMouseMove={e => handleMouseMove(e, pageNum)} onMouseUp={handleDragEnd} onMouseLeave={handleDragEnd}>
                              <div style={{ position: "absolute", top: 8, left: 8, zIndex: 15, padding: "3px 10px", background: "rgba(0,0,0,0.6)", color: "white", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                {pageNum} / {totalPages}
                              </div>
                              <canvas
                                ref={el => { canvasRefs.current[idx] = el; }}
                                onClick={e => handleCanvasClick(e, pageNum)}
                                style={{ display: "block", cursor: placingField ? "crosshair" : "default" }}
                              />
                              {/* 체크 배치 모드 오버레이 — 캔버스 클릭을 가로챔 */}
                              {placingField?.startsWith("CHECK:") && (() => {
                                const parts = placingField.split(":");
                                const ck = { fieldKey: parts[1], idx: Number(parts[2]), options: parts[3].split(",") };
                                return (
                                  <div style={{ position: "absolute", inset: 0, zIndex: 12, cursor: "crosshair" }}
                                    onClick={e => {
                                      e.stopPropagation();
                                      const canvas = canvasRefs.current[idx];
                                      if (!canvas) return;
                                      const rect = canvas.getBoundingClientRect();
                                      const size = pageSizes[idx];
                                      if (!size) return;
                                      const xPt = ((e.clientX - rect.left) / rect.width) * size.width;
                                      const yPt = size.height - ((e.clientY - rect.top) / rect.height) * size.height;
                                      const opt = ck.options[ck.idx];
                                      const newPos: FieldPos = { id: `${ck.fieldKey}_check_${pageNum}_${Date.now()}`, key: ck.fieldKey, label: opt, xPt, yPt, fontSize: 8, page: pageNum, checkValue: opt };
                                      const updated = [...positions, newPos];
                                      setPositions(updated);
                                      const nextIdx = ck.idx + 1;
                                      if (nextIdx < ck.options.length) {
                                        setPlacingField(`CHECK:${ck.fieldKey}:${nextIdx}:${ck.options.join(",")}`);
                                        toast(`"${ck.options[nextIdx]}" 위치(○)를 클릭하세요 (${nextIdx + 1}/${ck.options.length})`, "info");
                                      } else {
                                        setPlacingField(null);
                                        autoSave(updated);
                                        toast("체크 배치 완료!", "success");
                                      }
                                    }}
                                  />
                                );
                              })()}
                              {/* 배치된 필드 마커 + 빨간 ✕ 삭제 */}
                              {pagePos.map(p => { const pos = ptToPercent(p.xPt, p.yPt, idx); const isPlan = planFields.some(pf => pf.key === p.key); const isComposite = !!p.compositeKeys; const isCheck = !!p.checkValue; const isCommon = COMMON_FIELDS.some(c => c.key === p.key); return (
                                <div key={p.id} style={{ position: "absolute", left: pos.left, top: pos.top, transform: "translate(0, -100%)", zIndex: 10 }}>
                                  <div onMouseDown={e => { e.preventDefault(); setDragging(p.id); }}
                                    style={{ padding: "2px 8px", background: isCommon ? "rgba(217,119,6,0.9)" : isCheck ? "rgba(234,88,12,0.9)" : isComposite ? "rgba(147,51,234,0.9)" : isPlan ? "rgba(5,150,105,0.9)" : "rgba(37,99,235,0.9)", color: "white", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: dragging === p.id ? "grabbing" : "grab", whiteSpace: "nowrap", userSelect: "none", boxShadow: "0 2px 6px rgba(0,0,0,0.3)", position: "relative" }}>
                                    {isCommon ? COMMON_FIELDS.find(c => c.key === p.key)!.label : isCheck ? `✓${p.checkValue}` : `${p.label} ${p.fontSize}pt`}
                                    {/* 빨간 삭제 버튼 */}
                                    <button onClick={e => { e.stopPropagation(); removePosition(p.id); }}
                                      style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", background: "#DC2626", color: "white", fontSize: 9, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", lineHeight: 1 }}>
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ); })}
                            </div>
                          );
                        })}
                        {visiblePageIndices.length === 0 && (
                          <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>
                            모든 페이지가 제외되었습니다. 양식 버전 탭에서 페이지를 포함해주세요.
                          </div>
                        )}
                      </div>

                      {/* 필드 배치 패널 */}
                      <div style={{ width: 260, flexShrink: 0, position: "sticky", top: 20, alignSelf: "flex-start", background: "white", borderRadius: 10, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)", maxHeight: "85vh", overflowY: "auto" }}>
                        {/* 사용자 항목 */}
                        <h3 onClick={() => toggleSection("user")} style={{ fontSize: 12, fontWeight: 800, marginBottom: collapsed.user ? 10 : 6, color: "var(--brand)", cursor: "pointer", userSelect: "none" }}>{collapsed.user ? "▶" : "▼"} 사용자 항목</h3>
                        <div style={{ display: collapsed.user ? "none" : "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                          {[...fields].sort((a, b) => {
                            const aCheck = a.type === "select" && a.options && a.options.length > 0 ? 0 : 1;
                            const bCheck = b.type === "select" && b.options && b.options.length > 0 ? 0 : 1;
                            return aCheck - bCheck;
                          }).map(f => {
                            const placedList = positions.filter(p => p.key === f.key);
                            const placedCount = placedList.length;
                            const isP = placingField === f.key;
                            const isCheckType = f.type === "select" && f.options && f.options.length > 0;
                            const checkPlaced = positions.filter(p => p.key === f.key && p.checkValue);
                            const [checkExpanded, setCheckExpandedState] = [placingField === `EXPAND:${f.key}` || placingField?.startsWith(`CHECK:${f.key}:`), null];
                            return (
                              <div key={f.key}>
                                {isCheckType ? (
                                  <>
                                    <div onClick={() => {
                                      const isExpanded = placingField === `EXPAND:${f.key}` || placingField?.startsWith(`CHECK:${f.key}:`);
                                      if (isExpanded) { setPlacingField(null); return; }
                                      // 첫 미배치 옵션부터 바로 배치 시작
                                      const opts = f.options!;
                                      const firstUnplaced = opts.findIndex(o => !checkPlaced.find(p => p.checkValue === o));
                                      if (firstUnplaced >= 0) {
                                        setPlacingField(`CHECK:${f.key}:${firstUnplaced}:${opts.join(",")}`);
                                        toast(`"${opts[firstUnplaced]}" 위치(○)를 클릭하세요 (${firstUnplaced + 1}/${opts.length})`, "info");
                                      } else {
                                        setPlacingField(`EXPAND:${f.key}`);
                                      }
                                    }}
                                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 8, background: checkPlaced.length > 0 ? "#FFF7ED" : "#FEF2F2", border: checkPlaced.length > 0 ? "2px solid #FB923C" : "1px solid #FECACA", cursor: "pointer" }}>
                                      <span style={{ fontSize: 13, fontWeight: 800, color: "#EA580C" }}>✓</span>
                                      <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#EA580C" }}>{f.label}</span>
                                      <span style={{ fontSize: 9, color: "#EA580C", fontWeight: 600 }}>체크배치 {checkPlaced.length > 0 ? `(${checkPlaced.length}/${f.options!.length})` : ""}</span>
                                      <span style={{ fontSize: 10, color: "#EA580C" }}>{checkExpanded ? "▼" : "▶"}</span>
                                    </div>
                                    {checkExpanded && (
                                      <div style={{ marginLeft: 8, marginTop: 3, padding: "6px 8px", background: "#FFFBEB", borderRadius: 6, border: "1px solid #FDE68A" }}>
                                        <div style={{ fontSize: 10, color: "#92400E", fontWeight: 600, marginBottom: 4 }}>각 옵션의 ○ 위치를 배치하세요</div>
                                        {f.options!.map((opt, oi) => {
                                          const placed = checkPlaced.find(p => p.checkValue === opt);
                                          return (
                                            <div key={opt} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", fontSize: 11, borderRadius: 4, marginBottom: 2, background: placed ? "#FEF3C7" : "white" }}>
                                              <span style={{ width: 16, fontWeight: 800, color: placed ? "#059669" : "#D97706" }}>{placed ? "✓" : "○"}</span>
                                              <span style={{ flex: 1, fontWeight: 600, color: placed ? "#059669" : "var(--text-1)" }}>{opt}</span>
                                              {placed && (
                                                <button onClick={() => removePosition(placed.id)} style={{ fontSize: 9, color: "#DC2626", cursor: "pointer", fontWeight: 700 }}>✕</button>
                                              )}
                                            </div>
                                          );
                                        })}
                                        <button onClick={() => {
                                          const opts = f.options!;
                                          setPositions(prev => prev.filter(p => !(p.key === f.key && p.checkValue)));
                                          setPlacingField(`CHECK:${f.key}:0:${opts.join(",")}`);
                                          toast(`"${opts[0]}" 위치(○)를 클릭하세요 (1/${opts.length})`, "info");
                                        }} style={{ display: "block", width: "100%", marginTop: 6, padding: "5px 0", background: "#EA580C", color: "white", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                                          전체 연속 배치
                                        </button>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", borderRadius: 8, background: isP ? "#FEF2F2" : placedCount > 0 ? "#EFF6FF" : "#F8FAFC", border: isP ? "2px solid #DC2626" : placedCount > 0 ? "1px solid #BFDBFE" : "1px solid #E8ECF1" }}>
                                    <button onClick={() => { setPlacingField(isP ? null : f.key); if (!isP) toast(`"${f.label}" 선택`, "info"); }}
                                      style={{ flex: 1, textAlign: "left", fontSize: 12, fontWeight: 700, color: isP ? "#DC2626" : placedCount > 0 ? "var(--brand)" : "var(--text-1)", cursor: "pointer" }}>
                                      {isP ? "🎯" : placedCount > 0 ? "✓" : "○"} {f.label}
                                      {placedCount > 1 && <span style={{ marginLeft: 4, fontSize: 10, color: "var(--text-3)" }}>×{placedCount}</span>}
                                    </button>
                                  </div>
                                )}
                                {placedCount > 0 && !isCheckType && (
                                  <div style={{ marginLeft: 8, marginTop: 3, marginBottom: 3, display: "flex", flexDirection: "column", gap: 3 }}>
                                    {placedList.map(p => (
                                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", fontSize: 11, background: "#F8FAFC", borderRadius: 6, border: "1px solid #E8ECF1" }}>
                                        <span style={{ color: "var(--text-3)", fontWeight: 600, minWidth: 20 }}>p{p.page}</span>
                                        <div style={{ display: "flex", alignItems: "center", gap: 0, marginLeft: "auto", border: "1px solid #D1D5DB", borderRadius: 6, overflow: "hidden", background: "white" }}>
                                          <button onClick={() => { const updated = positions.map(pp => { if (pp.id !== p.id) return pp; const ns = Math.max(1, pp.fontSize - 1); return { ...pp, fontSize: ns, yPt: pp.yPt }; }); setPositions(updated); autoSave(updated); }}
                                            style={{ width: 26, height: 26, fontSize: 14, fontWeight: 700, cursor: "pointer", background: "#F8FAFC", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #E2E8F0" }}>−</button>
                                          <input type="number" value={p.fontSize} onChange={e => {
                                            const ns = Number(e.target.value) || 1;
                                            const updated = positions.map(pp => pp.id === p.id ? { ...pp, fontSize: ns, yPt: pp.yPt } : pp);
                                            setPositions(updated);
                                            autoSave(updated);
                                          }} style={{ width: 36, height: 26, padding: 0, border: "none", fontSize: 13, fontWeight: 700, textAlign: "center", background: "white", outline: "none" }} />
                                          <button onClick={() => { const updated = positions.map(pp => { if (pp.id !== p.id) return pp; const ns = pp.fontSize + 1; return { ...pp, fontSize: ns, yPt: pp.yPt }; }); setPositions(updated); autoSave(updated); }}
                                            style={{ width: 26, height: 26, fontSize: 14, fontWeight: 700, cursor: "pointer", background: "#F8FAFC", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid #E2E8F0" }}>+</button>
                                        </div>
                                        <button onClick={() => removePosition(p.id)} style={{ marginLeft: "auto", fontSize: 11, color: "#DC2626", cursor: "pointer", fontWeight: 700 }}>✕</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* 요금제 항목 */}
                        <div style={{ borderTop: "2px solid #E8ECF1", paddingTop: 10 }}>
                          <h3 onClick={() => toggleSection("plan")} style={{ fontSize: 12, fontWeight: 800, marginBottom: collapsed.plan ? 10 : 6, color: "#059669", cursor: "pointer", userSelect: "none" }}>{collapsed.plan ? "▶" : "▼"} 요금제 항목</h3>
                          <div style={{ display: collapsed.plan ? "none" : "flex", flexDirection: "column", gap: 3 }}>
                            {planFields.map(f => {
                              const placedList = positions.filter(p => p.key === f.key);
                              const placedCount = placedList.length;
                              const isP = placingField === f.key;
                              return (
                                <div key={f.key}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", borderRadius: 6, background: isP ? "#FEF2F2" : placedCount > 0 ? "#ECFDF5" : "#F8FAFC", border: isP ? "2px solid #DC2626" : placedCount > 0 ? "1px solid #A7F3D0" : "1px solid #E8ECF1" }}>
                                    <button onClick={() => { setPlacingField(isP ? null : f.key); if (!isP) toast(`"${f.label}" 선택`, "info"); }}
                                      style={{ flex: 1, textAlign: "left", fontSize: 11, fontWeight: 600, color: isP ? "#DC2626" : placedCount > 0 ? "#059669" : "var(--text-1)", cursor: "pointer" }}>
                                      {isP ? "🎯" : placedCount > 0 ? "✓" : "○"} {f.label}
                                      {placedCount > 1 && <span style={{ marginLeft: 4, fontSize: 10, color: "var(--text-3)" }}>×{placedCount}</span>}
                                    </button>
                                  </div>
                                  {placedCount > 0 && (
                                    <div style={{ marginLeft: 8, marginTop: 3, marginBottom: 3, display: "flex", flexDirection: "column", gap: 3 }}>
                                      {placedList.map(p => (
                                        <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px", fontSize: 11, background: "#F0FDF4", borderRadius: 6, border: "1px solid #BBF7D0" }}>
                                          <span style={{ color: "var(--text-3)", fontWeight: 600 }}>p{p.page}</span>
                                        <div style={{ display: "flex", alignItems: "center", gap: 0, border: "1px solid #D1D5DB", borderRadius: 6, overflow: "hidden", background: "white" }}>
                                          <button onClick={() => { const updated = positions.map(pp => { if (pp.id !== p.id) return pp; const ns = Math.max(1, pp.fontSize - 1); return { ...pp, fontSize: ns, yPt: pp.yPt }; }); setPositions(updated); autoSave(updated); }}
                                            style={{ width: 26, height: 26, fontSize: 14, fontWeight: 700, cursor: "pointer", background: "#F0FDF4", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #E2E8F0" }}>−</button>
                                          <input type="number" value={p.fontSize} onChange={e => {
                                            const ns = Number(e.target.value) || 1;
                                            const updated = positions.map(pp => pp.id === p.id ? { ...pp, fontSize: ns, yPt: pp.yPt } : pp);
                                            setPositions(updated);
                                            autoSave(updated);
                                          }} style={{ width: 36, height: 26, padding: 0, border: "none", fontSize: 13, fontWeight: 700, textAlign: "center", background: "white", outline: "none" }} />
                                          <button onClick={() => { const updated = positions.map(pp => { if (pp.id !== p.id) return pp; const ns = pp.fontSize + 1; return { ...pp, fontSize: ns, yPt: pp.yPt }; }); setPositions(updated); autoSave(updated); }}
                                            style={{ width: 26, height: 26, fontSize: 14, fontWeight: 700, cursor: "pointer", background: "#F0FDF4", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid #E2E8F0" }}>+</button>
                                        </div>
                                          <button onClick={() => removePosition(p.id)} style={{ fontSize: 11, color: "#DC2626", cursor: "pointer", fontWeight: 700 }}>✕</button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 합성 필드 */}
                        <div style={{ borderTop: "2px solid #E8ECF1", paddingTop: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: collapsed.composite ? 10 : 6 }}>
                            <h3 onClick={() => toggleSection("composite")} style={{ fontSize: 12, fontWeight: 800, color: "#9333EA", cursor: "pointer", userSelect: "none" }}>{collapsed.composite ? "▶" : "▼"} 합성 필드</h3>
                            {!collapsed.composite && <button onClick={() => { setCompositeMode(!compositeMode); setCompositeSelected([]); setCompositeSep("/"); }}
                              style={{ padding: "4px 10px", background: compositeMode ? "#DC2626" : "#F3E8FF", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", color: compositeMode ? "white" : "#9333EA" }}>
                              {compositeMode ? "취소" : "+ 만들기"}
                            </button>}
                          </div>

                          {!collapsed.composite && compositeMode && (
                            <div style={{ padding: 10, background: "#FAF5FF", borderRadius: 8, border: "1px solid #E9D5FF", marginBottom: 8 }}>
                              <p style={{ fontSize: 11, color: "#7C3AED", fontWeight: 600, marginBottom: 8 }}>합칠 항목을 순서대로 선택하세요</p>
                              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
                                {[...fields, ...planFields].filter(f => !["todayYear","todayMonth","todayDay","separator"].includes(f.key)).map(f => (
                                  <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer", padding: "3px 6px", borderRadius: 4, background: compositeSelected.includes(f.key) ? "#E9D5FF" : "white" }}>
                                    <input type="checkbox" checked={compositeSelected.includes(f.key)}
                                      onChange={() => setCompositeSelected(prev => prev.includes(f.key) ? prev.filter(k => k !== f.key) : [...prev, f.key])} />
                                    {f.label}
                                    {compositeSelected.includes(f.key) && <span style={{ marginLeft: "auto", fontSize: 10, color: "#9333EA", fontWeight: 800 }}>{compositeSelected.indexOf(f.key) + 1}</span>}
                                  </label>
                                ))}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: "#7C3AED" }}>구분자:</span>
                                {["/", " / ", "-", " - ", " "].map(s => (
                                  <button key={s} onClick={() => setCompositeSep(s)}
                                    style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", background: compositeSep === s ? "#9333EA" : "white", color: compositeSep === s ? "white" : "#666", border: "1px solid #D1D5DB" }}>
                                    {s.trim() || "공백"}
                                  </button>
                                ))}
                              </div>
                              {compositeSelected.length >= 2 && (
                                <div style={{ fontSize: 11, color: "#7C3AED", marginBottom: 8 }}>
                                  미리보기: <strong>{compositeSelected.map(k => [...fields, ...planFields].find(f => f.key === k)?.label || k).join(compositeSep)}</strong>
                                </div>
                              )}
                              <button onClick={confirmComposite} disabled={compositeSelected.length < 2}
                                style={{ width: "100%", padding: "8px", background: compositeSelected.length >= 2 ? "#9333EA" : "#E2E8F0", color: "white", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: compositeSelected.length >= 2 ? "pointer" : "default" }}>
                                합성 필드 배치하기
                              </button>
                            </div>
                          )}

                          {/* 배치된 합성 필드 목록 */}
                          {!collapsed.composite && positions.filter(p => p.compositeKeys).map(p => (
                            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", fontSize: 11, background: "#FAF5FF", borderRadius: 6, border: "1px solid #E9D5FF", marginBottom: 3 }}>
                              <span style={{ color: "#9333EA", fontWeight: 600, flex: 1 }}>{p.label}</span>
                              <span style={{ color: "var(--text-3)", fontWeight: 600 }}>p{p.page}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 0, border: "1px solid #D1D5DB", borderRadius: 6, overflow: "hidden", background: "white" }}>
                                <button onClick={() => { const updated = positions.map(pp => pp.id === p.id ? { ...pp, fontSize: Math.max(1, pp.fontSize - 1) } : pp); setPositions(updated); autoSave(updated); }}
                                  style={{ width: 22, height: 22, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "#FAF5FF", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #E2E8F0" }}>−</button>
                                <span style={{ width: 24, textAlign: "center", fontSize: 11, fontWeight: 700 }}>{p.fontSize}</span>
                                <button onClick={() => { const updated = positions.map(pp => pp.id === p.id ? { ...pp, fontSize: pp.fontSize + 1 } : pp); setPositions(updated); autoSave(updated); }}
                                  style={{ width: 22, height: 22, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "#FAF5FF", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid #E2E8F0" }}>+</button>
                              </div>
                              <button onClick={() => removePosition(p.id)} style={{ fontSize: 11, color: "#DC2626", cursor: "pointer", fontWeight: 700 }}>✕</button>
                            </div>
                          ))}
                        </div>

                        {/* 공통 항목 (날짜, 구분값) */}
                        <div style={{ borderTop: "2px solid #E8ECF1", paddingTop: 10 }}>
                          <h3 onClick={() => toggleSection("common")} style={{ fontSize: 12, fontWeight: 800, marginBottom: collapsed.common ? 0 : 6, color: "#D97706", cursor: "pointer", userSelect: "none" }}>{collapsed.common ? "▶" : "▼"} 공통 항목</h3>
                          {!collapsed.common && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              {COMMON_FIELDS.map(cf => {
                                const placed = positions.filter(p => p.key === cf.key);
                                const isP = placingField === cf.key;
                                return (
                                  <div key={cf.key}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", borderRadius: 6, background: isP ? "#FEF2F2" : placed.length > 0 ? "#FFFBEB" : "#F8FAFC", border: isP ? "2px solid #DC2626" : placed.length > 0 ? "1px solid #FDE68A" : "1px solid #E8ECF1" }}>
                                      <button onClick={() => setPlacingField(isP ? null : cf.key)}
                                        style={{ flex: 1, textAlign: "left", fontSize: 11, fontWeight: 600, color: isP ? "#DC2626" : placed.length > 0 ? "#D97706" : "var(--text-1)", cursor: "pointer" }}>
                                        {isP ? "🎯" : placed.length > 0 ? "✓" : "○"} {cf.label}
                                      </button>
                                    </div>
                                    {placed.length > 0 && (
                                      <div style={{ marginLeft: 8, marginTop: 3, marginBottom: 3, display: "flex", flexDirection: "column", gap: 3 }}>
                                        {placed.map(p => (
                                          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", fontSize: 11, background: "#FFFBEB", borderRadius: 6, border: "1px solid #FDE68A" }}>
                                            <span style={{ color: "var(--text-3)", fontWeight: 600 }}>p{p.page}</span>
                                            <div style={{ display: "flex", alignItems: "center", gap: 0, marginLeft: "auto", border: "1px solid #D1D5DB", borderRadius: 6, overflow: "hidden", background: "white" }}>
                                              <button onClick={() => { const updated = positions.map(pp => pp.id === p.id ? { ...pp, fontSize: Math.max(1, pp.fontSize - 1) } : pp); setPositions(updated); autoSave(updated); }}
                                                style={{ width: 22, height: 22, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "#FFFBEB", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #E2E8F0" }}>−</button>
                                              <span style={{ width: 24, textAlign: "center", fontSize: 11, fontWeight: 700 }}>{p.fontSize}</span>
                                              <button onClick={() => { const updated = positions.map(pp => pp.id === p.id ? { ...pp, fontSize: pp.fontSize + 1 } : pp); setPositions(updated); autoSave(updated); }}
                                                style={{ width: 22, height: 22, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "#FFFBEB", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid #E2E8F0" }}>+</button>
                                            </div>
                                            <button onClick={() => removePosition(p.id)} style={{ fontSize: 11, color: "#DC2626", cursor: "pointer", fontWeight: 700 }}>✕</button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* 업그레이드 모달 */}
        {upgradeModal && (
          <div className={styles.overlay} onClick={() => setUpgradeModal(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}><h2 className={styles.modalTitle}>양식 버전 업그레이드</h2><button className={styles.modalClose} onClick={() => setUpgradeModal(false)}>✕</button></div>
              <div className={styles.formGroup}><label className={styles.formLabel}>버전 메모</label><input className={styles.formInput} value={upgradeLabel} onChange={e => setUpgradeLabel(e.target.value)} placeholder="예: 26년 4월 양식" /></div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>양식 파일</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <label style={{ padding: "12px 20px", background: "#FEF3C7", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#92400E", border: "2px solid #FDE68A" }}>PDF<input type="file" accept=".pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); }} /></label>
                  <label style={{ padding: "12px 20px", background: "#F8FAFC", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "var(--text-1)", border: "2px solid #E8ECF1" }}>이미지<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); }} /></label>
                </div>
              </div>
              {upgradePages.length > 0 && <div style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>업로드 완료</div>}
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setUpgradeModal(false)}>취소</button>
                <button className={styles.saveBtn} onClick={handleCreateVersion} disabled={upgradePages.length === 0 || saving}>{saving ? "생성 중..." : `v${(versions[0]?.version || 0) + 1} 생성`}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
