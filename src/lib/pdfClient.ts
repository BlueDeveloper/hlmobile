import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const NOTO_SANS_KR_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf";

let cachedFontBytes: ArrayBuffer | null = null;

interface FieldPosition {
  key: string;
  xPt?: number;
  yPt?: number;
  x?: number;
  y?: number;
  fontSize: number;
  page: number;
  compositeKeys?: string[];
  compositeSeparator?: string;
  checkValue?: string;
}

interface FillOptions {
  excludedPages?: number[];
}

const PLAN_FIELD_MAP: Record<string, string> = {
  planBaseFee: "base_fee",
  planDiscount: "discount",
  planVoice: "voice",
  planSms: "sms",
  planData: "data",
  planQos: "qos",
};

function formatPrice(n: number | null | undefined): string {
  if (n == null) return "0원";
  return n.toLocaleString() + "원";
}

/**
 * positions에 요금제 필드가 있는데 values에 없으면 API에서 plan을 가져와 보충
 */
async function enrichPlanValues(
  values: Record<string, string>,
  positions: FieldPosition[],
  templateUrl: string
): Promise<Record<string, string>> {
  const posKeys = new Set(positions.map(p => p.key));
  const missingPlanKeys = Object.keys(PLAN_FIELD_MAP).filter(
    k => posKeys.has(k) && !values[k]
  );

  if (missingPlanKeys.length === 0) return values;

  // planName으로 plan 데이터 조회
  const planName = values.planName;
  if (!planName) return values;

  try {
    // templateUrl에서 API base 추출
    const url = new URL(templateUrl);
    const apiBase = `${url.protocol}//${url.host}`;
    const res = await fetch(`${apiBase}/api/plans`);
    if (!res.ok) return values;
    const json = await res.json() as { data?: { name: string; base_fee: number; discount: number; voice: string; sms: string; data: string; qos: string }[] };
    const plans = json.data || [];
    const plan = plans.find(p => p.name === planName);
    if (!plan) return values;

    const enriched = { ...values };
    for (const key of missingPlanKeys) {
      const dbField = PLAN_FIELD_MAP[key];
      const raw = plan[dbField as keyof typeof plan];
      if (raw == null) continue;
      enriched[key] = typeof raw === "number" ? formatPrice(raw) : String(raw);
    }
    console.log("[PDF] plan values enriched from API:", missingPlanKeys.join(", "));
    return enriched;
  } catch (e) {
    console.warn("[PDF] failed to enrich plan values:", e);
    return values;
  }
}

export async function fillPdfClient(
  templateUrl: string,
  positions: FieldPosition[],
  values: Record<string, string>,
  options?: FillOptions
): Promise<Blob> {
  const excludedPages = options?.excludedPages || [];

  // 누락된 요금제 필드 보충
  const enrichedValues = await enrichPlanValues(values, positions, templateUrl);

  // 1. 원본 PDF 가져오기
  const pdfRes = await fetch(templateUrl);
  if (!pdfRes.ok) throw new Error("PDF 파일을 가져올 수 없습니다");
  const pdfBytes = await pdfRes.arrayBuffer();

  // 2. 한글 폰트 로드 (캐시 사용)
  if (!cachedFontBytes) {
    const fontRes = await fetch(NOTO_SANS_KR_URL);
    if (fontRes.ok) {
      cachedFontBytes = await fontRes.arrayBuffer();
    }
  }

  // 3. PDF 복사 + 텍스트 오버레이
  const srcDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const pdfDoc = await PDFDocument.create();

  // fontkit 등록 + 한글 폰트 임베딩
  let font;
  if (cachedFontBytes) {
    pdfDoc.registerFontkit(fontkit);
    font = await pdfDoc.embedFont(cachedFontBytes);
  } else {
    const { StandardFonts } = await import("pdf-lib");
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  // copyPages로 원본 페이지 구조 보존 (제외 페이지 건너뛰기)
  const allIndices = srcDoc.getPageIndices();
  const includedIndices = allIndices.filter(i => !excludedPages.includes(i + 1));
  const copiedPages = await pdfDoc.copyPages(srcDoc, includedIndices);

  for (let ci = 0; ci < copiedPages.length; ci++) {
    const originalPageNum = includedIndices[ci] + 1;
    const page = pdfDoc.addPage(copiedPages[ci]);
    const { width, height } = page.getSize();

    for (const pos of positions) {
      if ((pos.page || 1) !== originalPageNum) continue;

      // 체크 필드: 선택된 값과 일치할 때만 ● 출력
      if (pos.checkValue) {
        const fieldValue = enrichedValues[pos.key] || "";
        if (fieldValue !== pos.checkValue) continue;
        let x: number, y: number;
        if (pos.xPt !== undefined && pos.yPt !== undefined) { x = pos.xPt; y = pos.yPt; }
        else { x = ((pos.x || 0) / 100) * width; y = height - ((pos.y || 0) / 100) * height; }
        page.drawText("✓", { x, y, size: (pos.fontSize || 8) + 4, font, color: rgb(0, 0, 0) });
        continue;
      }

      let value = "";
      // 합성 필드: 여러 값을 구분자로 합침
      if (pos.compositeKeys && pos.compositeKeys.length > 0) {
        value = pos.compositeKeys.map(k => enrichedValues[k] || "").filter(Boolean).join(pos.compositeSeparator || "/");
      } else {
        value = enrichedValues[pos.key] || "";
      }
      // 자동 채움 (날짜, 구분값)
      if (!value) {
        const now = new Date();
        if (pos.key === "todayYear") value = String(now.getFullYear());
        else if (pos.key === "todayMonth") value = String(now.getMonth() + 1).padStart(2, "0");
        else if (pos.key === "todayDay") value = String(now.getDate()).padStart(2, "0");
        else if (pos.key === "separator") value = "/";
      }
      if (!value) continue;

      let x: number, y: number;
      if (pos.xPt !== undefined && pos.yPt !== undefined) {
        x = pos.xPt;
        y = pos.yPt;
      } else {
        x = ((pos.x || 0) / 100) * width;
        y = height - ((pos.y || 0) / 100) * height;
      }

      page.drawText(value, {
        x,
        y,
        size: pos.fontSize || 10,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }

  const filledBytes = await pdfDoc.save();
  return new Blob([new Uint8Array(filledBytes)], { type: "application/pdf" });
}

export async function fillAndOpenPdf(
  templateUrl: string,
  positions: FieldPosition[],
  values: Record<string, string>,
  options?: FillOptions
): Promise<void> {
  const blob = await fillPdfClient(templateUrl, positions, values, options);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
