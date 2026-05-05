"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { useToast } from "@/components/Toast";
import { fetchCarrierTree, fetchPlans, createApplication } from "@/lib/api";
import { formatPhone, formatBirth, isValidBirth, formatPrice, parseJsonSafe } from "@/lib/utils";
import { fillAndOpenPdf } from "@/lib/pdfClient";
import type { Carrier, Plan, FormFieldConfig } from "@/types";
import styles from "./page.module.css";

const TOTAL_STEPS = 5; // 대분류 → 알뜰폰 → 요금제 → 정보 → 확인

// 필드 key별 테스트 기본값
const DEFAULT_VALUES: Record<string, string> = {
  usimSerial: "8982001234567890",
  customerType: "개인",
  subscriberName: "홍길동",
  contactNumber: "010-1234-5678",
  birthDate: "1990-01-15",
  idNumber: "900115-1234567",
  nationality: "대한민국",
  address: "(06236) 서울특별시 강남구 테헤란로 123",
  addressDetail: "456호",
  activationType: "번호이동",
  desiredNumber: "010-9876-5432",
  storeName: "HL모바일 강남점",
};

function buildDefaultData(fields: FormFieldConfig[]): Record<string, string> {
  const data: Record<string, string> = {};
  for (const f of fields) {
    if (DEFAULT_VALUES[f.key]) {
      data[f.key] = DEFAULT_VALUES[f.key];
    } else if (f.type === "select" && f.options?.length) {
      data[f.key] = f.options[0];
    } else if (f.type === "phone") {
      data[f.key] = "010-0000-0000";
    } else if (f.type === "date") {
      data[f.key] = "2000-01-01";
    } else if (f.type === "address") {
      data[f.key] = "(00000) 서울특별시 강남구";
    } else if (f.type === "composite" && f.subFields) {
      for (const sub of f.subFields) { data[sub.key] = sub.label; }
    } else if (f.type === "text") {
      data[f.key] = f.label;
    } else {
      data[f.key] = f.label || "";
    }
  }
  return data;
}

