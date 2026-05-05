import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Env, json } from "./auth";

// copyPages 방식: 원본 PDF 페이지를 새 문서에 복사 후 텍스트 오버레이
// 이 방식은 원본 페이지의 content stream과 리소스를 그대로 보존

export async function handlePdfFill(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body: { carrierId: string; values: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
  }

  const { carrierId, values } = body;
  if (!carrierId) return json({ ok: false, error: "carrierId 필수" }, 400);
  if (!values || typeof values !== "object") return json({ ok: false, error: "values 필수" }, 400);

  const carrier = await env.DB.prepare("SELECT form_template, form_fields, excluded_pages FROM carriers WHERE id = ?").bind(carrierId).first<{ form_template: string; form_fields: string; excluded_pages: string | null }>();
  if (!carrier?.form_template) return json({ ok: false, error: "양식이 등록되지 않았습니다" }, 404);

  let positions: { key: string; xPt?: number; yPt?: number; x?: number; y?: number; fontSize: number; page: number }[] = [];
  try {
    const parsed = JSON.parse(carrier.form_fields);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.key) {
      positions = parsed;
    }
  } catch {}

  if (positions.length === 0) return json({ ok: false, error: "좌표 데이터가 없습니다" }, 400);

  // 제외 페이지 파싱
  let excludedPages: number[] = [];
  try { if (carrier.excluded_pages) excludedPages = JSON.parse(carrier.excluded_pages); } catch {}

  const pdfKey = carrier.form_template.replace(/^https?:\/\/[^/]+\/r2\//, "");
  const pdfObj = await env.R2.get(pdfKey);
  if (!pdfObj) return json({ ok: false, error: "PDF 파일을 찾을 수 없습니다" }, 404);
  const pdfBytes = await pdfObj.arrayBuffer();

  // 원본 PDF 로드
  const srcDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  // 새 PDF 생성 + copyPages로 원본 페이지 복사 (구조 보존)
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 제외 페이지를 뺀 인덱스만 복사
  const allIndices = srcDoc.getPageIndices();
  const includedIndices = allIndices.filter(i => !excludedPages.includes(i + 1));
  const copiedPages = await pdfDoc.copyPages(srcDoc, includedIndices);

  for (let ci = 0; ci < copiedPages.length; ci++) {
    const originalPageNum = includedIndices[ci] + 1; // 1-based
    const page = pdfDoc.addPage(copiedPages[ci]);
    const { width, height } = page.getSize();

    // 이 페이지의 좌표에 텍스트 그리기
    for (const pos of positions) {
      if ((pos.page || 1) !== originalPageNum) continue;

      const value = values[pos.key] || "";
      if (!value) continue;

      let x: number, y: number;
      if (pos.xPt !== undefined && pos.yPt !== undefined) {
        x = pos.xPt;
        y = pos.yPt;
      } else {
        x = ((pos.x || 0) / 100) * width;
        y = height - ((pos.y || 0) / 100) * height;
      }

      try {
        page.drawText(value, {
          x,
          y,
          size: pos.fontSize || 10,
          font,
          color: rgb(0, 0, 0),
        });
      } catch {
        // Helvetica는 한글 인코딩 불가 — 무시하고 계속
      }
    }
  }

  const filledBytes = await pdfDoc.save();

  return new Response(filledBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=filled_form.pdf",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
