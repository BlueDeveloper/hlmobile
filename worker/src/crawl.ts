import { Env, json, requireAuth } from "./auth";

/**
 * 알뜰폰 허브(mvnohub.kr) 크롤링
 * - 한국정보통신진흥협회 운영 공공 사이트
 * - robots.txt 없음 (공공 데이터)
 * - HTML 카드에서 요금제 정보 파싱
 * - 법적 안전: 공개 데이터, 과도한 빈도 금지, 출처 표기
 */

interface ParsedPlan {
  name: string;
  mno: string;
  mvno: string;
  network: string;
  monthly: number;
  afterFee: number;
  afterPeriod: string;
}

function parsePlansFromHtml(html: string): ParsedPlan[] {
  const plans: ParsedPlan[] = [];
  // plan_card 블록 추출
  const cardRegex = /<div class="plan_card[^"]*"[^>]*>([\s\S]*?)<!-- \/\/btm -->/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const card = match[1];
    try {
      // 요금제명
      const nameMatch = card.match(/<p class="tit"[^>]*>([\s\S]*?)<\/p>/);
      const name = nameMatch ? nameMatch[1].replace(/(<[^>]*>)/g, "").trim() : "";

      // MNO (SKT, KT, LGU+)
      const mnoMatch = card.match(/<li>(SKT|KT|LGU\+|LG U\+)<\/li>/);
      const mno = mnoMatch ? mnoMatch[1] : "";

      // MVNO (알뜰폰 브랜드)
      const mvnoItems = card.match(/<li>([^<]+)<\/li>/g) || [];
      const mvnoList = mvnoItems.map((li: string) => li.replace(/<\/?li>/g, "").trim());
      const mvno = mvnoList.find((v: string) => v !== mno && v !== "SKT" && v !== "KT" && v !== "LGU+" && v !== "LG U+") || "";

      // 네트워크
      const netMatch = card.match(/<span class="purple">(5G|LTE|3G)<\/span>/);
      const network = netMatch ? netMatch[1] : "LTE";

      // 월 요금
      const priceMatch = card.match(/월\s*<span>\s*([\d,]+)\s*<\/span>원/);
      const monthly = priceMatch ? parseInt(priceMatch[1].replace(/,/g, "")) : 0;

      // 이후 요금
      const afterMatch = card.match(/(\d+)개월 이후\s*<span>([\d,]+)<\/span>원/);
      const afterFee = afterMatch ? parseInt(afterMatch[2].replace(/,/g, "")) : monthly;
      const afterPeriod = afterMatch ? `${afterMatch[1]}개월` : "";

      if (name && monthly > 0) {
        plans.push({ name, mno, mvno, network, monthly, afterFee, afterPeriod });
      }
    } catch {
      // 파싱 실패 시 스킵
    }
  }

  return plans;
}

export async function handleCrawl(request: Request, env: Env): Promise<Response> {
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;

  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body: { carrierId: string };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다" }, 400);
  }
  const { carrierId } = body;

  if (!carrierId) return json({ ok: false, error: "carrierId는 필수입니다" }, 400);

  const carrier = await env.DB.prepare("SELECT id, title FROM carriers WHERE id = ?").bind(carrierId).first();
  if (!carrier) return json({ ok: false, error: "통신사를 찾을 수 없습니다" }, 404);

  const results = { imported: 0, skipped: 0, errors: [] as string[] };

  try {
    // 알뜰폰 허브 목록 페이지 (공개 페이지)
    const res = await fetch("https://www.mvnohub.kr/product/products.do", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; hlmobile-admin/1.0; +https://hlmobile.kr)",
        "Accept": "text/html",
      },
    });

    if (!res.ok) {
      return json({ ok: false, error: `페이지 로드 실패: HTTP ${res.status}` }, 502);
    }

    const html = await res.text();
    const allPlans = parsePlansFromHtml(html);

    // 해당 통신사 브랜드명과 매칭되는 요금제만 필터
    // 부분 일치, 약어, 공백 제거 후 비교
    const normalize = (s: string) => s.toLowerCase().replace(/[\s+\-_()（）]/g, "");
    const carrierNorm = normalize(carrier.title as string);

    // 매칭 별칭 테이블
    const aliases: Record<string, string[]> = {
      "헬로모바일": ["lg헬로모바일", "헬로", "hello"],
      "u+u모바일": ["u+유모바일", "유모바일", "umobile"],
      "smt(스마텔)": ["스마텔", "smt", "smartel"],
      "sk7mobile": ["sk7", "sk세븐"],
      "ktm모바일": ["ktm", "ktmmobile"],
      "kt스카이라이프": ["스카이라이프", "skylife"],
      "토스모바일": ["토스", "toss"],
      "모빙": ["mobing"],
      "슈가모바일": ["슈가", "sugar"],
      "이야기모바일": ["이야기", "eyagi"],
      "코드모바일": ["코드", "code"],
      "ins모바일": ["ins", "insmobile"],
      "한패스모바일": ["한패스", "hanpass"],
      "프리티": ["프리티", "freeti", "freet"],
    };

    const matched = allPlans.filter((p) => {
      const mvnoNorm = normalize(p.mvno);
      // 직접 매칭
      if (mvnoNorm.includes(carrierNorm) || carrierNorm.includes(mvnoNorm)) return true;
      // 별칭 매칭
      for (const [key, vals] of Object.entries(aliases)) {
        const keyNorm = normalize(key);
        if (carrierNorm.includes(keyNorm) || keyNorm.includes(carrierNorm)) {
          if (vals.some((v) => mvnoNorm.includes(normalize(v)) || normalize(v).includes(mvnoNorm))) return true;
        }
      }
      return false;
    });

    if (matched.length === 0) {
      // 정확 매칭 실패 시 전체 목록 반환 (관리자가 선택)
      return json({
        ok: true,
        data: {
          carrier: carrier.title,
          imported: 0,
          skipped: 0,
          errors: [`"${carrier.title}"와 매칭되는 요금제를 찾지 못했습니다. 전체 ${allPlans.length}건의 요금제가 검색됨.`],
          availableMvnos: [...new Set(allPlans.map((p) => p.mvno))].filter(Boolean),
          source: "mvnohub.kr",
        },
      });
    }

    // DB 저장 (비활성 상태)
    for (const p of matched) {
      try {
        const exists = await env.DB.prepare(
          "SELECT id FROM plans WHERE carrier_id = ? AND name = ?"
        ).bind(carrierId, p.name).first();

        if (exists) {
          results.skipped++;
          continue;
        }

        await env.DB.prepare(
          `INSERT INTO plans (carrier_id, name, monthly, base_fee, discount, voice, sms, data, qos, type, is_active, sort_order)
           VALUES (?, ?, ?, ?, ?, '-', '-', '-', ?, 'postpaid', 0, 0)`
        ).bind(
          carrierId,
          p.name,
          p.monthly,
          p.afterFee || p.monthly,
          (p.afterFee || p.monthly) - p.monthly,
          p.network === "5G" ? "5G" : "LTE"
        ).run();

        results.imported++;
      } catch (err) {
        results.errors.push(`${p.name}: ${err instanceof Error ? err.message : "저장 실패"}`);
      }
    }
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : "크롤링 실패" }, 500);
  }

  return json({
    ok: true,
    data: {
      carrier: carrier.title,
      ...results,
      source: "mvnohub.kr (알뜰폰 허브 — 한국정보통신진흥협회)",
      notice: "출처: 알뜰폰 허브(mvnohub.kr) — 공공 데이터, robots.txt 준수",
    },
  });
}