const FALLBACK_FIELDS: FormFieldConfig[] = [
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

function FormContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialCarrier = searchParams.get("carrier") || "";

  const [step, setStep] = useState(initialCarrier ? 3 : 1);
  const [tree, setTree] = useState<Carrier[]>([]);
  const [selectedMno, setSelectedMno] = useState("");
  const [selectedCarrier, setSelectedCarrier] = useState(initialCarrier);
  const [carrierPaymentType, setCarrierPaymentType] = useState<"postpaid" | "prepaid" | "both">("both");

  // 요금제
  const [paymentType, setPaymentType] = useState<"postpaid" | "prepaid">("postpaid");
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);

  // 신청서 정보 (동적 form_config 기반)
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formFields, setFormFields] = useState<FormFieldConfig[]>([]);

  const [submitted, setSubmitted] = useState(false);

  // 트리 로드
  useEffect(() => {
    fetchCarrierTree().then((data) => {
      setTree(data);
      // URL에서 carrier가 왔으면 대분류 자동 선택 + 요금제 탭으로
      if (initialCarrier) {
        const parent = data.find(m => m.children?.some(c => c.id === initialCarrier));
        if (parent) {
          setSelectedMno(parent.id);
          const mvno = parent.children?.find(c => c.id === initialCarrier);
          if (mvno) {
            const pt = mvno.payment_type || "both";
            setCarrierPaymentType(pt);
            setPaymentType(pt === "prepaid" ? "prepaid" : "postpaid");
          }
        }
      }
    }).catch(() => {});
  }, [initialCarrier]);

  const mvnoList = (tree.find(m => m.id === selectedMno)?.children || []).filter(c => c.is_active);

  // 요금제 로드 (통신사 변경 시)
  const loadPlans = useCallback(async (carrierId: string) => {
    if (!carrierId) return;
    setPlansLoading(true);
    try {
      const data = await fetchPlans(carrierId);
      setAllPlans(data);
    } catch {
      setAllPlans([]);
    } finally {
      setPlansLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCarrier) loadPlans(selectedCarrier);
    // form_config에서 전체 필드 로드
    const mvno = tree.flatMap(m => m.children || []).find(c => c.id === selectedCarrier);
    if (mvno?.form_config) {
      try {
        const parsed = JSON.parse(mvno.form_config);
        const fields: FormFieldConfig[] = Array.isArray(parsed) ? parsed : parsed.fields || [];
        // todayYear/Month/Day, 자동 필드는 입력 UI에서 제외
        const autoKeys = new Set(["todayYear", "todayMonth", "todayDay", "separator"]);
        const visible = fields.filter(f => !autoKeys.has(f.key));
        setFormFields(visible);
        // 필드 타입별 테스트 기본값
        setFormData(buildDefaultData(visible));
      } catch {
        setFormFields(FALLBACK_FIELDS);
        setFormData(buildDefaultData(FALLBACK_FIELDS));
      }
    } else {
      setFormFields(FALLBACK_FIELDS);
      setFormData(buildDefaultData(FALLBACK_FIELDS));
    }
  }, [selectedCarrier, loadPlans, tree]);

  // 정렬
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (key: string) => { if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("asc"); } };

  // 필터링 + 정렬된 요금제
  const filteredPlans = useMemo(() => {
    const filtered = allPlans.filter((p) => p.type === paymentType);
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey as keyof Plan]; const bv = b[sortKey as keyof Plan];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [allPlans, paymentType, sortKey, sortDir]);

  const canProceed = () => {
    switch (step) {
      case 1: return selectedMno !== "";
      case 2: return selectedCarrier !== "";
      case 3: return selectedPlan !== null;
      case 4: return formFields.filter(f => f.required && (!f.showWhen || (formData[f.showWhen.field] || "") === f.showWhen.value)).every(f => (formData[f.key] || "").trim() !== "");
      case 5: return true;
      default: return false;
    }
  };

  const handleNext = async () => {
    switch (step) {
      case 1: if (!selectedMno) { toast("통신망을 선택해주세요.", "error"); return; } break;
      case 2: if (!selectedCarrier) { toast("알뜰폰 통신사를 선택해주세요.", "error"); return; } break;
      case 3: if (!selectedPlan) { toast("요금제를 선택해주세요.", "error"); return; } break;
      case 4: {
        const missing = formFields.find(f => f.required && (!f.showWhen || (formData[f.showWhen.field] || "") === f.showWhen.value) && !(formData[f.key] || "").trim());
        if (missing) { toast(`${missing.label}을(를) 입력해주세요.`, "error"); return; }
        if (formData.birthDate && !isValidBirth(formData.birthDate.replace(/[^0-9]/g, ""))) { toast("생년월일 형식이 올바르지 않습니다. (YYYYMMDD)", "error"); return; }
        break;
      }
    }
    if (step === TOTAL_STEPS) {
      // DB에 신청서 저장
      try {
        await createApplication({
          carrierId: selectedCarrier,
          carrierName,
          planName: selectedPlan?.name || "",
          planMonthly: selectedPlan?.monthly || 0,
          paymentType,
          ...formData,
        });
        setSubmitted(true);
      } catch {
        toast("신청서 저장에 실패했습니다. 다시 시도해주세요.", "error");
      }
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => { if (step > 1) setStep(step - 1); };

  const mnoName = tree.find(m => m.id === selectedMno)?.title || "";
  const carrierName = mvnoList.find((c) => c.id === selectedCarrier)?.title || selectedCarrier;
  const stepLabels = ["통신망", "통신사", "요금제", "정보", "확인"];


  if (submitted) {
    return (
      <>
        <Header />
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={`${styles.formCard} fadeIn`}>
              <div className={styles.complete}>
                <div className={styles.completeIcon}>🖨️</div>
                <h2>신청서가 완성되었습니다!</h2>
                <p>아래 내용을 확인하고 출력하세요.</p>
                <div className={styles.completeInfo}>
                  <div className={styles.completeInfoRow}><span className={styles.completeInfoLabel}>통신사</span><span className={styles.completeInfoValue}>{carrierName}</span></div>
                  <div className={styles.completeInfoRow}><span className={styles.completeInfoLabel}>요금제</span><span className={styles.completeInfoValue}>{selectedPlan?.name}</span></div>
                  <div className={styles.completeInfoRow}><span className={styles.completeInfoLabel}>월 요금</span><span className={styles.completeInfoValue}>{selectedPlan ? formatPrice(selectedPlan.monthly) : ""}</span></div>
                  {formFields.filter(f => (formData[f.key] || "").trim()).map(f => (
                    <div key={f.key} className={styles.completeInfoRow}><span className={styles.completeInfoLabel}>{f.label}</span><span className={styles.completeInfoValue}>{formData[f.key]}</span></div>
                  ))}
                </div>
                <div className={styles.completeActions}>
                  <Link href="/" className={styles.btnHome}>홈으로</Link>
                  <button className={styles.btnPrint} onClick={async () => {
                    const mvnoData = tree.flatMap(m => m.children || []).find(c => c.id === selectedCarrier);
                    if (mvnoData?.form_template?.endsWith(".pdf")) {
                      // 클라이언트 사이드 PDF 채우기 (한글 폰트 지원)
                      let fieldPositions: { key: string; xPt?: number; yPt?: number; x?: number; y?: number; fontSize: number; page: number }[] = [];
                      if (mvnoData?.form_fields) {
                        try {
                          const parsed = JSON.parse(mvnoData.form_fields);
                          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.key) {
                            fieldPositions = parsed;
                          }
                        } catch {}
                      }
                      const API = process.env.NEXT_PUBLIC_API_URL || "https://api.hlmobile.kr";
                      const templateUrl = mvnoData.form_template.startsWith("http")
                        ? mvnoData.form_template
                        : `${API}${mvnoData.form_template}`;
                      try {
                        const excludedPages = parseJsonSafe<number[]>(mvnoData?.excluded_pages, []);
                        toast("PDF 생성 중...", "info");
                        // 사용자 항목 (form_config 기반) + 합성 필드 처리
                        const userValues: Record<string, string> = { ...formData };
                        // 주소+상세주소 합성
                        if (formData.address) userValues.address = `${formData.address} ${formData.addressDetail || ""}`.trim();
                        // composite 필드 합성
                        formFields.filter(f => f.type === "composite" && f.subFields).forEach(f => {
                          userValues[f.key] = f.subFields!.map(s => formData[s.key] || "").filter(Boolean).join(f.separator || "/");
                        });

                        await fillAndOpenPdf(templateUrl, fieldPositions, {
                          ...userValues,
                          // 요금제 항목
                          planName: selectedPlan?.name || "",
                          planMonthly: selectedPlan?.monthly != null ? formatPrice(selectedPlan.monthly) : "",
                          planBaseFee: selectedPlan?.base_fee != null ? formatPrice(selectedPlan.base_fee) : "",
                          planDiscount: selectedPlan?.discount != null ? formatPrice(selectedPlan.discount) : "",
                          planVoice: selectedPlan?.voice ?? "",
                          planSms: selectedPlan?.sms ?? "",
                          planData: selectedPlan?.data ?? "",
                          planQos: selectedPlan?.qos ?? "",
                          planType: paymentType === "postpaid" ? "후불" : "선불",
                          carrierName: carrierName,
                          // 커스텀 요금제 필드
                          ...(selectedPlan?.extra_fields ? (() => { try { return JSON.parse(selectedPlan.extra_fields!) as Record<string, string>; } catch { return {}; } })() : {}),
                        }, { excludedPages });
                        toast("PDF가 새 탭에서 열렸습니다.", "success");
                      } catch {
                        toast("PDF 생성 실패. 기본 인쇄로 전환합니다.", "error");
                        window.print();
                      }
                    } else {
                      window.print();
                    }
                  }}>🖨️ 신청서 출력하기</button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className={styles.page}>
        <div className={styles.container}>
          {/* Progress */}
          <div className={styles.progress}>
            {stepLabels.map((label, i) => (
              <div key={label} className={styles.progressStep}>
                <div className={`${styles.progressDot} ${i + 1 === step ? styles.progressDotActive : ""} ${i + 1 < step ? styles.progressDotDone : ""}`}>
                  {i + 1 < step ? "✓" : i + 1}
                </div>
                <span className={`${styles.progressLabel} ${i + 1 === step ? styles.progressLabelActive : ""}`}>{label}</span>
                {i < stepLabels.length - 1 && <div className={`${styles.progressLine} ${i + 1 < step ? styles.progressLineDone : ""}`} />}
              </div>
            ))}
          </div>

          <div className={`${styles.formCard} fadeIn`}>
            {/* Step 1: 대분류(통신망) 선택 */}
            {step === 1 && (
              <>
                <h2 className={styles.formTitle}>통신망을 선택하세요</h2>
                <p className={styles.formDesc}>어떤 통신망의 알뜰폰 신청서가 필요한가요?</p>
                <div className={styles.carrierGrid} style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  {tree.length === 0
                    ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 110, borderRadius: 14 }} />)
                    : tree.map((mno, i) => (
                    <div
                      key={mno.id}
                      className={`${styles.carrierCard} ${selectedMno === mno.id ? styles.carrierCardActive : ""} fadeIn`}
                      onClick={() => { setSelectedMno(mno.id); setSelectedCarrier(""); setSelectedPlan(null); setAllPlans([]); }}
                      style={{ minHeight: 110, animationDelay: `${i * 0.08}s` }}
                    >
                      <div className={styles.carrierCardIcon} style={{ fontSize: 32 }}>
                        {mno.icon.startsWith("http") || mno.icon.startsWith("/") ? (
                          <img src={mno.icon} alt={mno.title} style={{ width: 32, height: 32, objectFit: "contain" }} />
                        ) : mno.icon}
                      </div>
                      <div className={styles.carrierCardTitle} style={{ fontSize: 16 }}>{mno.title}</div>
                      <div className={styles.carrierCardDesc}>알뜰폰 {mno.children?.length || 0}개</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Step 2: 알뜰폰(MVNO) 선택 */}
            {step === 2 && (
              <>
                <h2 className={styles.formTitle}>{mnoName} 알뜰폰을 선택하세요</h2>
                <p className={styles.formDesc}>{mnoName} 망을 사용하는 알뜰폰 통신사를 선택해주세요.</p>
                <div className={styles.carrierGrid}>
                  {mvnoList.map((c, i) => {
                    const hasLink = c.forms?.startsWith("http");
                    return hasLink ? (
                      <a
                        key={c.id}
                        href={c.forms}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${styles.carrierCard} fadeIn`}
                        style={{ animationDelay: `${i * 0.05}s`, textDecoration: "none", color: "inherit" }}
                      >
                        <div className={styles.carrierCardIcon} style={{ width: "100%", height: 48, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                          {c.icon.startsWith("http") || c.icon.startsWith("/") ? (
                            <img src={c.icon} alt={c.title} style={{ maxWidth: "80%", maxHeight: 44, objectFit: "contain" }} />
                          ) : <span style={{ fontSize: 32 }}>{c.icon}</span>}
                        </div>
                        <div className={styles.carrierCardTitle}>{c.title}</div>
                      </a>
                    ) : (
                      <div
                        key={c.id}
                        className={`${styles.carrierCard} ${selectedCarrier === c.id ? styles.carrierCardActive : ""} fadeIn`}
                        onClick={() => {
                          setSelectedCarrier(c.id); setSelectedPlan(null); setAllPlans([]);
                          const pt = c.payment_type || "both";
                          setCarrierPaymentType(pt);
                          setPaymentType(pt === "prepaid" ? "prepaid" : "postpaid");
                        }}
                        style={{ animationDelay: `${i * 0.05}s` }}
                      >
                        <div className={styles.carrierCardIcon} style={{ width: "100%", height: 48, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                          {c.icon.startsWith("http") || c.icon.startsWith("/") ? (
                            <img src={c.icon} alt={c.title} style={{ maxWidth: "80%", maxHeight: 44, objectFit: "contain" }} />
                          ) : <span style={{ fontSize: 32 }}>{c.icon}</span>}
                        </div>
                        <div className={styles.carrierCardTitle}>{c.title}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Step 3: 신청 유형 + 요금제 */}
            {step === 3 && (
              <>
                <h2 className={styles.formTitle}>요금제를 선택하세요</h2>
                <p className={styles.formDesc}>{carrierName} 요금제를 선택해주세요.</p>

                <div className={styles.planSection}>

                  {/* 후불/선불 토글 — payment_type에 따라 표시 */}
                  {carrierPaymentType === "both" ? (
                    <div className={styles.paymentToggle}>
                      <button className={`${styles.toggleBtn} ${paymentType === "postpaid" ? styles.toggleBtnActive : ""}`} onClick={() => { setPaymentType("postpaid"); setSelectedPlan(null); }}>후불</button>
                      <button className={`${styles.toggleBtn} ${paymentType === "prepaid" ? styles.toggleBtnActive : ""}`} onClick={() => { setPaymentType("prepaid"); setSelectedPlan(null); }}>선불</button>
                    </div>
                  ) : (
                    <div style={{ marginBottom: 16, padding: "10px 16px", background: "var(--brand-light)", borderRadius: 10, fontSize: 14, fontWeight: 600, color: "var(--brand)" }}>
                      {carrierPaymentType === "postpaid" ? "후불제" : "선불제"} 요금제
                    </div>
                  )}

                  {selectedPlan && (
                    <div className={styles.selectedPlan}>
                      <div>
                        <div className={styles.selectedPlanLabel}>선택된 요금제</div>
                        <div className={styles.selectedPlanName}>{selectedPlan.name}</div>
                      </div>
                      <div className={styles.selectedPlanPrice}>{formatPrice(selectedPlan.monthly)}/월</div>
                      <span className={styles.selectedPlanRemove} onClick={() => setSelectedPlan(null)}>✕</span>
                    </div>
                  )}

                  {/* Desktop Table */}
                  <div className={styles.planTableWrapper}>
                    {plansLoading ? (
                      <div className={styles.noPlans}>요금제를 불러오는 중...</div>
                    ) : filteredPlans.length > 0 ? (
                      <table className={styles.planTable}>
                        <thead>
                          <tr>
                            <th style={{ cursor: "pointer" }} onClick={() => toggleSort("name")}>요금제명 {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : "⇅"}</th>
                            <th style={{ cursor: "pointer" }} onClick={() => toggleSort("monthly")}>월납부금액 {sortKey === "monthly" ? (sortDir === "asc" ? "↑" : "↓") : "⇅"}</th>
                            <th style={{ cursor: "pointer" }} onClick={() => toggleSort("base_fee")}>기본료 {sortKey === "base_fee" ? (sortDir === "asc" ? "↑" : "↓") : "⇅"}</th>
                            <th style={{ cursor: "pointer" }} onClick={() => toggleSort("discount")}>프로모션할인 {sortKey === "discount" ? (sortDir === "asc" ? "↑" : "↓") : "⇅"}</th>
                            <th>음성</th>
                            <th>문자</th>
                            <th>데이터</th>
                            <th>QOS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPlans.map((plan) => (
                            <tr key={plan.id} className={selectedPlan?.id === plan.id ? styles.planRowActive : ""} onClick={() => setSelectedPlan(plan)}>
                              <td><span className={styles.planName}>{plan.name}</span></td>
                              <td>{formatPrice(plan.monthly)}</td>
                              <td>{formatPrice(plan.base_fee)}</td>
                              <td><span className={styles.planDiscount}>{formatPrice(plan.discount)}</span></td>
                              <td>{plan.voice}</td>
                              <td>{plan.sms}</td>
                              <td>{plan.data}</td>
                              <td>{plan.qos}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className={styles.noPlans}>해당 조건의 요금제가 없습니다. 통신사 또는 결제 유형을 변경해주세요.</div>
                    )}
                  </div>

                  {/* Mobile Cards */}
                  <div className={styles.planCardList}>
                    {plansLoading ? (
                      <div className={styles.noPlans}>요금제를 불러오는 중...</div>
                    ) : filteredPlans.length > 0 ? filteredPlans.map((plan) => (
                      <div key={plan.id} className={`${styles.planCard} ${selectedPlan?.id === plan.id ? styles.planCardActive : ""}`} onClick={() => setSelectedPlan(plan)}>
                        <div className={styles.planCardName}>{plan.name}</div>
                        <div className={styles.planCardGrid}>
                          <div className={styles.planCardItem}>
                            <span className={styles.planCardItemLabel}>월 요금</span>
                            <span className={`${styles.planCardItemValue} ${styles.planCardPrice}`}>{formatPrice(plan.monthly)}</span>
                          </div>
                          <div className={styles.planCardItem}>
                            <span className={styles.planCardItemLabel}>할인</span>
                            <span className={`${styles.planCardItemValue} ${styles.planCardDiscount}`}>{formatPrice(plan.discount)}</span>
                          </div>
                          <div className={styles.planCardItem}>
                            <span className={styles.planCardItemLabel}>데이터</span>
                            <span className={styles.planCardItemValue}>{plan.data}</span>
                          </div>
                          <div className={styles.planCardItem}>
                            <span className={styles.planCardItemLabel}>음성</span>
                            <span className={styles.planCardItemValue}>{plan.voice}</span>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className={styles.noPlans}>해당 조건의 요금제가 없습니다.</div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Step 4: 신청서 정보 입력 (form_config 기반 동적 렌더링) */}
            {step === 4 && (
              <>
                <h2 className={styles.formTitle}>신청서 정보를 입력하세요</h2>
                <p className={styles.formDesc}>신청서에 기재될 정보를 입력해주세요.</p>

                <div className={styles.fieldRow} style={{ flexWrap: "wrap" }}>
                  {formFields.map(f => {
                    // 조건부 표시
                    if (f.showWhen && (formData[f.showWhen.field] || "") !== f.showWhen.value) return null;

                    const val = formData[f.key] || "";
                    const set = (v: string) => setFormData(prev => ({ ...prev, [f.key]: v }));

                    // 합성 필드
                    if (f.type === "composite" && f.subFields) {
                      return (
                        <div key={f.key} className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>{f.label}{f.required && <span className={styles.fieldRequired}>*</span>}</label>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {f.subFields.map((sub, i) => (
                              <span key={sub.key} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                                {i > 0 && <span style={{ color: "var(--text-3)", fontWeight: 700 }}>{f.separator || "/"}</span>}
                                <input type="text" className={styles.input} placeholder={sub.label}
                                  value={formData[sub.key] || ""}
                                  onChange={e => setFormData(prev => ({ ...prev, [sub.key]: e.target.value }))}
                                  style={{ flex: 1 }} />
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    // 셀렉트
                    if (f.type === "select" && f.options) {
                      return (
                        <div key={f.key} className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>{f.label}{f.required && <span className={styles.fieldRequired}>*</span>}</label>
                          <select className={styles.select} value={val} onChange={e => set(e.target.value)}>
                            <option value="">선택하세요</option>
                            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      );
                    }

                    // 주소 (다음 우편번호 API)
                    if (f.type === "address") {
                      return (
                        <div key={f.key} className={styles.fieldGroup} style={{ flex: "1 1 100%" }}>
                          <label className={styles.fieldLabel}>{f.label}{f.required && <span className={styles.fieldRequired}>*</span>}</label>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input type="text" className={styles.input} placeholder="주소 검색을 눌러주세요" value={val} readOnly
                              style={{ flex: 1, cursor: "pointer", background: "#F8FAFC" }}
                              onClick={() => {
                                if (typeof window === "undefined") return;
                                const script = document.getElementById("daum-postcode");
                                const run = () => {
                                  new (window as unknown as Record<string, unknown> & { daum: { Postcode: new (opts: Record<string, unknown>) => { open: () => void } } }).daum.Postcode({
                                    oncomplete: (data: { address: string; zonecode: string }) => {
                                      setFormData(prev => ({ ...prev, [f.key]: `(${data.zonecode}) ${data.address}` }));
                                    },
                                  }).open();
                                };
                                if (script) { run(); } else {
                                  const s = document.createElement("script");
                                  s.id = "daum-postcode";
                                  s.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
                                  s.onload = run;
                                  document.head.appendChild(s);
                                }
                              }} />
                            <button type="button" onClick={() => {
                              const el = document.querySelector<HTMLInputElement>(`input[placeholder="주소 검색을 눌러주세요"]`);
                              el?.click();
                            }} style={{ padding: "0 20px", background: "var(--brand)", color: "white", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                              주소 검색
                            </button>
                          </div>
                        </div>
                      );
                    }

                    // 전화번호
                    if (f.type === "phone") {
                      return (
                        <div key={f.key} className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>{f.label}{f.required && <span className={styles.fieldRequired}>*</span>}</label>
                          <input type="tel" className={styles.input} placeholder={f.placeholder || "010-0000-0000"} value={val} onChange={e => set(formatPhone(e.target.value))} />
                        </div>
                      );
                    }

                    // 날짜 (생년월일 등)
                    if (f.type === "date") {
                      return (
                        <div key={f.key} className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>{f.label}{f.required && <span className={styles.fieldRequired}>*</span>}</label>
                          <input type="text" className={styles.input} placeholder={f.placeholder || "YYYYMMDD"} value={val} onChange={e => set(formatBirth(e.target.value))} />
                        </div>
                      );
                    }

                    // 기본 텍스트
                    return (
                      <div key={f.key} className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>{f.label}{f.required && <span className={styles.fieldRequired}>*</span>}</label>
                        <input type="text" className={styles.input} placeholder={f.placeholder || f.label} value={val} onChange={e => set(e.target.value)} />
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Step 5: 확인 */}
            {step === 5 && (
              <>
                <h2 className={styles.formTitle}>신청서 내용을 확인하세요</h2>
                <p className={styles.formDesc}>아래 내용이 맞는지 확인 후 출력 버튼을 눌러주세요.</p>
                <div className={styles.completeInfo}>
                  <div className={styles.completeInfoRow}><span className={styles.completeInfoLabel}>통신망</span><span className={styles.completeInfoValue}>{mnoName}</span></div>
                  <div className={styles.completeInfoRow}><span className={styles.completeInfoLabel}>통신사</span><span className={styles.completeInfoValue}>{carrierName}</span></div>
                  <div className={styles.completeInfoRow}><span className={styles.completeInfoLabel}>결제 방식</span><span className={styles.completeInfoValue}>{paymentType === "postpaid" ? "후불" : "선불"}</span></div>
                  <div className={styles.completeInfoRow}><span className={styles.completeInfoLabel}>요금제</span><span className={styles.completeInfoValue}>{selectedPlan?.name}</span></div>
                  <div className={styles.completeInfoRow}><span className={styles.completeInfoLabel}>월 요금</span><span className={styles.completeInfoValue}>{selectedPlan ? formatPrice(selectedPlan.monthly) : ""}</span></div>
                  {formFields.filter(f => (formData[f.key] || "").trim()).map(f => (
                    <div key={f.key} className={styles.completeInfoRow}><span className={styles.completeInfoLabel}>{f.label}</span><span className={styles.completeInfoValue}>{formData[f.key]}</span></div>
                  ))}
                </div>
              </>
            )}

            {/* Actions */}
            <div className={styles.actions}>
              {step > 1 && <button className={styles.btnBack} onClick={handleBack}>이전</button>}
              {step < TOTAL_STEPS ? (
                <button className={`${styles.btnNext} ${!canProceed() ? styles.btnNextDisabled : ""}`} onClick={handleNext}>다음</button>
              ) : (
                <button className={styles.btnSubmit} onClick={handleNext}>🖨️ 신청서 완성 및 출력</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function FormPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>불러오는 중...</div>}>
      <FormContent />
    </Suspense>
  );
}
