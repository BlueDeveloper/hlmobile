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

export type PdfProgressStep =
  | "preparing"
  | "downloading-pdf"
  | "downloading-font"
  | "rendering"
  | "saving"
  | "done";

interface FillOptions {
  excludedPages?: number[];
  onProgress?: (step: PdfProgressStep, percent: number) => void;
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
  const onProgress = options?.onProgress;

  onProgress?.("preparing", 5);

  // 누락된 요금제 필드 보충
  const enrichedValues = await enrichPlanValues(values, positions, templateUrl);

  // 1. 원본 PDF 가져오기 (스트림으로 진행률 측정)
  onProgress?.("downloading-pdf", 10);
  const pdfBytes = await fetchWithProgress(templateUrl, (loaded, total) => {
    const pct = total > 0 ? 10 + Math.floor((loaded / total) * 30) : 10;
    onProgress?.("downloading-pdf", pct);
  });

  // 2. 한글 폰트 로드 (캐시 사용)
  if (!cachedFontBytes) {
    onProgress?.("downloading-font", 40);
    cachedFontBytes = await fetchWithProgress(NOTO_SANS_KR_URL, (loaded, total) => {
      const pct = total > 0 ? 40 + Math.floor((loaded / total) * 30) : 40;
      onProgress?.("downloading-font", pct);
    });
  }

  // 3. PDF 복사 + 텍스트 오버레이
  onProgress?.("rendering", 70);
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

  onProgress?.("saving", 95);
  const filledBytes = await pdfDoc.save();
  onProgress?.("done", 100);
  return new Blob([new Uint8Array(filledBytes)], { type: "application/pdf" });
}

async function fetchWithProgress(
  url: string,
  onChunk: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패: ${url}`);
  const total = Number(res.headers.get("content-length") || 0);
  if (!res.body || total === 0) return res.arrayBuffer();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onChunk(loaded, total);
  }
  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }
  return merged.buffer;
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

export function progressLabel(step: PdfProgressStep): string {
  switch (step) {
    case "preparing": return "준비 중...";
    case "downloading-pdf": return "신청서 양식을 다운로드 중...";
    case "downloading-font": return "한글 폰트를 다운로드 중...";
    case "rendering": return "신청서를 만드는 중...";
    case "saving": return "PDF 파일을 저장하는 중...";
    case "done": return "완료!";
  }
}
