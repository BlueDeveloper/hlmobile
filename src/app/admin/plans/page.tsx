"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchCarrierTree, fetchPlans, createPlan, updatePlan, deletePlan, updateCarrier } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { formatPrice, parseJsonSafe } from "@/lib/utils";
import { DEFAULT_PLAN_FIELDS, DEFAULT_PLAN_KEYS } from "@/lib/constants";
import type { Carrier, Plan } from "@/types";
import styles from "../page.module.css";

interface PlanField { key: string; label: string }

function PlansContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const carrierId = searchParams.get("carrier") || "";
  const router = useRouter();

  const [tree, setTree] = useState<Carrier[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedCarrier, setSelectedCarrier] = useState(carrierId);
  const [filterType, setFilterType] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState({
    name: "", monthly: 0, base_fee: 0, discount: 0,
    voice: "", sms: "", data: "", qos: "-",
    type: "" as string, sort_order: 0,
  });
  const [extraForm, setExtraForm] = useState<Record<string, string>>({});
  const [fieldModal, setFieldModal] = useState(false);
  const [editingFields, setEditingFields] = useState<PlanField[]>([]);
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkRows, setBulkRows] = useState<Array<{ name: string; monthly: number; base_fee: number; discount: number; type: string; voice: string; sms: string; data: string; qos: string }>>([]);
  const [bulkImporting, setBulkImporting] = useState(false);

  // 선택된 통신사의 커스텀 요금제 필드
  const [customPlanFields, setCustomPlanFields] = useState<PlanField[]>([]);

  const allMvnos = useMemo(() => tree.flatMap(m => m.children || []), [tree]);

  const loadCarriers = useCallback(async (skipCache = false) => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) { router.push("/admin"); return; }
    const data = await fetchCarrierTree(false, skipCache);
    setTree(data);
    setSelectedCarrier((prev) => {
      if (prev) return prev;
      if (data.length > 0 && data[0].children && data[0].children.length > 0) return data[0].children[0].id;
      return "";
    });
  }, [router]);

  const loadPlans = useCallback(async () => {
    if (!selectedCarrier) return;
    setLoading(true);
    const data = await fetchPlans(selectedCarrier, undefined, false);
    setPlans(data);
    setLoading(false);
  }, [selectedCarrier]);

  useEffect(() => { loadCarriers(); }, [loadCarriers]);
  useEffect(() => { loadPlans(); }, [loadPlans]);

  // 통신사 변경 시 커스텀 필드 로드
  useEffect(() => {
    if (!selectedCarrier || tree.length === 0) return;
    const mvno = allMvnos.find(c => c.id === selectedCarrier);
    if (!mvno?.form_config) { setCustomPlanFields([]); return; }
    try {
      const parsed = JSON.parse(mvno.form_config);
      if (Array.isArray(parsed)) {
        setCustomPlanFields([]);
      } else if (parsed.planFields) {
        setCustomPlanFields(parsed.planFields.filter((f: PlanField) => !DEFAULT_PLAN_KEYS.has(f.key)));
      } else {
        setCustomPlanFields([]);
      }
    } catch { setCustomPlanFields([]); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCarrier, tree]);

  const carrierName = allMvnos.find((c) => c.id === selectedCarrier)?.title || selectedCarrier;

  const filteredPlans = plans.filter((p) => {
    if (filterType && p.type !== filterType) return false;
    if (filterSearch && !p.name.toLowerCase().includes(filterSearch.toLowerCase())) return false;
    return true;
  });

  const openCreate = () => {
    setForm({ name: "", monthly: 0, base_fee: 0, discount: 0, voice: "", sms: "", data: "", qos: "-", type: "", sort_order: plans.length + 1 });
    setExtraForm({});
    setEditing(null);
    setModal("create");
  };

  const openEdit = (p: Plan) => {
    setForm({ name: p.name, monthly: p.monthly, base_fee: p.base_fee, discount: p.discount, voice: p.voice, sms: p.sms, data: p.data, qos: p.qos, type: p.type, sort_order: p.sort_order });
    try { setExtraForm(p.extra_fields ? JSON.parse(p.extra_fields) : {}); } catch { setExtraForm({}); }
    setEditing(p);
    setModal("edit");
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast("요금제명을 입력해주세요.", "error"); return; }
    if (!form.monthly) { toast("월납부금액을 입력해주세요.", "error"); return; }
    if (!form.type) { toast("유형을 선택해주세요.", "error"); return; }
    if (!form.voice.trim()) { toast("음성을 입력해주세요.", "error"); return; }
    if (!form.sms.trim()) { toast("문자를 입력해주세요.", "error"); return; }
    if (!form.data.trim()) { toast("데이터를 입력해주세요.", "error"); return; }

    const hasExtra = Object.keys(extraForm).length > 0 && Object.values(extraForm).some(v => v.trim());
    const payload = {
      name: form.name,
      monthly: form.monthly,
      baseFee: form.base_fee,
      discount: form.discount,
      voice: form.voice,
      sms: form.sms,
      data: form.data,
      qos: form.qos,
      sortOrder: form.sort_order,
      extraFields: hasExtra ? extraForm : undefined,
    };

    if (modal === "create") {
      const res = await createPlan({ carrierId: selectedCarrier, ...payload, type: form.type as "postpaid" | "prepaid" } as Parameters<typeof createPlan>[0]);
      if (!res.ok) { toast(res.error || "오류가 발생했습니다.", "error"); return; }
    } else if (modal === "edit" && editing) {
      await updatePlan(editing.id, { ...payload, type: form.type as "postpaid" | "prepaid" } as Parameters<typeof updatePlan>[1]);
    }
    setModal(null);
    loadPlans();
  };

  const parseCsv = (text: string) => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim());
    const headerMap: Record<string, string> = {
      "요금제명": "name", "월납부금액": "monthly", "기본료": "base_fee",
      "프로모션할인": "discount", "할인": "discount", "유형": "type",
      "음성": "voice", "문자": "sms", "데이터": "data", "QOS": "qos", "qos": "qos",
    };
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const values = line.split(",").map(v => v.trim());
      const row: { name: string; monthly: number; base_fee: number; discount: number; type: string; voice: string; sms: string; data: string; qos: string } =
        { name: "", monthly: 0, base_fee: 0, discount: 0, type: "postpaid", voice: "", sms: "", data: "", qos: "-" };
      headers.forEach((h, i) => {
        const key = headerMap[h];
        if (!key) return;
        const val = (values[i] || "").replace(/[^0-9a-zA-Z가-힣.\-]/g, "");
        if (key === "monthly" || key === "base_fee" || key === "discount") {
          (row as Record<string, unknown>)[key] = Number(val) || 0;
        } else if (key === "type") {
          (row as Record<string, unknown>)[key] = val === "선불" ? "prepaid" : "postpaid";
        } else {
          (row as Record<string, unknown>)[key] = values[i]?.trim() || "";
        }
      });
      if (!row.base_fee) row.base_fee = row.monthly;
      return row;
    });
  };

  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buffer = ev.target?.result as ArrayBuffer;
      const utf8 = new TextDecoder("utf-8").decode(buffer);
      const KOREAN_HEADERS = ["요금제명", "월납부금액", "기본료", "프로모션할인", "유형", "음성"];
      const isValidUtf8 = KOREAN_HEADERS.some(h => utf8.includes(h));
      let text = utf8;
      if (!isValidUtf8) {
        try { text = new TextDecoder("euc-kr").decode(buffer); } catch { text = utf8; }
      }
      const rows = parseCsv(text);
      setBulkRows(rows);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBulkImport = async () => {
    if (bulkRows.length === 0 || !selectedCarrier) return;
    setBulkImporting(true);
    let ok = 0; let fail = 0;
    for (const row of bulkRows) {
      if (!row.name) { fail++; continue; }
      const res = await createPlan({
        carrierId: selectedCarrier, name: row.name, monthly: row.monthly,
        baseFee: row.base_fee, discount: row.discount, type: row.type as "postpaid" | "prepaid",
        voice: row.voice, sms: row.sms, data: row.data, qos: row.qos,
        sortOrder: plans.length + ok + 1,
      } as Parameters<typeof createPlan>[0]);
      res.ok ? ok++ : fail++;
    }
    setBulkImporting(false);
    setBulkModal(false);
    setBulkRows([]);
    toast(`${ok}건 추가 완료${fail > 0 ? ` (${fail}건 실패)` : ""}`, ok > 0 ? "success" : "error");
    loadPlans();
  };

  const downloadCsvTemplate = () => {
    const header = "요금제명,월납부금액,기본료,프로모션할인,유형,음성,문자,데이터,QOS";
    const example = "5G다이렉트59,55000,55000,16500,후불,무제한,무제한,110GB,최대 1Gbps";
    const blob = new Blob([`${header}\n${example}`], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "요금제_일괄추가_양식.csv"; a.click();
  };

  const handleBulkDelete = async () => {
    if (checkedIds.size === 0) { toast("삭제할 요금제를 선택해주세요.", "error"); return; }
    if (!confirm(`${checkedIds.size}건의 요금제를 삭제합니다.`)) return;
    setLoading(true);
    let fail = 0;
    for (const id of checkedIds) {
      try { await deletePlan(id); } catch { fail++; }
    }
    setCheckedIds(new Set());
    if (fail > 0) toast(`${fail}건 삭제 실패`, "error");
    loadPlans();
  };

  const toggleCheck = (id: number) => {
    setCheckedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleCheckAll = () => {
    checkedIds.size === filteredPlans.length ? setCheckedIds(new Set()) : setCheckedIds(new Set(filteredPlans.map(p => p.id)));
  };

  const openFieldModal = () => {
    setEditingFields([...DEFAULT_PLAN_FIELDS, ...customPlanFields]);
    setFieldModal(true);
  };

  const handleSaveFields = async () => {
    const mvno = allMvnos.find(c => c.id === selectedCarrier);
    let existingConfig: Record<string, unknown> = {};
    if (mvno?.form_config) {
      try {
        const parsed = JSON.parse(mvno.form_config);
        existingConfig = Array.isArray(parsed) ? { fields: parsed } : parsed;
      } catch {}
    }
    await updateCarrier(selectedCarrier, { form_config: JSON.stringify({ ...existingConfig, planFields: editingFields }) } as unknown as Partial<Carrier>);
    setCustomPlanFields(editingFields.filter(f => !DEFAULT_PLAN_KEYS.has(f.key)));
    setFieldModal(false);
    toast("항목 저장 완료", "success");
    loadCarriers(true);
  };

  const handleLogout = () => { sessionStorage.removeItem("admin_token"); router.push("/admin"); };
  const parsedExtras = useMemo(() => {
    const map = new Map<number, Record<string, string>>();
    for (const p of plans) {
      map.set(p.id, parseJsonSafe<Record<string, string>>(p.extra_fields, {}));
    }
    return map;
  }, [plans]);

  const getExtra = (p: Plan, key: string): string => parsedExtras.get(p.id)?.[key] || "";

  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <a href="/" className={styles.sidebarLogo} style={{textDecoration:"none",color:"inherit"}}><span className={styles.sidebarLogoIcon}>H</span>관리자</a>
        <nav className={styles.sidebarNav}>
          <Link href="/admin/dashboard" className={styles.sidebarLink}>📊 대시보드</Link>
          <Link href="/admin/carriers" className={styles.sidebarLink}>📱 통신사</Link>
          <span className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`}>💰 요금제</span>
          <Link href="/admin/applications" className={styles.sidebarLink}>📋 신청서</Link>
          <Link href="/admin/form-settings" className={styles.sidebarLink}>📝 신청서설정</Link>
          <Link href="/admin/notices" className={styles.sidebarLink}>📢 공지사항</Link>
          <Link href="/admin/resources" className={styles.sidebarLink}>📁 자료실</Link>
          <Link href="/admin/inquiries" className={styles.sidebarLink}>💬 문의</Link>
          <Link href="/admin/site-settings" className={styles.sidebarLink}>⚙️ 사이트설정</Link>
        </nav>
        <div className={styles.sidebarLogout}><button className={styles.logoutBtn} onClick={handleLogout}>로그아웃</button></div>
      </aside>

      <nav className={styles.bottomTab}>
        <Link href="/admin/dashboard" className={styles.tabLink}><span className={styles.tabIcon}>📊</span><span className={styles.tabLabel}>대시보드</span></Link>
        <Link href="/admin/carriers" className={styles.tabLink}><span className={styles.tabIcon}>📱</span><span className={styles.tabLabel}>통신사</span></Link>
        <Link href="/admin/plans" className={`${styles.tabLink} ${styles.tabLinkActive}`}><span className={styles.tabIcon}>💰</span><span className={styles.tabLabel}>요금제</span></Link>
        <Link href="/admin/applications" className={styles.tabLink}><span className={styles.tabIcon}>📋</span><span className={styles.tabLabel}>신청서</span></Link>
        <Link href="/admin/form-settings" className={styles.tabLink}><span className={styles.tabIcon}>📝</span><span className={styles.tabLabel}>설정</span></Link>
        <Link href="/admin/notices" className={styles.tabLink}><span className={styles.tabIcon}>📢</span><span className={styles.tabLabel}>공지</span></Link>
        <Link href="/admin/inquiries" className={styles.tabLink}><span className={styles.tabIcon}>💬</span><span className={styles.tabLabel}>문의</span></Link>
      </nav>

      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>요금제 관리</h1>
          <div style={{ display: "flex", gap: 8 }}>
            {selectedCarrier && <button onClick={openFieldModal} style={{ padding: "8px 16px", background: "#F0FDF4", color: "#059669", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "1px solid #BBF7D0" }}>항목 관리</button>}
            <button onClick={() => { setBulkRows([]); setBulkModal(true); }} style={{ padding: "8px 16px", background: "#FEF3C7", color: "#92400E", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "1px solid #FDE68A" }}>일괄 추가</button>
            <button className={styles.addBtn} onClick={openCreate}>+ 추가</button>
          </div>
        </div>

        {/* 필터 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>통신사</label>
            <select style={{ width: "100%", padding: "10px 14px", border: "2px solid #E8ECF1", borderRadius: 12, fontSize: 14, fontFamily: "inherit", background: "white" }}
              value={selectedCarrier} onChange={(e) => setSelectedCarrier(e.target.value)}>
              <option value="" disabled>선택하세요</option>
              {allMvnos.map((mvno) => <option key={mvno.id} value={mvno.id}>{mvno.title}</option>)}
            </select>
          </div>
          <div style={{ flex: "0 0 140px" }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>유형</label>
            <select style={{ width: "100%", padding: "10px 14px", border: "2px solid #E8ECF1", borderRadius: 12, fontSize: 14, fontFamily: "inherit", background: "white" }}
              value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">전체</option>
              <option value="postpaid">후불</option>
              <option value="prepaid">선불</option>
            </select>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>검색</label>
            <input type="text" placeholder="요금제명 검색" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", border: "2px solid #E8ECF1", borderRadius: 12, fontSize: 14, fontFamily: "inherit", outline: "none" }} />
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)", padding: "10px 0" }}>{filteredPlans.length}건</div>
        </div>

        {loading ? (
          <div className={styles.empty}>불러오는 중...</div>
        ) : filteredPlans.length === 0 ? (
          <div className={styles.empty}>{filterSearch || filterType ? "검색 결과가 없습니다." : `${carrierName}에 등록된 요금제가 없습니다.`}</div>
        ) : (
          <>
            {checkedIds.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", marginBottom: 12, background: "#FEF2F2", borderRadius: 12, border: "1px solid #FECACA" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#DC2626" }}>{checkedIds.size}건 선택됨</span>
                <button onClick={handleBulkDelete} style={{ padding: "8px 16px", background: "#DC2626", color: "white", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>선택 삭제</button>
              </div>
            )}

            {/* Desktop Table */}
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}><input type="checkbox" checked={checkedIds.size === filteredPlans.length && filteredPlans.length > 0} onChange={toggleCheckAll} /></th>
                  <th>요금제명</th><th>월납부금액</th><th>기본료</th><th>할인</th><th>유형</th><th>데이터</th><th>음성</th>
                  {customPlanFields.map(f => <th key={f.key}>{f.label}</th>)}
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((p) => (
                  <tr key={p.id} onClick={() => openEdit(p)} style={{ cursor: "pointer" }}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checkedIds.has(p.id)} onChange={() => toggleCheck(p.id)} /></td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{formatPrice(p.monthly)}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{formatPrice(p.base_fee)}</td>
                    <td style={{ fontFamily: "var(--font-mono)", color: "var(--danger)" }}>{formatPrice(p.discount)}</td>
                    <td>{p.type === "postpaid" ? "후불" : "선불"}</td>
                    <td>{p.data}</td>
                    <td>{p.voice}</td>
                    {customPlanFields.map(f => <td key={f.key}>{getExtra(p, f.key)}</td>)}
                    <td>{p.is_active ? "✅" : "❌"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Cards */}
            <div className={styles.cardList}>
              {filteredPlans.map((p) => (
                <div key={p.id} className={styles.card} onClick={() => openEdit(p)} style={{ cursor: "pointer" }}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardTitle} style={{ gap: 8 }}>
                      <input type="checkbox" checked={checkedIds.has(p.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCheck(p.id)} />
                      {p.name}
                    </div>
                    <span className={`${styles.cardBadge} ${p.is_active ? styles.cardBadgeActive : styles.cardBadgeInactive}`}>
                      {p.type === "postpaid" ? "후불" : "선불"}
                    </span>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardField}><span className={styles.cardFieldLabel}>월 요금</span><span className={styles.cardFieldValue} style={{ color: "var(--brand)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{formatPrice(p.monthly)}</span></div>
                    <div className={styles.cardField}><span className={styles.cardFieldLabel}>할인</span><span className={styles.cardFieldValue} style={{ color: "var(--danger)", fontFamily: "var(--font-mono)" }}>{formatPrice(p.discount)}</span></div>
                    <div className={styles.cardField}><span className={styles.cardFieldLabel}>데이터</span><span className={styles.cardFieldValue}>{p.data}</span></div>
                    <div className={styles.cardField}><span className={styles.cardFieldLabel}>음성</span><span className={styles.cardFieldValue}>{p.voice}</span></div>
                    {customPlanFields.map(f => {
                      const v = getExtra(p, f.key);
                      return v ? <div key={f.key} className={styles.cardField}><span className={styles.cardFieldLabel}>{f.label}</span><span className={styles.cardFieldValue}>{v}</span></div> : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Modal */}
        {modal && (
          <div className={styles.overlay}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); } }}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>{modal === "create" ? "요금제 추가" : "요금제 수정"}</h2>
                <button className={styles.modalClose} onClick={() => setModal(null)}>✕</button>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>요금제명</label>
                <input className={styles.formInput} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 5G 다이렉트 59" />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>월납부금액</label>
                  <input className={styles.formInput} type="number" value={form.monthly} onChange={(e) => setForm({ ...form, monthly: Number(e.target.value) })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>기본료</label>
                  <input className={styles.formInput} type="number" value={form.base_fee} onChange={(e) => setForm({ ...form, base_fee: Number(e.target.value) })} />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>프로모션 할인</label>
                  <input className={styles.formInput} type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>유형</label>
                  <select className={styles.formSelect} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="" disabled>선택하세요</option>
                    <option value="postpaid">후불</option>
                    <option value="prepaid">선불</option>
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>음성</label>
                  <input className={styles.formInput} value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })} placeholder="예: 무제한" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>문자</label>
                  <input className={styles.formInput} value={form.sms} onChange={(e) => setForm({ ...form, sms: e.target.value })} placeholder="예: 무제한" />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>데이터</label>
                  <input className={styles.formInput} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} placeholder="예: 12GB" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>QOS</label>
                  <input className={styles.formInput} value={form.qos} onChange={(e) => setForm({ ...form, qos: e.target.value })} placeholder="예: 최대 150Mbps" />
                </div>
              </div>

              {/* 커스텀 요금제 필드 */}
              {customPlanFields.length > 0 && (
                <>
                  <div style={{ borderTop: "2px solid #D1FAE5", marginTop: 12, paddingTop: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#059669" }}>추가 항목</span>
                  </div>
                  {customPlanFields.map((f, i) => (
                    i % 2 === 0 ? (
                      <div className={styles.formRow} key={f.key}>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>{f.label}</label>
                          <input className={styles.formInput} value={extraForm[f.key] || ""} onChange={(e) => setExtraForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                        </div>
                        {customPlanFields[i + 1] && (
                          <div className={styles.formGroup}>
                            <label className={styles.formLabel}>{customPlanFields[i + 1].label}</label>
                            <input className={styles.formInput} value={extraForm[customPlanFields[i + 1].key] || ""} onChange={(e) => setExtraForm(prev => ({ ...prev, [customPlanFields[i + 1].key]: e.target.value }))} />
                          </div>
                        )}
                      </div>
                    ) : null
                  ))}
                </>
              )}

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>정렬 순서</label>
                <input className={styles.formInput} type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>

              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setModal(null)}>취소</button>
                <button className={styles.saveBtn} onClick={handleSave}>저장</button>
              </div>
            </div>
          </div>
        )}

        {/* 항목 관리 모달 */}
        {fieldModal && (
          <div className={styles.overlay} onClick={() => setFieldModal(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>요금제 항목 관리</h2>
                <button className={styles.modalClose} onClick={() => setFieldModal(false)}>✕</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {editingFields.map((f, i) => {
                  const isDefault = DEFAULT_PLAN_KEYS.has(f.key);
                  return (
                    <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: isDefault ? "#F8FAFC" : "#F0FDF4", borderRadius: 8, border: isDefault ? "1px solid #E8ECF1" : "1px solid #BBF7D0" }}>
                      <input value={f.label} onChange={e => setEditingFields(prev => prev.map((pf, idx) => idx === i ? { ...pf, label: e.target.value } : pf))}
                        placeholder="항목명" style={{ flex: 1, padding: "6px 10px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13, outline: "none", background: "white" }} />
                      {isDefault
                        ? <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, whiteSpace: "nowrap" }}>기본</span>
                        : <button onClick={() => setEditingFields(prev => prev.filter((_, idx) => idx !== i))} style={{ fontSize: 14, color: "#DC2626", cursor: "pointer", fontWeight: 700 }}>✕</button>
                      }
                    </div>
                  );
                })}
              </div>

              <button onClick={() => setEditingFields(prev => [...prev, { key: `plan_custom_${Date.now()}`, label: "" }])}
                style={{ width: "100%", padding: "10px", background: "#F0FDF4", color: "#059669", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "1px dashed #BBF7D0", marginBottom: 16 }}>
                + 항목 추가
              </button>

              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setFieldModal(false)}>취소</button>
                <button className={styles.saveBtn} onClick={handleSaveFields}>저장</button>
              </div>
            </div>
          </div>
        )}

        {/* 일괄 추가 모달 */}
        {bulkModal && (
          <div className={styles.overlay} onClick={() => setBulkModal(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>요금제 일괄 추가 (CSV)</h2>
                <button className={styles.modalClose} onClick={() => setBulkModal(false)}>✕</button>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
                <label style={{ padding: "10px 18px", background: "var(--brand)", color: "white", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  CSV 파일 선택
                  <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleBulkFileChange} />
                </label>
                <button onClick={downloadCsvTemplate} style={{ padding: "10px 14px", background: "#F1F5F9", color: "var(--text-2)", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid #E8ECF1" }}>
                  양식 다운로드
                </button>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>열 순서: 요금제명, 월납부금액, 기본료, 프로모션할인, 유형(후불/선불), 음성, 문자, 데이터, QOS</span>
              </div>

              {bulkRows.length > 0 && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#059669", marginBottom: 8 }}>{bulkRows.length}건 미리보기</div>
                  <div style={{ overflowX: "auto", marginBottom: 16, border: "1px solid #E8ECF1", borderRadius: 10 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#F8FAFC" }}>
                          {["요금제명","월납부금액","기본료","할인","유형","음성","문자","데이터","QOS"].map(h => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, color: "var(--text-2)", borderBottom: "1px solid #E8ECF1", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.map((r, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                            <td style={{ padding: "7px 10px", fontWeight: 600 }}>{r.name || <span style={{ color: "#DC2626" }}>비어있음</span>}</td>
                            <td style={{ padding: "7px 10px" }}>{r.monthly.toLocaleString()}</td>
                            <td style={{ padding: "7px 10px" }}>{r.base_fee.toLocaleString()}</td>
                            <td style={{ padding: "7px 10px", color: "var(--danger)" }}>{r.discount.toLocaleString()}</td>
                            <td style={{ padding: "7px 10px" }}>{r.type === "postpaid" ? "후불" : "선불"}</td>
                            <td style={{ padding: "7px 10px" }}>{r.voice}</td>
                            <td style={{ padding: "7px 10px" }}>{r.sms}</td>
                            <td style={{ padding: "7px 10px" }}>{r.data}</td>
                            <td style={{ padding: "7px 10px" }}>{r.qos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setBulkModal(false)}>취소</button>
                <button className={styles.saveBtn} onClick={handleBulkImport} disabled={bulkRows.length === 0 || bulkImporting}>
                  {bulkImporting ? "추가 중..." : `${bulkRows.length}건 추가`}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>불러오는 중...</div>}>
      <PlansContent />
    </Suspense>
  );
}
