export const DEFAULT_PLAN_FIELDS: { key: string; label: string }[] = [
  { key: "planName", label: "요금제명" },
  { key: "planMonthly", label: "월납부금액" },
  { key: "planBaseFee", label: "기본료" },
  { key: "planDiscount", label: "프로모션할인" },
  { key: "planVoice", label: "음성" },
  { key: "planSms", label: "문자" },
  { key: "planData", label: "데이터" },
  { key: "planQos", label: "QOS" },
  { key: "planType", label: "후불/선불" },
  { key: "carrierName", label: "통신사명" },
];

export const DEFAULT_PLAN_KEYS = new Set(DEFAULT_PLAN_FIELDS.map(f => f.key));
