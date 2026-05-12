"use client";

import { progressLabel, type PdfProgressStep } from "@/lib/pdfClient";

interface Props {
  step: PdfProgressStep;
  percent: number;
}

export default function PdfProgressModal({ step, percent }: Props) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999, padding: 20,
      }}
    >
      <div
        style={{
          background: "white", borderRadius: 16, padding: "28px 24px",
          width: "100%", maxWidth: 340, boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
          신청서를 만들고 있습니다
        </div>
        <div style={{ fontSize: 13, color: "#64748B", marginBottom: 18, minHeight: 18 }}>
          {progressLabel(step)}
        </div>
        <div
          style={{
            width: "100%", height: 8, background: "#E2E8F0",
            borderRadius: 99, overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, percent))}%`,
              height: "100%", background: "var(--brand, #2563EB)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 10 }}>
          {percent}%
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 14, lineHeight: 1.5 }}>
          처음에는 시간이 좀 걸릴 수 있어요.<br />
          창을 닫지 말고 잠시만 기다려주세요.
        </div>
      </div>
    </div>
  );
}
